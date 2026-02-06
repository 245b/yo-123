"use strict";

{
  const fn = debounce(() => {
    const button = Array.from(document.querySelectorAll('.ms-Dialog-actions button')).find(({
      textContent
    }) => textContent?.includes('Reject all'));
    button?.click();
  }, 100);
  new MutationObserver(fn).observe(document.documentElement, {
    childList: true,
    subtree: true
  });
}