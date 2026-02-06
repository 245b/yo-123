"use strict";

async function actionInCaseBlockElement() {
  const tabId = await getActiveTabId();
  await sendMessageToTab(tabId, {
    type: MESSAGE_TYPES.blockElementInContent,
    payload: null
  });
}