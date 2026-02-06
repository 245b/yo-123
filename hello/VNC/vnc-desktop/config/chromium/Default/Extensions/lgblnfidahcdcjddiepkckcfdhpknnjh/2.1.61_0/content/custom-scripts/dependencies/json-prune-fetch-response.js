"use strict";

function jsonPruneFetchResponse(rawPrunePaths = '', rawNeedlePaths = '', ...rest) {
  const safe = safeSelf();
  const logPrefix = safe.makeLogPrefix('json-prune-fetch-response', rawPrunePaths, rawNeedlePaths);
  const extraArgs = safe.getExtraArgs(Array.from(arguments), 2);
  const propNeedles = createPropertyMatchMap(extraArgs.propsToMatch, 'url');
  const stackNeedle = safe.initPattern(extraArgs.stackToMatch || '', {
    canNegate: true
  });
  const logall = rawPrunePaths === '';
  self.fetch = new Proxy(self.fetch, {
    apply(target, thisArg, args) {
      const fetchPromise = Reflect.apply(target, thisArg, args);
      let outcome = logall ? 'nomatch' : 'match';
      if (propNeedles.size !== 0) {
        const objs = [args[0] instanceof Object ? args[0] : {
          url: args[0]
        }];
        if (objs[0] instanceof Request) {
          try {
            objs[0] = safe.Request_clone.call(objs[0]);
          } catch (ex) {
            safe.stndzErr(logPrefix, 'Error:', ex);
          }
        }
        if (args[1] instanceof Object) {
          objs.push(args[1]);
        }
        if (!doesObjectMatchProperties(propNeedles, ...objs)) {
          outcome = 'nomatch';
        }
      }
      if (!logall && outcome === 'nomatch') {
        return fetchPromise;
      }
      if (safe.logLevel > 1 && outcome !== 'nomatch' && propNeedles.size !== 0) {
        safe.stndzLog(logPrefix, `Matched optional "propsToMatch"\n${extraArgs.propsToMatch}`);
      }
      return fetchPromise.then(responseBefore => {
        const response = responseBefore.clone();
        return response.json().then(objBefore => {
          if (typeof objBefore !== 'object') {
            return responseBefore;
          }
          if (logall) {
            safe.stndzLog(logPrefix, safe.JSON_stringify(objBefore, null, 2));
            return responseBefore;
          }
          const objAfter = pruneObject(objBefore, rawPrunePaths, rawNeedlePaths, stackNeedle);
          if (typeof objAfter !== 'object') {
            return responseBefore;
          }
          safe.stndzLog(logPrefix, 'Pruned');
          const responseAfter = Response.json(objAfter, {
            status: responseBefore.status,
            statusText: responseBefore.statusText,
            headers: responseBefore.headers
          });
          Object.defineProperties(responseAfter, {
            ok: {
              value: responseBefore.ok
            },
            redirected: {
              value: responseBefore.redirected
            },
            type: {
              value: responseBefore.type
            },
            url: {
              value: responseBefore.url
            }
          });
          return responseAfter;
        }).catch(reason => {
          safe.stndzErr(logPrefix, 'Error:', reason);
          return responseBefore;
        });
      }).catch(reason => {
        safe.stndzErr(logPrefix, 'Error:', reason);
        return fetchPromise;
      });
    }
  });
}