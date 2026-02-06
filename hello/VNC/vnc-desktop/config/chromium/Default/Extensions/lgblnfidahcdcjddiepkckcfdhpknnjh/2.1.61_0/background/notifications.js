"use strict";

const NOTIFICATION_STATUSES = {
  nothing: 'NOTHING',
  ready: 'READY',
  forLater: 'FOR-LATER',
  done: 'DONE'
};
class Notifications {
  container = new DataContainer('notifications', {
    notifications: {
      rate: {
        status: NOTIFICATION_STATUSES.ready,
        lastShown: 0
      }
    }
  });
  clickedNotifications = new Set();
  async showNotification(type, options) {
    const data = await this.container.get();
    const notification = data.notifications[type];
    if (notification) {
      notification.lastShown = new Date().getTime();
      data.notifications[type] = notification;
      await this.container.set(data);
    }
    await createNotification(JSON.stringify({
      type,
      rand: Math.random()
    }), {
      type: 'basic',
      iconUrl: getExtensionRelativeUrl('/icons/128.png'),
      priority: 2,
      ...options
    });
  }
  async init() {
    await this.checkRateNotification();
  }
  async checkRateNotification() {
    const [data, stats] = await Promise.all([this.container.get(), statistics.getSummary()]);
    const notification = data.notifications.rate;
    if (!notification || Date.now() - notification.lastShown < 24 * 60 * 60 * 1000) {
      return;
    }
    const {
      ads,
      popups
    } = stats.blocking;
    const shouldShowNotification = notification.status === NOTIFICATION_STATUSES.ready && ads + popups > 5000 || notification.status === NOTIFICATION_STATUSES.forLater && ads + popups > 10000;
    if (shouldShowNotification) {
      await this.changeNotificationStatus('rate', notification.status === NOTIFICATION_STATUSES.ready ? NOTIFICATION_STATUSES.forLater : NOTIFICATION_STATUSES.nothing);
      await this.showRateNotification(ads, popups);
    }
  }
  async showRateNotification(statAds, statPopups) {
    await this.showNotification('rate', {
      title: getLocalizedText('you_blocked_ads_popups', [String(statAds), String(statPopups)]),
      message: getLocalizedText('rate_stands_adblocker'),
      buttons: [{
        title: 'Rate',
        iconUrl: getExtensionRelativeUrl('/icons/rate-star.png')
      }, {
        title: getLocalizedText('close')
      }]
    });
  }
  async changeNotificationStatus(type, status) {
    const data = await this.container.get();
    const notification = data.notifications[type];
    if (notification) {
      notification.status = status;
      data.notifications[type] = notification;
      await this.container.set(data);
    }
  }
  async onClick(notificationId, buttonIndex = 0) {
    this.clickedNotifications.add(notificationId);
    const {
      type
    } = JSON.parse(notificationId);
    if (buttonIndex === 0) {
      await this.changeNotificationStatus(type, NOTIFICATION_STATUSES.done);
      serverLogger.logNotificationClicked(type);
      if (type === 'rate') {
        await openTabWithUrl(browserInfo.getRateUrl());
      }
    } else {
      await this.changeNotificationStatus(type, NOTIFICATION_STATUSES.nothing);
      serverLogger.logNotificationClosed(type);
    }
    await clearNotification(notificationId);
  }
  async onClosed(notificationId) {
    if (this.clickedNotifications.has(notificationId)) {
      this.clickedNotifications.delete(notificationId);
      return;
    }
    const {
      type
    } = JSON.parse(notificationId);
    await this.changeNotificationStatus(type, NOTIFICATION_STATUSES.nothing);
    serverLogger.logNotificationClosed(type);
  }
  async onShown(notificationId) {
    const {
      type
    } = JSON.parse(notificationId);
    await this.changeNotificationStatus(type, NOTIFICATION_STATUSES.done);
    serverLogger.logNotificationShown(type);
  }
}
const notifications = new Notifications();