"use strict";

browser.runtime.onMessage.addListener(handleWindowMessages);
window.addEventListener('message', handleWindowMessagesInContent, false);
async function handleWindowMessagesInContent(event) {
  if (getUrlHost(event.origin) === 'standsapp.org' && event.data.type === MESSAGE_TYPES.openSettingsPage) {
    await sendMessage({
      type: MESSAGE_TYPES.openSettingsPage,
      payload: null
    });
  }
  const payload = event.data.payload;
  if (payload?.iframeId === iframeId) {
    if (event.data.type === MESSAGE_TYPES.popupUserAction) {
      const p = event.data.payload;
      await sendMessage({
        type: MESSAGE_TYPES.popupUserAction,
        payload: {
          host: pageData.hostAddress,
          option: p.option
        }
      });
    }
    if (event.data.type === MESSAGE_TYPES.popupBlocked) {
      await sendMessage({
        type: MESSAGE_TYPES.updateStatistics,
        payload: {
          typeId: BLOCK_TYPES.popup,
          amount: 1
        }
      });
    }
  }
}
async function handleWindowMessages({
  type,
  payload
}) {
  if (type === MESSAGE_TYPES.getPageDataForContentResponse) {
    await setPageData(payload.pageData);
  }
  if (type === MESSAGE_TYPES.updatePageData) {
    await setPageData(payload.pageData, true);
  }
  if (type === MESSAGE_TYPES.stndzShowPopupNotification) {
    window.top?.postMessage({
      type: MESSAGE_TYPES.stndzShowPopupNotification,
      payload: {
        iframeId
      }
    }, '*');
  }
  if (type === MESSAGE_TYPES.blockElementInContent) {
    await blockElements();
  }
  if (type === MESSAGE_TYPES.undoBlockedElementsResponse) {
    clearCustomBlockedNodes();
  }
}