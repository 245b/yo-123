"use strict";

function setCssValueScript(selector, cssProp, cssValue) {
  const elems = document.querySelectorAll(selector);
  for (const elem of elems) {
    const checkElem = elem;
    if (checkElem && checkElem.style.getPropertyValue(cssProp) !== cssValue) {
      elem.style.setProperty(cssProp, cssValue, 'important');
    }
  }
}