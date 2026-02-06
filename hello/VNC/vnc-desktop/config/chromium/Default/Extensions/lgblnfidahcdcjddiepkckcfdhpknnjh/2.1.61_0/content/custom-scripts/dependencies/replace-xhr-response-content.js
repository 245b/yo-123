"use strict";

function replaceXhrResponseContent(pattern = '', replacement = '', propsToMatch = '', ...args) {
  const safe = safeSelf();
  const xhrDetailsMap = new WeakMap();
  if (pattern === '*') {
    pattern = '.*';
  }
  const responsePatternRegex = safe.patternToRegex(pattern);
  const propertyNeedles = createPropertyMatchMap(propsToMatch, 'url');
  const extraArgs = safe.getExtraArgs(Array.from(args), 3);
  const reIncludes = extraArgs.includes ? safe.patternToRegex(extraArgs.includes) : null;
  self.XMLHttpRequest = class extends self.XMLHttpRequest {
    open(method, url) {
      const currentXhr = this;
      const xhrDetails = {
        method,
        url
      };
      let matchOutcome = 'match';
      if (propertyNeedles.size !== 0) {
        if (!doesObjectMatchProperties(propertyNeedles, xhrDetails)) {
          matchOutcome = 'nomatch';
        }
      }
      if (matchOutcome === 'match') {
        xhrDetailsMap.set(currentXhr, xhrDetails);
      }
      return super.open(method, url);
    }
    get response() {
      const originalResponse = super.response;
      const xhrDetails = xhrDetailsMap.get(this);
      if (xhrDetails === undefined) {
        return originalResponse;
      }
      const responseLength = typeof originalResponse === 'string' ? originalResponse.length : undefined;
      if (xhrDetails.lastResponseLength !== responseLength) {
        xhrDetails.response = undefined;
        xhrDetails.lastResponseLength = responseLength;
      }
      if (xhrDetails.response !== undefined) {
        return xhrDetails.response;
      }
      if (typeof originalResponse !== 'string') {
        xhrDetails.response = originalResponse;
        return originalResponse;
      }
      if (reIncludes && reIncludes.test(originalResponse) === false) {
        xhrDetails.response = originalResponse;
        return originalResponse;
      }
      const modifiedResponse = originalResponse.replace(responsePatternRegex, replacement);
      xhrDetails.response = modifiedResponse;
      return modifiedResponse;
    }
    get responseText() {
      const {
        response
      } = this;
      if (typeof response !== 'string') {
        return super.responseText;
      }
      return response;
    }
  };
}