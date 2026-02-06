"use strict";

let elementToOverlay = null;
let allowSelectElement = true;
let selectedNodesSelector = [];
function blockElementsFn() {
  if (allowSelectElement && elementToOverlay) {
    elementToOverlay = null;
  }
  const selectors = selectedNodesSelector.length ? `${selectedNodesSelector.join(', ')}${BLOCK_CSS_VALUE}` : '';
  setCustomCssIntoPage(`${pageData.customCss || ''}${selectors}`);
}
function exitBlockElements() {
  overlay.remove();
  dialog.remove();
  currentDocument.removeEventListener('mousemove', onMouseMove);
  currentDocument.removeEventListener('mouseout', onMouseOut);
  currentDocument.removeEventListener('mousedown', onMouseDown);
  currentDocument.removeEventListener('mouseup', onMouseUp);
  currentDocument.removeEventListener('keyup', onKeyUp);
}
function showSelectedOnHover({
  target
}) {
  const indexAttribute = Number(target.getAttribute('index'));
  const selected = selectedNodesSelector[indexAttribute];
  const others = selectedNodesSelector.filter((_, index) => index !== indexAttribute).join(', ');
  setCustomCssIntoPage(`${selected} {opacity:0.4 !important} ${others} ${BLOCK_CSS_VALUE}`);
}
function removeFromList(event) {
  const i = event.target.parentElement?.getAttribute('index');
  selectedNodesSelector.splice(Number(i), 1);
  applyElementSelectionOnView();
  blockElementsFn();
}
function applyElementSelectionOnView() {
  if (selectedNodesSelector.length) {
    const listContainer = currentDocument.getElementById('stndz-block-list');
    while (listContainer?.firstChild) {
      listContainer.removeChild(listContainer.firstChild);
    }
    for (let i = 0; i < selectedNodesSelector.length; i++) {
      const item = currentDocument.createElement('li');
      item.innerHTML = `Blocked Element ${i + 1}`;
      item.setAttribute('index', i.toString());
      item.addEventListener('mouseenter', showSelectedOnHover);
      const remove = currentDocument.createElement('button');
      remove.addEventListener('click', removeFromList, true);
      item.appendChild(remove);
      listContainer?.appendChild(item);
    }
    listContainer?.addEventListener('mouseleave', blockElementsFn);
    dialog.showScreen(1);
  } else {
    dialog.showScreen(0);
  }
}
function isSelectableElement(element) {
  if (element.tagName === 'BODY' || element.tagName === 'HTML') {
    return false;
  }
  if (element.clientWidth * element.clientHeight < 100) {
    return false;
  }
  if (window.top === window) {
    let {
      parentElement
    } = element;
    while (parentElement !== currentDocument.body) {
      if (parentElement === dialog.container) {
        return false;
      }
      parentElement = parentElement?.parentElement ?? null;
    }
  }
  const isDocumentSize = element.offsetWidth >= currentDocument.documentElement.offsetWidth - 5 && element.offsetHeight >= currentDocument.documentElement.offsetHeight - 5 || element.offsetWidth >= currentDocument.documentElement.clientWidth - 5 && element.offsetHeight >= currentDocument.documentElement.clientHeight - 5;
  return !isDocumentSize;
}
function onMouseMove(event) {
  if (dialog.moving !== null) {
    setStyle(dialog.element, {
      top: `${event.y + (dialog.moving?.topDiff || 0)}px`,
      left: `${event.x + (dialog.moving?.leftDiff || 0)}px`
    });
  } else if (allowSelectElement) {
    const elements = currentDocument.elementsFromPoint(event.x, event.y);
    let target = null;
    if (elements.length) {
      target = elements[0] === overlay.element ? elements[1] : elements[0];
    }
    if (target && !isSelectableElement(target)) {
      target = null;
    }
    if (target && target !== overlay.element && target !== elementToOverlay) {
      elementToOverlay = target;
      overlay.element?.setAttribute('class', 'stndz-element-overlay-standard');
      const {
        left,
        top
      } = elementToOverlay.getBoundingClientRect();
      setStyle(overlay.element, {
        display: 'block',
        left: `${left + window.scrollX - 1}px`,
        top: `${top + window.scrollY - 1}px`,
        width: `${elementToOverlay.clientWidth}px`,
        height: `${elementToOverlay.clientHeight}px`
      });
    }
  }
}
function onMouseOut() {
  if (allowSelectElement && elementToOverlay) {
    elementToOverlay = null;
  }
}
function onKeyUp(event) {
  if (event.key === 'Escape') {
    exitBlockElements();
  }
}
function onMouseDown(event) {
  event.preventDefault();
  if (event.button === 0 && elementToOverlay) {
    let element = elementToOverlay;
    const elementRect = element.getBoundingClientRect();
    let topmostElement = element.parentElement;
    while (topmostElement?.tagName !== 'BODY') {
      if (topmostElement?.clientWidth === elementRect.width && topmostElement.clientHeight === elementRect.height) {
        const topmostElementRect = topmostElement.getBoundingClientRect();
        if (topmostElementRect.left === elementRect.left && topmostElementRect.top === elementRect.top) {
          element = topmostElement;
        }
      }
      topmostElement = topmostElement?.parentElement || null;
    }
    if (dialog) {
      overlay.animate();
    }
    selectedNodesSelector.push(getElementSelector(element));
    applyElementSelectionOnView();
    blockElementsFn();
  }
}
function onMouseUp() {
  if (dialog.moving) {
    dialog.moving = null;
  }
}
function startDragging({
  x,
  y
}) {
  const rect = dialog.element?.getBoundingClientRect();
  if (rect) {
    dialog.moving = {
      leftDiff: rect.left - x,
      topDiff: rect.top - y
    };
  }
}
async function saveBlockedElement() {
  await sendMessage({
    type: MESSAGE_TYPES.addCustomCssByHost,
    payload: {
      host: pageData.hostAddress,
      selectorsInfo: selectedNodesSelector.map(s => ({
        selector: s,
        amount: currentDocument.querySelectorAll(s).length
      }))
    }
  });
  allowSelectElement = false;
  dialog.showScreen(2);
  await dialog.showCountdown();
  exitBlockElements();
}
function undoSelectElement() {
  selectedNodesSelector = [];
  dialog.showScreen(0);
  setCustomCssIntoPage(pageData.customCss);
}
function getElementCssSelector(element) {
  let css = element.tagName.toLowerCase();
  if (element.id && element.id.length > 0 && !/^[0-9]/.test(element.id)) {
    const cleanId = element.id.replace(/(((\d|-|_){3,})|([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))$/g, '');
    if (cleanId.length === element.id.length) {
      return `#${element.id}`;
    }
    css += `[id*="${cleanId}"]`;
  }
  const elementClass = element.getAttribute('class');
  if (elementClass) {
    css += elementClass.replace(/\s+/g, ' ').split(' ').filter(Boolean).map(c => `[class*="${c}"]`).join('');
  }
  return css;
}
function getElementSelector(element) {
  let selector = '';
  let forceClimbToParent = false;
  let currentElement = element;
  while (selector === '' || forceClimbToParent || selector.length > 0 && currentDocument.querySelectorAll(selector).length !== 1) {
    const parent = currentElement.parentElement;
    forceClimbToParent = false;
    let elementSelector = getElementCssSelector(currentElement);
    const weakIdentification = elementSelector === currentElement.tagName.toLowerCase();
    if (weakIdentification) {
      if (parent?.tagName === 'BODY') {
        if (currentElement.getAttribute('style')) {
          elementSelector = `${currentElement.tagName.toLowerCase()}[style="${currentElement.getAttribute('style')}"]`;
        } else if (currentElement.tagName === 'IMG' && currentElement.src) {
          elementSelector = `img[src="${currentElement.src}"]`;
        }
      } else {
        forceClimbToParent = true;
      }
    }
    let newCssSelector = elementSelector + (selector ? `>${selector}` : '');
    if (parent && parent.querySelectorAll(newCssSelector).length > 1) {
      const sameTagElements = parent.querySelectorAll(currentElement.tagName.toLowerCase());
      let directChildrenCounter = 0;
      for (const sameTagElement of sameTagElements) {
        if (sameTagElement.parentElement === parent) {
          directChildrenCounter++;
          if (sameTagElement === currentElement) {
            newCssSelector = `${currentElement.tagName.toLowerCase()}:nth-of-type(${directChildrenCounter})${selector ? `>${selector}` : ''}`;
            forceClimbToParent = true;
            break;
          }
        }
      }
    }
    selector = newCssSelector;
    if (parent?.tagName !== 'BODY' && parent) {
      currentElement = parent;
    } else {
      selector = `body>${selector}`;
      break;
    }
  }
  return selector;
}
function clearCustomBlockedNodes() {
  selectedNodesSelector = [];
}
async function blockElements() {
  if (dialog.isActive) {
    return;
  }
  allowSelectElement = true;
  overlay.create();
  if (window === window.top) {
    await dialog.create();
    if (dialog.isActive) {
      currentDocument.querySelectorAll('[data-stndz-close="true"]').forEach(element => {
        element.addEventListener('click', exitBlockElements);
      });
      currentDocument.querySelector('#stndz-block-save')?.addEventListener('click', saveBlockedElement, true);
      currentDocument.querySelector('#stndz-block-undo')?.addEventListener('click', undoSelectElement, true);
      currentDocument.querySelector('#stndz-block-header')?.addEventListener('mousedown', startDragging, true);
    }
  }
  currentDocument.addEventListener('mousemove', onMouseMove);
  currentDocument.addEventListener('mouseout', onMouseOut);
  currentDocument.addEventListener('mousedown', onMouseDown, true);
  currentDocument.addEventListener('mouseup', onMouseUp);
  currentDocument.addEventListener('keyup', onKeyUp);
}