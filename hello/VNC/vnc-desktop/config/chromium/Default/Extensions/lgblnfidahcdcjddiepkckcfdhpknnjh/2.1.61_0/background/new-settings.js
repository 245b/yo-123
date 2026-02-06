"use strict";

async function applyNewSettingsOnTabs(tabIds) {
  try {
    await pageDataComponent.refreshBulk(tabIds);
    await updateIcon();
    for (const tabId of tabIds) {
      const frames = (await getAllFrames(tabId)) || [];
      for (const {
        url,
        frameId
      } of frames) {
        const frameData = await pageDataComponent.getFramePageData({
          tabId,
          frameId,
          frameUrl: url
        });
        if (frameData.isValidSite) {
          await sendMessageToTab(tabId, {
            type: MESSAGE_TYPES.updatePageData,
            payload: {
              pageData: frameData
            }
          }, {
            frameId
          });
        }
      }
    }
  } catch (error) {
    debug.error(`Error in applyNewSettingsOnTabs: ${error}`);
  }
}