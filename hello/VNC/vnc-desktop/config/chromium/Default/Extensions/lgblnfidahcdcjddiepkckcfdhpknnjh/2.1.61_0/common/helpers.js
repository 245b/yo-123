"use strict";

function getUrlHost(url) {
  try {
    if (url === 'about:blank') {
      return 'about:blank';
    }
    const urlDetails = new URL(url);
    return urlDetails.hostname.startsWith('www.') ? urlDetails.hostname.substring(4) : urlDetails.hostname;
  } catch (e) {
    return '';
  }
}
function debounce(func, ms) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = window.setTimeout(() => func(...args), ms);
  };
}