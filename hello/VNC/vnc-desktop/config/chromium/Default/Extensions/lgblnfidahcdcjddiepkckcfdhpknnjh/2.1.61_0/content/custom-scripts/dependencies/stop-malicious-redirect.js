"use strict";

function stopMaliciousRedirect(redirectSelectors) {
  for (const selector of redirectSelectors) {
    document.querySelector(selector)?.remove();
  }
  if (document.readyState !== 'complete' && window.top === window) {
    setTimeout(() => stopMaliciousRedirect(redirectSelectors), 1000);
  }
}