"use strict";

class UserDataComponent {
  container = new DataContainer('userData', null);
  initializer = Promise.withResolvers();
  initialized = false;
  defaultSettings = {
    blockTracking: true,
    blockPopups: true,
    enabled: true,
    guidedSetup: true,
    blockMalicious: true
  };
  async updateData(data) {
    const userData = await this.container.get();
    if (userData) {
      await this.container.set({
        ...userData,
        ...data
      });
    }
  }
  async getSettings() {
    const data = await this.container.get();
    return data?.settings || this.defaultSettings;
  }
  async getGeo() {
    const data = await this.container.get();
    return data?.geo || '';
  }
  async getData() {
    const hasConsent = await dataProcessingConsent.getConsent();
    if (!hasConsent) {
      return null;
    }
    await this.init();
    await this.initializer.promise;
    return this.container.get();
  }
  async createUser() {
    const anonymousUserId = await loadAnonyId();
    const result = await serverApi.callUrl({
      url: API_URLS.user,
      method: 'POST',
      data: {
        anonymousUserId
      }
    });
    if (result.data?.privateUserId) {
      await this.container.set({
        ...result.data,
        settings: result.data.settings || this.defaultSettings
      });
    }
  }
  async init() {
    if (this.initialized) {
      return;
    }
    this.initialized = true;
    const data = await this.container.get();
    if (!data) {
      await this.createUser();
    }
    this.initializer.resolve();
  }
}
const userData = new UserDataComponent();