"use strict";

async function actionInCaseToggleSiteInList({
  payload
}) {
  await toggleSiteInList(payload.host, payload.list, true);
}