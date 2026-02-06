"use strict";

function addElementToHead(element) {
  if (document.head) {
    document.head.prepend(element);
  } else {
    window.setTimeout(() => {
      addElementToHead(element);
    }, 10);
  }
}
function getAllShadowDomNodes() {
  const shadowNodes = [];
  const getAllNodes = node => {
    if (node?.shadowRoot) {
      shadowNodes.push(node);
    }
    if (node?.children) {
      for (const child of node.children) {
        getAllNodes(child);
      }
      if (node.shadowRoot) {
        getAllNodes(node.shadowRoot);
      }
    }
  };
  getAllNodes(document.body);
  return shadowNodes;
}
function setStyle(element, style) {
  for (const key in style) {
    element?.style.setProperty(key, style[key], 'important');
  }
}
function setCustomCssIntoPage(customCss) {
  let styleElement = document.querySelector('#stndz-custom-css');
  if (!styleElement) {
    styleElement = document.createElement('style');
    styleElement.id = 'stndz-custom-css';
    addElementToHead(styleElement);
  }
  styleElement.textContent = customCss || '';
}