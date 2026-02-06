"use strict";

const windowOpen = window.open;
new MutationObserver(() => {
  ['[style*="z-index: 2147483647"]', 'body > a', 'body > img', 'body > iframe', 'head ~ iframe'].forEach(elem => document.querySelector(elem)?.remove());
  if (document.readyState === 'complete' && window.top === window) {
    window.open = windowOpen;
  }
}).observe(document.documentElement, {
  childList: true,
  subtree: true
});
if (document.readyState !== 'complete' && window.top === window) {
  window.open = () => null;
}