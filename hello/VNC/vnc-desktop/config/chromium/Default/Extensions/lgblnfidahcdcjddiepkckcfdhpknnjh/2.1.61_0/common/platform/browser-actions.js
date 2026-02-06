"use strict";

async function setAppIconBadgeBackgroundColor(color) {
  try {
    await browser.action.setBadgeBackgroundColor({
      color
    });
  } catch (e) {
    debug.error('Error setting icon background color', e);
  }
}
async function setAppIconBadgeTitle(title) {
  try {
    await browser.action.setTitle({
      title
    });
  } catch (e) {
    debug.error('Error setting icon title', e);
  }
}
async function setAppIconBadgeText(text) {
  try {
    await browser.action.setBadgeText({
      text
    });
  } catch (e) {
    debug.error('Error setting icon text', e);
  }
}
async function setIcon(details) {
  try {
    await browser.action.setIcon(details);
  } catch (e) {
    debug.error('Error setting icon', e);
  }
}