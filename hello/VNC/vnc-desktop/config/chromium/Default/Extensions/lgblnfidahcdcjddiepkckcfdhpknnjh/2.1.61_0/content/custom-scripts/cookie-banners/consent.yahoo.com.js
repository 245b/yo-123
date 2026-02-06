"use strict";

{
  const fn = debounce(() => {
    document.querySelector('#consent-page .reject-all')?.click();
  }, 100);
  fn();
  new MutationObserver(fn).observe(document.documentElement, {
    childList: true,
    subtree: true
  });
}