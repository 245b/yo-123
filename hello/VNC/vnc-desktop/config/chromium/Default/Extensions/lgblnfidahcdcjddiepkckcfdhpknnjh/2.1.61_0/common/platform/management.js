"use strict";

async function getAllExtensions() {
  return browser.management.getAll();
}