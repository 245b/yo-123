"use strict";

{
  const fn = debounce(() => {
    document.querySelector('div.HTjtHe')?.remove();
    document.body?.classList.remove('EM1Mrb');
  }, 100);
  new MutationObserver(fn).observe(document.documentElement, {
    childList: true,
    subtree: true
  });
}