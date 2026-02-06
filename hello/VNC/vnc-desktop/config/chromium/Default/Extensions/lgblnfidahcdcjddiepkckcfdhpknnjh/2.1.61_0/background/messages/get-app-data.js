"use strict";

async function actionInCaseGetAppData() {
  const [currentPageData, whitelistedSites, cookieBannersWhitelist, popupsWhitelist, stats] = await Promise.all([pageDataComponent.getActiveTabData(), deactivatedSites.getList(), cookieBannersAllowedSites.getList(), popupAllowedSites.getList(), statistics.getSummary()]);
  await sendMessage({
    type: MESSAGE_TYPES.getAppDataResponse,
    payload: {
      forStandsPopup: true,
      data: {
        appVersion: getAppVersion(),
        currentPageData,
        deactivatedSites: whitelistedSites,
        cookieBannersWhitelist,
        popupsWhitelist,
        stats,
        urls: {
          privacy: RESOURCES.privacyUrl,
          rate: browserInfo.getRateUrl(),
          terms: RESOURCES.termsUrl,
          cookies: RESOURCES.cookiesUrl,
          reddit: RESOURCES.redditUrl,
          facebook: RESOURCES.facebookUrl
        }
      }
    }
  });
}