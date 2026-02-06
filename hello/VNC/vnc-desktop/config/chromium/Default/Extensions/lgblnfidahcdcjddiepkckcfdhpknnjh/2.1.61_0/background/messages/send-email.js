"use strict";

async function sendEmail(type, source, content) {
  await serverApi.callUrl({
    url: `https://zapier.com/hooks/catch/b2t6v9/?type=${encodeURIComponent(type)}&Source=${encodeURIComponent(source)}&Content=${encodeURIComponent(content)}`
  });
}
async function actionInCaseSendEmail({
  payload
}) {
  const [settings, geo] = await Promise.all([userData.getSettings(), userData.getGeo()]);
  if (payload.type === 'FEEDBACK') {
    const content = `
      Geo: ${geo}
      Feedback: ${payload.text}
    `;
    await sendEmail('Feedback', 'App', content);
  }
  if (payload.type === 'ISSUE') {
    let url = '';
    if (payload.includeCurrentUrl) {
      const tab = await getActiveTab();
      url = tab?.url || '';
    }
    const operatingSystem = await getOperatingSystem();
    const content = `
      Geo: ${geo}
      App Version: ${getAppVersion()}
      Browser: ${browserInfo.getBrowserName()}
      Browser Version: ${browserInfo.getBrowserVersion()}
      Operating System: ${operatingSystem}
      App Enabled: ${settings.enabled}
      Url: ${url}
      Feedback: ${payload.text}
    `;
    await sendEmail('Report Issue', 'Dashboard', content);
  }
}