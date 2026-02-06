"use strict";

async function actionInCasePopupUserAction({
  payload
}, sender) {
  const POPUP_OPTIONS = {
    allow: 'allow',
    block: 'block',
    once: 'once'
  };
  switch (payload.option) {
    case POPUP_OPTIONS.block:
      await popupAllowedSites.remove(payload.host);
      if (typeof sender?.tab?.id === 'number') {
        await applyNewSettingsOnTabs([sender.tab.id]);
      }
      break;
    case POPUP_OPTIONS.allow:
      await popupAllowedSites.add(payload.host);
      if (typeof sender?.tab?.id === 'number') {
        await applyNewSettingsOnTabs([sender.tab.id]);
      }
      await tab.changeNextTabCreationAllowance(new Date().getTime());
      break;
    case POPUP_OPTIONS.once:
      await tab.changeNextTabCreationAllowance(new Date().getTime());
      break;
    default:
      break;
  }
  await popupShowNotificationList.setValueByHost(payload.host, false);
}