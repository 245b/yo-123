"use strict";

const currentDocument = window.document;
const iframeId = Math.random().toString();
let pageData = {};
const generalExtendedRules = new ExtendedRules(BLOCK_TYPES.ad);
const cookieBannerExtendedRules = new ExtendedRules(BLOCK_TYPES.cookieBanner);
const generaRulesCounter = new MatchedNodesCounter(BLOCK_TYPES.ad);
const cookieBannerRulesCounter = new MatchedNodesCounter(BLOCK_TYPES.cookieBanner);
async function stopTrackingFrames() {
  const trackers = await storageService.get('trackersListValue');
  if (trackers) {
    const iframes = currentDocument.getElementsByTagName('iframe');
    for (const iframe of iframes) {
      for (const tracker of trackers) {
        if (iframe.src.includes(tracker)) {
          iframe.remove();
          break;
        }
      }
    }
  }
}
async function setPageData(data, isUpdate = false) {
  const previousPageData = {
    ...pageData
  };
  pageData = data;
  await setPageCss();
  if (pageData.blockPopups && !previousPageData.blockPopups) {
    startPopupsBlocking();
  }
  if (!isUpdate && pageData.blockTracking) {
    await stopTrackingFrames();
  }
  if (isUpdate && !pageData.blockPopups && previousPageData.blockPopups) {
    stopPopupsBlocking();
  }
}
sendMessage({
  type: MESSAGE_TYPES.getPageDataForContentRequest,
  payload: {
    url: location.href,
    isMainFrame: window === window.top
  }
});