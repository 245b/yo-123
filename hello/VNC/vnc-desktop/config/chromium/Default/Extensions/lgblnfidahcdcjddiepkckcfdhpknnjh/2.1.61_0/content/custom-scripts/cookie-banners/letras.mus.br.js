"use strict";

new MutationObserver(() => {
  document.querySelector('.fc-consent-root')?.remove();
  const {
    body,
    documentElement
  } = document;
  if (body.style.getPropertyValue('overflow') === 'hidden') {
    body.style.setProperty('overflow', 'auto', 'important');
  }
  if (documentElement.style.getPropertyValue('overflow') === 'hidden') {
    documentElement.style.setProperty('overflow', 'auto', 'important');
  }
}).observe(document.documentElement, {
  childList: true,
  subtree: true
});