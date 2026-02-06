"use strict";

new MutationObserver(() => {
  ['.x-vi-evo-main-container__top-panel', '.x-evo-btf-river .x-pda-placements', '.x-atf-left-bottom-river', '.x-evo-middle-river div[id^="placement"]'].forEach(elem => document.querySelector(elem)?.remove());
}).observe(document.documentElement, {
  childList: true,
  subtree: true
});