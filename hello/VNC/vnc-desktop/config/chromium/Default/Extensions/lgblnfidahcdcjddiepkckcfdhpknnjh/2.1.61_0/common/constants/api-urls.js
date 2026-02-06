"use strict";

const staticBaseUrl = (() => {
  return 'https://static.standsapp.org';
})();
const API_URLS = {
  log: 'https://prod.standsapp.org/api/v2/events',
  user: 'https://prod.standsapp.org/api/v2/user',
  heartbeat: 'https://prod.standsapp.org/user/heartbeat',
  geo: 'https://prod.standsapp.org/geolookup',
  reportUrl: 'https://thepromise-event.standsapp.org/convert',
  notifications: 'https://prod.standsapp.org/api/v2/user/notifications/',
  listsManagement: 'https://prod.standsapp.org/lists_management/css-increments',
  cssLatest: `${staticBaseUrl}/lists/css-latest`,
  cssIncrement: `${staticBaseUrl}/lists/css-increments/`,
  trackersList: `${staticBaseUrl}/lists/trackers-list`
};