"use strict";

class DataUpdaterFromServer {
  key;
  expiration;
  url;
  constructor(settings) {
    this.key = settings.name;
    this.expiration = settings.expiration;
    this.url = settings.url;
  }
  async start() {
    jobRunner.addJob(`${this.key}-load-data`, this.loadData.bind(this), 60 * 8);
    await this.loadData();
  }
  async loadData() {
    const date = await storageService.get(`${this.key}Date`);
    if (date && (new Date().getTime() - new Date(date).getTime()) / (1000 * 60) < this.expiration) {
      return;
    }
    const key1 = await loadAnonyId();
    const {
      data,
      error
    } = await serverApi.callUrl({
      url: `${this.url}?key1=${key1}&app_version=${getAppVersion()}`
    });
    if (data) {
      await Promise.all([storageService.set(`${this.key}Value`, data), storageService.set(`${this.key}Date`, new Date().toISOString())]);
    }
    if (error) {
      serverLogger.logError(error, 'DataUpdaterFromServer.loadData');
    }
  }
}