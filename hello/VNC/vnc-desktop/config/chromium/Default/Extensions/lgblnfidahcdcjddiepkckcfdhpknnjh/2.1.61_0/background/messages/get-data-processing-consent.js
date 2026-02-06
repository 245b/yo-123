"use strict";

async function actionInCaseGetDataProcessingConsent() {
  const hasConsent = await dataProcessingConsent.getConsent();
  await sendMessage({
    type: MESSAGE_TYPES.getDataProcessingConsentResponse,
    payload: {
      forStandsPopup: true,
      data: {
        hasConsent
      }
    }
  });
}