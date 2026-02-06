"use strict";

async function actionInCaseGetPageDataForContent({
  payload: {
    url,
    isMainFrame
  }
}, {
  tab,
  frameId
} = {}) {
  if (typeof tab?.id === 'number') {
    const pageData = await pageDataComponent.getFramePageData({
      tabId: tab.id,
      frameId,
      frameUrl: url,
      isMainFrame
    });
    await sendMessageToTab(tab.id, {
      type: MESSAGE_TYPES.getPageDataForContentResponse,
      payload: {
        pageData
      }
    }, {
      frameId
    });
  }
}