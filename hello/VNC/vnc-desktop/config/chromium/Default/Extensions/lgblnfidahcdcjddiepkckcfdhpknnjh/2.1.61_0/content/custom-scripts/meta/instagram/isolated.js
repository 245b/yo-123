"use strict";

const blockFeedAds = debounce(() => {
  const ads = Array.from(document.querySelectorAll('article:has(a[href^="https://www.facebook.com/ads/"])'));
  for (let i = 0; i < ads.length; i++) {
    if (ads[i].clientHeight !== 0) {
      ads[i].style.setProperty('height', '0', 'important');
      ads[i].style.setProperty('overflow', 'hidden', 'important');
    }
  }
}, 500);
new MutationObserver(blockFeedAds).observe(document.documentElement, {
  childList: true,
  subtree: true
});
blockMetaFeedAds('article>div');