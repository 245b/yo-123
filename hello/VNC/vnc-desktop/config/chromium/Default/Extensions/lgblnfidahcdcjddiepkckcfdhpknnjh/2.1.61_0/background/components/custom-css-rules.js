"use strict";

class CustomCssRules {
  container = new DataContainer('customCssRules', {});
  async add(host, info) {
    const data = await this.container.get();
    data[host] = info.map(i => `${i.selector}@@@${i.amount}`);
    await this.container.set(data);
  }
  async remove(host) {
    const data = await this.container.get();
    delete data[host];
    await this.container.set(data);
  }
  async getData() {
    return this.container.get();
  }
  async getCssRules(host) {
    const data = await this.container.get();
    const selectors = data[host]?.map(rule => rule.split('@@@')[0]);
    return selectors ? `${selectors.join(', ')} ${BLOCK_CSS_VALUE}` : undefined;
  }
  async countRulesOnTab(tabId) {
    const [data, frames] = await Promise.all([this.container.get(), getAllFrames(tabId)]);
    return frames?.reduce((acc, frame) => {
      const host = getUrlHost(frame.url);
      if (host) {
        for (const selector of data[host] || []) {
          acc += Number(selector.split('@@@')[1]);
        }
      }
      return acc;
    }, 0) || 0;
  }
}
const customCssRules = new CustomCssRules();