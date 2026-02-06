"use strict";

async function actionInCaseGetUserSettings() {
  const data = await userData.getSettings();
  await sendMessage({
    type: MESSAGE_TYPES.getUserSettingsResponse,
    payload: {
      forStandsPopup: true,
      data
    }
  });
}