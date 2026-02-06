"use strict";

function pruneObject(obj, rawPrunePaths, rawNeedlePaths, stackNeedleDetails) {
  const self = pruneObject;
  const prunePaths = rawPrunePaths !== '' ? rawPrunePaths.split(/ +/) : [];
  const needlePaths = prunePaths.length !== 0 && rawNeedlePaths !== '' ? rawNeedlePaths.split(/ +/) : [];
  if (!stackNeedleDetails.matchAll) {
    if (!matchesStackTrace(stackNeedleDetails)) {
      return;
    }
  }
  if (self.mustProcess === undefined) {
    self.mustProcess = (root, needlePathsVal) => {
      for (const needlePath of needlePathsVal) {
        if (!findObjectOwner(root, needlePath)) {
          return false;
        }
      }
      return true;
    };
  }
  if (prunePaths.length === 0) {
    return;
  }
  let outcome = 'nomatch';
  if (self.mustProcess(obj, needlePaths)) {
    for (const path of prunePaths) {
      if (findObjectOwner(obj, path, true)) {
        outcome = 'match';
      }
    }
  }
  if (outcome === 'match') {
    return obj;
  }
}