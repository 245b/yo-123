"use strict";

{
  const fn = debounce(() => {
    document.querySelector('#ue-initial-modal')?.remove();
    document.body?.classList.remove('ue-initial-modal-open');
  }, 100);
  new MutationObserver(fn).observe(document.documentElement, {
    childList: true,
    subtree: true
  });
}