"use strict";

function actionInCaseExtensionUrlOpened({
  payload
}) {
  serverLogger.logExtensionUrlOpened(payload.location);
}