"use strict";

async function reloadTab(tabId) {
  try {
    return await browser.tabs.reload(tabId);
  } catch (e) {
    debug.error('Error in reloadTab', {
      tabId,
      e
    });
  }
}
async function queryTabs(filter = {}) {
  try {
    return await browser.tabs.query(filter);
  } catch (e) {
    debug.error('Error in queryTabs', {
      filter,
      e
    });
    return [];
  }
}
async function openTabWithUrl(url) {
  try {
    return await browser.tabs.create({
      url,
      active: true
    });
  } catch (e) {
    debug.error('Error in openTabWithUrl', {
      url,
      e
    });
    return null;
  }
}
async function sendMessageToTab(tabId, message, options = {}) {
  try {
    await browser.tabs.sendMessage(tabId, message, options);
  } catch (e) {
    debug.error('Error in sendMessageToTab', {
      tabId,
      message,
      options,
      e
    });
  }
}
async function executeScriptOnTab(tabId, details) {
  try {
    const tab = await browser.tabs.get(tabId);
    if (tab?.status !== 'complete') {
      return [];
    }
    const extensionsUrl = browserInfo.getExtensionsUrl();
    const browserStoreUrl = browserInfo.getBrowserStoreUrl();
    if (extensionsUrl && tab.url?.startsWith(extensionsUrl) || browserStoreUrl && tab.url?.startsWith(browserStoreUrl) || !tab.url?.startsWith('http')) {
      return [];
    }
    const d = {
      target: {
        tabId,
        allFrames: details.allFrames
      }
    };
    if (details.func) {
      d.func = details.func;
      d.args = details.args;
    }
    if (details.files) {
      d.files = details.files;
    }
    const results = await browser.scripting.executeScript(d);
    return results.map(r => r.result);
  } catch (error) {
    debug.error('Error in executeScriptOnTab', {
      details,
      error
    });
    return [];
  }
}
async function getActiveTab() {
  const activeTabs = await queryTabs({
    active: true,
    currentWindow: true,
    lastFocusedWindow: true
  });
  if (activeTabs.at(0)) {
    return activeTabs.at(0);
  }
  const allTabs = await queryTabs();
  return allTabs.at(0);
}
async function getActiveTabId() {
  const tab = await getActiveTab();
  return tab?.id || 0;
}