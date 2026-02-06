"use strict";

const dorawatchScript = () => {
  if (document.readyState !== 'complete') {
    setTimeout(() => dorawatchScript(), 1000);
  } else {
    if (document.URL.includes('dorawatch')) {
      const outerIframe = document.querySelector('#player > iframe');
      if (outerIframe?.src === 'about:blank') {
        document.querySelector('.btn-watchnow')?.click();
      }
    } else if (document.URL.includes('soap2night')) {
      document.querySelector('#dontfoid')?.remove();
    } else if (document.URL.includes('vidlink')) {
      document.querySelector('body > div:not([data-overlay-container])')?.remove();
    }
  }
};
dorawatchScript();