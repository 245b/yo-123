"use strict";

async function actionInCaseCountBlockedElements() {
  const activeTabId = await getActiveTabId();
  const data = await customCssRules.countRulesOnTab(activeTabId);
  await sendMessage({
    type: MESSAGE_TYPES.countBlockedElementsResponse,
    payload: {
      data,
      forStandsPopup: true
    }
  });
}