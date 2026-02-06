"use strict";

async function registerContentScripts(scripts) {
  try {
    await browser.scripting.registerContentScripts(scripts);
  } catch (error) {
    debug.error('registerContentScripts', error);
  }
}
function getRegisteredContentScripts(filter) {
  try {
    return browser.scripting.getRegisteredContentScripts(filter);
  } catch (error) {
    debug.error('getRegisteredContentScripts', error);
    return [];
  }
}
async function unregisterContentScripts(filter) {
  try {
    await browser.scripting.unregisterContentScripts(filter);
  } catch (error) {
    debug.error('unregisterContentScripts', error);
  }
}