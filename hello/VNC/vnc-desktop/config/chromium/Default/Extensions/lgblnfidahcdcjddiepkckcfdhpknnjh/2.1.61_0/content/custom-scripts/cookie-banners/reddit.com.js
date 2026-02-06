"use strict";

{
  const fn = debounce(() => {
    document.querySelector('#data-protection-consent-dialog')?.remove();
  }, 100);
  fn();
  new MutationObserver(fn).observe(document.documentElement, {
    childList: true,
    subtree: true
  });
}