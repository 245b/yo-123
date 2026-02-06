"use strict";

function replaceFetchResponseContent(pattern = '', replacement = '', propertiesToMatch = '', ...args) {
  const safe = safeSelf();
  if (pattern === '*') {
    pattern = '.*';
  }
  const rePattern = safe.patternToRegex(pattern);
  const propNeedles = createPropertyMatchMap(propertiesToMatch, 'url');
  const extraArgs = safe.getExtraArgs(Array.from(args), 4);
  const reIncludes = extraArgs.includes ? safe.patternToRegex(extraArgs.includes) : null;
  self.fetch = new Proxy(self.fetch, {
    apply(target, thisArg, params) {
      const fetchPromise = Reflect.apply(target, thisArg, params);
      if (pattern === '') {
        return fetchPromise;
      }
      let outcome = 'match';
      if (propNeedles.size !== 0) {
        const objs = [params[0] instanceof Object ? params[0] : {
          url: params[0]
        }];
        if (objs[0] instanceof Request) {
          try {
            objs[0] = safe.Request_clone.call(objs[0]);
          } catch (ex) {}
        }
        if (params[1] instanceof Object) {
          objs.push(params[1]);
        }
        if (!doesObjectMatchProperties(propNeedles, ...objs)) {
          outcome = 'nomatch';
        }
      }
      if (outcome === 'nomatch') {
        return fetchPromise;
      }
      return fetchPromise.then(responseBefore => {
        const response = responseBefore.clone();
        return response.text().then(textBefore => {
          if (reIncludes && reIncludes.test(textBefore) === false) {
            return responseBefore;
          }
          const textAfter = textBefore.replace(rePattern, replacement);
          const finalOutcome = textAfter !== textBefore ? 'match' : 'nomatch';
          if (finalOutcome === 'nomatch') {
            return responseBefore;
          }
          const responseAfter = new Response(textAfter, {
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
        }).catch(() => responseBefore);
      }).catch(() => fetchPromise);
    }
  });
}