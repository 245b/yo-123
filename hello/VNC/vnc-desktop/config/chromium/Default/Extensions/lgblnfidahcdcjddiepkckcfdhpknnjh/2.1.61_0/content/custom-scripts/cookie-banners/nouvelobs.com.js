"use strict";

{
  const fn = debounce(() => {
    document.querySelector('.gdpr-glm.gdpr-glm-wall')?.remove();
    document.body?.classList.remove('popin-gdpr-no-scroll');
    document.documentElement?.classList.remove('popin-gdpr-no-scroll');
  }, 1);
  new MutationObserver(fn).observe(document.documentElement, {
    childList: true,
    subtree: true
  });
}