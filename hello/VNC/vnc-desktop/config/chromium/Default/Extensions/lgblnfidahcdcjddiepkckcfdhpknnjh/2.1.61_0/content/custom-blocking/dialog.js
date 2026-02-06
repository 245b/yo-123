"use strict";

class Dialog {
  element = null;
  container = null;
  moving = null;
  isActive = false;
  async create() {
    this.container = currentDocument.createElement('div');
    this.container.id = 'stndz-block-window-container';
    this.container.style.cssText = `
      all: initial;
      position: fixed;
      z-index: 2147483647;
      top: 0px;
      left: 0px;
      border: none;
      padding: 0px;
      margin: 0px;
      width: 100%;
      display: block !important;`;
    currentDocument.documentElement.appendChild(this.container);
    try {
      const result = await fetch(getExtensionRelativeUrl('/views/web_accessible/block-element/view.html'));
      const data = await result.text();
      this.container.innerHTML = data.replace(/{{path}}/g, getExtensionRelativeUrl('/views/web_accessible')) || '';
      this.element = currentDocument.getElementById('stndz-block-window');
      this.isActive = true;
    } catch (e) {}
  }
  remove() {
    this.isActive = false;
    this.container?.parentNode?.removeChild(this.container);
  }
  showScreen(index) {
    for (let i = 0; i < 3; i++) {
      const header = currentDocument.getElementById(`stndz-block-header-${i}`);
      const content = currentDocument.getElementById(`stndz-block-content-${i}`);
      if (content && header) {
        if (i === index) {
          header.classList.remove('stndz-block-hidden');
          content.classList.remove('stndz-block-hidden');
        } else {
          header.classList.add('stndz-block-hidden');
          content.classList.add('stndz-block-hidden');
        }
      }
    }
  }
  showCountdown() {
    let seconds = 4;
    const button = currentDocument.querySelector('#stndz-block-content-2 button');
    const {
      resolve,
      promise
    } = Promise.withResolvers();
    const interval = setInterval(() => {
      if (button) {
        button.innerHTML = `Done (${seconds})`;
      }
      if (seconds <= 0) {
        clearInterval(interval);
        resolve(null);
      }
      seconds--;
    }, 1000);
    return promise;
  }
}
const dialog = new Dialog();