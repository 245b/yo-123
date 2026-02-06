"use strict";

const heartbeat = async () => {
  const user = await userData.getData();
  if (!user) {
    return;
  }
  const {
    error
  } = await serverApi.callUrl({
    url: API_URLS.heartbeat,
    method: 'PUT',
    data: {
      privateUserId: user.privateUserId
    }
  });
  if (error) {
    debug.error(`Error sending heartbeat: ${error}`);
    return;
  }
  await Promise.all([serverLogger.prepareAndSend(true), analysisReporter.reportBulk(true)]);
};