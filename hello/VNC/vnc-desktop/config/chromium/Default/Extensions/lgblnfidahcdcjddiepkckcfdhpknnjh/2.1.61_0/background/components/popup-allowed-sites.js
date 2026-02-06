"use strict";

class PopupAllowedSites {
  container = new DataContainer('popupAllowedSites', {});
  async add(host) {
    const data = await this.container.get();
    data[host] = true;
    await this.container.set(data);
  }
  async remove(host) {
    const data = await this.container.get();
    delete data[host];
    await this.container.set(data);
  }
  async toggle(host) {
    const data = await this.container.get();
    if (data[host]) {
      await this.remove(host);
    } else {
      await this.add(host);
    }
  }
  async getList() {
    const data = await this.container.get();
    return Object.keys(data);
  }
  async isAllowed(host) {
    const data = await this.container.get();
    return data[host];
  }
}
const popupAllowedSites = new PopupAllowedSites();