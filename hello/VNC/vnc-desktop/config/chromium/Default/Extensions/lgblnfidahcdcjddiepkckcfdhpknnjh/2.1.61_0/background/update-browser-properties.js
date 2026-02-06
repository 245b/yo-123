"use strict";

async function updateBrowserProperties() {
  const geo = await userData.getGeo();
  if (!geo) {
    const result = await serverApi.callUrl({
      url: API_URLS.geo
    });
    if (result.data) {
      await userData.updateData({
        geo: result.data.countryCode3
      });
    }
  }
}