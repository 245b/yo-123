"use strict";

function getLocalizedText(text, params) {
  return browser.i18n.getMessage(text, params);
}