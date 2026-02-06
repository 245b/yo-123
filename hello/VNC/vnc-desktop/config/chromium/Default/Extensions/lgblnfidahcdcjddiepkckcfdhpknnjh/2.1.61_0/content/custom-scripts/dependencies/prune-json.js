"use strict";

function pruneJson(rawPrunePaths = '', rawNeedlePaths = '', stackNeedle = '') {
  const safe = safeSelf();
  const stackNeedleDetails = safe.initPattern(stackNeedle, {
    canNegate: true
  });
  JSON.parse = new Proxy(JSON.parse, {
    apply: function (target, thisArg, args) {
      const objBefore = Reflect.apply(target, thisArg, args);
      const objAfter = pruneObject(objBefore, rawPrunePaths, rawNeedlePaths, stackNeedleDetails);
      return objAfter === undefined ? objBefore : objAfter;
    }
  });
}