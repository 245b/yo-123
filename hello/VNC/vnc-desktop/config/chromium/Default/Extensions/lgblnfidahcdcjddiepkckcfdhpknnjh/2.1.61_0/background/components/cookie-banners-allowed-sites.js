"use strict";

class CookieBannersAllowedSites {
  container = new DataContainer('cookieBannersAllowedSites', {});
  async init() {
    const sitesData = await this.container.get();
    await Promise.all([this.updateDynamicRules(sitesData), this.updateContentScripts(sitesData)]);
  }
  async updateDynamicRules(sitesData) {
    const hosts = Object.keys(sitesData);
    const addRules = hosts.length ? [{
      id: ALLOWED_RULES_IDS.cookieBanner,
      priority: 100,
      action: {
        type: 'allow'
      },
      condition: {
        initiatorDomains: hosts
      }
    }] : [];
    await updateDynamicRules({
      removeRuleIds: [2],
      addRules
    });
  }
  async updateContentScripts(sitesData) {
    const data = [{
      hosts: ['outlook.live.com'],
      scripts: [{
        allFrames: true,
        id: 'outlook.live.com-cookie-banner-custom-script',
        js: ['content/custom-scripts/cookie-banners/outlook.live.com.js'],
        matches: ['*://*.outlook.live.com/*'],
        runAt: 'document_start'
      }]
    }, {
      hosts: ['globo.com', 'techtudo.com.br', 'haber7.com'],
      scripts: [{
        allFrames: true,
        id: 'globo.com-cookie-banner-custom-script',
        js: ['content/custom-scripts/cookie-banners/globo.com.js'],
        matches: ['*://*.globo.com/*', '*://*.techtudo.com.br/*', '*://*.haber7.com/*'],
        runAt: 'document_start'
      }]
    }, {
      hosts: ['google.com', 'google.ca', 'google.com.tw'],
      scripts: [{
        allFrames: true,
        id: 'google.com-cookie-banner-custom-script',
        js: ['common/helpers.js', 'content/custom-scripts/cookie-banners/google.com.js'],
        matches: ['*://*.google.com/*', '*://*.google.ca/*', '*://*.google.com.tw/*'],
        runAt: 'document_start'
      }]
    }, {
      hosts: ['facebook.com'],
      scripts: [{
        allFrames: true,
        id: 'facebook.com-cookie-banner-custom-script',
        js: ['common/helpers.js', 'content/custom-scripts/cookie-banners/facebook.com.js'],
        matches: ['*://*.facebook.com/*'],
        runAt: 'document_start'
      }]
    }, {
      hosts: ['consent.yahoo.com'],
      scripts: [{
        allFrames: true,
        id: 'consent.yahoo.com-cookie-banner-custom-script',
        js: ['common/helpers.js', 'content/custom-scripts/cookie-banners/consent.yahoo.com.js'],
        matches: ['*://*.consent.yahoo.com/*'],
        runAt: 'document_end'
      }]
    }, {
      hosts: ['dailymail.co.uk'],
      scripts: [{
        allFrames: true,
        id: 'dailymail.co.uk-cookie-banner-custom-script',
        js: ['common/helpers.js', 'content/custom-scripts/cookie-banners/dailymail.co.uk.js'],
        matches: ['*://*.dailymail.co.uk/*'],
        runAt: 'document_end'
      }]
    }, {
      hosts: ['letras.mus.br'],
      scripts: [{
        allFrames: true,
        id: 'letras.mus.br-cookie-banner-custom-script',
        js: ['common/helpers.js', 'content/custom-scripts/cookie-banners/letras.mus.br.js'],
        matches: ['*://*.letras.mus.br/*'],
        runAt: 'document_end'
      }]
    }, {
      hosts: ['quizlet.com'],
      scripts: [{
        allFrames: true,
        id: 'quizlet.com-cookie-banner-custom-script',
        js: ['common/helpers.js', 'content/custom-scripts/cookie-banners/quizlet.com.js'],
        matches: ['*://*.quizlet.com/*'],
        runAt: 'document_end'
      }]
    }, {
      hosts: ['nouvelobs.com'],
      scripts: [{
        allFrames: true,
        id: 'nouvelobs.com-cookie-banner-custom-script',
        js: ['common/helpers.js', 'content/custom-scripts/cookie-banners/nouvelobs.com.js'],
        matches: ['*://*.nouvelobs.com/*'],
        runAt: 'document_end'
      }]
    }, {
      hosts: ['instagram.com'],
      scripts: [{
        allFrames: true,
        id: 'instagram.com-cookie-banner-custom-script',
        js: ['common/helpers.js', 'content/custom-scripts/cookie-banners/instagram.com.js'],
        matches: ['*://*.instagram.com/*'],
        runAt: 'document_start'
      }]
    }, {
      hosts: ['reddit.com'],
      scripts: [{
        allFrames: true,
        id: 'reddit.com-cookie-banner-custom-script',
        js: ['common/helpers.js', 'content/custom-scripts/cookie-banners/reddit.com.js'],
        matches: ['*://*.reddit.com/*'],
        runAt: 'document_start'
      }]
    }, {
      hosts: ['bing.com'],
      scripts: [{
        allFrames: true,
        id: 'bing.com-cookie-banner-custom-script',
        js: ['common/helpers.js', 'content/custom-scripts/cookie-banners/bing.com.js'],
        matches: ['*://*.bing.com/*'],
        runAt: 'document_start'
      }]
    }];
    ['bbc.com', 'bild.de', 'politico.eu', 'spiegel.de', 'telegraph.co.uk', 'theguardian.com', 'thesun.co.uk', 'weather.com'].forEach(host => {
      data.push({
        hosts: [host],
        scripts: [{
          allFrames: true,
          id: `${host}-cookie-banner-sp-custom-script`,
          js: ['common/helpers.js', 'content/custom-scripts/cookie-banners/sp-message-iframe.js'],
          matches: [`*://*.${host}/*`],
          runAt: 'document_start'
        }]
      });
    });
    ['abc.es', 'elmundo.es', 'elpais.com', 'euronews.com', 'marca.com', 'sport.es'].forEach(host => {
      data.push({
        hosts: [host],
        scripts: [{
          allFrames: true,
          id: `${host}-cookie-banner-didomi-custom-script`,
          js: ['common/helpers.js', 'content/custom-scripts/cookie-banners/didomi.js'],
          matches: [`*://*.${host}/*`],
          runAt: 'document_start'
        }]
      });
    });
    const registeredScripts = await getRegisteredContentScripts({
      ids: data.flatMap(({
        scripts
      }) => scripts.map(({
        id
      }) => id))
    });
    const idsToUnregister = data.filter(({
      hosts
    }) => hosts.some(h => sitesData[h])).flatMap(({
      scripts
    }) => scripts).filter(({
      id
    }) => registeredScripts.some(s => s.id === id)).map(({
      id
    }) => id);
    if (idsToUnregister.length) {
      await unregisterContentScripts({
        ids: idsToUnregister
      });
    }
    const scriptsToRegister = data.flatMap(({
      scripts
    }) => scripts.filter(script => !idsToUnregister.includes(script.id) && !registeredScripts.some(s => s.id === script.id)));
    if (scriptsToRegister.length) {
      await registerContentScripts(scriptsToRegister);
    }
  }
  async toggle(host) {
    const data = await this.container.get();
    if (data[host]) {
      delete data[host];
    } else {
      data[host] = true;
    }
    await Promise.all([this.container.set(data), this.updateDynamicRules(data), this.updateContentScripts(data)]);
  }
  async getList() {
    const data = await this.container.get();
    return Object.keys(data);
  }
  async isAllowed(host) {
    const data = await this.container.get();
    return data[host];
  }
}
const cookieBannersAllowedSites = new CookieBannersAllowedSites();