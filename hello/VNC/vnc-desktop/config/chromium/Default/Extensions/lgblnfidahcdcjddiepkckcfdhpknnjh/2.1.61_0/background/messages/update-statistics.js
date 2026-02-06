"use strict";

async function actionInCaseUpdateStatistics({
  payload
}, sender) {
  if (typeof sender?.tab?.id === 'number') {
    await statistics.incrementBlock({
      typeId: payload.typeId,
      amount: payload.amount,
      tabId: sender.tab.id
    });
  }
  await updateIcon();
}