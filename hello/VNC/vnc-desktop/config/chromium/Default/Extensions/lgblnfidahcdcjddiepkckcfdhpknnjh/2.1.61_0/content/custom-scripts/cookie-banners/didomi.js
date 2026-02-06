"use strict";

{
  const fn = debounce(() => {
    document.querySelector('#didomi-popup')?.remove();
    document.querySelector('#didomi-host')?.remove();
    document.body?.classList.remove('didomi-popup-open');
  }, 100);
  new MutationObserver(fn).observe(document.documentElement, {
    childList: true,
    subtree: true
  });
}