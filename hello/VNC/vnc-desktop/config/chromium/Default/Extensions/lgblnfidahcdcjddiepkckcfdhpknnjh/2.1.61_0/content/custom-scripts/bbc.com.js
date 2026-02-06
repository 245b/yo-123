"use strict";

const skipPrerolls = debounce(() => {
  const player = document.querySelectorAll('smp-toucan-player')[0]?.shadowRoot?.querySelectorAll('smp-plugin')[0]?.shadowRoot?.querySelectorAll('video')[0];
  if (player) {
    player.currentTime = player.duration;
    player.play();
  }
}, 500);
new MutationObserver(skipPrerolls).observe(document.documentElement, {
  childList: true,
  subtree: true
});