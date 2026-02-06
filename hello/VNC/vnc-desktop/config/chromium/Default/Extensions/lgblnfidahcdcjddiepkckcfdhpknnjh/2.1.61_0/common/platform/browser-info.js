"use strict";

class BrowserInfo {
  getBrowserName() {
    const {
      userAgentData,
      userAgent
    } = navigator;
    const brands = userAgentData?.brands.map(({
      brand
    }) => brand) || [];
    if (userAgent.includes('Edg') && brands.includes('Microsoft Edge')) {
      return 'Edge';
    }
    if (userAgent.includes('OPR') && brands.includes('Opera')) {
      return 'Opera';
    }
    if (brands.includes('Brave')) {
      return 'Brave';
    }
    if (userAgent.includes('Chrome') && brands.includes('Google Chrome')) {
      return 'Chrome';
    }
    if (userAgent.includes('Safari')) {
      return 'Safari';
    }
    if (userAgent.includes('Firefox')) {
      return 'Firefox';
    }
    if (brands.includes('Chromium')) {
      return 'Vivaldi';
    }
    return 'Unknown';
  }
  getBrowserVersion() {
    let browserVersion = -1;
    const regex = {
      Chrome: /Chrome\/([0-9]*)/,
      Vivaldi: /Vivaldi\/([0-9]*)/,
      Edge: /Edg\/([0-9]*)/,
      Safari: /Version\/([0-9]*)/,
      Opera: /OPR\/([0-9]*)/,
      Firefox: /Firefox\/([0-9]*)/,
      Brave: /Chrome\/([0-9]*)/
    }[this.getBrowserName()];
    const matches = regex?.exec(navigator.userAgent);
    if (matches?.[1]) {
      browserVersion = parseInt(matches[1], 10);
      if (Number.isNaN(browserVersion)) {
        browserVersion = -1;
      }
    }
    return browserVersion;
  }
  getBrowserStoreUrl() {
    return 'https://chromewebstore.google.com/';
  }
  getExtensionsUrl() {
    return {
      Chrome: 'chrome://extensions/',
      Vivaldi: 'vivaldi://extensions/',
      Edge: 'edge://extensions/',
      Opera: 'opera://extensions',
      Firefox: 'about:addons',
      Brave: 'brave://extensions/'
    }[this.getBrowserName()];
  }
  getRateUrl() {
    return 'https://chromewebstore.google.com/detail/stands-adblocker/lgblnfidahcdcjddiepkckcfdhpknnjh/reviews';
  }
}
const browserInfo = new BrowserInfo();