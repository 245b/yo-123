"use strict";

const picrewmeScript = debounce(() => {
  setCssValueScript('.sitetop-Header > span > div > iframe', 'height', '0px');
  setCssValueScript('.sitetop-Main > span > div > iframe', 'height', '0px');
  setCssValueScript('.play-Container_Imagemaker', 'flex', 'none');
  setCssValueScript('form ~ span > div > iframe', 'height', '0px');
  setCssValueScript('.search-Sidebar ~ span > div > iframe', 'height', '0px');
  setCssValueScript('body > div[id^=img] > div[id^=img]', 'height', '0px');
  setCssValueScript('.search-ImagemakerList > span > div > iframe', 'height', '0px');
  setCssValueScript('.complete-Container > span > div > iframe', 'height', '0px');
  if (document.readyState !== 'complete' && window.top === window) {
    setTimeout(picrewmeScript, 1500);
  }
}, 200);
new MutationObserver(picrewmeScript).observe(document.documentElement, {
  childList: true,
  subtree: true
});