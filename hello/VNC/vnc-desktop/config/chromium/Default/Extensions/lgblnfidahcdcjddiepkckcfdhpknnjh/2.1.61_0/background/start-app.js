"use strict";

async function startApp() {
  try {
    const hasConsent = await dataProcessingConsent.getConsent();
    await setIcon({
      path: {
        19: `icons/19${!hasConsent ? '_gray' : ''}.png`,
        38: `icons/38${!hasConsent ? '_gray' : ''}.png`
      }
    });
    if (!hasConsent) {
      return;
    }
    registerToAllEvents();
    createAllJobs();
    await userData.init();
    await notifications.init();
    await cookieBannersAllowedSites.init();
    await deactivatedSites.init();
    await loadLists();
    await pageDataComponent.createForAllTabs();
    const user = await userData.getData();
    await setUninstallURL(`${RESOURCES.uninstallUrl}/${user?.privateUserId}/`);
    await setAppIconBadgeBackgroundColor('#F04E30');
    const settings = await userData.getSettings();
    await updateEnabledRulesets({
      [settings.enabled ? 'enableRulesetIds' : 'disableRulesetIds']: ['requests']
    });
    await updateEnabledRulesets({
      [settings.hideCookieBanners ? 'enableRulesetIds' : 'disableRulesetIds']: ['cookie-banners-requests']
    });
    await updateEnabledRulesets({
      [settings.blockMalicious ? 'enableRulesetIds' : 'disableRulesetIds']: ['filter1-requests']
    });
    await updateBrowserProperties();
  } catch (e) {
    serverLogger.logError(e, 'startApp');
  }
}
registerToEssentialEvents();
startApp();