"use strict";

{
  const fn = debounce(() => {
    document.querySelector('#lanyard_root')?.remove();
    if (document.body.style.getPropertyValue('position') === 'fixed') {
      document.body.style.setProperty('position', 'initial', 'important');
    }
  }, 1);
  fn();
  new MutationObserver(fn).observe(document.documentElement, {
    childList: true,
    subtree: true
  });
}