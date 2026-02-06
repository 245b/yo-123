"use strict";

async function updateUserSettings(settings, sendMessageForPopup = false) {
  const currentSettings = await userData.getSettings();
  const isEnabledFieldChanged = typeof settings.enabled === 'boolean' && settings.enabled !== currentSettings.enabled;
  await userData.updateData({
    settings: {
      ...currentSettings,
      ...settings
    }
  });
  if (sendMessageForPopup) {
    await sendMessage({
      type: MESSAGE_TYPES.updateUserSettingsResponse,
      payload: {
        forStandsPopup: true
      }
    });
  }
  if (isEnabledFieldChanged) {
    await Promise.all([contextMenus.update(), updateEnabledRulesets({
      [settings.enabled ? 'enableRulesetIds' : 'disableRulesetIds']: ['requests']
    })]);
    const pageData = await pageDataComponent.getActiveTabData();
    serverLogger.logStateChange(!!settings.enabled, pageData?.hostAddress);
  }
  if (typeof settings.blockTracking === 'boolean' && settings.blockTracking !== currentSettings.blockTracking) {
    serverLogger.logBlockingSettingsChange('tracking', settings.blockTracking);
  }
  if (typeof settings.blockPopups === 'boolean' && settings.blockPopups !== currentSettings.blockPopups) {
    serverLogger.logBlockingSettingsChange('popups', settings.blockPopups);
  }
  if (typeof settings.hideCookieBanners === 'boolean' && settings.hideCookieBanners !== currentSettings.hideCookieBanners) {
    await updateEnabledRulesets({
      [settings.hideCookieBanners ? 'enableRulesetIds' : 'disableRulesetIds']: ['cookie-banners-requests']
    });
    serverLogger.logBlockingSettingsChange('cookie_banners', settings.hideCookieBanners);
  }
  if (typeof settings.blockMalicious === 'boolean' && settings.blockMalicious !== currentSettings.blockMalicious) {
    await updateEnabledRulesets({
      [settings.blockMalicious ? 'enableRulesetIds' : 'disableRulesetIds']: ['filter1-requests']
    });
    serverLogger.logBlockingSettingsChange('block_malicious', settings.blockMalicious);
  }
  const tabs = await queryTabs({
    windowType: 'normal'
  });
  const tabIds = tabs.map(({
    id
  }) => id).filter(id => typeof id === 'number');
  await applyNewSettingsOnTabs(tabIds);
  if (isEnabledFieldChanged) {
    const activeTabId = await getActiveTabId();
    await reloadTab(activeTabId);
  }
}