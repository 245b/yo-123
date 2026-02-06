"use strict";

{
  const fn = debounce(() => {
    document.querySelector('#bnp_cookie_banner')?.remove();
    document.querySelector('#cookie_preference')?.remove();
  }, 100);
  fn();
  new MutationObserver(fn).observe(document.documentElement, {
    childList: true,
    subtree: true
  });
}