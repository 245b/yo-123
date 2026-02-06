"use strict";
async function actionInCaseFilteringUrlAction({
  payload: {
    urlFilter
  }
}) {
  if (urlFilter.action === 'notify' && urlFilter.details === 'urlWasBlocked') {
    serverLogger.logUrlFilteringHappened('url_blocked', urlFilter.b_url ?? '');
  } else if (urlFilter.action === 'allow') {
    serverLogger.logUrlFilteringHappened('url_allowed', urlFilter.b_url ?? '');
  } else if (urlFilter.action === 'return') {
    serverLogger.logUrlFilteringHappened('return_pressed', urlFilter.b_url ?? '');
  }
}