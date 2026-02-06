"use strict";

async function getCssFromStorage() {
  const data = await storageService.get('cssListData');
  const {
    extended_rules = {},
    blacklist = {},
    whitelist = {},
    cookie_banners_blacklist = {},
    cookie_banners_extended_rules = {},
    cookie_banners_whitelist = {}
  } = data?.css_rules || {};
  const parentDomains = pageData.hostAddress.split('.').map((_, i, arr) => arr.slice(i).join('.')).slice(0, -1);
  function getRulesFromList(list) {
    const rules = [];
    for (const [pattern, ruleList] of Object.entries(list)) {
      if (pattern === '*') {
        rules.push(...ruleList);
      } else if ([pageData.hostAddress, ...parentDomains].some(d => new RegExp(`^${pattern.replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&').replace(/\*/g, '.*')}$`, 'i').test(d))) {
        rules.push(...ruleList);
      }
    }
    return [...new Set(rules)];
  }
  let generalRules = [];
  let generalExtendedRules = [];
  if (pageData.enabled) {
    generalExtendedRules = getRulesFromList(extended_rules);
    if (!whitelist[pageData.hostAddress]?.includes('*')) {
      generalRules = getRulesFromList(blacklist);
      const whitelistRules = getRulesFromList(whitelist);
      generalRules = generalRules.filter(val => !whitelistRules.includes(val));
    }
  }
  let cookieBannersRules = [];
  let cookieBannersExtendedRules = [];
  if (pageData.hideCookieBanners) {
    cookieBannersExtendedRules = getRulesFromList(cookie_banners_extended_rules);
    if (cookie_banners_whitelist[pageData.hostAddress]?.[0] !== '*') {
      cookieBannersRules = getRulesFromList(cookie_banners_blacklist);
      const cookieWhitelistRules = getRulesFromList(cookie_banners_whitelist);
      cookieBannersRules = cookieBannersRules.filter(val => !cookieWhitelistRules.includes(val));
    }
  }
  return {
    generalRules,
    cookieBannersRules,
    generalExtendedRules,
    cookieBannersExtendedRules
  };
}
async function setPageCss() {
  try {
    setCustomCssIntoPage(pageData.customCss);
    const res = await getCssFromStorage();
    generaRulesCounter.setRules(res.generalRules);
    generaRulesCounter.setState(pageData.enabled);
    generalExtendedRules.setRules(res.generalExtendedRules);
    generalExtendedRules.setState(pageData.enabled);
    cookieBannerRulesCounter.setRules(res.cookieBannersRules);
    cookieBannerRulesCounter.setState(pageData.hideCookieBanners);
    cookieBannerExtendedRules.setRules(res.cookieBannersExtendedRules);
    cookieBannerExtendedRules.setState(pageData.hideCookieBanners);
    const countPerStyle = 1000;
    const styleElementIds = [];
    [{
      pattern: 'stndz-general-',
      rules: res.generalRules
    }, {
      pattern: 'stndz-cookie-banners-',
      rules: res.cookieBannersRules
    }].forEach(({
      pattern,
      rules
    }) => {
      currentDocument.querySelectorAll(`style[id^="${pattern}"]`).forEach(style => style.remove());
      for (let i = 0; i < Math.ceil(rules.length / countPerStyle); i++) {
        const id = `${pattern}${i}`;
        const styleElement = currentDocument.createElement('style');
        styleElement.id = id;
        styleElement.textContent = `${rules.slice(countPerStyle * i, countPerStyle * i + countPerStyle).join(', ')} ${BLOCK_CSS_VALUE}`;
        addElementToHead(styleElement);
        styleElementIds.push(id);
      }
    });
    addStyleRulesToShadowDomNodes(styleElementIds);
  } catch (e) {
    debug.error('Error in setPageCss', e);
  }
}
function addStyleRulesToShadowDomNodes(styleElementIds) {
  const hideElements = debounce(() => {
    const shadowDomNodes = getAllShadowDomNodes();
    for (const node of shadowDomNodes) {
      styleElementIds.forEach(styleElementId => {
        const styleNode = document.getElementById(styleElementId)?.cloneNode(true);
        const existedStyleNode = node.shadowRoot?.getElementById(styleElementId);
        if (styleNode && !existedStyleNode) {
          node.shadowRoot?.appendChild(styleNode);
        }
      });
    }
  }, 1000);
  hideElements();
  new MutationObserver(hideElements).observe(document.documentElement, {
    attributes: true,
    characterData: true,
    childList: true,
    subtree: true
  });
}