"use strict";

function doesObjectMatchProperties(propNeedles, ...objs) {
  const self = doesObjectMatchProperties;
  if (self.extractProperties === undefined) {
    self.extractProperties = (src, des, props) => {
      for (const p of props) {
        const v = src[p];
        if (v === undefined) {
          continue;
        }
        des[p] = src[p];
      }
    };
  }
  const safe = safeSelf();
  const haystack = {};
  const props = safe.Array_from(propNeedles.keys());
  for (const obj of objs) {
    if (obj instanceof Object === false) {
      continue;
    }
    self.extractProperties(obj, haystack, props);
  }
  for (const [prop, details] of propNeedles) {
    let value = haystack[prop];
    if (value === undefined) {
      continue;
    }
    if (typeof value !== 'string') {
      try {
        value = safe.JSON_stringify(value);
      } catch (ex) {}
      if (typeof value !== 'string') {
        continue;
      }
    }
    if (safe.testPattern(details, value)) {
      continue;
    }
    return false;
  }
  return true;
}