"use strict";

async function actionInCaseSetDataProcessingConsent({
  payload
}) {
  await dataProcessingConsent.setConsent(payload.hasConsent);
  await sendMessage({
    type: MESSAGE_TYPES.getDataProcessingConsentResponse,
    payload: {
      forStandsPopup: true,
      data: {
        hasConsent: payload.hasConsent
      }
    }
  });
  if (payload.hasConsent) {
    startApp();
    serverLogger.prepareAndSend(true);
    userData.getData().then(u => {
      if (typeof u?.settings?.hideCookieBanners !== 'boolean') {
        openTabWithUrl('/index.html#no-more-cookie-banners');
      }
    });
  }
}