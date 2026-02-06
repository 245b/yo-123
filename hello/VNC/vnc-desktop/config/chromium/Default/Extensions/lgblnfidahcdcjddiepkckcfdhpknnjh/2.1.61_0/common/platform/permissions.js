"use strict";

async function hasPermission(permission) {
  return browser.permissions.contains({
    permissions: [permission]
  });
}