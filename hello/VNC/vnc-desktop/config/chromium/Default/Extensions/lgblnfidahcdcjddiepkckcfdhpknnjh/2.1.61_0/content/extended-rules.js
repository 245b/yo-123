"use strict";

class ExtendedRules {
  rules = [];
  blockType;
  attribute;
  styleElementId;
  observer = null;
  hiddenNodes = new WeakSet();
  constructor(blockType) {
    this.blockType = blockType;
    this.attribute = `data-stndz-hidden-${blockType}`;
    this.styleElementId = `stndz-extended-rules-${blockType}`;
  }
  findClosingParen(str, start) {
    let depth = 1;
    for (let i = start; i < str.length; i++) {
      const char = str[i];
      if (char === '(') depth++;else if (char === ')' && --depth === 0) return i;
    }
    return -1;
  }
  hasExtendedPseudoClass(str) {
    return [':has(', ':-abp-has(', ':-abp-contains(', ':contains(', ':upward('].some(pseudo => str.includes(pseudo));
  }
  findPseudoClasses(rule, pos) {
    return [{
      pattern: ':not(',
      type: 'not',
      offset: 5
    }, {
      pattern: ':has(',
      type: 'has',
      offset: 5
    }, {
      pattern: ':-abp-has(',
      type: 'abp-has',
      offset: 10
    }, {
      pattern: ':-abp-contains(',
      type: 'abp-contains',
      offset: 15
    }, {
      pattern: ':contains(',
      type: 'contains',
      offset: 10
    }, {
      pattern: ':upward(',
      type: 'upward',
      offset: 8
    }].map(({
      pattern,
      type,
      offset
    }) => ({
      index: rule.indexOf(pattern, pos),
      type,
      offset
    })).filter(info => info.index !== -1).sort((a, b) => a.index - b.index);
  }
  parseUpwardArgument(content) {
    const trimmed = content.trim();
    const numericValue = parseInt(trimmed, 10);
    return !isNaN(numericValue) && numericValue.toString() === trimmed ? numericValue : trimmed;
  }
  parse(rule) {
    let pos = 0;
    const result = [];
    let baseSelector = '';
    let currentRule = null;
    while (pos < rule.length) {
      const pseudoClasses = this.findPseudoClasses(rule, pos);
      if (pseudoClasses.length === 0) {
        baseSelector += rule.substring(pos);
        break;
      }
      const {
        index,
        type,
        offset
      } = pseudoClasses[0];
      baseSelector += rule.substring(pos, index);
      const contentStart = index + offset;
      const contentEnd = this.findClosingParen(rule, contentStart);
      if (contentEnd === -1) {
        debug.error('Mismatched parentheses:', rule);
        return [];
      }
      const content = rule.substring(contentStart, contentEnd);
      if (!currentRule && (type !== 'not' || this.hasExtendedPseudoClass(content))) {
        currentRule = {
          selector: baseSelector
        };
        result.push(currentRule);
      }
      baseSelector = this.processPseudoClass(type, content, baseSelector, currentRule);
      pos = contentEnd + 1;
    }
    this.finalizeRule(result, currentRule, baseSelector);
    return result;
  }
  processPseudoClass(type, content, baseSelector, currentRule) {
    switch (type) {
      case 'not':
        return this.handleNotPseudoClass(content, baseSelector, currentRule);
      case 'has':
      case 'abp-has':
        this.handleHasPseudoClass(content, currentRule);
        break;
      case 'abp-contains':
      case 'contains':
        currentRule.text = content;
        break;
      case 'upward':
        currentRule.upward = this.parseUpwardArgument(content);
        break;
    }
    return baseSelector;
  }
  handleNotPseudoClass(content, baseSelector, currentRule) {
    if (this.hasExtendedPseudoClass(content)) {
      const notContent = this.parse(content);
      if (notContent.length > 0) {
        currentRule.not = currentRule.not || [];
        currentRule.not.push(...notContent);
      }
      return baseSelector;
    } else {
      return `${baseSelector}:not(${content})`;
    }
  }
  handleHasPseudoClass(content, currentRule) {
    const hasRules = this.parse(content);
    if (hasRules.length > 0) {
      currentRule.has = currentRule.has || [];
      currentRule.has.push(...hasRules);
    }
  }
  finalizeRule(result, currentRule, baseSelector) {
    if (baseSelector && !currentRule) {
      result.push({
        selector: baseSelector.trim()
      });
    } else if (currentRule) {
      currentRule.selector = (currentRule.selector || baseSelector).trim();
    }
  }
  buildSelector(rule, root) {
    const {
      selector
    } = rule;
    if (root !== document.body && root !== document.documentElement) {
      const firstChar = selector.charAt(0);
      if (firstChar === '>') {
        return `:scope ${selector.trim()}`;
      }
    }
    return selector;
  }
  queryElements(rule, root) {
    const selector = this.buildSelector(rule, root);
    const firstChar = selector.charAt(0);
    if (root !== document.body && root !== document.documentElement && (firstChar === '+' || firstChar === '~')) {
      return this.querySelectorAllWithCombinators(root, selector);
    }
    return Array.from(root.querySelectorAll(selector));
  }
  findNodesByRule(rules, root = document.body) {
    const result = [];
    for (const rule of rules) {
      try {
        if (!rule.selector.trim()) {
          this.handleEmptySelector(rule, root, result);
          continue;
        }
        const candidates = this.queryElements(rule, root).filter(node => !this.hiddenNodes.has(node));
        if (candidates.length === 0) continue;
        let filtered = candidates.filter(node => this.elementMatchesConditions(node, rule));
        if (rule.upward !== undefined) {
          filtered = this.applyUpwardTraversal(filtered, rule.upward);
        }
        result.push(...filtered);
      } catch (e) {
        debug.error('Error in findNodesByRule', e, rule);
      }
    }
    return result;
  }
  handleEmptySelector(rule, root, result) {
    if (root instanceof HTMLElement && this.elementMatchesConditions(root, rule) && !this.hiddenNodes.has(root)) {
      result.push(root);
    }
  }
  querySelectorAllWithCombinators(node, selector) {
    const parent = node.parentElement;
    if (!parent) return [];
    let pos = 1;
    let currentNode = node;
    while (currentNode.previousElementSibling) {
      currentNode = currentNode.previousElementSibling;
      pos++;
    }
    try {
      return Array.from(parent.querySelectorAll(`:scope > :nth-child(${pos})${selector}`));
    } catch (e) {
      debug.error('Error in querySelectorAllWithCombinators:', selector, e);
      return [];
    }
  }
  applyUpwardTraversal(elements, upwardArg) {
    const result = [];
    for (const element of elements) {
      let targetElement = null;
      if (typeof upwardArg === 'number') {
        targetElement = this.traverseUpBySteps(element, upwardArg);
      } else {
        targetElement = this.findClosestAncestor(element, upwardArg);
      }
      if (targetElement && !this.hiddenNodes.has(targetElement)) {
        result.push(targetElement);
      }
    }
    return result;
  }
  traverseUpBySteps(element, steps) {
    let current = element;
    while (current && steps > 0) {
      current = current.parentElement;
      steps--;
    }
    return current;
  }
  findClosestAncestor(element, selector) {
    const parent = element.parentElement;
    if (!parent) return null;
    try {
      return parent.closest(selector);
    } catch (e) {
      debug.error('Invalid upward selector:', selector, e);
      return null;
    }
  }
  elementMatchesConditions(element, rule) {
    return this.checkNotConditions(element, rule) && this.checkHasConditions(element, rule) && this.checkTextCondition(element, rule);
  }
  checkNotConditions(element, rule) {
    if (!rule.not?.length) return true;
    return rule.not.every(notRule => {
      if (!notRule.selector.trim() && notRule.has) {
        return !notRule.has.some(hasRule => this.findNodesByRule([hasRule], element).length > 0);
      }
      return this.findNodesByRule([notRule], element).length === 0;
    });
  }
  checkHasConditions(element, rule) {
    if (!rule.has?.length) return true;
    return rule.has.every(hasRule => this.findNodesByRule([hasRule], element).length > 0);
  }
  checkTextCondition(element, rule) {
    if (!rule.text) return true;
    return this.checkTextContent(element, rule.text);
  }
  checkTextContent(element, textCondition) {
    const nodeText = element.textContent || '';
    if (!textCondition.includes('|')) {
      return nodeText.includes(textCondition);
    }
    return textCondition.split('|').some(part => {
      const trimmed = part.trim();
      if (trimmed.startsWith('/') || trimmed.endsWith('/')) {
        const content = trimmed.replace(/^\/|\/$/g, '');
        return nodeText.includes(content);
      }
      return nodeText.includes(trimmed);
    });
  }
  applyAll() {
    let amount = 0;
    for (const rule of this.rules) {
      try {
        for (const node of this.findNodesByRule(rule)) {
          if (!this.hiddenNodes.has(node)) {
            node.setAttribute(this.attribute, 'true');
            this.hiddenNodes.add(node);
            amount++;
          }
        }
      } catch (e) {
        debug.error('Error in applyExtendedRules', e);
      }
    }
    if (amount > 0) {
      this.updateStatistics(amount);
    }
  }
  updateStatistics(amount) {
    sendMessage({
      type: MESSAGE_TYPES.updateStatistics,
      payload: {
        typeId: this.blockType,
        amount
      }
    });
  }
  createStyleElement() {
    const styleElement = currentDocument.createElement('style');
    styleElement.id = this.styleElementId;
    styleElement.textContent = `[${this.attribute}="true"] ${BLOCK_CSS_VALUE}`;
    addElementToHead(styleElement);
  }
  startObserver() {
    this.observer?.disconnect();
    const debouncedHandler = debounce(this.applyAll.bind(this), 100);
    this.observer = new MutationObserver(debouncedHandler);
    this.observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }
  start() {
    if (!this.rules.length) return;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', this.start.bind(this));
      return;
    }
    this.createStyleElement();
    this.applyAll();
    this.startObserver();
  }
  stop() {
    currentDocument.querySelector(`style[id="${this.styleElementId}"]`)?.remove();
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
    this.rules = rules.map(rule => this.parse(rule));
  }
}