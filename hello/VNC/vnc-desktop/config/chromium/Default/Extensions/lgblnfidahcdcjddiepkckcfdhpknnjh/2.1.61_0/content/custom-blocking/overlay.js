"use strict";

class Overlay {
  element = null;
  style = null;
  create() {
    this.style = currentDocument.createElement('style');
    this.style.textContent = `
  #stndz-element-overlay {
    all: unset;
    position: absolute !important;
    z-index: 2147483646 !important;
    display: none !important;
    background-color: rgba(0,155,255,0.3) !important;
    border: solid 1px rgb(0,155,255) !important;
    transition-duration: 200ms !important;
  }
  
  .stndz-element-overlay-standard::before {
    all: unset;
    content: "Click to block this element";
    position: absolute;
    font-family: "Roboto";
    left: 50%;
    transform: translateX(-50%);
    font-size:13px;
    text-align: center;
    width: 170px;
    height: 20px;
    line-height: 20px;
    border-radius: 5px;
    background-color: rgb(0,155,255);
    color: rgb(245,245,245);
    top: -30px;
    box-shadow: 0px 1px 1px 0px rgba(0,0,0,0.5);
  }
  
  .stndz-element-overlay-standard::after {
    all: unset;
    content: "▾";
    font-family: "Roboto";
    color: rgb(0,155,255);
    left: 0px;
    right: 0px;
    margin: 0 auto;
    width: 20px;
    position: absolute;
    top: -22px;
    font-size: 25px;
    line-height: 28px;
    text-shadow: 0px 1px 1px rgba(0,0,0,0.5);
  }`;
    this.element = currentDocument.createElement('div');
    this.element.id = 'stndz-element-overlay';
    currentDocument.documentElement.appendChild(this.style);
    currentDocument.documentElement.appendChild(this.element);
  }
  remove() {
    this.element?.parentNode?.removeChild(this.element);
    this.style?.parentNode?.removeChild(this.style);
  }
  animate() {
    allowSelectElement = false;
    setStyle(this.element, {
      top: `${this.element?.getBoundingClientRect()?.top || 0}px`,
      left: `${this.element?.getBoundingClientRect()?.left || 0}px`,
      position: 'fixed',
      'transition-duration': '0ms'
    });
    setTimeout(() => {
      const helperRect = dialog.element?.getBoundingClientRect();
      if (helperRect) {
        setStyle(this.element, {
          top: `${helperRect.top + helperRect.height / 2}px`,
          left: `${helperRect.left + helperRect.width / 2}px`
        });
      }
      setStyle(this.element, {
        width: '0px',
        height: '0px',
        'transition-duration': '500ms'
      });
      setTimeout(() => {
        setStyle(this.element, {
          display: 'none',
          left: '0px',
          top: '0px',
          width: '0px',
          height: '0px',
          position: 'absolute',
          'transition-duration': '200ms'
        });
        allowSelectElement = true;
      }, 500);
    }, 0);
  }
}
const overlay = new Overlay();