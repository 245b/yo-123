"use strict";

class MatchedNodesCounter {
  typeId;
  observer = null;
  countedNodes = new WeakSet();
  selectorChunks = [];
  constructor(typeId) {
    this.typeId = typeId;
  }
  count(rootsToCheck) {
    let amount = 0;
    const processDocument = selector => {
      try {
        for (const node of document.querySelectorAll(selector)) {
          if (!this.countedNodes.has(node)) {
            this.countedNodes.add(node);
            amount += 1;
          }
        }
      } catch (e) {
        debug.error(`Invalid selector: ${selector}`, e);
      }
    };
    const processAddedNodes = (selector, addedElements) => {
      try {
        for (const element of addedElements) {
          if (element.matches(selector) && !this.countedNodes.has(element)) {
            this.countedNodes.add(element);
            amount += 1;
          }
          for (const node of element.querySelectorAll(selector)) {
            if (!this.countedNodes.has(node)) {
              this.countedNodes.add(node);
              amount += 1;
            }
          }
        }
      } catch (e) {
        debug.error(`Invalid selector: ${selector}`, e);
      }
    };
    for (const selector of this.selectorChunks) {
      if (rootsToCheck?.length) {
        processAddedNodes(selector, rootsToCheck);
      } else {
        processDocument(selector);
      }
    }
    if (amount > 0) {
      sendMessage({
        type: MESSAGE_TYPES.updateStatistics,
        payload: {
          typeId: this.typeId,
          amount
        }
      });
    }
  }
  handleMutations = mutations => {
    const addedRoots = new Set();
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            addedRoots.add(node);
          }
        }
      }
    }
    if (addedRoots.size > 0) {
      this.count(Array.from(addedRoots));
    }
  };
  start() {
    if (!this.selectorChunks.length) {
      return;
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', this.start.bind(this));
      return;
    }
    this.count();
    this.observer?.disconnect();
    const debouncedHandler = debounce(this.handleMutations.bind(this), 100);
    this.observer = new MutationObserver(debouncedHandler);
    this.observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }
  stop() {
    this.observer?.disconnect();
    this.observer = null;
  }
  setState(state) {
    if (state) {
      this.start();
    } else {
      this.stop();
    }
  }
  setRules(rules) {
    this.selectorChunks = Array.from({
      length: Math.ceil(rules.length / 1000)
    }, (_, i) => rules.slice(i * 1000, (i + 1) * 1000).join(','));
  }
}