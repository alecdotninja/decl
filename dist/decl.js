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
            executor.call(this, this);
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
        return function (element, event) {
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
        return function (element, event) {
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
            this.executor(this.element, event_1);
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
        var _this = _super.call(this, 'ElementMatchesChangedEvent') || this;
        _this.elementMatchesSubscription = elementMatchesSubscription;
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
        this.executor(this.element, event);
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
            this.executor(this.element, event_1);
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
        var _this = _super.call(this, 'MatchingElementsChanged') || this;
        _this.matchingElementsSubscription = matchingElementsSubscription;
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
    function SubscriptionEvent(name) {
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
                this.executor(this.element);
            }
        }
    };
    TrivialSubscription.prototype.disconnect = function () {
        if (this.isConnected) {
            this.isConnected = false;
            if (this.config.disconnected) {
                this.executor(this.element);
            }
        }
    };
    return TrivialSubscription;
}(subscription_1.Subscription));
exports.TrivialSubscription = TrivialSubscription;

},{"./subscription":9}]},{},[2])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvbXV0YXRpb24tb2JzZXJ2ZXIvaW5kZXguanMiLCJzcmMvZGVjbC50cyIsInNyYy9lbGVtZW50X2NvbGxlY3Rvci50cyIsInNyYy9zY29wZS50cyIsInNyYy9zdWJzY3JpcHRpb25zL2JhdGNoZWRfbXV0YXRpb25fc3Vic2NyaXB0aW9uLnRzIiwic3JjL3N1YnNjcmlwdGlvbnMvZWxlbWVudF9tYXRjaGVzX3N1YnNjcmlwdGlvbi50cyIsInNyYy9zdWJzY3JpcHRpb25zL2V2ZW50X3N1YnNjcmlwdGlvbi50cyIsInNyYy9zdWJzY3JpcHRpb25zL21hdGNoaW5nX2VsZW1lbnRzX3N1YnNjcmlwdGlvbi50cyIsInNyYy9zdWJzY3JpcHRpb25zL3N1YnNjcmlwdGlvbi50cyIsInNyYy9zdWJzY3JpcHRpb25zL3RyaXZpYWxfc3Vic2NyaXB0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUN6a0JBLGlDQUFtRztBQTBEMUYsOEJBQUs7QUF4RGQsa0JBQWUsSUFBSSxDQUFDO0FBRXBCO0lBNEJJLGNBQVksSUFBYTtRQUNyQixJQUFJLENBQUMsS0FBSyxHQUFHLGFBQUssQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDNUMsQ0FBQztJQTNCTSxXQUFNLEdBQWIsVUFBYyxPQUF1QixFQUFFLFFBQXVCO1FBQzFELE1BQU0sQ0FB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aWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwidmFyIE11dGF0aW9uT2JzZXJ2ZXIgPSB3aW5kb3cuTXV0YXRpb25PYnNlcnZlclxuICB8fCB3aW5kb3cuV2ViS2l0TXV0YXRpb25PYnNlcnZlclxuICB8fCB3aW5kb3cuTW96TXV0YXRpb25PYnNlcnZlcjtcblxuLypcbiAqIENvcHlyaWdodCAyMDEyIFRoZSBQb2x5bWVyIEF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiBVc2Ugb2YgdGhpcyBzb3VyY2UgY29kZSBpcyBnb3ZlcmVuZWQgYnkgYSBCU0Qtc3R5bGVcbiAqIGxpY2Vuc2UgdGhhdCBjYW4gYmUgZm91bmQgaW4gdGhlIExJQ0VOU0UgZmlsZS5cbiAqL1xuXG52YXIgV2Vha01hcCA9IHdpbmRvdy5XZWFrTWFwO1xuXG5pZiAodHlwZW9mIFdlYWtNYXAgPT09ICd1bmRlZmluZWQnKSB7XG4gIHZhciBkZWZpbmVQcm9wZXJ0eSA9IE9iamVjdC5kZWZpbmVQcm9wZXJ0eTtcbiAgdmFyIGNvdW50ZXIgPSBEYXRlLm5vdygpICUgMWU5O1xuXG4gIFdlYWtNYXAgPSBmdW5jdGlvbigpIHtcbiAgICB0aGlzLm5hbWUgPSAnX19zdCcgKyAoTWF0aC5yYW5kb20oKSAqIDFlOSA+Pj4gMCkgKyAoY291bnRlcisrICsgJ19fJyk7XG4gIH07XG5cbiAgV2Vha01hcC5wcm90b3R5cGUgPSB7XG4gICAgc2V0OiBmdW5jdGlvbihrZXksIHZhbHVlKSB7XG4gICAgICB2YXIgZW50cnkgPSBrZXlbdGhpcy5uYW1lXTtcbiAgICAgIGlmIChlbnRyeSAmJiBlbnRyeVswXSA9PT0ga2V5KVxuICAgICAgICBlbnRyeVsxXSA9IHZhbHVlO1xuICAgICAgZWxzZVxuICAgICAgICBkZWZpbmVQcm9wZXJ0eShrZXksIHRoaXMubmFtZSwge3ZhbHVlOiBba2V5LCB2YWx1ZV0sIHdyaXRhYmxlOiB0cnVlfSk7XG4gICAgICByZXR1cm4gdGhpcztcbiAgICB9LFxuICAgIGdldDogZnVuY3Rpb24oa2V5KSB7XG4gICAgICB2YXIgZW50cnk7XG4gICAgICByZXR1cm4gKGVudHJ5ID0ga2V5W3RoaXMubmFtZV0pICYmIGVudHJ5WzBdID09PSBrZXkgP1xuICAgICAgICAgIGVudHJ5WzFdIDogdW5kZWZpbmVkO1xuICAgIH0sXG4gICAgJ2RlbGV0ZSc6IGZ1bmN0aW9uKGtleSkge1xuICAgICAgdmFyIGVudHJ5ID0ga2V5W3RoaXMubmFtZV07XG4gICAgICBpZiAoIWVudHJ5KSByZXR1cm4gZmFsc2U7XG4gICAgICB2YXIgaGFzVmFsdWUgPSBlbnRyeVswXSA9PT0ga2V5O1xuICAgICAgZW50cnlbMF0gPSBlbnRyeVsxXSA9IHVuZGVmaW5lZDtcbiAgICAgIHJldHVybiBoYXNWYWx1ZTtcbiAgICB9LFxuICAgIGhhczogZnVuY3Rpb24oa2V5KSB7XG4gICAgICB2YXIgZW50cnkgPSBrZXlbdGhpcy5uYW1lXTtcbiAgICAgIGlmICghZW50cnkpIHJldHVybiBmYWxzZTtcbiAgICAgIHJldHVybiBlbnRyeVswXSA9PT0ga2V5O1xuICAgIH1cbiAgfTtcbn1cblxudmFyIHJlZ2lzdHJhdGlvbnNUYWJsZSA9IG5ldyBXZWFrTWFwKCk7XG5cbi8vIFdlIHVzZSBzZXRJbW1lZGlhdGUgb3IgcG9zdE1lc3NhZ2UgZm9yIG91ciBmdXR1cmUgY2FsbGJhY2suXG52YXIgc2V0SW1tZWRpYXRlID0gd2luZG93Lm1zU2V0SW1tZWRpYXRlO1xuXG4vLyBVc2UgcG9zdCBtZXNzYWdlIHRvIGVtdWxhdGUgc2V0SW1tZWRpYXRlLlxuaWYgKCFzZXRJbW1lZGlhdGUpIHtcbiAgdmFyIHNldEltbWVkaWF0ZVF1ZXVlID0gW107XG4gIHZhciBzZW50aW5lbCA9IFN0cmluZyhNYXRoLnJhbmRvbSgpKTtcbiAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ21lc3NhZ2UnLCBmdW5jdGlvbihlKSB7XG4gICAgaWYgKGUuZGF0YSA9PT0gc2VudGluZWwpIHtcbiAgICAgIHZhciBxdWV1ZSA9IHNldEltbWVkaWF0ZVF1ZXVlO1xuICAgICAgc2V0SW1tZWRpYXRlUXVldWUgPSBbXTtcbiAgICAgIHF1ZXVlLmZvckVhY2goZnVuY3Rpb24oZnVuYykge1xuICAgICAgICBmdW5jKCk7XG4gICAgICB9KTtcbiAgICB9XG4gIH0pO1xuICBzZXRJbW1lZGlhdGUgPSBmdW5jdGlvbihmdW5jKSB7XG4gICAgc2V0SW1tZWRpYXRlUXVldWUucHVzaChmdW5jKTtcbiAgICB3aW5kb3cucG9zdE1lc3NhZ2Uoc2VudGluZWwsICcqJyk7XG4gIH07XG59XG5cbi8vIFRoaXMgaXMgdXNlZCB0byBlbnN1cmUgdGhhdCB3ZSBuZXZlciBzY2hlZHVsZSAyIGNhbGxhcyB0byBzZXRJbW1lZGlhdGVcbnZhciBpc1NjaGVkdWxlZCA9IGZhbHNlO1xuXG4vLyBLZWVwIHRyYWNrIG9mIG9ic2VydmVycyB0aGF0IG5lZWRzIHRvIGJlIG5vdGlmaWVkIG5leHQgdGltZS5cbnZhciBzY2hlZHVsZWRPYnNlcnZlcnMgPSBbXTtcblxuLyoqXG4gKiBTY2hlZHVsZXMgfGRpc3BhdGNoQ2FsbGJhY2t8IHRvIGJlIGNhbGxlZCBpbiB0aGUgZnV0dXJlLlxuICogQHBhcmFtIHtNdXRhdGlvbk9ic2VydmVyfSBvYnNlcnZlclxuICovXG5mdW5jdGlvbiBzY2hlZHVsZUNhbGxiYWNrKG9ic2VydmVyKSB7XG4gIHNjaGVkdWxlZE9ic2VydmVycy5wdXNoKG9ic2VydmVyKTtcbiAgaWYgKCFpc1NjaGVkdWxlZCkge1xuICAgIGlzU2NoZWR1bGVkID0gdHJ1ZTtcbiAgICBzZXRJbW1lZGlhdGUoZGlzcGF0Y2hDYWxsYmFja3MpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHdyYXBJZk5lZWRlZChub2RlKSB7XG4gIHJldHVybiB3aW5kb3cuU2hhZG93RE9NUG9seWZpbGwgJiZcbiAgICAgIHdpbmRvdy5TaGFkb3dET01Qb2x5ZmlsbC53cmFwSWZOZWVkZWQobm9kZSkgfHxcbiAgICAgIG5vZGU7XG59XG5cbmZ1bmN0aW9uIGRpc3BhdGNoQ2FsbGJhY2tzKCkge1xuICAvLyBodHRwOi8vZG9tLnNwZWMud2hhdHdnLm9yZy8jbXV0YXRpb24tb2JzZXJ2ZXJzXG5cbiAgaXNTY2hlZHVsZWQgPSBmYWxzZTsgLy8gVXNlZCB0byBhbGxvdyBhIG5ldyBzZXRJbW1lZGlhdGUgY2FsbCBhYm92ZS5cblxuICB2YXIgb2JzZXJ2ZXJzID0gc2NoZWR1bGVkT2JzZXJ2ZXJzO1xuICBzY2hlZHVsZWRPYnNlcnZlcnMgPSBbXTtcbiAgLy8gU29ydCBvYnNlcnZlcnMgYmFzZWQgb24gdGhlaXIgY3JlYXRpb24gVUlEIChpbmNyZW1lbnRhbCkuXG4gIG9ic2VydmVycy5zb3J0KGZ1bmN0aW9uKG8xLCBvMikge1xuICAgIHJldHVybiBvMS51aWRfIC0gbzIudWlkXztcbiAgfSk7XG5cbiAgdmFyIGFueU5vbkVtcHR5ID0gZmFsc2U7XG4gIG9ic2VydmVycy5mb3JFYWNoKGZ1bmN0aW9uKG9ic2VydmVyKSB7XG5cbiAgICAvLyAyLjEsIDIuMlxuICAgIHZhciBxdWV1ZSA9IG9ic2VydmVyLnRha2VSZWNvcmRzKCk7XG4gICAgLy8gMi4zLiBSZW1vdmUgYWxsIHRyYW5zaWVudCByZWdpc3RlcmVkIG9ic2VydmVycyB3aG9zZSBvYnNlcnZlciBpcyBtby5cbiAgICByZW1vdmVUcmFuc2llbnRPYnNlcnZlcnNGb3Iob2JzZXJ2ZXIpO1xuXG4gICAgLy8gMi40XG4gICAgaWYgKHF1ZXVlLmxlbmd0aCkge1xuICAgICAgb2JzZXJ2ZXIuY2FsbGJhY2tfKHF1ZXVlLCBvYnNlcnZlcik7XG4gICAgICBhbnlOb25FbXB0eSA9IHRydWU7XG4gICAgfVxuICB9KTtcblxuICAvLyAzLlxuICBpZiAoYW55Tm9uRW1wdHkpXG4gICAgZGlzcGF0Y2hDYWxsYmFja3MoKTtcbn1cblxuZnVuY3Rpb24gcmVtb3ZlVHJhbnNpZW50T2JzZXJ2ZXJzRm9yKG9ic2VydmVyKSB7XG4gIG9ic2VydmVyLm5vZGVzXy5mb3JFYWNoKGZ1bmN0aW9uKG5vZGUpIHtcbiAgICB2YXIgcmVnaXN0cmF0aW9ucyA9IHJlZ2lzdHJhdGlvbnNUYWJsZS5nZXQobm9kZSk7XG4gICAgaWYgKCFyZWdpc3RyYXRpb25zKVxuICAgICAgcmV0dXJuO1xuICAgIHJlZ2lzdHJhdGlvbnMuZm9yRWFjaChmdW5jdGlvbihyZWdpc3RyYXRpb24pIHtcbiAgICAgIGlmIChyZWdpc3RyYXRpb24ub2JzZXJ2ZXIgPT09IG9ic2VydmVyKVxuICAgICAgICByZWdpc3RyYXRpb24ucmVtb3ZlVHJhbnNpZW50T2JzZXJ2ZXJzKCk7XG4gICAgfSk7XG4gIH0pO1xufVxuXG4vKipcbiAqIFRoaXMgZnVuY3Rpb24gaXMgdXNlZCBmb3IgdGhlIFwiRm9yIGVhY2ggcmVnaXN0ZXJlZCBvYnNlcnZlciBvYnNlcnZlciAod2l0aFxuICogb2JzZXJ2ZXIncyBvcHRpb25zIGFzIG9wdGlvbnMpIGluIHRhcmdldCdzIGxpc3Qgb2YgcmVnaXN0ZXJlZCBvYnNlcnZlcnMsXG4gKiBydW4gdGhlc2Ugc3Vic3RlcHM6XCIgYW5kIHRoZSBcIkZvciBlYWNoIGFuY2VzdG9yIGFuY2VzdG9yIG9mIHRhcmdldCwgYW5kIGZvclxuICogZWFjaCByZWdpc3RlcmVkIG9ic2VydmVyIG9ic2VydmVyICh3aXRoIG9wdGlvbnMgb3B0aW9ucykgaW4gYW5jZXN0b3IncyBsaXN0XG4gKiBvZiByZWdpc3RlcmVkIG9ic2VydmVycywgcnVuIHRoZXNlIHN1YnN0ZXBzOlwiIHBhcnQgb2YgdGhlIGFsZ29yaXRobXMuIFRoZVxuICogfG9wdGlvbnMuc3VidHJlZXwgaXMgY2hlY2tlZCB0byBlbnN1cmUgdGhhdCB0aGUgY2FsbGJhY2sgaXMgY2FsbGVkXG4gKiBjb3JyZWN0bHkuXG4gKlxuICogQHBhcmFtIHtOb2RlfSB0YXJnZXRcbiAqIEBwYXJhbSB7ZnVuY3Rpb24oTXV0YXRpb25PYnNlcnZlckluaXQpOk11dGF0aW9uUmVjb3JkfSBjYWxsYmFja1xuICovXG5mdW5jdGlvbiBmb3JFYWNoQW5jZXN0b3JBbmRPYnNlcnZlckVucXVldWVSZWNvcmQodGFyZ2V0LCBjYWxsYmFjaykge1xuICBmb3IgKHZhciBub2RlID0gdGFyZ2V0OyBub2RlOyBub2RlID0gbm9kZS5wYXJlbnROb2RlKSB7XG4gICAgdmFyIHJlZ2lzdHJhdGlvbnMgPSByZWdpc3RyYXRpb25zVGFibGUuZ2V0KG5vZGUpO1xuXG4gICAgaWYgKHJlZ2lzdHJhdGlvbnMpIHtcbiAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgcmVnaXN0cmF0aW9ucy5sZW5ndGg7IGorKykge1xuICAgICAgICB2YXIgcmVnaXN0cmF0aW9uID0gcmVnaXN0cmF0aW9uc1tqXTtcbiAgICAgICAgdmFyIG9wdGlvbnMgPSByZWdpc3RyYXRpb24ub3B0aW9ucztcblxuICAgICAgICAvLyBPbmx5IHRhcmdldCBpZ25vcmVzIHN1YnRyZWUuXG4gICAgICAgIGlmIChub2RlICE9PSB0YXJnZXQgJiYgIW9wdGlvbnMuc3VidHJlZSlcbiAgICAgICAgICBjb250aW51ZTtcblxuICAgICAgICB2YXIgcmVjb3JkID0gY2FsbGJhY2sob3B0aW9ucyk7XG4gICAgICAgIGlmIChyZWNvcmQpXG4gICAgICAgICAgcmVnaXN0cmF0aW9uLmVucXVldWUocmVjb3JkKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cblxudmFyIHVpZENvdW50ZXIgPSAwO1xuXG4vKipcbiAqIFRoZSBjbGFzcyB0aGF0IG1hcHMgdG8gdGhlIERPTSBNdXRhdGlvbk9ic2VydmVyIGludGVyZmFjZS5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrLlxuICogQGNvbnN0cnVjdG9yXG4gKi9cbmZ1bmN0aW9uIEpzTXV0YXRpb25PYnNlcnZlcihjYWxsYmFjaykge1xuICB0aGlzLmNhbGxiYWNrXyA9IGNhbGxiYWNrO1xuICB0aGlzLm5vZGVzXyA9IFtdO1xuICB0aGlzLnJlY29yZHNfID0gW107XG4gIHRoaXMudWlkXyA9ICsrdWlkQ291bnRlcjtcbn1cblxuSnNNdXRhdGlvbk9ic2VydmVyLnByb3RvdHlwZSA9IHtcbiAgb2JzZXJ2ZTogZnVuY3Rpb24odGFyZ2V0LCBvcHRpb25zKSB7XG4gICAgdGFyZ2V0ID0gd3JhcElmTmVlZGVkKHRhcmdldCk7XG5cbiAgICAvLyAxLjFcbiAgICBpZiAoIW9wdGlvbnMuY2hpbGRMaXN0ICYmICFvcHRpb25zLmF0dHJpYnV0ZXMgJiYgIW9wdGlvbnMuY2hhcmFjdGVyRGF0YSB8fFxuXG4gICAgICAgIC8vIDEuMlxuICAgICAgICBvcHRpb25zLmF0dHJpYnV0ZU9sZFZhbHVlICYmICFvcHRpb25zLmF0dHJpYnV0ZXMgfHxcblxuICAgICAgICAvLyAxLjNcbiAgICAgICAgb3B0aW9ucy5hdHRyaWJ1dGVGaWx0ZXIgJiYgb3B0aW9ucy5hdHRyaWJ1dGVGaWx0ZXIubGVuZ3RoICYmXG4gICAgICAgICAgICAhb3B0aW9ucy5hdHRyaWJ1dGVzIHx8XG5cbiAgICAgICAgLy8gMS40XG4gICAgICAgIG9wdGlvbnMuY2hhcmFjdGVyRGF0YU9sZFZhbHVlICYmICFvcHRpb25zLmNoYXJhY3RlckRhdGEpIHtcblxuICAgICAgdGhyb3cgbmV3IFN5bnRheEVycm9yKCk7XG4gICAgfVxuXG4gICAgdmFyIHJlZ2lzdHJhdGlvbnMgPSByZWdpc3RyYXRpb25zVGFibGUuZ2V0KHRhcmdldCk7XG4gICAgaWYgKCFyZWdpc3RyYXRpb25zKVxuICAgICAgcmVnaXN0cmF0aW9uc1RhYmxlLnNldCh0YXJnZXQsIHJlZ2lzdHJhdGlvbnMgPSBbXSk7XG5cbiAgICAvLyAyXG4gICAgLy8gSWYgdGFyZ2V0J3MgbGlzdCBvZiByZWdpc3RlcmVkIG9ic2VydmVycyBhbHJlYWR5IGluY2x1ZGVzIGEgcmVnaXN0ZXJlZFxuICAgIC8vIG9ic2VydmVyIGFzc29jaWF0ZWQgd2l0aCB0aGUgY29udGV4dCBvYmplY3QsIHJlcGxhY2UgdGhhdCByZWdpc3RlcmVkXG4gICAgLy8gb2JzZXJ2ZXIncyBvcHRpb25zIHdpdGggb3B0aW9ucy5cbiAgICB2YXIgcmVnaXN0cmF0aW9uO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcmVnaXN0cmF0aW9ucy5sZW5ndGg7IGkrKykge1xuICAgICAgaWYgKHJlZ2lzdHJhdGlvbnNbaV0ub2JzZXJ2ZXIgPT09IHRoaXMpIHtcbiAgICAgICAgcmVnaXN0cmF0aW9uID0gcmVnaXN0cmF0aW9uc1tpXTtcbiAgICAgICAgcmVnaXN0cmF0aW9uLnJlbW92ZUxpc3RlbmVycygpO1xuICAgICAgICByZWdpc3RyYXRpb24ub3B0aW9ucyA9IG9wdGlvbnM7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIDMuXG4gICAgLy8gT3RoZXJ3aXNlLCBhZGQgYSBuZXcgcmVnaXN0ZXJlZCBvYnNlcnZlciB0byB0YXJnZXQncyBsaXN0IG9mIHJlZ2lzdGVyZWRcbiAgICAvLyBvYnNlcnZlcnMgd2l0aCB0aGUgY29udGV4dCBvYmplY3QgYXMgdGhlIG9ic2VydmVyIGFuZCBvcHRpb25zIGFzIHRoZVxuICAgIC8vIG9wdGlvbnMsIGFuZCBhZGQgdGFyZ2V0IHRvIGNvbnRleHQgb2JqZWN0J3MgbGlzdCBvZiBub2RlcyBvbiB3aGljaCBpdFxuICAgIC8vIGlzIHJlZ2lzdGVyZWQuXG4gICAgaWYgKCFyZWdpc3RyYXRpb24pIHtcbiAgICAgIHJlZ2lzdHJhdGlvbiA9IG5ldyBSZWdpc3RyYXRpb24odGhpcywgdGFyZ2V0LCBvcHRpb25zKTtcbiAgICAgIHJlZ2lzdHJhdGlvbnMucHVzaChyZWdpc3RyYXRpb24pO1xuICAgICAgdGhpcy5ub2Rlc18ucHVzaCh0YXJnZXQpO1xuICAgIH1cblxuICAgIHJlZ2lzdHJhdGlvbi5hZGRMaXN0ZW5lcnMoKTtcbiAgfSxcblxuICBkaXNjb25uZWN0OiBmdW5jdGlvbigpIHtcbiAgICB0aGlzLm5vZGVzXy5mb3JFYWNoKGZ1bmN0aW9uKG5vZGUpIHtcbiAgICAgIHZhciByZWdpc3RyYXRpb25zID0gcmVnaXN0cmF0aW9uc1RhYmxlLmdldChub2RlKTtcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcmVnaXN0cmF0aW9ucy5sZW5ndGg7IGkrKykge1xuICAgICAgICB2YXIgcmVnaXN0cmF0aW9uID0gcmVnaXN0cmF0aW9uc1tpXTtcbiAgICAgICAgaWYgKHJlZ2lzdHJhdGlvbi5vYnNlcnZlciA9PT0gdGhpcykge1xuICAgICAgICAgIHJlZ2lzdHJhdGlvbi5yZW1vdmVMaXN0ZW5lcnMoKTtcbiAgICAgICAgICByZWdpc3RyYXRpb25zLnNwbGljZShpLCAxKTtcbiAgICAgICAgICAvLyBFYWNoIG5vZGUgY2FuIG9ubHkgaGF2ZSBvbmUgcmVnaXN0ZXJlZCBvYnNlcnZlciBhc3NvY2lhdGVkIHdpdGhcbiAgICAgICAgICAvLyB0aGlzIG9ic2VydmVyLlxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSwgdGhpcyk7XG4gICAgdGhpcy5yZWNvcmRzXyA9IFtdO1xuICB9LFxuXG4gIHRha2VSZWNvcmRzOiBmdW5jdGlvbigpIHtcbiAgICB2YXIgY29weU9mUmVjb3JkcyA9IHRoaXMucmVjb3Jkc187XG4gICAgdGhpcy5yZWNvcmRzXyA9IFtdO1xuICAgIHJldHVybiBjb3B5T2ZSZWNvcmRzO1xuICB9XG59O1xuXG4vKipcbiAqIEBwYXJhbSB7c3RyaW5nfSB0eXBlXG4gKiBAcGFyYW0ge05vZGV9IHRhcmdldFxuICogQGNvbnN0cnVjdG9yXG4gKi9cbmZ1bmN0aW9uIE11dGF0aW9uUmVjb3JkKHR5cGUsIHRhcmdldCkge1xuICB0aGlzLnR5cGUgPSB0eXBlO1xuICB0aGlzLnRhcmdldCA9IHRhcmdldDtcbiAgdGhpcy5hZGRlZE5vZGVzID0gW107XG4gIHRoaXMucmVtb3ZlZE5vZGVzID0gW107XG4gIHRoaXMucHJldmlvdXNTaWJsaW5nID0gbnVsbDtcbiAgdGhpcy5uZXh0U2libGluZyA9IG51bGw7XG4gIHRoaXMuYXR0cmlidXRlTmFtZSA9IG51bGw7XG4gIHRoaXMuYXR0cmlidXRlTmFtZXNwYWNlID0gbnVsbDtcbiAgdGhpcy5vbGRWYWx1ZSA9IG51bGw7XG59XG5cbmZ1bmN0aW9uIGNvcHlNdXRhdGlvblJlY29yZChvcmlnaW5hbCkge1xuICB2YXIgcmVjb3JkID0gbmV3IE11dGF0aW9uUmVjb3JkKG9yaWdpbmFsLnR5cGUsIG9yaWdpbmFsLnRhcmdldCk7XG4gIHJlY29yZC5hZGRlZE5vZGVzID0gb3JpZ2luYWwuYWRkZWROb2Rlcy5zbGljZSgpO1xuICByZWNvcmQucmVtb3ZlZE5vZGVzID0gb3JpZ2luYWwucmVtb3ZlZE5vZGVzLnNsaWNlKCk7XG4gIHJlY29yZC5wcmV2aW91c1NpYmxpbmcgPSBvcmlnaW5hbC5wcmV2aW91c1NpYmxpbmc7XG4gIHJlY29yZC5uZXh0U2libGluZyA9IG9yaWdpbmFsLm5leHRTaWJsaW5nO1xuICByZWNvcmQuYXR0cmlidXRlTmFtZSA9IG9yaWdpbmFsLmF0dHJpYnV0ZU5hbWU7XG4gIHJlY29yZC5hdHRyaWJ1dGVOYW1lc3BhY2UgPSBvcmlnaW5hbC5hdHRyaWJ1dGVOYW1lc3BhY2U7XG4gIHJlY29yZC5vbGRWYWx1ZSA9IG9yaWdpbmFsLm9sZFZhbHVlO1xuICByZXR1cm4gcmVjb3JkO1xufTtcblxuLy8gV2Uga2VlcCB0cmFjayBvZiB0aGUgdHdvIChwb3NzaWJseSBvbmUpIHJlY29yZHMgdXNlZCBpbiBhIHNpbmdsZSBtdXRhdGlvbi5cbnZhciBjdXJyZW50UmVjb3JkLCByZWNvcmRXaXRoT2xkVmFsdWU7XG5cbi8qKlxuICogQ3JlYXRlcyBhIHJlY29yZCB3aXRob3V0IHxvbGRWYWx1ZXwgYW5kIGNhY2hlcyBpdCBhcyB8Y3VycmVudFJlY29yZHwgZm9yXG4gKiBsYXRlciB1c2UuXG4gKiBAcGFyYW0ge3N0cmluZ30gb2xkVmFsdWVcbiAqIEByZXR1cm4ge011dGF0aW9uUmVjb3JkfVxuICovXG5mdW5jdGlvbiBnZXRSZWNvcmQodHlwZSwgdGFyZ2V0KSB7XG4gIHJldHVybiBjdXJyZW50UmVjb3JkID0gbmV3IE11dGF0aW9uUmVjb3JkKHR5cGUsIHRhcmdldCk7XG59XG5cbi8qKlxuICogR2V0cyBvciBjcmVhdGVzIGEgcmVjb3JkIHdpdGggfG9sZFZhbHVlfCBiYXNlZCBpbiB0aGUgfGN1cnJlbnRSZWNvcmR8XG4gKiBAcGFyYW0ge3N0cmluZ30gb2xkVmFsdWVcbiAqIEByZXR1cm4ge011dGF0aW9uUmVjb3JkfVxuICovXG5mdW5jdGlvbiBnZXRSZWNvcmRXaXRoT2xkVmFsdWUob2xkVmFsdWUpIHtcbiAgaWYgKHJlY29yZFdpdGhPbGRWYWx1ZSlcbiAgICByZXR1cm4gcmVjb3JkV2l0aE9sZFZhbHVlO1xuICByZWNvcmRXaXRoT2xkVmFsdWUgPSBjb3B5TXV0YXRpb25SZWNvcmQoY3VycmVudFJlY29yZCk7XG4gIHJlY29yZFdpdGhPbGRWYWx1ZS5vbGRWYWx1ZSA9IG9sZFZhbHVlO1xuICByZXR1cm4gcmVjb3JkV2l0aE9sZFZhbHVlO1xufVxuXG5mdW5jdGlvbiBjbGVhclJlY29yZHMoKSB7XG4gIGN1cnJlbnRSZWNvcmQgPSByZWNvcmRXaXRoT2xkVmFsdWUgPSB1bmRlZmluZWQ7XG59XG5cbi8qKlxuICogQHBhcmFtIHtNdXRhdGlvblJlY29yZH0gcmVjb3JkXG4gKiBAcmV0dXJuIHtib29sZWFufSBXaGV0aGVyIHRoZSByZWNvcmQgcmVwcmVzZW50cyBhIHJlY29yZCBmcm9tIHRoZSBjdXJyZW50XG4gKiBtdXRhdGlvbiBldmVudC5cbiAqL1xuZnVuY3Rpb24gcmVjb3JkUmVwcmVzZW50c0N1cnJlbnRNdXRhdGlvbihyZWNvcmQpIHtcbiAgcmV0dXJuIHJlY29yZCA9PT0gcmVjb3JkV2l0aE9sZFZhbHVlIHx8IHJlY29yZCA9PT0gY3VycmVudFJlY29yZDtcbn1cblxuLyoqXG4gKiBTZWxlY3RzIHdoaWNoIHJlY29yZCwgaWYgYW55LCB0byByZXBsYWNlIHRoZSBsYXN0IHJlY29yZCBpbiB0aGUgcXVldWUuXG4gKiBUaGlzIHJldHVybnMgfG51bGx8IGlmIG5vIHJlY29yZCBzaG91bGQgYmUgcmVwbGFjZWQuXG4gKlxuICogQHBhcmFtIHtNdXRhdGlvblJlY29yZH0gbGFzdFJlY29yZFxuICogQHBhcmFtIHtNdXRhdGlvblJlY29yZH0gbmV3UmVjb3JkXG4gKiBAcGFyYW0ge011dGF0aW9uUmVjb3JkfVxuICovXG5mdW5jdGlvbiBzZWxlY3RSZWNvcmQobGFzdFJlY29yZCwgbmV3UmVjb3JkKSB7XG4gIGlmIChsYXN0UmVjb3JkID09PSBuZXdSZWNvcmQpXG4gICAgcmV0dXJuIGxhc3RSZWNvcmQ7XG5cbiAgLy8gQ2hlY2sgaWYgdGhlIHRoZSByZWNvcmQgd2UgYXJlIGFkZGluZyByZXByZXNlbnRzIHRoZSBzYW1lIHJlY29yZC4gSWZcbiAgLy8gc28sIHdlIGtlZXAgdGhlIG9uZSB3aXRoIHRoZSBvbGRWYWx1ZSBpbiBpdC5cbiAgaWYgKHJlY29yZFdpdGhPbGRWYWx1ZSAmJiByZWNvcmRSZXByZXNlbnRzQ3VycmVudE11dGF0aW9uKGxhc3RSZWNvcmQpKVxuICAgIHJldHVybiByZWNvcmRXaXRoT2xkVmFsdWU7XG5cbiAgcmV0dXJuIG51bGw7XG59XG5cbi8qKlxuICogQ2xhc3MgdXNlZCB0byByZXByZXNlbnQgYSByZWdpc3RlcmVkIG9ic2VydmVyLlxuICogQHBhcmFtIHtNdXRhdGlvbk9ic2VydmVyfSBvYnNlcnZlclxuICogQHBhcmFtIHtOb2RlfSB0YXJnZXRcbiAqIEBwYXJhbSB7TXV0YXRpb25PYnNlcnZlckluaXR9IG9wdGlvbnNcbiAqIEBjb25zdHJ1Y3RvclxuICovXG5mdW5jdGlvbiBSZWdpc3RyYXRpb24ob2JzZXJ2ZXIsIHRhcmdldCwgb3B0aW9ucykge1xuICB0aGlzLm9ic2VydmVyID0gb2JzZXJ2ZXI7XG4gIHRoaXMudGFyZ2V0ID0gdGFyZ2V0O1xuICB0aGlzLm9wdGlvbnMgPSBvcHRpb25zO1xuICB0aGlzLnRyYW5zaWVudE9ic2VydmVkTm9kZXMgPSBbXTtcbn1cblxuUmVnaXN0cmF0aW9uLnByb3RvdHlwZSA9IHtcbiAgZW5xdWV1ZTogZnVuY3Rpb24ocmVjb3JkKSB7XG4gICAgdmFyIHJlY29yZHMgPSB0aGlzLm9ic2VydmVyLnJlY29yZHNfO1xuICAgIHZhciBsZW5ndGggPSByZWNvcmRzLmxlbmd0aDtcblxuICAgIC8vIFRoZXJlIGFyZSBjYXNlcyB3aGVyZSB3ZSByZXBsYWNlIHRoZSBsYXN0IHJlY29yZCB3aXRoIHRoZSBuZXcgcmVjb3JkLlxuICAgIC8vIEZvciBleGFtcGxlIGlmIHRoZSByZWNvcmQgcmVwcmVzZW50cyB0aGUgc2FtZSBtdXRhdGlvbiB3ZSBuZWVkIHRvIHVzZVxuICAgIC8vIHRoZSBvbmUgd2l0aCB0aGUgb2xkVmFsdWUuIElmIHdlIGdldCBzYW1lIHJlY29yZCAodGhpcyBjYW4gaGFwcGVuIGFzIHdlXG4gICAgLy8gd2FsayB1cCB0aGUgdHJlZSkgd2UgaWdub3JlIHRoZSBuZXcgcmVjb3JkLlxuICAgIGlmIChyZWNvcmRzLmxlbmd0aCA+IDApIHtcbiAgICAgIHZhciBsYXN0UmVjb3JkID0gcmVjb3Jkc1tsZW5ndGggLSAxXTtcbiAgICAgIHZhciByZWNvcmRUb1JlcGxhY2VMYXN0ID0gc2VsZWN0UmVjb3JkKGxhc3RSZWNvcmQsIHJlY29yZCk7XG4gICAgICBpZiAocmVjb3JkVG9SZXBsYWNlTGFzdCkge1xuICAgICAgICByZWNvcmRzW2xlbmd0aCAtIDFdID0gcmVjb3JkVG9SZXBsYWNlTGFzdDtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBzY2hlZHVsZUNhbGxiYWNrKHRoaXMub2JzZXJ2ZXIpO1xuICAgIH1cblxuICAgIHJlY29yZHNbbGVuZ3RoXSA9IHJlY29yZDtcbiAgfSxcblxuICBhZGRMaXN0ZW5lcnM6IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuYWRkTGlzdGVuZXJzXyh0aGlzLnRhcmdldCk7XG4gIH0sXG5cbiAgYWRkTGlzdGVuZXJzXzogZnVuY3Rpb24obm9kZSkge1xuICAgIHZhciBvcHRpb25zID0gdGhpcy5vcHRpb25zO1xuICAgIGlmIChvcHRpb25zLmF0dHJpYnV0ZXMpXG4gICAgICBub2RlLmFkZEV2ZW50TGlzdGVuZXIoJ0RPTUF0dHJNb2RpZmllZCcsIHRoaXMsIHRydWUpO1xuXG4gICAgaWYgKG9wdGlvbnMuY2hhcmFjdGVyRGF0YSlcbiAgICAgIG5vZGUuYWRkRXZlbnRMaXN0ZW5lcignRE9NQ2hhcmFjdGVyRGF0YU1vZGlmaWVkJywgdGhpcywgdHJ1ZSk7XG5cbiAgICBpZiAob3B0aW9ucy5jaGlsZExpc3QpXG4gICAgICBub2RlLmFkZEV2ZW50TGlzdGVuZXIoJ0RPTU5vZGVJbnNlcnRlZCcsIHRoaXMsIHRydWUpO1xuXG4gICAgaWYgKG9wdGlvbnMuY2hpbGRMaXN0IHx8IG9wdGlvbnMuc3VidHJlZSlcbiAgICAgIG5vZGUuYWRkRXZlbnRMaXN0ZW5lcignRE9NTm9kZVJlbW92ZWQnLCB0aGlzLCB0cnVlKTtcbiAgfSxcblxuICByZW1vdmVMaXN0ZW5lcnM6IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMucmVtb3ZlTGlzdGVuZXJzXyh0aGlzLnRhcmdldCk7XG4gIH0sXG5cbiAgcmVtb3ZlTGlzdGVuZXJzXzogZnVuY3Rpb24obm9kZSkge1xuICAgIHZhciBvcHRpb25zID0gdGhpcy5vcHRpb25zO1xuICAgIGlmIChvcHRpb25zLmF0dHJpYnV0ZXMpXG4gICAgICBub2RlLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ0RPTUF0dHJNb2RpZmllZCcsIHRoaXMsIHRydWUpO1xuXG4gICAgaWYgKG9wdGlvbnMuY2hhcmFjdGVyRGF0YSlcbiAgICAgIG5vZGUucmVtb3ZlRXZlbnRMaXN0ZW5lcignRE9NQ2hhcmFjdGVyRGF0YU1vZGlmaWVkJywgdGhpcywgdHJ1ZSk7XG5cbiAgICBpZiAob3B0aW9ucy5jaGlsZExpc3QpXG4gICAgICBub2RlLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ0RPTU5vZGVJbnNlcnRlZCcsIHRoaXMsIHRydWUpO1xuXG4gICAgaWYgKG9wdGlvbnMuY2hpbGRMaXN0IHx8IG9wdGlvbnMuc3VidHJlZSlcbiAgICAgIG5vZGUucmVtb3ZlRXZlbnRMaXN0ZW5lcignRE9NTm9kZVJlbW92ZWQnLCB0aGlzLCB0cnVlKTtcbiAgfSxcblxuICAvKipcbiAgICogQWRkcyBhIHRyYW5zaWVudCBvYnNlcnZlciBvbiBub2RlLiBUaGUgdHJhbnNpZW50IG9ic2VydmVyIGdldHMgcmVtb3ZlZFxuICAgKiBuZXh0IHRpbWUgd2UgZGVsaXZlciB0aGUgY2hhbmdlIHJlY29yZHMuXG4gICAqIEBwYXJhbSB7Tm9kZX0gbm9kZVxuICAgKi9cbiAgYWRkVHJhbnNpZW50T2JzZXJ2ZXI6IGZ1bmN0aW9uKG5vZGUpIHtcbiAgICAvLyBEb24ndCBhZGQgdHJhbnNpZW50IG9ic2VydmVycyBvbiB0aGUgdGFyZ2V0IGl0c2VsZi4gV2UgYWxyZWFkeSBoYXZlIGFsbFxuICAgIC8vIHRoZSByZXF1aXJlZCBsaXN0ZW5lcnMgc2V0IHVwIG9uIHRoZSB0YXJnZXQuXG4gICAgaWYgKG5vZGUgPT09IHRoaXMudGFyZ2V0KVxuICAgICAgcmV0dXJuO1xuXG4gICAgdGhpcy5hZGRMaXN0ZW5lcnNfKG5vZGUpO1xuICAgIHRoaXMudHJhbnNpZW50T2JzZXJ2ZWROb2Rlcy5wdXNoKG5vZGUpO1xuICAgIHZhciByZWdpc3RyYXRpb25zID0gcmVnaXN0cmF0aW9uc1RhYmxlLmdldChub2RlKTtcbiAgICBpZiAoIXJlZ2lzdHJhdGlvbnMpXG4gICAgICByZWdpc3RyYXRpb25zVGFibGUuc2V0KG5vZGUsIHJlZ2lzdHJhdGlvbnMgPSBbXSk7XG5cbiAgICAvLyBXZSBrbm93IHRoYXQgcmVnaXN0cmF0aW9ucyBkb2VzIG5vdCBjb250YWluIHRoaXMgYmVjYXVzZSB3ZSBhbHJlYWR5XG4gICAgLy8gY2hlY2tlZCBpZiBub2RlID09PSB0aGlzLnRhcmdldC5cbiAgICByZWdpc3RyYXRpb25zLnB1c2godGhpcyk7XG4gIH0sXG5cbiAgcmVtb3ZlVHJhbnNpZW50T2JzZXJ2ZXJzOiBmdW5jdGlvbigpIHtcbiAgICB2YXIgdHJhbnNpZW50T2JzZXJ2ZWROb2RlcyA9IHRoaXMudHJhbnNpZW50T2JzZXJ2ZWROb2RlcztcbiAgICB0aGlzLnRyYW5zaWVudE9ic2VydmVkTm9kZXMgPSBbXTtcblxuICAgIHRyYW5zaWVudE9ic2VydmVkTm9kZXMuZm9yRWFjaChmdW5jdGlvbihub2RlKSB7XG4gICAgICAvLyBUcmFuc2llbnQgb2JzZXJ2ZXJzIGFyZSBuZXZlciBhZGRlZCB0byB0aGUgdGFyZ2V0LlxuICAgICAgdGhpcy5yZW1vdmVMaXN0ZW5lcnNfKG5vZGUpO1xuXG4gICAgICB2YXIgcmVnaXN0cmF0aW9ucyA9IHJlZ2lzdHJhdGlvbnNUYWJsZS5nZXQobm9kZSk7XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHJlZ2lzdHJhdGlvbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYgKHJlZ2lzdHJhdGlvbnNbaV0gPT09IHRoaXMpIHtcbiAgICAgICAgICByZWdpc3RyYXRpb25zLnNwbGljZShpLCAxKTtcbiAgICAgICAgICAvLyBFYWNoIG5vZGUgY2FuIG9ubHkgaGF2ZSBvbmUgcmVnaXN0ZXJlZCBvYnNlcnZlciBhc3NvY2lhdGVkIHdpdGhcbiAgICAgICAgICAvLyB0aGlzIG9ic2VydmVyLlxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSwgdGhpcyk7XG4gIH0sXG5cbiAgaGFuZGxlRXZlbnQ6IGZ1bmN0aW9uKGUpIHtcbiAgICAvLyBTdG9wIHByb3BhZ2F0aW9uIHNpbmNlIHdlIGFyZSBtYW5hZ2luZyB0aGUgcHJvcGFnYXRpb24gbWFudWFsbHkuXG4gICAgLy8gVGhpcyBtZWFucyB0aGF0IG90aGVyIG11dGF0aW9uIGV2ZW50cyBvbiB0aGUgcGFnZSB3aWxsIG5vdCB3b3JrXG4gICAgLy8gY29ycmVjdGx5IGJ1dCB0aGF0IGlzIGJ5IGRlc2lnbi5cbiAgICBlLnN0b3BJbW1lZGlhdGVQcm9wYWdhdGlvbigpO1xuXG4gICAgc3dpdGNoIChlLnR5cGUpIHtcbiAgICAgIGNhc2UgJ0RPTUF0dHJNb2RpZmllZCc6XG4gICAgICAgIC8vIGh0dHA6Ly9kb20uc3BlYy53aGF0d2cub3JnLyNjb25jZXB0LW1vLXF1ZXVlLWF0dHJpYnV0ZXNcblxuICAgICAgICB2YXIgbmFtZSA9IGUuYXR0ck5hbWU7XG4gICAgICAgIHZhciBuYW1lc3BhY2UgPSBlLnJlbGF0ZWROb2RlLm5hbWVzcGFjZVVSSTtcbiAgICAgICAgdmFyIHRhcmdldCA9IGUudGFyZ2V0O1xuXG4gICAgICAgIC8vIDEuXG4gICAgICAgIHZhciByZWNvcmQgPSBuZXcgZ2V0UmVjb3JkKCdhdHRyaWJ1dGVzJywgdGFyZ2V0KTtcbiAgICAgICAgcmVjb3JkLmF0dHJpYnV0ZU5hbWUgPSBuYW1lO1xuICAgICAgICByZWNvcmQuYXR0cmlidXRlTmFtZXNwYWNlID0gbmFtZXNwYWNlO1xuXG4gICAgICAgIC8vIDIuXG4gICAgICAgIHZhciBvbGRWYWx1ZSA9XG4gICAgICAgICAgICBlLmF0dHJDaGFuZ2UgPT09IE11dGF0aW9uRXZlbnQuQURESVRJT04gPyBudWxsIDogZS5wcmV2VmFsdWU7XG5cbiAgICAgICAgZm9yRWFjaEFuY2VzdG9yQW5kT2JzZXJ2ZXJFbnF1ZXVlUmVjb3JkKHRhcmdldCwgZnVuY3Rpb24ob3B0aW9ucykge1xuICAgICAgICAgIC8vIDMuMSwgNC4yXG4gICAgICAgICAgaWYgKCFvcHRpb25zLmF0dHJpYnV0ZXMpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgICAvLyAzLjIsIDQuM1xuICAgICAgICAgIGlmIChvcHRpb25zLmF0dHJpYnV0ZUZpbHRlciAmJiBvcHRpb25zLmF0dHJpYnV0ZUZpbHRlci5sZW5ndGggJiZcbiAgICAgICAgICAgICAgb3B0aW9ucy5hdHRyaWJ1dGVGaWx0ZXIuaW5kZXhPZihuYW1lKSA9PT0gLTEgJiZcbiAgICAgICAgICAgICAgb3B0aW9ucy5hdHRyaWJ1dGVGaWx0ZXIuaW5kZXhPZihuYW1lc3BhY2UpID09PSAtMSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyAzLjMsIDQuNFxuICAgICAgICAgIGlmIChvcHRpb25zLmF0dHJpYnV0ZU9sZFZhbHVlKVxuICAgICAgICAgICAgcmV0dXJuIGdldFJlY29yZFdpdGhPbGRWYWx1ZShvbGRWYWx1ZSk7XG5cbiAgICAgICAgICAvLyAzLjQsIDQuNVxuICAgICAgICAgIHJldHVybiByZWNvcmQ7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGJyZWFrO1xuXG4gICAgICBjYXNlICdET01DaGFyYWN0ZXJEYXRhTW9kaWZpZWQnOlxuICAgICAgICAvLyBodHRwOi8vZG9tLnNwZWMud2hhdHdnLm9yZy8jY29uY2VwdC1tby1xdWV1ZS1jaGFyYWN0ZXJkYXRhXG4gICAgICAgIHZhciB0YXJnZXQgPSBlLnRhcmdldDtcblxuICAgICAgICAvLyAxLlxuICAgICAgICB2YXIgcmVjb3JkID0gZ2V0UmVjb3JkKCdjaGFyYWN0ZXJEYXRhJywgdGFyZ2V0KTtcblxuICAgICAgICAvLyAyLlxuICAgICAgICB2YXIgb2xkVmFsdWUgPSBlLnByZXZWYWx1ZTtcblxuXG4gICAgICAgIGZvckVhY2hBbmNlc3RvckFuZE9ic2VydmVyRW5xdWV1ZVJlY29yZCh0YXJnZXQsIGZ1bmN0aW9uKG9wdGlvbnMpIHtcbiAgICAgICAgICAvLyAzLjEsIDQuMlxuICAgICAgICAgIGlmICghb3B0aW9ucy5jaGFyYWN0ZXJEYXRhKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgICAgLy8gMy4yLCA0LjNcbiAgICAgICAgICBpZiAob3B0aW9ucy5jaGFyYWN0ZXJEYXRhT2xkVmFsdWUpXG4gICAgICAgICAgICByZXR1cm4gZ2V0UmVjb3JkV2l0aE9sZFZhbHVlKG9sZFZhbHVlKTtcblxuICAgICAgICAgIC8vIDMuMywgNC40XG4gICAgICAgICAgcmV0dXJuIHJlY29yZDtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgYnJlYWs7XG5cbiAgICAgIGNhc2UgJ0RPTU5vZGVSZW1vdmVkJzpcbiAgICAgICAgdGhpcy5hZGRUcmFuc2llbnRPYnNlcnZlcihlLnRhcmdldCk7XG4gICAgICAgIC8vIEZhbGwgdGhyb3VnaC5cbiAgICAgIGNhc2UgJ0RPTU5vZGVJbnNlcnRlZCc6XG4gICAgICAgIC8vIGh0dHA6Ly9kb20uc3BlYy53aGF0d2cub3JnLyNjb25jZXB0LW1vLXF1ZXVlLWNoaWxkbGlzdFxuICAgICAgICB2YXIgdGFyZ2V0ID0gZS5yZWxhdGVkTm9kZTtcbiAgICAgICAgdmFyIGNoYW5nZWROb2RlID0gZS50YXJnZXQ7XG4gICAgICAgIHZhciBhZGRlZE5vZGVzLCByZW1vdmVkTm9kZXM7XG4gICAgICAgIGlmIChlLnR5cGUgPT09ICdET01Ob2RlSW5zZXJ0ZWQnKSB7XG4gICAgICAgICAgYWRkZWROb2RlcyA9IFtjaGFuZ2VkTm9kZV07XG4gICAgICAgICAgcmVtb3ZlZE5vZGVzID0gW107XG4gICAgICAgIH0gZWxzZSB7XG5cbiAgICAgICAgICBhZGRlZE5vZGVzID0gW107XG4gICAgICAgICAgcmVtb3ZlZE5vZGVzID0gW2NoYW5nZWROb2RlXTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgcHJldmlvdXNTaWJsaW5nID0gY2hhbmdlZE5vZGUucHJldmlvdXNTaWJsaW5nO1xuICAgICAgICB2YXIgbmV4dFNpYmxpbmcgPSBjaGFuZ2VkTm9kZS5uZXh0U2libGluZztcblxuICAgICAgICAvLyAxLlxuICAgICAgICB2YXIgcmVjb3JkID0gZ2V0UmVjb3JkKCdjaGlsZExpc3QnLCB0YXJnZXQpO1xuICAgICAgICByZWNvcmQuYWRkZWROb2RlcyA9IGFkZGVkTm9kZXM7XG4gICAgICAgIHJlY29yZC5yZW1vdmVkTm9kZXMgPSByZW1vdmVkTm9kZXM7XG4gICAgICAgIHJlY29yZC5wcmV2aW91c1NpYmxpbmcgPSBwcmV2aW91c1NpYmxpbmc7XG4gICAgICAgIHJlY29yZC5uZXh0U2libGluZyA9IG5leHRTaWJsaW5nO1xuXG4gICAgICAgIGZvckVhY2hBbmNlc3RvckFuZE9ic2VydmVyRW5xdWV1ZVJlY29yZCh0YXJnZXQsIGZ1bmN0aW9uKG9wdGlvbnMpIHtcbiAgICAgICAgICAvLyAyLjEsIDMuMlxuICAgICAgICAgIGlmICghb3B0aW9ucy5jaGlsZExpc3QpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgICAvLyAyLjIsIDMuM1xuICAgICAgICAgIHJldHVybiByZWNvcmQ7XG4gICAgICAgIH0pO1xuXG4gICAgfVxuXG4gICAgY2xlYXJSZWNvcmRzKCk7XG4gIH1cbn07XG5cbmlmICghTXV0YXRpb25PYnNlcnZlcikge1xuICBNdXRhdGlvbk9ic2VydmVyID0gSnNNdXRhdGlvbk9ic2VydmVyO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IE11dGF0aW9uT2JzZXJ2ZXI7XG4iLCJpbXBvcnQgeyBTY29wZSwgU2NvcGVFeGVjdXRvciwgRWxlbWVudE1hdGNoZXIsIEV2ZW50TWF0Y2hlciwgU3Vic2NyaXB0aW9uRXhlY3V0b3IgfSBmcm9tICcuL3Njb3BlJztcblxuZXhwb3J0IGRlZmF1bHQgRGVjbDtcblxuZXhwb3J0IGNsYXNzIERlY2wge1xuICAgIHByaXZhdGUgc3RhdGljIGRlZmF1bHRJbnN0YW5jZTogRGVjbDtcblxuICAgIHN0YXRpYyBzZWxlY3QobWF0Y2hlcjogRWxlbWVudE1hdGNoZXIsIGV4ZWN1dG9yOiBTY29wZUV4ZWN1dG9yKTogU2NvcGUge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXREZWZhdWx0SW5zdGFuY2UoKS5zZWxlY3QobWF0Y2hlciwgZXhlY3V0b3IpO1xuICAgIH1cblxuICAgIHN0YXRpYyBvbihtYXRjaGVyOiBFdmVudE1hdGNoZXIsIGV4ZWN1dG9yOiBTdWJzY3JpcHRpb25FeGVjdXRvcik6IFNjb3BlIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0RGVmYXVsdEluc3RhbmNlKCkub24obWF0Y2hlciwgZXhlY3V0b3IpO1xuICAgIH1cblxuICAgIHN0YXRpYyBnZXREZWZhdWx0SW5zdGFuY2UoKSA6IERlY2wge1xuICAgICAgICByZXR1cm4gdGhpcy5kZWZhdWx0SW5zdGFuY2UgfHwgKHRoaXMuZGVmYXVsdEluc3RhbmNlID0gbmV3IERlY2woZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50KSk7XG4gICAgfVxuXG4gICAgc3RhdGljIHNldERlZmF1bHRJbnN0YW5jZShkZWNsOiBEZWNsKSA6IERlY2wge1xuICAgICAgICByZXR1cm4gdGhpcy5kZWZhdWx0SW5zdGFuY2UgPSBkZWNsO1xuICAgIH1cblxuICAgIHN0YXRpYyBwcmlzdGluZSgpOiB2b2lkIHtcbiAgICAgICAgaWYodGhpcy5kZWZhdWx0SW5zdGFuY2UpIHtcbiAgICAgICAgICAgIHRoaXMuZGVmYXVsdEluc3RhbmNlLnByaXN0aW5lKCk7XG4gICAgICAgICAgICB0aGlzLmRlZmF1bHRJbnN0YW5jZSA9IG51bGw7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIHNjb3BlOiBTY29wZTtcblxuICAgIGNvbnN0cnVjdG9yKHJvb3Q6IEVsZW1lbnQpIHtcbiAgICAgICAgdGhpcy5zY29wZSA9IFNjb3BlLmJ1aWxkUm9vdFNjb3BlKHJvb3QpO1xuICAgIH1cblxuICAgIHNlbGVjdChtYXRjaGVyOiBFbGVtZW50TWF0Y2hlciwgZXhlY3V0b3I6IFNjb3BlRXhlY3V0b3IpOiBTY29wZSB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldFNjb3BlKCkuc2VsZWN0KG1hdGNoZXIsIGV4ZWN1dG9yKTtcbiAgICB9XG5cbiAgICBvbihtYXRjaGVyOiBFdmVudE1hdGNoZXIsIGV4ZWN1dG9yOiBTdWJzY3JpcHRpb25FeGVjdXRvcik6IFNjb3BlIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0U2NvcGUoKS5vbihtYXRjaGVyLCBleGVjdXRvcik7XG4gICAgfVxuXG4gICAgZ2V0U2NvcGUoKTogU2NvcGUge1xuICAgICAgICByZXR1cm4gdGhpcy5zY29wZTtcbiAgICB9XG5cbiAgICBwcmlzdGluZSgpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5zY29wZS5wcmlzdGluZSgpO1xuICAgIH1cbn1cblxuLy8gRXhwb3J0IHRvIGEgZ2xvYmFsIGZvciB0aGUgYnJvd3NlciAodGhlcmUgKmhhcyogdG8gYmUgYSBiZXR0ZXIgd2F5IHRvIGRvIHRoaXMhKVxuaWYodHlwZW9mKHdpbmRvdykgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgKDxhbnk+d2luZG93KS5EZWNsID0gRGVjbDtcbn1cblxuZXhwb3J0IHsgU2NvcGUsIFNjb3BlRXhlY3V0b3IsIEVsZW1lbnRNYXRjaGVyLCBFdmVudE1hdGNoZXIsIFN1YnNjcmlwdGlvbkV4ZWN1dG9yIH07XG4iLCJleHBvcnQgZGVmYXVsdCBFbGVtZW50Q29sbGVjdG9yO1xuXG5leHBvcnQgaW50ZXJmYWNlIEVsZW1lbnRWaXN0b3IgeyAoZWxlbWVudDogRWxlbWVudCk6IEVsZW1lbnRNYXRjaGVyIHwgYm9vbGVhbiB9XG5leHBvcnQgZGVjbGFyZSB0eXBlIEVsZW1lbnRNYXRjaGVyID0gc3RyaW5nIHwgTm9kZUxpc3RPZjxFbGVtZW50PiB8IEVsZW1lbnRbXSB8IEVsZW1lbnRWaXN0b3I7XG5cbmV4cG9ydCBjbGFzcyBFbGVtZW50Q29sbGVjdG9yIHtcbiAgICBwcml2YXRlIHN0YXRpYyBpbnN0YW5jZTogRWxlbWVudENvbGxlY3RvcjtcbiAgICBcbiAgICBwcml2YXRlIHN0YXRpYyByZWFkb25seSBFTEVNRU5UX01BVENIRVJfVFlQRV9FUlJPUl9NRVNTQUdFID0gXCJEZWNsOiBBbiBgRWxlbWVudE1hdGNoZXJgIG11c3QgYmUgYSBDU1Mgc2VsZWN0b3IgKHN0cmluZykgb3IgYSBmdW5jdGlvbiB3aGljaCB0YWtlcyBhIG5vZGUgdW5kZXIgY29uc2lkZXJhdGlvbiBhbmQgcmV0dXJucyBhIENTUyBzZWxlY3RvciAoc3RyaW5nKSB0aGF0IG1hdGNoZXMgYWxsIG1hdGNoaW5nIG5vZGVzIGluIHRoZSBzdWJ0cmVlLCBhbiBhcnJheS1saWtlIG9iamVjdCBvZiBtYXRjaGluZyBub2RlcyBpbiB0aGUgc3VidHJlZSwgb3IgYSBib29sZWFuIHZhbHVlIGFzIHRvIHdoZXRoZXIgdGhlIG5vZGUgc2hvdWxkIGJlIGluY2x1ZGVkIChpbiB0aGlzIGNhc2UsIHRoZSBmdW5jdGlvbiB3aWxsIGJlIGludm9rZWQgYWdhaW4gZm9yIGFsbCBjaGlsZHJlbiBvZiB0aGUgbm9kZSkuXCI7XG5cbiAgICBzdGF0aWMgaXNNYXRjaGluZ0VsZW1lbnQocm9vdEVsZW1lbnQ6IEVsZW1lbnQsIGVsZW1lbnRNYXRjaGVyOiBFbGVtZW50TWF0Y2hlcik6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRJbnN0YW5jZSgpLmlzTWF0Y2hpbmdFbGVtZW50KHJvb3RFbGVtZW50LCBlbGVtZW50TWF0Y2hlcik7XG4gICAgfVxuXG4gICAgc3RhdGljIGNvbGxlY3RNYXRjaGluZ0VsZW1lbnRzKHJvb3RFbGVtZW50OiBFbGVtZW50LCBlbGVtZW50TWF0Y2hlcjogRWxlbWVudE1hdGNoZXIpOiBFbGVtZW50W10ge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRJbnN0YW5jZSgpLmNvbGxlY3RNYXRjaGluZ0VsZW1lbnRzKHJvb3RFbGVtZW50LCBlbGVtZW50TWF0Y2hlcik7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBzdGF0aWMgZ2V0SW5zdGFuY2UoKSA6IEVsZW1lbnRDb2xsZWN0b3Ige1xuICAgICAgICByZXR1cm4gdGhpcy5pbnN0YW5jZSB8fCAodGhpcy5pbnN0YW5jZSA9IG5ldyBFbGVtZW50Q29sbGVjdG9yKCkpO1xuICAgIH1cblxuICAgIGlzTWF0Y2hpbmdFbGVtZW50KGVsZW1lbnQ6IEVsZW1lbnQsIGVsZW1lbnRNYXRjaGVyOiBFbGVtZW50TWF0Y2hlcik6IGJvb2xlYW4ge1xuICAgICAgICBzd2l0Y2godHlwZW9mKGVsZW1lbnRNYXRjaGVyKSkge1xuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKEVsZW1lbnRDb2xsZWN0b3IuRUxFTUVOVF9NQVRDSEVSX1RZUEVfRVJST1JfTUVTU0FHRSk7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgICAgICAgICAgIGxldCBjc3NTZWxlY3Rvcjogc3RyaW5nID0gPHN0cmluZz5lbGVtZW50TWF0Y2hlcjtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5pc01hdGNoaW5nRWxlbWVudEZyb21Dc3NTZWxlY3RvcihlbGVtZW50LCBjc3NTZWxlY3Rvcik7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGNhc2UgJ29iamVjdCc6XG4gICAgICAgICAgICAgICAgbGV0IG9iamVjdCA9IDxPYmplY3Q+ZWxlbWVudE1hdGNoZXI7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuaXNNYXRjaGluZ0VsZW1lbnRGcm9tT2JqZWN0KGVsZW1lbnQsIG9iamVjdCk7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICBjYXNlICdmdW5jdGlvbic6XG4gICAgICAgICAgICAgICAgbGV0IGVsZW1lbnRWaXN0b3IgPSA8RWxlbWVudFZpc3Rvcj5lbGVtZW50TWF0Y2hlcjtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5pc01hdGNoaW5nRWxlbWVudEZyb21FbGVtZW50VmlzdG9yKGVsZW1lbnQsIGVsZW1lbnRWaXN0b3IpOyAgICAgICBcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGNvbGxlY3RNYXRjaGluZ0VsZW1lbnRzKGVsZW1lbnQ6IEVsZW1lbnQsIGVsZW1lbnRNYXRjaGVyOiBFbGVtZW50TWF0Y2hlcik6IEVsZW1lbnRbXSB7XG4gICAgICAgIHN3aXRjaCh0eXBlb2YoZWxlbWVudE1hdGNoZXIpKSB7XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoRWxlbWVudENvbGxlY3Rvci5FTEVNRU5UX01BVENIRVJfVFlQRV9FUlJPUl9NRVNTQUdFKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgICAgICAgICAgICAgbGV0IGNzc1NlbGVjdG9yOiBzdHJpbmcgPSA8c3RyaW5nPmVsZW1lbnRNYXRjaGVyO1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmNvbGxlY3RNYXRjaGluZ0VsZW1lbnRzRnJvbUNzc1NlbGVjdG9yKGVsZW1lbnQsIGNzc1NlbGVjdG9yKTtcblxuICAgICAgICAgICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgICAgICAgICAgICBsZXQgb2JqZWN0ID0gPE9iamVjdD5lbGVtZW50TWF0Y2hlcjtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5jb2xsZWN0TWF0Y2hpbmdFbGVtZW50c0Zyb21PYmplY3QoZWxlbWVudCwgb2JqZWN0KTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIGNhc2UgJ2Z1bmN0aW9uJzpcbiAgICAgICAgICAgICAgICBsZXQgZWxlbWVudFZpc3RvciA9IDxFbGVtZW50VmlzdG9yPmVsZW1lbnRNYXRjaGVyO1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmNvbGxlY3RNYXRjaGluZ0VsZW1lbnRzRnJvbUVsZW1lbnRWaXN0b3IoZWxlbWVudCwgZWxlbWVudFZpc3Rvcik7ICAgICAgIFxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBpc01hdGNoaW5nRWxlbWVudEZyb21Dc3NTZWxlY3RvcihlbGVtZW50OiBFbGVtZW50LCBjc3NTZWxlY3Rvcjogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgICAgIGlmKHR5cGVvZihlbGVtZW50Lm1hdGNoZXMpID09PSAnZnVuY3Rpb24nKSB7IC8vIHRha2UgYSBzaG9ydGN1dCBpbiBtb2Rlcm4gYnJvd3NlcnNcbiAgICAgICAgICAgIHJldHVybiBlbGVtZW50Lm1hdGNoZXMoY3NzU2VsZWN0b3IpO1xuICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgIHJldHVybiBpc01lbWJlck9mQXJyYXlMaWtlKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoY3NzU2VsZWN0b3IpLCBlbGVtZW50KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgaXNNYXRjaGluZ0VsZW1lbnRGcm9tT2JqZWN0KGVsZW1lbnQ6IEVsZW1lbnQsIG9iamVjdDogT2JqZWN0KTogYm9vbGVhbiB7XG4gICAgICAgIGlmKG9iamVjdCA9PT0gbnVsbCkge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgIGlmKGlzQXJyYXlMaWtlKG9iamVjdCkpIHtcbiAgICAgICAgICAgICAgICBsZXQgYXJyYXlMaWtlID0gPEFycmF5TGlrZTxhbnk+Pm9iamVjdDtcblxuICAgICAgICAgICAgICAgIGlmKGFycmF5TGlrZS5sZW5ndGggPT09IDAgfHwgYXJyYXlMaWtlWzBdIGluc3RhbmNlb2YgRWxlbWVudCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gaXNNZW1iZXJPZkFycmF5TGlrZShhcnJheUxpa2UsIGVsZW1lbnQpOyAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihFbGVtZW50Q29sbGVjdG9yLkVMRU1FTlRfTUFUQ0hFUl9UWVBFX0VSUk9SX01FU1NBR0UpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1lbHNle1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoRWxlbWVudENvbGxlY3Rvci5FTEVNRU5UX01BVENIRVJfVFlQRV9FUlJPUl9NRVNTQUdFKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgaXNNYXRjaGluZ0VsZW1lbnRGcm9tRWxlbWVudFZpc3RvcihlbGVtZW50OiBFbGVtZW50LCBlbGVtZW50VmlzdG9yOiBFbGVtZW50VmlzdG9yKTogYm9vbGVhbiB7XG4gICAgICAgIGxldCB2aXNpdG9yUmVzdWx0ID0gZWxlbWVudFZpc3RvcihlbGVtZW50KTtcblxuICAgICAgICBpZih0eXBlb2YodmlzaXRvclJlc3VsdCkgPT09ICdib29sZWFuJykge1xuICAgICAgICAgICAgbGV0IGlzTWF0Y2ggPSA8Ym9vbGVhbj52aXNpdG9yUmVzdWx0O1xuICAgICAgICAgICAgcmV0dXJuIGlzTWF0Y2g7XG4gICAgICAgIH1lbHNle1xuICAgICAgICAgICAgbGV0IGVsZW1lbnRNYXRjaGVyID0gPEVsZW1lbnRNYXRjaGVyPnZpc2l0b3JSZXN1bHQ7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5pc01hdGNoaW5nRWxlbWVudChlbGVtZW50LCBlbGVtZW50TWF0Y2hlcik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGNvbGxlY3RNYXRjaGluZ0VsZW1lbnRzRnJvbUNzc1NlbGVjdG9yKGVsZW1lbnQ6IEVsZW1lbnQsIGNzc1NlbGVjdG9yOiBzdHJpbmcpOiBFbGVtZW50W10ge1xuICAgICAgICByZXR1cm4gdG9BcnJheTxFbGVtZW50PihlbGVtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoY3NzU2VsZWN0b3IpKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGNvbGxlY3RNYXRjaGluZ0VsZW1lbnRzRnJvbU9iamVjdChlbGVtZW50OiBFbGVtZW50LCBvYmplY3Q6IE9iamVjdCk6IEVsZW1lbnRbXSB7XG4gICAgICAgIGlmKG9iamVjdCA9PT0gbnVsbCkge1xuICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgIGlmKGlzQXJyYXlMaWtlKG9iamVjdCkpIHtcbiAgICAgICAgICAgICAgICBsZXQgYXJyYXlMaWtlID0gPEFycmF5TGlrZTxhbnk+Pm9iamVjdDtcblxuICAgICAgICAgICAgICAgIGlmKGFycmF5TGlrZS5sZW5ndGggPT09IDAgfHwgYXJyYXlMaWtlWzBdIGluc3RhbmNlb2YgRWxlbWVudCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdG9BcnJheTxFbGVtZW50PihhcnJheUxpa2UpOyAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihFbGVtZW50Q29sbGVjdG9yLkVMRU1FTlRfTUFUQ0hFUl9UWVBFX0VSUk9SX01FU1NBR0UpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1lbHNle1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoRWxlbWVudENvbGxlY3Rvci5FTEVNRU5UX01BVENIRVJfVFlQRV9FUlJPUl9NRVNTQUdFKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgY29sbGVjdE1hdGNoaW5nRWxlbWVudHNGcm9tRWxlbWVudFZpc3RvcihlbGVtZW50OiBFbGVtZW50LCBlbGVtZW50VmlzdG9yOiBFbGVtZW50VmlzdG9yKTogRWxlbWVudFtdIHtcbiAgICAgICAgbGV0IGVsZW1lbnRzOiBFbGVtZW50W10gPSBbXTtcblxuICAgICAgICAvLyBJJ20gZmliYmluZyB0byB0aGUgY29tcGlsZXIgaGVyZS4gYGVsZW1lbnQuY2hpbGRyZW5gIGlzIGEgYE5vZGVMaXN0T2Y8RWxlbWVudD5gLFxuICAgICAgICAvLyB3aGljaCBkb2VzIG5vdCBoYXZlIGEgY29tcGF0YWJsZSBpbnRlcmZhY2Ugd2l0aCBgQXJyYXk8RWxlbWVudD5gOyBob3dldmVyLCB0aGVcbiAgICAgICAgLy8gZ2VuZXJhdGVkIGNvZGUgc3RpbGwgd29ya3MgYmVjYXVzZSBpdCBkb2Vzbid0IGFjdHVhbGx5IHVzZSB2ZXJ5IG11Y2ggb2YgdGhlIFxuICAgICAgICAvLyBgQXJyYXlgIGludGVyYWNlIChpdCByZWFsbHkgb25seSBhc3N1bWVzIGEgbnVtYmVyaWMgbGVuZ3RoIHByb3BlcnR5IGFuZCBrZXlzIGZvclxuICAgICAgICAvLyAwLi4ubGVuZ3RoKS4gQ2FzdGluZyB0byBgYW55YCBoZXJlIGRlc3Ryb3lzIHRoYXQgdHlwZSBpbmZvcm1hdGlvbiwgc28gdGhlIFxuICAgICAgICAvLyBjb21waWxlciBjYW4ndCB0ZWxsIHRoZXJlIGlzIGFuIGlzc3VlIGFuZCBhbGxvd3MgaXQgd2l0aG91dCBhbiBlcnJvci5cbiAgICAgICAgZm9yKGxldCBjaGlsZCBvZiA8YW55PmVsZW1lbnQuY2hpbGRyZW4pIHtcbiAgICAgICAgICAgIGlmKGNoaWxkIGluc3RhbmNlb2YgRWxlbWVudCkge1xuICAgICAgICAgICAgICAgIGxldCBlbGVtZW50OiBFbGVtZW50ID0gY2hpbGQ7XG4gICAgICAgICAgICAgICAgbGV0IHZpc2l0b3JSZXN1bHQgPSBlbGVtZW50VmlzdG9yKGVsZW1lbnQpO1xuXG4gICAgICAgICAgICAgICAgaWYodHlwZW9mKHZpc2l0b3JSZXN1bHQpID09PSAnYm9vbGVhbicpIHtcbiAgICAgICAgICAgICAgICAgICAgbGV0IGlzTWF0Y2ggPSA8Ym9vbGVhbj52aXNpdG9yUmVzdWx0O1xuXG4gICAgICAgICAgICAgICAgICAgIGlmKGlzTWF0Y2gpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsZW1lbnRzLnB1c2goZWxlbWVudCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudHMucHVzaCguLi50aGlzLmNvbGxlY3RNYXRjaGluZ0VsZW1lbnRzKGVsZW1lbnQsIHZpc2l0b3JSZXN1bHQpKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gZWxlbWVudHM7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBpc0FycmF5TGlrZSh2YWx1ZTogYW55KSB7XG4gICAgcmV0dXJuIHR5cGVvZih2YWx1ZSkgPT09ICdvYmplY3QnICYmIHR5cGVvZih2YWx1ZS5sZW5ndGgpID09PSAnbnVtYmVyJztcbn1cblxuZnVuY3Rpb24gdG9BcnJheTxUPihhcnJheUxpa2U6IEFycmF5TGlrZTxUPik6IEFycmF5PFQ+IHtcbiAgICBpZihpc0FycmF5TGlrZShhcnJheUxpa2UpKSB7XG4gICAgICAgIHJldHVybiBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcnJheUxpa2UsIDApO1xuICAgIH1lbHNle1xuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdFeHBlY3RlZCBBcnJheUxpa2UnKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGlzTWVtYmVyT2ZBcnJheUxpa2UoaGF5c3RhY2s6IEFycmF5TGlrZTxhbnk+LCAgbmVlZGxlOiBhbnkpIHtcbiAgICByZXR1cm4gQXJyYXkucHJvdG90eXBlLmluZGV4T2YuY2FsbChoYXlzdGFjaywgbmVlZGxlKSAhPT0gLTE7XG59XG4iLCJpbXBvcnQgeyBTdWJzY3JpcHRpb24sIFN1YnNjcmlwdGlvbkV4ZWN1dG9yIH0gZnJvbSAnLi9zdWJzY3JpcHRpb25zL3N1YnNjcmlwdGlvbic7XG5pbXBvcnQgeyBUcml2aWFsU3Vic2NyaXB0aW9uIH0gZnJvbSAnLi9zdWJzY3JpcHRpb25zL3RyaXZpYWxfc3Vic2NyaXB0aW9uJztcbmltcG9ydCB7IE1hdGNoaW5nRWxlbWVudHNTdWJzY3JpcHRpb24sIE1hdGNoaW5nRWxlbWVudHNDaGFuZ2VkRXZlbnQgfSBmcm9tICcuL3N1YnNjcmlwdGlvbnMvbWF0Y2hpbmdfZWxlbWVudHNfc3Vic2NyaXB0aW9uJztcbmltcG9ydCB7IEVsZW1lbnRNYXRjaGVzU3Vic2NyaXB0aW9uLCBFbGVtZW50TWF0Y2hlc0NoYW5nZWRFdmVudCwgRWxlbWVudE1hdGNoZXIgfSBmcm9tICcuL3N1YnNjcmlwdGlvbnMvZWxlbWVudF9tYXRjaGVzX3N1YnNjcmlwdGlvbic7XG5pbXBvcnQgeyBFdmVudFN1YnNjcmlwdGlvbiwgRXZlbnRNYXRjaGVyIH0gZnJvbSAnLi9zdWJzY3JpcHRpb25zL2V2ZW50X3N1YnNjcmlwdGlvbic7XG5cbmV4cG9ydCBjbGFzcyBTY29wZSB7XG4gICAgc3RhdGljIGJ1aWxkUm9vdFNjb3BlKGVsZW1lbnQ6IEVsZW1lbnQpOiBTY29wZSB7XG4gICAgICAgIGxldCBzY29wZSA9IG5ldyBTY29wZShlbGVtZW50KTtcblxuICAgICAgICBzY29wZS5hY3RpdmF0ZSgpO1xuXG4gICAgICAgIHJldHVybiBzY29wZTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHJlYWRvbmx5IGVsZW1lbnQ6IEVsZW1lbnQ7XG4gICAgcHJpdmF0ZSBpc0FjdGl2YXRlZDogYm9vbGVhbiA9IGZhbHNlO1xuICAgIHByaXZhdGUgc3Vic2NyaXB0aW9uczogU3Vic2NyaXB0aW9uW10gPSBbXTtcbiAgICBwcml2YXRlIGNoaWxkcmVuOiBTY29wZVtdID0gW107XG5cbiAgICBjb25zdHJ1Y3RvcihlbGVtZW50OiBFbGVtZW50LCBleGVjdXRvcj86IFNjb3BlRXhlY3V0b3IpIHtcbiAgICAgICAgdGhpcy5lbGVtZW50ID0gZWxlbWVudDtcblxuICAgICAgICBpZihleGVjdXRvcikge1xuICAgICAgICAgICAgZXhlY3V0b3IuY2FsbCh0aGlzLCB0aGlzKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGdldEVsZW1lbnQoKTogRWxlbWVudCB7XG4gICAgICAgIHJldHVybiB0aGlzLmVsZW1lbnQ7XG4gICAgfVxuXG4gICAgbWF0Y2goZXhlY3V0b3I6IFN1YnNjcmlwdGlvbkV4ZWN1dG9yKTogU2NvcGUge1xuICAgICAgICB0aGlzLmFkZFN1YnNjcmlwdGlvbihuZXcgVHJpdmlhbFN1YnNjcmlwdGlvbih0aGlzLmVsZW1lbnQsIHsgY29ubmVjdGVkOiB0cnVlIH0sIGV4ZWN1dG9yKSk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgdW5tYXRjaChleGVjdXRvcjogU3Vic2NyaXB0aW9uRXhlY3V0b3IpOiBTY29wZSB7XG4gICAgICAgIHRoaXMuYWRkU3Vic2NyaXB0aW9uKG5ldyBUcml2aWFsU3Vic2NyaXB0aW9uKHRoaXMuZWxlbWVudCwgeyBkaXNjb25uZWN0ZWQ6IHRydWUgfSwgZXhlY3V0b3IpKTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBzZWxlY3QobWF0Y2hlcjogRWxlbWVudE1hdGNoZXIsIGV4ZWN1dG9yOiBTY29wZUV4ZWN1dG9yKTogU2NvcGUge1xuICAgICAgICB0aGlzLmFkZFN1YnNjcmlwdGlvbihuZXcgTWF0Y2hpbmdFbGVtZW50c1N1YnNjcmlwdGlvbih0aGlzLmVsZW1lbnQsIG1hdGNoZXIsIHRoaXMuYnVpbGRTZWxlY3RFeGVjdXRvcihleGVjdXRvcikpKTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICB3aGVuKG1hdGNoZXI6IEVsZW1lbnRNYXRjaGVyLCBleGVjdXRvcjogU2NvcGVFeGVjdXRvcik6IFNjb3BlIHtcblx0XHR0aGlzLmFkZFN1YnNjcmlwdGlvbihuZXcgRWxlbWVudE1hdGNoZXNTdWJzY3JpcHRpb24odGhpcy5lbGVtZW50LCBtYXRjaGVyLCB0aGlzLmJ1aWxkV2hlbkV4ZWN1dG9yKGV4ZWN1dG9yKSkpO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIG9uKG1hdGNoZXI6IEV2ZW50TWF0Y2hlciwgZXhlY3V0b3I6IFN1YnNjcmlwdGlvbkV4ZWN1dG9yKTogU2NvcGUge1xuICAgICAgICB0aGlzLmFkZFN1YnNjcmlwdGlvbihuZXcgRXZlbnRTdWJzY3JpcHRpb24odGhpcy5lbGVtZW50LCBtYXRjaGVyLCBleGVjdXRvcikpO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8vIFRoaXMgbWV0aG9kIGlzIGZvciB0ZXN0aW5nXG4gICAgcHJpc3RpbmUoKTogdm9pZCB7XG4gICAgICAgIGZvcihsZXQgc3Vic2NyaXB0aW9uIG9mIHRoaXMuc3Vic2NyaXB0aW9ucykge1xuICAgICAgICAgICAgc3Vic2NyaXB0aW9uLmRpc2Nvbm5lY3QoKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgdGhpcy5zdWJzY3JpcHRpb25zLnNwbGljZSgwKTtcbiAgICB9XG5cbiAgICBwcm90ZWN0ZWQgYWN0aXZhdGUoKTogdm9pZCB7XG4gICAgICAgIGlmKCF0aGlzLmlzQWN0aXZhdGVkKSB7XG4gICAgICAgICAgICB0aGlzLmlzQWN0aXZhdGVkID0gdHJ1ZTtcblxuICAgICAgICAgICAgZm9yKGxldCBzdWJzY3JpcHRpb24gb2YgdGhpcy5zdWJzY3JpcHRpb25zKSB7XG4gICAgICAgICAgICAgICAgc3Vic2NyaXB0aW9uLmNvbm5lY3QoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByb3RlY3RlZCBkZWFjdGl2YXRlKCk6IHZvaWQge1xuICAgICAgICBpZih0aGlzLmlzQWN0aXZhdGVkKSB7XG4gICAgICAgICAgICBmb3IobGV0IHN1YnNjcmlwdGlvbiBvZiB0aGlzLnN1YnNjcmlwdGlvbnMpIHtcbiAgICAgICAgICAgICAgICBzdWJzY3JpcHRpb24uZGlzY29ubmVjdCgpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLmlzQWN0aXZhdGVkID0gZmFsc2U7ICAgICAgICAgICAgXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGFkZFN1YnNjcmlwdGlvbihzdWJzY3JpcHRpb246IFN1YnNjcmlwdGlvbik6IHZvaWQge1xuICAgICAgICB0aGlzLnN1YnNjcmlwdGlvbnMucHVzaChzdWJzY3JpcHRpb24pO1xuXG4gICAgICAgIGlmKHRoaXMuaXNBY3RpdmF0ZWQpIHtcbiAgICAgICAgICAgIHN1YnNjcmlwdGlvbi5jb25uZWN0KCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIHJlbW92ZVN1YnNjcmlwdGlvbihzdWJzY3JpcHRpb246IFN1YnNjcmlwdGlvbik6IHZvaWQge1xuICAgICAgICB2YXIgaW5kZXggPSB0aGlzLnN1YnNjcmlwdGlvbnMuaW5kZXhPZihzdWJzY3JpcHRpb24pO1xuXG4gICAgICAgIGlmKGluZGV4ID49IDApIHtcbiAgICAgICAgICAgIHN1YnNjcmlwdGlvbi5kaXNjb25uZWN0KCk7XG5cbiAgICAgICAgICAgIHRoaXMuc3Vic2NyaXB0aW9ucy5zcGxpY2UoaW5kZXgsIDEpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBidWlsZFNlbGVjdEV4ZWN1dG9yKGV4ZWN1dG9yOiBTY29wZUV4ZWN1dG9yKTogU3Vic2NyaXB0aW9uRXhlY3V0b3Ige1xuICAgICAgICBsZXQgc2NvcGVzOiBTY29wZVtdID0gW107XG5cbiAgICAgICAgcmV0dXJuIChlbGVtZW50OiBFbGVtZW50LCBldmVudDogTWF0Y2hpbmdFbGVtZW50c0NoYW5nZWRFdmVudCkgPT4ge1xuICAgICAgICAgICAgZm9yKGxldCBlbGVtZW50IG9mIGV2ZW50LmFkZGVkRWxlbWVudHMpIHtcbiAgICAgICAgICAgICAgICBsZXQgc2NvcGUgPSBuZXcgU2NvcGUoZWxlbWVudCwgZXhlY3V0b3IpO1xuXG4gICAgICAgICAgICAgICAgc2NvcGVzLnB1c2goc2NvcGUpO1x0XG4gICAgICAgICAgICAgICAgc2NvcGUuYWN0aXZhdGUoKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZm9yKGxldCBlbGVtZW50IG9mIGV2ZW50LnJlbW92ZWRFbGVtZW50cykge1xuICAgICAgICAgICAgICAgIGZvcihsZXQgaW5kZXggPSAwLCBsZW5ndGggPSBzY29wZXMubGVuZ3RoLCBzY29wZSA6IFNjb3BlOyBpbmRleCA8IGxlbmd0aDsgaW5kZXgrKykge1xuICAgICAgICAgICAgICAgICAgICBzY29wZSA9IHNjb3Blc1tpbmRleF07XG5cbiAgICAgICAgICAgICAgICAgICAgaWYoc2NvcGUuZWxlbWVudCA9PT0gZWxlbWVudCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2NvcGUuZGVhY3RpdmF0ZSgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgICAgICBzY29wZXMuc3BsaWNlKGluZGV4LCAxKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgIH1cblxuICAgIHByaXZhdGUgYnVpbGRXaGVuRXhlY3V0b3IoZXhlY3V0b3I6IFNjb3BlRXhlY3V0b3IpOiBTdWJzY3JpcHRpb25FeGVjdXRvciB7XG4gICAgICAgIGxldCBzY29wZSA6IFNjb3BlID0gbnVsbDtcblxuICAgICAgICByZXR1cm4gKGVsZW1lbnQ6IEVsZW1lbnQsIGV2ZW50OiBFbGVtZW50TWF0Y2hlc0NoYW5nZWRFdmVudCkgPT4ge1xuICAgICAgICAgICAgaWYoZXZlbnQuaXNNYXRjaGluZykge1xuICAgICAgICAgICAgICAgIHNjb3BlID0gbmV3IFNjb3BlKHRoaXMuZWxlbWVudCwgZXhlY3V0b3IpO1xuICAgICAgICAgICAgICAgIHNjb3BlLmFjdGl2YXRlKCk7XG4gICAgICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgICAgICBzY29wZS5kZWFjdGl2YXRlKCk7XG4gICAgICAgICAgICAgICAgc2NvcGUgPSBudWxsO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgIH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBTY29wZUV4ZWN1dG9yIHsgKHNjb3BlOiBTY29wZSk6IHZvaWQgfTtcbmV4cG9ydCB7IEVsZW1lbnRNYXRjaGVyLCBFdmVudE1hdGNoZXIsIFN1YnNjcmlwdGlvbkV4ZWN1dG9yIH07XG4iLCJpbXBvcnQgeyBTdWJzY3JpcHRpb24sIFN1YnNjcmlwdGlvbkV4ZWN1dG9yLCBTdWJzY3JpcHRpb25FdmVudCB9IGZyb20gJy4vc3Vic2NyaXB0aW9uJztcblxuaW50ZXJmYWNlIENvbW1vbkpzUmVxdWlyZSB7XG4gICAgKGlkOiBzdHJpbmcpOiBhbnk7XG59XG5cbmRlY2xhcmUgdmFyIHJlcXVpcmU6IENvbW1vbkpzUmVxdWlyZTtcbmxldCBNdXRhdGlvbk9ic2VydmVyID0gcmVxdWlyZSgnbXV0YXRpb24tb2JzZXJ2ZXInKTsgLy8gdXNlIHBvbHlmaWxsXG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBCYXRjaGVkTXV0YXRpb25TdWJzY3JpcHRpb24gZXh0ZW5kcyBTdWJzY3JpcHRpb24ge1xuICAgIHN0YXRpYyByZWFkb25seSBtdXRhdGlvbk9ic2VydmVySW5pdDogTXV0YXRpb25PYnNlcnZlckluaXQgPSB7XG4gICAgICAgIGNoaWxkTGlzdDogdHJ1ZSxcbiAgICAgICAgYXR0cmlidXRlczogdHJ1ZSxcbiAgICAgICAgY2hhcmFjdGVyRGF0YTogdHJ1ZSxcbiAgICAgICAgc3VidHJlZTogdHJ1ZVxuICAgIH07XG5cbiAgICBwcml2YXRlIGlzTGlzdGVuaW5nIDogYm9vbGVhbiA9IGZhbHNlO1xuICAgIHByaXZhdGUgaGFuZGxlTXV0YXRpb25UaW1lb3V0IDogYW55ID0gbnVsbDtcblxuICAgIHByaXZhdGUgcmVhZG9ubHkgbXV0YXRpb25DYWxsYmFjazogTXV0YXRpb25DYWxsYmFjaztcbiAgICBwcml2YXRlIHJlYWRvbmx5IG11dGF0aW9uT2JzZXJ2ZXI6IE11dGF0aW9uT2JzZXJ2ZXI7XG5cbiAgICBjb25zdHJ1Y3RvcihlbGVtZW50OiBFbGVtZW50LCBleGVjdXRvcjogU3Vic2NyaXB0aW9uRXhlY3V0b3IpIHtcbiAgICAgICAgc3VwZXIoZWxlbWVudCwgZXhlY3V0b3IpO1xuXG4gICAgICAgIHRoaXMubXV0YXRpb25DYWxsYmFjayA9ICgpOiB2b2lkID0+IHtcbiAgICAgICAgICAgIHRoaXMuZGVmZXJIYW5kbGVNdXRhdGlvbnMoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMubXV0YXRpb25PYnNlcnZlciA9IG5ldyBNdXRhdGlvbk9ic2VydmVyKHRoaXMubXV0YXRpb25DYWxsYmFjayk7XG4gICAgfVxuXG4gICAgcHJvdGVjdGVkIHN0YXJ0TGlzdGVuaW5nKCk6IHZvaWQge1xuICAgICAgICBpZighdGhpcy5pc0xpc3RlbmluZykge1xuICAgICAgICAgICAgdGhpcy5tdXRhdGlvbk9ic2VydmVyLm9ic2VydmUodGhpcy5lbGVtZW50LCBCYXRjaGVkTXV0YXRpb25TdWJzY3JpcHRpb24ubXV0YXRpb25PYnNlcnZlckluaXQpO1xuXG4gICAgICAgICAgICB0aGlzLmlzTGlzdGVuaW5nID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByb3RlY3RlZCBzdG9wTGlzdGVuaW5nKCk6IHZvaWQge1xuICAgICAgICBpZih0aGlzLmlzTGlzdGVuaW5nKSB7XG4gICAgICAgICAgICB0aGlzLm11dGF0aW9uT2JzZXJ2ZXIuZGlzY29ubmVjdCgpO1xuICAgICAgICAgICAgdGhpcy5oYW5kbGVNdXRhdGlvbnNOb3coKTtcblxuICAgICAgICAgICAgdGhpcy5pc0xpc3RlbmluZyA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgfVxuICAgIFxuICAgIHByb3RlY3RlZCBhYnN0cmFjdCBoYW5kbGVNdXRhdGlvbnMoKTogdm9pZDtcblxuICAgIHByaXZhdGUgZGVmZXJIYW5kbGVNdXRhdGlvbnMoKTogdm9pZCB7XG4gICAgICAgIGlmKHRoaXMuaGFuZGxlTXV0YXRpb25UaW1lb3V0ID09PSBudWxsKSB7XG4gICAgICAgICAgICB0aGlzLmhhbmRsZU11dGF0aW9uVGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4geyBcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLm11dGF0aW9uT2JzZXJ2ZXIudGFrZVJlY29yZHMoKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5oYW5kbGVNdXRhdGlvbnMoKTtcbiAgICAgICAgICAgICAgICB9ZmluYWxseXtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5oYW5kbGVNdXRhdGlvblRpbWVvdXQgPSBudWxsO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sIDApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBoYW5kbGVNdXRhdGlvbnNOb3coKTogdm9pZCB7XG4gICAgICAgIGlmKHRoaXMuaGFuZGxlTXV0YXRpb25UaW1lb3V0ICE9PSBudWxsKSB7XG4gICAgICAgICAgICBjbGVhclRpbWVvdXQodGhpcy5oYW5kbGVNdXRhdGlvblRpbWVvdXQpO1xuICAgICAgICAgICAgdGhpcy5oYW5kbGVNdXRhdGlvblRpbWVvdXQgPSBudWxsO1xuXG4gICAgICAgICAgICB0aGlzLmhhbmRsZU11dGF0aW9ucygpOyAgICAgICAgICAgIFxuICAgICAgICB9XG4gICAgfVxufVxuXG5leHBvcnQgeyBTdWJzY3JpcHRpb24sIFN1YnNjcmlwdGlvbkV4ZWN1dG9yLCBTdWJzY3JpcHRpb25FdmVudCB9OyIsImltcG9ydCB7IEJhdGNoZWRNdXRhdGlvblN1YnNjcmlwdGlvbiwgU3Vic2NyaXB0aW9uRXhlY3V0b3IsIFN1YnNjcmlwdGlvbkV2ZW50IH0gZnJvbSAnLi9iYXRjaGVkX211dGF0aW9uX3N1YnNjcmlwdGlvbic7XG5pbXBvcnQgeyBFbGVtZW50TWF0Y2hlciwgRWxlbWVudENvbGxlY3RvciB9IGZyb20gJy4uL2VsZW1lbnRfY29sbGVjdG9yJztcblxuZXhwb3J0IGNsYXNzIEVsZW1lbnRNYXRjaGVzU3Vic2NyaXB0aW9uIGV4dGVuZHMgQmF0Y2hlZE11dGF0aW9uU3Vic2NyaXB0aW9uIHtcbiAgICByZWFkb25seSBtYXRjaGVyOiBFbGVtZW50TWF0Y2hlcjtcblxuICAgIHByaXZhdGUgaXNDb25uZWN0ZWQ6IGJvb2xlYW4gPSBmYWxzZTtcbiAgICBwcml2YXRlIGlzTWF0Y2hpbmdFbGVtZW50OiBib29sZWFuID0gZmFsc2U7XG5cbiAgICBjb25zdHJ1Y3RvcihlbGVtZW50OiBFbGVtZW50LCBtYXRjaGVyOiBFbGVtZW50TWF0Y2hlciwgZXhlY3V0b3I6IFN1YnNjcmlwdGlvbkV4ZWN1dG9yKSB7XG4gICAgICAgIHN1cGVyKGVsZW1lbnQsIGV4ZWN1dG9yKTtcblxuICAgICAgICB0aGlzLm1hdGNoZXIgPSBtYXRjaGVyO1xuICAgIH1cblxuICAgIGNvbm5lY3QoKTogdm9pZCB7XG4gICAgICAgIGlmKCF0aGlzLmlzQ29ubmVjdGVkKSB7XG4gICAgICAgICAgICB0aGlzLnVwZGF0ZUlzTWF0Y2hpbmdFbGVtZW50KHRoaXMuY29tcHV0ZUlzTWF0Y2hpbmdFbGVtZW50KCkpO1xuICAgICAgICAgICAgdGhpcy5zdGFydExpc3RlbmluZygpO1xuXG4gICAgICAgICAgICB0aGlzLmlzQ29ubmVjdGVkID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGRpc2Nvbm5lY3QoKTogdm9pZCB7XG4gICAgICAgIGlmKHRoaXMuaXNDb25uZWN0ZWQpIHtcbiAgICAgICAgICAgIHRoaXMudXBkYXRlSXNNYXRjaGluZ0VsZW1lbnQoZmFsc2UpO1xuICAgICAgICAgICAgdGhpcy5zdG9wTGlzdGVuaW5nKCk7XG5cbiAgICAgICAgICAgIHRoaXMuaXNDb25uZWN0ZWQgPSBmYWxzZTtcbiAgICAgICAgfSAgICAgICAgXG4gICAgfVxuXG4gICAgcHJvdGVjdGVkIGhhbmRsZU11dGF0aW9ucygpOiB2b2lkIHtcbiAgICAgICAgdGhpcy51cGRhdGVJc01hdGNoaW5nRWxlbWVudCh0aGlzLmNvbXB1dGVJc01hdGNoaW5nRWxlbWVudCgpKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHVwZGF0ZUlzTWF0Y2hpbmdFbGVtZW50KGlzTWF0Y2hpbmdFbGVtZW50OiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIGxldCB3YXNNYXRjaGluZ0VsZW1lbnQgPSB0aGlzLmlzTWF0Y2hpbmdFbGVtZW50O1xuICAgICAgICB0aGlzLmlzTWF0Y2hpbmdFbGVtZW50ID0gaXNNYXRjaGluZ0VsZW1lbnQ7XG5cbiAgICAgICAgaWYod2FzTWF0Y2hpbmdFbGVtZW50ICE9PSBpc01hdGNoaW5nRWxlbWVudCkge1xuICAgICAgICAgICAgbGV0IGV2ZW50ID0gbmV3IEVsZW1lbnRNYXRjaGVzQ2hhbmdlZEV2ZW50KHRoaXMsIGlzTWF0Y2hpbmdFbGVtZW50KTtcblxuICAgICAgICAgICAgdGhpcy5leGVjdXRvcih0aGlzLmVsZW1lbnQsIGV2ZW50KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgY29tcHV0ZUlzTWF0Y2hpbmdFbGVtZW50KCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gRWxlbWVudENvbGxlY3Rvci5pc01hdGNoaW5nRWxlbWVudCh0aGlzLmVsZW1lbnQsIHRoaXMubWF0Y2hlcik7XG4gICAgfVxufVxuXG5leHBvcnQgY2xhc3MgRWxlbWVudE1hdGNoZXNDaGFuZ2VkRXZlbnQgZXh0ZW5kcyBTdWJzY3JpcHRpb25FdmVudCB7XG4gICAgcmVhZG9ubHkgZWxlbWVudE1hdGNoZXNTdWJzY3JpcHRpb246IEVsZW1lbnRNYXRjaGVzU3Vic2NyaXB0aW9uO1xuICAgIHJlYWRvbmx5IGlzTWF0Y2hpbmc6IGJvb2xlYW47XG5cbiAgICBjb25zdHJ1Y3RvcihlbGVtZW50TWF0Y2hlc1N1YnNjcmlwdGlvbjogRWxlbWVudE1hdGNoZXNTdWJzY3JpcHRpb24sIGlzTWF0Y2hpbmc6IGJvb2xlYW4pIHtcbiAgICAgICAgc3VwZXIoJ0VsZW1lbnRNYXRjaGVzQ2hhbmdlZEV2ZW50JylcblxuICAgICAgICB0aGlzLmVsZW1lbnRNYXRjaGVzU3Vic2NyaXB0aW9uID0gZWxlbWVudE1hdGNoZXNTdWJzY3JpcHRpb247XG4gICAgICAgIHRoaXMuaXNNYXRjaGluZyA9IGlzTWF0Y2hpbmc7XG4gICAgfVxufVxuXG5leHBvcnQgeyBFbGVtZW50TWF0Y2hlciB9O1xuIiwiaW1wb3J0IHsgU3Vic2NyaXB0aW9uLCBTdWJzY3JpcHRpb25FeGVjdXRvciB9IGZyb20gJy4vc3Vic2NyaXB0aW9uJztcblxuZXhwb3J0IGNsYXNzIEV2ZW50U3Vic2NyaXB0aW9uIGV4dGVuZHMgU3Vic2NyaXB0aW9uIHtcbiAgICByZWFkb25seSBldmVudE1hdGNoZXI6IEV2ZW50TWF0Y2hlcjtcblxuICAgIHByaXZhdGUgaXNDb25uZWN0ZWQgOiBib29sZWFuID0gZmFsc2U7ICAgIFxuICAgIHByaXZhdGUgcmVhZG9ubHkgZXZlbnRMaXN0ZW5lcjogRXZlbnRMaXN0ZW5lcjtcbiAgICBwcml2YXRlIHJlYWRvbmx5IGV2ZW50TmFtZXM6IHN0cmluZ1tdO1xuXG4gICAgY29uc3RydWN0b3IoZWxlbWVudDogRWxlbWVudCwgZXZlbnRNYXRjaGVyOiBFdmVudE1hdGNoZXIsIGV4ZWN1dG9yOiBTdWJzY3JpcHRpb25FeGVjdXRvcikge1xuICAgICAgICBzdXBlcihlbGVtZW50LCBleGVjdXRvcik7XG5cbiAgICAgICAgdGhpcy5ldmVudE1hdGNoZXIgPSBldmVudE1hdGNoZXI7XG4gICAgICAgIHRoaXMuZXZlbnROYW1lcyA9IHRoaXMucGFyc2VFdmVudE1hdGNoZXIodGhpcy5ldmVudE1hdGNoZXIpO1xuXG4gICAgICAgIHRoaXMuZXZlbnRMaXN0ZW5lciA9IChldmVudDogRXZlbnQpOiB2b2lkID0+IHtcbiAgICAgICAgICAgIHRoaXMuaGFuZGxlRXZlbnQoZXZlbnQpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgY29ubmVjdCgpOiB2b2lkIHtcbiAgICAgICAgaWYoIXRoaXMuaXNDb25uZWN0ZWQpIHtcbiAgICAgICAgICAgIHRoaXMuaXNDb25uZWN0ZWQgPSB0cnVlO1xuXG4gICAgICAgICAgICBmb3IobGV0IGV2ZW50TmFtZSBvZiB0aGlzLmV2ZW50TmFtZXMpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihldmVudE5hbWUsIHRoaXMuZXZlbnRMaXN0ZW5lciwgZmFsc2UpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgZGlzY29ubmVjdCgpOiB2b2lkIHtcbiAgICAgICAgaWYodGhpcy5pc0Nvbm5lY3RlZCkge1xuICAgICAgICAgICAgZm9yKGxldCBldmVudE5hbWUgb2YgdGhpcy5ldmVudE5hbWVzKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5lbGVtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoZXZlbnROYW1lLCB0aGlzLmV2ZW50TGlzdGVuZXIsIGZhbHNlKTtcbiAgICAgICAgICAgIH0gICAgICAgICAgICBcblxuICAgICAgICAgICAgdGhpcy5pc0Nvbm5lY3RlZCA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBoYW5kbGVFdmVudChldmVudDogRXZlbnQpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5leGVjdXRvcih0aGlzLmVsZW1lbnQsIGV2ZW50KTsgICAgICAgICBcbiAgICB9XG5cbiAgICBwcml2YXRlIHBhcnNlRXZlbnRNYXRjaGVyKGV2ZW50TWF0Y2hlcjogRXZlbnRNYXRjaGVyKTogc3RyaW5nW10ge1xuICAgICAgICAvLyBUT0RPOiBTdXBwb3J0IGFsbCBvZiB0aGUgalF1ZXJ5IHN0eWxlIGV2ZW50IG9wdGlvbnNcbiAgICAgICAgcmV0dXJuIGV2ZW50TWF0Y2hlci5zcGxpdCgnICcpO1xuICAgIH0gXG59XG5cbmV4cG9ydCBkZWNsYXJlIHR5cGUgRXZlbnRNYXRjaGVyID0gc3RyaW5nO1xuIiwiaW1wb3J0IHsgQmF0Y2hlZE11dGF0aW9uU3Vic2NyaXB0aW9uLCBTdWJzY3JpcHRpb25FeGVjdXRvciwgU3Vic2NyaXB0aW9uRXZlbnQgfSBmcm9tICcuL2JhdGNoZWRfbXV0YXRpb25fc3Vic2NyaXB0aW9uJztcbmltcG9ydCB7IEVsZW1lbnRNYXRjaGVyLCBFbGVtZW50Q29sbGVjdG9yIH0gZnJvbSAnLi4vZWxlbWVudF9jb2xsZWN0b3InO1xuXG5leHBvcnQgY2xhc3MgTWF0Y2hpbmdFbGVtZW50c1N1YnNjcmlwdGlvbiBleHRlbmRzIEJhdGNoZWRNdXRhdGlvblN1YnNjcmlwdGlvbiB7XG4gICAgcmVhZG9ubHkgbWF0Y2hlcjogRWxlbWVudE1hdGNoZXI7XG5cbiAgICBwcml2YXRlIGlzQ29ubmVjdGVkOiBib29sZWFuID0gZmFsc2U7XG4gICAgcHJpdmF0ZSBtYXRjaGluZ0VsZW1lbnRzOiBFbGVtZW50W10gPSBbXTtcblxuICAgIGNvbnN0cnVjdG9yKGVsZW1lbnQ6IEVsZW1lbnQsIG1hdGNoZXI6IEVsZW1lbnRNYXRjaGVyLCBleGVjdXRvcjogU3Vic2NyaXB0aW9uRXhlY3V0b3IpIHtcbiAgICAgICAgc3VwZXIoZWxlbWVudCwgZXhlY3V0b3IpO1xuXG4gICAgICAgIHRoaXMubWF0Y2hlciA9IG1hdGNoZXI7XG4gICAgfVxuXG4gICAgY29ubmVjdCgpOiB2b2lkIHtcbiAgICAgICAgaWYoIXRoaXMuaXNDb25uZWN0ZWQpIHtcbiAgICAgICAgICAgIHRoaXMudXBkYXRlTWF0Y2hpbmdFbGVtZW50cyh0aGlzLmNvbGxlY3RNYXRjaGluZ0VsZW1lbnRzKCkpO1xuICAgICAgICAgICAgdGhpcy5zdGFydExpc3RlbmluZygpO1xuXG4gICAgICAgICAgICB0aGlzLmlzQ29ubmVjdGVkID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGRpc2Nvbm5lY3QoKTogdm9pZCB7XG4gICAgICAgIGlmKHRoaXMuaXNDb25uZWN0ZWQpIHtcbiAgICAgICAgICAgIHRoaXMudXBkYXRlTWF0Y2hpbmdFbGVtZW50cyhbXSk7XG4gICAgICAgICAgICB0aGlzLnN0b3BMaXN0ZW5pbmcoKTtcblxuICAgICAgICAgICAgdGhpcy5pc0Nvbm5lY3RlZCA9IGZhbHNlO1xuICAgICAgICB9ICAgICAgICBcbiAgICB9XG5cbiAgICBwcm90ZWN0ZWQgaGFuZGxlTXV0YXRpb25zKCk6IHZvaWQge1xuICAgICAgICB0aGlzLnVwZGF0ZU1hdGNoaW5nRWxlbWVudHModGhpcy5jb2xsZWN0TWF0Y2hpbmdFbGVtZW50cygpKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHVwZGF0ZU1hdGNoaW5nRWxlbWVudHMobWF0Y2hpbmdFbGVtZW50czogRWxlbWVudFtdKTogdm9pZCB7XG4gICAgICAgIGxldCBwcmV2aW91c2x5TWF0Y2hpbmdFbGVtZW50cyA9IHRoaXMubWF0Y2hpbmdFbGVtZW50cztcblxuICAgICAgICBsZXQgYWRkZWRFbGVtZW50cyA9IGFycmF5U3VidHJhY3QobWF0Y2hpbmdFbGVtZW50cywgcHJldmlvdXNseU1hdGNoaW5nRWxlbWVudHMpO1xuICAgICAgICBsZXQgcmVtb3ZlZEVsZW1lbnRzID0gYXJyYXlTdWJ0cmFjdChwcmV2aW91c2x5TWF0Y2hpbmdFbGVtZW50cywgbWF0Y2hpbmdFbGVtZW50cyk7XG5cbiAgICAgICAgdGhpcy5tYXRjaGluZ0VsZW1lbnRzID0gbWF0Y2hpbmdFbGVtZW50czsgICBcbiAgICAgICAgXG4gICAgICAgIGlmKGFkZGVkRWxlbWVudHMubGVuZ3RoID4gMCB8fCByZW1vdmVkRWxlbWVudHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgbGV0IGV2ZW50ID0gbmV3IE1hdGNoaW5nRWxlbWVudHNDaGFuZ2VkRXZlbnQodGhpcywgYWRkZWRFbGVtZW50cywgcmVtb3ZlZEVsZW1lbnRzKTtcblxuICAgICAgICAgICAgdGhpcy5leGVjdXRvcih0aGlzLmVsZW1lbnQsIGV2ZW50KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgY29sbGVjdE1hdGNoaW5nRWxlbWVudHMoKTogRWxlbWVudFtdIHtcbiAgICAgICAgcmV0dXJuIEVsZW1lbnRDb2xsZWN0b3IuY29sbGVjdE1hdGNoaW5nRWxlbWVudHModGhpcy5lbGVtZW50LCB0aGlzLm1hdGNoZXIpO1xuICAgIH1cbn1cblxuZXhwb3J0IGNsYXNzIE1hdGNoaW5nRWxlbWVudHNDaGFuZ2VkRXZlbnQgZXh0ZW5kcyBTdWJzY3JpcHRpb25FdmVudCB7XG4gICAgcmVhZG9ubHkgbWF0Y2hpbmdFbGVtZW50c1N1YnNjcmlwdGlvbjogTWF0Y2hpbmdFbGVtZW50c1N1YnNjcmlwdGlvbjtcbiAgICByZWFkb25seSBhZGRlZEVsZW1lbnRzOiBFbGVtZW50W107XG4gICAgcmVhZG9ubHkgcmVtb3ZlZEVsZW1lbnRzOiBFbGVtZW50W107XG5cbiAgICBjb25zdHJ1Y3RvcihtYXRjaGluZ0VsZW1lbnRzU3Vic2NyaXB0aW9uOiBNYXRjaGluZ0VsZW1lbnRzU3Vic2NyaXB0aW9uLCBhZGRlZEVsZW1lbnRzOiBFbGVtZW50W10sIHJlbW92ZWRFbGVtZW50czogRWxlbWVudFtdKSB7XG4gICAgICAgIHN1cGVyKCdNYXRjaGluZ0VsZW1lbnRzQ2hhbmdlZCcpXG5cbiAgICAgICAgdGhpcy5tYXRjaGluZ0VsZW1lbnRzU3Vic2NyaXB0aW9uID0gbWF0Y2hpbmdFbGVtZW50c1N1YnNjcmlwdGlvbjtcbiAgICAgICAgdGhpcy5hZGRlZEVsZW1lbnRzID0gYWRkZWRFbGVtZW50cztcbiAgICAgICAgdGhpcy5yZW1vdmVkRWxlbWVudHMgPSByZW1vdmVkRWxlbWVudHM7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBhcnJheVN1YnRyYWN0PFQ+KG1pbnVlbmQ6IFRbXSwgc3VidHJhaGVuZDogVFtdKTogVFtdIHtcbiAgICBsZXQgZGlmZmVyZW5jZTogVFtdID0gW107XG5cbiAgICBmb3IobGV0IG1lbWJlciBvZiBtaW51ZW5kKSB7XG4gICAgICAgIGlmKHN1YnRyYWhlbmQuaW5kZXhPZihtZW1iZXIpID09PSAtMSkge1xuICAgICAgICAgICAgZGlmZmVyZW5jZS5wdXNoKG1lbWJlcik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gZGlmZmVyZW5jZTtcbn0iLCJleHBvcnQgYWJzdHJhY3QgY2xhc3MgU3Vic2NyaXB0aW9uIHtcbiAgICBwcm90ZWN0ZWQgcmVhZG9ubHkgZXhlY3V0b3I6IFN1YnNjcmlwdGlvbkV4ZWN1dG9yO1xuICAgIHByb3RlY3RlZCByZWFkb25seSBlbGVtZW50OiBFbGVtZW50O1xuICAgIFxuICAgIGNvbnN0cnVjdG9yKGVsZW1lbnQ6IEVsZW1lbnQsIGV4ZWN1dG9yOiBTdWJzY3JpcHRpb25FeGVjdXRvcikge1xuICAgICAgICB0aGlzLmVsZW1lbnQgPSBlbGVtZW50O1xuICAgICAgICB0aGlzLmV4ZWN1dG9yID0gZXhlY3V0b3I7XG4gICAgfVxuXG4gICAgYWJzdHJhY3QgY29ubmVjdCgpIDogdm9pZDtcbiAgICBhYnN0cmFjdCBkaXNjb25uZWN0KCkgOiB2b2lkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN1YnNjcmlwdGlvbkV4ZWN1dG9yIHsgXG4gICAgKGVsZW1lbnQ6IEVsZW1lbnQsIGV2ZW50PzogRXZlbnQgfCBTdWJzY3JpcHRpb25FdmVudCk6IHZvaWQgXG59XG5cbmV4cG9ydCBjbGFzcyBTdWJzY3JpcHRpb25FdmVudCB7XG4gICAgcmVhZG9ubHkgbmFtZSA6IHN0cmluZztcblxuICAgIGNvbnN0cnVjdG9yKG5hbWUgOiBzdHJpbmcpIHtcbiAgICAgICAgdGhpcy5uYW1lID0gbmFtZTtcbiAgICB9XG59XG4iLCJpbXBvcnQgeyBTdWJzY3JpcHRpb24sIFN1YnNjcmlwdGlvbkV4ZWN1dG9yIH0gZnJvbSAnLi9zdWJzY3JpcHRpb24nO1xuXG5leHBvcnQgaW50ZXJmYWNlIFRyaXZpYWxTdWJzY3JpcHRpb25Db25maWd1cmF0aW9uIHtcbiAgICBjb25uZWN0ZWQ/OiBib29sZWFuLFxuICAgIGRpc2Nvbm5lY3RlZD86IGJvb2xlYW5cbn1cblxuZXhwb3J0IGNsYXNzIFRyaXZpYWxTdWJzY3JpcHRpb24gZXh0ZW5kcyBTdWJzY3JpcHRpb24ge1xuICAgIHByaXZhdGUgaXNDb25uZWN0ZWQ6IGJvb2xlYW4gPSBmYWxzZTtcbiAgICBwcml2YXRlIGNvbmZpZzogVHJpdmlhbFN1YnNjcmlwdGlvbkNvbmZpZ3VyYXRpb247XG5cbiAgICBjb25zdHJ1Y3RvcihlbGVtZW50OiBFbGVtZW50LCBjb25maWc6IFRyaXZpYWxTdWJzY3JpcHRpb25Db25maWd1cmF0aW9uLCBleGVjdXRvcjogU3Vic2NyaXB0aW9uRXhlY3V0b3IpIHtcbiAgICAgICAgc3VwZXIoZWxlbWVudCwgZXhlY3V0b3IpO1xuXG4gICAgICAgIHRoaXMuY29uZmlnID0gY29uZmlnO1xuICAgIH1cblxuICAgIGNvbm5lY3QoKSB7XG4gICAgICAgIGlmKCF0aGlzLmlzQ29ubmVjdGVkKSB7XG4gICAgICAgICAgICB0aGlzLmlzQ29ubmVjdGVkID0gdHJ1ZTtcblxuICAgICAgICAgICAgaWYodGhpcy5jb25maWcuY29ubmVjdGVkKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5leGVjdXRvcih0aGlzLmVsZW1lbnQpOyAgICAgICAgICAgIFxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgZGlzY29ubmVjdCgpIHtcbiAgICAgICAgaWYodGhpcy5pc0Nvbm5lY3RlZCkge1xuICAgICAgICAgICAgdGhpcy5pc0Nvbm5lY3RlZCA9IGZhbHNlO1xuXG4gICAgICAgICAgICBpZih0aGlzLmNvbmZpZy5kaXNjb25uZWN0ZWQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmV4ZWN1dG9yKHRoaXMuZWxlbWVudCk7ICAgICAgICAgICAgXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG59Il19
