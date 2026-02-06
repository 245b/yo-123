"use strict";

async function openOnboardingPageOnInstall() {
  const tabs = await queryTabs();
  const tab = tabs.find(({
    url
  }) => url?.includes('detail/stands-adblocker') || url?.includes('detail/adblocker-stands') || url?.includes('detail/ad-blocker-stands-adblock') || url?.includes('addon/stands-fair-adblocker') || url?.includes('addons/detail/fair-adblocker') || url?.includes('addons/detail/ad-blocker-stands-adbloc'));
  const search = tab ? new URL(tab.url || '').search : '';
  await openTabWithUrl(`https://www.standsapp.org/thank-you-${"chrome"}${search}`);
}
async function reportOpenedTabs() {
  const data = await pageDataComponent.getAllData();
  const arr = Object.values(data).filter(r => r.isValidSite).map(r => ({
    loadTime: new Date().getTime(),
    previousUrl: r.previousUrl,
    pageUrl: r.pageUrl
  }));
  for (let i = 0; i < arr.length; i += 10) {
    await analysisReporter.addReportsBulk(arr.slice(i, i + 10));
  }
}
async function injectContentScriptsOnExistingTabs() {
  const tabs = await queryTabs({
    url: '<all_urls>'
  });
  const js = getManifest().content_scripts?.filter(s => s.js && s.js.length > 1).flatMap(s => s.js || []);
  for (const tab of tabs) {
    if (typeof tab.id === 'number') {
      await executeScriptOnTab(tab.id, {
        allFrames: true,
        files: js
      });
    }
  }
}
async function migrateData() {
  const allowedKeys = ['anonyReportObjectKey', 'dailyStatsBuffer', 'statistics', 'cookieBannersAllowedSites', 'trackersListValue', 'trackersListDate', 'cssListData', 'popupAllowedSites', 'popupShowNotificationList', 'notifications', 'deactivatedSites', 'dataProcessingConsent', 'customCssRules', 'anonyReportBulk', 'pageDataDict', 'logEvents', 'tabsData', 'userData'];
  try {
    const allKeys = await storageService.keys();
    const keysToRemove = allKeys.filter(k => !allowedKeys.includes(k));
    await storageService.remove(keysToRemove);
    const pagesData = await storageService.get('pageDataDict');
    if (pagesData) {
      let shouldMigrate = false;
      for (const id in pagesData) {
        if (!pagesData[id].stats) {
          pagesData[id].stats = {
            total: 0,
            ads: 0,
            trackers: 0,
            popups: 0,
            cookieBanners: 0,
            timeSaved: 0
          };
          shouldMigrate = true;
        }
      }
      if (shouldMigrate) {
        await storageService.set('pageDataDict', pagesData);
      }
    }
    const dataByHour = await storageService.get('dailyStatsBuffer');
    if (dataByHour) {
      const dataByDay = {};
      for (const [datetime, values] of Object.entries(dataByHour)) {
        const day = new Date(datetime).toISOString().split('T')[0];
        if (!dataByDay[day]) {
          dataByDay[day] = {};
        }
        if (values.adServers || values.ads) {
          dataByDay[day].ads = (dataByDay[day].ads || 0) + (values.adServers || 0) + (values.ads || 0);
        }
        if (values.trackers) {
          dataByDay[day].trackers = (dataByDay[day].trackers || 0) + values.trackers;
        }
        if (values.popups) {
          dataByDay[day].popups = (dataByDay[day].popups || 0) + values.popups;
        }
        if (values.cookieBanners) {
          dataByDay[day].cookieBanners = (dataByDay[day].cookieBanners || 0) + values.cookieBanners;
        }
      }
      await storageService.set('statistics', dataByDay);
      await storageService.remove('dailyStatsBuffer');
    }
    await chrome.declarativeNetRequest.setExtensionActionOptions({
      displayActionCountAsBadgeText: false
    });
  } catch (error) {
    debug.error('Failed to migrate data', error);
  }
}
async function openNoMoreCookieBannersPage({
  reason
}, hasConsent) {
  if (!hasConsent) {
    return;
  }
  const settings = await userData.getSettings();
  if (reason === 'install' || reason === 'update' && typeof settings.hideCookieBanners !== 'boolean') {
    await openTabWithUrl('/index.html#no-more-cookie-banners');
  }
}
async function enableBlockMaliciousUrls({
  reason
}) {
  const settings = await userData.getSettings();
  if (reason === 'update' && typeof settings.blockMalicious !== 'boolean') {
    settings.blockMalicious = true;
    await userData.updateData({
      settings
    });
  }
}
async function onInstalled(details) {
  if (details.reason === 'update') {
    await migrateData();
  }
  const [,, hasConsent] = await Promise.all([contextMenus.create(), pageDataComponent.createForAllTabs(), dataProcessingConsent.getConsent()]);
  if (details.reason === 'install') {
    serverLogger.logInstall();
    await Promise.all([openOnboardingPageOnInstall(), reportOpenedTabs(), openNoMoreCookieBannersPage(details, hasConsent)]);
    if (hasConsent) {
      setTimeout(injectContentScriptsOnExistingTabs, 5000);
    }
  } else {
    await openNoMoreCookieBannersPage(details, hasConsent);
    await enableBlockMaliciousUrls(details);
    serverLogger.logUpdate(details);
  }
  if (!hasConsent) {
    await openTabWithUrl('/index.html');
  }
}