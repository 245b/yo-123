"use strict";

{
  const fn = debounce(() => {
    document.querySelector('div[id*="sp_message_container"]')?.remove();
    document.documentElement.classList.remove('sp-message-open');
  }, 100);
  new MutationObserver(fn).observe(document.documentElement, {
    childList: true,
    subtree: true
  });
}