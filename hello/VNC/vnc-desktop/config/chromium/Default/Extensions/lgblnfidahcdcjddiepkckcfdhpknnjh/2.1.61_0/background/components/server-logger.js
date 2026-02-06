"use strict";

class ServerLogger {
  container = new DataContainer('logEvents', []);
  async sendToServer(events) {
    try {
      const [user, anonymousUserId, hasManagementPermissions] = await Promise.all([userData.getData(), loadAnonyId(), hasPermission('management')]);
      let extensions = [];
      if (hasManagementPermissions) {
        extensions = await getAllExtensions();
      }
      const data = {
        privateUserId: user?.privateUserId,
        anonymousUserId,
        installedExtensions: extensions.map(({
          id
        }) => id),
        appVersion: getAppVersion(),
        extensionId: getExtensionId(),
        events
      };
      const {
        error
      } = await serverApi.callUrl({
        url: API_URLS.log,
        method: 'POST',
        data
      });
      if (error) {
        throw error;
      }
    } catch (e) {
      const data = await this.container.get();
      await this.container.set([...data, ...events]);
      this.logError(e, 'ServerLogger.sendToServer', true);
    }
  }
  async prepareAndSend(sendImmediately) {
    const hasConsent = await dataProcessingConsent.getConsent();
    if (!hasConsent) {
      return;
    }
    const data = await this.container.get();
    if (data.length >= 10 || sendImmediately && data.length) {
      const logs = data.splice(0, 10);
      await this.container.set(data);
      await this.sendToServer(logs);
    }
  }
  async log(event, sendImmediately = false, storeOnly = false) {
    const now = new Date();
    now.setUTCHours(now.getHours(), now.getMinutes(), now.getSeconds(), 0);
    const logObj = {
      ...event,
      eventTime: now.toISOString()
    };
    const logs = await this.container.get();
    await this.container.set([...logs, logObj]);
    if (!storeOnly) {
      await this.prepareAndSend(sendImmediately);
    }
  }
  logInstall() {
    this.log({
      eventType: 4
    }, true);
  }
  logUpdate(details) {
    const event = {
      eventType: 5,
      reason: details.reason,
      previousVersion: details.previousVersion || ''
    };
    this.log(event, true);
  }
  logError(error, source, storeOnly = false) {
    debug.error(`Error ${error.message} from ${source}`);
    const event = {
      eventType: 3,
      source,
      message: encodeURIComponent((error.message || '').replace('\n', '')),
      stack: encodeURIComponent((error.stack || '').replace('\n', ''))
    };
    this.log(event, false, storeOnly);
  }
  logStateChange(enabled, url) {
    const event = {
      eventType: 6,
      state: enabled ? 'enabled' : 'disabled',
      url
    };
    this.log(event);
  }
  logBlockingSettingsChange(type, state) {
    const event = {
      eventType: 7,
      type,
      state: state ? 'enabled' : 'disabled'
    };
    this.log(event);
  }
  logWhitelistChange(url, type, state) {
    const event = {
      eventType: 8,
      type,
      state: state ? 'added' : 'removed',
      url
    };
    this.log(event);
  }
  logExtensionUrlOpened(url) {
    this.log({
      eventType: 9,
      url
    });
  }
  logNotificationShown(type) {
    this.log({
      eventType: 10,
      type
    });
  }
  logNotificationClicked(type) {
    this.log({
      eventType: 11,
      type
    });
  }
  logNotificationClosed(type) {
    this.log({
      eventType: 12,
      type
    });
  }
  logUrlFilteringHappened(type, bUrl) {
    this.log({
      eventType: 15,
      type,
      bUrl
    });
  }
}
const serverLogger = new ServerLogger();