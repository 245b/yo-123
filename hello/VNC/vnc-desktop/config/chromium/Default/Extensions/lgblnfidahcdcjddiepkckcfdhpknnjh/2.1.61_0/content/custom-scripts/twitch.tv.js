"use strict";
(function () {
  'use strict';

  let browser;
  try {
    const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    browser = {
      window: win,
      document: win.document,
      location: win.document.location,
      navigator: win.navigator,
      console: {},
      querySelector: win.document.querySelector.bind(win.document),
      querySelectorAll: win.document.querySelectorAll.bind(win.document),
      getAttribute: Function.prototype.call.bind(HTMLElement.prototype.getAttribute),
      setAttribute: Function.prototype.call.bind(HTMLElement.prototype.setAttribute),
      removeAttribute: Function.prototype.call.bind(HTMLElement.prototype.removeAttribute),
      defineProperty: Object.defineProperty,
      MutationObserver: win.MutationObserver
    };
    Object.keys(browser.window.console).forEach(name => {
      browser.console[name] = browser.window.console[name];
    });
  } catch (_unused) {
    browser = {};
  }
  const browser$1 = browser;
  function unwrapExports(x) {
    return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
  }
  function createCommonjsModule(fn, module) {
    return module = {
      exports: {}
    }, fn(module, module.exports), module.exports;
  }
  const _typeof_1 = createCommonjsModule(function (module) {
    function _typeof(o) {
      '@babel/helpers - typeof';

      return module.exports = _typeof = 'function' == typeof Symbol && 'symbol' == typeof Symbol.iterator ? function (o) {
        return typeof o;
      } : function (o) {
        return o && 'function' == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? 'symbol' : typeof o;
      }, module.exports.__esModule = true, module.exports['default'] = module.exports, _typeof(o);
    }
    module.exports = _typeof, module.exports.__esModule = true, module.exports['default'] = module.exports;
  });
  unwrapExports(_typeof_1);
  const toPrimitive_1 = createCommonjsModule(function (module) {
    const _typeof = _typeof_1['default'];
    function toPrimitive(t, r) {
      if ('object' != _typeof(t) || !t) return t;
      const e = t[Symbol.toPrimitive];
      if (void 0 !== e) {
        const i = e.call(t, r || 'default');
        if ('object' != _typeof(i)) return i;
        throw new TypeError('@@toPrimitive must return a primitive value.');
      }
      return ('string' === r ? String : Number)(t);
    }
    module.exports = toPrimitive, module.exports.__esModule = true, module.exports['default'] = module.exports;
  });
  unwrapExports(toPrimitive_1);
  const toPropertyKey_1 = createCommonjsModule(function (module) {
    const _typeof = _typeof_1['default'];
    function toPropertyKey(t) {
      const i = toPrimitive_1(t, 'string');
      return 'symbol' == _typeof(i) ? i : `${i}`;
    }
    module.exports = toPropertyKey, module.exports.__esModule = true, module.exports['default'] = module.exports;
  });
  unwrapExports(toPropertyKey_1);
  const defineProperty = createCommonjsModule(function (module) {
    function _defineProperty(e, r, t) {
      return (r = toPropertyKey_1(r)) in e ? Object.defineProperty(e, r, {
        value: t,
        enumerable: !0,
        configurable: !0,
        writable: !0
      }) : e[r] = t, e;
    }
    module.exports = _defineProperty, module.exports.__esModule = true, module.exports['default'] = module.exports;
  });
  const _defineProperty = unwrapExports(defineProperty);
  const commonHosts = new class HostsMap {
    constructor(initItems) {
      _defineProperty(this, 'getHosts', () => new Map([...this.hosts]));
      _defineProperty(this, 'getPageScript', hostname => {
        let pageScript = this.hosts.get(hostname);
        if (!pageScript) {
          const domain = hostname.split('.').slice(-2).join('.');
          pageScript = this.hosts.get(`*.${domain}`);
        }
        return pageScript;
      });
      this.hosts = new Map(initItems);
    }
    setEntries(hosts, pageCallback) {
      hosts.forEach(host => {
        this.hosts.set(host, pageCallback);
      });
    }
  }();
  class UserInteractionTracker {
    constructor() {
      this.TRACKED_EVENTS = ['auxclick', 'click', 'dblclick', 'mousedown', 'mouseenter', 'mouseleave', 'mousemove', 'mouseover', 'mouseout', 'mouseup', 'wheel', 'keydown', 'keypress', 'keyup'];
      this.LAST_EVENT_TIMEOUT_MS = 10;
      this.lastEventType = '';
      this.lastEventTime = '';
      const trackEvent = event => {
        this.lastEventType = event.type;
        this.lastEventTime = Date.now();
      };
      for (let i = 0; i < this.TRACKED_EVENTS.length; i += 1) {
        document.documentElement.addEventListener(this.TRACKED_EVENTS[i], trackEvent, true);
      }
    }
    getCurrentEvent() {
      if (!this.lastEventType || !this.lastEventTime) {
        return null;
      }
      const isTimeout = Date.now() - this.lastEventTime > this.LAST_EVENT_TIMEOUT_MS;
      if (!isTimeout) {
        return this.lastEventType;
      }
      return null;
    }
  }
  function isBrowserSupported() {
    return !(navigator.userAgent && navigator.userAgent.match(/(MSIE|Trident)/));
  }
  let tracker;
  function getTracker() {
    if (!tracker) {
      tracker = new UserInteractionTracker();
    }
    return tracker;
  }
  function onDOMContentLoaded(callback) {
    if (browser$1.document.readyState === 'loading') {
      browser$1.window.addEventListener('DOMContentLoaded', callback);
    } else {
      callback();
    }
  }
  function observeDomChanges(callback) {
    const domMutationObserver = new browser$1.MutationObserver(mutations => {
      if (getTracker().getCurrentEvent()) {
        return;
      }
      callback(mutations);
    });
    domMutationObserver.observe(browser$1.document, {
      childList: true,
      subtree: true
    });
  }
  function safeGetStylesheetRules(sheet) {
    try {
      if (sheet.rules === null) {
        return [];
      }
      return sheet.rules;
    } catch (e) {
      return [];
    }
  }
  const parseEvalDecodeAtob = scriptContent => {
    if (!scriptContent) {
      return '';
    }
    const decoder = (data, key) => {
      const result = [];
      for (let i = 0; i < data.length; i += 1) {
        const xored = data.charCodeAt(i) ^ key.charCodeAt(i % key.length);
        result.push(String.fromCharCode(xored));
      }
      return result.join('');
    };
    const DATA_REGEXP = /(?!atob\(`)[A-Za-z0-9+/=]+(?=`\))/g;
    const matched = scriptContent.match(DATA_REGEXP);
    if (!matched || matched.length !== 2) {
      return '';
    }
    const [encodedData, decoderKey] = matched;
    return decodeURIComponent(decoder(atob(encodedData), decoderKey));
  };
  const hideViaDisplayProperty = node => {
    if (node) {
      node.style.setProperty('display', 'none', 'important');
    }
  };
  const hideViaPositionProperty = node => {
    if (node) {
      node.style.position = 'absolute';
      node.style.top = '-99999px';
    }
  };
  const iterateCSSRules = func => {
    [...browser$1.document.styleSheets].forEach(sheet => {
      [...safeGetStylesheetRules(sheet)].forEach(rule => {
        func(rule);
      });
    });
  };
  const hideRulesByCondition = (pattern, condition) => {
    iterateCSSRules(rule => {
      if (rule.selectorText && condition(rule.selectorText, pattern)) {
        hideViaDisplayProperty(rule);
      }
    });
  };
  const stringPatternCondition = (selector, pattern) => selector.includes(pattern);
  const regexpPatternCondition = (selector, pattern) => pattern.test(selector);
  function ownKeys$1(e, r) {
    const t = Object.keys(e);
    if (Object.getOwnPropertySymbols) {
      let o = Object.getOwnPropertySymbols(e);
      r && (o = o.filter(function (r) {
        return Object.getOwnPropertyDescriptor(e, r).enumerable;
      })), t.push.apply(t, o);
    }
    return t;
  }
  function _objectSpread$1(e) {
    for (let r = 1; r < arguments.length; r++) {
      var t = null != arguments[r] ? arguments[r] : {};
      r % 2 ? ownKeys$1(Object(t), !0).forEach(function (r) {
        _defineProperty(e, r, t[r]);
      }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys$1(Object(t)).forEach(function (r) {
        Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r));
      });
    }
    return e;
  }
  commonHosts.setEntries(['twitch.tv', 'player.twitch.tv', 'm.twitch.tv'], function pageCallback$i() {
    const TWITCH_ORIGIN = 'https://www.twitch.tv/';
    const TWITCH_GQL_HOST = 'gql.twitch.tv';
    const nativeFetch = browser$1.window.fetch;
    const twitchWorkers = [];
    const pendingFetchRequests = new Map();
    function gqlRequest(body) {
      if (!GQLDeviceID) {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i += 1) {
          GQLDeviceID += chars.charAt(Math.floor(Math.random() * chars.length));
        }
      }
      const headers = {
        'Client-ID': ClientID,
        'Client-Integrity': ClientIntegrityHeader,
        'Device-ID': GQLDeviceID,
        'X-Device-Id': GQLDeviceID,
        'Client-Version': ClientVersion,
        'Client-Session-Id': ClientSession,
        Authorization: AuthorizationHeader
      };
      return new Promise((resolve, reject) => {
        const requestId = Math.random().toString(36).substring(2, 15);
        const fetchRequest = {
          id: requestId,
          url: 'https://gql.twitch.tv/gql',
          options: {
            method: 'POST',
            body: JSON.stringify(body),
            headers
          }
        };
        pendingFetchRequests.set(requestId, {
          resolve,
          reject
        });
        postMessage({
          key: 'FetchRequest',
          value: fetchRequest
        });
      });
    }
    function parseAttributes(str) {
      return Object.fromEntries(str.split(/(?:^|,)((?:[^=]*)=(?:"[^"]*"|[^,]*))/).filter(x => !!x).map(x => {
        const idx = x.indexOf('=');
        const key = x.substring(0, idx);
        const value = x.substring(idx + 1);
        if (value.startsWith('"')) {
          return [key, JSON.parse(value)];
        }
        const num = parseInt(value, 10);
        if (!Number.isNaN(num)) {
          return [key, num];
        }
        return [key, value];
      }));
    }
    function getAccessToken(channelName, playerType) {
      const query = 'query PlaybackAccessToken_Template($login: String!, $isLive: Boolean!, $vodID: ID!, $isVod: Boolean!, $playerType: String!) {  streamPlaybackAccessToken(channelName: $login, params: {platform: "ios", playerBackend: "mediaplayer", playerType: $playerType}) @include(if: $isLive) {    value    signature    __typename  }  videoPlaybackAccessToken(id: $vodID, params: {platform: "ios", playerBackend: "mediaplayer", playerType: $playerType}) @include(if: $isVod) {    value    signature    __typename  }}';
      const body = {
        operationName: 'PlaybackAccessToken_Template',
        query,
        variables: {
          isLive: true,
          login: channelName,
          isVod: false,
          vodID: '',
          playerType
        }
      };
      return gqlRequest(body);
    }
    function getStreamUrlForResolution(encodingsM3u8, resolutionInfo, qualityOverrideStr) {
      let qualityOverride = 0;
      if (qualityOverrideStr && qualityOverrideStr.endsWith('p')) {
        const numericPart = qualityOverrideStr.slice(0, -1);
        const numericValue = parseInt(numericPart, 10);
        if (!Number.isNaN(numericValue)) {
          qualityOverride = numericValue;
        }
      }
      const encodingsLines = encodingsM3u8.replace('\r', '').split('\n');
      let firstUrl = null;
      let lastUrl = null;
      let matchedResolutionUrl = null;
      let matchedFrameRate = false;
      for (let i = 0; i < encodingsLines.length; i += 1) {
        const line = encodingsLines[i];
        const previousLine = encodingsLines[i - 1];
        if (line.startsWith('#') || !line.includes('.m3u8')) {
          continue;
        }
        if (i === 0 || !previousLine.startsWith('#EXT-X-STREAM-INF')) {
          continue;
        }
        const attributes = parseAttributes(previousLine);
        const resolution = attributes.RESOLUTION;
        if (!resolution) {
          continue;
        }
        const frameRate = attributes['FRAME-RATE'];
        if (qualityOverride) {
          const quality = resolution.toLowerCase().split('x')[1];
          if (parseInt(quality, 10) === qualityOverride) {
            qualityOverrideFoundQuality = quality;
            qualityOverrideFoundFrameRate = frameRate;
            matchedResolutionUrl = line;
            if (frameRate < 40) {
              return matchedResolutionUrl;
            }
          } else if (quality < qualityOverride) {
            return matchedResolutionUrl || line;
          }
        } else if ((!resolutionInfo || resolution === resolutionInfo.Resolution) && (!matchedResolutionUrl || !matchedFrameRate && frameRate === resolutionInfo.FrameRate)) {
          matchedResolutionUrl = line;
          matchedFrameRate = frameRate === resolutionInfo.FrameRate;
          if (matchedFrameRate) {
            return matchedResolutionUrl;
          }
        }
        if (!firstUrl) {
          firstUrl = line;
        }
        lastUrl = line;
      }
      if (qualityOverride) {
        return lastUrl;
      }
      return matchedResolutionUrl || firstUrl;
    }
    async function getStreamForResolution(streamInfo, resolutionInfo, encodingsM3u8, fallbackStreamStr, playerType, realFetch) {
      const qualityOverride = null;
      if (streamInfo.EncodingsM3U8Cache[playerType].Resolution !== resolutionInfo.Resolution || streamInfo.EncodingsM3U8Cache[playerType].RequestTime < Date.now() - EncodingCacheTimeout) {
        console.log(`Blocking ads (
            type:${playerType},
            resolution:${resolutionInfo.Resolution},
            frameRate:${resolutionInfo.FrameRate},
            qualityOverride:${qualityOverride}
        )`);
      }
      streamInfo.EncodingsM3U8Cache[playerType].RequestTime = Date.now();
      streamInfo.EncodingsM3U8Cache[playerType].Value = encodingsM3u8;
      streamInfo.EncodingsM3U8Cache[playerType].Resolution = resolutionInfo.Resolution;
      const streamM3u8Url = getStreamUrlForResolution(encodingsM3u8, resolutionInfo, qualityOverride);
      const streamM3u8Response = await realFetch(streamM3u8Url);
      if (streamM3u8Response.status === 200) {
        const m3u8Text = await streamM3u8Response.text();
        WasShowingAd = true;
        postMessage({
          key: 'ForceChangeQuality'
        });
        if (!m3u8Text || m3u8Text.includes(AdSignifier)) {
          streamInfo.EncodingsM3U8Cache[playerType].Value = null;
        }
        return m3u8Text;
      }
      streamInfo.EncodingsM3U8Cache[playerType].Value = null;
      return fallbackStreamStr;
    }
    async function processM3U8(url, textStr, realFetch, playerType) {
      let _accessToken$data;
      const streamInfo = StreamInfosByUrl[url];
      if (IsSquadStream || !textStr || !textStr.includes('.ts') && !textStr.includes('.mp4')) {
        return textStr;
      }
      if (!textStr.includes(AdSignifier)) {
        if (WasShowingAd) {
          console.log('Finished blocking ads');
          WasShowingAd = false;
          postMessage({
            key: 'ForceChangeQuality',
            value: 'original'
          });
          postMessage({
            key: 'PauseResumePlayer'
          });
        }
        return textStr;
      }
      let currentResolution = null;
      if (streamInfo && streamInfo.Urls) {
        for (const [resUrl, resInfo] of Object.entries(streamInfo.Urls)) {
          if (resUrl === url) {
            currentResolution = resInfo;
            break;
          }
        }
      }
      const encodingsM3U8Cache = streamInfo.EncodingsM3U8Cache[playerType];
      if (encodingsM3U8Cache) {
        const {
          Value,
          RequestTime
        } = encodingsM3U8Cache;
        if (Value && RequestTime >= Date.now() - EncodingCacheTimeout) {
          try {
            const result = getStreamForResolution(streamInfo, currentResolution, Value, null, playerType, realFetch);
            if (result) {
              return result;
            }
          } catch (err) {
            encodingsM3U8Cache.Value = null;
          }
        }
      } else {
        streamInfo.EncodingsM3U8Cache[playerType] = {
          RequestTime: Date.now(),
          Value: null,
          Resolution: null
        };
      }
      const accessTokenResponse = await getAccessToken(CurrentChannelName, playerType);
      if (accessTokenResponse.status !== 200) {
        return textStr;
      }
      const accessToken = await accessTokenResponse.json();
      if (((_accessToken$data = accessToken.data) === null || _accessToken$data === void 0 ? void 0 : _accessToken$data.streamPlaybackAccessToken) === null) {
        console.error('Failed to retrieve stream playback access token');
        return textStr;
      }
      const {
        signature,
        value
      } = accessToken.data.streamPlaybackAccessToken;
      let encodingsM3u8Response;
      try {
        const urlInfo = new URL(`https://usher.ttvnw.net/api/channel/hls/${CurrentChannelName}.m3u8${UsherParams}`);
        urlInfo.searchParams.set('sig', signature);
        urlInfo.searchParams.set('token', value);
        encodingsM3u8Response = await realFetch(urlInfo.href);
      } catch (e) {}
      return encodingsM3u8Response && encodingsM3u8Response.status === 200 ? getStreamForResolution(streamInfo, currentResolution, await encodingsM3u8Response.text(), textStr, playerType, realFetch) : textStr;
    }
    function getWasmWorkerUrl(twitchBlobUrl) {
      const req = new XMLHttpRequest();
      req.open('GET', twitchBlobUrl, false);
      req.send();
      return req.responseText.split("'")[1];
    }
    function hookWorkerFetch() {
      console.log('Twitch Worker has been hooked');
      const realFetch = fetch;
      fetch = async function fetch(url, options) {
        if (typeof url !== 'string') {
          return realFetch.apply(this, arguments);
        }
        if (url.endsWith('m3u8')) {
          return new Promise((resolve, reject) => {
            async function processAfter(response) {
              if (response.status === 200) {
                const responseText = await response.text();
                let weaverText = null;
                weaverText = await processM3U8(url, responseText, realFetch, PlayerType2);
                if (weaverText.includes(AdSignifier)) {
                  weaverText = await processM3U8(url, responseText, realFetch, PlayerType3);
                }
                if (weaverText.includes(AdSignifier)) {
                  weaverText = await processM3U8(url, responseText, realFetch, PlayerType4);
                }
                if (weaverText.includes(AdSignifier)) {
                  weaverText = await processM3U8(url, responseText, realFetch, PlayerType5);
                }
                resolve(new Response(weaverText));
              } else {
                resolve(response);
              }
            }
            realFetch(url, options).then(processAfter).catch(reject);
          });
        }
        if (url.includes('/api/channel/hls/')) {
          const channelName = new URL(url).pathname.match(/([^\/]+)(?=\.\w+$)/)[0];
          UsherParams = new URL(url).search;
          CurrentChannelName = channelName;
          const isPBYPRequest = url.includes('picture-by-picture');
          if (isPBYPRequest) {
            url = '';
          }
          return new Promise((resolve, reject) => {
            async function processAfter(response) {
              if (response.status !== 200) {
                resolve(response);
              }
              encodingsM3u8 = await response.text();
              let streamInfo = StreamInfos[channelName];
              if (streamInfo == null) {
                StreamInfos[channelName] = {};
                streamInfo = {};
              }
              streamInfo.ChannelName = channelName;
              streamInfo.Urls = [];
              streamInfo.EncodingsM3U8Cache = [];
              streamInfo.EncodingsM3U8 = encodingsM3u8;
              const lines = encodingsM3u8.replace('\r', '').split('\n');
              for (let i = 0; i < lines.length; i += 1) {
                const line = lines[i];
                const previousLine = lines[i - 1];
                if (!line.startsWith('#') && line.includes('.m3u8')) {
                  streamInfo.Urls[line] = -1;
                  StreamInfosByUrl[line] = streamInfo;
                  MainUrlByUrl[line] = url;
                  if (i === 0 || !previousLine.startsWith('#EXT-X-STREAM-INF')) {
                    continue;
                  }
                  const attributes = parseAttributes(previousLine);
                  const resolution = attributes.RESOLUTION;
                  const frameRate = attributes['FRAME-RATE'];
                  if (resolution) {
                    streamInfo.Urls[line] = {
                      Resolution: resolution,
                      FrameRate: frameRate
                    };
                  }
                }
              }
              resolve(new Response(encodingsM3u8));
            }
            realFetch(url, options).then(processAfter).catch(reject);
          });
        }
        return realFetch.apply(this, arguments);
      };
    }
    function stripUnusedParams(str) {
      const params = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : ['token', 'sig'];
      const tempUrl = new URL(`https://localhost/${str}`);
      for (let i = 0; i < params.length; i += 1) {
        tempUrl.searchParams.delete(params[i]);
      }
      return tempUrl.pathname.substring(1) + tempUrl.search;
    }
    function adRecordgqlPacket(event, radToken, payload) {
      const gqlRequestBody = {
        operationName: 'ClientSideAdEventHandling_RecordAdEvent',
        variables: {
          input: {
            eventName: event,
            eventPayload: JSON.stringify(payload),
            radToken
          }
        },
        extensions: {
          persistedQuery: {
            version: 1,
            sha256Hash: '7e6c69e6eb59f8ccb97ab73686f3d8b7d85a72a0298745ccd8bfc68e4054ca5b'
          }
        }
      };
      return [gqlRequestBody];
    }
    async function tryNotifyTwitch(streamM3u8) {
      const matches = streamM3u8.match(/#EXT-X-DATERANGE:(ID="stitched-ad-[^\n]+)\n/);
      if (!matches || matches.length <= 1) {
        return;
      }
      const attrString = matches[1];
      const attr = parseAttributes(attrString);
      const adId = attr['X-TV-TWITCH-AD-ADVERTISER-ID'];
      const rollType = attr['X-TV-TWITCH-AD-ROLL-TYPE'].toLowerCase();
      const creativeId = attr['X-TV-TWITCH-AD-CREATIVE-ID'];
      const orderId = attr['X-TV-TWITCH-AD-ORDER-ID'];
      const lineItemId = attr['X-TV-TWITCH-AD-LINE-ITEM-ID'];
      const baseData = {
        stitched: true,
        ad_id: adId,
        roll_type: rollType,
        creative_id: creativeId,
        order_id: orderId,
        line_item_id: lineItemId,
        player_mute: true,
        player_volume: 0.0,
        visible: false,
        duration: 0
      };
      const podLength = parseInt(attr['X-TV-TWITCH-AD-POD-LENGTH'] || '1', 10);
      const radToken = attr['X-TV-TWITCH-AD-RADS-TOKEN'];
      for (let podPosition = 0; podPosition < podLength; podPosition += 1) {
        const extendedData = _objectSpread$1(_objectSpread$1({}, baseData), {}, {
          ad_position: podPosition,
          total_ads: podLength
        });
        const adRecord = adRecordgqlPacket('video_ad_impression', radToken, extendedData);
        await gqlRequest(adRecord);
        for (let quartile = 0; quartile < 4; quartile += 1) {
          const adQuartileRecord = adRecordgqlPacket('video_ad_quartile_complete', radToken, _objectSpread$1(_objectSpread$1({}, extendedData), {}, {
            quartile: quartile + 1
          }));
          await gqlRequest(adQuartileRecord);
        }
        const adCompleteRecord = adRecordgqlPacket('video_ad_pod_complete', radToken, baseData);
        await gqlRequest(adCompleteRecord);
      }
    }
    function pauseResumeTwitchPlayer() {
      let _videoPlayer, _videoPlayer$props;
      function findReactNode(root, constraint) {
        if (root.stateNode && constraint(root.stateNode)) {
          return root.stateNode;
        }
        let node = root.child;
        while (node) {
          const targetNode = findReactNode(node, constraint);
          if (targetNode) {
            return targetNode;
          }
          node = node.sibling;
        }
        return null;
      }
      function findReactRootNode() {
        let _rootNode$_reactRootC, _rootNode$_reactRootC2;
        const rootNode = browser$1.querySelector('#root');
        let reactRootNode = (rootNode === null || rootNode === void 0 ? void 0 : (_rootNode$_reactRootC = rootNode._reactRootContainer) === null || _rootNode$_reactRootC === void 0 ? void 0 : (_rootNode$_reactRootC2 = _rootNode$_reactRootC._internalRoot) === null || _rootNode$_reactRootC2 === void 0 ? void 0 : _rootNode$_reactRootC2.current) || null;
        if (reactRootNode === null) {
          const containerName = Object.keys(rootNode).find(x => x.startsWith('__reactContainer'));
          if (containerName !== null) {
            reactRootNode = rootNode[containerName];
          }
        }
        return reactRootNode;
      }
      const reactRootNode = findReactRootNode();
      if (!reactRootNode) {
        return;
      }
      let videoPlayer = findReactNode(reactRootNode, node => node.setPlayerActive && node.props && node.props.mediaPlayerInstance);
      videoPlayer = ((_videoPlayer = videoPlayer) === null || _videoPlayer === void 0 ? void 0 : (_videoPlayer$props = _videoPlayer.props) === null || _videoPlayer$props === void 0 ? void 0 : _videoPlayer$props.mediaPlayerInstance) || null;
      if (!videoPlayer) {
        return;
      }
      videoPlayer.pause();
      videoPlayer.play();
    }
    function postTwitchWorkerMessage(key, value) {
      twitchWorkers.forEach(worker => worker.postMessage({
        key,
        value
      }));
    }
    function makeGmXmlHttpRequest(fetchRequest) {
      if (typeof GM === 'undefined' || typeof GM.xmlHttpRequest !== 'function') {
        return Promise.reject(new Error('GM.xmlHttpRequest is not available.'));
      }
      return new Promise((resolve, reject) => {
        GM.xmlHttpRequest({
          method: fetchRequest.options.method,
          url: fetchRequest.url,
          data: fetchRequest.options.body,
          headers: fetchRequest.options.headers,
          onload: response => resolve(response),
          onerror: error => reject(error)
        });
      });
    }
    function parseHeaders(headersString) {
      const headers = new Headers();
      const lines = headersString.trim().split(/[\r\n]+/);
      lines.forEach(line => {
        const parts = line.split(':');
        const header = parts.shift();
        const value = parts.join(':');
        headers.append(header, value);
      });
      return headers;
    }
    async function getSecChUa() {
      const uaData = navigator.userAgentData;
      if (uaData && typeof uaData.getHighEntropyValues === 'function') {
        try {
          const {
            brands
          } = await uaData.getHighEntropyValues(['brands']);
          const formattedBrands = brands.map(brandObj => {
            const brand = brandObj.brand === 'Brave' ? 'Google Chrome' : brandObj.brand;
            return `"${brand}";v="${brandObj.version}"`;
          });
          return formattedBrands.join(', ');
        } catch (e) {
          return '';
        }
      }
      return '';
    }
    function getDynamicFirefoxUserAgent() {
      const ua = navigator.userAgent;
      const platformMatch = ua.match(/\(([^)]+)\)/);
      const platform = platformMatch ? platformMatch[1] : 'Windows NT 10.0; Win64; x64';
      let chromeVersion = 138;
      const chromeMatch = ua.match(/Chrome\/(\d+)/);
      if (chromeMatch && chromeMatch[1]) {
        chromeVersion = parseInt(chromeMatch[1], 10);
      }
      const firefoxVersion = chromeVersion + 2;
      return `Mozilla/5.0 (${platform}; rv:${firefoxVersion}.0) Gecko/20100101 Firefox/${firefoxVersion}.0`;
    }
    let isProblematicBrowser = false;
    async function handleWorkerFetchRequest(fetchRequest) {
      try {
        const response = await nativeFetch(fetchRequest.url, fetchRequest.options);
        const responseBody = await response.text();
        const responseObject = {
          id: fetchRequest.id,
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          body: responseBody
        };
        if (responseObject.status === 200) {
          const resp = JSON.parse(responseBody);
          if (typeof resp.errors !== 'undefined') {
            isProblematicBrowser = true;
          }
        }
        if (!isProblematicBrowser) {
          return responseObject;
        }
        if (typeof GM !== 'undefined' && typeof GM.xmlHttpRequest !== 'undefined') {
          fetchRequest.options.headers['Sec-Ch-Ua'] = await getSecChUa();
          fetchRequest.options.headers['User-Agent'] = getDynamicFirefoxUserAgent();
          fetchRequest.options.headers.Referer = TWITCH_ORIGIN;
          fetchRequest.options.headers.Origin = TWITCH_ORIGIN;
          fetchRequest.options.headers.Host = TWITCH_GQL_HOST;
          const responseGmXhr = await makeGmXmlHttpRequest(fetchRequest);
          const responseBodyGmXhr = responseGmXhr.responseText;
          const responseObjectGmXhr = {
            id: fetchRequest.id,
            status: responseGmXhr.status,
            statusText: responseGmXhr.statusText,
            headers: Object.fromEntries(parseHeaders(responseGmXhr.responseHeaders).entries()),
            body: responseBodyGmXhr
          };
          return responseObjectGmXhr;
        }
        console.error('Failed to resolve gql request.');
        return responseObject;
      } catch (error) {
        return {
          id: fetchRequest.id,
          error: error.message
        };
      }
    }
    function hookFetch() {
      const localDeviceID = browser$1.window.localStorage.getItem('local_copy_unique_id');
      const realFetch = browser$1.window.fetch;
      function newFetch() {
        for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
          args[_key] = arguments[_key];
        }
        let url = args[0];
        const options = args[1];
        if (typeof url !== 'string') {
          return realFetch.apply(this, args);
        }
        postTwitchWorkerMessage('UpdateIsSquadStream', window.location.pathname.includes('/squad'));
        if (!url.includes('/access_token') && !url.includes('gql')) {
          return realFetch.apply(this, args);
        }
        const deviceId = options.headers['X-Device-Id'] || options.headers['Device-ID'];
        if (typeof deviceId === 'string' && !deviceId.includes('twitch-web-wall-mason')) {
          GQLDeviceID = deviceId;
        } else if (localDeviceID) {
          GQLDeviceID = localDeviceID.replace('"', '').replace('"', '');
        }
        if (GQLDeviceID) {
          if (typeof options.headers['X-Device-Id'] === 'string') {
            options.headers['X-Device-Id'] = GQLDeviceID;
          }
          if (typeof options.headers['Device-ID'] === 'string') {
            options.headers['Device-ID'] = GQLDeviceID;
          }
          postTwitchWorkerMessage('UpdateDeviceId', GQLDeviceID);
        }
        const clientVersion = options.headers['Client-Version'];
        if (clientVersion && typeof clientVersion === 'string') {
          ClientVersion = clientVersion;
        }
        if (ClientVersion) {
          postTwitchWorkerMessage('UpdateClientVersion', ClientVersion);
        }
        const clientSession = options.headers['Client-Session-Id'];
        if (clientSession && typeof clientSession === 'string') {
          ClientSession = clientSession;
        }
        if (ClientSession) {
          postTwitchWorkerMessage('UpdateClientSession', ClientSession);
        }
        if (url.includes('gql') && options && typeof options.body === 'string' && options.body.includes('PlaybackAccessToken')) {
          const clientId = options.headers['Client-ID'];
          if (clientId && typeof clientId === 'string') {
            ClientID = clientId;
          }
          if (ClientID) {
            postTwitchWorkerMessage('UpdateClientId', ClientID);
          }
          ClientIntegrityHeader = options.headers['Client-Integrity'];
          if (ClientIntegrityHeader) {
            postTwitchWorkerMessage('UpdateClientIntegrityHeader', ClientIntegrityHeader);
          }
          AuthorizationHeader = options.headers.Authorization;
          if (AuthorizationHeader) {
            postTwitchWorkerMessage('UpdateAuthorizationHeader', AuthorizationHeader);
          }
          if (options.body.includes('PlaybackAccessToken') && options.body.includes('picture-by-picture')) {
            options.body = '';
          }
        }
        if (url.includes('picture-by-picture')) {
          url = '';
        }
        return realFetch.apply(this, args);
      }
      browser$1.window.fetch = newFetch;
    }
    function declareOptions(scope) {
      scope.AdSignifier = 'stitched';
      scope.ClientID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
      scope.ClientVersion = 'null';
      scope.ClientSession = 'null';
      scope.PlayerType2 = 'embed';
      scope.PlayerType3 = 'site';
      scope.PlayerType4 = 'autoplay';
      scope.PlayerType5 = 'picture-by-picture';
      scope.CurrentChannelName = null;
      scope.UsherParams = null;
      scope.WasShowingAd = false;
      scope.GQLDeviceID = null;
      scope.IsSquadStream = false;
      scope.StreamInfos = [];
      scope.StreamInfosByUrl = [];
      scope.MainUrlByUrl = [];
      scope.EncodingCacheTimeout = 60000;
      scope.ClientIntegrityHeader = null;
      scope.AuthorizationHeader = null;
    }
    const isWorkerIntact = () => {
      const iframe = browser$1.window.document.createElement('iframe');
      const el = browser$1.window.document.head || browser$1.window.document.documentElement;
      el.append(iframe);
      const cleanWindow = iframe.contentWindow;
      if (cleanWindow.Worker.toString() === browser$1.window.Worker.toString()) {
        iframe.remove();
        return true;
      }
      iframe.remove();
      return false;
    };
    function hookWorker() {
      const oldWorker = browser$1.window.Worker;
      browser$1.window.Worker = class Worker extends oldWorker {
        constructor(twitchBlobUrl) {
          const jsURL = getWasmWorkerUrl(twitchBlobUrl);
          if (typeof jsURL !== 'string') {
            super(twitchBlobUrl);
            return;
          }
          const newBlobStr = `
                            const pendingFetchRequests = new Map();
                            ${getStreamUrlForResolution.toString()}
                            ${getStreamForResolution.toString()}
                            ${stripUnusedParams.toString()}
                            ${processM3U8.toString()}
                            ${hookWorkerFetch.toString()}
                            ${declareOptions.toString()}
                            ${getAccessToken.toString()}
                            ${gqlRequest.toString()}
                            ${adRecordgqlPacket.toString()}
                            ${tryNotifyTwitch.toString()}
                            ${parseAttributes.toString()}
                            declareOptions(self);
                            self.addEventListener('message', function(e) {
                                if (e.data.key == 'UpdateIsSquadStream') {
                                    IsSquadStream = e.data.value;
                                } else if (e.data.key == 'UpdateClientVersion') {
                                    ClientVersion = e.data.value;
                                } else if (e.data.key == 'UpdateClientSession') {
                                    ClientSession = e.data.value;
                                } else if (e.data.key == 'UpdateClientId') {
                                    ClientID = e.data.value;
                                } else if (e.data.key == 'UpdateDeviceId') {
                                    GQLDeviceID = e.data.value;
                                } else if (e.data.key == 'UpdateClientIntegrityHeader') {
                                    ClientIntegrityHeader = e.data.value;
                                } else if (e.data.key == 'UpdateAuthorizationHeader') {
                                    AuthorizationHeader = e.data.value;
                                } else if (e.data.key == 'FetchResponse') {
                                    const responseData = e.data.value;
                                    if (pendingFetchRequests.has(responseData.id)) {
                                        const { resolve, reject } = pendingFetchRequests.get(responseData.id);
                                        pendingFetchRequests.delete(responseData.id);
        
                                        if (responseData.error) {
                                            reject(new Error(responseData.error));
                                        } else {
                                            // Create a Response object from the response data
                                            const response = new Response(responseData.body, {
                                                status: responseData.status,
                                                statusText: responseData.statusText,
                                                headers: responseData.headers
                                            });
                                            resolve(response);
                                        }
                                    }
                                }
                            });
                            hookWorkerFetch();
                            importScripts('${jsURL}');
                        `;
          super(URL.createObjectURL(new Blob([newBlobStr])));
          twitchWorkers.push(this);
          this.addEventListener('message', async event => {
            if (event.data.key === 'FetchRequest') {
              const fetchRequest = event.data.value;
              const responseData = await handleWorkerFetchRequest(fetchRequest);
              this.postMessage({
                key: 'FetchResponse',
                value: responseData
              });
            }
          });
          this.onmessage = e => {
            const {
              data: {
                key
              }
            } = e;
            switch (key) {
              case 'PauseResumePlayer':
                pauseResumeTwitchPlayer();
                break;
            }
          };
        }
      };
    }
    function init() {
      try {
        browser$1.defineProperty(browser$1.document, 'visibilityState', {
          get() {
            return 'visible';
          }
        });
        browser$1.defineProperty(browser$1.document, 'hidden', {
          get() {
            return false;
          }
        });
        const vendorProp = /Firefox/.test(browser$1.navigator.userAgent) ? 'mozHidden' : 'webkitHidden';
        browser$1.defineProperty(browser$1.document, vendorProp, {
          get() {
            return false;
          }
        });
        const documentEventsToBlock = ['visibilitychange', 'webkitvisibilitychange', 'mozvisibilitychange', 'hasFocus'];
        const block = e => {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
        };
        documentEventsToBlock.forEach(event => {
          browser$1.document.addEventListener(event, block, true);
        });
      } catch (e) {}
    }
    if (!isWorkerIntact()) {
      return;
    }
    declareOptions(browser$1.window);
    hookFetch();
    hookWorker();
    onDOMContentLoaded(() => {
      init();
    });
  });
  function ownKeys(e, r) {
    const t = Object.keys(e);
    if (Object.getOwnPropertySymbols) {
      let o = Object.getOwnPropertySymbols(e);
      r && (o = o.filter(function (r) {
        return Object.getOwnPropertyDescriptor(e, r).enumerable;
      })), t.push.apply(t, o);
    }
    return t;
  }
  (function shouldRunExtra(hostsMap) {
    if (!isBrowserSupported()) {
      return;
    }
    const {
      hostname
    } = browser$1.location;
    const pageScript = hostsMap.getPageScript(hostname.replace(/^www\./, ''));
    if (typeof pageScript === 'function') {
      pageScript();
    }
  })(commonHosts);
})();