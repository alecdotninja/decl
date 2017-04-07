(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var MutationObserver = window.MutationObserver
  || window.WebKitMutationObserver
  || window.MozMutationObserver;

/*
 * Copyright 2012 The Polymer Authors. All rights reserved.
 * Use of this source code is goverened by a BSD-style
 * license that can be found in the LICENSE file.
 */

var WeakMap = window.WeakMap;

if (typeof WeakMap === 'undefined') {
  var defineProperty = Object.defineProperty;
  var counter = Date.now() % 1e9;

  WeakMap = function() {
    this.name = '__st' + (Math.random() * 1e9 >>> 0) + (counter++ + '__');
  };

  WeakMap.prototype = {
    set: function(key, value) {
      var entry = key[this.name];
      if (entry && entry[0] === key)
        entry[1] = value;
      else
        defineProperty(key, this.name, {value: [key, value], writable: true});
      return this;
    },
    get: function(key) {
      var entry;
      return (entry = key[this.name]) && entry[0] === key ?
          entry[1] : undefined;
    },
    'delete': function(key) {
      var entry = key[this.name];
      if (!entry) return false;
      var hasValue = entry[0] === key;
      entry[0] = entry[1] = undefined;
      return hasValue;
    },
    has: function(key) {
      var entry = key[this.name];
      if (!entry) return false;
      return entry[0] === key;
    }
  };
}

var registrationsTable = new WeakMap();

// We use setImmediate or postMessage for our future callback.
var setImmediate = window.msSetImmediate;

// Use post message to emulate setImmediate.
if (!setImmediate) {
  var setImmediateQueue = [];
  var sentinel = String(Math.random());
  window.addEventListener('message', function(e) {
    if (e.data === sentinel) {
      var queue = setImmediateQueue;
      setImmediateQueue = [];
      queue.forEach(function(func) {
        func();
      });
    }
  });
  setImmediate = function(func) {
    setImmediateQueue.push(func);
    window.postMessage(sentinel, '*');
  };
}

// This is used to ensure that we never schedule 2 callas to setImmediate
var isScheduled = false;

// Keep track of observers that needs to be notified next time.
var scheduledObservers = [];

/**
 * Schedules |dispatchCallback| to be called in the future.
 * @param {MutationObserver} observer
 */
function scheduleCallback(observer) {
  scheduledObservers.push(observer);
  if (!isScheduled) {
    isScheduled = true;
    setImmediate(dispatchCallbacks);
  }
}

function wrapIfNeeded(node) {
  return window.ShadowDOMPolyfill &&
      window.ShadowDOMPolyfill.wrapIfNeeded(node) ||
      node;
}

function dispatchCallbacks() {
  // http://dom.spec.whatwg.org/#mutation-observers

  isScheduled = false; // Used to allow a new setImmediate call above.

  var observers = scheduledObservers;
  scheduledObservers = [];
  // Sort observers based on their creation UID (incremental).
  observers.sort(function(o1, o2) {
    return o1.uid_ - o2.uid_;
  });

  var anyNonEmpty = false;
  observers.forEach(function(observer) {

    // 2.1, 2.2
    var queue = observer.takeRecords();
    // 2.3. Remove all transient registered observers whose observer is mo.
    removeTransientObserversFor(observer);

    // 2.4
    if (queue.length) {
      observer.callback_(queue, observer);
      anyNonEmpty = true;
    }
  });

  // 3.
  if (anyNonEmpty)
    dispatchCallbacks();
}

function removeTransientObserversFor(observer) {
  observer.nodes_.forEach(function(node) {
    var registrations = registrationsTable.get(node);
    if (!registrations)
      return;
    registrations.forEach(function(registration) {
      if (registration.observer === observer)
        registration.removeTransientObservers();
    });
  });
}

/**
 * This function is used for the "For each registered observer observer (with
 * observer's options as options) in target's list of registered observers,
 * run these substeps:" and the "For each ancestor ancestor of target, and for
 * each registered observer observer (with options options) in ancestor's list
 * of registered observers, run these substeps:" part of the algorithms. The
 * |options.subtree| is checked to ensure that the callback is called
 * correctly.
 *
 * @param {Node} target
 * @param {function(MutationObserverInit):MutationRecord} callback
 */
function forEachAncestorAndObserverEnqueueRecord(target, callback) {
  for (var node = target; node; node = node.parentNode) {
    var registrations = registrationsTable.get(node);

    if (registrations) {
      for (var j = 0; j < registrations.length; j++) {
        var registration = registrations[j];
        var options = registration.options;

        // Only target ignores subtree.
        if (node !== target && !options.subtree)
          continue;

        var record = callback(options);
        if (record)
          registration.enqueue(record);
      }
    }
  }
}

var uidCounter = 0;

/**
 * The class that maps to the DOM MutationObserver interface.
 * @param {Function} callback.
 * @constructor
 */
function JsMutationObserver(callback) {
  this.callback_ = callback;
  this.nodes_ = [];
  this.records_ = [];
  this.uid_ = ++uidCounter;
}

JsMutationObserver.prototype = {
  observe: function(target, options) {
    target = wrapIfNeeded(target);

    // 1.1
    if (!options.childList && !options.attributes && !options.characterData ||

        // 1.2
        options.attributeOldValue && !options.attributes ||

        // 1.3
        options.attributeFilter && options.attributeFilter.length &&
            !options.attributes ||

        // 1.4
        options.characterDataOldValue && !options.characterData) {

      throw new SyntaxError();
    }

    var registrations = registrationsTable.get(target);
    if (!registrations)
      registrationsTable.set(target, registrations = []);

    // 2
    // If target's list of registered observers already includes a registered
    // observer associated with the context object, replace that registered
    // observer's options with options.
    var registration;
    for (var i = 0; i < registrations.length; i++) {
      if (registrations[i].observer === this) {
        registration = registrations[i];
        registration.removeListeners();
        registration.options = options;
        break;
      }
    }

    // 3.
    // Otherwise, add a new registered observer to target's list of registered
    // observers with the context object as the observer and options as the
    // options, and add target to context object's list of nodes on which it
    // is registered.
    if (!registration) {
      registration = new Registration(this, target, options);
      registrations.push(registration);
      this.nodes_.push(target);
    }

    registration.addListeners();
  },

  disconnect: function() {
    this.nodes_.forEach(function(node) {
      var registrations = registrationsTable.get(node);
      for (var i = 0; i < registrations.length; i++) {
        var registration = registrations[i];
        if (registration.observer === this) {
          registration.removeListeners();
          registrations.splice(i, 1);
          // Each node can only have one registered observer associated with
          // this observer.
          break;
        }
      }
    }, this);
    this.records_ = [];
  },

  takeRecords: function() {
    var copyOfRecords = this.records_;
    this.records_ = [];
    return copyOfRecords;
  }
};

/**
 * @param {string} type
 * @param {Node} target
 * @constructor
 */
function MutationRecord(type, target) {
  this.type = type;
  this.target = target;
  this.addedNodes = [];
  this.removedNodes = [];
  this.previousSibling = null;
  this.nextSibling = null;
  this.attributeName = null;
  this.attributeNamespace = null;
  this.oldValue = null;
}

function copyMutationRecord(original) {
  var record = new MutationRecord(original.type, original.target);
  record.addedNodes = original.addedNodes.slice();
  record.removedNodes = original.removedNodes.slice();
  record.previousSibling = original.previousSibling;
  record.nextSibling = original.nextSibling;
  record.attributeName = original.attributeName;
  record.attributeNamespace = original.attributeNamespace;
  record.oldValue = original.oldValue;
  return record;
};

// We keep track of the two (possibly one) records used in a single mutation.
var currentRecord, recordWithOldValue;

/**
 * Creates a record without |oldValue| and caches it as |currentRecord| for
 * later use.
 * @param {string} oldValue
 * @return {MutationRecord}
 */
function getRecord(type, target) {
  return currentRecord = new MutationRecord(type, target);
}

/**
 * Gets or creates a record with |oldValue| based in the |currentRecord|
 * @param {string} oldValue
 * @return {MutationRecord}
 */
function getRecordWithOldValue(oldValue) {
  if (recordWithOldValue)
    return recordWithOldValue;
  recordWithOldValue = copyMutationRecord(currentRecord);
  recordWithOldValue.oldValue = oldValue;
  return recordWithOldValue;
}

function clearRecords() {
  currentRecord = recordWithOldValue = undefined;
}

/**
 * @param {MutationRecord} record
 * @return {boolean} Whether the record represents a record from the current
 * mutation event.
 */
function recordRepresentsCurrentMutation(record) {
  return record === recordWithOldValue || record === currentRecord;
}

/**
 * Selects which record, if any, to replace the last record in the queue.
 * This returns |null| if no record should be replaced.
 *
 * @param {MutationRecord} lastRecord
 * @param {MutationRecord} newRecord
 * @param {MutationRecord}
 */
function selectRecord(lastRecord, newRecord) {
  if (lastRecord === newRecord)
    return lastRecord;

  // Check if the the record we are adding represents the same record. If
  // so, we keep the one with the oldValue in it.
  if (recordWithOldValue && recordRepresentsCurrentMutation(lastRecord))
    return recordWithOldValue;

  return null;
}

/**
 * Class used to represent a registered observer.
 * @param {MutationObserver} observer
 * @param {Node} target
 * @param {MutationObserverInit} options
 * @constructor
 */
function Registration(observer, target, options) {
  this.observer = observer;
  this.target = target;
  this.options = options;
  this.transientObservedNodes = [];
}

Registration.prototype = {
  enqueue: function(record) {
    var records = this.observer.records_;
    var length = records.length;

    // There are cases where we replace the last record with the new record.
    // For example if the record represents the same mutation we need to use
    // the one with the oldValue. If we get same record (this can happen as we
    // walk up the tree) we ignore the new record.
    if (records.length > 0) {
      var lastRecord = records[length - 1];
      var recordToReplaceLast = selectRecord(lastRecord, record);
      if (recordToReplaceLast) {
        records[length - 1] = recordToReplaceLast;
        return;
      }
    } else {
      scheduleCallback(this.observer);
    }

    records[length] = record;
  },

  addListeners: function() {
    this.addListeners_(this.target);
  },

  addListeners_: function(node) {
    var options = this.options;
    if (options.attributes)
      node.addEventListener('DOMAttrModified', this, true);

    if (options.characterData)
      node.addEventListener('DOMCharacterDataModified', this, true);

    if (options.childList)
      node.addEventListener('DOMNodeInserted', this, true);

    if (options.childList || options.subtree)
      node.addEventListener('DOMNodeRemoved', this, true);
  },

  removeListeners: function() {
    this.removeListeners_(this.target);
  },

  removeListeners_: function(node) {
    var options = this.options;
    if (options.attributes)
      node.removeEventListener('DOMAttrModified', this, true);

    if (options.characterData)
      node.removeEventListener('DOMCharacterDataModified', this, true);

    if (options.childList)
      node.removeEventListener('DOMNodeInserted', this, true);

    if (options.childList || options.subtree)
      node.removeEventListener('DOMNodeRemoved', this, true);
  },

  /**
   * Adds a transient observer on node. The transient observer gets removed
   * next time we deliver the change records.
   * @param {Node} node
   */
  addTransientObserver: function(node) {
    // Don't add transient observers on the target itself. We already have all
    // the required listeners set up on the target.
    if (node === this.target)
      return;

    this.addListeners_(node);
    this.transientObservedNodes.push(node);
    var registrations = registrationsTable.get(node);
    if (!registrations)
      registrationsTable.set(node, registrations = []);

    // We know that registrations does not contain this because we already
    // checked if node === this.target.
    registrations.push(this);
  },

  removeTransientObservers: function() {
    var transientObservedNodes = this.transientObservedNodes;
    this.transientObservedNodes = [];

    transientObservedNodes.forEach(function(node) {
      // Transient observers are never added to the target.
      this.removeListeners_(node);

      var registrations = registrationsTable.get(node);
      for (var i = 0; i < registrations.length; i++) {
        if (registrations[i] === this) {
          registrations.splice(i, 1);
          // Each node can only have one registered observer associated with
          // this observer.
          break;
        }
      }
    }, this);
  },

  handleEvent: function(e) {
    // Stop propagation since we are managing the propagation manually.
    // This means that other mutation events on the page will not work
    // correctly but that is by design.
    e.stopImmediatePropagation();

    switch (e.type) {
      case 'DOMAttrModified':
        // http://dom.spec.whatwg.org/#concept-mo-queue-attributes

        var name = e.attrName;
        var namespace = e.relatedNode.namespaceURI;
        var target = e.target;

        // 1.
        var record = new getRecord('attributes', target);
        record.attributeName = name;
        record.attributeNamespace = namespace;

        // 2.
        var oldValue =
            e.attrChange === MutationEvent.ADDITION ? null : e.prevValue;

        forEachAncestorAndObserverEnqueueRecord(target, function(options) {
          // 3.1, 4.2
          if (!options.attributes)
            return;

          // 3.2, 4.3
          if (options.attributeFilter && options.attributeFilter.length &&
              options.attributeFilter.indexOf(name) === -1 &&
              options.attributeFilter.indexOf(namespace) === -1) {
            return;
          }
          // 3.3, 4.4
          if (options.attributeOldValue)
            return getRecordWithOldValue(oldValue);

          // 3.4, 4.5
          return record;
        });

        break;

      case 'DOMCharacterDataModified':
        // http://dom.spec.whatwg.org/#concept-mo-queue-characterdata
        var target = e.target;

        // 1.
        var record = getRecord('characterData', target);

        // 2.
        var oldValue = e.prevValue;


        forEachAncestorAndObserverEnqueueRecord(target, function(options) {
          // 3.1, 4.2
          if (!options.characterData)
            return;

          // 3.2, 4.3
          if (options.characterDataOldValue)
            return getRecordWithOldValue(oldValue);

          // 3.3, 4.4
          return record;
        });

        break;

      case 'DOMNodeRemoved':
        this.addTransientObserver(e.target);
        // Fall through.
      case 'DOMNodeInserted':
        // http://dom.spec.whatwg.org/#concept-mo-queue-childlist
        var target = e.relatedNode;
        var changedNode = e.target;
        var addedNodes, removedNodes;
        if (e.type === 'DOMNodeInserted') {
          addedNodes = [changedNode];
          removedNodes = [];
        } else {

          addedNodes = [];
          removedNodes = [changedNode];
        }
        var previousSibling = changedNode.previousSibling;
        var nextSibling = changedNode.nextSibling;

        // 1.
        var record = getRecord('childList', target);
        record.addedNodes = addedNodes;
        record.removedNodes = removedNodes;
        record.previousSibling = previousSibling;
        record.nextSibling = nextSibling;

        forEachAncestorAndObserverEnqueueRecord(target, function(options) {
          // 2.1, 3.2
          if (!options.childList)
            return;

          // 2.2, 3.3
          return record;
        });

    }

    clearRecords();
  }
};

if (!MutationObserver) {
  MutationObserver = JsMutationObserver;
}

module.exports = MutationObserver;

},{}],2:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var scope_1 = require("./scope");
exports.Scope = scope_1.Scope;
exports.default = Decl;
var Decl = (function () {
    function Decl(root) {
        this.scope = scope_1.Scope.buildRootScope(root);
    }
    Decl.select = function (matcher, executor) {
        return this.getDefaultInstance().select(matcher, executor);
    };
    Decl.on = function (matcher, executor) {
        return this.getDefaultInstance().on(matcher, executor);
    };
    Decl.getRootScope = function () {
        return this.getDefaultInstance().getRootScope();
    };
    Decl.collectScopes = function () {
        return this.getDefaultInstance().collectScopes();
    };
    Decl.drawTree = function () {
        return this.getDefaultInstance().drawTree();
    };
    Decl.getDefaultInstance = function () {
        return this.defaultInstance || (this.defaultInstance = new Decl(document.documentElement));
    };
    Decl.setDefaultInstance = function (decl) {
        return this.defaultInstance = decl;
    };
    Decl.pristine = function () {
        if (this.defaultInstance) {
            this.defaultInstance.pristine();
            this.defaultInstance = null;
        }
    };
    Decl.prototype.select = function (matcher, executor) {
        return this.scope.select(matcher, executor);
    };
    Decl.prototype.on = function (matcher, executor) {
        return this.scope.on(matcher, executor);
    };
    Decl.prototype.getRootScope = function () {
        return this.scope;
    };
    Decl.prototype.collectScopes = function () {
        return [this.scope].concat(this.scope.collectDescendantScopes());
    };
    Decl.prototype.drawTree = function () {
        return this.scope.drawTree();
    };
    Decl.prototype.pristine = function () {
        this.scope.pristine();
    };
    return Decl;
}());
exports.Decl = Decl;
// Export to a global for the browser (there *has* to be a better way to do this!)
if (typeof (window) !== 'undefined') {
    window.Decl = Decl;
}

},{"./scope":4}],3:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = ElementCollector;
var ElementCollector = (function () {
    function ElementCollector() {
    }
    ElementCollector.isMatchingElement = function (rootElement, elementMatcher) {
        return this.getInstance().isMatchingElement(rootElement, elementMatcher);
    };
    ElementCollector.collectMatchingElements = function (rootElement, elementMatcher) {
        return this.getInstance().collectMatchingElements(rootElement, elementMatcher);
    };
    ElementCollector.getInstance = function () {
        return this.instance || (this.instance = new ElementCollector());
    };
    ElementCollector.prototype.isMatchingElement = function (element, elementMatcher) {
        switch (typeof (elementMatcher)) {
            default:
                throw new TypeError(ElementCollector.ELEMENT_MATCHER_TYPE_ERROR_MESSAGE);
            case 'string':
                var cssSelector = elementMatcher;
                return this.isMatchingElementFromCssSelector(element, cssSelector);
            case 'object':
                var object = elementMatcher;
                return this.isMatchingElementFromObject(element, object);
            case 'function':
                var elementVistor = elementMatcher;
                return this.isMatchingElementFromElementVistor(element, elementVistor);
        }
    };
    ElementCollector.prototype.collectMatchingElements = function (element, elementMatcher) {
        switch (typeof (elementMatcher)) {
            default:
                throw new TypeError(ElementCollector.ELEMENT_MATCHER_TYPE_ERROR_MESSAGE);
            case 'string':
                var cssSelector = elementMatcher;
                return this.collectMatchingElementsFromCssSelector(element, cssSelector);
            case 'object':
                var object = elementMatcher;
                return this.collectMatchingElementsFromObject(element, object);
            case 'function':
                var elementVistor = elementMatcher;
                return this.collectMatchingElementsFromElementVistor(element, elementVistor);
        }
    };
    ElementCollector.prototype.isMatchingElementFromCssSelector = function (element, cssSelector) {
        if (typeof (element.matches) === 'function') {
            return element.matches(cssSelector);
        }
        else {
            return isMemberOfArrayLike(document.querySelectorAll(cssSelector), element);
        }
    };
    ElementCollector.prototype.isMatchingElementFromObject = function (element, object) {
        if (object === null) {
            return false;
        }
        else {
            if (isArrayLike(object)) {
                var arrayLike = object;
                if (arrayLike.length === 0 || arrayLike[0] instanceof Element) {
                    return isMemberOfArrayLike(arrayLike, element);
                }
                else {
                    throw new TypeError(ElementCollector.ELEMENT_MATCHER_TYPE_ERROR_MESSAGE);
                }
            }
            else {
                throw new TypeError(ElementCollector.ELEMENT_MATCHER_TYPE_ERROR_MESSAGE);
            }
        }
    };
    ElementCollector.prototype.isMatchingElementFromElementVistor = function (element, elementVistor) {
        var visitorResult = elementVistor(element);
        if (typeof (visitorResult) === 'boolean') {
            var isMatch = visitorResult;
            return isMatch;
        }
        else {
            var elementMatcher = visitorResult;
            return this.isMatchingElement(element, elementMatcher);
        }
    };
    ElementCollector.prototype.collectMatchingElementsFromCssSelector = function (element, cssSelector) {
        return toArray(element.querySelectorAll(cssSelector));
    };
    ElementCollector.prototype.collectMatchingElementsFromObject = function (element, object) {
        if (object === null) {
            return [];
        }
        else {
            if (isArrayLike(object)) {
                var arrayLike = object;
                if (arrayLike.length === 0 || arrayLike[0] instanceof Element) {
                    return toArray(arrayLike);
                }
                else {
                    throw new TypeError(ElementCollector.ELEMENT_MATCHER_TYPE_ERROR_MESSAGE);
                }
            }
            else {
                throw new TypeError(ElementCollector.ELEMENT_MATCHER_TYPE_ERROR_MESSAGE);
            }
        }
    };
    ElementCollector.prototype.collectMatchingElementsFromElementVistor = function (element, elementVistor) {
        var elements = [];
        // I'm fibbing to the compiler here. `element.children` is a `NodeListOf<Element>`,
        // which does not have a compatable interface with `Array<Element>`; however, the
        // generated code still works because it doesn't actually use very much of the 
        // `Array` interace (it really only assumes a numberic length property and keys for
        // 0...length). Casting to `any` here destroys that type information, so the 
        // compiler can't tell there is an issue and allows it without an error.
        for (var _i = 0, _a = element.children; _i < _a.length; _i++) {
            var child = _a[_i];
            if (child instanceof Element) {
                var element_1 = child;
                var visitorResult = elementVistor(element_1);
                if (typeof (visitorResult) === 'boolean') {
                    var isMatch = visitorResult;
                    if (isMatch) {
                        elements.push(element_1);
                    }
                }
                else {
                    elements.push.apply(elements, this.collectMatchingElements(element_1, visitorResult));
                }
            }
        }
        return elements;
    };
    return ElementCollector;
}());
ElementCollector.ELEMENT_MATCHER_TYPE_ERROR_MESSAGE = "Decl: An `ElementMatcher` must be a CSS selector (string) or a function which takes a node under consideration and returns a CSS selector (string) that matches all matching nodes in the subtree, an array-like object of matching nodes in the subtree, or a boolean value as to whether the node should be included (in this case, the function will be invoked again for all children of the node).";
exports.ElementCollector = ElementCollector;
function isArrayLike(value) {
    return typeof (value) === 'object' && typeof (value.length) === 'number';
}
function toArray(arrayLike) {
    if (isArrayLike(arrayLike)) {
        return Array.prototype.slice.call(arrayLike, 0);
    }
    else {
        throw new TypeError('Expected ArrayLike');
    }
}
function isMemberOfArrayLike(haystack, needle) {
    return Array.prototype.indexOf.call(haystack, needle) !== -1;
}

},{}],4:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var trivial_subscription_1 = require("./subscriptions/trivial_subscription");
var matching_elements_subscription_1 = require("./subscriptions/matching_elements_subscription");
var element_matches_subscription_1 = require("./subscriptions/element_matches_subscription");
var event_subscription_1 = require("./subscriptions/event_subscription");
var Scope = (function () {
    function Scope(parentScope, name, element, executor) {
        this.childScopes = [];
        this.isActivated = false;
        this.subscriptions = [];
        this.parentScope = parentScope;
        this.name = name;
        this.element = element;
        if (executor) {
            executor.call(this, this, this.element);
        }
    }
    Scope.buildRootScope = function (element) {
        var scope = new Scope(null, '<<root>>', element, null);
        scope.activate();
        return scope;
    };
    Scope.prototype.getParentScope = function () {
        return this.parentScope;
    };
    Scope.prototype.getChildScopes = function () {
        return this.childScopes;
    };
    Scope.prototype.collectDescendantScopes = function () {
        var scopes = [];
        for (var _i = 0, _a = this.childScopes; _i < _a.length; _i++) {
            var scope = _a[_i];
            scopes.push.apply(scopes, [scope].concat(scope.collectDescendantScopes()));
        }
        return scopes;
    };
    Scope.prototype.drawTree = function () {
        return this.drawTreeLines().join('\n');
    };
    Scope.prototype.drawTreeLines = function () {
        var lines = [];
        var self = this.name + '  (' + this.subscriptions.length + ')';
        if (this.childScopes.length > 0) {
            lines.push(self + ' {');
            for (var _i = 0, _a = this.childScopes; _i < _a.length; _i++) {
                var scope = _a[_i];
                for (var _b = 0, _c = scope.drawTreeLines(); _b < _c.length; _b++) {
                    var line = _c[_b];
                    lines.push('\t' + line);
                }
            }
            lines.push('}');
        }
        else {
            lines.push(self);
        }
        return lines;
    };
    Scope.prototype.getElement = function () {
        return this.element;
    };
    Scope.prototype.match = function (executor) {
        this.addSubscription(new trivial_subscription_1.TrivialSubscription(this.element, { connected: true }, executor));
        return this;
    };
    Scope.prototype.unmatch = function (executor) {
        this.addSubscription(new trivial_subscription_1.TrivialSubscription(this.element, { disconnected: true }, executor));
        return this;
    };
    Scope.prototype.select = function (matcher, executor) {
        this.addSubscription(new matching_elements_subscription_1.MatchingElementsSubscription(this.element, matcher, this.buildSelectExecutor(String(matcher), executor)));
        return this;
    };
    Scope.prototype.when = function (matcher, executor) {
        this.addSubscription(new element_matches_subscription_1.ElementMatchesSubscription(this.element, matcher, this.buildWhenExecutor(String(matcher), executor)));
        return this;
    };
    Scope.prototype.on = function (eventMatcher, executorOrElementMatcher, maybeExecutor) {
        var argumentsCount = arguments.length;
        switch (argumentsCount) {
            case 2:
                return this.onWithTwoArguments(eventMatcher, executorOrElementMatcher);
            case 3:
                return this.onWithThreeArguments(eventMatcher, executorOrElementMatcher, maybeExecutor);
            default:
                throw new TypeError("Failed to execute 'on' on 'Scope': 2 or 3 arguments required, but " + argumentsCount + " present.");
        }
    };
    Scope.prototype.onWithTwoArguments = function (eventMatcher, executor) {
        this.addSubscription(new event_subscription_1.EventSubscription(this.element, eventMatcher, executor));
        return this;
    };
    Scope.prototype.onWithThreeArguments = function (eventMatcher, elementMatcher, executor) {
        this.select(elementMatcher, function (scope) {
            scope.on(eventMatcher, executor);
        });
        return this;
    };
    // This method is for testing
    Scope.prototype.pristine = function () {
        for (var _i = 0, _a = this.subscriptions; _i < _a.length; _i++) {
            var subscription = _a[_i];
            subscription.disconnect();
        }
        this.subscriptions.splice(0);
    };
    Scope.prototype.activate = function () {
        if (!this.isActivated) {
            this.isActivated = true;
            for (var _i = 0, _a = this.subscriptions; _i < _a.length; _i++) {
                var subscription = _a[_i];
                subscription.connect();
            }
        }
    };
    Scope.prototype.deactivate = function () {
        if (this.isActivated) {
            for (var _i = 0, _a = this.subscriptions; _i < _a.length; _i++) {
                var subscription = _a[_i];
                subscription.disconnect();
            }
            this.isActivated = false;
        }
    };
    Scope.prototype.addSubscription = function (subscription) {
        this.subscriptions.push(subscription);
        if (this.isActivated) {
            subscription.connect();
        }
    };
    Scope.prototype.removeSubscription = function (subscription) {
        var index = this.subscriptions.indexOf(subscription);
        if (index >= 0) {
            subscription.disconnect();
            this.subscriptions.splice(index, 1);
        }
    };
    Scope.prototype.buildSelectExecutor = function (name, executor) {
        var _this = this;
        var scopes = [];
        return function (event, element) {
            for (var _i = 0, _a = event.addedElements; _i < _a.length; _i++) {
                var element_1 = _a[_i];
                var scope = _this.createChildScope(name, element_1, executor);
                scopes.push(scope);
            }
            for (var _b = 0, _c = event.removedElements; _b < _c.length; _b++) {
                var element_2 = _c[_b];
                for (var index = 0, length_1 = scopes.length, scope = void 0; index < length_1; index++) {
                    scope = scopes[index];
                    if (scope.element === element_2) {
                        _this.destroyChildScope(scope);
                        scopes.splice(index, 1);
                        break;
                    }
                }
            }
        };
    };
    Scope.prototype.buildWhenExecutor = function (name, executor) {
        var _this = this;
        var scope = null;
        return function (event, element) {
            if (event.isMatching) {
                scope = _this.createChildScope('&' + name, _this.element, executor);
            }
            else {
                _this.destroyChildScope(scope);
                scope = null;
            }
        };
    };
    Scope.prototype.createChildScope = function (name, element, executor) {
        var scope = new Scope(this, name, element, executor);
        this.childScopes.push(scope);
        scope.activate();
        return scope;
    };
    Scope.prototype.destroyChildScope = function (scope) {
        var index = this.childScopes.indexOf(scope);
        scope.deactivate();
        if (index >= 0) {
            this.childScopes.splice(index, 1);
        }
    };
    return Scope;
}());
exports.Scope = Scope;
;

},{"./subscriptions/element_matches_subscription":6,"./subscriptions/event_subscription":7,"./subscriptions/matching_elements_subscription":8,"./subscriptions/trivial_subscription":10}],5:[function(require,module,exports){
"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
var subscription_1 = require("./subscription");
exports.Subscription = subscription_1.Subscription;
exports.SubscriptionEvent = subscription_1.SubscriptionEvent;
var MutationObserver = require('mutation-observer'); // use polyfill
var BatchedMutationSubscription = (function (_super) {
    __extends(BatchedMutationSubscription, _super);
    function BatchedMutationSubscription(element, executor) {
        var _this = _super.call(this, element, executor) || this;
        _this.isListening = false;
        _this.handleMutationTimeout = null;
        _this.mutationCallback = function () {
            _this.deferHandleMutations();
        };
        _this.mutationObserver = new MutationObserver(_this.mutationCallback);
        return _this;
    }
    BatchedMutationSubscription.prototype.startListening = function () {
        if (!this.isListening) {
            this.mutationObserver.observe(this.element, BatchedMutationSubscription.mutationObserverInit);
            this.isListening = true;
        }
    };
    BatchedMutationSubscription.prototype.stopListening = function () {
        if (this.isListening) {
            this.mutationObserver.disconnect();
            this.handleMutationsNow();
            this.isListening = false;
        }
    };
    BatchedMutationSubscription.prototype.deferHandleMutations = function () {
        var _this = this;
        if (this.handleMutationTimeout === null) {
            this.handleMutationTimeout = setTimeout(function () {
                try {
                    _this.mutationObserver.takeRecords();
                    _this.handleMutations();
                }
                finally {
                    _this.handleMutationTimeout = null;
                }
            }, 0);
        }
    };
    BatchedMutationSubscription.prototype.handleMutationsNow = function () {
        if (this.handleMutationTimeout !== null) {
            clearTimeout(this.handleMutationTimeout);
            this.handleMutationTimeout = null;
            this.handleMutations();
        }
    };
    return BatchedMutationSubscription;
}(subscription_1.Subscription));
BatchedMutationSubscription.mutationObserverInit = {
    childList: true,
    attributes: true,
    characterData: true,
    subtree: true
};
exports.BatchedMutationSubscription = BatchedMutationSubscription;

},{"./subscription":9,"mutation-observer":1}],6:[function(require,module,exports){
"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
var batched_mutation_subscription_1 = require("./batched_mutation_subscription");
var element_collector_1 = require("../element_collector");
var ElementMatchesSubscription = (function (_super) {
    __extends(ElementMatchesSubscription, _super);
    function ElementMatchesSubscription(element, matcher, executor) {
        var _this = _super.call(this, element, executor) || this;
        _this.isConnected = false;
        _this.isMatchingElement = false;
        _this.matcher = matcher;
        return _this;
    }
    ElementMatchesSubscription.prototype.connect = function () {
        if (!this.isConnected) {
            this.updateIsMatchingElement(this.computeIsMatchingElement());
            this.startListening();
            this.isConnected = true;
        }
    };
    ElementMatchesSubscription.prototype.disconnect = function () {
        if (this.isConnected) {
            this.updateIsMatchingElement(false);
            this.stopListening();
            this.isConnected = false;
        }
    };
    ElementMatchesSubscription.prototype.handleMutations = function () {
        this.updateIsMatchingElement(this.computeIsMatchingElement());
    };
    ElementMatchesSubscription.prototype.updateIsMatchingElement = function (isMatchingElement) {
        var wasMatchingElement = this.isMatchingElement;
        this.isMatchingElement = isMatchingElement;
        if (wasMatchingElement !== isMatchingElement) {
            var event_1 = new ElementMatchesChangedEvent(this, isMatchingElement);
            this.executor(event_1, this.element);
        }
    };
    ElementMatchesSubscription.prototype.computeIsMatchingElement = function () {
        return element_collector_1.ElementCollector.isMatchingElement(this.element, this.matcher);
    };
    return ElementMatchesSubscription;
}(batched_mutation_subscription_1.BatchedMutationSubscription));
exports.ElementMatchesSubscription = ElementMatchesSubscription;
var ElementMatchesChangedEvent = (function (_super) {
    __extends(ElementMatchesChangedEvent, _super);
    function ElementMatchesChangedEvent(elementMatchesSubscription, isMatching) {
        var _this = _super.call(this, elementMatchesSubscription, 'ElementMatchesChangedEvent') || this;
        _this.isMatching = isMatching;
        return _this;
    }
    return ElementMatchesChangedEvent;
}(batched_mutation_subscription_1.SubscriptionEvent));
exports.ElementMatchesChangedEvent = ElementMatchesChangedEvent;

},{"../element_collector":3,"./batched_mutation_subscription":5}],7:[function(require,module,exports){
"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
var subscription_1 = require("./subscription");
var EventSubscription = (function (_super) {
    __extends(EventSubscription, _super);
    function EventSubscription(element, eventMatcher, executor) {
        var _this = _super.call(this, element, executor) || this;
        _this.isConnected = false;
        _this.eventMatcher = eventMatcher;
        _this.eventNames = _this.parseEventMatcher(_this.eventMatcher);
        _this.eventListener = function (event) {
            _this.handleEvent(event);
        };
        return _this;
    }
    EventSubscription.prototype.connect = function () {
        if (!this.isConnected) {
            this.isConnected = true;
            for (var _i = 0, _a = this.eventNames; _i < _a.length; _i++) {
                var eventName = _a[_i];
                this.element.addEventListener(eventName, this.eventListener, false);
            }
        }
    };
    EventSubscription.prototype.disconnect = function () {
        if (this.isConnected) {
            for (var _i = 0, _a = this.eventNames; _i < _a.length; _i++) {
                var eventName = _a[_i];
                this.element.removeEventListener(eventName, this.eventListener, false);
            }
            this.isConnected = false;
        }
    };
    EventSubscription.prototype.handleEvent = function (event) {
        this.executor(event, this.element);
    };
    EventSubscription.prototype.parseEventMatcher = function (eventMatcher) {
        // TODO: Support all of the jQuery style event options
        return eventMatcher.split(' ');
    };
    return EventSubscription;
}(subscription_1.Subscription));
exports.EventSubscription = EventSubscription;

},{"./subscription":9}],8:[function(require,module,exports){
"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
var batched_mutation_subscription_1 = require("./batched_mutation_subscription");
var element_collector_1 = require("../element_collector");
var MatchingElementsSubscription = (function (_super) {
    __extends(MatchingElementsSubscription, _super);
    function MatchingElementsSubscription(element, matcher, executor) {
        var _this = _super.call(this, element, executor) || this;
        _this.isConnected = false;
        _this.matchingElements = [];
        _this.matcher = matcher;
        return _this;
    }
    MatchingElementsSubscription.prototype.connect = function () {
        if (!this.isConnected) {
            this.updateMatchingElements(this.collectMatchingElements());
            this.startListening();
            this.isConnected = true;
        }
    };
    MatchingElementsSubscription.prototype.disconnect = function () {
        if (this.isConnected) {
            this.updateMatchingElements([]);
            this.stopListening();
            this.isConnected = false;
        }
    };
    MatchingElementsSubscription.prototype.handleMutations = function () {
        this.updateMatchingElements(this.collectMatchingElements());
    };
    MatchingElementsSubscription.prototype.updateMatchingElements = function (matchingElements) {
        var previouslyMatchingElements = this.matchingElements;
        var addedElements = arraySubtract(matchingElements, previouslyMatchingElements);
        var removedElements = arraySubtract(previouslyMatchingElements, matchingElements);
        this.matchingElements = matchingElements;
        if (addedElements.length > 0 || removedElements.length > 0) {
            var event_1 = new MatchingElementsChangedEvent(this, addedElements, removedElements);
            this.executor(event_1, this.element);
        }
    };
    MatchingElementsSubscription.prototype.collectMatchingElements = function () {
        return element_collector_1.ElementCollector.collectMatchingElements(this.element, this.matcher);
    };
    return MatchingElementsSubscription;
}(batched_mutation_subscription_1.BatchedMutationSubscription));
exports.MatchingElementsSubscription = MatchingElementsSubscription;
var MatchingElementsChangedEvent = (function (_super) {
    __extends(MatchingElementsChangedEvent, _super);
    function MatchingElementsChangedEvent(matchingElementsSubscription, addedElements, removedElements) {
        var _this = _super.call(this, matchingElementsSubscription, 'MatchingElementsChanged') || this;
        _this.addedElements = addedElements;
        _this.removedElements = removedElements;
        return _this;
    }
    return MatchingElementsChangedEvent;
}(batched_mutation_subscription_1.SubscriptionEvent));
exports.MatchingElementsChangedEvent = MatchingElementsChangedEvent;
function arraySubtract(minuend, subtrahend) {
    var difference = [];
    for (var _i = 0, minuend_1 = minuend; _i < minuend_1.length; _i++) {
        var member = minuend_1[_i];
        if (subtrahend.indexOf(member) === -1) {
            difference.push(member);
        }
    }
    return difference;
}

},{"../element_collector":3,"./batched_mutation_subscription":5}],9:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var Subscription = (function () {
    function Subscription(element, executor) {
        this.element = element;
        this.executor = executor;
    }
    return Subscription;
}());
exports.Subscription = Subscription;
var SubscriptionEvent = (function () {
    function SubscriptionEvent(subscription, name) {
        this.subscription = subscription;
        this.name = name;
    }
    return SubscriptionEvent;
}());
exports.SubscriptionEvent = SubscriptionEvent;

},{}],10:[function(require,module,exports){
"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
var subscription_1 = require("./subscription");
var ElementConnectionChangedEvent = (function (_super) {
    __extends(ElementConnectionChangedEvent, _super);
    function ElementConnectionChangedEvent(trivialSubscription, element, isConnected) {
        var _this = _super.call(this, trivialSubscription, 'ElementConnected') || this;
        _this.element = element;
        _this.isConnected = isConnected;
        return _this;
    }
    return ElementConnectionChangedEvent;
}(subscription_1.SubscriptionEvent));
exports.ElementConnectionChangedEvent = ElementConnectionChangedEvent;
var TrivialSubscription = (function (_super) {
    __extends(TrivialSubscription, _super);
    function TrivialSubscription(element, config, executor) {
        var _this = _super.call(this, element, executor) || this;
        _this.isConnected = false;
        _this.config = config;
        return _this;
    }
    TrivialSubscription.prototype.connect = function () {
        if (!this.isConnected) {
            this.isConnected = true;
            if (this.config.connected) {
                this.executor(this.buildElementConnectionChangedEvent(), this.element);
            }
        }
    };
    TrivialSubscription.prototype.disconnect = function () {
        if (this.isConnected) {
            this.isConnected = false;
            if (this.config.disconnected) {
                this.executor(this.buildElementConnectionChangedEvent(), this.element);
            }
        }
    };
    TrivialSubscription.prototype.buildElementConnectionChangedEvent = function () {
        return new ElementConnectionChangedEvent(this, this.element, this.isConnected);
    };
    return TrivialSubscription;
}(subscription_1.Subscription));
exports.TrivialSubscription = TrivialSubscription;

},{"./subscription":9}]},{},[2])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvbXV0YXRpb24tb2JzZXJ2ZXIvaW5kZXguanMiLCJzcmMvZGVjbC50cyIsInNyYy9lbGVtZW50X2NvbGxlY3Rvci50cyIsInNyYy9zY29wZS50cyIsInNyYy9zdWJzY3JpcHRpb25zL2JhdGNoZWRfbXV0YXRpb25fc3Vic2NyaXB0aW9uLnRzIiwic3JjL3N1YnNjcmlwdGlvbnMvZWxlbWVudF9tYXRjaGVzX3N1YnNjcmlwdGlvbi50cyIsInNyYy9zdWJzY3JpcHRpb25zL2V2ZW50X3N1YnNjcmlwdGlvbi50cyIsInNyYy9zdWJzY3JpcHRpb25zL21hdGNoaW5nX2VsZW1lbnRzX3N1YnNjcmlwdGlvbi50cyIsInNyYy9zdWJzY3JpcHRpb25zL3N1YnNjcmlwdGlvbi50cyIsInNyYy9zdWJzY3JpcHRpb25zL3RyaXZpYWxfc3Vic2NyaXB0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFD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SUFBSSxDQUFDO1lBRXhCLEVBQUUsQ0FBQSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztnQkFDdkIsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsa0NBQWtDLEVBQUUsRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDM0UsQ0FBQztRQUNMLENBQUM7SUFDTCxDQUFDO0lBRUQsd0NBQVUsR0FBVjtRQUNJLEVBQUUsQ0FBQSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDO1lBQ2xCLElBQUksQ0FBQyxXQUFXLEdBQUcsS0FBSyxDQUFDO1lBRXpCLEVBQUUsQ0FBQSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQztnQkFDMUIsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsa0NBQWtDLEVBQUUsRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDM0UsQ0FBQztRQUNMLENBQUM7SUFDTCxDQUFDO0lBRU8sZ0VBQWtDLEdBQTFDO1FBQ0ksTUFBTSxDQUFDLElBQUksNkJBQTZCLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDO0lBQ25GLENBQUM7SUFDTCwwQkFBQztBQUFELENBakNBLEFBaUNDLENBakN3QywyQkFBWSxHQWlDcEQ7QUFqQ1ksa0RBQW1CIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsInZhciBNdXRhdGlvbk9ic2VydmVyID0gd2luZG93Lk11dGF0aW9uT2JzZXJ2ZXJcbiAgfHwgd2luZG93LldlYktpdE11dGF0aW9uT2JzZXJ2ZXJcbiAgfHwgd2luZG93Lk1vek11dGF0aW9uT2JzZXJ2ZXI7XG5cbi8qXG4gKiBDb3B5cmlnaHQgMjAxMiBUaGUgUG9seW1lciBBdXRob3JzLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogVXNlIG9mIHRoaXMgc291cmNlIGNvZGUgaXMgZ292ZXJlbmVkIGJ5IGEgQlNELXN0eWxlXG4gKiBsaWNlbnNlIHRoYXQgY2FuIGJlIGZvdW5kIGluIHRoZSBMSUNFTlNFIGZpbGUuXG4gKi9cblxudmFyIFdlYWtNYXAgPSB3aW5kb3cuV2Vha01hcDtcblxuaWYgKHR5cGVvZiBXZWFrTWFwID09PSAndW5kZWZpbmVkJykge1xuICB2YXIgZGVmaW5lUHJvcGVydHkgPSBPYmplY3QuZGVmaW5lUHJvcGVydHk7XG4gIHZhciBjb3VudGVyID0gRGF0ZS5ub3coKSAlIDFlOTtcblxuICBXZWFrTWFwID0gZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5uYW1lID0gJ19fc3QnICsgKE1hdGgucmFuZG9tKCkgKiAxZTkgPj4+IDApICsgKGNvdW50ZXIrKyArICdfXycpO1xuICB9O1xuXG4gIFdlYWtNYXAucHJvdG90eXBlID0ge1xuICAgIHNldDogZnVuY3Rpb24oa2V5LCB2YWx1ZSkge1xuICAgICAgdmFyIGVudHJ5ID0ga2V5W3RoaXMubmFtZV07XG4gICAgICBpZiAoZW50cnkgJiYgZW50cnlbMF0gPT09IGtleSlcbiAgICAgICAgZW50cnlbMV0gPSB2YWx1ZTtcbiAgICAgIGVsc2VcbiAgICAgICAgZGVmaW5lUHJvcGVydHkoa2V5LCB0aGlzLm5hbWUsIHt2YWx1ZTogW2tleSwgdmFsdWVdLCB3cml0YWJsZTogdHJ1ZX0pO1xuICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSxcbiAgICBnZXQ6IGZ1bmN0aW9uKGtleSkge1xuICAgICAgdmFyIGVudHJ5O1xuICAgICAgcmV0dXJuIChlbnRyeSA9IGtleVt0aGlzLm5hbWVdKSAmJiBlbnRyeVswXSA9PT0ga2V5ID9cbiAgICAgICAgICBlbnRyeVsxXSA6IHVuZGVmaW5lZDtcbiAgICB9LFxuICAgICdkZWxldGUnOiBmdW5jdGlvbihrZXkpIHtcbiAgICAgIHZhciBlbnRyeSA9IGtleVt0aGlzLm5hbWVdO1xuICAgICAgaWYgKCFlbnRyeSkgcmV0dXJuIGZhbHNlO1xuICAgICAgdmFyIGhhc1ZhbHVlID0gZW50cnlbMF0gPT09IGtleTtcbiAgICAgIGVudHJ5WzBdID0gZW50cnlbMV0gPSB1bmRlZmluZWQ7XG4gICAgICByZXR1cm4gaGFzVmFsdWU7XG4gICAgfSxcbiAgICBoYXM6IGZ1bmN0aW9uKGtleSkge1xuICAgICAgdmFyIGVudHJ5ID0ga2V5W3RoaXMubmFtZV07XG4gICAgICBpZiAoIWVudHJ5KSByZXR1cm4gZmFsc2U7XG4gICAgICByZXR1cm4gZW50cnlbMF0gPT09IGtleTtcbiAgICB9XG4gIH07XG59XG5cbnZhciByZWdpc3RyYXRpb25zVGFibGUgPSBuZXcgV2Vha01hcCgpO1xuXG4vLyBXZSB1c2Ugc2V0SW1tZWRpYXRlIG9yIHBvc3RNZXNzYWdlIGZvciBvdXIgZnV0dXJlIGNhbGxiYWNrLlxudmFyIHNldEltbWVkaWF0ZSA9IHdpbmRvdy5tc1NldEltbWVkaWF0ZTtcblxuLy8gVXNlIHBvc3QgbWVzc2FnZSB0byBlbXVsYXRlIHNldEltbWVkaWF0ZS5cbmlmICghc2V0SW1tZWRpYXRlKSB7XG4gIHZhciBzZXRJbW1lZGlhdGVRdWV1ZSA9IFtdO1xuICB2YXIgc2VudGluZWwgPSBTdHJpbmcoTWF0aC5yYW5kb20oKSk7XG4gIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdtZXNzYWdlJywgZnVuY3Rpb24oZSkge1xuICAgIGlmIChlLmRhdGEgPT09IHNlbnRpbmVsKSB7XG4gICAgICB2YXIgcXVldWUgPSBzZXRJbW1lZGlhdGVRdWV1ZTtcbiAgICAgIHNldEltbWVkaWF0ZVF1ZXVlID0gW107XG4gICAgICBxdWV1ZS5mb3JFYWNoKGZ1bmN0aW9uKGZ1bmMpIHtcbiAgICAgICAgZnVuYygpO1xuICAgICAgfSk7XG4gICAgfVxuICB9KTtcbiAgc2V0SW1tZWRpYXRlID0gZnVuY3Rpb24oZnVuYykge1xuICAgIHNldEltbWVkaWF0ZVF1ZXVlLnB1c2goZnVuYyk7XG4gICAgd2luZG93LnBvc3RNZXNzYWdlKHNlbnRpbmVsLCAnKicpO1xuICB9O1xufVxuXG4vLyBUaGlzIGlzIHVzZWQgdG8gZW5zdXJlIHRoYXQgd2UgbmV2ZXIgc2NoZWR1bGUgMiBjYWxsYXMgdG8gc2V0SW1tZWRpYXRlXG52YXIgaXNTY2hlZHVsZWQgPSBmYWxzZTtcblxuLy8gS2VlcCB0cmFjayBvZiBvYnNlcnZlcnMgdGhhdCBuZWVkcyB0byBiZSBub3RpZmllZCBuZXh0IHRpbWUuXG52YXIgc2NoZWR1bGVkT2JzZXJ2ZXJzID0gW107XG5cbi8qKlxuICogU2NoZWR1bGVzIHxkaXNwYXRjaENhbGxiYWNrfCB0byBiZSBjYWxsZWQgaW4gdGhlIGZ1dHVyZS5cbiAqIEBwYXJhbSB7TXV0YXRpb25PYnNlcnZlcn0gb2JzZXJ2ZXJcbiAqL1xuZnVuY3Rpb24gc2NoZWR1bGVDYWxsYmFjayhvYnNlcnZlcikge1xuICBzY2hlZHVsZWRPYnNlcnZlcnMucHVzaChvYnNlcnZlcik7XG4gIGlmICghaXNTY2hlZHVsZWQpIHtcbiAgICBpc1NjaGVkdWxlZCA9IHRydWU7XG4gICAgc2V0SW1tZWRpYXRlKGRpc3BhdGNoQ2FsbGJhY2tzKTtcbiAgfVxufVxuXG5mdW5jdGlvbiB3cmFwSWZOZWVkZWQobm9kZSkge1xuICByZXR1cm4gd2luZG93LlNoYWRvd0RPTVBvbHlmaWxsICYmXG4gICAgICB3aW5kb3cuU2hhZG93RE9NUG9seWZpbGwud3JhcElmTmVlZGVkKG5vZGUpIHx8XG4gICAgICBub2RlO1xufVxuXG5mdW5jdGlvbiBkaXNwYXRjaENhbGxiYWNrcygpIHtcbiAgLy8gaHR0cDovL2RvbS5zcGVjLndoYXR3Zy5vcmcvI211dGF0aW9uLW9ic2VydmVyc1xuXG4gIGlzU2NoZWR1bGVkID0gZmFsc2U7IC8vIFVzZWQgdG8gYWxsb3cgYSBuZXcgc2V0SW1tZWRpYXRlIGNhbGwgYWJvdmUuXG5cbiAgdmFyIG9ic2VydmVycyA9IHNjaGVkdWxlZE9ic2VydmVycztcbiAgc2NoZWR1bGVkT2JzZXJ2ZXJzID0gW107XG4gIC8vIFNvcnQgb2JzZXJ2ZXJzIGJhc2VkIG9uIHRoZWlyIGNyZWF0aW9uIFVJRCAoaW5jcmVtZW50YWwpLlxuICBvYnNlcnZlcnMuc29ydChmdW5jdGlvbihvMSwgbzIpIHtcbiAgICByZXR1cm4gbzEudWlkXyAtIG8yLnVpZF87XG4gIH0pO1xuXG4gIHZhciBhbnlOb25FbXB0eSA9IGZhbHNlO1xuICBvYnNlcnZlcnMuZm9yRWFjaChmdW5jdGlvbihvYnNlcnZlcikge1xuXG4gICAgLy8gMi4xLCAyLjJcbiAgICB2YXIgcXVldWUgPSBvYnNlcnZlci50YWtlUmVjb3JkcygpO1xuICAgIC8vIDIuMy4gUmVtb3ZlIGFsbCB0cmFuc2llbnQgcmVnaXN0ZXJlZCBvYnNlcnZlcnMgd2hvc2Ugb2JzZXJ2ZXIgaXMgbW8uXG4gICAgcmVtb3ZlVHJhbnNpZW50T2JzZXJ2ZXJzRm9yKG9ic2VydmVyKTtcblxuICAgIC8vIDIuNFxuICAgIGlmIChxdWV1ZS5sZW5ndGgpIHtcbiAgICAgIG9ic2VydmVyLmNhbGxiYWNrXyhxdWV1ZSwgb2JzZXJ2ZXIpO1xuICAgICAgYW55Tm9uRW1wdHkgPSB0cnVlO1xuICAgIH1cbiAgfSk7XG5cbiAgLy8gMy5cbiAgaWYgKGFueU5vbkVtcHR5KVxuICAgIGRpc3BhdGNoQ2FsbGJhY2tzKCk7XG59XG5cbmZ1bmN0aW9uIHJlbW92ZVRyYW5zaWVudE9ic2VydmVyc0ZvcihvYnNlcnZlcikge1xuICBvYnNlcnZlci5ub2Rlc18uZm9yRWFjaChmdW5jdGlvbihub2RlKSB7XG4gICAgdmFyIHJlZ2lzdHJhdGlvbnMgPSByZWdpc3RyYXRpb25zVGFibGUuZ2V0KG5vZGUpO1xuICAgIGlmICghcmVnaXN0cmF0aW9ucylcbiAgICAgIHJldHVybjtcbiAgICByZWdpc3RyYXRpb25zLmZvckVhY2goZnVuY3Rpb24ocmVnaXN0cmF0aW9uKSB7XG4gICAgICBpZiAocmVnaXN0cmF0aW9uLm9ic2VydmVyID09PSBvYnNlcnZlcilcbiAgICAgICAgcmVnaXN0cmF0aW9uLnJlbW92ZVRyYW5zaWVudE9ic2VydmVycygpO1xuICAgIH0pO1xuICB9KTtcbn1cblxuLyoqXG4gKiBUaGlzIGZ1bmN0aW9uIGlzIHVzZWQgZm9yIHRoZSBcIkZvciBlYWNoIHJlZ2lzdGVyZWQgb2JzZXJ2ZXIgb2JzZXJ2ZXIgKHdpdGhcbiAqIG9ic2VydmVyJ3Mgb3B0aW9ucyBhcyBvcHRpb25zKSBpbiB0YXJnZXQncyBsaXN0IG9mIHJlZ2lzdGVyZWQgb2JzZXJ2ZXJzLFxuICogcnVuIHRoZXNlIHN1YnN0ZXBzOlwiIGFuZCB0aGUgXCJGb3IgZWFjaCBhbmNlc3RvciBhbmNlc3RvciBvZiB0YXJnZXQsIGFuZCBmb3JcbiAqIGVhY2ggcmVnaXN0ZXJlZCBvYnNlcnZlciBvYnNlcnZlciAod2l0aCBvcHRpb25zIG9wdGlvbnMpIGluIGFuY2VzdG9yJ3MgbGlzdFxuICogb2YgcmVnaXN0ZXJlZCBvYnNlcnZlcnMsIHJ1biB0aGVzZSBzdWJzdGVwczpcIiBwYXJ0IG9mIHRoZSBhbGdvcml0aG1zLiBUaGVcbiAqIHxvcHRpb25zLnN1YnRyZWV8IGlzIGNoZWNrZWQgdG8gZW5zdXJlIHRoYXQgdGhlIGNhbGxiYWNrIGlzIGNhbGxlZFxuICogY29ycmVjdGx5LlxuICpcbiAqIEBwYXJhbSB7Tm9kZX0gdGFyZ2V0XG4gKiBAcGFyYW0ge2Z1bmN0aW9uKE11dGF0aW9uT2JzZXJ2ZXJJbml0KTpNdXRhdGlvblJlY29yZH0gY2FsbGJhY2tcbiAqL1xuZnVuY3Rpb24gZm9yRWFjaEFuY2VzdG9yQW5kT2JzZXJ2ZXJFbnF1ZXVlUmVjb3JkKHRhcmdldCwgY2FsbGJhY2spIHtcbiAgZm9yICh2YXIgbm9kZSA9IHRhcmdldDsgbm9kZTsgbm9kZSA9IG5vZGUucGFyZW50Tm9kZSkge1xuICAgIHZhciByZWdpc3RyYXRpb25zID0gcmVnaXN0cmF0aW9uc1RhYmxlLmdldChub2RlKTtcblxuICAgIGlmIChyZWdpc3RyYXRpb25zKSB7XG4gICAgICBmb3IgKHZhciBqID0gMDsgaiA8IHJlZ2lzdHJhdGlvbnMubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgdmFyIHJlZ2lzdHJhdGlvbiA9IHJlZ2lzdHJhdGlvbnNbal07XG4gICAgICAgIHZhciBvcHRpb25zID0gcmVnaXN0cmF0aW9uLm9wdGlvbnM7XG5cbiAgICAgICAgLy8gT25seSB0YXJnZXQgaWdub3JlcyBzdWJ0cmVlLlxuICAgICAgICBpZiAobm9kZSAhPT0gdGFyZ2V0ICYmICFvcHRpb25zLnN1YnRyZWUpXG4gICAgICAgICAgY29udGludWU7XG5cbiAgICAgICAgdmFyIHJlY29yZCA9IGNhbGxiYWNrKG9wdGlvbnMpO1xuICAgICAgICBpZiAocmVjb3JkKVxuICAgICAgICAgIHJlZ2lzdHJhdGlvbi5lbnF1ZXVlKHJlY29yZCk7XG4gICAgICB9XG4gICAgfVxuICB9XG59XG5cbnZhciB1aWRDb3VudGVyID0gMDtcblxuLyoqXG4gKiBUaGUgY2xhc3MgdGhhdCBtYXBzIHRvIHRoZSBET00gTXV0YXRpb25PYnNlcnZlciBpbnRlcmZhY2UuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjay5cbiAqIEBjb25zdHJ1Y3RvclxuICovXG5mdW5jdGlvbiBKc011dGF0aW9uT2JzZXJ2ZXIoY2FsbGJhY2spIHtcbiAgdGhpcy5jYWxsYmFja18gPSBjYWxsYmFjaztcbiAgdGhpcy5ub2Rlc18gPSBbXTtcbiAgdGhpcy5yZWNvcmRzXyA9IFtdO1xuICB0aGlzLnVpZF8gPSArK3VpZENvdW50ZXI7XG59XG5cbkpzTXV0YXRpb25PYnNlcnZlci5wcm90b3R5cGUgPSB7XG4gIG9ic2VydmU6IGZ1bmN0aW9uKHRhcmdldCwgb3B0aW9ucykge1xuICAgIHRhcmdldCA9IHdyYXBJZk5lZWRlZCh0YXJnZXQpO1xuXG4gICAgLy8gMS4xXG4gICAgaWYgKCFvcHRpb25zLmNoaWxkTGlzdCAmJiAhb3B0aW9ucy5hdHRyaWJ1dGVzICYmICFvcHRpb25zLmNoYXJhY3RlckRhdGEgfHxcblxuICAgICAgICAvLyAxLjJcbiAgICAgICAgb3B0aW9ucy5hdHRyaWJ1dGVPbGRWYWx1ZSAmJiAhb3B0aW9ucy5hdHRyaWJ1dGVzIHx8XG5cbiAgICAgICAgLy8gMS4zXG4gICAgICAgIG9wdGlvbnMuYXR0cmlidXRlRmlsdGVyICYmIG9wdGlvbnMuYXR0cmlidXRlRmlsdGVyLmxlbmd0aCAmJlxuICAgICAgICAgICAgIW9wdGlvbnMuYXR0cmlidXRlcyB8fFxuXG4gICAgICAgIC8vIDEuNFxuICAgICAgICBvcHRpb25zLmNoYXJhY3RlckRhdGFPbGRWYWx1ZSAmJiAhb3B0aW9ucy5jaGFyYWN0ZXJEYXRhKSB7XG5cbiAgICAgIHRocm93IG5ldyBTeW50YXhFcnJvcigpO1xuICAgIH1cblxuICAgIHZhciByZWdpc3RyYXRpb25zID0gcmVnaXN0cmF0aW9uc1RhYmxlLmdldCh0YXJnZXQpO1xuICAgIGlmICghcmVnaXN0cmF0aW9ucylcbiAgICAgIHJlZ2lzdHJhdGlvbnNUYWJsZS5zZXQodGFyZ2V0LCByZWdpc3RyYXRpb25zID0gW10pO1xuXG4gICAgLy8gMlxuICAgIC8vIElmIHRhcmdldCdzIGxpc3Qgb2YgcmVnaXN0ZXJlZCBvYnNlcnZlcnMgYWxyZWFkeSBpbmNsdWRlcyBhIHJlZ2lzdGVyZWRcbiAgICAvLyBvYnNlcnZlciBhc3NvY2lhdGVkIHdpdGggdGhlIGNvbnRleHQgb2JqZWN0LCByZXBsYWNlIHRoYXQgcmVnaXN0ZXJlZFxuICAgIC8vIG9ic2VydmVyJ3Mgb3B0aW9ucyB3aXRoIG9wdGlvbnMuXG4gICAgdmFyIHJlZ2lzdHJhdGlvbjtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHJlZ2lzdHJhdGlvbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGlmIChyZWdpc3RyYXRpb25zW2ldLm9ic2VydmVyID09PSB0aGlzKSB7XG4gICAgICAgIHJlZ2lzdHJhdGlvbiA9IHJlZ2lzdHJhdGlvbnNbaV07XG4gICAgICAgIHJlZ2lzdHJhdGlvbi5yZW1vdmVMaXN0ZW5lcnMoKTtcbiAgICAgICAgcmVnaXN0cmF0aW9uLm9wdGlvbnMgPSBvcHRpb25zO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyAzLlxuICAgIC8vIE90aGVyd2lzZSwgYWRkIGEgbmV3IHJlZ2lzdGVyZWQgb2JzZXJ2ZXIgdG8gdGFyZ2V0J3MgbGlzdCBvZiByZWdpc3RlcmVkXG4gICAgLy8gb2JzZXJ2ZXJzIHdpdGggdGhlIGNvbnRleHQgb2JqZWN0IGFzIHRoZSBvYnNlcnZlciBhbmQgb3B0aW9ucyBhcyB0aGVcbiAgICAvLyBvcHRpb25zLCBhbmQgYWRkIHRhcmdldCB0byBjb250ZXh0IG9iamVjdCdzIGxpc3Qgb2Ygbm9kZXMgb24gd2hpY2ggaXRcbiAgICAvLyBpcyByZWdpc3RlcmVkLlxuICAgIGlmICghcmVnaXN0cmF0aW9uKSB7XG4gICAgICByZWdpc3RyYXRpb24gPSBuZXcgUmVnaXN0cmF0aW9uKHRoaXMsIHRhcmdldCwgb3B0aW9ucyk7XG4gICAgICByZWdpc3RyYXRpb25zLnB1c2gocmVnaXN0cmF0aW9uKTtcbiAgICAgIHRoaXMubm9kZXNfLnB1c2godGFyZ2V0KTtcbiAgICB9XG5cbiAgICByZWdpc3RyYXRpb24uYWRkTGlzdGVuZXJzKCk7XG4gIH0sXG5cbiAgZGlzY29ubmVjdDogZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5ub2Rlc18uZm9yRWFjaChmdW5jdGlvbihub2RlKSB7XG4gICAgICB2YXIgcmVnaXN0cmF0aW9ucyA9IHJlZ2lzdHJhdGlvbnNUYWJsZS5nZXQobm9kZSk7XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHJlZ2lzdHJhdGlvbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFyIHJlZ2lzdHJhdGlvbiA9IHJlZ2lzdHJhdGlvbnNbaV07XG4gICAgICAgIGlmIChyZWdpc3RyYXRpb24ub2JzZXJ2ZXIgPT09IHRoaXMpIHtcbiAgICAgICAgICByZWdpc3RyYXRpb24ucmVtb3ZlTGlzdGVuZXJzKCk7XG4gICAgICAgICAgcmVnaXN0cmF0aW9ucy5zcGxpY2UoaSwgMSk7XG4gICAgICAgICAgLy8gRWFjaCBub2RlIGNhbiBvbmx5IGhhdmUgb25lIHJlZ2lzdGVyZWQgb2JzZXJ2ZXIgYXNzb2NpYXRlZCB3aXRoXG4gICAgICAgICAgLy8gdGhpcyBvYnNlcnZlci5cbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sIHRoaXMpO1xuICAgIHRoaXMucmVjb3Jkc18gPSBbXTtcbiAgfSxcblxuICB0YWtlUmVjb3JkczogZnVuY3Rpb24oKSB7XG4gICAgdmFyIGNvcHlPZlJlY29yZHMgPSB0aGlzLnJlY29yZHNfO1xuICAgIHRoaXMucmVjb3Jkc18gPSBbXTtcbiAgICByZXR1cm4gY29weU9mUmVjb3JkcztcbiAgfVxufTtcblxuLyoqXG4gKiBAcGFyYW0ge3N0cmluZ30gdHlwZVxuICogQHBhcmFtIHtOb2RlfSB0YXJnZXRcbiAqIEBjb25zdHJ1Y3RvclxuICovXG5mdW5jdGlvbiBNdXRhdGlvblJlY29yZCh0eXBlLCB0YXJnZXQpIHtcbiAgdGhpcy50eXBlID0gdHlwZTtcbiAgdGhpcy50YXJnZXQgPSB0YXJnZXQ7XG4gIHRoaXMuYWRkZWROb2RlcyA9IFtdO1xuICB0aGlzLnJlbW92ZWROb2RlcyA9IFtdO1xuICB0aGlzLnByZXZpb3VzU2libGluZyA9IG51bGw7XG4gIHRoaXMubmV4dFNpYmxpbmcgPSBudWxsO1xuICB0aGlzLmF0dHJpYnV0ZU5hbWUgPSBudWxsO1xuICB0aGlzLmF0dHJpYnV0ZU5hbWVzcGFjZSA9IG51bGw7XG4gIHRoaXMub2xkVmFsdWUgPSBudWxsO1xufVxuXG5mdW5jdGlvbiBjb3B5TXV0YXRpb25SZWNvcmQob3JpZ2luYWwpIHtcbiAgdmFyIHJlY29yZCA9IG5ldyBNdXRhdGlvblJlY29yZChvcmlnaW5hbC50eXBlLCBvcmlnaW5hbC50YXJnZXQpO1xuICByZWNvcmQuYWRkZWROb2RlcyA9IG9yaWdpbmFsLmFkZGVkTm9kZXMuc2xpY2UoKTtcbiAgcmVjb3JkLnJlbW92ZWROb2RlcyA9IG9yaWdpbmFsLnJlbW92ZWROb2Rlcy5zbGljZSgpO1xuICByZWNvcmQucHJldmlvdXNTaWJsaW5nID0gb3JpZ2luYWwucHJldmlvdXNTaWJsaW5nO1xuICByZWNvcmQubmV4dFNpYmxpbmcgPSBvcmlnaW5hbC5uZXh0U2libGluZztcbiAgcmVjb3JkLmF0dHJpYnV0ZU5hbWUgPSBvcmlnaW5hbC5hdHRyaWJ1dGVOYW1lO1xuICByZWNvcmQuYXR0cmlidXRlTmFtZXNwYWNlID0gb3JpZ2luYWwuYXR0cmlidXRlTmFtZXNwYWNlO1xuICByZWNvcmQub2xkVmFsdWUgPSBvcmlnaW5hbC5vbGRWYWx1ZTtcbiAgcmV0dXJuIHJlY29yZDtcbn07XG5cbi8vIFdlIGtlZXAgdHJhY2sgb2YgdGhlIHR3byAocG9zc2libHkgb25lKSByZWNvcmRzIHVzZWQgaW4gYSBzaW5nbGUgbXV0YXRpb24uXG52YXIgY3VycmVudFJlY29yZCwgcmVjb3JkV2l0aE9sZFZhbHVlO1xuXG4vKipcbiAqIENyZWF0ZXMgYSByZWNvcmQgd2l0aG91dCB8b2xkVmFsdWV8IGFuZCBjYWNoZXMgaXQgYXMgfGN1cnJlbnRSZWNvcmR8IGZvclxuICogbGF0ZXIgdXNlLlxuICogQHBhcmFtIHtzdHJpbmd9IG9sZFZhbHVlXG4gKiBAcmV0dXJuIHtNdXRhdGlvblJlY29yZH1cbiAqL1xuZnVuY3Rpb24gZ2V0UmVjb3JkKHR5cGUsIHRhcmdldCkge1xuICByZXR1cm4gY3VycmVudFJlY29yZCA9IG5ldyBNdXRhdGlvblJlY29yZCh0eXBlLCB0YXJnZXQpO1xufVxuXG4vKipcbiAqIEdldHMgb3IgY3JlYXRlcyBhIHJlY29yZCB3aXRoIHxvbGRWYWx1ZXwgYmFzZWQgaW4gdGhlIHxjdXJyZW50UmVjb3JkfFxuICogQHBhcmFtIHtzdHJpbmd9IG9sZFZhbHVlXG4gKiBAcmV0dXJuIHtNdXRhdGlvblJlY29yZH1cbiAqL1xuZnVuY3Rpb24gZ2V0UmVjb3JkV2l0aE9sZFZhbHVlKG9sZFZhbHVlKSB7XG4gIGlmIChyZWNvcmRXaXRoT2xkVmFsdWUpXG4gICAgcmV0dXJuIHJlY29yZFdpdGhPbGRWYWx1ZTtcbiAgcmVjb3JkV2l0aE9sZFZhbHVlID0gY29weU11dGF0aW9uUmVjb3JkKGN1cnJlbnRSZWNvcmQpO1xuICByZWNvcmRXaXRoT2xkVmFsdWUub2xkVmFsdWUgPSBvbGRWYWx1ZTtcbiAgcmV0dXJuIHJlY29yZFdpdGhPbGRWYWx1ZTtcbn1cblxuZnVuY3Rpb24gY2xlYXJSZWNvcmRzKCkge1xuICBjdXJyZW50UmVjb3JkID0gcmVjb3JkV2l0aE9sZFZhbHVlID0gdW5kZWZpbmVkO1xufVxuXG4vKipcbiAqIEBwYXJhbSB7TXV0YXRpb25SZWNvcmR9IHJlY29yZFxuICogQHJldHVybiB7Ym9vbGVhbn0gV2hldGhlciB0aGUgcmVjb3JkIHJlcHJlc2VudHMgYSByZWNvcmQgZnJvbSB0aGUgY3VycmVudFxuICogbXV0YXRpb24gZXZlbnQuXG4gKi9cbmZ1bmN0aW9uIHJlY29yZFJlcHJlc2VudHNDdXJyZW50TXV0YXRpb24ocmVjb3JkKSB7XG4gIHJldHVybiByZWNvcmQgPT09IHJlY29yZFdpdGhPbGRWYWx1ZSB8fCByZWNvcmQgPT09IGN1cnJlbnRSZWNvcmQ7XG59XG5cbi8qKlxuICogU2VsZWN0cyB3aGljaCByZWNvcmQsIGlmIGFueSwgdG8gcmVwbGFjZSB0aGUgbGFzdCByZWNvcmQgaW4gdGhlIHF1ZXVlLlxuICogVGhpcyByZXR1cm5zIHxudWxsfCBpZiBubyByZWNvcmQgc2hvdWxkIGJlIHJlcGxhY2VkLlxuICpcbiAqIEBwYXJhbSB7TXV0YXRpb25SZWNvcmR9IGxhc3RSZWNvcmRcbiAqIEBwYXJhbSB7TXV0YXRpb25SZWNvcmR9IG5ld1JlY29yZFxuICogQHBhcmFtIHtNdXRhdGlvblJlY29yZH1cbiAqL1xuZnVuY3Rpb24gc2VsZWN0UmVjb3JkKGxhc3RSZWNvcmQsIG5ld1JlY29yZCkge1xuICBpZiAobGFzdFJlY29yZCA9PT0gbmV3UmVjb3JkKVxuICAgIHJldHVybiBsYXN0UmVjb3JkO1xuXG4gIC8vIENoZWNrIGlmIHRoZSB0aGUgcmVjb3JkIHdlIGFyZSBhZGRpbmcgcmVwcmVzZW50cyB0aGUgc2FtZSByZWNvcmQuIElmXG4gIC8vIHNvLCB3ZSBrZWVwIHRoZSBvbmUgd2l0aCB0aGUgb2xkVmFsdWUgaW4gaXQuXG4gIGlmIChyZWNvcmRXaXRoT2xkVmFsdWUgJiYgcmVjb3JkUmVwcmVzZW50c0N1cnJlbnRNdXRhdGlvbihsYXN0UmVjb3JkKSlcbiAgICByZXR1cm4gcmVjb3JkV2l0aE9sZFZhbHVlO1xuXG4gIHJldHVybiBudWxsO1xufVxuXG4vKipcbiAqIENsYXNzIHVzZWQgdG8gcmVwcmVzZW50IGEgcmVnaXN0ZXJlZCBvYnNlcnZlci5cbiAqIEBwYXJhbSB7TXV0YXRpb25PYnNlcnZlcn0gb2JzZXJ2ZXJcbiAqIEBwYXJhbSB7Tm9kZX0gdGFyZ2V0XG4gKiBAcGFyYW0ge011dGF0aW9uT2JzZXJ2ZXJJbml0fSBvcHRpb25zXG4gKiBAY29uc3RydWN0b3JcbiAqL1xuZnVuY3Rpb24gUmVnaXN0cmF0aW9uKG9ic2VydmVyLCB0YXJnZXQsIG9wdGlvbnMpIHtcbiAgdGhpcy5vYnNlcnZlciA9IG9ic2VydmVyO1xuICB0aGlzLnRhcmdldCA9IHRhcmdldDtcbiAgdGhpcy5vcHRpb25zID0gb3B0aW9ucztcbiAgdGhpcy50cmFuc2llbnRPYnNlcnZlZE5vZGVzID0gW107XG59XG5cblJlZ2lzdHJhdGlvbi5wcm90b3R5cGUgPSB7XG4gIGVucXVldWU6IGZ1bmN0aW9uKHJlY29yZCkge1xuICAgIHZhciByZWNvcmRzID0gdGhpcy5vYnNlcnZlci5yZWNvcmRzXztcbiAgICB2YXIgbGVuZ3RoID0gcmVjb3Jkcy5sZW5ndGg7XG5cbiAgICAvLyBUaGVyZSBhcmUgY2FzZXMgd2hlcmUgd2UgcmVwbGFjZSB0aGUgbGFzdCByZWNvcmQgd2l0aCB0aGUgbmV3IHJlY29yZC5cbiAgICAvLyBGb3IgZXhhbXBsZSBpZiB0aGUgcmVjb3JkIHJlcHJlc2VudHMgdGhlIHNhbWUgbXV0YXRpb24gd2UgbmVlZCB0byB1c2VcbiAgICAvLyB0aGUgb25lIHdpdGggdGhlIG9sZFZhbHVlLiBJZiB3ZSBnZXQgc2FtZSByZWNvcmQgKHRoaXMgY2FuIGhhcHBlbiBhcyB3ZVxuICAgIC8vIHdhbGsgdXAgdGhlIHRyZWUpIHdlIGlnbm9yZSB0aGUgbmV3IHJlY29yZC5cbiAgICBpZiAocmVjb3Jkcy5sZW5ndGggPiAwKSB7XG4gICAgICB2YXIgbGFzdFJlY29yZCA9IHJlY29yZHNbbGVuZ3RoIC0gMV07XG4gICAgICB2YXIgcmVjb3JkVG9SZXBsYWNlTGFzdCA9IHNlbGVjdFJlY29yZChsYXN0UmVjb3JkLCByZWNvcmQpO1xuICAgICAgaWYgKHJlY29yZFRvUmVwbGFjZUxhc3QpIHtcbiAgICAgICAgcmVjb3Jkc1tsZW5ndGggLSAxXSA9IHJlY29yZFRvUmVwbGFjZUxhc3Q7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgc2NoZWR1bGVDYWxsYmFjayh0aGlzLm9ic2VydmVyKTtcbiAgICB9XG5cbiAgICByZWNvcmRzW2xlbmd0aF0gPSByZWNvcmQ7XG4gIH0sXG5cbiAgYWRkTGlzdGVuZXJzOiBmdW5jdGlvbigpIHtcbiAgICB0aGlzLmFkZExpc3RlbmVyc18odGhpcy50YXJnZXQpO1xuICB9LFxuXG4gIGFkZExpc3RlbmVyc186IGZ1bmN0aW9uKG5vZGUpIHtcbiAgICB2YXIgb3B0aW9ucyA9IHRoaXMub3B0aW9ucztcbiAgICBpZiAob3B0aW9ucy5hdHRyaWJ1dGVzKVxuICAgICAgbm9kZS5hZGRFdmVudExpc3RlbmVyKCdET01BdHRyTW9kaWZpZWQnLCB0aGlzLCB0cnVlKTtcblxuICAgIGlmIChvcHRpb25zLmNoYXJhY3RlckRhdGEpXG4gICAgICBub2RlLmFkZEV2ZW50TGlzdGVuZXIoJ0RPTUNoYXJhY3RlckRhdGFNb2RpZmllZCcsIHRoaXMsIHRydWUpO1xuXG4gICAgaWYgKG9wdGlvbnMuY2hpbGRMaXN0KVxuICAgICAgbm9kZS5hZGRFdmVudExpc3RlbmVyKCdET01Ob2RlSW5zZXJ0ZWQnLCB0aGlzLCB0cnVlKTtcblxuICAgIGlmIChvcHRpb25zLmNoaWxkTGlzdCB8fCBvcHRpb25zLnN1YnRyZWUpXG4gICAgICBub2RlLmFkZEV2ZW50TGlzdGVuZXIoJ0RPTU5vZGVSZW1vdmVkJywgdGhpcywgdHJ1ZSk7XG4gIH0sXG5cbiAgcmVtb3ZlTGlzdGVuZXJzOiBmdW5jdGlvbigpIHtcbiAgICB0aGlzLnJlbW92ZUxpc3RlbmVyc18odGhpcy50YXJnZXQpO1xuICB9LFxuXG4gIHJlbW92ZUxpc3RlbmVyc186IGZ1bmN0aW9uKG5vZGUpIHtcbiAgICB2YXIgb3B0aW9ucyA9IHRoaXMub3B0aW9ucztcbiAgICBpZiAob3B0aW9ucy5hdHRyaWJ1dGVzKVxuICAgICAgbm9kZS5yZW1vdmVFdmVudExpc3RlbmVyKCdET01BdHRyTW9kaWZpZWQnLCB0aGlzLCB0cnVlKTtcblxuICAgIGlmIChvcHRpb25zLmNoYXJhY3RlckRhdGEpXG4gICAgICBub2RlLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ0RPTUNoYXJhY3RlckRhdGFNb2RpZmllZCcsIHRoaXMsIHRydWUpO1xuXG4gICAgaWYgKG9wdGlvbnMuY2hpbGRMaXN0KVxuICAgICAgbm9kZS5yZW1vdmVFdmVudExpc3RlbmVyKCdET01Ob2RlSW5zZXJ0ZWQnLCB0aGlzLCB0cnVlKTtcblxuICAgIGlmIChvcHRpb25zLmNoaWxkTGlzdCB8fCBvcHRpb25zLnN1YnRyZWUpXG4gICAgICBub2RlLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ0RPTU5vZGVSZW1vdmVkJywgdGhpcywgdHJ1ZSk7XG4gIH0sXG5cbiAgLyoqXG4gICAqIEFkZHMgYSB0cmFuc2llbnQgb2JzZXJ2ZXIgb24gbm9kZS4gVGhlIHRyYW5zaWVudCBvYnNlcnZlciBnZXRzIHJlbW92ZWRcbiAgICogbmV4dCB0aW1lIHdlIGRlbGl2ZXIgdGhlIGNoYW5nZSByZWNvcmRzLlxuICAgKiBAcGFyYW0ge05vZGV9IG5vZGVcbiAgICovXG4gIGFkZFRyYW5zaWVudE9ic2VydmVyOiBmdW5jdGlvbihub2RlKSB7XG4gICAgLy8gRG9uJ3QgYWRkIHRyYW5zaWVudCBvYnNlcnZlcnMgb24gdGhlIHRhcmdldCBpdHNlbGYuIFdlIGFscmVhZHkgaGF2ZSBhbGxcbiAgICAvLyB0aGUgcmVxdWlyZWQgbGlzdGVuZXJzIHNldCB1cCBvbiB0aGUgdGFyZ2V0LlxuICAgIGlmIChub2RlID09PSB0aGlzLnRhcmdldClcbiAgICAgIHJldHVybjtcblxuICAgIHRoaXMuYWRkTGlzdGVuZXJzXyhub2RlKTtcbiAgICB0aGlzLnRyYW5zaWVudE9ic2VydmVkTm9kZXMucHVzaChub2RlKTtcbiAgICB2YXIgcmVnaXN0cmF0aW9ucyA9IHJlZ2lzdHJhdGlvbnNUYWJsZS5nZXQobm9kZSk7XG4gICAgaWYgKCFyZWdpc3RyYXRpb25zKVxuICAgICAgcmVnaXN0cmF0aW9uc1RhYmxlLnNldChub2RlLCByZWdpc3RyYXRpb25zID0gW10pO1xuXG4gICAgLy8gV2Uga25vdyB0aGF0IHJlZ2lzdHJhdGlvbnMgZG9lcyBub3QgY29udGFpbiB0aGlzIGJlY2F1c2Ugd2UgYWxyZWFkeVxuICAgIC8vIGNoZWNrZWQgaWYgbm9kZSA9PT0gdGhpcy50YXJnZXQuXG4gICAgcmVnaXN0cmF0aW9ucy5wdXNoKHRoaXMpO1xuICB9LFxuXG4gIHJlbW92ZVRyYW5zaWVudE9ic2VydmVyczogZnVuY3Rpb24oKSB7XG4gICAgdmFyIHRyYW5zaWVudE9ic2VydmVkTm9kZXMgPSB0aGlzLnRyYW5zaWVudE9ic2VydmVkTm9kZXM7XG4gICAgdGhpcy50cmFuc2llbnRPYnNlcnZlZE5vZGVzID0gW107XG5cbiAgICB0cmFuc2llbnRPYnNlcnZlZE5vZGVzLmZvckVhY2goZnVuY3Rpb24obm9kZSkge1xuICAgICAgLy8gVHJhbnNpZW50IG9ic2VydmVycyBhcmUgbmV2ZXIgYWRkZWQgdG8gdGhlIHRhcmdldC5cbiAgICAgIHRoaXMucmVtb3ZlTGlzdGVuZXJzXyhub2RlKTtcblxuICAgICAgdmFyIHJlZ2lzdHJhdGlvbnMgPSByZWdpc3RyYXRpb25zVGFibGUuZ2V0KG5vZGUpO1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCByZWdpc3RyYXRpb25zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmIChyZWdpc3RyYXRpb25zW2ldID09PSB0aGlzKSB7XG4gICAgICAgICAgcmVnaXN0cmF0aW9ucy5zcGxpY2UoaSwgMSk7XG4gICAgICAgICAgLy8gRWFjaCBub2RlIGNhbiBvbmx5IGhhdmUgb25lIHJlZ2lzdGVyZWQgb2JzZXJ2ZXIgYXNzb2NpYXRlZCB3aXRoXG4gICAgICAgICAgLy8gdGhpcyBvYnNlcnZlci5cbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sIHRoaXMpO1xuICB9LFxuXG4gIGhhbmRsZUV2ZW50OiBmdW5jdGlvbihlKSB7XG4gICAgLy8gU3RvcCBwcm9wYWdhdGlvbiBzaW5jZSB3ZSBhcmUgbWFuYWdpbmcgdGhlIHByb3BhZ2F0aW9uIG1hbnVhbGx5LlxuICAgIC8vIFRoaXMgbWVhbnMgdGhhdCBvdGhlciBtdXRhdGlvbiBldmVudHMgb24gdGhlIHBhZ2Ugd2lsbCBub3Qgd29ya1xuICAgIC8vIGNvcnJlY3RseSBidXQgdGhhdCBpcyBieSBkZXNpZ24uXG4gICAgZS5zdG9wSW1tZWRpYXRlUHJvcGFnYXRpb24oKTtcblxuICAgIHN3aXRjaCAoZS50eXBlKSB7XG4gICAgICBjYXNlICdET01BdHRyTW9kaWZpZWQnOlxuICAgICAgICAvLyBodHRwOi8vZG9tLnNwZWMud2hhdHdnLm9yZy8jY29uY2VwdC1tby1xdWV1ZS1hdHRyaWJ1dGVzXG5cbiAgICAgICAgdmFyIG5hbWUgPSBlLmF0dHJOYW1lO1xuICAgICAgICB2YXIgbmFtZXNwYWNlID0gZS5yZWxhdGVkTm9kZS5uYW1lc3BhY2VVUkk7XG4gICAgICAgIHZhciB0YXJnZXQgPSBlLnRhcmdldDtcblxuICAgICAgICAvLyAxLlxuICAgICAgICB2YXIgcmVjb3JkID0gbmV3IGdldFJlY29yZCgnYXR0cmlidXRlcycsIHRhcmdldCk7XG4gICAgICAgIHJlY29yZC5hdHRyaWJ1dGVOYW1lID0gbmFtZTtcbiAgICAgICAgcmVjb3JkLmF0dHJpYnV0ZU5hbWVzcGFjZSA9IG5hbWVzcGFjZTtcblxuICAgICAgICAvLyAyLlxuICAgICAgICB2YXIgb2xkVmFsdWUgPVxuICAgICAgICAgICAgZS5hdHRyQ2hhbmdlID09PSBNdXRhdGlvbkV2ZW50LkFERElUSU9OID8gbnVsbCA6IGUucHJldlZhbHVlO1xuXG4gICAgICAgIGZvckVhY2hBbmNlc3RvckFuZE9ic2VydmVyRW5xdWV1ZVJlY29yZCh0YXJnZXQsIGZ1bmN0aW9uKG9wdGlvbnMpIHtcbiAgICAgICAgICAvLyAzLjEsIDQuMlxuICAgICAgICAgIGlmICghb3B0aW9ucy5hdHRyaWJ1dGVzKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgICAgLy8gMy4yLCA0LjNcbiAgICAgICAgICBpZiAob3B0aW9ucy5hdHRyaWJ1dGVGaWx0ZXIgJiYgb3B0aW9ucy5hdHRyaWJ1dGVGaWx0ZXIubGVuZ3RoICYmXG4gICAgICAgICAgICAgIG9wdGlvbnMuYXR0cmlidXRlRmlsdGVyLmluZGV4T2YobmFtZSkgPT09IC0xICYmXG4gICAgICAgICAgICAgIG9wdGlvbnMuYXR0cmlidXRlRmlsdGVyLmluZGV4T2YobmFtZXNwYWNlKSA9PT0gLTEpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gMy4zLCA0LjRcbiAgICAgICAgICBpZiAob3B0aW9ucy5hdHRyaWJ1dGVPbGRWYWx1ZSlcbiAgICAgICAgICAgIHJldHVybiBnZXRSZWNvcmRXaXRoT2xkVmFsdWUob2xkVmFsdWUpO1xuXG4gICAgICAgICAgLy8gMy40LCA0LjVcbiAgICAgICAgICByZXR1cm4gcmVjb3JkO1xuICAgICAgICB9KTtcblxuICAgICAgICBicmVhaztcblxuICAgICAgY2FzZSAnRE9NQ2hhcmFjdGVyRGF0YU1vZGlmaWVkJzpcbiAgICAgICAgLy8gaHR0cDovL2RvbS5zcGVjLndoYXR3Zy5vcmcvI2NvbmNlcHQtbW8tcXVldWUtY2hhcmFjdGVyZGF0YVxuICAgICAgICB2YXIgdGFyZ2V0ID0gZS50YXJnZXQ7XG5cbiAgICAgICAgLy8gMS5cbiAgICAgICAgdmFyIHJlY29yZCA9IGdldFJlY29yZCgnY2hhcmFjdGVyRGF0YScsIHRhcmdldCk7XG5cbiAgICAgICAgLy8gMi5cbiAgICAgICAgdmFyIG9sZFZhbHVlID0gZS5wcmV2VmFsdWU7XG5cblxuICAgICAgICBmb3JFYWNoQW5jZXN0b3JBbmRPYnNlcnZlckVucXVldWVSZWNvcmQodGFyZ2V0LCBmdW5jdGlvbihvcHRpb25zKSB7XG4gICAgICAgICAgLy8gMy4xLCA0LjJcbiAgICAgICAgICBpZiAoIW9wdGlvbnMuY2hhcmFjdGVyRGF0YSlcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICAgIC8vIDMuMiwgNC4zXG4gICAgICAgICAgaWYgKG9wdGlvbnMuY2hhcmFjdGVyRGF0YU9sZFZhbHVlKVxuICAgICAgICAgICAgcmV0dXJuIGdldFJlY29yZFdpdGhPbGRWYWx1ZShvbGRWYWx1ZSk7XG5cbiAgICAgICAgICAvLyAzLjMsIDQuNFxuICAgICAgICAgIHJldHVybiByZWNvcmQ7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGJyZWFrO1xuXG4gICAgICBjYXNlICdET01Ob2RlUmVtb3ZlZCc6XG4gICAgICAgIHRoaXMuYWRkVHJhbnNpZW50T2JzZXJ2ZXIoZS50YXJnZXQpO1xuICAgICAgICAvLyBGYWxsIHRocm91Z2guXG4gICAgICBjYXNlICdET01Ob2RlSW5zZXJ0ZWQnOlxuICAgICAgICAvLyBodHRwOi8vZG9tLnNwZWMud2hhdHdnLm9yZy8jY29uY2VwdC1tby1xdWV1ZS1jaGlsZGxpc3RcbiAgICAgICAgdmFyIHRhcmdldCA9IGUucmVsYXRlZE5vZGU7XG4gICAgICAgIHZhciBjaGFuZ2VkTm9kZSA9IGUudGFyZ2V0O1xuICAgICAgICB2YXIgYWRkZWROb2RlcywgcmVtb3ZlZE5vZGVzO1xuICAgICAgICBpZiAoZS50eXBlID09PSAnRE9NTm9kZUluc2VydGVkJykge1xuICAgICAgICAgIGFkZGVkTm9kZXMgPSBbY2hhbmdlZE5vZGVdO1xuICAgICAgICAgIHJlbW92ZWROb2RlcyA9IFtdO1xuICAgICAgICB9IGVsc2Uge1xuXG4gICAgICAgICAgYWRkZWROb2RlcyA9IFtdO1xuICAgICAgICAgIHJlbW92ZWROb2RlcyA9IFtjaGFuZ2VkTm9kZV07XG4gICAgICAgIH1cbiAgICAgICAgdmFyIHByZXZpb3VzU2libGluZyA9IGNoYW5nZWROb2RlLnByZXZpb3VzU2libGluZztcbiAgICAgICAgdmFyIG5leHRTaWJsaW5nID0gY2hhbmdlZE5vZGUubmV4dFNpYmxpbmc7XG5cbiAgICAgICAgLy8gMS5cbiAgICAgICAgdmFyIHJlY29yZCA9IGdldFJlY29yZCgnY2hpbGRMaXN0JywgdGFyZ2V0KTtcbiAgICAgICAgcmVjb3JkLmFkZGVkTm9kZXMgPSBhZGRlZE5vZGVzO1xuICAgICAgICByZWNvcmQucmVtb3ZlZE5vZGVzID0gcmVtb3ZlZE5vZGVzO1xuICAgICAgICByZWNvcmQucHJldmlvdXNTaWJsaW5nID0gcHJldmlvdXNTaWJsaW5nO1xuICAgICAgICByZWNvcmQubmV4dFNpYmxpbmcgPSBuZXh0U2libGluZztcblxuICAgICAgICBmb3JFYWNoQW5jZXN0b3JBbmRPYnNlcnZlckVucXVldWVSZWNvcmQodGFyZ2V0LCBmdW5jdGlvbihvcHRpb25zKSB7XG4gICAgICAgICAgLy8gMi4xLCAzLjJcbiAgICAgICAgICBpZiAoIW9wdGlvbnMuY2hpbGRMaXN0KVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgICAgLy8gMi4yLCAzLjNcbiAgICAgICAgICByZXR1cm4gcmVjb3JkO1xuICAgICAgICB9KTtcblxuICAgIH1cblxuICAgIGNsZWFyUmVjb3JkcygpO1xuICB9XG59O1xuXG5pZiAoIU11dGF0aW9uT2JzZXJ2ZXIpIHtcbiAgTXV0YXRpb25PYnNlcnZlciA9IEpzTXV0YXRpb25PYnNlcnZlcjtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBNdXRhdGlvbk9ic2VydmVyO1xuIiwiaW1wb3J0IHsgU2NvcGUsIFNjb3BlRXhlY3V0b3IsIEVsZW1lbnRNYXRjaGVyLCBFdmVudE1hdGNoZXIsIFN1YnNjcmlwdGlvbkV4ZWN1dG9yIH0gZnJvbSAnLi9zY29wZSc7XG5cbmV4cG9ydCBkZWZhdWx0IERlY2w7XG5cbmV4cG9ydCBjbGFzcyBEZWNsIHtcbiAgICBwcml2YXRlIHN0YXRpYyBkZWZhdWx0SW5zdGFuY2U6IERlY2w7XG5cbiAgICBzdGF0aWMgc2VsZWN0KG1hdGNoZXI6IEVsZW1lbnRNYXRjaGVyLCBleGVjdXRvcjogU2NvcGVFeGVjdXRvcik6IFNjb3BlIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0RGVmYXVsdEluc3RhbmNlKCkuc2VsZWN0KG1hdGNoZXIsIGV4ZWN1dG9yKTtcbiAgICB9XG5cbiAgICBzdGF0aWMgb24obWF0Y2hlcjogRXZlbnRNYXRjaGVyLCBleGVjdXRvcjogU3Vic2NyaXB0aW9uRXhlY3V0b3IpOiBTY29wZSB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldERlZmF1bHRJbnN0YW5jZSgpLm9uKG1hdGNoZXIsIGV4ZWN1dG9yKTtcbiAgICB9XG5cbiAgICBzdGF0aWMgZ2V0Um9vdFNjb3BlKCk6IFNjb3BlIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0RGVmYXVsdEluc3RhbmNlKCkuZ2V0Um9vdFNjb3BlKCk7XG4gICAgfVxuXG4gICAgc3RhdGljIGNvbGxlY3RTY29wZXMoKTogU2NvcGVbXSB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldERlZmF1bHRJbnN0YW5jZSgpLmNvbGxlY3RTY29wZXMoKTtcbiAgICB9XG5cbiAgICBzdGF0aWMgZHJhd1RyZWUoKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0RGVmYXVsdEluc3RhbmNlKCkuZHJhd1RyZWUoKTtcbiAgICB9XG5cbiAgICBzdGF0aWMgZ2V0RGVmYXVsdEluc3RhbmNlKCkgOiBEZWNsIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZGVmYXVsdEluc3RhbmNlIHx8ICh0aGlzLmRlZmF1bHRJbnN0YW5jZSA9IG5ldyBEZWNsKGRvY3VtZW50LmRvY3VtZW50RWxlbWVudCkpO1xuICAgIH1cblxuICAgIHN0YXRpYyBzZXREZWZhdWx0SW5zdGFuY2UoZGVjbDogRGVjbCkgOiBEZWNsIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZGVmYXVsdEluc3RhbmNlID0gZGVjbDtcbiAgICB9XG5cbiAgICBzdGF0aWMgcHJpc3RpbmUoKTogdm9pZCB7XG4gICAgICAgIGlmKHRoaXMuZGVmYXVsdEluc3RhbmNlKSB7XG4gICAgICAgICAgICB0aGlzLmRlZmF1bHRJbnN0YW5jZS5wcmlzdGluZSgpO1xuICAgICAgICAgICAgdGhpcy5kZWZhdWx0SW5zdGFuY2UgPSBudWxsO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBzY29wZTogU2NvcGU7XG5cbiAgICBjb25zdHJ1Y3Rvcihyb290OiBFbGVtZW50KSB7XG4gICAgICAgIHRoaXMuc2NvcGUgPSBTY29wZS5idWlsZFJvb3RTY29wZShyb290KTtcbiAgICB9XG5cbiAgICBzZWxlY3QobWF0Y2hlcjogRWxlbWVudE1hdGNoZXIsIGV4ZWN1dG9yOiBTY29wZUV4ZWN1dG9yKTogU2NvcGUge1xuICAgICAgICByZXR1cm4gdGhpcy5zY29wZS5zZWxlY3QobWF0Y2hlciwgZXhlY3V0b3IpO1xuICAgIH1cblxuICAgIG9uKG1hdGNoZXI6IEV2ZW50TWF0Y2hlciwgZXhlY3V0b3I6IFN1YnNjcmlwdGlvbkV4ZWN1dG9yKTogU2NvcGUge1xuICAgICAgICByZXR1cm4gdGhpcy5zY29wZS5vbihtYXRjaGVyLCBleGVjdXRvcik7XG4gICAgfVxuXG4gICAgZ2V0Um9vdFNjb3BlKCk6IFNjb3BlIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2NvcGU7XG4gICAgfVxuICAgIFxuICAgIGNvbGxlY3RTY29wZXMoKTogU2NvcGVbXSB7XG4gICAgICAgIHJldHVybiBbdGhpcy5zY29wZSwgLi4udGhpcy5zY29wZS5jb2xsZWN0RGVzY2VuZGFudFNjb3BlcygpXTtcbiAgICB9XG5cbiAgICBkcmF3VHJlZSgpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gdGhpcy5zY29wZS5kcmF3VHJlZSgpO1xuICAgIH1cblxuICAgIHByaXN0aW5lKCk6IHZvaWQge1xuICAgICAgICB0aGlzLnNjb3BlLnByaXN0aW5lKCk7XG4gICAgfVxufVxuXG4vLyBFeHBvcnQgdG8gYSBnbG9iYWwgZm9yIHRoZSBicm93c2VyICh0aGVyZSAqaGFzKiB0byBiZSBhIGJldHRlciB3YXkgdG8gZG8gdGhpcyEpXG5pZih0eXBlb2Yod2luZG93KSAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAoPGFueT53aW5kb3cpLkRlY2wgPSBEZWNsO1xufVxuXG5leHBvcnQgeyBTY29wZSwgU2NvcGVFeGVjdXRvciwgRWxlbWVudE1hdGNoZXIsIEV2ZW50TWF0Y2hlciwgU3Vic2NyaXB0aW9uRXhlY3V0b3IgfTtcbiIsImV4cG9ydCBkZWZhdWx0IEVsZW1lbnRDb2xsZWN0b3I7XG5cbmV4cG9ydCBpbnRlcmZhY2UgRWxlbWVudFZpc3RvciB7IChlbGVtZW50OiBFbGVtZW50KTogRWxlbWVudE1hdGNoZXIgfCBib29sZWFuIH1cbmV4cG9ydCBkZWNsYXJlIHR5cGUgRWxlbWVudE1hdGNoZXIgPSBzdHJpbmcgfCBOb2RlTGlzdE9mPEVsZW1lbnQ+IHwgRWxlbWVudFtdIHwgRWxlbWVudFZpc3RvcjtcblxuZXhwb3J0IGNsYXNzIEVsZW1lbnRDb2xsZWN0b3Ige1xuICAgIHByaXZhdGUgc3RhdGljIGluc3RhbmNlOiBFbGVtZW50Q29sbGVjdG9yO1xuICAgIFxuICAgIHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IEVMRU1FTlRfTUFUQ0hFUl9UWVBFX0VSUk9SX01FU1NBR0UgPSBcIkRlY2w6IEFuIGBFbGVtZW50TWF0Y2hlcmAgbXVzdCBiZSBhIENTUyBzZWxlY3RvciAoc3RyaW5nKSBvciBhIGZ1bmN0aW9uIHdoaWNoIHRha2VzIGEgbm9kZSB1bmRlciBjb25zaWRlcmF0aW9uIGFuZCByZXR1cm5zIGEgQ1NTIHNlbGVjdG9yIChzdHJpbmcpIHRoYXQgbWF0Y2hlcyBhbGwgbWF0Y2hpbmcgbm9kZXMgaW4gdGhlIHN1YnRyZWUsIGFuIGFycmF5LWxpa2Ugb2JqZWN0IG9mIG1hdGNoaW5nIG5vZGVzIGluIHRoZSBzdWJ0cmVlLCBvciBhIGJvb2xlYW4gdmFsdWUgYXMgdG8gd2hldGhlciB0aGUgbm9kZSBzaG91bGQgYmUgaW5jbHVkZWQgKGluIHRoaXMgY2FzZSwgdGhlIGZ1bmN0aW9uIHdpbGwgYmUgaW52b2tlZCBhZ2FpbiBmb3IgYWxsIGNoaWxkcmVuIG9mIHRoZSBub2RlKS5cIjtcblxuICAgIHN0YXRpYyBpc01hdGNoaW5nRWxlbWVudChyb290RWxlbWVudDogRWxlbWVudCwgZWxlbWVudE1hdGNoZXI6IEVsZW1lbnRNYXRjaGVyKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldEluc3RhbmNlKCkuaXNNYXRjaGluZ0VsZW1lbnQocm9vdEVsZW1lbnQsIGVsZW1lbnRNYXRjaGVyKTtcbiAgICB9XG5cbiAgICBzdGF0aWMgY29sbGVjdE1hdGNoaW5nRWxlbWVudHMocm9vdEVsZW1lbnQ6IEVsZW1lbnQsIGVsZW1lbnRNYXRjaGVyOiBFbGVtZW50TWF0Y2hlcik6IEVsZW1lbnRbXSB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldEluc3RhbmNlKCkuY29sbGVjdE1hdGNoaW5nRWxlbWVudHMocm9vdEVsZW1lbnQsIGVsZW1lbnRNYXRjaGVyKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHN0YXRpYyBnZXRJbnN0YW5jZSgpIDogRWxlbWVudENvbGxlY3RvciB7XG4gICAgICAgIHJldHVybiB0aGlzLmluc3RhbmNlIHx8ICh0aGlzLmluc3RhbmNlID0gbmV3IEVsZW1lbnRDb2xsZWN0b3IoKSk7XG4gICAgfVxuXG4gICAgaXNNYXRjaGluZ0VsZW1lbnQoZWxlbWVudDogRWxlbWVudCwgZWxlbWVudE1hdGNoZXI6IEVsZW1lbnRNYXRjaGVyKTogYm9vbGVhbiB7XG4gICAgICAgIHN3aXRjaCh0eXBlb2YoZWxlbWVudE1hdGNoZXIpKSB7XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoRWxlbWVudENvbGxlY3Rvci5FTEVNRU5UX01BVENIRVJfVFlQRV9FUlJPUl9NRVNTQUdFKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgICAgICAgICAgICAgbGV0IGNzc1NlbGVjdG9yOiBzdHJpbmcgPSA8c3RyaW5nPmVsZW1lbnRNYXRjaGVyO1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmlzTWF0Y2hpbmdFbGVtZW50RnJvbUNzc1NlbGVjdG9yKGVsZW1lbnQsIGNzc1NlbGVjdG9yKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgICAgICAgICAgICBsZXQgb2JqZWN0ID0gPE9iamVjdD5lbGVtZW50TWF0Y2hlcjtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5pc01hdGNoaW5nRWxlbWVudEZyb21PYmplY3QoZWxlbWVudCwgb2JqZWN0KTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIGNhc2UgJ2Z1bmN0aW9uJzpcbiAgICAgICAgICAgICAgICBsZXQgZWxlbWVudFZpc3RvciA9IDxFbGVtZW50VmlzdG9yPmVsZW1lbnRNYXRjaGVyO1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmlzTWF0Y2hpbmdFbGVtZW50RnJvbUVsZW1lbnRWaXN0b3IoZWxlbWVudCwgZWxlbWVudFZpc3Rvcik7ICAgICAgIFxuICAgICAgICB9XG4gICAgfVxuXG4gICAgY29sbGVjdE1hdGNoaW5nRWxlbWVudHMoZWxlbWVudDogRWxlbWVudCwgZWxlbWVudE1hdGNoZXI6IEVsZW1lbnRNYXRjaGVyKTogRWxlbWVudFtdIHtcbiAgICAgICAgc3dpdGNoKHR5cGVvZihlbGVtZW50TWF0Y2hlcikpIHtcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihFbGVtZW50Q29sbGVjdG9yLkVMRU1FTlRfTUFUQ0hFUl9UWVBFX0VSUk9SX01FU1NBR0UpO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgICAgICAgICAgICBsZXQgY3NzU2VsZWN0b3I6IHN0cmluZyA9IDxzdHJpbmc+ZWxlbWVudE1hdGNoZXI7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuY29sbGVjdE1hdGNoaW5nRWxlbWVudHNGcm9tQ3NzU2VsZWN0b3IoZWxlbWVudCwgY3NzU2VsZWN0b3IpO1xuXG4gICAgICAgICAgICBjYXNlICdvYmplY3QnOlxuICAgICAgICAgICAgICAgIGxldCBvYmplY3QgPSA8T2JqZWN0PmVsZW1lbnRNYXRjaGVyO1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmNvbGxlY3RNYXRjaGluZ0VsZW1lbnRzRnJvbU9iamVjdChlbGVtZW50LCBvYmplY3QpO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgY2FzZSAnZnVuY3Rpb24nOlxuICAgICAgICAgICAgICAgIGxldCBlbGVtZW50VmlzdG9yID0gPEVsZW1lbnRWaXN0b3I+ZWxlbWVudE1hdGNoZXI7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuY29sbGVjdE1hdGNoaW5nRWxlbWVudHNGcm9tRWxlbWVudFZpc3RvcihlbGVtZW50LCBlbGVtZW50VmlzdG9yKTsgICAgICAgXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGlzTWF0Y2hpbmdFbGVtZW50RnJvbUNzc1NlbGVjdG9yKGVsZW1lbnQ6IEVsZW1lbnQsIGNzc1NlbGVjdG9yOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICAgICAgaWYodHlwZW9mKGVsZW1lbnQubWF0Y2hlcykgPT09ICdmdW5jdGlvbicpIHsgLy8gdGFrZSBhIHNob3J0Y3V0IGluIG1vZGVybiBicm93c2Vyc1xuICAgICAgICAgICAgcmV0dXJuIGVsZW1lbnQubWF0Y2hlcyhjc3NTZWxlY3Rvcik7XG4gICAgICAgIH1lbHNle1xuICAgICAgICAgICAgcmV0dXJuIGlzTWVtYmVyT2ZBcnJheUxpa2UoZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbChjc3NTZWxlY3RvciksIGVsZW1lbnQpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBpc01hdGNoaW5nRWxlbWVudEZyb21PYmplY3QoZWxlbWVudDogRWxlbWVudCwgb2JqZWN0OiBPYmplY3QpOiBib29sZWFuIHtcbiAgICAgICAgaWYob2JqZWN0ID09PSBudWxsKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1lbHNle1xuICAgICAgICAgICAgaWYoaXNBcnJheUxpa2Uob2JqZWN0KSkge1xuICAgICAgICAgICAgICAgIGxldCBhcnJheUxpa2UgPSA8QXJyYXlMaWtlPGFueT4+b2JqZWN0O1xuXG4gICAgICAgICAgICAgICAgaWYoYXJyYXlMaWtlLmxlbmd0aCA9PT0gMCB8fCBhcnJheUxpa2VbMF0gaW5zdGFuY2VvZiBFbGVtZW50KSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBpc01lbWJlck9mQXJyYXlMaWtlKGFycmF5TGlrZSwgZWxlbWVudCk7ICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIH1lbHNle1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKEVsZW1lbnRDb2xsZWN0b3IuRUxFTUVOVF9NQVRDSEVSX1RZUEVfRVJST1JfTUVTU0FHRSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihFbGVtZW50Q29sbGVjdG9yLkVMRU1FTlRfTUFUQ0hFUl9UWVBFX0VSUk9SX01FU1NBR0UpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBpc01hdGNoaW5nRWxlbWVudEZyb21FbGVtZW50VmlzdG9yKGVsZW1lbnQ6IEVsZW1lbnQsIGVsZW1lbnRWaXN0b3I6IEVsZW1lbnRWaXN0b3IpOiBib29sZWFuIHtcbiAgICAgICAgbGV0IHZpc2l0b3JSZXN1bHQgPSBlbGVtZW50VmlzdG9yKGVsZW1lbnQpO1xuXG4gICAgICAgIGlmKHR5cGVvZih2aXNpdG9yUmVzdWx0KSA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgICAgICBsZXQgaXNNYXRjaCA9IDxib29sZWFuPnZpc2l0b3JSZXN1bHQ7XG4gICAgICAgICAgICByZXR1cm4gaXNNYXRjaDtcbiAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICBsZXQgZWxlbWVudE1hdGNoZXIgPSA8RWxlbWVudE1hdGNoZXI+dmlzaXRvclJlc3VsdDtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmlzTWF0Y2hpbmdFbGVtZW50KGVsZW1lbnQsIGVsZW1lbnRNYXRjaGVyKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgY29sbGVjdE1hdGNoaW5nRWxlbWVudHNGcm9tQ3NzU2VsZWN0b3IoZWxlbWVudDogRWxlbWVudCwgY3NzU2VsZWN0b3I6IHN0cmluZyk6IEVsZW1lbnRbXSB7XG4gICAgICAgIHJldHVybiB0b0FycmF5PEVsZW1lbnQ+KGVsZW1lbnQucXVlcnlTZWxlY3RvckFsbChjc3NTZWxlY3RvcikpO1xuICAgIH1cblxuICAgIHByaXZhdGUgY29sbGVjdE1hdGNoaW5nRWxlbWVudHNGcm9tT2JqZWN0KGVsZW1lbnQ6IEVsZW1lbnQsIG9iamVjdDogT2JqZWN0KTogRWxlbWVudFtdIHtcbiAgICAgICAgaWYob2JqZWN0ID09PSBudWxsKSB7XG4gICAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgIH1lbHNle1xuICAgICAgICAgICAgaWYoaXNBcnJheUxpa2Uob2JqZWN0KSkge1xuICAgICAgICAgICAgICAgIGxldCBhcnJheUxpa2UgPSA8QXJyYXlMaWtlPGFueT4+b2JqZWN0O1xuXG4gICAgICAgICAgICAgICAgaWYoYXJyYXlMaWtlLmxlbmd0aCA9PT0gMCB8fCBhcnJheUxpa2VbMF0gaW5zdGFuY2VvZiBFbGVtZW50KSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0b0FycmF5PEVsZW1lbnQ+KGFycmF5TGlrZSk7ICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIH1lbHNle1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKEVsZW1lbnRDb2xsZWN0b3IuRUxFTUVOVF9NQVRDSEVSX1RZUEVfRVJST1JfTUVTU0FHRSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihFbGVtZW50Q29sbGVjdG9yLkVMRU1FTlRfTUFUQ0hFUl9UWVBFX0VSUk9SX01FU1NBR0UpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBjb2xsZWN0TWF0Y2hpbmdFbGVtZW50c0Zyb21FbGVtZW50VmlzdG9yKGVsZW1lbnQ6IEVsZW1lbnQsIGVsZW1lbnRWaXN0b3I6IEVsZW1lbnRWaXN0b3IpOiBFbGVtZW50W10ge1xuICAgICAgICBsZXQgZWxlbWVudHM6IEVsZW1lbnRbXSA9IFtdO1xuXG4gICAgICAgIC8vIEknbSBmaWJiaW5nIHRvIHRoZSBjb21waWxlciBoZXJlLiBgZWxlbWVudC5jaGlsZHJlbmAgaXMgYSBgTm9kZUxpc3RPZjxFbGVtZW50PmAsXG4gICAgICAgIC8vIHdoaWNoIGRvZXMgbm90IGhhdmUgYSBjb21wYXRhYmxlIGludGVyZmFjZSB3aXRoIGBBcnJheTxFbGVtZW50PmA7IGhvd2V2ZXIsIHRoZVxuICAgICAgICAvLyBnZW5lcmF0ZWQgY29kZSBzdGlsbCB3b3JrcyBiZWNhdXNlIGl0IGRvZXNuJ3QgYWN0dWFsbHkgdXNlIHZlcnkgbXVjaCBvZiB0aGUgXG4gICAgICAgIC8vIGBBcnJheWAgaW50ZXJhY2UgKGl0IHJlYWxseSBvbmx5IGFzc3VtZXMgYSBudW1iZXJpYyBsZW5ndGggcHJvcGVydHkgYW5kIGtleXMgZm9yXG4gICAgICAgIC8vIDAuLi5sZW5ndGgpLiBDYXN0aW5nIHRvIGBhbnlgIGhlcmUgZGVzdHJveXMgdGhhdCB0eXBlIGluZm9ybWF0aW9uLCBzbyB0aGUgXG4gICAgICAgIC8vIGNvbXBpbGVyIGNhbid0IHRlbGwgdGhlcmUgaXMgYW4gaXNzdWUgYW5kIGFsbG93cyBpdCB3aXRob3V0IGFuIGVycm9yLlxuICAgICAgICBmb3IobGV0IGNoaWxkIG9mIDxhbnk+ZWxlbWVudC5jaGlsZHJlbikge1xuICAgICAgICAgICAgaWYoY2hpbGQgaW5zdGFuY2VvZiBFbGVtZW50KSB7XG4gICAgICAgICAgICAgICAgbGV0IGVsZW1lbnQ6IEVsZW1lbnQgPSBjaGlsZDtcbiAgICAgICAgICAgICAgICBsZXQgdmlzaXRvclJlc3VsdCA9IGVsZW1lbnRWaXN0b3IoZWxlbWVudCk7XG5cbiAgICAgICAgICAgICAgICBpZih0eXBlb2YodmlzaXRvclJlc3VsdCkgPT09ICdib29sZWFuJykge1xuICAgICAgICAgICAgICAgICAgICBsZXQgaXNNYXRjaCA9IDxib29sZWFuPnZpc2l0b3JSZXN1bHQ7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYoaXNNYXRjaCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZWxlbWVudHMucHVzaChlbGVtZW50KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1lbHNle1xuICAgICAgICAgICAgICAgICAgICBlbGVtZW50cy5wdXNoKC4uLnRoaXMuY29sbGVjdE1hdGNoaW5nRWxlbWVudHMoZWxlbWVudCwgdmlzaXRvclJlc3VsdCkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBlbGVtZW50cztcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGlzQXJyYXlMaWtlKHZhbHVlOiBhbnkpIHtcbiAgICByZXR1cm4gdHlwZW9mKHZhbHVlKSA9PT0gJ29iamVjdCcgJiYgdHlwZW9mKHZhbHVlLmxlbmd0aCkgPT09ICdudW1iZXInO1xufVxuXG5mdW5jdGlvbiB0b0FycmF5PFQ+KGFycmF5TGlrZTogQXJyYXlMaWtlPFQ+KTogQXJyYXk8VD4ge1xuICAgIGlmKGlzQXJyYXlMaWtlKGFycmF5TGlrZSkpIHtcbiAgICAgICAgcmV0dXJuIEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFycmF5TGlrZSwgMCk7XG4gICAgfWVsc2V7XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0V4cGVjdGVkIEFycmF5TGlrZScpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gaXNNZW1iZXJPZkFycmF5TGlrZShoYXlzdGFjazogQXJyYXlMaWtlPGFueT4sICBuZWVkbGU6IGFueSkge1xuICAgIHJldHVybiBBcnJheS5wcm90b3R5cGUuaW5kZXhPZi5jYWxsKGhheXN0YWNrLCBuZWVkbGUpICE9PSAtMTtcbn1cbiIsImltcG9ydCB7IFN1YnNjcmlwdGlvbiwgU3Vic2NyaXB0aW9uRXhlY3V0b3IgfSBmcm9tICcuL3N1YnNjcmlwdGlvbnMvc3Vic2NyaXB0aW9uJztcbmltcG9ydCB7IFRyaXZpYWxTdWJzY3JpcHRpb24gfSBmcm9tICcuL3N1YnNjcmlwdGlvbnMvdHJpdmlhbF9zdWJzY3JpcHRpb24nO1xuaW1wb3J0IHsgTWF0Y2hpbmdFbGVtZW50c1N1YnNjcmlwdGlvbiwgTWF0Y2hpbmdFbGVtZW50c0NoYW5nZWRFdmVudCB9IGZyb20gJy4vc3Vic2NyaXB0aW9ucy9tYXRjaGluZ19lbGVtZW50c19zdWJzY3JpcHRpb24nO1xuaW1wb3J0IHsgRWxlbWVudE1hdGNoZXNTdWJzY3JpcHRpb24sIEVsZW1lbnRNYXRjaGVzQ2hhbmdlZEV2ZW50LCBFbGVtZW50TWF0Y2hlciB9IGZyb20gJy4vc3Vic2NyaXB0aW9ucy9lbGVtZW50X21hdGNoZXNfc3Vic2NyaXB0aW9uJztcbmltcG9ydCB7IEV2ZW50U3Vic2NyaXB0aW9uLCBFdmVudE1hdGNoZXIgfSBmcm9tICcuL3N1YnNjcmlwdGlvbnMvZXZlbnRfc3Vic2NyaXB0aW9uJztcblxuZXhwb3J0IGNsYXNzIFNjb3BlIHtcbiAgICBzdGF0aWMgYnVpbGRSb290U2NvcGUoZWxlbWVudDogRWxlbWVudCk6IFNjb3BlIHtcbiAgICAgICAgbGV0IHNjb3BlID0gbmV3IFNjb3BlKG51bGwsICc8PHJvb3Q+PicsIGVsZW1lbnQsIG51bGwpO1xuXG4gICAgICAgIHNjb3BlLmFjdGl2YXRlKCk7XG5cbiAgICAgICAgcmV0dXJuIHNjb3BlO1xuICAgIH1cblxuICAgIHByaXZhdGUgcmVhZG9ubHkgcGFyZW50U2NvcGU6IFNjb3BlO1xuICAgIHByaXZhdGUgcmVhZG9ubHkgY2hpbGRTY29wZXM6IFNjb3BlW10gPSBbXTsgICAgXG4gICAgcHJpdmF0ZSByZWFkb25seSBlbGVtZW50OiBFbGVtZW50O1xuICAgIHByaXZhdGUgcmVhZG9ubHkgbmFtZTogc3RyaW5nO1xuXG4gICAgcHJpdmF0ZSBpc0FjdGl2YXRlZDogYm9vbGVhbiA9IGZhbHNlO1xuICAgIHByaXZhdGUgc3Vic2NyaXB0aW9uczogU3Vic2NyaXB0aW9uW10gPSBbXTtcblxuICAgIGNvbnN0cnVjdG9yKHBhcmVudFNjb3BlOiBTY29wZSwgbmFtZTogc3RyaW5nLCBlbGVtZW50OiBFbGVtZW50LCBleGVjdXRvcj86IFNjb3BlRXhlY3V0b3IpIHtcbiAgICAgICAgdGhpcy5wYXJlbnRTY29wZSA9IHBhcmVudFNjb3BlO1xuICAgICAgICB0aGlzLm5hbWUgPSBuYW1lO1xuICAgICAgICB0aGlzLmVsZW1lbnQgPSBlbGVtZW50O1xuXG4gICAgICAgIGlmKGV4ZWN1dG9yKSB7XG4gICAgICAgICAgICBleGVjdXRvci5jYWxsKHRoaXMsIHRoaXMsIHRoaXMuZWxlbWVudCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBnZXRQYXJlbnRTY29wZSgpOiBTY29wZSB7XG4gICAgICAgIHJldHVybiB0aGlzLnBhcmVudFNjb3BlO1xuICAgIH1cblxuICAgIGdldENoaWxkU2NvcGVzKCk6IFNjb3BlW10ge1xuICAgICAgICByZXR1cm4gdGhpcy5jaGlsZFNjb3BlcztcbiAgICB9XG5cbiAgICBjb2xsZWN0RGVzY2VuZGFudFNjb3BlcygpOiBTY29wZVtdIHtcbiAgICAgICAgbGV0IHNjb3BlczogU2NvcGVbXSA9IFtdO1xuXG4gICAgICAgIGZvcihsZXQgc2NvcGUgb2YgdGhpcy5jaGlsZFNjb3Blcykge1xuICAgICAgICAgICAgc2NvcGVzLnB1c2goc2NvcGUsIC4uLnNjb3BlLmNvbGxlY3REZXNjZW5kYW50U2NvcGVzKCkpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHNjb3BlcztcbiAgICB9XG5cbiAgICBkcmF3VHJlZSgpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gdGhpcy5kcmF3VHJlZUxpbmVzKCkuam9pbignXFxuJyk7XG4gICAgfVxuXG4gICAgZHJhd1RyZWVMaW5lcygpOiBzdHJpbmdbXSB7XG4gICAgICAgIGxldCBsaW5lczogc3RyaW5nW10gPSBbXTtcblxuICAgICAgICBsZXQgc2VsZiA9IHRoaXMubmFtZSArICcgICgnICsgdGhpcy5zdWJzY3JpcHRpb25zLmxlbmd0aCArICcpJztcblxuICAgICAgICBpZih0aGlzLmNoaWxkU2NvcGVzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGxpbmVzLnB1c2goc2VsZiArICcgeycpO1xuXG4gICAgICAgICAgICBmb3IobGV0IHNjb3BlIG9mIHRoaXMuY2hpbGRTY29wZXMpIHtcbiAgICAgICAgICAgICAgICBmb3IobGV0IGxpbmUgb2Ygc2NvcGUuZHJhd1RyZWVMaW5lcygpKSB7XG4gICAgICAgICAgICAgICAgICAgIGxpbmVzLnB1c2goJ1xcdCcgKyBsaW5lKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGxpbmVzLnB1c2goJ30nKTtcbiAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICBsaW5lcy5wdXNoKHNlbGYpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGxpbmVzO1xuICAgIH1cblxuICAgIGdldEVsZW1lbnQoKTogRWxlbWVudCB7XG4gICAgICAgIHJldHVybiB0aGlzLmVsZW1lbnQ7XG4gICAgfVxuXG4gICAgbWF0Y2goZXhlY3V0b3I6IFN1YnNjcmlwdGlvbkV4ZWN1dG9yKTogU2NvcGUge1xuICAgICAgICB0aGlzLmFkZFN1YnNjcmlwdGlvbihuZXcgVHJpdmlhbFN1YnNjcmlwdGlvbih0aGlzLmVsZW1lbnQsIHsgY29ubmVjdGVkOiB0cnVlIH0sIGV4ZWN1dG9yKSk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgdW5tYXRjaChleGVjdXRvcjogU3Vic2NyaXB0aW9uRXhlY3V0b3IpOiBTY29wZSB7XG4gICAgICAgIHRoaXMuYWRkU3Vic2NyaXB0aW9uKG5ldyBUcml2aWFsU3Vic2NyaXB0aW9uKHRoaXMuZWxlbWVudCwgeyBkaXNjb25uZWN0ZWQ6IHRydWUgfSwgZXhlY3V0b3IpKTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBzZWxlY3QobWF0Y2hlcjogRWxlbWVudE1hdGNoZXIsIGV4ZWN1dG9yOiBTY29wZUV4ZWN1dG9yKTogU2NvcGUge1xuICAgICAgICB0aGlzLmFkZFN1YnNjcmlwdGlvbihuZXcgTWF0Y2hpbmdFbGVtZW50c1N1YnNjcmlwdGlvbih0aGlzLmVsZW1lbnQsIG1hdGNoZXIsIHRoaXMuYnVpbGRTZWxlY3RFeGVjdXRvcihTdHJpbmcobWF0Y2hlciksIGV4ZWN1dG9yKSkpO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHdoZW4obWF0Y2hlcjogRWxlbWVudE1hdGNoZXIsIGV4ZWN1dG9yOiBTY29wZUV4ZWN1dG9yKTogU2NvcGUge1xuXHRcdHRoaXMuYWRkU3Vic2NyaXB0aW9uKG5ldyBFbGVtZW50TWF0Y2hlc1N1YnNjcmlwdGlvbih0aGlzLmVsZW1lbnQsIG1hdGNoZXIsIHRoaXMuYnVpbGRXaGVuRXhlY3V0b3IoU3RyaW5nKG1hdGNoZXIpLCBleGVjdXRvcikpKTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBvbihldmVudE1hdGNoZXI6IEV2ZW50TWF0Y2hlciwgZXhlY3V0b3I6IFN1YnNjcmlwdGlvbkV4ZWN1dG9yKTogU2NvcGU7XG4gICAgb24oZXZlbnRNYXRjaGVyOiBFdmVudE1hdGNoZXIsIGVsZW1lbnRNYXRjaGVyOiBFbGVtZW50TWF0Y2hlciwgZXhlY3V0b3I6IFN1YnNjcmlwdGlvbkV4ZWN1dG9yKTogU2NvcGU7XG4gICAgb24oZXZlbnRNYXRjaGVyOiBFdmVudE1hdGNoZXIsIGV4ZWN1dG9yT3JFbGVtZW50TWF0Y2hlcjogU3Vic2NyaXB0aW9uRXhlY3V0b3IgfCBFbGVtZW50TWF0Y2hlciwgbWF5YmVFeGVjdXRvcj86IFN1YnNjcmlwdGlvbkV4ZWN1dG9yKTogU2NvcGUge1xuICAgICAgICBsZXQgYXJndW1lbnRzQ291bnQgPSBhcmd1bWVudHMubGVuZ3RoO1xuXG4gICAgICAgIHN3aXRjaChhcmd1bWVudHNDb3VudCkge1xuICAgICAgICAgICAgY2FzZSAyOlxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLm9uV2l0aFR3b0FyZ3VtZW50cyhldmVudE1hdGNoZXIsIDxTdWJzY3JpcHRpb25FeGVjdXRvcj5leGVjdXRvck9yRWxlbWVudE1hdGNoZXIpO1xuICAgICAgICAgICAgY2FzZSAzOlxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLm9uV2l0aFRocmVlQXJndW1lbnRzKGV2ZW50TWF0Y2hlciwgPEVsZW1lbnRNYXRjaGVyPmV4ZWN1dG9yT3JFbGVtZW50TWF0Y2hlciwgPFN1YnNjcmlwdGlvbkV4ZWN1dG9yPm1heWJlRXhlY3V0b3IpO1xuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwiRmFpbGVkIHRvIGV4ZWN1dGUgJ29uJyBvbiAnU2NvcGUnOiAyIG9yIDMgYXJndW1lbnRzIHJlcXVpcmVkLCBidXQgXCIgKyBhcmd1bWVudHNDb3VudCArIFwiIHByZXNlbnQuXCIpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBvbldpdGhUd29Bcmd1bWVudHMoZXZlbnRNYXRjaGVyOiBFdmVudE1hdGNoZXIsIGV4ZWN1dG9yOiBTdWJzY3JpcHRpb25FeGVjdXRvcik6IFNjb3BlIHtcbiAgICAgICAgdGhpcy5hZGRTdWJzY3JpcHRpb24obmV3IEV2ZW50U3Vic2NyaXB0aW9uKHRoaXMuZWxlbWVudCwgZXZlbnRNYXRjaGVyLCBleGVjdXRvcikpO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHByaXZhdGUgb25XaXRoVGhyZWVBcmd1bWVudHMoZXZlbnRNYXRjaGVyOiBFdmVudE1hdGNoZXIsIGVsZW1lbnRNYXRjaGVyOiBFbGVtZW50TWF0Y2hlciwgZXhlY3V0b3I6IFN1YnNjcmlwdGlvbkV4ZWN1dG9yKTogU2NvcGUge1xuICAgICAgICB0aGlzLnNlbGVjdChlbGVtZW50TWF0Y2hlciwgKHNjb3BlKSA9PiB7XG4gICAgICAgICAgICBzY29wZS5vbihldmVudE1hdGNoZXIsIGV4ZWN1dG9yKVxuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG4gICAgXG4gICAgLy8gVGhpcyBtZXRob2QgaXMgZm9yIHRlc3RpbmdcbiAgICBwcmlzdGluZSgpOiB2b2lkIHtcbiAgICAgICAgZm9yKGxldCBzdWJzY3JpcHRpb24gb2YgdGhpcy5zdWJzY3JpcHRpb25zKSB7XG4gICAgICAgICAgICBzdWJzY3JpcHRpb24uZGlzY29ubmVjdCgpO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICB0aGlzLnN1YnNjcmlwdGlvbnMuc3BsaWNlKDApO1xuICAgIH1cblxuICAgIHByb3RlY3RlZCBhY3RpdmF0ZSgpOiB2b2lkIHtcbiAgICAgICAgaWYoIXRoaXMuaXNBY3RpdmF0ZWQpIHtcbiAgICAgICAgICAgIHRoaXMuaXNBY3RpdmF0ZWQgPSB0cnVlO1xuXG4gICAgICAgICAgICBmb3IobGV0IHN1YnNjcmlwdGlvbiBvZiB0aGlzLnN1YnNjcmlwdGlvbnMpIHtcbiAgICAgICAgICAgICAgICBzdWJzY3JpcHRpb24uY29ubmVjdCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJvdGVjdGVkIGRlYWN0aXZhdGUoKTogdm9pZCB7XG4gICAgICAgIGlmKHRoaXMuaXNBY3RpdmF0ZWQpIHtcbiAgICAgICAgICAgIGZvcihsZXQgc3Vic2NyaXB0aW9uIG9mIHRoaXMuc3Vic2NyaXB0aW9ucykge1xuICAgICAgICAgICAgICAgIHN1YnNjcmlwdGlvbi5kaXNjb25uZWN0KCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuaXNBY3RpdmF0ZWQgPSBmYWxzZTsgICAgICAgICAgICBcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYWRkU3Vic2NyaXB0aW9uKHN1YnNjcmlwdGlvbjogU3Vic2NyaXB0aW9uKTogdm9pZCB7XG4gICAgICAgIHRoaXMuc3Vic2NyaXB0aW9ucy5wdXNoKHN1YnNjcmlwdGlvbik7XG5cbiAgICAgICAgaWYodGhpcy5pc0FjdGl2YXRlZCkge1xuICAgICAgICAgICAgc3Vic2NyaXB0aW9uLmNvbm5lY3QoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgcmVtb3ZlU3Vic2NyaXB0aW9uKHN1YnNjcmlwdGlvbjogU3Vic2NyaXB0aW9uKTogdm9pZCB7XG4gICAgICAgIHZhciBpbmRleCA9IHRoaXMuc3Vic2NyaXB0aW9ucy5pbmRleE9mKHN1YnNjcmlwdGlvbik7XG5cbiAgICAgICAgaWYoaW5kZXggPj0gMCkge1xuICAgICAgICAgICAgc3Vic2NyaXB0aW9uLmRpc2Nvbm5lY3QoKTtcblxuICAgICAgICAgICAgdGhpcy5zdWJzY3JpcHRpb25zLnNwbGljZShpbmRleCwgMSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGJ1aWxkU2VsZWN0RXhlY3V0b3IobmFtZTogc3RyaW5nLCBleGVjdXRvcjogU2NvcGVFeGVjdXRvcik6IFN1YnNjcmlwdGlvbkV4ZWN1dG9yIHtcbiAgICAgICAgbGV0IHNjb3BlczogU2NvcGVbXSA9IFtdO1xuXG4gICAgICAgIHJldHVybiAoZXZlbnQ6IE1hdGNoaW5nRWxlbWVudHNDaGFuZ2VkRXZlbnQsIGVsZW1lbnQ6IEVsZW1lbnQpID0+IHtcbiAgICAgICAgICAgIGZvcihsZXQgZWxlbWVudCBvZiBldmVudC5hZGRlZEVsZW1lbnRzKSB7XG4gICAgICAgICAgICAgICAgbGV0IHNjb3BlID0gdGhpcy5jcmVhdGVDaGlsZFNjb3BlKG5hbWUsIGVsZW1lbnQsIGV4ZWN1dG9yKTtcblxuICAgICAgICAgICAgICAgIHNjb3Blcy5wdXNoKHNjb3BlKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZm9yKGxldCBlbGVtZW50IG9mIGV2ZW50LnJlbW92ZWRFbGVtZW50cykge1xuICAgICAgICAgICAgICAgIGZvcihsZXQgaW5kZXggPSAwLCBsZW5ndGggPSBzY29wZXMubGVuZ3RoLCBzY29wZSA6IFNjb3BlOyBpbmRleCA8IGxlbmd0aDsgaW5kZXgrKykge1xuICAgICAgICAgICAgICAgICAgICBzY29wZSA9IHNjb3Blc1tpbmRleF07XG5cbiAgICAgICAgICAgICAgICAgICAgaWYoc2NvcGUuZWxlbWVudCA9PT0gZWxlbWVudCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5kZXN0cm95Q2hpbGRTY29wZShzY29wZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgICAgIHNjb3Blcy5zcGxpY2UoaW5kZXgsIDEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBidWlsZFdoZW5FeGVjdXRvcihuYW1lOiBzdHJpbmcsIGV4ZWN1dG9yOiBTY29wZUV4ZWN1dG9yKTogU3Vic2NyaXB0aW9uRXhlY3V0b3Ige1xuICAgICAgICBsZXQgc2NvcGUgOiBTY29wZSA9IG51bGw7XG5cbiAgICAgICAgcmV0dXJuIChldmVudDogRWxlbWVudE1hdGNoZXNDaGFuZ2VkRXZlbnQsIGVsZW1lbnQ6IEVsZW1lbnQpID0+IHtcbiAgICAgICAgICAgIGlmKGV2ZW50LmlzTWF0Y2hpbmcpIHtcbiAgICAgICAgICAgICAgICBzY29wZSA9IHRoaXMuY3JlYXRlQ2hpbGRTY29wZSgnJicgKyBuYW1lLCB0aGlzLmVsZW1lbnQsIGV4ZWN1dG9yKTtcbiAgICAgICAgICAgIH1lbHNle1xuICAgICAgICAgICAgICAgIHRoaXMuZGVzdHJveUNoaWxkU2NvcGUoc2NvcGUpO1xuICAgICAgICAgICAgICAgIHNjb3BlID0gbnVsbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGNyZWF0ZUNoaWxkU2NvcGUobmFtZTogc3RyaW5nLCBlbGVtZW50OiBFbGVtZW50LCBleGVjdXRvcj86IFNjb3BlRXhlY3V0b3IpOiBTY29wZSB7XG4gICAgICAgIGxldCBzY29wZSA9IG5ldyBTY29wZSh0aGlzLCBuYW1lLCBlbGVtZW50LCBleGVjdXRvcik7XG4gICAgICAgIHRoaXMuY2hpbGRTY29wZXMucHVzaChzY29wZSk7XG5cbiAgICAgICAgc2NvcGUuYWN0aXZhdGUoKTtcblxuICAgICAgICByZXR1cm4gc2NvcGU7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBkZXN0cm95Q2hpbGRTY29wZShzY29wZTogU2NvcGUpIHtcbiAgICAgICAgbGV0IGluZGV4ID0gdGhpcy5jaGlsZFNjb3Blcy5pbmRleE9mKHNjb3BlKTtcblxuICAgICAgICBzY29wZS5kZWFjdGl2YXRlKCk7XG5cbiAgICAgICAgaWYoaW5kZXggPj0gMCkge1xuICAgICAgICAgICAgdGhpcy5jaGlsZFNjb3Blcy5zcGxpY2UoaW5kZXgsIDEpO1xuICAgICAgICB9XG4gICAgfVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNjb3BlRXhlY3V0b3IgeyAoc2NvcGU6IFNjb3BlLCBlbGVtZW50OiBFbGVtZW50KTogdm9pZCB9O1xuZXhwb3J0IHsgRWxlbWVudE1hdGNoZXIsIEV2ZW50TWF0Y2hlciwgU3Vic2NyaXB0aW9uRXhlY3V0b3IgfTtcbiIsImltcG9ydCB7IFN1YnNjcmlwdGlvbiwgU3Vic2NyaXB0aW9uRXhlY3V0b3IsIFN1YnNjcmlwdGlvbkV2ZW50IH0gZnJvbSAnLi9zdWJzY3JpcHRpb24nO1xuXG5pbnRlcmZhY2UgQ29tbW9uSnNSZXF1aXJlIHtcbiAgICAoaWQ6IHN0cmluZyk6IGFueTtcbn1cblxuZGVjbGFyZSB2YXIgcmVxdWlyZTogQ29tbW9uSnNSZXF1aXJlO1xubGV0IE11dGF0aW9uT2JzZXJ2ZXIgPSByZXF1aXJlKCdtdXRhdGlvbi1vYnNlcnZlcicpOyAvLyB1c2UgcG9seWZpbGxcblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEJhdGNoZWRNdXRhdGlvblN1YnNjcmlwdGlvbiBleHRlbmRzIFN1YnNjcmlwdGlvbiB7XG4gICAgc3RhdGljIHJlYWRvbmx5IG11dGF0aW9uT2JzZXJ2ZXJJbml0OiBNdXRhdGlvbk9ic2VydmVySW5pdCA9IHtcbiAgICAgICAgY2hpbGRMaXN0OiB0cnVlLFxuICAgICAgICBhdHRyaWJ1dGVzOiB0cnVlLFxuICAgICAgICBjaGFyYWN0ZXJEYXRhOiB0cnVlLFxuICAgICAgICBzdWJ0cmVlOiB0cnVlXG4gICAgfTtcblxuICAgIHByaXZhdGUgaXNMaXN0ZW5pbmcgOiBib29sZWFuID0gZmFsc2U7XG4gICAgcHJpdmF0ZSBoYW5kbGVNdXRhdGlvblRpbWVvdXQgOiBhbnkgPSBudWxsO1xuXG4gICAgcHJpdmF0ZSByZWFkb25seSBtdXRhdGlvbkNhbGxiYWNrOiBNdXRhdGlvbkNhbGxiYWNrO1xuICAgIHByaXZhdGUgcmVhZG9ubHkgbXV0YXRpb25PYnNlcnZlcjogTXV0YXRpb25PYnNlcnZlcjtcblxuICAgIGNvbnN0cnVjdG9yKGVsZW1lbnQ6IEVsZW1lbnQsIGV4ZWN1dG9yOiBTdWJzY3JpcHRpb25FeGVjdXRvcikge1xuICAgICAgICBzdXBlcihlbGVtZW50LCBleGVjdXRvcik7XG5cbiAgICAgICAgdGhpcy5tdXRhdGlvbkNhbGxiYWNrID0gKCk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgdGhpcy5kZWZlckhhbmRsZU11dGF0aW9ucygpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5tdXRhdGlvbk9ic2VydmVyID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIodGhpcy5tdXRhdGlvbkNhbGxiYWNrKTtcbiAgICB9XG5cbiAgICBwcm90ZWN0ZWQgc3RhcnRMaXN0ZW5pbmcoKTogdm9pZCB7XG4gICAgICAgIGlmKCF0aGlzLmlzTGlzdGVuaW5nKSB7XG4gICAgICAgICAgICB0aGlzLm11dGF0aW9uT2JzZXJ2ZXIub2JzZXJ2ZSh0aGlzLmVsZW1lbnQsIEJhdGNoZWRNdXRhdGlvblN1YnNjcmlwdGlvbi5tdXRhdGlvbk9ic2VydmVySW5pdCk7XG5cbiAgICAgICAgICAgIHRoaXMuaXNMaXN0ZW5pbmcgPSB0cnVlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJvdGVjdGVkIHN0b3BMaXN0ZW5pbmcoKTogdm9pZCB7XG4gICAgICAgIGlmKHRoaXMuaXNMaXN0ZW5pbmcpIHtcbiAgICAgICAgICAgIHRoaXMubXV0YXRpb25PYnNlcnZlci5kaXNjb25uZWN0KCk7XG4gICAgICAgICAgICB0aGlzLmhhbmRsZU11dGF0aW9uc05vdygpO1xuXG4gICAgICAgICAgICB0aGlzLmlzTGlzdGVuaW5nID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgcHJvdGVjdGVkIGFic3RyYWN0IGhhbmRsZU11dGF0aW9ucygpOiB2b2lkO1xuXG4gICAgcHJpdmF0ZSBkZWZlckhhbmRsZU11dGF0aW9ucygpOiB2b2lkIHtcbiAgICAgICAgaWYodGhpcy5oYW5kbGVNdXRhdGlvblRpbWVvdXQgPT09IG51bGwpIHtcbiAgICAgICAgICAgIHRoaXMuaGFuZGxlTXV0YXRpb25UaW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB7IFxuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMubXV0YXRpb25PYnNlcnZlci50YWtlUmVjb3JkcygpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmhhbmRsZU11dGF0aW9ucygpO1xuICAgICAgICAgICAgICAgIH1maW5hbGx5e1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmhhbmRsZU11dGF0aW9uVGltZW91dCA9IG51bGw7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSwgMCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGhhbmRsZU11dGF0aW9uc05vdygpOiB2b2lkIHtcbiAgICAgICAgaWYodGhpcy5oYW5kbGVNdXRhdGlvblRpbWVvdXQgIT09IG51bGwpIHtcbiAgICAgICAgICAgIGNsZWFyVGltZW91dCh0aGlzLmhhbmRsZU11dGF0aW9uVGltZW91dCk7XG4gICAgICAgICAgICB0aGlzLmhhbmRsZU11dGF0aW9uVGltZW91dCA9IG51bGw7XG5cbiAgICAgICAgICAgIHRoaXMuaGFuZGxlTXV0YXRpb25zKCk7ICAgICAgICAgICAgXG4gICAgICAgIH1cbiAgICB9XG59XG5cbmV4cG9ydCB7IFN1YnNjcmlwdGlvbiwgU3Vic2NyaXB0aW9uRXhlY3V0b3IsIFN1YnNjcmlwdGlvbkV2ZW50IH07IiwiaW1wb3J0IHsgQmF0Y2hlZE11dGF0aW9uU3Vic2NyaXB0aW9uLCBTdWJzY3JpcHRpb25FeGVjdXRvciwgU3Vic2NyaXB0aW9uRXZlbnQgfSBmcm9tICcuL2JhdGNoZWRfbXV0YXRpb25fc3Vic2NyaXB0aW9uJztcbmltcG9ydCB7IEVsZW1lbnRNYXRjaGVyLCBFbGVtZW50Q29sbGVjdG9yIH0gZnJvbSAnLi4vZWxlbWVudF9jb2xsZWN0b3InO1xuXG5leHBvcnQgY2xhc3MgRWxlbWVudE1hdGNoZXNTdWJzY3JpcHRpb24gZXh0ZW5kcyBCYXRjaGVkTXV0YXRpb25TdWJzY3JpcHRpb24ge1xuICAgIHJlYWRvbmx5IG1hdGNoZXI6IEVsZW1lbnRNYXRjaGVyO1xuXG4gICAgcHJpdmF0ZSBpc0Nvbm5lY3RlZDogYm9vbGVhbiA9IGZhbHNlO1xuICAgIHByaXZhdGUgaXNNYXRjaGluZ0VsZW1lbnQ6IGJvb2xlYW4gPSBmYWxzZTtcblxuICAgIGNvbnN0cnVjdG9yKGVsZW1lbnQ6IEVsZW1lbnQsIG1hdGNoZXI6IEVsZW1lbnRNYXRjaGVyLCBleGVjdXRvcjogU3Vic2NyaXB0aW9uRXhlY3V0b3IpIHtcbiAgICAgICAgc3VwZXIoZWxlbWVudCwgZXhlY3V0b3IpO1xuXG4gICAgICAgIHRoaXMubWF0Y2hlciA9IG1hdGNoZXI7XG4gICAgfVxuXG4gICAgY29ubmVjdCgpOiB2b2lkIHtcbiAgICAgICAgaWYoIXRoaXMuaXNDb25uZWN0ZWQpIHtcbiAgICAgICAgICAgIHRoaXMudXBkYXRlSXNNYXRjaGluZ0VsZW1lbnQodGhpcy5jb21wdXRlSXNNYXRjaGluZ0VsZW1lbnQoKSk7XG4gICAgICAgICAgICB0aGlzLnN0YXJ0TGlzdGVuaW5nKCk7XG5cbiAgICAgICAgICAgIHRoaXMuaXNDb25uZWN0ZWQgPSB0cnVlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZGlzY29ubmVjdCgpOiB2b2lkIHtcbiAgICAgICAgaWYodGhpcy5pc0Nvbm5lY3RlZCkge1xuICAgICAgICAgICAgdGhpcy51cGRhdGVJc01hdGNoaW5nRWxlbWVudChmYWxzZSk7XG4gICAgICAgICAgICB0aGlzLnN0b3BMaXN0ZW5pbmcoKTtcblxuICAgICAgICAgICAgdGhpcy5pc0Nvbm5lY3RlZCA9IGZhbHNlO1xuICAgICAgICB9ICAgICAgICBcbiAgICB9XG5cbiAgICBwcm90ZWN0ZWQgaGFuZGxlTXV0YXRpb25zKCk6IHZvaWQge1xuICAgICAgICB0aGlzLnVwZGF0ZUlzTWF0Y2hpbmdFbGVtZW50KHRoaXMuY29tcHV0ZUlzTWF0Y2hpbmdFbGVtZW50KCkpO1xuICAgIH1cblxuICAgIHByaXZhdGUgdXBkYXRlSXNNYXRjaGluZ0VsZW1lbnQoaXNNYXRjaGluZ0VsZW1lbnQ6IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgbGV0IHdhc01hdGNoaW5nRWxlbWVudCA9IHRoaXMuaXNNYXRjaGluZ0VsZW1lbnQ7XG4gICAgICAgIHRoaXMuaXNNYXRjaGluZ0VsZW1lbnQgPSBpc01hdGNoaW5nRWxlbWVudDtcblxuICAgICAgICBpZih3YXNNYXRjaGluZ0VsZW1lbnQgIT09IGlzTWF0Y2hpbmdFbGVtZW50KSB7XG4gICAgICAgICAgICBsZXQgZXZlbnQgPSBuZXcgRWxlbWVudE1hdGNoZXNDaGFuZ2VkRXZlbnQodGhpcywgaXNNYXRjaGluZ0VsZW1lbnQpO1xuXG4gICAgICAgICAgICB0aGlzLmV4ZWN1dG9yKGV2ZW50LCB0aGlzLmVsZW1lbnQpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBjb21wdXRlSXNNYXRjaGluZ0VsZW1lbnQoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiBFbGVtZW50Q29sbGVjdG9yLmlzTWF0Y2hpbmdFbGVtZW50KHRoaXMuZWxlbWVudCwgdGhpcy5tYXRjaGVyKTtcbiAgICB9XG59XG5cbmV4cG9ydCBjbGFzcyBFbGVtZW50TWF0Y2hlc0NoYW5nZWRFdmVudCBleHRlbmRzIFN1YnNjcmlwdGlvbkV2ZW50IHtcbiAgICByZWFkb25seSBpc01hdGNoaW5nOiBib29sZWFuO1xuXG4gICAgY29uc3RydWN0b3IoZWxlbWVudE1hdGNoZXNTdWJzY3JpcHRpb246IEVsZW1lbnRNYXRjaGVzU3Vic2NyaXB0aW9uLCBpc01hdGNoaW5nOiBib29sZWFuKSB7XG4gICAgICAgIHN1cGVyKGVsZW1lbnRNYXRjaGVzU3Vic2NyaXB0aW9uLCAnRWxlbWVudE1hdGNoZXNDaGFuZ2VkRXZlbnQnKTtcblxuICAgICAgICB0aGlzLmlzTWF0Y2hpbmcgPSBpc01hdGNoaW5nO1xuICAgIH1cbn1cblxuZXhwb3J0IHsgRWxlbWVudE1hdGNoZXIgfTtcbiIsImltcG9ydCB7IFN1YnNjcmlwdGlvbiwgU3Vic2NyaXB0aW9uRXhlY3V0b3IgfSBmcm9tICcuL3N1YnNjcmlwdGlvbic7XG5cbmV4cG9ydCBjbGFzcyBFdmVudFN1YnNjcmlwdGlvbiBleHRlbmRzIFN1YnNjcmlwdGlvbiB7XG4gICAgcmVhZG9ubHkgZXZlbnRNYXRjaGVyOiBFdmVudE1hdGNoZXI7XG5cbiAgICBwcml2YXRlIGlzQ29ubmVjdGVkIDogYm9vbGVhbiA9IGZhbHNlOyAgICBcbiAgICBwcml2YXRlIHJlYWRvbmx5IGV2ZW50TGlzdGVuZXI6IEV2ZW50TGlzdGVuZXI7XG4gICAgcHJpdmF0ZSByZWFkb25seSBldmVudE5hbWVzOiBzdHJpbmdbXTtcblxuICAgIGNvbnN0cnVjdG9yKGVsZW1lbnQ6IEVsZW1lbnQsIGV2ZW50TWF0Y2hlcjogRXZlbnRNYXRjaGVyLCBleGVjdXRvcjogU3Vic2NyaXB0aW9uRXhlY3V0b3IpIHtcbiAgICAgICAgc3VwZXIoZWxlbWVudCwgZXhlY3V0b3IpO1xuXG4gICAgICAgIHRoaXMuZXZlbnRNYXRjaGVyID0gZXZlbnRNYXRjaGVyO1xuICAgICAgICB0aGlzLmV2ZW50TmFtZXMgPSB0aGlzLnBhcnNlRXZlbnRNYXRjaGVyKHRoaXMuZXZlbnRNYXRjaGVyKTtcblxuICAgICAgICB0aGlzLmV2ZW50TGlzdGVuZXIgPSAoZXZlbnQ6IEV2ZW50KTogdm9pZCA9PiB7XG4gICAgICAgICAgICB0aGlzLmhhbmRsZUV2ZW50KGV2ZW50KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGNvbm5lY3QoKTogdm9pZCB7XG4gICAgICAgIGlmKCF0aGlzLmlzQ29ubmVjdGVkKSB7XG4gICAgICAgICAgICB0aGlzLmlzQ29ubmVjdGVkID0gdHJ1ZTtcblxuICAgICAgICAgICAgZm9yKGxldCBldmVudE5hbWUgb2YgdGhpcy5ldmVudE5hbWVzKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5lbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoZXZlbnROYW1lLCB0aGlzLmV2ZW50TGlzdGVuZXIsIGZhbHNlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGRpc2Nvbm5lY3QoKTogdm9pZCB7XG4gICAgICAgIGlmKHRoaXMuaXNDb25uZWN0ZWQpIHtcbiAgICAgICAgICAgIGZvcihsZXQgZXZlbnROYW1lIG9mIHRoaXMuZXZlbnROYW1lcykge1xuICAgICAgICAgICAgICAgIHRoaXMuZWxlbWVudC5yZW1vdmVFdmVudExpc3RlbmVyKGV2ZW50TmFtZSwgdGhpcy5ldmVudExpc3RlbmVyLCBmYWxzZSk7XG4gICAgICAgICAgICB9ICAgICAgICAgICAgXG5cbiAgICAgICAgICAgIHRoaXMuaXNDb25uZWN0ZWQgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgaGFuZGxlRXZlbnQoZXZlbnQ6IEV2ZW50KTogdm9pZCB7XG4gICAgICAgIHRoaXMuZXhlY3V0b3IoZXZlbnQsIHRoaXMuZWxlbWVudCk7ICAgICAgICAgXG4gICAgfVxuXG4gICAgcHJpdmF0ZSBwYXJzZUV2ZW50TWF0Y2hlcihldmVudE1hdGNoZXI6IEV2ZW50TWF0Y2hlcik6IHN0cmluZ1tdIHtcbiAgICAgICAgLy8gVE9ETzogU3VwcG9ydCBhbGwgb2YgdGhlIGpRdWVyeSBzdHlsZSBldmVudCBvcHRpb25zXG4gICAgICAgIHJldHVybiBldmVudE1hdGNoZXIuc3BsaXQoJyAnKTtcbiAgICB9IFxufVxuXG5leHBvcnQgZGVjbGFyZSB0eXBlIEV2ZW50TWF0Y2hlciA9IHN0cmluZztcbiIsImltcG9ydCB7IEJhdGNoZWRNdXRhdGlvblN1YnNjcmlwdGlvbiwgU3Vic2NyaXB0aW9uRXhlY3V0b3IsIFN1YnNjcmlwdGlvbkV2ZW50IH0gZnJvbSAnLi9iYXRjaGVkX211dGF0aW9uX3N1YnNjcmlwdGlvbic7XG5pbXBvcnQgeyBFbGVtZW50TWF0Y2hlciwgRWxlbWVudENvbGxlY3RvciB9IGZyb20gJy4uL2VsZW1lbnRfY29sbGVjdG9yJztcblxuZXhwb3J0IGNsYXNzIE1hdGNoaW5nRWxlbWVudHNTdWJzY3JpcHRpb24gZXh0ZW5kcyBCYXRjaGVkTXV0YXRpb25TdWJzY3JpcHRpb24ge1xuICAgIHJlYWRvbmx5IG1hdGNoZXI6IEVsZW1lbnRNYXRjaGVyO1xuXG4gICAgcHJpdmF0ZSBpc0Nvbm5lY3RlZDogYm9vbGVhbiA9IGZhbHNlO1xuICAgIHByaXZhdGUgbWF0Y2hpbmdFbGVtZW50czogRWxlbWVudFtdID0gW107XG5cbiAgICBjb25zdHJ1Y3RvcihlbGVtZW50OiBFbGVtZW50LCBtYXRjaGVyOiBFbGVtZW50TWF0Y2hlciwgZXhlY3V0b3I6IFN1YnNjcmlwdGlvbkV4ZWN1dG9yKSB7XG4gICAgICAgIHN1cGVyKGVsZW1lbnQsIGV4ZWN1dG9yKTtcblxuICAgICAgICB0aGlzLm1hdGNoZXIgPSBtYXRjaGVyO1xuICAgIH1cblxuICAgIGNvbm5lY3QoKTogdm9pZCB7XG4gICAgICAgIGlmKCF0aGlzLmlzQ29ubmVjdGVkKSB7XG4gICAgICAgICAgICB0aGlzLnVwZGF0ZU1hdGNoaW5nRWxlbWVudHModGhpcy5jb2xsZWN0TWF0Y2hpbmdFbGVtZW50cygpKTtcbiAgICAgICAgICAgIHRoaXMuc3RhcnRMaXN0ZW5pbmcoKTtcblxuICAgICAgICAgICAgdGhpcy5pc0Nvbm5lY3RlZCA9IHRydWU7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBkaXNjb25uZWN0KCk6IHZvaWQge1xuICAgICAgICBpZih0aGlzLmlzQ29ubmVjdGVkKSB7XG4gICAgICAgICAgICB0aGlzLnVwZGF0ZU1hdGNoaW5nRWxlbWVudHMoW10pO1xuICAgICAgICAgICAgdGhpcy5zdG9wTGlzdGVuaW5nKCk7XG5cbiAgICAgICAgICAgIHRoaXMuaXNDb25uZWN0ZWQgPSBmYWxzZTtcbiAgICAgICAgfSAgICAgICAgXG4gICAgfVxuXG4gICAgcHJvdGVjdGVkIGhhbmRsZU11dGF0aW9ucygpOiB2b2lkIHtcbiAgICAgICAgdGhpcy51cGRhdGVNYXRjaGluZ0VsZW1lbnRzKHRoaXMuY29sbGVjdE1hdGNoaW5nRWxlbWVudHMoKSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSB1cGRhdGVNYXRjaGluZ0VsZW1lbnRzKG1hdGNoaW5nRWxlbWVudHM6IEVsZW1lbnRbXSk6IHZvaWQge1xuICAgICAgICBsZXQgcHJldmlvdXNseU1hdGNoaW5nRWxlbWVudHMgPSB0aGlzLm1hdGNoaW5nRWxlbWVudHM7XG5cbiAgICAgICAgbGV0IGFkZGVkRWxlbWVudHMgPSBhcnJheVN1YnRyYWN0KG1hdGNoaW5nRWxlbWVudHMsIHByZXZpb3VzbHlNYXRjaGluZ0VsZW1lbnRzKTtcbiAgICAgICAgbGV0IHJlbW92ZWRFbGVtZW50cyA9IGFycmF5U3VidHJhY3QocHJldmlvdXNseU1hdGNoaW5nRWxlbWVudHMsIG1hdGNoaW5nRWxlbWVudHMpO1xuXG4gICAgICAgIHRoaXMubWF0Y2hpbmdFbGVtZW50cyA9IG1hdGNoaW5nRWxlbWVudHM7ICAgXG4gICAgICAgIFxuICAgICAgICBpZihhZGRlZEVsZW1lbnRzLmxlbmd0aCA+IDAgfHwgcmVtb3ZlZEVsZW1lbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGxldCBldmVudCA9IG5ldyBNYXRjaGluZ0VsZW1lbnRzQ2hhbmdlZEV2ZW50KHRoaXMsIGFkZGVkRWxlbWVudHMsIHJlbW92ZWRFbGVtZW50cyk7XG5cbiAgICAgICAgICAgIHRoaXMuZXhlY3V0b3IoZXZlbnQsIHRoaXMuZWxlbWVudCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGNvbGxlY3RNYXRjaGluZ0VsZW1lbnRzKCk6IEVsZW1lbnRbXSB7XG4gICAgICAgIHJldHVybiBFbGVtZW50Q29sbGVjdG9yLmNvbGxlY3RNYXRjaGluZ0VsZW1lbnRzKHRoaXMuZWxlbWVudCwgdGhpcy5tYXRjaGVyKTtcbiAgICB9XG59XG5cbmV4cG9ydCBjbGFzcyBNYXRjaGluZ0VsZW1lbnRzQ2hhbmdlZEV2ZW50IGV4dGVuZHMgU3Vic2NyaXB0aW9uRXZlbnQge1xuICAgIHJlYWRvbmx5IGFkZGVkRWxlbWVudHM6IEVsZW1lbnRbXTtcbiAgICByZWFkb25seSByZW1vdmVkRWxlbWVudHM6IEVsZW1lbnRbXTtcblxuICAgIGNvbnN0cnVjdG9yKG1hdGNoaW5nRWxlbWVudHNTdWJzY3JpcHRpb246IE1hdGNoaW5nRWxlbWVudHNTdWJzY3JpcHRpb24sIGFkZGVkRWxlbWVudHM6IEVsZW1lbnRbXSwgcmVtb3ZlZEVsZW1lbnRzOiBFbGVtZW50W10pIHtcbiAgICAgICAgc3VwZXIobWF0Y2hpbmdFbGVtZW50c1N1YnNjcmlwdGlvbiwgJ01hdGNoaW5nRWxlbWVudHNDaGFuZ2VkJyk7XG5cbiAgICAgICAgdGhpcy5hZGRlZEVsZW1lbnRzID0gYWRkZWRFbGVtZW50cztcbiAgICAgICAgdGhpcy5yZW1vdmVkRWxlbWVudHMgPSByZW1vdmVkRWxlbWVudHM7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBhcnJheVN1YnRyYWN0PFQ+KG1pbnVlbmQ6IFRbXSwgc3VidHJhaGVuZDogVFtdKTogVFtdIHtcbiAgICBsZXQgZGlmZmVyZW5jZTogVFtdID0gW107XG5cbiAgICBmb3IobGV0IG1lbWJlciBvZiBtaW51ZW5kKSB7XG4gICAgICAgIGlmKHN1YnRyYWhlbmQuaW5kZXhPZihtZW1iZXIpID09PSAtMSkge1xuICAgICAgICAgICAgZGlmZmVyZW5jZS5wdXNoKG1lbWJlcik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gZGlmZmVyZW5jZTtcbn0iLCJleHBvcnQgYWJzdHJhY3QgY2xhc3MgU3Vic2NyaXB0aW9uIHtcbiAgICBwcm90ZWN0ZWQgcmVhZG9ubHkgZXhlY3V0b3I6IFN1YnNjcmlwdGlvbkV4ZWN1dG9yO1xuICAgIHByb3RlY3RlZCByZWFkb25seSBlbGVtZW50OiBFbGVtZW50O1xuICAgIFxuICAgIGNvbnN0cnVjdG9yKGVsZW1lbnQ6IEVsZW1lbnQsIGV4ZWN1dG9yOiBTdWJzY3JpcHRpb25FeGVjdXRvcikge1xuICAgICAgICB0aGlzLmVsZW1lbnQgPSBlbGVtZW50O1xuICAgICAgICB0aGlzLmV4ZWN1dG9yID0gZXhlY3V0b3I7XG4gICAgfVxuXG4gICAgYWJzdHJhY3QgY29ubmVjdCgpIDogdm9pZDtcbiAgICBhYnN0cmFjdCBkaXNjb25uZWN0KCkgOiB2b2lkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN1YnNjcmlwdGlvbkV4ZWN1dG9yIHsgXG4gICAgKGV2ZW50OiBFdmVudCB8IFN1YnNjcmlwdGlvbkV2ZW50LCBlbGVtZW50OiBFbGVtZW50KTogdm9pZCBcbn1cblxuZXhwb3J0IGNsYXNzIFN1YnNjcmlwdGlvbkV2ZW50IHtcbiAgICByZWFkb25seSBzdWJzY3JpcHRpb246IFN1YnNjcmlwdGlvbjtcbiAgICByZWFkb25seSBuYW1lOiBzdHJpbmc7XG5cbiAgICBjb25zdHJ1Y3RvcihzdWJzY3JpcHRpb246IFN1YnNjcmlwdGlvbiwgbmFtZTogc3RyaW5nKSB7XG4gICAgICAgIHRoaXMuc3Vic2NyaXB0aW9uID0gc3Vic2NyaXB0aW9uO1xuICAgICAgICB0aGlzLm5hbWUgPSBuYW1lO1xuICAgIH1cbn1cbiIsImltcG9ydCB7IFN1YnNjcmlwdGlvbiwgU3Vic2NyaXB0aW9uRXhlY3V0b3IsIFN1YnNjcmlwdGlvbkV2ZW50IH0gZnJvbSAnLi9zdWJzY3JpcHRpb24nO1xuXG5leHBvcnQgaW50ZXJmYWNlIFRyaXZpYWxTdWJzY3JpcHRpb25Db25maWd1cmF0aW9uIHtcbiAgICBjb25uZWN0ZWQ/OiBib29sZWFuLFxuICAgIGRpc2Nvbm5lY3RlZD86IGJvb2xlYW5cbn1cblxuZXhwb3J0IGNsYXNzIEVsZW1lbnRDb25uZWN0aW9uQ2hhbmdlZEV2ZW50IGV4dGVuZHMgU3Vic2NyaXB0aW9uRXZlbnQge1xuICAgIHJlYWRvbmx5IGVsZW1lbnQ6IEVsZW1lbnQ7XG4gICAgcmVhZG9ubHkgaXNDb25uZWN0ZWQ6IGJvb2xlYW47XG5cbiAgICBjb25zdHJ1Y3Rvcih0cml2aWFsU3Vic2NyaXB0aW9uOiBUcml2aWFsU3Vic2NyaXB0aW9uLCBlbGVtZW50OiBFbGVtZW50LCBpc0Nvbm5lY3RlZDogYm9vbGVhbikge1xuICAgICAgICBzdXBlcih0cml2aWFsU3Vic2NyaXB0aW9uLCAnRWxlbWVudENvbm5lY3RlZCcpO1xuXG4gICAgICAgIHRoaXMuZWxlbWVudCA9IGVsZW1lbnQ7XG4gICAgICAgIHRoaXMuaXNDb25uZWN0ZWQgPSBpc0Nvbm5lY3RlZDtcbiAgICB9XG59XG5cbmV4cG9ydCBjbGFzcyBUcml2aWFsU3Vic2NyaXB0aW9uIGV4dGVuZHMgU3Vic2NyaXB0aW9uIHtcbiAgICBwcml2YXRlIGlzQ29ubmVjdGVkOiBib29sZWFuID0gZmFsc2U7XG4gICAgcHJpdmF0ZSBjb25maWc6IFRyaXZpYWxTdWJzY3JpcHRpb25Db25maWd1cmF0aW9uO1xuXG4gICAgY29uc3RydWN0b3IoZWxlbWVudDogRWxlbWVudCwgY29uZmlnOiBUcml2aWFsU3Vic2NyaXB0aW9uQ29uZmlndXJhdGlvbiwgZXhlY3V0b3I6IFN1YnNjcmlwdGlvbkV4ZWN1dG9yKSB7XG4gICAgICAgIHN1cGVyKGVsZW1lbnQsIGV4ZWN1dG9yKTtcblxuICAgICAgICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcbiAgICB9XG5cbiAgICBjb25uZWN0KCkge1xuICAgICAgICBpZighdGhpcy5pc0Nvbm5lY3RlZCkge1xuICAgICAgICAgICAgdGhpcy5pc0Nvbm5lY3RlZCA9IHRydWU7XG5cbiAgICAgICAgICAgIGlmKHRoaXMuY29uZmlnLmNvbm5lY3RlZCkge1xuICAgICAgICAgICAgICAgIHRoaXMuZXhlY3V0b3IodGhpcy5idWlsZEVsZW1lbnRDb25uZWN0aW9uQ2hhbmdlZEV2ZW50KCksIHRoaXMuZWxlbWVudCk7IFxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgZGlzY29ubmVjdCgpIHtcbiAgICAgICAgaWYodGhpcy5pc0Nvbm5lY3RlZCkge1xuICAgICAgICAgICAgdGhpcy5pc0Nvbm5lY3RlZCA9IGZhbHNlO1xuXG4gICAgICAgICAgICBpZih0aGlzLmNvbmZpZy5kaXNjb25uZWN0ZWQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmV4ZWN1dG9yKHRoaXMuYnVpbGRFbGVtZW50Q29ubmVjdGlvbkNoYW5nZWRFdmVudCgpLCB0aGlzLmVsZW1lbnQpOyAgICAgXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgcHJpdmF0ZSBidWlsZEVsZW1lbnRDb25uZWN0aW9uQ2hhbmdlZEV2ZW50KCk6IEVsZW1lbnRDb25uZWN0aW9uQ2hhbmdlZEV2ZW50IHtcbiAgICAgICAgcmV0dXJuIG5ldyBFbGVtZW50Q29ubmVjdGlvbkNoYW5nZWRFdmVudCh0aGlzLCB0aGlzLmVsZW1lbnQsIHRoaXMuaXNDb25uZWN0ZWQpO1xuICAgIH1cbn0iXX0=
