"use strict";

async function actionInCaseGetBlockingData() {
  await sendMessage({
    type: MESSAGE_TYPES.getBlockingDataResponse,
    payload: {
      forStandsPopup: true,
      data: await statistics.getBlockingData()
    }
  });
}