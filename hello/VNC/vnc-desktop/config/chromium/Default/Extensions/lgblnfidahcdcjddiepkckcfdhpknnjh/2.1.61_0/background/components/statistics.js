"use strict";

function getDateString(date) {
  return new Date(date).toISOString().split('T')[0];
}
class Statistics {
  container = new DataContainer('statistics', {});
  getCoefficient(type) {
    if (type === BLOCK_TYPES.ad) {
      return 0.05;
    }
    if (type === BLOCK_TYPES.tracker) {
      return 0.01;
    }
    return 1;
  }
  fillMissingDates(obj) {
    const dates = Object.keys(obj).map(date => new Date(date)).sort((a, b) => a.getTime() - b.getTime());
    const lastDate = dates.at(-1);
    if (lastDate) {
      const currentDate = new Date(dates[0]);
      while (currentDate < lastDate) {
        const isoDate = getDateString(currentDate);
        if (!obj[isoDate]) {
          obj[isoDate] = {
            ads: 0,
            trackers: 0,
            popups: 0,
            cookieBanners: 0
          };
        }
        currentDate.setDate(currentDate.getDate() + 1);
      }
    }
  }
  async processBlockingData() {
    const data = await this.container.get();
    const today = getDateString(new Date());
    const result = {
      daily: {},
      total: {
        ads: 0,
        trackers: 0,
        popups: 0,
        cookieBanners: 0
      },
      today: 0
    };
    for (const date in data) {
      if (Number.isNaN(Date.parse(date))) {
        continue;
      }
      result.daily[date] = {
        ads: data[date].ads || 0,
        trackers: data[date].trackers || 0,
        popups: data[date].popups || 0,
        cookieBanners: data[date].cookieBanners || 0
      };
      result.total.ads += data[date].ads || 0;
      result.total.trackers += data[date].trackers || 0;
      result.total.popups += data[date].popups || 0;
      result.total.cookieBanners += data[date].cookieBanners || 0;
      if (date === today) {
        result.today = (data[date].ads || 0) + (data[date].trackers || 0) + (data[date].popups || 0) + (data[date].cookieBanners || 0);
      }
    }
    return result;
  }
  async incrementBlock({
    typeId,
    tabId,
    amount
  }) {
    const [hasConsent, pageData] = await Promise.all([dataProcessingConsent.getConsent(), pageDataComponent.getData(tabId)]);
    if (!hasConsent || !pageData) {
      return;
    }
    const day = getDateString(new Date());
    const data = await this.container.get();
    data[day] = data[day] || {};
    if (typeId === BLOCK_TYPES.ad) {
      data[day].ads = (data[day].ads || 0) + amount;
      pageData.stats.ads += amount;
    }
    if (typeId === BLOCK_TYPES.popup) {
      data[day].popups = (data[day].popups || 0) + amount;
      pageData.stats.popups += amount;
    }
    if (typeId === BLOCK_TYPES.tracker) {
      data[day].trackers = (data[day].trackers || 0) + amount;
      pageData.stats.trackers += amount;
    }
    if (typeId === BLOCK_TYPES.cookieBanner) {
      data[day].cookieBanners = (data[day].cookieBanners || 0) + amount;
      pageData.stats.cookieBanners += amount;
    }
    pageData.stats.total += amount;
    pageData.stats.timeSaved += amount * this.getCoefficient(typeId);
    await Promise.all([pageDataComponent.updateData(tabId, pageData), this.container.set(data)]);
  }
  async getBlockingData() {
    const result = await this.processBlockingData();
    this.fillMissingDates(result.daily);
    return result;
  }
  async getSummary() {
    const data = await this.processBlockingData();
    return {
      today: data.today,
      total: data.total.ads + data.total.trackers + data.total.popups + data.total.cookieBanners,
      blocking: data.total,
      timeSaved: data.total.ads * this.getCoefficient(BLOCK_TYPES.ad) + data.total.trackers * this.getCoefficient(BLOCK_TYPES.tracker) + data.total.popups * this.getCoefficient(BLOCK_TYPES.popup) + data.total.cookieBanners * this.getCoefficient(BLOCK_TYPES.cookieBanner)
    };
  }
}
const statistics = new Statistics();