"use strict";

class Tab {
  container = new DataContainer('tabsData', {
    allowNextTabCreation: null,
    openedFromPopupTabs: {},
    tabOpenInitiators: {},
    transitions: {}
  });
  async onUpdated(tabId, {
    url
  }) {
    if (!url) {
      return;
    }
    const existingPageData = await pageDataComponent.getData(tabId);
    if (existingPageData?.pageUrl === url) {
      await pageDataComponent.refreshBulk([tabId]);
      return;
    }
    const [pageData, tabData] = await Promise.all([pageDataComponent.create(url), this.container.get()]);
    pageData.previousUrl = existingPageData?.pageUrl || tabData.tabOpenInitiators[tabId]?.url || '';
    setTimeout(async () => {
      if (pageData.isValidSite) {
        await analysisReporter.addReportsBulk([{
          loadTime: new Date().getTime(),
          previousUrl: pageData.previousUrl,
          pageUrl: pageData.pageUrl,
          trt: tabData.transitions[tabId]?.[url]?.trt,
          trq: tabData.transitions[tabId]?.[url]?.trq
        }]);
      }
      await this.clearData(tabId, url);
    }, 100);
    await pageDataComponent.setData(tabId, pageData);
    await this.onActivated();
  }
  async onActivated() {
    await Promise.all([contextMenus.update(), updateIcon()]);
  }
  async onWindowFocusChanged(windowId) {
    if (windowId !== getNoneWindowId()) {
      await this.onActivated();
    }
  }
  async onRemoved(tabId) {
    await Promise.all([this.clearData(tabId), pageDataComponent.deleteData(tabId)]);
  }
  async cleanupTabs() {
    const tabs = await queryTabs();
    const existedTabIds = tabs.map(({
      id
    }) => id).filter(id => typeof id === 'number');
    const [pagesData, tabData] = await Promise.all([pageDataComponent.getAllData(), this.container.get()]);
    for (const tabId in pagesData) {
      if (!existedTabIds.includes(Number(tabId))) {
        delete pagesData[tabId];
      }
    }
    for (const tabId in tabData.openedFromPopupTabs) {
      if (!existedTabIds.includes(Number(tabId))) {
        delete tabData.openedFromPopupTabs[tabId];
      }
    }
    for (const tabId in tabData.tabOpenInitiators) {
      if (!existedTabIds.includes(Number(tabId))) {
        delete tabData.tabOpenInitiators[tabId];
      }
    }
    for (const tabId in tabData.transitions) {
      if (!existedTabIds.includes(Number(tabId))) {
        delete tabData.transitions[tabId];
      }
    }
    await Promise.all([pageDataComponent.setAllData(pagesData), this.container.set(tabData)]);
  }
  async clearData(tabId, transitionUrl) {
    const tabData = await this.container.get();
    delete tabData.openedFromPopupTabs[tabId];
    delete tabData.tabOpenInitiators[tabId];
    if (transitionUrl && tabData.transitions[tabId]) {
      delete tabData.transitions[tabId][transitionUrl];
    } else {
      delete tabData.transitions[tabId];
    }
    await this.container.set(tabData);
  }
  async setTransitions(details) {
    if (details.frameId === 0) {
      const tabData = await this.container.get();
      tabData.transitions[details.tabId] = tabData.transitions[details.tabId] || {};
      tabData.transitions[details.tabId][details.url] = {
        trt: details.transitionType,
        trq: details.transitionQualifiers
      };
      await this.container.set(tabData);
    }
  }
  async setTarget(details) {
    const [data, pageData] = await Promise.all([this.container.get(), pageDataComponent.getData(details.sourceTabId)]);
    if (pageData) {
      data.tabOpenInitiators[details.tabId] = {
        url: pageData.pageUrl || '',
        tabId: details.sourceTabId
      };
    }
    const isAllowNextTabCreation = data.allowNextTabCreation !== null && new Date().getTime() - new Date(data.allowNextTabCreation).getTime() < 1000;
    if (isAllowNextTabCreation) {
      data.openedFromPopupTabs[details.tabId] = true;
    } else {
      data.allowNextTabCreation = null;
    }
    await this.container.set(data);
  }
  async changeNextTabCreationAllowance(value) {
    const data = await this.container.get();
    await this.container.set({
      ...data,
      allowNextTabCreation: value
    });
  }
}
const tab = new Tab();