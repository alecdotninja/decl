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
        return this.getScope().select(matcher, executor);
    };
    Decl.prototype.on = function (matcher, executor) {
        return this.getScope().on(matcher, executor);
    };
    Decl.prototype.getScope = function () {
        return this.scope;
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
    function Scope(element, executor) {
        this.isActivated = false;
        this.subscriptions = [];
        this.children = [];
        this.element = element;
        if (executor) {
            executor.call(this, this, this.element);
        }
    }
    Scope.buildRootScope = function (element) {
        var scope = new Scope(element);
        scope.activate();
        return scope;
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
        this.addSubscription(new matching_elements_subscription_1.MatchingElementsSubscription(this.element, matcher, this.buildSelectExecutor(executor)));
        return this;
    };
    Scope.prototype.when = function (matcher, executor) {
        this.addSubscription(new element_matches_subscription_1.ElementMatchesSubscription(this.element, matcher, this.buildWhenExecutor(executor)));
        return this;
    };
    Scope.prototype.on = function (matcher, executor) {
        this.addSubscription(new event_subscription_1.EventSubscription(this.element, matcher, executor));
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
    Scope.prototype.buildSelectExecutor = function (executor) {
        var scopes = [];
        return function (event, element) {
            for (var _i = 0, _a = event.addedElements; _i < _a.length; _i++) {
                var element_1 = _a[_i];
                var scope = new Scope(element_1, executor);
                scopes.push(scope);
                scope.activate();
            }
            for (var _b = 0, _c = event.removedElements; _b < _c.length; _b++) {
                var element_2 = _c[_b];
                for (var index = 0, length_1 = scopes.length, scope = void 0; index < length_1; index++) {
                    scope = scopes[index];
                    if (scope.element === element_2) {
                        scope.deactivate();
                        scopes.splice(index, 1);
                        break;
                    }
                }
            }
        };
    };
    Scope.prototype.buildWhenExecutor = function (executor) {
        var _this = this;
        var scope = null;
        return function (event, element) {
            if (event.isMatching) {
                scope = new Scope(_this.element, executor);
                scope.activate();
            }
            else {
                scope.deactivate();
                scope = null;
            }
        };
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvbXV0YXRpb24tb2JzZXJ2ZXIvaW5kZXguanMiLCJzcmMvZGVjbC50cyIsInNyYy9lbGVtZW50X2NvbGxlY3Rvci50cyIsInNyYy9zY29wZS50cyIsInNyYy9zdWJzY3JpcHRpb25zL2JhdGNoZWRfbXV0YXRpb25fc3Vic2NyaXB0aW9uLnRzIiwic3JjL3N1YnNjcmlwdGlvbnMvZWxlbWVudF9tYXRjaGVzX3N1YnNjcmlwdGlvbi50cyIsInNyYy9zdWJzY3JpcHRpb25zL2V2ZW50X3N1YnNjcmlwdGlvbi50cyIsInNyYy9zdWJzY3JpcHRpb25zL21hdGNoaW5nX2VsZW1lbnRzX3N1YnNjcmlwdGlvbi50cyIsInNyYy9zdWJzY3JpcHRpb25zL3N1YnNjcmlwdGlvbi50cyIsInNyYy9zdWJzY3JpcHRpb25zL3RyaXZpYWxfc3Vic2NyaXB0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUN6a0JBLGlDQUFtRztBQTBEMUYsOEJBQUs7QUF4RGQsa0JBQWUsSUFBSSxDQUFDO0FBRXBCO0lBNEJJLGNBQVksSUFBYTtRQUNyQixJQUFJLENBQUMsS0FBSyxHQUFHLGFBQUssQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDNUMsQ0FBQztJQTNCTSxXQUFNLEdBQWIsVUFBYyxPQUF1QixFQUFFLFFBQXVCO1FBQzFELE1BQU0sQ0FB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LENBQUEsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQztZQUNsQixJQUFJLENBQUMsV0FBVyxHQUFHLEtBQUssQ0FBQztZQUV6QixFQUFFLENBQUEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUM7Z0JBQzFCLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLGtDQUFrQyxFQUFFLEVBQUUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQzNFLENBQUM7UUFDTCxDQUFDO0lBQ0wsQ0FBQztJQUVPLGdFQUFrQyxHQUExQztRQUNJLE1BQU0sQ0FBQyxJQUFJLDZCQUE2QixDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQztJQUNuRixDQUFDO0lBQ0wsMEJBQUM7QUFBRCxDQWpDQSxBQWlDQyxDQWpDd0MsMkJBQVksR0FpQ3BEO0FBakNZLGtEQUFtQiIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJ2YXIgTXV0YXRpb25PYnNlcnZlciA9IHdpbmRvdy5NdXRhdGlvbk9ic2VydmVyXG4gIHx8IHdpbmRvdy5XZWJLaXRNdXRhdGlvbk9ic2VydmVyXG4gIHx8IHdpbmRvdy5Nb3pNdXRhdGlvbk9ic2VydmVyO1xuXG4vKlxuICogQ29weXJpZ2h0IDIwMTIgVGhlIFBvbHltZXIgQXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqIFVzZSBvZiB0aGlzIHNvdXJjZSBjb2RlIGlzIGdvdmVyZW5lZCBieSBhIEJTRC1zdHlsZVxuICogbGljZW5zZSB0aGF0IGNhbiBiZSBmb3VuZCBpbiB0aGUgTElDRU5TRSBmaWxlLlxuICovXG5cbnZhciBXZWFrTWFwID0gd2luZG93LldlYWtNYXA7XG5cbmlmICh0eXBlb2YgV2Vha01hcCA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgdmFyIGRlZmluZVByb3BlcnR5ID0gT2JqZWN0LmRlZmluZVByb3BlcnR5O1xuICB2YXIgY291bnRlciA9IERhdGUubm93KCkgJSAxZTk7XG5cbiAgV2Vha01hcCA9IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMubmFtZSA9ICdfX3N0JyArIChNYXRoLnJhbmRvbSgpICogMWU5ID4+PiAwKSArIChjb3VudGVyKysgKyAnX18nKTtcbiAgfTtcblxuICBXZWFrTWFwLnByb3RvdHlwZSA9IHtcbiAgICBzZXQ6IGZ1bmN0aW9uKGtleSwgdmFsdWUpIHtcbiAgICAgIHZhciBlbnRyeSA9IGtleVt0aGlzLm5hbWVdO1xuICAgICAgaWYgKGVudHJ5ICYmIGVudHJ5WzBdID09PSBrZXkpXG4gICAgICAgIGVudHJ5WzFdID0gdmFsdWU7XG4gICAgICBlbHNlXG4gICAgICAgIGRlZmluZVByb3BlcnR5KGtleSwgdGhpcy5uYW1lLCB7dmFsdWU6IFtrZXksIHZhbHVlXSwgd3JpdGFibGU6IHRydWV9KTtcbiAgICAgIHJldHVybiB0aGlzO1xuICAgIH0sXG4gICAgZ2V0OiBmdW5jdGlvbihrZXkpIHtcbiAgICAgIHZhciBlbnRyeTtcbiAgICAgIHJldHVybiAoZW50cnkgPSBrZXlbdGhpcy5uYW1lXSkgJiYgZW50cnlbMF0gPT09IGtleSA/XG4gICAgICAgICAgZW50cnlbMV0gOiB1bmRlZmluZWQ7XG4gICAgfSxcbiAgICAnZGVsZXRlJzogZnVuY3Rpb24oa2V5KSB7XG4gICAgICB2YXIgZW50cnkgPSBrZXlbdGhpcy5uYW1lXTtcbiAgICAgIGlmICghZW50cnkpIHJldHVybiBmYWxzZTtcbiAgICAgIHZhciBoYXNWYWx1ZSA9IGVudHJ5WzBdID09PSBrZXk7XG4gICAgICBlbnRyeVswXSA9IGVudHJ5WzFdID0gdW5kZWZpbmVkO1xuICAgICAgcmV0dXJuIGhhc1ZhbHVlO1xuICAgIH0sXG4gICAgaGFzOiBmdW5jdGlvbihrZXkpIHtcbiAgICAgIHZhciBlbnRyeSA9IGtleVt0aGlzLm5hbWVdO1xuICAgICAgaWYgKCFlbnRyeSkgcmV0dXJuIGZhbHNlO1xuICAgICAgcmV0dXJuIGVudHJ5WzBdID09PSBrZXk7XG4gICAgfVxuICB9O1xufVxuXG52YXIgcmVnaXN0cmF0aW9uc1RhYmxlID0gbmV3IFdlYWtNYXAoKTtcblxuLy8gV2UgdXNlIHNldEltbWVkaWF0ZSBvciBwb3N0TWVzc2FnZSBmb3Igb3VyIGZ1dHVyZSBjYWxsYmFjay5cbnZhciBzZXRJbW1lZGlhdGUgPSB3aW5kb3cubXNTZXRJbW1lZGlhdGU7XG5cbi8vIFVzZSBwb3N0IG1lc3NhZ2UgdG8gZW11bGF0ZSBzZXRJbW1lZGlhdGUuXG5pZiAoIXNldEltbWVkaWF0ZSkge1xuICB2YXIgc2V0SW1tZWRpYXRlUXVldWUgPSBbXTtcbiAgdmFyIHNlbnRpbmVsID0gU3RyaW5nKE1hdGgucmFuZG9tKCkpO1xuICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbWVzc2FnZScsIGZ1bmN0aW9uKGUpIHtcbiAgICBpZiAoZS5kYXRhID09PSBzZW50aW5lbCkge1xuICAgICAgdmFyIHF1ZXVlID0gc2V0SW1tZWRpYXRlUXVldWU7XG4gICAgICBzZXRJbW1lZGlhdGVRdWV1ZSA9IFtdO1xuICAgICAgcXVldWUuZm9yRWFjaChmdW5jdGlvbihmdW5jKSB7XG4gICAgICAgIGZ1bmMoKTtcbiAgICAgIH0pO1xuICAgIH1cbiAgfSk7XG4gIHNldEltbWVkaWF0ZSA9IGZ1bmN0aW9uKGZ1bmMpIHtcbiAgICBzZXRJbW1lZGlhdGVRdWV1ZS5wdXNoKGZ1bmMpO1xuICAgIHdpbmRvdy5wb3N0TWVzc2FnZShzZW50aW5lbCwgJyonKTtcbiAgfTtcbn1cblxuLy8gVGhpcyBpcyB1c2VkIHRvIGVuc3VyZSB0aGF0IHdlIG5ldmVyIHNjaGVkdWxlIDIgY2FsbGFzIHRvIHNldEltbWVkaWF0ZVxudmFyIGlzU2NoZWR1bGVkID0gZmFsc2U7XG5cbi8vIEtlZXAgdHJhY2sgb2Ygb2JzZXJ2ZXJzIHRoYXQgbmVlZHMgdG8gYmUgbm90aWZpZWQgbmV4dCB0aW1lLlxudmFyIHNjaGVkdWxlZE9ic2VydmVycyA9IFtdO1xuXG4vKipcbiAqIFNjaGVkdWxlcyB8ZGlzcGF0Y2hDYWxsYmFja3wgdG8gYmUgY2FsbGVkIGluIHRoZSBmdXR1cmUuXG4gKiBAcGFyYW0ge011dGF0aW9uT2JzZXJ2ZXJ9IG9ic2VydmVyXG4gKi9cbmZ1bmN0aW9uIHNjaGVkdWxlQ2FsbGJhY2sob2JzZXJ2ZXIpIHtcbiAgc2NoZWR1bGVkT2JzZXJ2ZXJzLnB1c2gob2JzZXJ2ZXIpO1xuICBpZiAoIWlzU2NoZWR1bGVkKSB7XG4gICAgaXNTY2hlZHVsZWQgPSB0cnVlO1xuICAgIHNldEltbWVkaWF0ZShkaXNwYXRjaENhbGxiYWNrcyk7XG4gIH1cbn1cblxuZnVuY3Rpb24gd3JhcElmTmVlZGVkKG5vZGUpIHtcbiAgcmV0dXJuIHdpbmRvdy5TaGFkb3dET01Qb2x5ZmlsbCAmJlxuICAgICAgd2luZG93LlNoYWRvd0RPTVBvbHlmaWxsLndyYXBJZk5lZWRlZChub2RlKSB8fFxuICAgICAgbm9kZTtcbn1cblxuZnVuY3Rpb24gZGlzcGF0Y2hDYWxsYmFja3MoKSB7XG4gIC8vIGh0dHA6Ly9kb20uc3BlYy53aGF0d2cub3JnLyNtdXRhdGlvbi1vYnNlcnZlcnNcblxuICBpc1NjaGVkdWxlZCA9IGZhbHNlOyAvLyBVc2VkIHRvIGFsbG93IGEgbmV3IHNldEltbWVkaWF0ZSBjYWxsIGFib3ZlLlxuXG4gIHZhciBvYnNlcnZlcnMgPSBzY2hlZHVsZWRPYnNlcnZlcnM7XG4gIHNjaGVkdWxlZE9ic2VydmVycyA9IFtdO1xuICAvLyBTb3J0IG9ic2VydmVycyBiYXNlZCBvbiB0aGVpciBjcmVhdGlvbiBVSUQgKGluY3JlbWVudGFsKS5cbiAgb2JzZXJ2ZXJzLnNvcnQoZnVuY3Rpb24obzEsIG8yKSB7XG4gICAgcmV0dXJuIG8xLnVpZF8gLSBvMi51aWRfO1xuICB9KTtcblxuICB2YXIgYW55Tm9uRW1wdHkgPSBmYWxzZTtcbiAgb2JzZXJ2ZXJzLmZvckVhY2goZnVuY3Rpb24ob2JzZXJ2ZXIpIHtcblxuICAgIC8vIDIuMSwgMi4yXG4gICAgdmFyIHF1ZXVlID0gb2JzZXJ2ZXIudGFrZVJlY29yZHMoKTtcbiAgICAvLyAyLjMuIFJlbW92ZSBhbGwgdHJhbnNpZW50IHJlZ2lzdGVyZWQgb2JzZXJ2ZXJzIHdob3NlIG9ic2VydmVyIGlzIG1vLlxuICAgIHJlbW92ZVRyYW5zaWVudE9ic2VydmVyc0ZvcihvYnNlcnZlcik7XG5cbiAgICAvLyAyLjRcbiAgICBpZiAocXVldWUubGVuZ3RoKSB7XG4gICAgICBvYnNlcnZlci5jYWxsYmFja18ocXVldWUsIG9ic2VydmVyKTtcbiAgICAgIGFueU5vbkVtcHR5ID0gdHJ1ZTtcbiAgICB9XG4gIH0pO1xuXG4gIC8vIDMuXG4gIGlmIChhbnlOb25FbXB0eSlcbiAgICBkaXNwYXRjaENhbGxiYWNrcygpO1xufVxuXG5mdW5jdGlvbiByZW1vdmVUcmFuc2llbnRPYnNlcnZlcnNGb3Iob2JzZXJ2ZXIpIHtcbiAgb2JzZXJ2ZXIubm9kZXNfLmZvckVhY2goZnVuY3Rpb24obm9kZSkge1xuICAgIHZhciByZWdpc3RyYXRpb25zID0gcmVnaXN0cmF0aW9uc1RhYmxlLmdldChub2RlKTtcbiAgICBpZiAoIXJlZ2lzdHJhdGlvbnMpXG4gICAgICByZXR1cm47XG4gICAgcmVnaXN0cmF0aW9ucy5mb3JFYWNoKGZ1bmN0aW9uKHJlZ2lzdHJhdGlvbikge1xuICAgICAgaWYgKHJlZ2lzdHJhdGlvbi5vYnNlcnZlciA9PT0gb2JzZXJ2ZXIpXG4gICAgICAgIHJlZ2lzdHJhdGlvbi5yZW1vdmVUcmFuc2llbnRPYnNlcnZlcnMoKTtcbiAgICB9KTtcbiAgfSk7XG59XG5cbi8qKlxuICogVGhpcyBmdW5jdGlvbiBpcyB1c2VkIGZvciB0aGUgXCJGb3IgZWFjaCByZWdpc3RlcmVkIG9ic2VydmVyIG9ic2VydmVyICh3aXRoXG4gKiBvYnNlcnZlcidzIG9wdGlvbnMgYXMgb3B0aW9ucykgaW4gdGFyZ2V0J3MgbGlzdCBvZiByZWdpc3RlcmVkIG9ic2VydmVycyxcbiAqIHJ1biB0aGVzZSBzdWJzdGVwczpcIiBhbmQgdGhlIFwiRm9yIGVhY2ggYW5jZXN0b3IgYW5jZXN0b3Igb2YgdGFyZ2V0LCBhbmQgZm9yXG4gKiBlYWNoIHJlZ2lzdGVyZWQgb2JzZXJ2ZXIgb2JzZXJ2ZXIgKHdpdGggb3B0aW9ucyBvcHRpb25zKSBpbiBhbmNlc3RvcidzIGxpc3RcbiAqIG9mIHJlZ2lzdGVyZWQgb2JzZXJ2ZXJzLCBydW4gdGhlc2Ugc3Vic3RlcHM6XCIgcGFydCBvZiB0aGUgYWxnb3JpdGhtcy4gVGhlXG4gKiB8b3B0aW9ucy5zdWJ0cmVlfCBpcyBjaGVja2VkIHRvIGVuc3VyZSB0aGF0IHRoZSBjYWxsYmFjayBpcyBjYWxsZWRcbiAqIGNvcnJlY3RseS5cbiAqXG4gKiBAcGFyYW0ge05vZGV9IHRhcmdldFxuICogQHBhcmFtIHtmdW5jdGlvbihNdXRhdGlvbk9ic2VydmVySW5pdCk6TXV0YXRpb25SZWNvcmR9IGNhbGxiYWNrXG4gKi9cbmZ1bmN0aW9uIGZvckVhY2hBbmNlc3RvckFuZE9ic2VydmVyRW5xdWV1ZVJlY29yZCh0YXJnZXQsIGNhbGxiYWNrKSB7XG4gIGZvciAodmFyIG5vZGUgPSB0YXJnZXQ7IG5vZGU7IG5vZGUgPSBub2RlLnBhcmVudE5vZGUpIHtcbiAgICB2YXIgcmVnaXN0cmF0aW9ucyA9IHJlZ2lzdHJhdGlvbnNUYWJsZS5nZXQobm9kZSk7XG5cbiAgICBpZiAocmVnaXN0cmF0aW9ucykge1xuICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCByZWdpc3RyYXRpb25zLmxlbmd0aDsgaisrKSB7XG4gICAgICAgIHZhciByZWdpc3RyYXRpb24gPSByZWdpc3RyYXRpb25zW2pdO1xuICAgICAgICB2YXIgb3B0aW9ucyA9IHJlZ2lzdHJhdGlvbi5vcHRpb25zO1xuXG4gICAgICAgIC8vIE9ubHkgdGFyZ2V0IGlnbm9yZXMgc3VidHJlZS5cbiAgICAgICAgaWYgKG5vZGUgIT09IHRhcmdldCAmJiAhb3B0aW9ucy5zdWJ0cmVlKVxuICAgICAgICAgIGNvbnRpbnVlO1xuXG4gICAgICAgIHZhciByZWNvcmQgPSBjYWxsYmFjayhvcHRpb25zKTtcbiAgICAgICAgaWYgKHJlY29yZClcbiAgICAgICAgICByZWdpc3RyYXRpb24uZW5xdWV1ZShyZWNvcmQpO1xuICAgICAgfVxuICAgIH1cbiAgfVxufVxuXG52YXIgdWlkQ291bnRlciA9IDA7XG5cbi8qKlxuICogVGhlIGNsYXNzIHRoYXQgbWFwcyB0byB0aGUgRE9NIE11dGF0aW9uT2JzZXJ2ZXIgaW50ZXJmYWNlLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2suXG4gKiBAY29uc3RydWN0b3JcbiAqL1xuZnVuY3Rpb24gSnNNdXRhdGlvbk9ic2VydmVyKGNhbGxiYWNrKSB7XG4gIHRoaXMuY2FsbGJhY2tfID0gY2FsbGJhY2s7XG4gIHRoaXMubm9kZXNfID0gW107XG4gIHRoaXMucmVjb3Jkc18gPSBbXTtcbiAgdGhpcy51aWRfID0gKyt1aWRDb3VudGVyO1xufVxuXG5Kc011dGF0aW9uT2JzZXJ2ZXIucHJvdG90eXBlID0ge1xuICBvYnNlcnZlOiBmdW5jdGlvbih0YXJnZXQsIG9wdGlvbnMpIHtcbiAgICB0YXJnZXQgPSB3cmFwSWZOZWVkZWQodGFyZ2V0KTtcblxuICAgIC8vIDEuMVxuICAgIGlmICghb3B0aW9ucy5jaGlsZExpc3QgJiYgIW9wdGlvbnMuYXR0cmlidXRlcyAmJiAhb3B0aW9ucy5jaGFyYWN0ZXJEYXRhIHx8XG5cbiAgICAgICAgLy8gMS4yXG4gICAgICAgIG9wdGlvbnMuYXR0cmlidXRlT2xkVmFsdWUgJiYgIW9wdGlvbnMuYXR0cmlidXRlcyB8fFxuXG4gICAgICAgIC8vIDEuM1xuICAgICAgICBvcHRpb25zLmF0dHJpYnV0ZUZpbHRlciAmJiBvcHRpb25zLmF0dHJpYnV0ZUZpbHRlci5sZW5ndGggJiZcbiAgICAgICAgICAgICFvcHRpb25zLmF0dHJpYnV0ZXMgfHxcblxuICAgICAgICAvLyAxLjRcbiAgICAgICAgb3B0aW9ucy5jaGFyYWN0ZXJEYXRhT2xkVmFsdWUgJiYgIW9wdGlvbnMuY2hhcmFjdGVyRGF0YSkge1xuXG4gICAgICB0aHJvdyBuZXcgU3ludGF4RXJyb3IoKTtcbiAgICB9XG5cbiAgICB2YXIgcmVnaXN0cmF0aW9ucyA9IHJlZ2lzdHJhdGlvbnNUYWJsZS5nZXQodGFyZ2V0KTtcbiAgICBpZiAoIXJlZ2lzdHJhdGlvbnMpXG4gICAgICByZWdpc3RyYXRpb25zVGFibGUuc2V0KHRhcmdldCwgcmVnaXN0cmF0aW9ucyA9IFtdKTtcblxuICAgIC8vIDJcbiAgICAvLyBJZiB0YXJnZXQncyBsaXN0IG9mIHJlZ2lzdGVyZWQgb2JzZXJ2ZXJzIGFscmVhZHkgaW5jbHVkZXMgYSByZWdpc3RlcmVkXG4gICAgLy8gb2JzZXJ2ZXIgYXNzb2NpYXRlZCB3aXRoIHRoZSBjb250ZXh0IG9iamVjdCwgcmVwbGFjZSB0aGF0IHJlZ2lzdGVyZWRcbiAgICAvLyBvYnNlcnZlcidzIG9wdGlvbnMgd2l0aCBvcHRpb25zLlxuICAgIHZhciByZWdpc3RyYXRpb247XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCByZWdpc3RyYXRpb25zLmxlbmd0aDsgaSsrKSB7XG4gICAgICBpZiAocmVnaXN0cmF0aW9uc1tpXS5vYnNlcnZlciA9PT0gdGhpcykge1xuICAgICAgICByZWdpc3RyYXRpb24gPSByZWdpc3RyYXRpb25zW2ldO1xuICAgICAgICByZWdpc3RyYXRpb24ucmVtb3ZlTGlzdGVuZXJzKCk7XG4gICAgICAgIHJlZ2lzdHJhdGlvbi5vcHRpb25zID0gb3B0aW9ucztcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gMy5cbiAgICAvLyBPdGhlcndpc2UsIGFkZCBhIG5ldyByZWdpc3RlcmVkIG9ic2VydmVyIHRvIHRhcmdldCdzIGxpc3Qgb2YgcmVnaXN0ZXJlZFxuICAgIC8vIG9ic2VydmVycyB3aXRoIHRoZSBjb250ZXh0IG9iamVjdCBhcyB0aGUgb2JzZXJ2ZXIgYW5kIG9wdGlvbnMgYXMgdGhlXG4gICAgLy8gb3B0aW9ucywgYW5kIGFkZCB0YXJnZXQgdG8gY29udGV4dCBvYmplY3QncyBsaXN0IG9mIG5vZGVzIG9uIHdoaWNoIGl0XG4gICAgLy8gaXMgcmVnaXN0ZXJlZC5cbiAgICBpZiAoIXJlZ2lzdHJhdGlvbikge1xuICAgICAgcmVnaXN0cmF0aW9uID0gbmV3IFJlZ2lzdHJhdGlvbih0aGlzLCB0YXJnZXQsIG9wdGlvbnMpO1xuICAgICAgcmVnaXN0cmF0aW9ucy5wdXNoKHJlZ2lzdHJhdGlvbik7XG4gICAgICB0aGlzLm5vZGVzXy5wdXNoKHRhcmdldCk7XG4gICAgfVxuXG4gICAgcmVnaXN0cmF0aW9uLmFkZExpc3RlbmVycygpO1xuICB9LFxuXG4gIGRpc2Nvbm5lY3Q6IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMubm9kZXNfLmZvckVhY2goZnVuY3Rpb24obm9kZSkge1xuICAgICAgdmFyIHJlZ2lzdHJhdGlvbnMgPSByZWdpc3RyYXRpb25zVGFibGUuZ2V0KG5vZGUpO1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCByZWdpc3RyYXRpb25zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhciByZWdpc3RyYXRpb24gPSByZWdpc3RyYXRpb25zW2ldO1xuICAgICAgICBpZiAocmVnaXN0cmF0aW9uLm9ic2VydmVyID09PSB0aGlzKSB7XG4gICAgICAgICAgcmVnaXN0cmF0aW9uLnJlbW92ZUxpc3RlbmVycygpO1xuICAgICAgICAgIHJlZ2lzdHJhdGlvbnMuc3BsaWNlKGksIDEpO1xuICAgICAgICAgIC8vIEVhY2ggbm9kZSBjYW4gb25seSBoYXZlIG9uZSByZWdpc3RlcmVkIG9ic2VydmVyIGFzc29jaWF0ZWQgd2l0aFxuICAgICAgICAgIC8vIHRoaXMgb2JzZXJ2ZXIuXG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LCB0aGlzKTtcbiAgICB0aGlzLnJlY29yZHNfID0gW107XG4gIH0sXG5cbiAgdGFrZVJlY29yZHM6IGZ1bmN0aW9uKCkge1xuICAgIHZhciBjb3B5T2ZSZWNvcmRzID0gdGhpcy5yZWNvcmRzXztcbiAgICB0aGlzLnJlY29yZHNfID0gW107XG4gICAgcmV0dXJuIGNvcHlPZlJlY29yZHM7XG4gIH1cbn07XG5cbi8qKlxuICogQHBhcmFtIHtzdHJpbmd9IHR5cGVcbiAqIEBwYXJhbSB7Tm9kZX0gdGFyZ2V0XG4gKiBAY29uc3RydWN0b3JcbiAqL1xuZnVuY3Rpb24gTXV0YXRpb25SZWNvcmQodHlwZSwgdGFyZ2V0KSB7XG4gIHRoaXMudHlwZSA9IHR5cGU7XG4gIHRoaXMudGFyZ2V0ID0gdGFyZ2V0O1xuICB0aGlzLmFkZGVkTm9kZXMgPSBbXTtcbiAgdGhpcy5yZW1vdmVkTm9kZXMgPSBbXTtcbiAgdGhpcy5wcmV2aW91c1NpYmxpbmcgPSBudWxsO1xuICB0aGlzLm5leHRTaWJsaW5nID0gbnVsbDtcbiAgdGhpcy5hdHRyaWJ1dGVOYW1lID0gbnVsbDtcbiAgdGhpcy5hdHRyaWJ1dGVOYW1lc3BhY2UgPSBudWxsO1xuICB0aGlzLm9sZFZhbHVlID0gbnVsbDtcbn1cblxuZnVuY3Rpb24gY29weU11dGF0aW9uUmVjb3JkKG9yaWdpbmFsKSB7XG4gIHZhciByZWNvcmQgPSBuZXcgTXV0YXRpb25SZWNvcmQob3JpZ2luYWwudHlwZSwgb3JpZ2luYWwudGFyZ2V0KTtcbiAgcmVjb3JkLmFkZGVkTm9kZXMgPSBvcmlnaW5hbC5hZGRlZE5vZGVzLnNsaWNlKCk7XG4gIHJlY29yZC5yZW1vdmVkTm9kZXMgPSBvcmlnaW5hbC5yZW1vdmVkTm9kZXMuc2xpY2UoKTtcbiAgcmVjb3JkLnByZXZpb3VzU2libGluZyA9IG9yaWdpbmFsLnByZXZpb3VzU2libGluZztcbiAgcmVjb3JkLm5leHRTaWJsaW5nID0gb3JpZ2luYWwubmV4dFNpYmxpbmc7XG4gIHJlY29yZC5hdHRyaWJ1dGVOYW1lID0gb3JpZ2luYWwuYXR0cmlidXRlTmFtZTtcbiAgcmVjb3JkLmF0dHJpYnV0ZU5hbWVzcGFjZSA9IG9yaWdpbmFsLmF0dHJpYnV0ZU5hbWVzcGFjZTtcbiAgcmVjb3JkLm9sZFZhbHVlID0gb3JpZ2luYWwub2xkVmFsdWU7XG4gIHJldHVybiByZWNvcmQ7XG59O1xuXG4vLyBXZSBrZWVwIHRyYWNrIG9mIHRoZSB0d28gKHBvc3NpYmx5IG9uZSkgcmVjb3JkcyB1c2VkIGluIGEgc2luZ2xlIG11dGF0aW9uLlxudmFyIGN1cnJlbnRSZWNvcmQsIHJlY29yZFdpdGhPbGRWYWx1ZTtcblxuLyoqXG4gKiBDcmVhdGVzIGEgcmVjb3JkIHdpdGhvdXQgfG9sZFZhbHVlfCBhbmQgY2FjaGVzIGl0IGFzIHxjdXJyZW50UmVjb3JkfCBmb3JcbiAqIGxhdGVyIHVzZS5cbiAqIEBwYXJhbSB7c3RyaW5nfSBvbGRWYWx1ZVxuICogQHJldHVybiB7TXV0YXRpb25SZWNvcmR9XG4gKi9cbmZ1bmN0aW9uIGdldFJlY29yZCh0eXBlLCB0YXJnZXQpIHtcbiAgcmV0dXJuIGN1cnJlbnRSZWNvcmQgPSBuZXcgTXV0YXRpb25SZWNvcmQodHlwZSwgdGFyZ2V0KTtcbn1cblxuLyoqXG4gKiBHZXRzIG9yIGNyZWF0ZXMgYSByZWNvcmQgd2l0aCB8b2xkVmFsdWV8IGJhc2VkIGluIHRoZSB8Y3VycmVudFJlY29yZHxcbiAqIEBwYXJhbSB7c3RyaW5nfSBvbGRWYWx1ZVxuICogQHJldHVybiB7TXV0YXRpb25SZWNvcmR9XG4gKi9cbmZ1bmN0aW9uIGdldFJlY29yZFdpdGhPbGRWYWx1ZShvbGRWYWx1ZSkge1xuICBpZiAocmVjb3JkV2l0aE9sZFZhbHVlKVxuICAgIHJldHVybiByZWNvcmRXaXRoT2xkVmFsdWU7XG4gIHJlY29yZFdpdGhPbGRWYWx1ZSA9IGNvcHlNdXRhdGlvblJlY29yZChjdXJyZW50UmVjb3JkKTtcbiAgcmVjb3JkV2l0aE9sZFZhbHVlLm9sZFZhbHVlID0gb2xkVmFsdWU7XG4gIHJldHVybiByZWNvcmRXaXRoT2xkVmFsdWU7XG59XG5cbmZ1bmN0aW9uIGNsZWFyUmVjb3JkcygpIHtcbiAgY3VycmVudFJlY29yZCA9IHJlY29yZFdpdGhPbGRWYWx1ZSA9IHVuZGVmaW5lZDtcbn1cblxuLyoqXG4gKiBAcGFyYW0ge011dGF0aW9uUmVjb3JkfSByZWNvcmRcbiAqIEByZXR1cm4ge2Jvb2xlYW59IFdoZXRoZXIgdGhlIHJlY29yZCByZXByZXNlbnRzIGEgcmVjb3JkIGZyb20gdGhlIGN1cnJlbnRcbiAqIG11dGF0aW9uIGV2ZW50LlxuICovXG5mdW5jdGlvbiByZWNvcmRSZXByZXNlbnRzQ3VycmVudE11dGF0aW9uKHJlY29yZCkge1xuICByZXR1cm4gcmVjb3JkID09PSByZWNvcmRXaXRoT2xkVmFsdWUgfHwgcmVjb3JkID09PSBjdXJyZW50UmVjb3JkO1xufVxuXG4vKipcbiAqIFNlbGVjdHMgd2hpY2ggcmVjb3JkLCBpZiBhbnksIHRvIHJlcGxhY2UgdGhlIGxhc3QgcmVjb3JkIGluIHRoZSBxdWV1ZS5cbiAqIFRoaXMgcmV0dXJucyB8bnVsbHwgaWYgbm8gcmVjb3JkIHNob3VsZCBiZSByZXBsYWNlZC5cbiAqXG4gKiBAcGFyYW0ge011dGF0aW9uUmVjb3JkfSBsYXN0UmVjb3JkXG4gKiBAcGFyYW0ge011dGF0aW9uUmVjb3JkfSBuZXdSZWNvcmRcbiAqIEBwYXJhbSB7TXV0YXRpb25SZWNvcmR9XG4gKi9cbmZ1bmN0aW9uIHNlbGVjdFJlY29yZChsYXN0UmVjb3JkLCBuZXdSZWNvcmQpIHtcbiAgaWYgKGxhc3RSZWNvcmQgPT09IG5ld1JlY29yZClcbiAgICByZXR1cm4gbGFzdFJlY29yZDtcblxuICAvLyBDaGVjayBpZiB0aGUgdGhlIHJlY29yZCB3ZSBhcmUgYWRkaW5nIHJlcHJlc2VudHMgdGhlIHNhbWUgcmVjb3JkLiBJZlxuICAvLyBzbywgd2Uga2VlcCB0aGUgb25lIHdpdGggdGhlIG9sZFZhbHVlIGluIGl0LlxuICBpZiAocmVjb3JkV2l0aE9sZFZhbHVlICYmIHJlY29yZFJlcHJlc2VudHNDdXJyZW50TXV0YXRpb24obGFzdFJlY29yZCkpXG4gICAgcmV0dXJuIHJlY29yZFdpdGhPbGRWYWx1ZTtcblxuICByZXR1cm4gbnVsbDtcbn1cblxuLyoqXG4gKiBDbGFzcyB1c2VkIHRvIHJlcHJlc2VudCBhIHJlZ2lzdGVyZWQgb2JzZXJ2ZXIuXG4gKiBAcGFyYW0ge011dGF0aW9uT2JzZXJ2ZXJ9IG9ic2VydmVyXG4gKiBAcGFyYW0ge05vZGV9IHRhcmdldFxuICogQHBhcmFtIHtNdXRhdGlvbk9ic2VydmVySW5pdH0gb3B0aW9uc1xuICogQGNvbnN0cnVjdG9yXG4gKi9cbmZ1bmN0aW9uIFJlZ2lzdHJhdGlvbihvYnNlcnZlciwgdGFyZ2V0LCBvcHRpb25zKSB7XG4gIHRoaXMub2JzZXJ2ZXIgPSBvYnNlcnZlcjtcbiAgdGhpcy50YXJnZXQgPSB0YXJnZXQ7XG4gIHRoaXMub3B0aW9ucyA9IG9wdGlvbnM7XG4gIHRoaXMudHJhbnNpZW50T2JzZXJ2ZWROb2RlcyA9IFtdO1xufVxuXG5SZWdpc3RyYXRpb24ucHJvdG90eXBlID0ge1xuICBlbnF1ZXVlOiBmdW5jdGlvbihyZWNvcmQpIHtcbiAgICB2YXIgcmVjb3JkcyA9IHRoaXMub2JzZXJ2ZXIucmVjb3Jkc187XG4gICAgdmFyIGxlbmd0aCA9IHJlY29yZHMubGVuZ3RoO1xuXG4gICAgLy8gVGhlcmUgYXJlIGNhc2VzIHdoZXJlIHdlIHJlcGxhY2UgdGhlIGxhc3QgcmVjb3JkIHdpdGggdGhlIG5ldyByZWNvcmQuXG4gICAgLy8gRm9yIGV4YW1wbGUgaWYgdGhlIHJlY29yZCByZXByZXNlbnRzIHRoZSBzYW1lIG11dGF0aW9uIHdlIG5lZWQgdG8gdXNlXG4gICAgLy8gdGhlIG9uZSB3aXRoIHRoZSBvbGRWYWx1ZS4gSWYgd2UgZ2V0IHNhbWUgcmVjb3JkICh0aGlzIGNhbiBoYXBwZW4gYXMgd2VcbiAgICAvLyB3YWxrIHVwIHRoZSB0cmVlKSB3ZSBpZ25vcmUgdGhlIG5ldyByZWNvcmQuXG4gICAgaWYgKHJlY29yZHMubGVuZ3RoID4gMCkge1xuICAgICAgdmFyIGxhc3RSZWNvcmQgPSByZWNvcmRzW2xlbmd0aCAtIDFdO1xuICAgICAgdmFyIHJlY29yZFRvUmVwbGFjZUxhc3QgPSBzZWxlY3RSZWNvcmQobGFzdFJlY29yZCwgcmVjb3JkKTtcbiAgICAgIGlmIChyZWNvcmRUb1JlcGxhY2VMYXN0KSB7XG4gICAgICAgIHJlY29yZHNbbGVuZ3RoIC0gMV0gPSByZWNvcmRUb1JlcGxhY2VMYXN0O1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHNjaGVkdWxlQ2FsbGJhY2sodGhpcy5vYnNlcnZlcik7XG4gICAgfVxuXG4gICAgcmVjb3Jkc1tsZW5ndGhdID0gcmVjb3JkO1xuICB9LFxuXG4gIGFkZExpc3RlbmVyczogZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5hZGRMaXN0ZW5lcnNfKHRoaXMudGFyZ2V0KTtcbiAgfSxcblxuICBhZGRMaXN0ZW5lcnNfOiBmdW5jdGlvbihub2RlKSB7XG4gICAgdmFyIG9wdGlvbnMgPSB0aGlzLm9wdGlvbnM7XG4gICAgaWYgKG9wdGlvbnMuYXR0cmlidXRlcylcbiAgICAgIG5vZGUuYWRkRXZlbnRMaXN0ZW5lcignRE9NQXR0ck1vZGlmaWVkJywgdGhpcywgdHJ1ZSk7XG5cbiAgICBpZiAob3B0aW9ucy5jaGFyYWN0ZXJEYXRhKVxuICAgICAgbm9kZS5hZGRFdmVudExpc3RlbmVyKCdET01DaGFyYWN0ZXJEYXRhTW9kaWZpZWQnLCB0aGlzLCB0cnVlKTtcblxuICAgIGlmIChvcHRpb25zLmNoaWxkTGlzdClcbiAgICAgIG5vZGUuYWRkRXZlbnRMaXN0ZW5lcignRE9NTm9kZUluc2VydGVkJywgdGhpcywgdHJ1ZSk7XG5cbiAgICBpZiAob3B0aW9ucy5jaGlsZExpc3QgfHwgb3B0aW9ucy5zdWJ0cmVlKVxuICAgICAgbm9kZS5hZGRFdmVudExpc3RlbmVyKCdET01Ob2RlUmVtb3ZlZCcsIHRoaXMsIHRydWUpO1xuICB9LFxuXG4gIHJlbW92ZUxpc3RlbmVyczogZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5yZW1vdmVMaXN0ZW5lcnNfKHRoaXMudGFyZ2V0KTtcbiAgfSxcblxuICByZW1vdmVMaXN0ZW5lcnNfOiBmdW5jdGlvbihub2RlKSB7XG4gICAgdmFyIG9wdGlvbnMgPSB0aGlzLm9wdGlvbnM7XG4gICAgaWYgKG9wdGlvbnMuYXR0cmlidXRlcylcbiAgICAgIG5vZGUucmVtb3ZlRXZlbnRMaXN0ZW5lcignRE9NQXR0ck1vZGlmaWVkJywgdGhpcywgdHJ1ZSk7XG5cbiAgICBpZiAob3B0aW9ucy5jaGFyYWN0ZXJEYXRhKVxuICAgICAgbm9kZS5yZW1vdmVFdmVudExpc3RlbmVyKCdET01DaGFyYWN0ZXJEYXRhTW9kaWZpZWQnLCB0aGlzLCB0cnVlKTtcblxuICAgIGlmIChvcHRpb25zLmNoaWxkTGlzdClcbiAgICAgIG5vZGUucmVtb3ZlRXZlbnRMaXN0ZW5lcignRE9NTm9kZUluc2VydGVkJywgdGhpcywgdHJ1ZSk7XG5cbiAgICBpZiAob3B0aW9ucy5jaGlsZExpc3QgfHwgb3B0aW9ucy5zdWJ0cmVlKVxuICAgICAgbm9kZS5yZW1vdmVFdmVudExpc3RlbmVyKCdET01Ob2RlUmVtb3ZlZCcsIHRoaXMsIHRydWUpO1xuICB9LFxuXG4gIC8qKlxuICAgKiBBZGRzIGEgdHJhbnNpZW50IG9ic2VydmVyIG9uIG5vZGUuIFRoZSB0cmFuc2llbnQgb2JzZXJ2ZXIgZ2V0cyByZW1vdmVkXG4gICAqIG5leHQgdGltZSB3ZSBkZWxpdmVyIHRoZSBjaGFuZ2UgcmVjb3Jkcy5cbiAgICogQHBhcmFtIHtOb2RlfSBub2RlXG4gICAqL1xuICBhZGRUcmFuc2llbnRPYnNlcnZlcjogZnVuY3Rpb24obm9kZSkge1xuICAgIC8vIERvbid0IGFkZCB0cmFuc2llbnQgb2JzZXJ2ZXJzIG9uIHRoZSB0YXJnZXQgaXRzZWxmLiBXZSBhbHJlYWR5IGhhdmUgYWxsXG4gICAgLy8gdGhlIHJlcXVpcmVkIGxpc3RlbmVycyBzZXQgdXAgb24gdGhlIHRhcmdldC5cbiAgICBpZiAobm9kZSA9PT0gdGhpcy50YXJnZXQpXG4gICAgICByZXR1cm47XG5cbiAgICB0aGlzLmFkZExpc3RlbmVyc18obm9kZSk7XG4gICAgdGhpcy50cmFuc2llbnRPYnNlcnZlZE5vZGVzLnB1c2gobm9kZSk7XG4gICAgdmFyIHJlZ2lzdHJhdGlvbnMgPSByZWdpc3RyYXRpb25zVGFibGUuZ2V0KG5vZGUpO1xuICAgIGlmICghcmVnaXN0cmF0aW9ucylcbiAgICAgIHJlZ2lzdHJhdGlvbnNUYWJsZS5zZXQobm9kZSwgcmVnaXN0cmF0aW9ucyA9IFtdKTtcblxuICAgIC8vIFdlIGtub3cgdGhhdCByZWdpc3RyYXRpb25zIGRvZXMgbm90IGNvbnRhaW4gdGhpcyBiZWNhdXNlIHdlIGFscmVhZHlcbiAgICAvLyBjaGVja2VkIGlmIG5vZGUgPT09IHRoaXMudGFyZ2V0LlxuICAgIHJlZ2lzdHJhdGlvbnMucHVzaCh0aGlzKTtcbiAgfSxcblxuICByZW1vdmVUcmFuc2llbnRPYnNlcnZlcnM6IGZ1bmN0aW9uKCkge1xuICAgIHZhciB0cmFuc2llbnRPYnNlcnZlZE5vZGVzID0gdGhpcy50cmFuc2llbnRPYnNlcnZlZE5vZGVzO1xuICAgIHRoaXMudHJhbnNpZW50T2JzZXJ2ZWROb2RlcyA9IFtdO1xuXG4gICAgdHJhbnNpZW50T2JzZXJ2ZWROb2Rlcy5mb3JFYWNoKGZ1bmN0aW9uKG5vZGUpIHtcbiAgICAgIC8vIFRyYW5zaWVudCBvYnNlcnZlcnMgYXJlIG5ldmVyIGFkZGVkIHRvIHRoZSB0YXJnZXQuXG4gICAgICB0aGlzLnJlbW92ZUxpc3RlbmVyc18obm9kZSk7XG5cbiAgICAgIHZhciByZWdpc3RyYXRpb25zID0gcmVnaXN0cmF0aW9uc1RhYmxlLmdldChub2RlKTtcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcmVnaXN0cmF0aW9ucy5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAocmVnaXN0cmF0aW9uc1tpXSA9PT0gdGhpcykge1xuICAgICAgICAgIHJlZ2lzdHJhdGlvbnMuc3BsaWNlKGksIDEpO1xuICAgICAgICAgIC8vIEVhY2ggbm9kZSBjYW4gb25seSBoYXZlIG9uZSByZWdpc3RlcmVkIG9ic2VydmVyIGFzc29jaWF0ZWQgd2l0aFxuICAgICAgICAgIC8vIHRoaXMgb2JzZXJ2ZXIuXG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LCB0aGlzKTtcbiAgfSxcblxuICBoYW5kbGVFdmVudDogZnVuY3Rpb24oZSkge1xuICAgIC8vIFN0b3AgcHJvcGFnYXRpb24gc2luY2Ugd2UgYXJlIG1hbmFnaW5nIHRoZSBwcm9wYWdhdGlvbiBtYW51YWxseS5cbiAgICAvLyBUaGlzIG1lYW5zIHRoYXQgb3RoZXIgbXV0YXRpb24gZXZlbnRzIG9uIHRoZSBwYWdlIHdpbGwgbm90IHdvcmtcbiAgICAvLyBjb3JyZWN0bHkgYnV0IHRoYXQgaXMgYnkgZGVzaWduLlxuICAgIGUuc3RvcEltbWVkaWF0ZVByb3BhZ2F0aW9uKCk7XG5cbiAgICBzd2l0Y2ggKGUudHlwZSkge1xuICAgICAgY2FzZSAnRE9NQXR0ck1vZGlmaWVkJzpcbiAgICAgICAgLy8gaHR0cDovL2RvbS5zcGVjLndoYXR3Zy5vcmcvI2NvbmNlcHQtbW8tcXVldWUtYXR0cmlidXRlc1xuXG4gICAgICAgIHZhciBuYW1lID0gZS5hdHRyTmFtZTtcbiAgICAgICAgdmFyIG5hbWVzcGFjZSA9IGUucmVsYXRlZE5vZGUubmFtZXNwYWNlVVJJO1xuICAgICAgICB2YXIgdGFyZ2V0ID0gZS50YXJnZXQ7XG5cbiAgICAgICAgLy8gMS5cbiAgICAgICAgdmFyIHJlY29yZCA9IG5ldyBnZXRSZWNvcmQoJ2F0dHJpYnV0ZXMnLCB0YXJnZXQpO1xuICAgICAgICByZWNvcmQuYXR0cmlidXRlTmFtZSA9IG5hbWU7XG4gICAgICAgIHJlY29yZC5hdHRyaWJ1dGVOYW1lc3BhY2UgPSBuYW1lc3BhY2U7XG5cbiAgICAgICAgLy8gMi5cbiAgICAgICAgdmFyIG9sZFZhbHVlID1cbiAgICAgICAgICAgIGUuYXR0ckNoYW5nZSA9PT0gTXV0YXRpb25FdmVudC5BRERJVElPTiA/IG51bGwgOiBlLnByZXZWYWx1ZTtcblxuICAgICAgICBmb3JFYWNoQW5jZXN0b3JBbmRPYnNlcnZlckVucXVldWVSZWNvcmQodGFyZ2V0LCBmdW5jdGlvbihvcHRpb25zKSB7XG4gICAgICAgICAgLy8gMy4xLCA0LjJcbiAgICAgICAgICBpZiAoIW9wdGlvbnMuYXR0cmlidXRlcylcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICAgIC8vIDMuMiwgNC4zXG4gICAgICAgICAgaWYgKG9wdGlvbnMuYXR0cmlidXRlRmlsdGVyICYmIG9wdGlvbnMuYXR0cmlidXRlRmlsdGVyLmxlbmd0aCAmJlxuICAgICAgICAgICAgICBvcHRpb25zLmF0dHJpYnV0ZUZpbHRlci5pbmRleE9mKG5hbWUpID09PSAtMSAmJlxuICAgICAgICAgICAgICBvcHRpb25zLmF0dHJpYnV0ZUZpbHRlci5pbmRleE9mKG5hbWVzcGFjZSkgPT09IC0xKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIDMuMywgNC40XG4gICAgICAgICAgaWYgKG9wdGlvbnMuYXR0cmlidXRlT2xkVmFsdWUpXG4gICAgICAgICAgICByZXR1cm4gZ2V0UmVjb3JkV2l0aE9sZFZhbHVlKG9sZFZhbHVlKTtcblxuICAgICAgICAgIC8vIDMuNCwgNC41XG4gICAgICAgICAgcmV0dXJuIHJlY29yZDtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgYnJlYWs7XG5cbiAgICAgIGNhc2UgJ0RPTUNoYXJhY3RlckRhdGFNb2RpZmllZCc6XG4gICAgICAgIC8vIGh0dHA6Ly9kb20uc3BlYy53aGF0d2cub3JnLyNjb25jZXB0LW1vLXF1ZXVlLWNoYXJhY3RlcmRhdGFcbiAgICAgICAgdmFyIHRhcmdldCA9IGUudGFyZ2V0O1xuXG4gICAgICAgIC8vIDEuXG4gICAgICAgIHZhciByZWNvcmQgPSBnZXRSZWNvcmQoJ2NoYXJhY3RlckRhdGEnLCB0YXJnZXQpO1xuXG4gICAgICAgIC8vIDIuXG4gICAgICAgIHZhciBvbGRWYWx1ZSA9IGUucHJldlZhbHVlO1xuXG5cbiAgICAgICAgZm9yRWFjaEFuY2VzdG9yQW5kT2JzZXJ2ZXJFbnF1ZXVlUmVjb3JkKHRhcmdldCwgZnVuY3Rpb24ob3B0aW9ucykge1xuICAgICAgICAgIC8vIDMuMSwgNC4yXG4gICAgICAgICAgaWYgKCFvcHRpb25zLmNoYXJhY3RlckRhdGEpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgICAvLyAzLjIsIDQuM1xuICAgICAgICAgIGlmIChvcHRpb25zLmNoYXJhY3RlckRhdGFPbGRWYWx1ZSlcbiAgICAgICAgICAgIHJldHVybiBnZXRSZWNvcmRXaXRoT2xkVmFsdWUob2xkVmFsdWUpO1xuXG4gICAgICAgICAgLy8gMy4zLCA0LjRcbiAgICAgICAgICByZXR1cm4gcmVjb3JkO1xuICAgICAgICB9KTtcblxuICAgICAgICBicmVhaztcblxuICAgICAgY2FzZSAnRE9NTm9kZVJlbW92ZWQnOlxuICAgICAgICB0aGlzLmFkZFRyYW5zaWVudE9ic2VydmVyKGUudGFyZ2V0KTtcbiAgICAgICAgLy8gRmFsbCB0aHJvdWdoLlxuICAgICAgY2FzZSAnRE9NTm9kZUluc2VydGVkJzpcbiAgICAgICAgLy8gaHR0cDovL2RvbS5zcGVjLndoYXR3Zy5vcmcvI2NvbmNlcHQtbW8tcXVldWUtY2hpbGRsaXN0XG4gICAgICAgIHZhciB0YXJnZXQgPSBlLnJlbGF0ZWROb2RlO1xuICAgICAgICB2YXIgY2hhbmdlZE5vZGUgPSBlLnRhcmdldDtcbiAgICAgICAgdmFyIGFkZGVkTm9kZXMsIHJlbW92ZWROb2RlcztcbiAgICAgICAgaWYgKGUudHlwZSA9PT0gJ0RPTU5vZGVJbnNlcnRlZCcpIHtcbiAgICAgICAgICBhZGRlZE5vZGVzID0gW2NoYW5nZWROb2RlXTtcbiAgICAgICAgICByZW1vdmVkTm9kZXMgPSBbXTtcbiAgICAgICAgfSBlbHNlIHtcblxuICAgICAgICAgIGFkZGVkTm9kZXMgPSBbXTtcbiAgICAgICAgICByZW1vdmVkTm9kZXMgPSBbY2hhbmdlZE5vZGVdO1xuICAgICAgICB9XG4gICAgICAgIHZhciBwcmV2aW91c1NpYmxpbmcgPSBjaGFuZ2VkTm9kZS5wcmV2aW91c1NpYmxpbmc7XG4gICAgICAgIHZhciBuZXh0U2libGluZyA9IGNoYW5nZWROb2RlLm5leHRTaWJsaW5nO1xuXG4gICAgICAgIC8vIDEuXG4gICAgICAgIHZhciByZWNvcmQgPSBnZXRSZWNvcmQoJ2NoaWxkTGlzdCcsIHRhcmdldCk7XG4gICAgICAgIHJlY29yZC5hZGRlZE5vZGVzID0gYWRkZWROb2RlcztcbiAgICAgICAgcmVjb3JkLnJlbW92ZWROb2RlcyA9IHJlbW92ZWROb2RlcztcbiAgICAgICAgcmVjb3JkLnByZXZpb3VzU2libGluZyA9IHByZXZpb3VzU2libGluZztcbiAgICAgICAgcmVjb3JkLm5leHRTaWJsaW5nID0gbmV4dFNpYmxpbmc7XG5cbiAgICAgICAgZm9yRWFjaEFuY2VzdG9yQW5kT2JzZXJ2ZXJFbnF1ZXVlUmVjb3JkKHRhcmdldCwgZnVuY3Rpb24ob3B0aW9ucykge1xuICAgICAgICAgIC8vIDIuMSwgMy4yXG4gICAgICAgICAgaWYgKCFvcHRpb25zLmNoaWxkTGlzdClcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICAgIC8vIDIuMiwgMy4zXG4gICAgICAgICAgcmV0dXJuIHJlY29yZDtcbiAgICAgICAgfSk7XG5cbiAgICB9XG5cbiAgICBjbGVhclJlY29yZHMoKTtcbiAgfVxufTtcblxuaWYgKCFNdXRhdGlvbk9ic2VydmVyKSB7XG4gIE11dGF0aW9uT2JzZXJ2ZXIgPSBKc011dGF0aW9uT2JzZXJ2ZXI7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gTXV0YXRpb25PYnNlcnZlcjtcbiIsImltcG9ydCB7IFNjb3BlLCBTY29wZUV4ZWN1dG9yLCBFbGVtZW50TWF0Y2hlciwgRXZlbnRNYXRjaGVyLCBTdWJzY3JpcHRpb25FeGVjdXRvciB9IGZyb20gJy4vc2NvcGUnO1xuXG5leHBvcnQgZGVmYXVsdCBEZWNsO1xuXG5leHBvcnQgY2xhc3MgRGVjbCB7XG4gICAgcHJpdmF0ZSBzdGF0aWMgZGVmYXVsdEluc3RhbmNlOiBEZWNsO1xuXG4gICAgc3RhdGljIHNlbGVjdChtYXRjaGVyOiBFbGVtZW50TWF0Y2hlciwgZXhlY3V0b3I6IFNjb3BlRXhlY3V0b3IpOiBTY29wZSB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldERlZmF1bHRJbnN0YW5jZSgpLnNlbGVjdChtYXRjaGVyLCBleGVjdXRvcik7XG4gICAgfVxuXG4gICAgc3RhdGljIG9uKG1hdGNoZXI6IEV2ZW50TWF0Y2hlciwgZXhlY3V0b3I6IFN1YnNjcmlwdGlvbkV4ZWN1dG9yKTogU2NvcGUge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXREZWZhdWx0SW5zdGFuY2UoKS5vbihtYXRjaGVyLCBleGVjdXRvcik7XG4gICAgfVxuXG4gICAgc3RhdGljIGdldERlZmF1bHRJbnN0YW5jZSgpIDogRGVjbCB7XG4gICAgICAgIHJldHVybiB0aGlzLmRlZmF1bHRJbnN0YW5jZSB8fCAodGhpcy5kZWZhdWx0SW5zdGFuY2UgPSBuZXcgRGVjbChkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQpKTtcbiAgICB9XG5cbiAgICBzdGF0aWMgc2V0RGVmYXVsdEluc3RhbmNlKGRlY2w6IERlY2wpIDogRGVjbCB7XG4gICAgICAgIHJldHVybiB0aGlzLmRlZmF1bHRJbnN0YW5jZSA9IGRlY2w7XG4gICAgfVxuXG4gICAgc3RhdGljIHByaXN0aW5lKCk6IHZvaWQge1xuICAgICAgICBpZih0aGlzLmRlZmF1bHRJbnN0YW5jZSkge1xuICAgICAgICAgICAgdGhpcy5kZWZhdWx0SW5zdGFuY2UucHJpc3RpbmUoKTtcbiAgICAgICAgICAgIHRoaXMuZGVmYXVsdEluc3RhbmNlID0gbnVsbDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgc2NvcGU6IFNjb3BlO1xuXG4gICAgY29uc3RydWN0b3Iocm9vdDogRWxlbWVudCkge1xuICAgICAgICB0aGlzLnNjb3BlID0gU2NvcGUuYnVpbGRSb290U2NvcGUocm9vdCk7XG4gICAgfVxuXG4gICAgc2VsZWN0KG1hdGNoZXI6IEVsZW1lbnRNYXRjaGVyLCBleGVjdXRvcjogU2NvcGVFeGVjdXRvcik6IFNjb3BlIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0U2NvcGUoKS5zZWxlY3QobWF0Y2hlciwgZXhlY3V0b3IpO1xuICAgIH1cblxuICAgIG9uKG1hdGNoZXI6IEV2ZW50TWF0Y2hlciwgZXhlY3V0b3I6IFN1YnNjcmlwdGlvbkV4ZWN1dG9yKTogU2NvcGUge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRTY29wZSgpLm9uKG1hdGNoZXIsIGV4ZWN1dG9yKTtcbiAgICB9XG5cbiAgICBnZXRTY29wZSgpOiBTY29wZSB7XG4gICAgICAgIHJldHVybiB0aGlzLnNjb3BlO1xuICAgIH1cblxuICAgIHByaXN0aW5lKCk6IHZvaWQge1xuICAgICAgICB0aGlzLnNjb3BlLnByaXN0aW5lKCk7XG4gICAgfVxufVxuXG4vLyBFeHBvcnQgdG8gYSBnbG9iYWwgZm9yIHRoZSBicm93c2VyICh0aGVyZSAqaGFzKiB0byBiZSBhIGJldHRlciB3YXkgdG8gZG8gdGhpcyEpXG5pZih0eXBlb2Yod2luZG93KSAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAoPGFueT53aW5kb3cpLkRlY2wgPSBEZWNsO1xufVxuXG5leHBvcnQgeyBTY29wZSwgU2NvcGVFeGVjdXRvciwgRWxlbWVudE1hdGNoZXIsIEV2ZW50TWF0Y2hlciwgU3Vic2NyaXB0aW9uRXhlY3V0b3IgfTtcbiIsImV4cG9ydCBkZWZhdWx0IEVsZW1lbnRDb2xsZWN0b3I7XG5cbmV4cG9ydCBpbnRlcmZhY2UgRWxlbWVudFZpc3RvciB7IChlbGVtZW50OiBFbGVtZW50KTogRWxlbWVudE1hdGNoZXIgfCBib29sZWFuIH1cbmV4cG9ydCBkZWNsYXJlIHR5cGUgRWxlbWVudE1hdGNoZXIgPSBzdHJpbmcgfCBOb2RlTGlzdE9mPEVsZW1lbnQ+IHwgRWxlbWVudFtdIHwgRWxlbWVudFZpc3RvcjtcblxuZXhwb3J0IGNsYXNzIEVsZW1lbnRDb2xsZWN0b3Ige1xuICAgIHByaXZhdGUgc3RhdGljIGluc3RhbmNlOiBFbGVtZW50Q29sbGVjdG9yO1xuICAgIFxuICAgIHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IEVMRU1FTlRfTUFUQ0hFUl9UWVBFX0VSUk9SX01FU1NBR0UgPSBcIkRlY2w6IEFuIGBFbGVtZW50TWF0Y2hlcmAgbXVzdCBiZSBhIENTUyBzZWxlY3RvciAoc3RyaW5nKSBvciBhIGZ1bmN0aW9uIHdoaWNoIHRha2VzIGEgbm9kZSB1bmRlciBjb25zaWRlcmF0aW9uIGFuZCByZXR1cm5zIGEgQ1NTIHNlbGVjdG9yIChzdHJpbmcpIHRoYXQgbWF0Y2hlcyBhbGwgbWF0Y2hpbmcgbm9kZXMgaW4gdGhlIHN1YnRyZWUsIGFuIGFycmF5LWxpa2Ugb2JqZWN0IG9mIG1hdGNoaW5nIG5vZGVzIGluIHRoZSBzdWJ0cmVlLCBvciBhIGJvb2xlYW4gdmFsdWUgYXMgdG8gd2hldGhlciB0aGUgbm9kZSBzaG91bGQgYmUgaW5jbHVkZWQgKGluIHRoaXMgY2FzZSwgdGhlIGZ1bmN0aW9uIHdpbGwgYmUgaW52b2tlZCBhZ2FpbiBmb3IgYWxsIGNoaWxkcmVuIG9mIHRoZSBub2RlKS5cIjtcblxuICAgIHN0YXRpYyBpc01hdGNoaW5nRWxlbWVudChyb290RWxlbWVudDogRWxlbWVudCwgZWxlbWVudE1hdGNoZXI6IEVsZW1lbnRNYXRjaGVyKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldEluc3RhbmNlKCkuaXNNYXRjaGluZ0VsZW1lbnQocm9vdEVsZW1lbnQsIGVsZW1lbnRNYXRjaGVyKTtcbiAgICB9XG5cbiAgICBzdGF0aWMgY29sbGVjdE1hdGNoaW5nRWxlbWVudHMocm9vdEVsZW1lbnQ6IEVsZW1lbnQsIGVsZW1lbnRNYXRjaGVyOiBFbGVtZW50TWF0Y2hlcik6IEVsZW1lbnRbXSB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldEluc3RhbmNlKCkuY29sbGVjdE1hdGNoaW5nRWxlbWVudHMocm9vdEVsZW1lbnQsIGVsZW1lbnRNYXRjaGVyKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHN0YXRpYyBnZXRJbnN0YW5jZSgpIDogRWxlbWVudENvbGxlY3RvciB7XG4gICAgICAgIHJldHVybiB0aGlzLmluc3RhbmNlIHx8ICh0aGlzLmluc3RhbmNlID0gbmV3IEVsZW1lbnRDb2xsZWN0b3IoKSk7XG4gICAgfVxuXG4gICAgaXNNYXRjaGluZ0VsZW1lbnQoZWxlbWVudDogRWxlbWVudCwgZWxlbWVudE1hdGNoZXI6IEVsZW1lbnRNYXRjaGVyKTogYm9vbGVhbiB7XG4gICAgICAgIHN3aXRjaCh0eXBlb2YoZWxlbWVudE1hdGNoZXIpKSB7XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoRWxlbWVudENvbGxlY3Rvci5FTEVNRU5UX01BVENIRVJfVFlQRV9FUlJPUl9NRVNTQUdFKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgICAgICAgICAgICAgbGV0IGNzc1NlbGVjdG9yOiBzdHJpbmcgPSA8c3RyaW5nPmVsZW1lbnRNYXRjaGVyO1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmlzTWF0Y2hpbmdFbGVtZW50RnJvbUNzc1NlbGVjdG9yKGVsZW1lbnQsIGNzc1NlbGVjdG9yKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgICAgICAgICAgICBsZXQgb2JqZWN0ID0gPE9iamVjdD5lbGVtZW50TWF0Y2hlcjtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5pc01hdGNoaW5nRWxlbWVudEZyb21PYmplY3QoZWxlbWVudCwgb2JqZWN0KTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIGNhc2UgJ2Z1bmN0aW9uJzpcbiAgICAgICAgICAgICAgICBsZXQgZWxlbWVudFZpc3RvciA9IDxFbGVtZW50VmlzdG9yPmVsZW1lbnRNYXRjaGVyO1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmlzTWF0Y2hpbmdFbGVtZW50RnJvbUVsZW1lbnRWaXN0b3IoZWxlbWVudCwgZWxlbWVudFZpc3Rvcik7ICAgICAgIFxuICAgICAgICB9XG4gICAgfVxuXG4gICAgY29sbGVjdE1hdGNoaW5nRWxlbWVudHMoZWxlbWVudDogRWxlbWVudCwgZWxlbWVudE1hdGNoZXI6IEVsZW1lbnRNYXRjaGVyKTogRWxlbWVudFtdIHtcbiAgICAgICAgc3dpdGNoKHR5cGVvZihlbGVtZW50TWF0Y2hlcikpIHtcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihFbGVtZW50Q29sbGVjdG9yLkVMRU1FTlRfTUFUQ0hFUl9UWVBFX0VSUk9SX01FU1NBR0UpO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgICAgICAgICAgICBsZXQgY3NzU2VsZWN0b3I6IHN0cmluZyA9IDxzdHJpbmc+ZWxlbWVudE1hdGNoZXI7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuY29sbGVjdE1hdGNoaW5nRWxlbWVudHNGcm9tQ3NzU2VsZWN0b3IoZWxlbWVudCwgY3NzU2VsZWN0b3IpO1xuXG4gICAgICAgICAgICBjYXNlICdvYmplY3QnOlxuICAgICAgICAgICAgICAgIGxldCBvYmplY3QgPSA8T2JqZWN0PmVsZW1lbnRNYXRjaGVyO1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmNvbGxlY3RNYXRjaGluZ0VsZW1lbnRzRnJvbU9iamVjdChlbGVtZW50LCBvYmplY3QpO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgY2FzZSAnZnVuY3Rpb24nOlxuICAgICAgICAgICAgICAgIGxldCBlbGVtZW50VmlzdG9yID0gPEVsZW1lbnRWaXN0b3I+ZWxlbWVudE1hdGNoZXI7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuY29sbGVjdE1hdGNoaW5nRWxlbWVudHNGcm9tRWxlbWVudFZpc3RvcihlbGVtZW50LCBlbGVtZW50VmlzdG9yKTsgICAgICAgXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGlzTWF0Y2hpbmdFbGVtZW50RnJvbUNzc1NlbGVjdG9yKGVsZW1lbnQ6IEVsZW1lbnQsIGNzc1NlbGVjdG9yOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICAgICAgaWYodHlwZW9mKGVsZW1lbnQubWF0Y2hlcykgPT09ICdmdW5jdGlvbicpIHsgLy8gdGFrZSBhIHNob3J0Y3V0IGluIG1vZGVybiBicm93c2Vyc1xuICAgICAgICAgICAgcmV0dXJuIGVsZW1lbnQubWF0Y2hlcyhjc3NTZWxlY3Rvcik7XG4gICAgICAgIH1lbHNle1xuICAgICAgICAgICAgcmV0dXJuIGlzTWVtYmVyT2ZBcnJheUxpa2UoZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbChjc3NTZWxlY3RvciksIGVsZW1lbnQpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBpc01hdGNoaW5nRWxlbWVudEZyb21PYmplY3QoZWxlbWVudDogRWxlbWVudCwgb2JqZWN0OiBPYmplY3QpOiBib29sZWFuIHtcbiAgICAgICAgaWYob2JqZWN0ID09PSBudWxsKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1lbHNle1xuICAgICAgICAgICAgaWYoaXNBcnJheUxpa2Uob2JqZWN0KSkge1xuICAgICAgICAgICAgICAgIGxldCBhcnJheUxpa2UgPSA8QXJyYXlMaWtlPGFueT4+b2JqZWN0O1xuXG4gICAgICAgICAgICAgICAgaWYoYXJyYXlMaWtlLmxlbmd0aCA9PT0gMCB8fCBhcnJheUxpa2VbMF0gaW5zdGFuY2VvZiBFbGVtZW50KSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBpc01lbWJlck9mQXJyYXlMaWtlKGFycmF5TGlrZSwgZWxlbWVudCk7ICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIH1lbHNle1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKEVsZW1lbnRDb2xsZWN0b3IuRUxFTUVOVF9NQVRDSEVSX1RZUEVfRVJST1JfTUVTU0FHRSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihFbGVtZW50Q29sbGVjdG9yLkVMRU1FTlRfTUFUQ0hFUl9UWVBFX0VSUk9SX01FU1NBR0UpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBpc01hdGNoaW5nRWxlbWVudEZyb21FbGVtZW50VmlzdG9yKGVsZW1lbnQ6IEVsZW1lbnQsIGVsZW1lbnRWaXN0b3I6IEVsZW1lbnRWaXN0b3IpOiBib29sZWFuIHtcbiAgICAgICAgbGV0IHZpc2l0b3JSZXN1bHQgPSBlbGVtZW50VmlzdG9yKGVsZW1lbnQpO1xuXG4gICAgICAgIGlmKHR5cGVvZih2aXNpdG9yUmVzdWx0KSA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgICAgICBsZXQgaXNNYXRjaCA9IDxib29sZWFuPnZpc2l0b3JSZXN1bHQ7XG4gICAgICAgICAgICByZXR1cm4gaXNNYXRjaDtcbiAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICBsZXQgZWxlbWVudE1hdGNoZXIgPSA8RWxlbWVudE1hdGNoZXI+dmlzaXRvclJlc3VsdDtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmlzTWF0Y2hpbmdFbGVtZW50KGVsZW1lbnQsIGVsZW1lbnRNYXRjaGVyKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgY29sbGVjdE1hdGNoaW5nRWxlbWVudHNGcm9tQ3NzU2VsZWN0b3IoZWxlbWVudDogRWxlbWVudCwgY3NzU2VsZWN0b3I6IHN0cmluZyk6IEVsZW1lbnRbXSB7XG4gICAgICAgIHJldHVybiB0b0FycmF5PEVsZW1lbnQ+KGVsZW1lbnQucXVlcnlTZWxlY3RvckFsbChjc3NTZWxlY3RvcikpO1xuICAgIH1cblxuICAgIHByaXZhdGUgY29sbGVjdE1hdGNoaW5nRWxlbWVudHNGcm9tT2JqZWN0KGVsZW1lbnQ6IEVsZW1lbnQsIG9iamVjdDogT2JqZWN0KTogRWxlbWVudFtdIHtcbiAgICAgICAgaWYob2JqZWN0ID09PSBudWxsKSB7XG4gICAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgIH1lbHNle1xuICAgICAgICAgICAgaWYoaXNBcnJheUxpa2Uob2JqZWN0KSkge1xuICAgICAgICAgICAgICAgIGxldCBhcnJheUxpa2UgPSA8QXJyYXlMaWtlPGFueT4+b2JqZWN0O1xuXG4gICAgICAgICAgICAgICAgaWYoYXJyYXlMaWtlLmxlbmd0aCA9PT0gMCB8fCBhcnJheUxpa2VbMF0gaW5zdGFuY2VvZiBFbGVtZW50KSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0b0FycmF5PEVsZW1lbnQ+KGFycmF5TGlrZSk7ICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIH1lbHNle1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKEVsZW1lbnRDb2xsZWN0b3IuRUxFTUVOVF9NQVRDSEVSX1RZUEVfRVJST1JfTUVTU0FHRSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihFbGVtZW50Q29sbGVjdG9yLkVMRU1FTlRfTUFUQ0hFUl9UWVBFX0VSUk9SX01FU1NBR0UpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBjb2xsZWN0TWF0Y2hpbmdFbGVtZW50c0Zyb21FbGVtZW50VmlzdG9yKGVsZW1lbnQ6IEVsZW1lbnQsIGVsZW1lbnRWaXN0b3I6IEVsZW1lbnRWaXN0b3IpOiBFbGVtZW50W10ge1xuICAgICAgICBsZXQgZWxlbWVudHM6IEVsZW1lbnRbXSA9IFtdO1xuXG4gICAgICAgIC8vIEknbSBmaWJiaW5nIHRvIHRoZSBjb21waWxlciBoZXJlLiBgZWxlbWVudC5jaGlsZHJlbmAgaXMgYSBgTm9kZUxpc3RPZjxFbGVtZW50PmAsXG4gICAgICAgIC8vIHdoaWNoIGRvZXMgbm90IGhhdmUgYSBjb21wYXRhYmxlIGludGVyZmFjZSB3aXRoIGBBcnJheTxFbGVtZW50PmA7IGhvd2V2ZXIsIHRoZVxuICAgICAgICAvLyBnZW5lcmF0ZWQgY29kZSBzdGlsbCB3b3JrcyBiZWNhdXNlIGl0IGRvZXNuJ3QgYWN0dWFsbHkgdXNlIHZlcnkgbXVjaCBvZiB0aGUgXG4gICAgICAgIC8vIGBBcnJheWAgaW50ZXJhY2UgKGl0IHJlYWxseSBvbmx5IGFzc3VtZXMgYSBudW1iZXJpYyBsZW5ndGggcHJvcGVydHkgYW5kIGtleXMgZm9yXG4gICAgICAgIC8vIDAuLi5sZW5ndGgpLiBDYXN0aW5nIHRvIGBhbnlgIGhlcmUgZGVzdHJveXMgdGhhdCB0eXBlIGluZm9ybWF0aW9uLCBzbyB0aGUgXG4gICAgICAgIC8vIGNvbXBpbGVyIGNhbid0IHRlbGwgdGhlcmUgaXMgYW4gaXNzdWUgYW5kIGFsbG93cyBpdCB3aXRob3V0IGFuIGVycm9yLlxuICAgICAgICBmb3IobGV0IGNoaWxkIG9mIDxhbnk+ZWxlbWVudC5jaGlsZHJlbikge1xuICAgICAgICAgICAgaWYoY2hpbGQgaW5zdGFuY2VvZiBFbGVtZW50KSB7XG4gICAgICAgICAgICAgICAgbGV0IGVsZW1lbnQ6IEVsZW1lbnQgPSBjaGlsZDtcbiAgICAgICAgICAgICAgICBsZXQgdmlzaXRvclJlc3VsdCA9IGVsZW1lbnRWaXN0b3IoZWxlbWVudCk7XG5cbiAgICAgICAgICAgICAgICBpZih0eXBlb2YodmlzaXRvclJlc3VsdCkgPT09ICdib29sZWFuJykge1xuICAgICAgICAgICAgICAgICAgICBsZXQgaXNNYXRjaCA9IDxib29sZWFuPnZpc2l0b3JSZXN1bHQ7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYoaXNNYXRjaCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZWxlbWVudHMucHVzaChlbGVtZW50KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1lbHNle1xuICAgICAgICAgICAgICAgICAgICBlbGVtZW50cy5wdXNoKC4uLnRoaXMuY29sbGVjdE1hdGNoaW5nRWxlbWVudHMoZWxlbWVudCwgdmlzaXRvclJlc3VsdCkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBlbGVtZW50cztcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGlzQXJyYXlMaWtlKHZhbHVlOiBhbnkpIHtcbiAgICByZXR1cm4gdHlwZW9mKHZhbHVlKSA9PT0gJ29iamVjdCcgJiYgdHlwZW9mKHZhbHVlLmxlbmd0aCkgPT09ICdudW1iZXInO1xufVxuXG5mdW5jdGlvbiB0b0FycmF5PFQ+KGFycmF5TGlrZTogQXJyYXlMaWtlPFQ+KTogQXJyYXk8VD4ge1xuICAgIGlmKGlzQXJyYXlMaWtlKGFycmF5TGlrZSkpIHtcbiAgICAgICAgcmV0dXJuIEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFycmF5TGlrZSwgMCk7XG4gICAgfWVsc2V7XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0V4cGVjdGVkIEFycmF5TGlrZScpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gaXNNZW1iZXJPZkFycmF5TGlrZShoYXlzdGFjazogQXJyYXlMaWtlPGFueT4sICBuZWVkbGU6IGFueSkge1xuICAgIHJldHVybiBBcnJheS5wcm90b3R5cGUuaW5kZXhPZi5jYWxsKGhheXN0YWNrLCBuZWVkbGUpICE9PSAtMTtcbn1cbiIsImltcG9ydCB7IFN1YnNjcmlwdGlvbiwgU3Vic2NyaXB0aW9uRXhlY3V0b3IgfSBmcm9tICcuL3N1YnNjcmlwdGlvbnMvc3Vic2NyaXB0aW9uJztcbmltcG9ydCB7IFRyaXZpYWxTdWJzY3JpcHRpb24gfSBmcm9tICcuL3N1YnNjcmlwdGlvbnMvdHJpdmlhbF9zdWJzY3JpcHRpb24nO1xuaW1wb3J0IHsgTWF0Y2hpbmdFbGVtZW50c1N1YnNjcmlwdGlvbiwgTWF0Y2hpbmdFbGVtZW50c0NoYW5nZWRFdmVudCB9IGZyb20gJy4vc3Vic2NyaXB0aW9ucy9tYXRjaGluZ19lbGVtZW50c19zdWJzY3JpcHRpb24nO1xuaW1wb3J0IHsgRWxlbWVudE1hdGNoZXNTdWJzY3JpcHRpb24sIEVsZW1lbnRNYXRjaGVzQ2hhbmdlZEV2ZW50LCBFbGVtZW50TWF0Y2hlciB9IGZyb20gJy4vc3Vic2NyaXB0aW9ucy9lbGVtZW50X21hdGNoZXNfc3Vic2NyaXB0aW9uJztcbmltcG9ydCB7IEV2ZW50U3Vic2NyaXB0aW9uLCBFdmVudE1hdGNoZXIgfSBmcm9tICcuL3N1YnNjcmlwdGlvbnMvZXZlbnRfc3Vic2NyaXB0aW9uJztcblxuZXhwb3J0IGNsYXNzIFNjb3BlIHtcbiAgICBzdGF0aWMgYnVpbGRSb290U2NvcGUoZWxlbWVudDogRWxlbWVudCk6IFNjb3BlIHtcbiAgICAgICAgbGV0IHNjb3BlID0gbmV3IFNjb3BlKGVsZW1lbnQpO1xuXG4gICAgICAgIHNjb3BlLmFjdGl2YXRlKCk7XG5cbiAgICAgICAgcmV0dXJuIHNjb3BlO1xuICAgIH1cblxuICAgIHByaXZhdGUgcmVhZG9ubHkgZWxlbWVudDogRWxlbWVudDtcbiAgICBwcml2YXRlIGlzQWN0aXZhdGVkOiBib29sZWFuID0gZmFsc2U7XG4gICAgcHJpdmF0ZSBzdWJzY3JpcHRpb25zOiBTdWJzY3JpcHRpb25bXSA9IFtdO1xuICAgIHByaXZhdGUgY2hpbGRyZW46IFNjb3BlW10gPSBbXTtcblxuICAgIGNvbnN0cnVjdG9yKGVsZW1lbnQ6IEVsZW1lbnQsIGV4ZWN1dG9yPzogU2NvcGVFeGVjdXRvcikge1xuICAgICAgICB0aGlzLmVsZW1lbnQgPSBlbGVtZW50O1xuXG4gICAgICAgIGlmKGV4ZWN1dG9yKSB7XG4gICAgICAgICAgICBleGVjdXRvci5jYWxsKHRoaXMsIHRoaXMsIHRoaXMuZWxlbWVudCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBnZXRFbGVtZW50KCk6IEVsZW1lbnQge1xuICAgICAgICByZXR1cm4gdGhpcy5lbGVtZW50O1xuICAgIH1cblxuICAgIG1hdGNoKGV4ZWN1dG9yOiBTdWJzY3JpcHRpb25FeGVjdXRvcik6IFNjb3BlIHtcbiAgICAgICAgdGhpcy5hZGRTdWJzY3JpcHRpb24obmV3IFRyaXZpYWxTdWJzY3JpcHRpb24odGhpcy5lbGVtZW50LCB7IGNvbm5lY3RlZDogdHJ1ZSB9LCBleGVjdXRvcikpO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHVubWF0Y2goZXhlY3V0b3I6IFN1YnNjcmlwdGlvbkV4ZWN1dG9yKTogU2NvcGUge1xuICAgICAgICB0aGlzLmFkZFN1YnNjcmlwdGlvbihuZXcgVHJpdmlhbFN1YnNjcmlwdGlvbih0aGlzLmVsZW1lbnQsIHsgZGlzY29ubmVjdGVkOiB0cnVlIH0sIGV4ZWN1dG9yKSk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgc2VsZWN0KG1hdGNoZXI6IEVsZW1lbnRNYXRjaGVyLCBleGVjdXRvcjogU2NvcGVFeGVjdXRvcik6IFNjb3BlIHtcbiAgICAgICAgdGhpcy5hZGRTdWJzY3JpcHRpb24obmV3IE1hdGNoaW5nRWxlbWVudHNTdWJzY3JpcHRpb24odGhpcy5lbGVtZW50LCBtYXRjaGVyLCB0aGlzLmJ1aWxkU2VsZWN0RXhlY3V0b3IoZXhlY3V0b3IpKSk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgd2hlbihtYXRjaGVyOiBFbGVtZW50TWF0Y2hlciwgZXhlY3V0b3I6IFNjb3BlRXhlY3V0b3IpOiBTY29wZSB7XG5cdFx0dGhpcy5hZGRTdWJzY3JpcHRpb24obmV3IEVsZW1lbnRNYXRjaGVzU3Vic2NyaXB0aW9uKHRoaXMuZWxlbWVudCwgbWF0Y2hlciwgdGhpcy5idWlsZFdoZW5FeGVjdXRvcihleGVjdXRvcikpKTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBvbihtYXRjaGVyOiBFdmVudE1hdGNoZXIsIGV4ZWN1dG9yOiBTdWJzY3JpcHRpb25FeGVjdXRvcik6IFNjb3BlIHtcbiAgICAgICAgdGhpcy5hZGRTdWJzY3JpcHRpb24obmV3IEV2ZW50U3Vic2NyaXB0aW9uKHRoaXMuZWxlbWVudCwgbWF0Y2hlciwgZXhlY3V0b3IpKTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvLyBUaGlzIG1ldGhvZCBpcyBmb3IgdGVzdGluZ1xuICAgIHByaXN0aW5lKCk6IHZvaWQge1xuICAgICAgICBmb3IobGV0IHN1YnNjcmlwdGlvbiBvZiB0aGlzLnN1YnNjcmlwdGlvbnMpIHtcbiAgICAgICAgICAgIHN1YnNjcmlwdGlvbi5kaXNjb25uZWN0KCk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHRoaXMuc3Vic2NyaXB0aW9ucy5zcGxpY2UoMCk7XG4gICAgfVxuXG4gICAgcHJvdGVjdGVkIGFjdGl2YXRlKCk6IHZvaWQge1xuICAgICAgICBpZighdGhpcy5pc0FjdGl2YXRlZCkge1xuICAgICAgICAgICAgdGhpcy5pc0FjdGl2YXRlZCA9IHRydWU7XG5cbiAgICAgICAgICAgIGZvcihsZXQgc3Vic2NyaXB0aW9uIG9mIHRoaXMuc3Vic2NyaXB0aW9ucykge1xuICAgICAgICAgICAgICAgIHN1YnNjcmlwdGlvbi5jb25uZWN0KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcm90ZWN0ZWQgZGVhY3RpdmF0ZSgpOiB2b2lkIHtcbiAgICAgICAgaWYodGhpcy5pc0FjdGl2YXRlZCkge1xuICAgICAgICAgICAgZm9yKGxldCBzdWJzY3JpcHRpb24gb2YgdGhpcy5zdWJzY3JpcHRpb25zKSB7XG4gICAgICAgICAgICAgICAgc3Vic2NyaXB0aW9uLmRpc2Nvbm5lY3QoKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5pc0FjdGl2YXRlZCA9IGZhbHNlOyAgICAgICAgICAgIFxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhZGRTdWJzY3JpcHRpb24oc3Vic2NyaXB0aW9uOiBTdWJzY3JpcHRpb24pOiB2b2lkIHtcbiAgICAgICAgdGhpcy5zdWJzY3JpcHRpb25zLnB1c2goc3Vic2NyaXB0aW9uKTtcblxuICAgICAgICBpZih0aGlzLmlzQWN0aXZhdGVkKSB7XG4gICAgICAgICAgICBzdWJzY3JpcHRpb24uY29ubmVjdCgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSByZW1vdmVTdWJzY3JpcHRpb24oc3Vic2NyaXB0aW9uOiBTdWJzY3JpcHRpb24pOiB2b2lkIHtcbiAgICAgICAgdmFyIGluZGV4ID0gdGhpcy5zdWJzY3JpcHRpb25zLmluZGV4T2Yoc3Vic2NyaXB0aW9uKTtcblxuICAgICAgICBpZihpbmRleCA+PSAwKSB7XG4gICAgICAgICAgICBzdWJzY3JpcHRpb24uZGlzY29ubmVjdCgpO1xuXG4gICAgICAgICAgICB0aGlzLnN1YnNjcmlwdGlvbnMuc3BsaWNlKGluZGV4LCAxKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYnVpbGRTZWxlY3RFeGVjdXRvcihleGVjdXRvcjogU2NvcGVFeGVjdXRvcik6IFN1YnNjcmlwdGlvbkV4ZWN1dG9yIHtcbiAgICAgICAgbGV0IHNjb3BlczogU2NvcGVbXSA9IFtdO1xuXG4gICAgICAgIHJldHVybiAoZXZlbnQ6IE1hdGNoaW5nRWxlbWVudHNDaGFuZ2VkRXZlbnQsIGVsZW1lbnQ6IEVsZW1lbnQpID0+IHtcbiAgICAgICAgICAgIGZvcihsZXQgZWxlbWVudCBvZiBldmVudC5hZGRlZEVsZW1lbnRzKSB7XG4gICAgICAgICAgICAgICAgbGV0IHNjb3BlID0gbmV3IFNjb3BlKGVsZW1lbnQsIGV4ZWN1dG9yKTtcblxuICAgICAgICAgICAgICAgIHNjb3Blcy5wdXNoKHNjb3BlKTtcdFxuICAgICAgICAgICAgICAgIHNjb3BlLmFjdGl2YXRlKCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZvcihsZXQgZWxlbWVudCBvZiBldmVudC5yZW1vdmVkRWxlbWVudHMpIHtcbiAgICAgICAgICAgICAgICBmb3IobGV0IGluZGV4ID0gMCwgbGVuZ3RoID0gc2NvcGVzLmxlbmd0aCwgc2NvcGUgOiBTY29wZTsgaW5kZXggPCBsZW5ndGg7IGluZGV4KyspIHtcbiAgICAgICAgICAgICAgICAgICAgc2NvcGUgPSBzY29wZXNbaW5kZXhdO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmKHNjb3BlLmVsZW1lbnQgPT09IGVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNjb3BlLmRlYWN0aXZhdGUoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAgICAgc2NvcGVzLnNwbGljZShpbmRleCwgMSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGJ1aWxkV2hlbkV4ZWN1dG9yKGV4ZWN1dG9yOiBTY29wZUV4ZWN1dG9yKTogU3Vic2NyaXB0aW9uRXhlY3V0b3Ige1xuICAgICAgICBsZXQgc2NvcGUgOiBTY29wZSA9IG51bGw7XG5cbiAgICAgICAgcmV0dXJuIChldmVudDogRWxlbWVudE1hdGNoZXNDaGFuZ2VkRXZlbnQsIGVsZW1lbnQ6IEVsZW1lbnQpID0+IHtcbiAgICAgICAgICAgIGlmKGV2ZW50LmlzTWF0Y2hpbmcpIHtcbiAgICAgICAgICAgICAgICBzY29wZSA9IG5ldyBTY29wZSh0aGlzLmVsZW1lbnQsIGV4ZWN1dG9yKTtcbiAgICAgICAgICAgICAgICBzY29wZS5hY3RpdmF0ZSgpO1xuICAgICAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICAgICAgc2NvcGUuZGVhY3RpdmF0ZSgpO1xuICAgICAgICAgICAgICAgIHNjb3BlID0gbnVsbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICB9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2NvcGVFeGVjdXRvciB7IChzY29wZTogU2NvcGUsIGVsZW1lbnQ6IEVsZW1lbnQpOiB2b2lkIH07XG5leHBvcnQgeyBFbGVtZW50TWF0Y2hlciwgRXZlbnRNYXRjaGVyLCBTdWJzY3JpcHRpb25FeGVjdXRvciB9O1xuIiwiaW1wb3J0IHsgU3Vic2NyaXB0aW9uLCBTdWJzY3JpcHRpb25FeGVjdXRvciwgU3Vic2NyaXB0aW9uRXZlbnQgfSBmcm9tICcuL3N1YnNjcmlwdGlvbic7XG5cbmludGVyZmFjZSBDb21tb25Kc1JlcXVpcmUge1xuICAgIChpZDogc3RyaW5nKTogYW55O1xufVxuXG5kZWNsYXJlIHZhciByZXF1aXJlOiBDb21tb25Kc1JlcXVpcmU7XG5sZXQgTXV0YXRpb25PYnNlcnZlciA9IHJlcXVpcmUoJ211dGF0aW9uLW9ic2VydmVyJyk7IC8vIHVzZSBwb2x5ZmlsbFxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQmF0Y2hlZE11dGF0aW9uU3Vic2NyaXB0aW9uIGV4dGVuZHMgU3Vic2NyaXB0aW9uIHtcbiAgICBzdGF0aWMgcmVhZG9ubHkgbXV0YXRpb25PYnNlcnZlckluaXQ6IE11dGF0aW9uT2JzZXJ2ZXJJbml0ID0ge1xuICAgICAgICBjaGlsZExpc3Q6IHRydWUsXG4gICAgICAgIGF0dHJpYnV0ZXM6IHRydWUsXG4gICAgICAgIGNoYXJhY3RlckRhdGE6IHRydWUsXG4gICAgICAgIHN1YnRyZWU6IHRydWVcbiAgICB9O1xuXG4gICAgcHJpdmF0ZSBpc0xpc3RlbmluZyA6IGJvb2xlYW4gPSBmYWxzZTtcbiAgICBwcml2YXRlIGhhbmRsZU11dGF0aW9uVGltZW91dCA6IGFueSA9IG51bGw7XG5cbiAgICBwcml2YXRlIHJlYWRvbmx5IG11dGF0aW9uQ2FsbGJhY2s6IE11dGF0aW9uQ2FsbGJhY2s7XG4gICAgcHJpdmF0ZSByZWFkb25seSBtdXRhdGlvbk9ic2VydmVyOiBNdXRhdGlvbk9ic2VydmVyO1xuXG4gICAgY29uc3RydWN0b3IoZWxlbWVudDogRWxlbWVudCwgZXhlY3V0b3I6IFN1YnNjcmlwdGlvbkV4ZWN1dG9yKSB7XG4gICAgICAgIHN1cGVyKGVsZW1lbnQsIGV4ZWN1dG9yKTtcblxuICAgICAgICB0aGlzLm11dGF0aW9uQ2FsbGJhY2sgPSAoKTogdm9pZCA9PiB7XG4gICAgICAgICAgICB0aGlzLmRlZmVySGFuZGxlTXV0YXRpb25zKCk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLm11dGF0aW9uT2JzZXJ2ZXIgPSBuZXcgTXV0YXRpb25PYnNlcnZlcih0aGlzLm11dGF0aW9uQ2FsbGJhY2spO1xuICAgIH1cblxuICAgIHByb3RlY3RlZCBzdGFydExpc3RlbmluZygpOiB2b2lkIHtcbiAgICAgICAgaWYoIXRoaXMuaXNMaXN0ZW5pbmcpIHtcbiAgICAgICAgICAgIHRoaXMubXV0YXRpb25PYnNlcnZlci5vYnNlcnZlKHRoaXMuZWxlbWVudCwgQmF0Y2hlZE11dGF0aW9uU3Vic2NyaXB0aW9uLm11dGF0aW9uT2JzZXJ2ZXJJbml0KTtcblxuICAgICAgICAgICAgdGhpcy5pc0xpc3RlbmluZyA9IHRydWU7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcm90ZWN0ZWQgc3RvcExpc3RlbmluZygpOiB2b2lkIHtcbiAgICAgICAgaWYodGhpcy5pc0xpc3RlbmluZykge1xuICAgICAgICAgICAgdGhpcy5tdXRhdGlvbk9ic2VydmVyLmRpc2Nvbm5lY3QoKTtcbiAgICAgICAgICAgIHRoaXMuaGFuZGxlTXV0YXRpb25zTm93KCk7XG5cbiAgICAgICAgICAgIHRoaXMuaXNMaXN0ZW5pbmcgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBcbiAgICBwcm90ZWN0ZWQgYWJzdHJhY3QgaGFuZGxlTXV0YXRpb25zKCk6IHZvaWQ7XG5cbiAgICBwcml2YXRlIGRlZmVySGFuZGxlTXV0YXRpb25zKCk6IHZvaWQge1xuICAgICAgICBpZih0aGlzLmhhbmRsZU11dGF0aW9uVGltZW91dCA9PT0gbnVsbCkge1xuICAgICAgICAgICAgdGhpcy5oYW5kbGVNdXRhdGlvblRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHsgXG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5tdXRhdGlvbk9ic2VydmVyLnRha2VSZWNvcmRzKCk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuaGFuZGxlTXV0YXRpb25zKCk7XG4gICAgICAgICAgICAgICAgfWZpbmFsbHl7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuaGFuZGxlTXV0YXRpb25UaW1lb3V0ID0gbnVsbDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LCAwKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgaGFuZGxlTXV0YXRpb25zTm93KCk6IHZvaWQge1xuICAgICAgICBpZih0aGlzLmhhbmRsZU11dGF0aW9uVGltZW91dCAhPT0gbnVsbCkge1xuICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXMuaGFuZGxlTXV0YXRpb25UaW1lb3V0KTtcbiAgICAgICAgICAgIHRoaXMuaGFuZGxlTXV0YXRpb25UaW1lb3V0ID0gbnVsbDtcblxuICAgICAgICAgICAgdGhpcy5oYW5kbGVNdXRhdGlvbnMoKTsgICAgICAgICAgICBcbiAgICAgICAgfVxuICAgIH1cbn1cblxuZXhwb3J0IHsgU3Vic2NyaXB0aW9uLCBTdWJzY3JpcHRpb25FeGVjdXRvciwgU3Vic2NyaXB0aW9uRXZlbnQgfTsiLCJpbXBvcnQgeyBCYXRjaGVkTXV0YXRpb25TdWJzY3JpcHRpb24sIFN1YnNjcmlwdGlvbkV4ZWN1dG9yLCBTdWJzY3JpcHRpb25FdmVudCB9IGZyb20gJy4vYmF0Y2hlZF9tdXRhdGlvbl9zdWJzY3JpcHRpb24nO1xuaW1wb3J0IHsgRWxlbWVudE1hdGNoZXIsIEVsZW1lbnRDb2xsZWN0b3IgfSBmcm9tICcuLi9lbGVtZW50X2NvbGxlY3Rvcic7XG5cbmV4cG9ydCBjbGFzcyBFbGVtZW50TWF0Y2hlc1N1YnNjcmlwdGlvbiBleHRlbmRzIEJhdGNoZWRNdXRhdGlvblN1YnNjcmlwdGlvbiB7XG4gICAgcmVhZG9ubHkgbWF0Y2hlcjogRWxlbWVudE1hdGNoZXI7XG5cbiAgICBwcml2YXRlIGlzQ29ubmVjdGVkOiBib29sZWFuID0gZmFsc2U7XG4gICAgcHJpdmF0ZSBpc01hdGNoaW5nRWxlbWVudDogYm9vbGVhbiA9IGZhbHNlO1xuXG4gICAgY29uc3RydWN0b3IoZWxlbWVudDogRWxlbWVudCwgbWF0Y2hlcjogRWxlbWVudE1hdGNoZXIsIGV4ZWN1dG9yOiBTdWJzY3JpcHRpb25FeGVjdXRvcikge1xuICAgICAgICBzdXBlcihlbGVtZW50LCBleGVjdXRvcik7XG5cbiAgICAgICAgdGhpcy5tYXRjaGVyID0gbWF0Y2hlcjtcbiAgICB9XG5cbiAgICBjb25uZWN0KCk6IHZvaWQge1xuICAgICAgICBpZighdGhpcy5pc0Nvbm5lY3RlZCkge1xuICAgICAgICAgICAgdGhpcy51cGRhdGVJc01hdGNoaW5nRWxlbWVudCh0aGlzLmNvbXB1dGVJc01hdGNoaW5nRWxlbWVudCgpKTtcbiAgICAgICAgICAgIHRoaXMuc3RhcnRMaXN0ZW5pbmcoKTtcblxuICAgICAgICAgICAgdGhpcy5pc0Nvbm5lY3RlZCA9IHRydWU7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBkaXNjb25uZWN0KCk6IHZvaWQge1xuICAgICAgICBpZih0aGlzLmlzQ29ubmVjdGVkKSB7XG4gICAgICAgICAgICB0aGlzLnVwZGF0ZUlzTWF0Y2hpbmdFbGVtZW50KGZhbHNlKTtcbiAgICAgICAgICAgIHRoaXMuc3RvcExpc3RlbmluZygpO1xuXG4gICAgICAgICAgICB0aGlzLmlzQ29ubmVjdGVkID0gZmFsc2U7XG4gICAgICAgIH0gICAgICAgIFxuICAgIH1cblxuICAgIHByb3RlY3RlZCBoYW5kbGVNdXRhdGlvbnMoKTogdm9pZCB7XG4gICAgICAgIHRoaXMudXBkYXRlSXNNYXRjaGluZ0VsZW1lbnQodGhpcy5jb21wdXRlSXNNYXRjaGluZ0VsZW1lbnQoKSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSB1cGRhdGVJc01hdGNoaW5nRWxlbWVudChpc01hdGNoaW5nRWxlbWVudDogYm9vbGVhbik6IHZvaWQge1xuICAgICAgICBsZXQgd2FzTWF0Y2hpbmdFbGVtZW50ID0gdGhpcy5pc01hdGNoaW5nRWxlbWVudDtcbiAgICAgICAgdGhpcy5pc01hdGNoaW5nRWxlbWVudCA9IGlzTWF0Y2hpbmdFbGVtZW50O1xuXG4gICAgICAgIGlmKHdhc01hdGNoaW5nRWxlbWVudCAhPT0gaXNNYXRjaGluZ0VsZW1lbnQpIHtcbiAgICAgICAgICAgIGxldCBldmVudCA9IG5ldyBFbGVtZW50TWF0Y2hlc0NoYW5nZWRFdmVudCh0aGlzLCBpc01hdGNoaW5nRWxlbWVudCk7XG5cbiAgICAgICAgICAgIHRoaXMuZXhlY3V0b3IoZXZlbnQsIHRoaXMuZWxlbWVudCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGNvbXB1dGVJc01hdGNoaW5nRWxlbWVudCgpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIEVsZW1lbnRDb2xsZWN0b3IuaXNNYXRjaGluZ0VsZW1lbnQodGhpcy5lbGVtZW50LCB0aGlzLm1hdGNoZXIpO1xuICAgIH1cbn1cblxuZXhwb3J0IGNsYXNzIEVsZW1lbnRNYXRjaGVzQ2hhbmdlZEV2ZW50IGV4dGVuZHMgU3Vic2NyaXB0aW9uRXZlbnQge1xuICAgIHJlYWRvbmx5IGlzTWF0Y2hpbmc6IGJvb2xlYW47XG5cbiAgICBjb25zdHJ1Y3RvcihlbGVtZW50TWF0Y2hlc1N1YnNjcmlwdGlvbjogRWxlbWVudE1hdGNoZXNTdWJzY3JpcHRpb24sIGlzTWF0Y2hpbmc6IGJvb2xlYW4pIHtcbiAgICAgICAgc3VwZXIoZWxlbWVudE1hdGNoZXNTdWJzY3JpcHRpb24sICdFbGVtZW50TWF0Y2hlc0NoYW5nZWRFdmVudCcpO1xuXG4gICAgICAgIHRoaXMuaXNNYXRjaGluZyA9IGlzTWF0Y2hpbmc7XG4gICAgfVxufVxuXG5leHBvcnQgeyBFbGVtZW50TWF0Y2hlciB9O1xuIiwiaW1wb3J0IHsgU3Vic2NyaXB0aW9uLCBTdWJzY3JpcHRpb25FeGVjdXRvciB9IGZyb20gJy4vc3Vic2NyaXB0aW9uJztcblxuZXhwb3J0IGNsYXNzIEV2ZW50U3Vic2NyaXB0aW9uIGV4dGVuZHMgU3Vic2NyaXB0aW9uIHtcbiAgICByZWFkb25seSBldmVudE1hdGNoZXI6IEV2ZW50TWF0Y2hlcjtcblxuICAgIHByaXZhdGUgaXNDb25uZWN0ZWQgOiBib29sZWFuID0gZmFsc2U7ICAgIFxuICAgIHByaXZhdGUgcmVhZG9ubHkgZXZlbnRMaXN0ZW5lcjogRXZlbnRMaXN0ZW5lcjtcbiAgICBwcml2YXRlIHJlYWRvbmx5IGV2ZW50TmFtZXM6IHN0cmluZ1tdO1xuXG4gICAgY29uc3RydWN0b3IoZWxlbWVudDogRWxlbWVudCwgZXZlbnRNYXRjaGVyOiBFdmVudE1hdGNoZXIsIGV4ZWN1dG9yOiBTdWJzY3JpcHRpb25FeGVjdXRvcikge1xuICAgICAgICBzdXBlcihlbGVtZW50LCBleGVjdXRvcik7XG5cbiAgICAgICAgdGhpcy5ldmVudE1hdGNoZXIgPSBldmVudE1hdGNoZXI7XG4gICAgICAgIHRoaXMuZXZlbnROYW1lcyA9IHRoaXMucGFyc2VFdmVudE1hdGNoZXIodGhpcy5ldmVudE1hdGNoZXIpO1xuXG4gICAgICAgIHRoaXMuZXZlbnRMaXN0ZW5lciA9IChldmVudDogRXZlbnQpOiB2b2lkID0+IHtcbiAgICAgICAgICAgIHRoaXMuaGFuZGxlRXZlbnQoZXZlbnQpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgY29ubmVjdCgpOiB2b2lkIHtcbiAgICAgICAgaWYoIXRoaXMuaXNDb25uZWN0ZWQpIHtcbiAgICAgICAgICAgIHRoaXMuaXNDb25uZWN0ZWQgPSB0cnVlO1xuXG4gICAgICAgICAgICBmb3IobGV0IGV2ZW50TmFtZSBvZiB0aGlzLmV2ZW50TmFtZXMpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihldmVudE5hbWUsIHRoaXMuZXZlbnRMaXN0ZW5lciwgZmFsc2UpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgZGlzY29ubmVjdCgpOiB2b2lkIHtcbiAgICAgICAgaWYodGhpcy5pc0Nvbm5lY3RlZCkge1xuICAgICAgICAgICAgZm9yKGxldCBldmVudE5hbWUgb2YgdGhpcy5ldmVudE5hbWVzKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5lbGVtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoZXZlbnROYW1lLCB0aGlzLmV2ZW50TGlzdGVuZXIsIGZhbHNlKTtcbiAgICAgICAgICAgIH0gICAgICAgICAgICBcblxuICAgICAgICAgICAgdGhpcy5pc0Nvbm5lY3RlZCA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBoYW5kbGVFdmVudChldmVudDogRXZlbnQpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5leGVjdXRvcihldmVudCwgdGhpcy5lbGVtZW50KTsgICAgICAgICBcbiAgICB9XG5cbiAgICBwcml2YXRlIHBhcnNlRXZlbnRNYXRjaGVyKGV2ZW50TWF0Y2hlcjogRXZlbnRNYXRjaGVyKTogc3RyaW5nW10ge1xuICAgICAgICAvLyBUT0RPOiBTdXBwb3J0IGFsbCBvZiB0aGUgalF1ZXJ5IHN0eWxlIGV2ZW50IG9wdGlvbnNcbiAgICAgICAgcmV0dXJuIGV2ZW50TWF0Y2hlci5zcGxpdCgnICcpO1xuICAgIH0gXG59XG5cbmV4cG9ydCBkZWNsYXJlIHR5cGUgRXZlbnRNYXRjaGVyID0gc3RyaW5nO1xuIiwiaW1wb3J0IHsgQmF0Y2hlZE11dGF0aW9uU3Vic2NyaXB0aW9uLCBTdWJzY3JpcHRpb25FeGVjdXRvciwgU3Vic2NyaXB0aW9uRXZlbnQgfSBmcm9tICcuL2JhdGNoZWRfbXV0YXRpb25fc3Vic2NyaXB0aW9uJztcbmltcG9ydCB7IEVsZW1lbnRNYXRjaGVyLCBFbGVtZW50Q29sbGVjdG9yIH0gZnJvbSAnLi4vZWxlbWVudF9jb2xsZWN0b3InO1xuXG5leHBvcnQgY2xhc3MgTWF0Y2hpbmdFbGVtZW50c1N1YnNjcmlwdGlvbiBleHRlbmRzIEJhdGNoZWRNdXRhdGlvblN1YnNjcmlwdGlvbiB7XG4gICAgcmVhZG9ubHkgbWF0Y2hlcjogRWxlbWVudE1hdGNoZXI7XG5cbiAgICBwcml2YXRlIGlzQ29ubmVjdGVkOiBib29sZWFuID0gZmFsc2U7XG4gICAgcHJpdmF0ZSBtYXRjaGluZ0VsZW1lbnRzOiBFbGVtZW50W10gPSBbXTtcblxuICAgIGNvbnN0cnVjdG9yKGVsZW1lbnQ6IEVsZW1lbnQsIG1hdGNoZXI6IEVsZW1lbnRNYXRjaGVyLCBleGVjdXRvcjogU3Vic2NyaXB0aW9uRXhlY3V0b3IpIHtcbiAgICAgICAgc3VwZXIoZWxlbWVudCwgZXhlY3V0b3IpO1xuXG4gICAgICAgIHRoaXMubWF0Y2hlciA9IG1hdGNoZXI7XG4gICAgfVxuXG4gICAgY29ubmVjdCgpOiB2b2lkIHtcbiAgICAgICAgaWYoIXRoaXMuaXNDb25uZWN0ZWQpIHtcbiAgICAgICAgICAgIHRoaXMudXBkYXRlTWF0Y2hpbmdFbGVtZW50cyh0aGlzLmNvbGxlY3RNYXRjaGluZ0VsZW1lbnRzKCkpO1xuICAgICAgICAgICAgdGhpcy5zdGFydExpc3RlbmluZygpO1xuXG4gICAgICAgICAgICB0aGlzLmlzQ29ubmVjdGVkID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGRpc2Nvbm5lY3QoKTogdm9pZCB7XG4gICAgICAgIGlmKHRoaXMuaXNDb25uZWN0ZWQpIHtcbiAgICAgICAgICAgIHRoaXMudXBkYXRlTWF0Y2hpbmdFbGVtZW50cyhbXSk7XG4gICAgICAgICAgICB0aGlzLnN0b3BMaXN0ZW5pbmcoKTtcblxuICAgICAgICAgICAgdGhpcy5pc0Nvbm5lY3RlZCA9IGZhbHNlO1xuICAgICAgICB9ICAgICAgICBcbiAgICB9XG5cbiAgICBwcm90ZWN0ZWQgaGFuZGxlTXV0YXRpb25zKCk6IHZvaWQge1xuICAgICAgICB0aGlzLnVwZGF0ZU1hdGNoaW5nRWxlbWVudHModGhpcy5jb2xsZWN0TWF0Y2hpbmdFbGVtZW50cygpKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHVwZGF0ZU1hdGNoaW5nRWxlbWVudHMobWF0Y2hpbmdFbGVtZW50czogRWxlbWVudFtdKTogdm9pZCB7XG4gICAgICAgIGxldCBwcmV2aW91c2x5TWF0Y2hpbmdFbGVtZW50cyA9IHRoaXMubWF0Y2hpbmdFbGVtZW50cztcblxuICAgICAgICBsZXQgYWRkZWRFbGVtZW50cyA9IGFycmF5U3VidHJhY3QobWF0Y2hpbmdFbGVtZW50cywgcHJldmlvdXNseU1hdGNoaW5nRWxlbWVudHMpO1xuICAgICAgICBsZXQgcmVtb3ZlZEVsZW1lbnRzID0gYXJyYXlTdWJ0cmFjdChwcmV2aW91c2x5TWF0Y2hpbmdFbGVtZW50cywgbWF0Y2hpbmdFbGVtZW50cyk7XG5cbiAgICAgICAgdGhpcy5tYXRjaGluZ0VsZW1lbnRzID0gbWF0Y2hpbmdFbGVtZW50czsgICBcbiAgICAgICAgXG4gICAgICAgIGlmKGFkZGVkRWxlbWVudHMubGVuZ3RoID4gMCB8fCByZW1vdmVkRWxlbWVudHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgbGV0IGV2ZW50ID0gbmV3IE1hdGNoaW5nRWxlbWVudHNDaGFuZ2VkRXZlbnQodGhpcywgYWRkZWRFbGVtZW50cywgcmVtb3ZlZEVsZW1lbnRzKTtcblxuICAgICAgICAgICAgdGhpcy5leGVjdXRvcihldmVudCwgdGhpcy5lbGVtZW50KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgY29sbGVjdE1hdGNoaW5nRWxlbWVudHMoKTogRWxlbWVudFtdIHtcbiAgICAgICAgcmV0dXJuIEVsZW1lbnRDb2xsZWN0b3IuY29sbGVjdE1hdGNoaW5nRWxlbWVudHModGhpcy5lbGVtZW50LCB0aGlzLm1hdGNoZXIpO1xuICAgIH1cbn1cblxuZXhwb3J0IGNsYXNzIE1hdGNoaW5nRWxlbWVudHNDaGFuZ2VkRXZlbnQgZXh0ZW5kcyBTdWJzY3JpcHRpb25FdmVudCB7XG4gICAgcmVhZG9ubHkgYWRkZWRFbGVtZW50czogRWxlbWVudFtdO1xuICAgIHJlYWRvbmx5IHJlbW92ZWRFbGVtZW50czogRWxlbWVudFtdO1xuXG4gICAgY29uc3RydWN0b3IobWF0Y2hpbmdFbGVtZW50c1N1YnNjcmlwdGlvbjogTWF0Y2hpbmdFbGVtZW50c1N1YnNjcmlwdGlvbiwgYWRkZWRFbGVtZW50czogRWxlbWVudFtdLCByZW1vdmVkRWxlbWVudHM6IEVsZW1lbnRbXSkge1xuICAgICAgICBzdXBlcihtYXRjaGluZ0VsZW1lbnRzU3Vic2NyaXB0aW9uLCAnTWF0Y2hpbmdFbGVtZW50c0NoYW5nZWQnKTtcblxuICAgICAgICB0aGlzLmFkZGVkRWxlbWVudHMgPSBhZGRlZEVsZW1lbnRzO1xuICAgICAgICB0aGlzLnJlbW92ZWRFbGVtZW50cyA9IHJlbW92ZWRFbGVtZW50cztcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGFycmF5U3VidHJhY3Q8VD4obWludWVuZDogVFtdLCBzdWJ0cmFoZW5kOiBUW10pOiBUW10ge1xuICAgIGxldCBkaWZmZXJlbmNlOiBUW10gPSBbXTtcblxuICAgIGZvcihsZXQgbWVtYmVyIG9mIG1pbnVlbmQpIHtcbiAgICAgICAgaWYoc3VidHJhaGVuZC5pbmRleE9mKG1lbWJlcikgPT09IC0xKSB7XG4gICAgICAgICAgICBkaWZmZXJlbmNlLnB1c2gobWVtYmVyKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBkaWZmZXJlbmNlO1xufSIsImV4cG9ydCBhYnN0cmFjdCBjbGFzcyBTdWJzY3JpcHRpb24ge1xuICAgIHByb3RlY3RlZCByZWFkb25seSBleGVjdXRvcjogU3Vic2NyaXB0aW9uRXhlY3V0b3I7XG4gICAgcHJvdGVjdGVkIHJlYWRvbmx5IGVsZW1lbnQ6IEVsZW1lbnQ7XG4gICAgXG4gICAgY29uc3RydWN0b3IoZWxlbWVudDogRWxlbWVudCwgZXhlY3V0b3I6IFN1YnNjcmlwdGlvbkV4ZWN1dG9yKSB7XG4gICAgICAgIHRoaXMuZWxlbWVudCA9IGVsZW1lbnQ7XG4gICAgICAgIHRoaXMuZXhlY3V0b3IgPSBleGVjdXRvcjtcbiAgICB9XG5cbiAgICBhYnN0cmFjdCBjb25uZWN0KCkgOiB2b2lkO1xuICAgIGFic3RyYWN0IGRpc2Nvbm5lY3QoKSA6IHZvaWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3Vic2NyaXB0aW9uRXhlY3V0b3IgeyBcbiAgICAoZXZlbnQ6IEV2ZW50IHwgU3Vic2NyaXB0aW9uRXZlbnQsIGVsZW1lbnQ6IEVsZW1lbnQpOiB2b2lkIFxufVxuXG5leHBvcnQgY2xhc3MgU3Vic2NyaXB0aW9uRXZlbnQge1xuICAgIHJlYWRvbmx5IHN1YnNjcmlwdGlvbjogU3Vic2NyaXB0aW9uO1xuICAgIHJlYWRvbmx5IG5hbWU6IHN0cmluZztcblxuICAgIGNvbnN0cnVjdG9yKHN1YnNjcmlwdGlvbjogU3Vic2NyaXB0aW9uLCBuYW1lOiBzdHJpbmcpIHtcbiAgICAgICAgdGhpcy5zdWJzY3JpcHRpb24gPSBzdWJzY3JpcHRpb247XG4gICAgICAgIHRoaXMubmFtZSA9IG5hbWU7XG4gICAgfVxufVxuIiwiaW1wb3J0IHsgU3Vic2NyaXB0aW9uLCBTdWJzY3JpcHRpb25FeGVjdXRvciwgU3Vic2NyaXB0aW9uRXZlbnQgfSBmcm9tICcuL3N1YnNjcmlwdGlvbic7XG5cbmV4cG9ydCBpbnRlcmZhY2UgVHJpdmlhbFN1YnNjcmlwdGlvbkNvbmZpZ3VyYXRpb24ge1xuICAgIGNvbm5lY3RlZD86IGJvb2xlYW4sXG4gICAgZGlzY29ubmVjdGVkPzogYm9vbGVhblxufVxuXG5leHBvcnQgY2xhc3MgRWxlbWVudENvbm5lY3Rpb25DaGFuZ2VkRXZlbnQgZXh0ZW5kcyBTdWJzY3JpcHRpb25FdmVudCB7XG4gICAgcmVhZG9ubHkgZWxlbWVudDogRWxlbWVudDtcbiAgICByZWFkb25seSBpc0Nvbm5lY3RlZDogYm9vbGVhbjtcblxuICAgIGNvbnN0cnVjdG9yKHRyaXZpYWxTdWJzY3JpcHRpb246IFRyaXZpYWxTdWJzY3JpcHRpb24sIGVsZW1lbnQ6IEVsZW1lbnQsIGlzQ29ubmVjdGVkOiBib29sZWFuKSB7XG4gICAgICAgIHN1cGVyKHRyaXZpYWxTdWJzY3JpcHRpb24sICdFbGVtZW50Q29ubmVjdGVkJyk7XG5cbiAgICAgICAgdGhpcy5lbGVtZW50ID0gZWxlbWVudDtcbiAgICAgICAgdGhpcy5pc0Nvbm5lY3RlZCA9IGlzQ29ubmVjdGVkO1xuICAgIH1cbn1cblxuZXhwb3J0IGNsYXNzIFRyaXZpYWxTdWJzY3JpcHRpb24gZXh0ZW5kcyBTdWJzY3JpcHRpb24ge1xuICAgIHByaXZhdGUgaXNDb25uZWN0ZWQ6IGJvb2xlYW4gPSBmYWxzZTtcbiAgICBwcml2YXRlIGNvbmZpZzogVHJpdmlhbFN1YnNjcmlwdGlvbkNvbmZpZ3VyYXRpb247XG5cbiAgICBjb25zdHJ1Y3RvcihlbGVtZW50OiBFbGVtZW50LCBjb25maWc6IFRyaXZpYWxTdWJzY3JpcHRpb25Db25maWd1cmF0aW9uLCBleGVjdXRvcjogU3Vic2NyaXB0aW9uRXhlY3V0b3IpIHtcbiAgICAgICAgc3VwZXIoZWxlbWVudCwgZXhlY3V0b3IpO1xuXG4gICAgICAgIHRoaXMuY29uZmlnID0gY29uZmlnO1xuICAgIH1cblxuICAgIGNvbm5lY3QoKSB7XG4gICAgICAgIGlmKCF0aGlzLmlzQ29ubmVjdGVkKSB7XG4gICAgICAgICAgICB0aGlzLmlzQ29ubmVjdGVkID0gdHJ1ZTtcblxuICAgICAgICAgICAgaWYodGhpcy5jb25maWcuY29ubmVjdGVkKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5leGVjdXRvcih0aGlzLmJ1aWxkRWxlbWVudENvbm5lY3Rpb25DaGFuZ2VkRXZlbnQoKSwgdGhpcy5lbGVtZW50KTsgXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBkaXNjb25uZWN0KCkge1xuICAgICAgICBpZih0aGlzLmlzQ29ubmVjdGVkKSB7XG4gICAgICAgICAgICB0aGlzLmlzQ29ubmVjdGVkID0gZmFsc2U7XG5cbiAgICAgICAgICAgIGlmKHRoaXMuY29uZmlnLmRpc2Nvbm5lY3RlZCkge1xuICAgICAgICAgICAgICAgIHRoaXMuZXhlY3V0b3IodGhpcy5idWlsZEVsZW1lbnRDb25uZWN0aW9uQ2hhbmdlZEV2ZW50KCksIHRoaXMuZWxlbWVudCk7ICAgICBcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICBcbiAgICBwcml2YXRlIGJ1aWxkRWxlbWVudENvbm5lY3Rpb25DaGFuZ2VkRXZlbnQoKTogRWxlbWVudENvbm5lY3Rpb25DaGFuZ2VkRXZlbnQge1xuICAgICAgICByZXR1cm4gbmV3IEVsZW1lbnRDb25uZWN0aW9uQ2hhbmdlZEV2ZW50KHRoaXMsIHRoaXMuZWxlbWVudCwgdGhpcy5pc0Nvbm5lY3RlZCk7XG4gICAgfVxufSJdfQ==
