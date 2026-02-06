"use strict";

async function countMatchedRules() {
  const {
    rulesMatchedInfo
  } = await getMatchedRules({
    minTimeStamp: Date.now() - 60 * 1000
  });
  const groupedByTab = Object.groupBy(rulesMatchedInfo, ({
    tabId
  }) => tabId);
  for (const tabId in groupedByTab) {
    const rules = groupedByTab[tabId] || [];
    const ads = rules.some(({
      rule
    }) => rule.ruleId === ALLOWED_RULES_IDS.general) ? 0 : rules.filter(({
      rule
    }) => rule.rulesetId === 'requests').length;
    const cookieBanners = rules.some(({
      rule
    }) => rule.ruleId === ALLOWED_RULES_IDS.cookieBanner) ? 0 : rules.filter(({
      rule
    }) => rule.rulesetId === 'cookie-banners-requests').length;
    if (ads) {
      await statistics.incrementBlock({
        typeId: BLOCK_TYPES.ad,
        amount: ads,
        tabId: +tabId
      });
    }
    if (cookieBanners) {
      await statistics.incrementBlock({
        typeId: BLOCK_TYPES.cookieBanner,
        amount: cookieBanners,
        tabId: +tabId
      });
    }
  }
  await updateIcon();
}