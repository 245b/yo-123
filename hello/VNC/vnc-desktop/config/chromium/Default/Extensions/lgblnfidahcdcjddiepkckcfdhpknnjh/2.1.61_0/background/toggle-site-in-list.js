"use strict";

async function toggleSiteInList(host, list, sendMessageToPopup = false) {
  if (list === 'cookieBanners') {
    await cookieBannersAllowedSites.toggle(host);
    const inList = await cookieBannersAllowedSites.isAllowed(host);
    serverLogger.logWhitelistChange(host, 'cookie_banners', !!inList);
  }
  if (list === 'deactivatedSites') {
    await deactivatedSites.toggle(host);
    const inList = await deactivatedSites.isHostDeactivated(host);
    serverLogger.logWhitelistChange(host, 'ads', !!inList);
  }
  if (list === 'popups') {
    await Promise.all([popupShowNotificationList.removeValueByHost(host), popupAllowedSites.toggle(host)]);
    const inList = await popupAllowedSites.isAllowed(host);
    serverLogger.logWhitelistChange(host, 'popups', !!inList);
  }
  if (sendMessageToPopup) {
    await sendMessage({
      type: MESSAGE_TYPES.toggleSiteInListResponse,
      payload: {
        forStandsPopup: true
      }
    });
  }
  const tabs = await queryTabs();
  const tabIds = tabs.filter(({
    url
  }) => host === getUrlHost(url || '')).map(({
    id
  }) => id).filter(id => typeof id === 'number');
  await pageDataComponent.refreshBulk(tabIds);
  await Promise.all([updateIcon(), contextMenus.update()]);
  tabIds.forEach(reloadTab);
}