"use strict";

async function actionInCaseUpdateUserSettings({
  payload: {
    settings
  }
}) {
  await updateUserSettings(settings, true);
}