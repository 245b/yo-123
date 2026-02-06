"use strict";

class DataContainer {
  defaultValue;
  name;
  value = null;
  constructor(name, defaultValue) {
    this.name = name;
    this.defaultValue = defaultValue;
  }
  async get() {
    if (this.value) {
      return this.value;
    }
    const storedValue = await storageService.get(this.name);
    if (storedValue) {
      this.value = storedValue;
      return storedValue;
    }
    return this.defaultValue;
  }
  async set(value) {
    try {
      this.value = value;
      await storageService.set(this.name, value);
    } catch (e) {
      debug.error(`Error storing ${this.name}: ${e.message}`);
    }
  }
}