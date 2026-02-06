"use strict";

{
  const fn = debounce(() => {
    if (document.readyState === 'complete' && window.top === window) {
      document.children[0].classList.add('allow-scroll');
      document.querySelector('[data-project="mol-fe-cmp"]')?.remove();
    }
  }, 100);
  new MutationObserver(fn).observe(document.documentElement, {
    childList: true,
    subtree: true
  });
}