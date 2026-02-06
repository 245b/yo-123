"use strict";

const keys = ['blacklist', 'whitelist', 'extended_rules', 'cookie_banners_blacklist', 'cookie_banners_extended_rules', 'cookie_banners_whitelist'];
class CssListDataComponent {
  container = new DataContainer('cssListData', {
    css_rules: {
      blacklist: {},
      extended_rules: {},
      whitelist: {},
      cookie_banners_blacklist: {},
      cookie_banners_extended_rules: {},
      cookie_banners_whitelist: {}
    },
    hash: '',
    id: 0,
    last_check: 0
  });
  async getLatestCssList() {
    const key1 = await loadAnonyId();
    const app_version = getAppVersion();
    const {
      data
    } = await serverApi.callUrl({
      url: `${API_URLS.cssLatest}?key1=${key1}&app_version=${app_version}`
    });
    if (data) {
      data.last_check = new Date().getTime();
      await this.container.set(data);
    }
  }
  async getLastIncrementIDs() {
    const currentCssList = await this.container.get();
    const {
      data
    } = await serverApi.callUrl({
      url: `${API_URLS.listsManagement}?current_list=${currentCssList.id}`
    });
    if (data) {
      currentCssList.last_check = new Date().getTime();
      await this.container.set(currentCssList);
    }
    return data;
  }
  async implementLastIncrements() {
    const lastIncrementIDs = await this.getLastIncrementIDs();
    if (!lastIncrementIDs) {
      return;
    }
    const currentCssList = structuredClone(await this.container.get());
    const key1 = await loadAnonyId();
    const app_version = getAppVersion();
    for (const id of lastIncrementIDs) {
      const {
        data: increment
      } = await serverApi.callUrl({
        url: `${API_URLS.cssIncrement}${id}?key1=${key1}&version=${app_version}`
      });
      if (!increment) {
        return;
      }
      for (const listPart of keys) {
        const newList = increment.css_rules[listPart];
        const currentList = currentCssList.css_rules[listPart];
        for (const key in newList) {
          if (newList[key].delete_host) {
            delete currentList[key];
          }
          if (newList[key].delete_rule && currentList[key]) {
            currentList[key] = currentList[key].filter(oldRule => !newList[key].delete_rule?.includes(oldRule));
          }
          if (newList[key].add_rule) {
            currentList[key] = currentList[key] || [];
            currentList[key].push(...newList[key].add_rule);
          }
        }
      }
      currentCssList.id = increment.list_id;
      currentCssList.hash = md5(this.makeSortedStringFromCssList(currentCssList));
      if (currentCssList.hash === increment.hash) {
        await this.container.set(currentCssList);
      } else {
        serverLogger.logError(new Error('Hash mismatch'), 'CssListDataComponent.implementLastIncrements');
        await this.getLatestCssList();
        break;
      }
    }
  }
  makeSortedStringFromCssList(list) {
    const sortedKeys = ['css_rules', ...keys];
    for (const listPart of keys) {
      for (const key in list.css_rules[listPart]) {
        list.css_rules[listPart][key].sort();
        sortedKeys.push(key);
      }
    }
    return JSON.stringify(list, sortedKeys.sort());
  }
  async start() {
    const currentList = await this.container.get();
    const currentTime = new Date().getTime();
    if (currentList.id === 0) {
      const startCssList = await fetch(getExtensionRelativeUrl('/views/web_accessible/lists/start-css-list.json'));
      const data = await startCssList.json();
      data.last_check = new Date().getTime();
      await this.container.set(data);
      await this.implementLastIncrements();
    } else if (currentTime - currentList.last_check > 4 * 24 * 60 * 60 * 1000) {
      await this.implementLastIncrements();
    }
  }
}
const cssListDataComponent = new CssListDataComponent();