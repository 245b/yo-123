"use strict";

async function getOperatingSystem() {
  try {
    const details = await browser.runtime.getPlatformInfo();
    return details.os;
  } catch (error) {
    return 'unknown';
  }
}
async function setUninstallURL(url) {
  await browser.runtime.setUninstallURL(url);
}
function getExtensionRelativeUrl(path) {
  return browser.runtime.getURL(path);
}
function getExtensionId() {
  return browser.runtime.id;
}
function getManifest() {
  return browser.runtime.getManifest();
}
function getAppVersion() {
  return browser.runtime.getManifest().version;
}