"use strict";

async function sendMessage(message) {
  try {
    await browser.runtime.sendMessage(message);
  } catch (error) {
    debug.error(`Error sending message with type ${message.type}`, error);
  }
}