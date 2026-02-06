"use strict";

function hideElemsInShadowDom(shadowNode, shadowRootSelectors, elemSelectors, hideByHeight) {
  const hideElems = debounce(() => {
    if (shadowRootSelectors.length || elemSelectors.length) {
      const shadowNodes = getAllShadowDomNodes();
      if (shadowRootSelectors.length) {
        shadowNodes.forEach(shadowRoot => {
          for (const selector of shadowRootSelectors) {
            if (shadowRoot.matches(selector)) {
              shadowRoot.style.cssText = 'display: none !important';
            }
          }
        });
      }
      if (elemSelectors.length) {
        const thatNode = shadowNodes.filter(node => node.matches(shadowNode))[0];
        const cssText = hideByHeight ? 'height: 0 !important' : 'display: none !important';
        if (thatNode) {
          for (const elemSelector of elemSelectors) {
            const queryElems = thatNode.querySelectorAll(elemSelector);
            if (queryElems.length) {
              queryElems.forEach(elem => {
                elem.style.cssText = cssText;
              });
            }
          }
        }
        if (thatNode?.shadowRoot) {
          for (const elemSelector of elemSelectors) {
            const queryShadowElems = thatNode.shadowRoot.querySelectorAll(elemSelector);
            if (queryShadowElems.length) {
              queryShadowElems.forEach(elem => {
                elem.style.cssText = cssText;
              });
            }
          }
        }
      }
    }
  }, 1000);
  setTimeout(() => {
    hideElems();
    const shadowNodes = getAllShadowDomNodes();
    const thatNode = shadowNodes.filter(node => node.matches(shadowNode))[0];
    const options = {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true
    };
    if (thatNode) {
      if (thatNode.shadowRoot) {
        new MutationObserver(hideElems).observe(thatNode.shadowRoot, options);
      }
      new MutationObserver(hideElems).observe(thatNode, options);
    }
  }, 2000);
}