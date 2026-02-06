"use strict";

class ContextMenus {
  ids = {
    block: 'block-elements',
    blockOnPage: 'block-elements-page',
    disable: 'disable',
    disableOnPage: 'disable-page',
    separatorOnPage: 'separator-page',
    siteDisable: 'site-disable',
    siteDisableOnPage: 'site-disable-page',
    pageMenuParent: 'stands-page',
    unblock: 'unblock-elements',
    unblockOnPage: 'unblock-elements-page'
  };
  ACTION_CONTEXTS = ['action'];
  PAGE_CONTEXTS = ['page', 'selection', 'frame', 'link', 'image', 'video', 'audio'];
  async onClick({
    menuItemId: id
  }) {
    if (id === this.ids.blockOnPage || id === this.ids.block) {
      const activeTabId = await getActiveTabId();
      await sendMessageToTab(activeTabId, {
        type: MESSAGE_TYPES.blockElementInContent,
        payload: null
      });
    }
    if (id === this.ids.unblockOnPage || id === this.ids.unblock) {
      const activeTabId = await getActiveTabId();
      await unblockElementsOnPage(activeTabId);
    }
    if (id === this.ids.siteDisableOnPage || id === this.ids.siteDisable) {
      const pageData = await pageDataComponent.getActiveTabData();
      if (pageData) {
        await toggleSiteInList(pageData.hostAddress, 'deactivatedSites');
      }
    }
    if (id === this.ids.disableOnPage || id === this.ids.disable) {
      const settings = await userData.getSettings();
      await updateUserSettings({
        enabled: !settings.enabled
      });
    }
  }
  async getMenuItems() {
    const [pageData, settings, customCssData] = await Promise.all([pageDataComponent.getActiveTabData(), userData.getSettings(), customCssRules.getData()]);
    const documentUrlPatterns = Object.keys(customCssData).flatMap(host => [`*://${host}/*`, `*://www.${host}/*`]);
    let isHostDisabled = false;
    let customCssSelectors;
    if (pageData) {
      customCssSelectors = customCssData[pageData.hostAddress];
      isHostDisabled = !!(await deactivatedSites.isHostDeactivated(pageData.hostAddress));
    }
    const isMenuEnabled = !!pageData?.isValidSite && settings.enabled;
    const isCurrentHostMenuEnabled = isMenuEnabled && !isHostDisabled;
    const items = [{
      id: this.ids.block,
      enabled: isCurrentHostMenuEnabled,
      title: getLocalizedText('block_elements_on_this_page'),
      contexts: this.ACTION_CONTEXTS
    }, {
      id: this.ids.unblock,
      enabled: isCurrentHostMenuEnabled && !!customCssSelectors,
      title: getLocalizedText('unblock_elements_on_this_page'),
      contexts: this.ACTION_CONTEXTS
    }, {
      id: this.ids.siteDisable,
      enabled: isMenuEnabled,
      title: isHostDisabled ? getLocalizedText('resume_blocking') : getLocalizedText('whitelist_this_site'),
      contexts: this.ACTION_CONTEXTS
    }, {
      id: this.ids.disable,
      title: settings.enabled ? getLocalizedText('turn_off_blocking_everywhere') : getLocalizedText('turn_on_blocking'),
      contexts: this.ACTION_CONTEXTS
    }, {
      id: this.ids.pageMenuParent,
      title: getLocalizedText('adblocker_by_stands'),
      contexts: this.PAGE_CONTEXTS
    }, {
      id: this.ids.blockOnPage,
      enabled: isCurrentHostMenuEnabled,
      title: getLocalizedText('block_elements_on_this_page'),
      parentId: this.ids.pageMenuParent,
      contexts: this.PAGE_CONTEXTS
    }, {
      id: this.ids.unblockOnPage,
      enabled: isCurrentHostMenuEnabled && !!customCssSelectors,
      title: getLocalizedText('unblock_elements_on_this_page'),
      documentUrlPatterns,
      parentId: this.ids.pageMenuParent,
      contexts: this.PAGE_CONTEXTS
    }, {
      id: this.ids.separatorOnPage,
      parentId: this.ids.pageMenuParent,
      type: 'separator',
      contexts: this.PAGE_CONTEXTS
    }, {
      id: this.ids.siteDisableOnPage,
      enabled: isMenuEnabled,
      title: isHostDisabled ? getLocalizedText('resume_blocking') : getLocalizedText('whitelist_this_site'),
      parentId: this.ids.pageMenuParent,
      contexts: this.PAGE_CONTEXTS
    }, {
      id: this.ids.disableOnPage,
      title: settings.enabled ? getLocalizedText('turn_off_blocking_everywhere') : getLocalizedText('turn_on_blocking'),
      parentId: this.ids.pageMenuParent,
      contexts: this.PAGE_CONTEXTS
    }];
    return items;
  }
  async create() {
    const [menuItems] = await Promise.all([this.getMenuItems(), removeContextMenu()]);
    for (const item of menuItems) {
      await createContextMenuItem(item);
    }
  }
  async update() {
    const menuItems = await this.getMenuItems();
    for (const {
      id,
      ...props
    } of menuItems) {
      await updateContextMenuItem(id, props);
    }
  }
}
const contextMenus = new ContextMenus();