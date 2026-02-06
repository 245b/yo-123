"use strict";

class DataProcessingConsent {
  container = new DataContainer('dataProcessingConsent', {
    hasConsent: "chrome" !== 'firefox'
  });
  async getConsent() {
    const data = await this.container.get();
    return data.hasConsent;
  }
  async setConsent(hasConsent) {
    await this.container.set({
      hasConsent
    });
  }
}
const dataProcessingConsent = new DataProcessingConsent();