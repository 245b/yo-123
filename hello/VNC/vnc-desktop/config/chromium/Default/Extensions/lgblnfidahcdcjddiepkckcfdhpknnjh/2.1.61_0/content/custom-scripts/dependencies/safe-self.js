"use strict";

const {
  scriptletGlobals
} = window;
function safeSelf() {
  if (scriptletGlobals.safeSelf) {
    return scriptletGlobals.safeSelf;
  }
  const self = globalThis;
  const safe = {
    Array_from: Array.from,
    Error: self.Error,
    Function_toStringFn: self.Function.prototype.toString,
    Function_toString: thisArg => safe.Function_toStringFn.call(thisArg),
    Math_floor: Math.floor,
    Math_max: Math.max,
    Math_min: Math.min,
    Math_random: Math.random,
    Object,
    Object_defineProperty: Object.defineProperty.bind(Object),
    Object_defineProperties: Object.defineProperties.bind(Object),
    Object_fromEntries: Object.fromEntries.bind(Object),
    Object_getOwnPropertyDescriptor: Object.getOwnPropertyDescriptor.bind(Object),
    RegExp: self.RegExp,
    RegExp_test: self.RegExp.prototype.test,
    RegExp_exec: self.RegExp.prototype.exec,
    Request_clone: self.Request.prototype.clone,
    String_fromCharCode: String.fromCharCode,
    XMLHttpRequest: self.XMLHttpRequest,
    addEventListener: self.EventTarget.prototype.addEventListener,
    removeEventListener: self.EventTarget.prototype.removeEventListener,
    fetch: self.fetch,
    JSON: self.JSON,
    JSON_parseFn: self.JSON.parse,
    JSON_stringifyFn: self.JSON.stringify,
    JSON_parse: (...args) => safe.JSON_parseFn.call(safe.JSON, ...args),
    JSON_stringify: (...args) => safe.JSON_stringifyFn.call(safe.JSON, ...args),
    logLevel: 0,
    makeLogPrefix(...args) {
      return `[${args.join(' \u205D ')}]`;
    },
    sendToLogger(type, ...args) {},
    stndzLog(...args) {
      if (this.sendToLogger === undefined) {
        return;
      }
      if (args === undefined || args[0] === '') {
        return;
      }
      return this.sendToLogger('info', ...args);
    },
    stndzErr(...args) {
      if (this.sendToLogger === undefined) {
        return;
      }
      if (args === undefined || args[0] === '') {
        return;
      }
      return this.sendToLogger('error', ...args);
    },
    escapeRegexChars(s) {
      return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    },
    initPattern(pattern, options = {}) {
      if (pattern === '') {
        return {
          matchAll: true
        };
      }
      const expect = options.canNegate !== true || pattern.startsWith('!') === false;
      if (expect === false) {
        pattern = pattern.slice(1);
      }
      const match = /^\/(.+)\/([gimsu]*)$/.exec(pattern);
      if (match !== null) {
        return {
          re: new this.RegExp(match[1], match[2] || options.flags),
          expect
        };
      }
      if (options.flags !== undefined) {
        return {
          re: new this.RegExp(this.escapeRegexChars(pattern), options.flags),
          expect
        };
      }
      return {
        pattern,
        expect
      };
    },
    testPattern(details, haystack) {
      if (details.matchAll) {
        return true;
      }
      if (details.re) {
        return this.RegExp_test.call(details.re, haystack) === details.expect;
      }
      return haystack.includes(details.pattern) === details.expect;
    },
    patternToRegex(pattern, flags = undefined, verbatim = false) {
      if (pattern === '') {
        return /^/;
      }
      const match = /^\/(.+)\/([gimsu]*)$/.exec(pattern);
      if (match === null) {
        const reStr = this.escapeRegexChars(pattern);
        return new RegExp(verbatim ? `^${reStr}$` : reStr, flags);
      }
      try {
        return new RegExp(match[1], match[2] || undefined);
      } catch (ex) {}
      return /^/;
    },
    getExtraArgs(args, offset = 0) {
      const entries = args.slice(offset).reduce((out, v, i, a) => {
        if ((i & 1) === 0) {
          const rawValue = a[i + 1];
          const value = /^\d+$/.test(rawValue) ? parseInt(rawValue, 10) : rawValue;
          out.push([a[i], value]);
        }
        return out;
      }, []);
      return this.Object_fromEntries(entries);
    },
    onIdle(fn, options) {
      if (self.requestIdleCallback) {
        return self.requestIdleCallback(fn, options);
      }
      return self.requestAnimationFrame(fn);
    }
  };
  scriptletGlobals.safeSelf = safe;
  return safe;
}