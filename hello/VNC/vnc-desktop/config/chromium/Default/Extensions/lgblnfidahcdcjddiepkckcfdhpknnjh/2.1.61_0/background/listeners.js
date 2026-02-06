"use strict";

function registerToEssentialEvents() {
  try {
    browser.runtime.onMessage.addListener(messageProcessor.sendMessage.bind(messageProcessor));
    browser.runtime.onInstalled.addListener(onInstalled);
  } catch (e) {
    serverLogger.logError(e, 'registerEssentialEvents');
  }
}
function registerToAllEvents() {
  try {
    browser.contextMenus.onClicked.addListener(contextMenus.onClick.bind(contextMenus));
    browser.tabs.onActivated.addListener(tab.onActivated.bind(tab));
    browser.tabs.onUpdated.addListener(tab.onUpdated.bind(tab));
    browser.tabs.onRemoved.addListener(tab.onRemoved.bind(tab));
    browser.webNavigation.onCommitted.addListener(tab.setTransitions.bind(tab));
    browser.windows.onFocusChanged.addListener(tab.onWindowFocusChanged.bind(tab));
    browser.webNavigation.onCreatedNavigationTarget.addListener(tab.setTarget.bind(tab));
    browser.notifications.onButtonClicked.addListener(notifications.onClick.bind(notifications));
    browser.notifications.onClicked.addListener(notifications.onClick.bind(notifications));
    browser.notifications.onClosed.addListener(notifications.onClosed.bind(notifications));
    browser.alarms.onAlarm.addListener(jobRunner.onAlarm.bind(jobRunner));
  } catch (e) {
    serverLogger.logError(e, 'registerEvents');
  }
}