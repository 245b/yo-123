"use strict";

async function updateEnabledRulesets(options) {
  return browser.declarativeNetRequest.updateEnabledRulesets(options);
}
async function updateDynamicRules(options) {
  return browser.declarativeNetRequest.updateDynamicRules(options);
}
async function getMatchedRules(options) {
  return chrome.declarativeNetRequest.getMatchedRules(options);
}