"use strict";

function getNoneWindowId() {
  return browser.windows.WINDOW_ID_NONE;
}
async function getAllFrames(tabId) {
  return browser.webNavigation.getAllFrames({
    tabId
  });
}