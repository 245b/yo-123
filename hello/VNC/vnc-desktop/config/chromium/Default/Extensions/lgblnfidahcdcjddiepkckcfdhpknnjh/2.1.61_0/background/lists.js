"use strict";

const trackersListData = new DataUpdaterFromServer({
  name: 'trackersList',
  expiration: 90 * 24 * 60,
  url: API_URLS.trackersList
});
async function loadLists() {
  await Promise.allSettled([cssListDataComponent.start(), trackersListData.start()]);
}