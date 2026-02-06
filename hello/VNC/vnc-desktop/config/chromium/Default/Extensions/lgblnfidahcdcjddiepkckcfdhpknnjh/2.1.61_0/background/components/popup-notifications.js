"use strict";

class PopupShowNotificationList {
  container = new DataContainer('popupShowNotificationList', {});
  async getValueByHost(host) {
    const data = await this.container.get();
    return data[host];
  }
  async setValueByHost(host, value) {
    const data = await this.container.get();
    data[host] = value;
    await this.container.set(data);
  }
  async removeValueByHost(host) {
    const data = await this.container.get();
    delete data[host];
    await this.container.set(data);
  }
}
const popupShowNotificationList = new PopupShowNotificationList();