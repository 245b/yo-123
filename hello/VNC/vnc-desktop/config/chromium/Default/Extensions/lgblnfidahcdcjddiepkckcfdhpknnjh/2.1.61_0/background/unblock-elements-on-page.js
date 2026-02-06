"use strict";

async function unblockElementsOnPage(tabId) {
  const pageData = await pageDataComponent.getData(tabId);
  if (!pageData) {
    return;
  }
  await Promise.all([customCssRules.remove(pageData.hostAddress), pageDataComponent.refreshBulk([tabId])]);
  const newPageData = await pageDataComponent.getData(tabId);
  await sendMessageToTab(tabId, {
    type: MESSAGE_TYPES.updatePageData,
    payload: {
      pageData: newPageData
    }
  });
}