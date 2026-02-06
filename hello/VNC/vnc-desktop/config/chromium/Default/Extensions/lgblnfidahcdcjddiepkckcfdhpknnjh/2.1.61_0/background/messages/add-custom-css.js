"use strict";

async function actionInCaseAddCustomCssByHost({
  payload
}) {
  const [, activeTabId] = await Promise.all([customCssRules.add(payload.host, payload.selectorsInfo), getActiveTabId()]);
  await Promise.all([pageDataComponent.refreshBulk([activeTabId]), contextMenus.update()]);
}