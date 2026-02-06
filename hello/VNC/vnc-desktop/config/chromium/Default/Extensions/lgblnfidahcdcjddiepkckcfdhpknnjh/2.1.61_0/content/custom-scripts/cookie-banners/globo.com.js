"use strict";

new MutationObserver(() => {
  document.querySelector('.fc-consent-root')?.remove();
  if (document.body.style.getPropertyValue('overflow') === 'hidden') {
    document.body.style.setProperty('overflow', 'auto', 'important');
  }
}).observe(document.documentElement, {
  childList: true,
  subtree: true
});