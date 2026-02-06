"use strict";

let popupScriptEmbedded = false;
function sendEventToPopupBlocking(detail) {
  document.dispatchEvent(new CustomEvent('sendToPopupBlocking', {
    detail: JSON.stringify(detail)
  }));
}
function startPopupsBlocking() {
  if (popupScriptEmbedded) {
    sendEventToPopupBlocking({
      type: MESSAGE_TYPES.stndzPopupUpdate,
      payload: {
        iframeId,
        active: true
      }
    });
    return;
  }
  popupScriptEmbedded = true;
  const script = currentDocument.createElement('script');
  script.src = getExtensionRelativeUrl('content/popups-script.js');
  script.onload = () => {
    sendEventToPopupBlocking({
      type: MESSAGE_TYPES.stndzPopupInfo,
      payload: {
        iframeId,
        showNotification: pageData.showBlockedPopupNotification,
        popupResources: {
          'icon.png': getExtensionRelativeUrl('/views/web_accessible/images/icon.png'),
          'help.png': getExtensionRelativeUrl('/views/web_accessible/images/help.png'),
          'close.png': getExtensionRelativeUrl('/views/web_accessible/images/close.png')
        }
      }
    });
  };
  addElementToHead(script);
}
function stopPopupsBlocking() {
  sendEventToPopupBlocking({
    type: MESSAGE_TYPES.stndzPopupUpdate,
    payload: {
      iframeId,
      active: false
    }
  });
}