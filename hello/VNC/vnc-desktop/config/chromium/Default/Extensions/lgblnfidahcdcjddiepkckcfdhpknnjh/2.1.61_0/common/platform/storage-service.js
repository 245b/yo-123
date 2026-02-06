"use strict";

const storageService = {
  set: (key, value, storageName = 'local') => browser.storage[storageName].set({
    [key]: value
  }),
  get: async (key, storageName = 'local') => {
    const data = await browser.storage[storageName].get(key);
    return data[key] || null;
  },
  remove: (keys, storageName = 'local') => browser.storage[storageName].remove(keys),
  keys: async (storageName = 'local') => {
    const data = await browser.storage[storageName].get();
    return Object.keys(data);
  }
};