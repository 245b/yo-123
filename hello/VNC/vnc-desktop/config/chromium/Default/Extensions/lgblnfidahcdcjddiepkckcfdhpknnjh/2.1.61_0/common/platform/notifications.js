"use strict";

async function createNotification(notificationId, options) {
  const opts = {
    ...options
  };
  return browser.notifications.create(notificationId, opts);
}
async function clearNotification(notificationId) {
  return browser.notifications.clear(notificationId);
}