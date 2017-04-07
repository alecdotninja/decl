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
        var self = this.name + ' (' + this.subscriptions.length + ')';
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
            if (this.childScopes.length > 0) {
                console.warn('Bug detected!', this, 'is trying to deactivate with leftover children', this.childScopes, '! Recovering...');
                var childScope = void 0;
                while (childScope = this.childScopes[0]) {
                    this.destroyChildScope(childScope);
                }
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvbXV0YXRpb24tb2JzZXJ2ZXIvaW5kZXguanMiLCJzcmMvZGVjbC50cyIsInNyYy9lbGVtZW50X2NvbGxlY3Rvci50cyIsInNyYy9zY29wZS50cyIsInNyYy9zdWJzY3JpcHRpb25zL2JhdGNoZWRfbXV0YXRpb25fc3Vic2NyaXB0aW9uLnRzIiwic3JjL3N1YnNjcmlwdGlvbnMvZWxlbWVudF9tYXRjaGVzX3N1YnNjcmlwdGlvbi50cyIsInNyYy9zdWJzY3JpcHRpb25zL2V2ZW50X3N1YnNjcmlwdGlvbi50cyIsInNyYy9zdWJzY3JpcHRpb25zL21hdGNoaW5nX2VsZW1lbnRzX3N1YnNjcmlwdGlvbi50cyIsInNyYy9zdWJzY3JpcHRpb25zL3N1YnNjcmlwdGlvbi50cyIsInNyYy9zdWJzY3JpcHRpb25zL3RyaXZpYWxfc3Vic2NyaXB0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFD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O0FBQUQsQ0FqQ0EsQUFpQ0MsQ0FqQ3dDLDJCQUFZLEdBaUNwRDtBQWpDWSxrREFBbUIiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwidmFyIE11dGF0aW9uT2JzZXJ2ZXIgPSB3aW5kb3cuTXV0YXRpb25PYnNlcnZlclxuICB8fCB3aW5kb3cuV2ViS2l0TXV0YXRpb25PYnNlcnZlclxuICB8fCB3aW5kb3cuTW96TXV0YXRpb25PYnNlcnZlcjtcblxuLypcbiAqIENvcHlyaWdodCAyMDEyIFRoZSBQb2x5bWVyIEF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiBVc2Ugb2YgdGhpcyBzb3VyY2UgY29kZSBpcyBnb3ZlcmVuZWQgYnkgYSBCU0Qtc3R5bGVcbiAqIGxpY2Vuc2UgdGhhdCBjYW4gYmUgZm91bmQgaW4gdGhlIExJQ0VOU0UgZmlsZS5cbiAqL1xuXG52YXIgV2Vha01hcCA9IHdpbmRvdy5XZWFrTWFwO1xuXG5pZiAodHlwZW9mIFdlYWtNYXAgPT09ICd1bmRlZmluZWQnKSB7XG4gIHZhciBkZWZpbmVQcm9wZXJ0eSA9IE9iamVjdC5kZWZpbmVQcm9wZXJ0eTtcbiAgdmFyIGNvdW50ZXIgPSBEYXRlLm5vdygpICUgMWU5O1xuXG4gIFdlYWtNYXAgPSBmdW5jdGlvbigpIHtcbiAgICB0aGlzLm5hbWUgPSAnX19zdCcgKyAoTWF0aC5yYW5kb20oKSAqIDFlOSA+Pj4gMCkgKyAoY291bnRlcisrICsgJ19fJyk7XG4gIH07XG5cbiAgV2Vha01hcC5wcm90b3R5cGUgPSB7XG4gICAgc2V0OiBmdW5jdGlvbihrZXksIHZhbHVlKSB7XG4gICAgICB2YXIgZW50cnkgPSBrZXlbdGhpcy5uYW1lXTtcbiAgICAgIGlmIChlbnRyeSAmJiBlbnRyeVswXSA9PT0ga2V5KVxuICAgICAgICBlbnRyeVsxXSA9IHZhbHVlO1xuICAgICAgZWxzZVxuICAgICAgICBkZWZpbmVQcm9wZXJ0eShrZXksIHRoaXMubmFtZSwge3ZhbHVlOiBba2V5LCB2YWx1ZV0sIHdyaXRhYmxlOiB0cnVlfSk7XG4gICAgICByZXR1cm4gdGhpcztcbiAgICB9LFxuICAgIGdldDogZnVuY3Rpb24oa2V5KSB7XG4gICAgICB2YXIgZW50cnk7XG4gICAgICByZXR1cm4gKGVudHJ5ID0ga2V5W3RoaXMubmFtZV0pICYmIGVudHJ5WzBdID09PSBrZXkgP1xuICAgICAgICAgIGVudHJ5WzFdIDogdW5kZWZpbmVkO1xuICAgIH0sXG4gICAgJ2RlbGV0ZSc6IGZ1bmN0aW9uKGtleSkge1xuICAgICAgdmFyIGVudHJ5ID0ga2V5W3RoaXMubmFtZV07XG4gICAgICBpZiAoIWVudHJ5KSByZXR1cm4gZmFsc2U7XG4gICAgICB2YXIgaGFzVmFsdWUgPSBlbnRyeVswXSA9PT0ga2V5O1xuICAgICAgZW50cnlbMF0gPSBlbnRyeVsxXSA9IHVuZGVmaW5lZDtcbiAgICAgIHJldHVybiBoYXNWYWx1ZTtcbiAgICB9LFxuICAgIGhhczogZnVuY3Rpb24oa2V5KSB7XG4gICAgICB2YXIgZW50cnkgPSBrZXlbdGhpcy5uYW1lXTtcbiAgICAgIGlmICghZW50cnkpIHJldHVybiBmYWxzZTtcbiAgICAgIHJldHVybiBlbnRyeVswXSA9PT0ga2V5O1xuICAgIH1cbiAgfTtcbn1cblxudmFyIHJlZ2lzdHJhdGlvbnNUYWJsZSA9IG5ldyBXZWFrTWFwKCk7XG5cbi8vIFdlIHVzZSBzZXRJbW1lZGlhdGUgb3IgcG9zdE1lc3NhZ2UgZm9yIG91ciBmdXR1cmUgY2FsbGJhY2suXG52YXIgc2V0SW1tZWRpYXRlID0gd2luZG93Lm1zU2V0SW1tZWRpYXRlO1xuXG4vLyBVc2UgcG9zdCBtZXNzYWdlIHRvIGVtdWxhdGUgc2V0SW1tZWRpYXRlLlxuaWYgKCFzZXRJbW1lZGlhdGUpIHtcbiAgdmFyIHNldEltbWVkaWF0ZVF1ZXVlID0gW107XG4gIHZhciBzZW50aW5lbCA9IFN0cmluZyhNYXRoLnJhbmRvbSgpKTtcbiAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ21lc3NhZ2UnLCBmdW5jdGlvbihlKSB7XG4gICAgaWYgKGUuZGF0YSA9PT0gc2VudGluZWwpIHtcbiAgICAgIHZhciBxdWV1ZSA9IHNldEltbWVkaWF0ZVF1ZXVlO1xuICAgICAgc2V0SW1tZWRpYXRlUXVldWUgPSBbXTtcbiAgICAgIHF1ZXVlLmZvckVhY2goZnVuY3Rpb24oZnVuYykge1xuICAgICAgICBmdW5jKCk7XG4gICAgICB9KTtcbiAgICB9XG4gIH0pO1xuICBzZXRJbW1lZGlhdGUgPSBmdW5jdGlvbihmdW5jKSB7XG4gICAgc2V0SW1tZWRpYXRlUXVldWUucHVzaChmdW5jKTtcbiAgICB3aW5kb3cucG9zdE1lc3NhZ2Uoc2VudGluZWwsICcqJyk7XG4gIH07XG59XG5cbi8vIFRoaXMgaXMgdXNlZCB0byBlbnN1cmUgdGhhdCB3ZSBuZXZlciBzY2hlZHVsZSAyIGNhbGxhcyB0byBzZXRJbW1lZGlhdGVcbnZhciBpc1NjaGVkdWxlZCA9IGZhbHNlO1xuXG4vLyBLZWVwIHRyYWNrIG9mIG9ic2VydmVycyB0aGF0IG5lZWRzIHRvIGJlIG5vdGlmaWVkIG5leHQgdGltZS5cbnZhciBzY2hlZHVsZWRPYnNlcnZlcnMgPSBbXTtcblxuLyoqXG4gKiBTY2hlZHVsZXMgfGRpc3BhdGNoQ2FsbGJhY2t8IHRvIGJlIGNhbGxlZCBpbiB0aGUgZnV0dXJlLlxuICogQHBhcmFtIHtNdXRhdGlvbk9ic2VydmVyfSBvYnNlcnZlclxuICovXG5mdW5jdGlvbiBzY2hlZHVsZUNhbGxiYWNrKG9ic2VydmVyKSB7XG4gIHNjaGVkdWxlZE9ic2VydmVycy5wdXNoKG9ic2VydmVyKTtcbiAgaWYgKCFpc1NjaGVkdWxlZCkge1xuICAgIGlzU2NoZWR1bGVkID0gdHJ1ZTtcbiAgICBzZXRJbW1lZGlhdGUoZGlzcGF0Y2hDYWxsYmFja3MpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHdyYXBJZk5lZWRlZChub2RlKSB7XG4gIHJldHVybiB3aW5kb3cuU2hhZG93RE9NUG9seWZpbGwgJiZcbiAgICAgIHdpbmRvdy5TaGFkb3dET01Qb2x5ZmlsbC53cmFwSWZOZWVkZWQobm9kZSkgfHxcbiAgICAgIG5vZGU7XG59XG5cbmZ1bmN0aW9uIGRpc3BhdGNoQ2FsbGJhY2tzKCkge1xuICAvLyBodHRwOi8vZG9tLnNwZWMud2hhdHdnLm9yZy8jbXV0YXRpb24tb2JzZXJ2ZXJzXG5cbiAgaXNTY2hlZHVsZWQgPSBmYWxzZTsgLy8gVXNlZCB0byBhbGxvdyBhIG5ldyBzZXRJbW1lZGlhdGUgY2FsbCBhYm92ZS5cblxuICB2YXIgb2JzZXJ2ZXJzID0gc2NoZWR1bGVkT2JzZXJ2ZXJzO1xuICBzY2hlZHVsZWRPYnNlcnZlcnMgPSBbXTtcbiAgLy8gU29ydCBvYnNlcnZlcnMgYmFzZWQgb24gdGhlaXIgY3JlYXRpb24gVUlEIChpbmNyZW1lbnRhbCkuXG4gIG9ic2VydmVycy5zb3J0KGZ1bmN0aW9uKG8xLCBvMikge1xuICAgIHJldHVybiBvMS51aWRfIC0gbzIudWlkXztcbiAgfSk7XG5cbiAgdmFyIGFueU5vbkVtcHR5ID0gZmFsc2U7XG4gIG9ic2VydmVycy5mb3JFYWNoKGZ1bmN0aW9uKG9ic2VydmVyKSB7XG5cbiAgICAvLyAyLjEsIDIuMlxuICAgIHZhciBxdWV1ZSA9IG9ic2VydmVyLnRha2VSZWNvcmRzKCk7XG4gICAgLy8gMi4zLiBSZW1vdmUgYWxsIHRyYW5zaWVudCByZWdpc3RlcmVkIG9ic2VydmVycyB3aG9zZSBvYnNlcnZlciBpcyBtby5cbiAgICByZW1vdmVUcmFuc2llbnRPYnNlcnZlcnNGb3Iob2JzZXJ2ZXIpO1xuXG4gICAgLy8gMi40XG4gICAgaWYgKHF1ZXVlLmxlbmd0aCkge1xuICAgICAgb2JzZXJ2ZXIuY2FsbGJhY2tfKHF1ZXVlLCBvYnNlcnZlcik7XG4gICAgICBhbnlOb25FbXB0eSA9IHRydWU7XG4gICAgfVxuICB9KTtcblxuICAvLyAzLlxuICBpZiAoYW55Tm9uRW1wdHkpXG4gICAgZGlzcGF0Y2hDYWxsYmFja3MoKTtcbn1cblxuZnVuY3Rpb24gcmVtb3ZlVHJhbnNpZW50T2JzZXJ2ZXJzRm9yKG9ic2VydmVyKSB7XG4gIG9ic2VydmVyLm5vZGVzXy5mb3JFYWNoKGZ1bmN0aW9uKG5vZGUpIHtcbiAgICB2YXIgcmVnaXN0cmF0aW9ucyA9IHJlZ2lzdHJhdGlvbnNUYWJsZS5nZXQobm9kZSk7XG4gICAgaWYgKCFyZWdpc3RyYXRpb25zKVxuICAgICAgcmV0dXJuO1xuICAgIHJlZ2lzdHJhdGlvbnMuZm9yRWFjaChmdW5jdGlvbihyZWdpc3RyYXRpb24pIHtcbiAgICAgIGlmIChyZWdpc3RyYXRpb24ub2JzZXJ2ZXIgPT09IG9ic2VydmVyKVxuICAgICAgICByZWdpc3RyYXRpb24ucmVtb3ZlVHJhbnNpZW50T2JzZXJ2ZXJzKCk7XG4gICAgfSk7XG4gIH0pO1xufVxuXG4vKipcbiAqIFRoaXMgZnVuY3Rpb24gaXMgdXNlZCBmb3IgdGhlIFwiRm9yIGVhY2ggcmVnaXN0ZXJlZCBvYnNlcnZlciBvYnNlcnZlciAod2l0aFxuICogb2JzZXJ2ZXIncyBvcHRpb25zIGFzIG9wdGlvbnMpIGluIHRhcmdldCdzIGxpc3Qgb2YgcmVnaXN0ZXJlZCBvYnNlcnZlcnMsXG4gKiBydW4gdGhlc2Ugc3Vic3RlcHM6XCIgYW5kIHRoZSBcIkZvciBlYWNoIGFuY2VzdG9yIGFuY2VzdG9yIG9mIHRhcmdldCwgYW5kIGZvclxuICogZWFjaCByZWdpc3RlcmVkIG9ic2VydmVyIG9ic2VydmVyICh3aXRoIG9wdGlvbnMgb3B0aW9ucykgaW4gYW5jZXN0b3IncyBsaXN0XG4gKiBvZiByZWdpc3RlcmVkIG9ic2VydmVycywgcnVuIHRoZXNlIHN1YnN0ZXBzOlwiIHBhcnQgb2YgdGhlIGFsZ29yaXRobXMuIFRoZVxuICogfG9wdGlvbnMuc3VidHJlZXwgaXMgY2hlY2tlZCB0byBlbnN1cmUgdGhhdCB0aGUgY2FsbGJhY2sgaXMgY2FsbGVkXG4gKiBjb3JyZWN0bHkuXG4gKlxuICogQHBhcmFtIHtOb2RlfSB0YXJnZXRcbiAqIEBwYXJhbSB7ZnVuY3Rpb24oTXV0YXRpb25PYnNlcnZlckluaXQpOk11dGF0aW9uUmVjb3JkfSBjYWxsYmFja1xuICovXG5mdW5jdGlvbiBmb3JFYWNoQW5jZXN0b3JBbmRPYnNlcnZlckVucXVldWVSZWNvcmQodGFyZ2V0LCBjYWxsYmFjaykge1xuICBmb3IgKHZhciBub2RlID0gdGFyZ2V0OyBub2RlOyBub2RlID0gbm9kZS5wYXJlbnROb2RlKSB7XG4gICAgdmFyIHJlZ2lzdHJhdGlvbnMgPSByZWdpc3RyYXRpb25zVGFibGUuZ2V0KG5vZGUpO1xuXG4gICAgaWYgKHJlZ2lzdHJhdGlvbnMpIHtcbiAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgcmVnaXN0cmF0aW9ucy5sZW5ndGg7IGorKykge1xuICAgICAgICB2YXIgcmVnaXN0cmF0aW9uID0gcmVnaXN0cmF0aW9uc1tqXTtcbiAgICAgICAgdmFyIG9wdGlvbnMgPSByZWdpc3RyYXRpb24ub3B0aW9ucztcblxuICAgICAgICAvLyBPbmx5IHRhcmdldCBpZ25vcmVzIHN1YnRyZWUuXG4gICAgICAgIGlmIChub2RlICE9PSB0YXJnZXQgJiYgIW9wdGlvbnMuc3VidHJlZSlcbiAgICAgICAgICBjb250aW51ZTtcblxuICAgICAgICB2YXIgcmVjb3JkID0gY2FsbGJhY2sob3B0aW9ucyk7XG4gICAgICAgIGlmIChyZWNvcmQpXG4gICAgICAgICAgcmVnaXN0cmF0aW9uLmVucXVldWUocmVjb3JkKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cblxudmFyIHVpZENvdW50ZXIgPSAwO1xuXG4vKipcbiAqIFRoZSBjbGFzcyB0aGF0IG1hcHMgdG8gdGhlIERPTSBNdXRhdGlvbk9ic2VydmVyIGludGVyZmFjZS5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrLlxuICogQGNvbnN0cnVjdG9yXG4gKi9cbmZ1bmN0aW9uIEpzTXV0YXRpb25PYnNlcnZlcihjYWxsYmFjaykge1xuICB0aGlzLmNhbGxiYWNrXyA9IGNhbGxiYWNrO1xuICB0aGlzLm5vZGVzXyA9IFtdO1xuICB0aGlzLnJlY29yZHNfID0gW107XG4gIHRoaXMudWlkXyA9ICsrdWlkQ291bnRlcjtcbn1cblxuSnNNdXRhdGlvbk9ic2VydmVyLnByb3RvdHlwZSA9IHtcbiAgb2JzZXJ2ZTogZnVuY3Rpb24odGFyZ2V0LCBvcHRpb25zKSB7XG4gICAgdGFyZ2V0ID0gd3JhcElmTmVlZGVkKHRhcmdldCk7XG5cbiAgICAvLyAxLjFcbiAgICBpZiAoIW9wdGlvbnMuY2hpbGRMaXN0ICYmICFvcHRpb25zLmF0dHJpYnV0ZXMgJiYgIW9wdGlvbnMuY2hhcmFjdGVyRGF0YSB8fFxuXG4gICAgICAgIC8vIDEuMlxuICAgICAgICBvcHRpb25zLmF0dHJpYnV0ZU9sZFZhbHVlICYmICFvcHRpb25zLmF0dHJpYnV0ZXMgfHxcblxuICAgICAgICAvLyAxLjNcbiAgICAgICAgb3B0aW9ucy5hdHRyaWJ1dGVGaWx0ZXIgJiYgb3B0aW9ucy5hdHRyaWJ1dGVGaWx0ZXIubGVuZ3RoICYmXG4gICAgICAgICAgICAhb3B0aW9ucy5hdHRyaWJ1dGVzIHx8XG5cbiAgICAgICAgLy8gMS40XG4gICAgICAgIG9wdGlvbnMuY2hhcmFjdGVyRGF0YU9sZFZhbHVlICYmICFvcHRpb25zLmNoYXJhY3RlckRhdGEpIHtcblxuICAgICAgdGhyb3cgbmV3IFN5bnRheEVycm9yKCk7XG4gICAgfVxuXG4gICAgdmFyIHJlZ2lzdHJhdGlvbnMgPSByZWdpc3RyYXRpb25zVGFibGUuZ2V0KHRhcmdldCk7XG4gICAgaWYgKCFyZWdpc3RyYXRpb25zKVxuICAgICAgcmVnaXN0cmF0aW9uc1RhYmxlLnNldCh0YXJnZXQsIHJlZ2lzdHJhdGlvbnMgPSBbXSk7XG5cbiAgICAvLyAyXG4gICAgLy8gSWYgdGFyZ2V0J3MgbGlzdCBvZiByZWdpc3RlcmVkIG9ic2VydmVycyBhbHJlYWR5IGluY2x1ZGVzIGEgcmVnaXN0ZXJlZFxuICAgIC8vIG9ic2VydmVyIGFzc29jaWF0ZWQgd2l0aCB0aGUgY29udGV4dCBvYmplY3QsIHJlcGxhY2UgdGhhdCByZWdpc3RlcmVkXG4gICAgLy8gb2JzZXJ2ZXIncyBvcHRpb25zIHdpdGggb3B0aW9ucy5cbiAgICB2YXIgcmVnaXN0cmF0aW9uO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcmVnaXN0cmF0aW9ucy5sZW5ndGg7IGkrKykge1xuICAgICAgaWYgKHJlZ2lzdHJhdGlvbnNbaV0ub2JzZXJ2ZXIgPT09IHRoaXMpIHtcbiAgICAgICAgcmVnaXN0cmF0aW9uID0gcmVnaXN0cmF0aW9uc1tpXTtcbiAgICAgICAgcmVnaXN0cmF0aW9uLnJlbW92ZUxpc3RlbmVycygpO1xuICAgICAgICByZWdpc3RyYXRpb24ub3B0aW9ucyA9IG9wdGlvbnM7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIDMuXG4gICAgLy8gT3RoZXJ3aXNlLCBhZGQgYSBuZXcgcmVnaXN0ZXJlZCBvYnNlcnZlciB0byB0YXJnZXQncyBsaXN0IG9mIHJlZ2lzdGVyZWRcbiAgICAvLyBvYnNlcnZlcnMgd2l0aCB0aGUgY29udGV4dCBvYmplY3QgYXMgdGhlIG9ic2VydmVyIGFuZCBvcHRpb25zIGFzIHRoZVxuICAgIC8vIG9wdGlvbnMsIGFuZCBhZGQgdGFyZ2V0IHRvIGNvbnRleHQgb2JqZWN0J3MgbGlzdCBvZiBub2RlcyBvbiB3aGljaCBpdFxuICAgIC8vIGlzIHJlZ2lzdGVyZWQuXG4gICAgaWYgKCFyZWdpc3RyYXRpb24pIHtcbiAgICAgIHJlZ2lzdHJhdGlvbiA9IG5ldyBSZWdpc3RyYXRpb24odGhpcywgdGFyZ2V0LCBvcHRpb25zKTtcbiAgICAgIHJlZ2lzdHJhdGlvbnMucHVzaChyZWdpc3RyYXRpb24pO1xuICAgICAgdGhpcy5ub2Rlc18ucHVzaCh0YXJnZXQpO1xuICAgIH1cblxuICAgIHJlZ2lzdHJhdGlvbi5hZGRMaXN0ZW5lcnMoKTtcbiAgfSxcblxuICBkaXNjb25uZWN0OiBmdW5jdGlvbigpIHtcbiAgICB0aGlzLm5vZGVzXy5mb3JFYWNoKGZ1bmN0aW9uKG5vZGUpIHtcbiAgICAgIHZhciByZWdpc3RyYXRpb25zID0gcmVnaXN0cmF0aW9uc1RhYmxlLmdldChub2RlKTtcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcmVnaXN0cmF0aW9ucy5sZW5ndGg7IGkrKykge1xuICAgICAgICB2YXIgcmVnaXN0cmF0aW9uID0gcmVnaXN0cmF0aW9uc1tpXTtcbiAgICAgICAgaWYgKHJlZ2lzdHJhdGlvbi5vYnNlcnZlciA9PT0gdGhpcykge1xuICAgICAgICAgIHJlZ2lzdHJhdGlvbi5yZW1vdmVMaXN0ZW5lcnMoKTtcbiAgICAgICAgICByZWdpc3RyYXRpb25zLnNwbGljZShpLCAxKTtcbiAgICAgICAgICAvLyBFYWNoIG5vZGUgY2FuIG9ubHkgaGF2ZSBvbmUgcmVnaXN0ZXJlZCBvYnNlcnZlciBhc3NvY2lhdGVkIHdpdGhcbiAgICAgICAgICAvLyB0aGlzIG9ic2VydmVyLlxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSwgdGhpcyk7XG4gICAgdGhpcy5yZWNvcmRzXyA9IFtdO1xuICB9LFxuXG4gIHRha2VSZWNvcmRzOiBmdW5jdGlvbigpIHtcbiAgICB2YXIgY29weU9mUmVjb3JkcyA9IHRoaXMucmVjb3Jkc187XG4gICAgdGhpcy5yZWNvcmRzXyA9IFtdO1xuICAgIHJldHVybiBjb3B5T2ZSZWNvcmRzO1xuICB9XG59O1xuXG4vKipcbiAqIEBwYXJhbSB7c3RyaW5nfSB0eXBlXG4gKiBAcGFyYW0ge05vZGV9IHRhcmdldFxuICogQGNvbnN0cnVjdG9yXG4gKi9cbmZ1bmN0aW9uIE11dGF0aW9uUmVjb3JkKHR5cGUsIHRhcmdldCkge1xuICB0aGlzLnR5cGUgPSB0eXBlO1xuICB0aGlzLnRhcmdldCA9IHRhcmdldDtcbiAgdGhpcy5hZGRlZE5vZGVzID0gW107XG4gIHRoaXMucmVtb3ZlZE5vZGVzID0gW107XG4gIHRoaXMucHJldmlvdXNTaWJsaW5nID0gbnVsbDtcbiAgdGhpcy5uZXh0U2libGluZyA9IG51bGw7XG4gIHRoaXMuYXR0cmlidXRlTmFtZSA9IG51bGw7XG4gIHRoaXMuYXR0cmlidXRlTmFtZXNwYWNlID0gbnVsbDtcbiAgdGhpcy5vbGRWYWx1ZSA9IG51bGw7XG59XG5cbmZ1bmN0aW9uIGNvcHlNdXRhdGlvblJlY29yZChvcmlnaW5hbCkge1xuICB2YXIgcmVjb3JkID0gbmV3IE11dGF0aW9uUmVjb3JkKG9yaWdpbmFsLnR5cGUsIG9yaWdpbmFsLnRhcmdldCk7XG4gIHJlY29yZC5hZGRlZE5vZGVzID0gb3JpZ2luYWwuYWRkZWROb2Rlcy5zbGljZSgpO1xuICByZWNvcmQucmVtb3ZlZE5vZGVzID0gb3JpZ2luYWwucmVtb3ZlZE5vZGVzLnNsaWNlKCk7XG4gIHJlY29yZC5wcmV2aW91c1NpYmxpbmcgPSBvcmlnaW5hbC5wcmV2aW91c1NpYmxpbmc7XG4gIHJlY29yZC5uZXh0U2libGluZyA9IG9yaWdpbmFsLm5leHRTaWJsaW5nO1xuICByZWNvcmQuYXR0cmlidXRlTmFtZSA9IG9yaWdpbmFsLmF0dHJpYnV0ZU5hbWU7XG4gIHJlY29yZC5hdHRyaWJ1dGVOYW1lc3BhY2UgPSBvcmlnaW5hbC5hdHRyaWJ1dGVOYW1lc3BhY2U7XG4gIHJlY29yZC5vbGRWYWx1ZSA9IG9yaWdpbmFsLm9sZFZhbHVlO1xuICByZXR1cm4gcmVjb3JkO1xufTtcblxuLy8gV2Uga2VlcCB0cmFjayBvZiB0aGUgdHdvIChwb3NzaWJseSBvbmUpIHJlY29yZHMgdXNlZCBpbiBhIHNpbmdsZSBtdXRhdGlvbi5cbnZhciBjdXJyZW50UmVjb3JkLCByZWNvcmRXaXRoT2xkVmFsdWU7XG5cbi8qKlxuICogQ3JlYXRlcyBhIHJlY29yZCB3aXRob3V0IHxvbGRWYWx1ZXwgYW5kIGNhY2hlcyBpdCBhcyB8Y3VycmVudFJlY29yZHwgZm9yXG4gKiBsYXRlciB1c2UuXG4gKiBAcGFyYW0ge3N0cmluZ30gb2xkVmFsdWVcbiAqIEByZXR1cm4ge011dGF0aW9uUmVjb3JkfVxuICovXG5mdW5jdGlvbiBnZXRSZWNvcmQodHlwZSwgdGFyZ2V0KSB7XG4gIHJldHVybiBjdXJyZW50UmVjb3JkID0gbmV3IE11dGF0aW9uUmVjb3JkKHR5cGUsIHRhcmdldCk7XG59XG5cbi8qKlxuICogR2V0cyBvciBjcmVhdGVzIGEgcmVjb3JkIHdpdGggfG9sZFZhbHVlfCBiYXNlZCBpbiB0aGUgfGN1cnJlbnRSZWNvcmR8XG4gKiBAcGFyYW0ge3N0cmluZ30gb2xkVmFsdWVcbiAqIEByZXR1cm4ge011dGF0aW9uUmVjb3JkfVxuICovXG5mdW5jdGlvbiBnZXRSZWNvcmRXaXRoT2xkVmFsdWUob2xkVmFsdWUpIHtcbiAgaWYgKHJlY29yZFdpdGhPbGRWYWx1ZSlcbiAgICByZXR1cm4gcmVjb3JkV2l0aE9sZFZhbHVlO1xuICByZWNvcmRXaXRoT2xkVmFsdWUgPSBjb3B5TXV0YXRpb25SZWNvcmQoY3VycmVudFJlY29yZCk7XG4gIHJlY29yZFdpdGhPbGRWYWx1ZS5vbGRWYWx1ZSA9IG9sZFZhbHVlO1xuICByZXR1cm4gcmVjb3JkV2l0aE9sZFZhbHVlO1xufVxuXG5mdW5jdGlvbiBjbGVhclJlY29yZHMoKSB7XG4gIGN1cnJlbnRSZWNvcmQgPSByZWNvcmRXaXRoT2xkVmFsdWUgPSB1bmRlZmluZWQ7XG59XG5cbi8qKlxuICogQHBhcmFtIHtNdXRhdGlvblJlY29yZH0gcmVjb3JkXG4gKiBAcmV0dXJuIHtib29sZWFufSBXaGV0aGVyIHRoZSByZWNvcmQgcmVwcmVzZW50cyBhIHJlY29yZCBmcm9tIHRoZSBjdXJyZW50XG4gKiBtdXRhdGlvbiBldmVudC5cbiAqL1xuZnVuY3Rpb24gcmVjb3JkUmVwcmVzZW50c0N1cnJlbnRNdXRhdGlvbihyZWNvcmQpIHtcbiAgcmV0dXJuIHJlY29yZCA9PT0gcmVjb3JkV2l0aE9sZFZhbHVlIHx8IHJlY29yZCA9PT0gY3VycmVudFJlY29yZDtcbn1cblxuLyoqXG4gKiBTZWxlY3RzIHdoaWNoIHJlY29yZCwgaWYgYW55LCB0byByZXBsYWNlIHRoZSBsYXN0IHJlY29yZCBpbiB0aGUgcXVldWUuXG4gKiBUaGlzIHJldHVybnMgfG51bGx8IGlmIG5vIHJlY29yZCBzaG91bGQgYmUgcmVwbGFjZWQuXG4gKlxuICogQHBhcmFtIHtNdXRhdGlvblJlY29yZH0gbGFzdFJlY29yZFxuICogQHBhcmFtIHtNdXRhdGlvblJlY29yZH0gbmV3UmVjb3JkXG4gKiBAcGFyYW0ge011dGF0aW9uUmVjb3JkfVxuICovXG5mdW5jdGlvbiBzZWxlY3RSZWNvcmQobGFzdFJlY29yZCwgbmV3UmVjb3JkKSB7XG4gIGlmIChsYXN0UmVjb3JkID09PSBuZXdSZWNvcmQpXG4gICAgcmV0dXJuIGxhc3RSZWNvcmQ7XG5cbiAgLy8gQ2hlY2sgaWYgdGhlIHRoZSByZWNvcmQgd2UgYXJlIGFkZGluZyByZXByZXNlbnRzIHRoZSBzYW1lIHJlY29yZC4gSWZcbiAgLy8gc28sIHdlIGtlZXAgdGhlIG9uZSB3aXRoIHRoZSBvbGRWYWx1ZSBpbiBpdC5cbiAgaWYgKHJlY29yZFdpdGhPbGRWYWx1ZSAmJiByZWNvcmRSZXByZXNlbnRzQ3VycmVudE11dGF0aW9uKGxhc3RSZWNvcmQpKVxuICAgIHJldHVybiByZWNvcmRXaXRoT2xkVmFsdWU7XG5cbiAgcmV0dXJuIG51bGw7XG59XG5cbi8qKlxuICogQ2xhc3MgdXNlZCB0byByZXByZXNlbnQgYSByZWdpc3RlcmVkIG9ic2VydmVyLlxuICogQHBhcmFtIHtNdXRhdGlvbk9ic2VydmVyfSBvYnNlcnZlclxuICogQHBhcmFtIHtOb2RlfSB0YXJnZXRcbiAqIEBwYXJhbSB7TXV0YXRpb25PYnNlcnZlckluaXR9IG9wdGlvbnNcbiAqIEBjb25zdHJ1Y3RvclxuICovXG5mdW5jdGlvbiBSZWdpc3RyYXRpb24ob2JzZXJ2ZXIsIHRhcmdldCwgb3B0aW9ucykge1xuICB0aGlzLm9ic2VydmVyID0gb2JzZXJ2ZXI7XG4gIHRoaXMudGFyZ2V0ID0gdGFyZ2V0O1xuICB0aGlzLm9wdGlvbnMgPSBvcHRpb25zO1xuICB0aGlzLnRyYW5zaWVudE9ic2VydmVkTm9kZXMgPSBbXTtcbn1cblxuUmVnaXN0cmF0aW9uLnByb3RvdHlwZSA9IHtcbiAgZW5xdWV1ZTogZnVuY3Rpb24ocmVjb3JkKSB7XG4gICAgdmFyIHJlY29yZHMgPSB0aGlzLm9ic2VydmVyLnJlY29yZHNfO1xuICAgIHZhciBsZW5ndGggPSByZWNvcmRzLmxlbmd0aDtcblxuICAgIC8vIFRoZXJlIGFyZSBjYXNlcyB3aGVyZSB3ZSByZXBsYWNlIHRoZSBsYXN0IHJlY29yZCB3aXRoIHRoZSBuZXcgcmVjb3JkLlxuICAgIC8vIEZvciBleGFtcGxlIGlmIHRoZSByZWNvcmQgcmVwcmVzZW50cyB0aGUgc2FtZSBtdXRhdGlvbiB3ZSBuZWVkIHRvIHVzZVxuICAgIC8vIHRoZSBvbmUgd2l0aCB0aGUgb2xkVmFsdWUuIElmIHdlIGdldCBzYW1lIHJlY29yZCAodGhpcyBjYW4gaGFwcGVuIGFzIHdlXG4gICAgLy8gd2FsayB1cCB0aGUgdHJlZSkgd2UgaWdub3JlIHRoZSBuZXcgcmVjb3JkLlxuICAgIGlmIChyZWNvcmRzLmxlbmd0aCA+IDApIHtcbiAgICAgIHZhciBsYXN0UmVjb3JkID0gcmVjb3Jkc1tsZW5ndGggLSAxXTtcbiAgICAgIHZhciByZWNvcmRUb1JlcGxhY2VMYXN0ID0gc2VsZWN0UmVjb3JkKGxhc3RSZWNvcmQsIHJlY29yZCk7XG4gICAgICBpZiAocmVjb3JkVG9SZXBsYWNlTGFzdCkge1xuICAgICAgICByZWNvcmRzW2xlbmd0aCAtIDFdID0gcmVjb3JkVG9SZXBsYWNlTGFzdDtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBzY2hlZHVsZUNhbGxiYWNrKHRoaXMub2JzZXJ2ZXIpO1xuICAgIH1cblxuICAgIHJlY29yZHNbbGVuZ3RoXSA9IHJlY29yZDtcbiAgfSxcblxuICBhZGRMaXN0ZW5lcnM6IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuYWRkTGlzdGVuZXJzXyh0aGlzLnRhcmdldCk7XG4gIH0sXG5cbiAgYWRkTGlzdGVuZXJzXzogZnVuY3Rpb24obm9kZSkge1xuICAgIHZhciBvcHRpb25zID0gdGhpcy5vcHRpb25zO1xuICAgIGlmIChvcHRpb25zLmF0dHJpYnV0ZXMpXG4gICAgICBub2RlLmFkZEV2ZW50TGlzdGVuZXIoJ0RPTUF0dHJNb2RpZmllZCcsIHRoaXMsIHRydWUpO1xuXG4gICAgaWYgKG9wdGlvbnMuY2hhcmFjdGVyRGF0YSlcbiAgICAgIG5vZGUuYWRkRXZlbnRMaXN0ZW5lcignRE9NQ2hhcmFjdGVyRGF0YU1vZGlmaWVkJywgdGhpcywgdHJ1ZSk7XG5cbiAgICBpZiAob3B0aW9ucy5jaGlsZExpc3QpXG4gICAgICBub2RlLmFkZEV2ZW50TGlzdGVuZXIoJ0RPTU5vZGVJbnNlcnRlZCcsIHRoaXMsIHRydWUpO1xuXG4gICAgaWYgKG9wdGlvbnMuY2hpbGRMaXN0IHx8IG9wdGlvbnMuc3VidHJlZSlcbiAgICAgIG5vZGUuYWRkRXZlbnRMaXN0ZW5lcignRE9NTm9kZVJlbW92ZWQnLCB0aGlzLCB0cnVlKTtcbiAgfSxcblxuICByZW1vdmVMaXN0ZW5lcnM6IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMucmVtb3ZlTGlzdGVuZXJzXyh0aGlzLnRhcmdldCk7XG4gIH0sXG5cbiAgcmVtb3ZlTGlzdGVuZXJzXzogZnVuY3Rpb24obm9kZSkge1xuICAgIHZhciBvcHRpb25zID0gdGhpcy5vcHRpb25zO1xuICAgIGlmIChvcHRpb25zLmF0dHJpYnV0ZXMpXG4gICAgICBub2RlLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ0RPTUF0dHJNb2RpZmllZCcsIHRoaXMsIHRydWUpO1xuXG4gICAgaWYgKG9wdGlvbnMuY2hhcmFjdGVyRGF0YSlcbiAgICAgIG5vZGUucmVtb3ZlRXZlbnRMaXN0ZW5lcignRE9NQ2hhcmFjdGVyRGF0YU1vZGlmaWVkJywgdGhpcywgdHJ1ZSk7XG5cbiAgICBpZiAob3B0aW9ucy5jaGlsZExpc3QpXG4gICAgICBub2RlLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ0RPTU5vZGVJbnNlcnRlZCcsIHRoaXMsIHRydWUpO1xuXG4gICAgaWYgKG9wdGlvbnMuY2hpbGRMaXN0IHx8IG9wdGlvbnMuc3VidHJlZSlcbiAgICAgIG5vZGUucmVtb3ZlRXZlbnRMaXN0ZW5lcignRE9NTm9kZVJlbW92ZWQnLCB0aGlzLCB0cnVlKTtcbiAgfSxcblxuICAvKipcbiAgICogQWRkcyBhIHRyYW5zaWVudCBvYnNlcnZlciBvbiBub2RlLiBUaGUgdHJhbnNpZW50IG9ic2VydmVyIGdldHMgcmVtb3ZlZFxuICAgKiBuZXh0IHRpbWUgd2UgZGVsaXZlciB0aGUgY2hhbmdlIHJlY29yZHMuXG4gICAqIEBwYXJhbSB7Tm9kZX0gbm9kZVxuICAgKi9cbiAgYWRkVHJhbnNpZW50T2JzZXJ2ZXI6IGZ1bmN0aW9uKG5vZGUpIHtcbiAgICAvLyBEb24ndCBhZGQgdHJhbnNpZW50IG9ic2VydmVycyBvbiB0aGUgdGFyZ2V0IGl0c2VsZi4gV2UgYWxyZWFkeSBoYXZlIGFsbFxuICAgIC8vIHRoZSByZXF1aXJlZCBsaXN0ZW5lcnMgc2V0IHVwIG9uIHRoZSB0YXJnZXQuXG4gICAgaWYgKG5vZGUgPT09IHRoaXMudGFyZ2V0KVxuICAgICAgcmV0dXJuO1xuXG4gICAgdGhpcy5hZGRMaXN0ZW5lcnNfKG5vZGUpO1xuICAgIHRoaXMudHJhbnNpZW50T2JzZXJ2ZWROb2Rlcy5wdXNoKG5vZGUpO1xuICAgIHZhciByZWdpc3RyYXRpb25zID0gcmVnaXN0cmF0aW9uc1RhYmxlLmdldChub2RlKTtcbiAgICBpZiAoIXJlZ2lzdHJhdGlvbnMpXG4gICAgICByZWdpc3RyYXRpb25zVGFibGUuc2V0KG5vZGUsIHJlZ2lzdHJhdGlvbnMgPSBbXSk7XG5cbiAgICAvLyBXZSBrbm93IHRoYXQgcmVnaXN0cmF0aW9ucyBkb2VzIG5vdCBjb250YWluIHRoaXMgYmVjYXVzZSB3ZSBhbHJlYWR5XG4gICAgLy8gY2hlY2tlZCBpZiBub2RlID09PSB0aGlzLnRhcmdldC5cbiAgICByZWdpc3RyYXRpb25zLnB1c2godGhpcyk7XG4gIH0sXG5cbiAgcmVtb3ZlVHJhbnNpZW50T2JzZXJ2ZXJzOiBmdW5jdGlvbigpIHtcbiAgICB2YXIgdHJhbnNpZW50T2JzZXJ2ZWROb2RlcyA9IHRoaXMudHJhbnNpZW50T2JzZXJ2ZWROb2RlcztcbiAgICB0aGlzLnRyYW5zaWVudE9ic2VydmVkTm9kZXMgPSBbXTtcblxuICAgIHRyYW5zaWVudE9ic2VydmVkTm9kZXMuZm9yRWFjaChmdW5jdGlvbihub2RlKSB7XG4gICAgICAvLyBUcmFuc2llbnQgb2JzZXJ2ZXJzIGFyZSBuZXZlciBhZGRlZCB0byB0aGUgdGFyZ2V0LlxuICAgICAgdGhpcy5yZW1vdmVMaXN0ZW5lcnNfKG5vZGUpO1xuXG4gICAgICB2YXIgcmVnaXN0cmF0aW9ucyA9IHJlZ2lzdHJhdGlvbnNUYWJsZS5nZXQobm9kZSk7XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHJlZ2lzdHJhdGlvbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYgKHJlZ2lzdHJhdGlvbnNbaV0gPT09IHRoaXMpIHtcbiAgICAgICAgICByZWdpc3RyYXRpb25zLnNwbGljZShpLCAxKTtcbiAgICAgICAgICAvLyBFYWNoIG5vZGUgY2FuIG9ubHkgaGF2ZSBvbmUgcmVnaXN0ZXJlZCBvYnNlcnZlciBhc3NvY2lhdGVkIHdpdGhcbiAgICAgICAgICAvLyB0aGlzIG9ic2VydmVyLlxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSwgdGhpcyk7XG4gIH0sXG5cbiAgaGFuZGxlRXZlbnQ6IGZ1bmN0aW9uKGUpIHtcbiAgICAvLyBTdG9wIHByb3BhZ2F0aW9uIHNpbmNlIHdlIGFyZSBtYW5hZ2luZyB0aGUgcHJvcGFnYXRpb24gbWFudWFsbHkuXG4gICAgLy8gVGhpcyBtZWFucyB0aGF0IG90aGVyIG11dGF0aW9uIGV2ZW50cyBvbiB0aGUgcGFnZSB3aWxsIG5vdCB3b3JrXG4gICAgLy8gY29ycmVjdGx5IGJ1dCB0aGF0IGlzIGJ5IGRlc2lnbi5cbiAgICBlLnN0b3BJbW1lZGlhdGVQcm9wYWdhdGlvbigpO1xuXG4gICAgc3dpdGNoIChlLnR5cGUpIHtcbiAgICAgIGNhc2UgJ0RPTUF0dHJNb2RpZmllZCc6XG4gICAgICAgIC8vIGh0dHA6Ly9kb20uc3BlYy53aGF0d2cub3JnLyNjb25jZXB0LW1vLXF1ZXVlLWF0dHJpYnV0ZXNcblxuICAgICAgICB2YXIgbmFtZSA9IGUuYXR0ck5hbWU7XG4gICAgICAgIHZhciBuYW1lc3BhY2UgPSBlLnJlbGF0ZWROb2RlLm5hbWVzcGFjZVVSSTtcbiAgICAgICAgdmFyIHRhcmdldCA9IGUudGFyZ2V0O1xuXG4gICAgICAgIC8vIDEuXG4gICAgICAgIHZhciByZWNvcmQgPSBuZXcgZ2V0UmVjb3JkKCdhdHRyaWJ1dGVzJywgdGFyZ2V0KTtcbiAgICAgICAgcmVjb3JkLmF0dHJpYnV0ZU5hbWUgPSBuYW1lO1xuICAgICAgICByZWNvcmQuYXR0cmlidXRlTmFtZXNwYWNlID0gbmFtZXNwYWNlO1xuXG4gICAgICAgIC8vIDIuXG4gICAgICAgIHZhciBvbGRWYWx1ZSA9XG4gICAgICAgICAgICBlLmF0dHJDaGFuZ2UgPT09IE11dGF0aW9uRXZlbnQuQURESVRJT04gPyBudWxsIDogZS5wcmV2VmFsdWU7XG5cbiAgICAgICAgZm9yRWFjaEFuY2VzdG9yQW5kT2JzZXJ2ZXJFbnF1ZXVlUmVjb3JkKHRhcmdldCwgZnVuY3Rpb24ob3B0aW9ucykge1xuICAgICAgICAgIC8vIDMuMSwgNC4yXG4gICAgICAgICAgaWYgKCFvcHRpb25zLmF0dHJpYnV0ZXMpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgICAvLyAzLjIsIDQuM1xuICAgICAgICAgIGlmIChvcHRpb25zLmF0dHJpYnV0ZUZpbHRlciAmJiBvcHRpb25zLmF0dHJpYnV0ZUZpbHRlci5sZW5ndGggJiZcbiAgICAgICAgICAgICAgb3B0aW9ucy5hdHRyaWJ1dGVGaWx0ZXIuaW5kZXhPZihuYW1lKSA9PT0gLTEgJiZcbiAgICAgICAgICAgICAgb3B0aW9ucy5hdHRyaWJ1dGVGaWx0ZXIuaW5kZXhPZihuYW1lc3BhY2UpID09PSAtMSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyAzLjMsIDQuNFxuICAgICAgICAgIGlmIChvcHRpb25zLmF0dHJpYnV0ZU9sZFZhbHVlKVxuICAgICAgICAgICAgcmV0dXJuIGdldFJlY29yZFdpdGhPbGRWYWx1ZShvbGRWYWx1ZSk7XG5cbiAgICAgICAgICAvLyAzLjQsIDQuNVxuICAgICAgICAgIHJldHVybiByZWNvcmQ7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGJyZWFrO1xuXG4gICAgICBjYXNlICdET01DaGFyYWN0ZXJEYXRhTW9kaWZpZWQnOlxuICAgICAgICAvLyBodHRwOi8vZG9tLnNwZWMud2hhdHdnLm9yZy8jY29uY2VwdC1tby1xdWV1ZS1jaGFyYWN0ZXJkYXRhXG4gICAgICAgIHZhciB0YXJnZXQgPSBlLnRhcmdldDtcblxuICAgICAgICAvLyAxLlxuICAgICAgICB2YXIgcmVjb3JkID0gZ2V0UmVjb3JkKCdjaGFyYWN0ZXJEYXRhJywgdGFyZ2V0KTtcblxuICAgICAgICAvLyAyLlxuICAgICAgICB2YXIgb2xkVmFsdWUgPSBlLnByZXZWYWx1ZTtcblxuXG4gICAgICAgIGZvckVhY2hBbmNlc3RvckFuZE9ic2VydmVyRW5xdWV1ZVJlY29yZCh0YXJnZXQsIGZ1bmN0aW9uKG9wdGlvbnMpIHtcbiAgICAgICAgICAvLyAzLjEsIDQuMlxuICAgICAgICAgIGlmICghb3B0aW9ucy5jaGFyYWN0ZXJEYXRhKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgICAgLy8gMy4yLCA0LjNcbiAgICAgICAgICBpZiAob3B0aW9ucy5jaGFyYWN0ZXJEYXRhT2xkVmFsdWUpXG4gICAgICAgICAgICByZXR1cm4gZ2V0UmVjb3JkV2l0aE9sZFZhbHVlKG9sZFZhbHVlKTtcblxuICAgICAgICAgIC8vIDMuMywgNC40XG4gICAgICAgICAgcmV0dXJuIHJlY29yZDtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgYnJlYWs7XG5cbiAgICAgIGNhc2UgJ0RPTU5vZGVSZW1vdmVkJzpcbiAgICAgICAgdGhpcy5hZGRUcmFuc2llbnRPYnNlcnZlcihlLnRhcmdldCk7XG4gICAgICAgIC8vIEZhbGwgdGhyb3VnaC5cbiAgICAgIGNhc2UgJ0RPTU5vZGVJbnNlcnRlZCc6XG4gICAgICAgIC8vIGh0dHA6Ly9kb20uc3BlYy53aGF0d2cub3JnLyNjb25jZXB0LW1vLXF1ZXVlLWNoaWxkbGlzdFxuICAgICAgICB2YXIgdGFyZ2V0ID0gZS5yZWxhdGVkTm9kZTtcbiAgICAgICAgdmFyIGNoYW5nZWROb2RlID0gZS50YXJnZXQ7XG4gICAgICAgIHZhciBhZGRlZE5vZGVzLCByZW1vdmVkTm9kZXM7XG4gICAgICAgIGlmIChlLnR5cGUgPT09ICdET01Ob2RlSW5zZXJ0ZWQnKSB7XG4gICAgICAgICAgYWRkZWROb2RlcyA9IFtjaGFuZ2VkTm9kZV07XG4gICAgICAgICAgcmVtb3ZlZE5vZGVzID0gW107XG4gICAgICAgIH0gZWxzZSB7XG5cbiAgICAgICAgICBhZGRlZE5vZGVzID0gW107XG4gICAgICAgICAgcmVtb3ZlZE5vZGVzID0gW2NoYW5nZWROb2RlXTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgcHJldmlvdXNTaWJsaW5nID0gY2hhbmdlZE5vZGUucHJldmlvdXNTaWJsaW5nO1xuICAgICAgICB2YXIgbmV4dFNpYmxpbmcgPSBjaGFuZ2VkTm9kZS5uZXh0U2libGluZztcblxuICAgICAgICAvLyAxLlxuICAgICAgICB2YXIgcmVjb3JkID0gZ2V0UmVjb3JkKCdjaGlsZExpc3QnLCB0YXJnZXQpO1xuICAgICAgICByZWNvcmQuYWRkZWROb2RlcyA9IGFkZGVkTm9kZXM7XG4gICAgICAgIHJlY29yZC5yZW1vdmVkTm9kZXMgPSByZW1vdmVkTm9kZXM7XG4gICAgICAgIHJlY29yZC5wcmV2aW91c1NpYmxpbmcgPSBwcmV2aW91c1NpYmxpbmc7XG4gICAgICAgIHJlY29yZC5uZXh0U2libGluZyA9IG5leHRTaWJsaW5nO1xuXG4gICAgICAgIGZvckVhY2hBbmNlc3RvckFuZE9ic2VydmVyRW5xdWV1ZVJlY29yZCh0YXJnZXQsIGZ1bmN0aW9uKG9wdGlvbnMpIHtcbiAgICAgICAgICAvLyAyLjEsIDMuMlxuICAgICAgICAgIGlmICghb3B0aW9ucy5jaGlsZExpc3QpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgICAvLyAyLjIsIDMuM1xuICAgICAgICAgIHJldHVybiByZWNvcmQ7XG4gICAgICAgIH0pO1xuXG4gICAgfVxuXG4gICAgY2xlYXJSZWNvcmRzKCk7XG4gIH1cbn07XG5cbmlmICghTXV0YXRpb25PYnNlcnZlcikge1xuICBNdXRhdGlvbk9ic2VydmVyID0gSnNNdXRhdGlvbk9ic2VydmVyO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IE11dGF0aW9uT2JzZXJ2ZXI7XG4iLCJpbXBvcnQgeyBTY29wZSwgU2NvcGVFeGVjdXRvciwgRWxlbWVudE1hdGNoZXIsIEV2ZW50TWF0Y2hlciwgU3Vic2NyaXB0aW9uRXhlY3V0b3IgfSBmcm9tICcuL3Njb3BlJztcblxuZXhwb3J0IGRlZmF1bHQgRGVjbDtcblxuZXhwb3J0IGNsYXNzIERlY2wge1xuICAgIHByaXZhdGUgc3RhdGljIGRlZmF1bHRJbnN0YW5jZTogRGVjbDtcblxuICAgIHN0YXRpYyBzZWxlY3QobWF0Y2hlcjogRWxlbWVudE1hdGNoZXIsIGV4ZWN1dG9yOiBTY29wZUV4ZWN1dG9yKTogU2NvcGUge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXREZWZhdWx0SW5zdGFuY2UoKS5zZWxlY3QobWF0Y2hlciwgZXhlY3V0b3IpO1xuICAgIH1cblxuICAgIHN0YXRpYyBvbihtYXRjaGVyOiBFdmVudE1hdGNoZXIsIGV4ZWN1dG9yOiBTdWJzY3JpcHRpb25FeGVjdXRvcik6IFNjb3BlIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0RGVmYXVsdEluc3RhbmNlKCkub24obWF0Y2hlciwgZXhlY3V0b3IpO1xuICAgIH1cblxuICAgIHN0YXRpYyBnZXRSb290U2NvcGUoKTogU2NvcGUge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXREZWZhdWx0SW5zdGFuY2UoKS5nZXRSb290U2NvcGUoKTtcbiAgICB9XG5cbiAgICBzdGF0aWMgY29sbGVjdFNjb3BlcygpOiBTY29wZVtdIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0RGVmYXVsdEluc3RhbmNlKCkuY29sbGVjdFNjb3BlcygpO1xuICAgIH1cblxuICAgIHN0YXRpYyBkcmF3VHJlZSgpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXREZWZhdWx0SW5zdGFuY2UoKS5kcmF3VHJlZSgpO1xuICAgIH1cblxuICAgIHN0YXRpYyBnZXREZWZhdWx0SW5zdGFuY2UoKSA6IERlY2wge1xuICAgICAgICByZXR1cm4gdGhpcy5kZWZhdWx0SW5zdGFuY2UgfHwgKHRoaXMuZGVmYXVsdEluc3RhbmNlID0gbmV3IERlY2woZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50KSk7XG4gICAgfVxuXG4gICAgc3RhdGljIHNldERlZmF1bHRJbnN0YW5jZShkZWNsOiBEZWNsKSA6IERlY2wge1xuICAgICAgICByZXR1cm4gdGhpcy5kZWZhdWx0SW5zdGFuY2UgPSBkZWNsO1xuICAgIH1cblxuICAgIHN0YXRpYyBwcmlzdGluZSgpOiB2b2lkIHtcbiAgICAgICAgaWYodGhpcy5kZWZhdWx0SW5zdGFuY2UpIHtcbiAgICAgICAgICAgIHRoaXMuZGVmYXVsdEluc3RhbmNlLnByaXN0aW5lKCk7XG4gICAgICAgICAgICB0aGlzLmRlZmF1bHRJbnN0YW5jZSA9IG51bGw7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIHNjb3BlOiBTY29wZTtcblxuICAgIGNvbnN0cnVjdG9yKHJvb3Q6IEVsZW1lbnQpIHtcbiAgICAgICAgdGhpcy5zY29wZSA9IFNjb3BlLmJ1aWxkUm9vdFNjb3BlKHJvb3QpO1xuICAgIH1cblxuICAgIHNlbGVjdChtYXRjaGVyOiBFbGVtZW50TWF0Y2hlciwgZXhlY3V0b3I6IFNjb3BlRXhlY3V0b3IpOiBTY29wZSB7XG4gICAgICAgIHJldHVybiB0aGlzLnNjb3BlLnNlbGVjdChtYXRjaGVyLCBleGVjdXRvcik7XG4gICAgfVxuXG4gICAgb24obWF0Y2hlcjogRXZlbnRNYXRjaGVyLCBleGVjdXRvcjogU3Vic2NyaXB0aW9uRXhlY3V0b3IpOiBTY29wZSB7XG4gICAgICAgIHJldHVybiB0aGlzLnNjb3BlLm9uKG1hdGNoZXIsIGV4ZWN1dG9yKTtcbiAgICB9XG5cbiAgICBnZXRSb290U2NvcGUoKTogU2NvcGUge1xuICAgICAgICByZXR1cm4gdGhpcy5zY29wZTtcbiAgICB9XG4gICAgXG4gICAgY29sbGVjdFNjb3BlcygpOiBTY29wZVtdIHtcbiAgICAgICAgcmV0dXJuIFt0aGlzLnNjb3BlLCAuLi50aGlzLnNjb3BlLmNvbGxlY3REZXNjZW5kYW50U2NvcGVzKCldO1xuICAgIH1cblxuICAgIGRyYXdUcmVlKCk6IHN0cmluZyB7XG4gICAgICAgIHJldHVybiB0aGlzLnNjb3BlLmRyYXdUcmVlKCk7XG4gICAgfVxuXG4gICAgcHJpc3RpbmUoKTogdm9pZCB7XG4gICAgICAgIHRoaXMuc2NvcGUucHJpc3RpbmUoKTtcbiAgICB9XG59XG5cbi8vIEV4cG9ydCB0byBhIGdsb2JhbCBmb3IgdGhlIGJyb3dzZXIgKHRoZXJlICpoYXMqIHRvIGJlIGEgYmV0dGVyIHdheSB0byBkbyB0aGlzISlcbmlmKHR5cGVvZih3aW5kb3cpICE9PSAndW5kZWZpbmVkJykge1xuICAgICg8YW55PndpbmRvdykuRGVjbCA9IERlY2w7XG59XG5cbmV4cG9ydCB7IFNjb3BlLCBTY29wZUV4ZWN1dG9yLCBFbGVtZW50TWF0Y2hlciwgRXZlbnRNYXRjaGVyLCBTdWJzY3JpcHRpb25FeGVjdXRvciB9O1xuIiwiZXhwb3J0IGRlZmF1bHQgRWxlbWVudENvbGxlY3RvcjtcblxuZXhwb3J0IGludGVyZmFjZSBFbGVtZW50VmlzdG9yIHsgKGVsZW1lbnQ6IEVsZW1lbnQpOiBFbGVtZW50TWF0Y2hlciB8IGJvb2xlYW4gfVxuZXhwb3J0IGRlY2xhcmUgdHlwZSBFbGVtZW50TWF0Y2hlciA9IHN0cmluZyB8IE5vZGVMaXN0T2Y8RWxlbWVudD4gfCBFbGVtZW50W10gfCBFbGVtZW50VmlzdG9yO1xuXG5leHBvcnQgY2xhc3MgRWxlbWVudENvbGxlY3RvciB7XG4gICAgcHJpdmF0ZSBzdGF0aWMgaW5zdGFuY2U6IEVsZW1lbnRDb2xsZWN0b3I7XG4gICAgXG4gICAgcHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgRUxFTUVOVF9NQVRDSEVSX1RZUEVfRVJST1JfTUVTU0FHRSA9IFwiRGVjbDogQW4gYEVsZW1lbnRNYXRjaGVyYCBtdXN0IGJlIGEgQ1NTIHNlbGVjdG9yIChzdHJpbmcpIG9yIGEgZnVuY3Rpb24gd2hpY2ggdGFrZXMgYSBub2RlIHVuZGVyIGNvbnNpZGVyYXRpb24gYW5kIHJldHVybnMgYSBDU1Mgc2VsZWN0b3IgKHN0cmluZykgdGhhdCBtYXRjaGVzIGFsbCBtYXRjaGluZyBub2RlcyBpbiB0aGUgc3VidHJlZSwgYW4gYXJyYXktbGlrZSBvYmplY3Qgb2YgbWF0Y2hpbmcgbm9kZXMgaW4gdGhlIHN1YnRyZWUsIG9yIGEgYm9vbGVhbiB2YWx1ZSBhcyB0byB3aGV0aGVyIHRoZSBub2RlIHNob3VsZCBiZSBpbmNsdWRlZCAoaW4gdGhpcyBjYXNlLCB0aGUgZnVuY3Rpb24gd2lsbCBiZSBpbnZva2VkIGFnYWluIGZvciBhbGwgY2hpbGRyZW4gb2YgdGhlIG5vZGUpLlwiO1xuXG4gICAgc3RhdGljIGlzTWF0Y2hpbmdFbGVtZW50KHJvb3RFbGVtZW50OiBFbGVtZW50LCBlbGVtZW50TWF0Y2hlcjogRWxlbWVudE1hdGNoZXIpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0SW5zdGFuY2UoKS5pc01hdGNoaW5nRWxlbWVudChyb290RWxlbWVudCwgZWxlbWVudE1hdGNoZXIpO1xuICAgIH1cblxuICAgIHN0YXRpYyBjb2xsZWN0TWF0Y2hpbmdFbGVtZW50cyhyb290RWxlbWVudDogRWxlbWVudCwgZWxlbWVudE1hdGNoZXI6IEVsZW1lbnRNYXRjaGVyKTogRWxlbWVudFtdIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0SW5zdGFuY2UoKS5jb2xsZWN0TWF0Y2hpbmdFbGVtZW50cyhyb290RWxlbWVudCwgZWxlbWVudE1hdGNoZXIpO1xuICAgIH1cblxuICAgIHByaXZhdGUgc3RhdGljIGdldEluc3RhbmNlKCkgOiBFbGVtZW50Q29sbGVjdG9yIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuaW5zdGFuY2UgfHwgKHRoaXMuaW5zdGFuY2UgPSBuZXcgRWxlbWVudENvbGxlY3RvcigpKTtcbiAgICB9XG5cbiAgICBpc01hdGNoaW5nRWxlbWVudChlbGVtZW50OiBFbGVtZW50LCBlbGVtZW50TWF0Y2hlcjogRWxlbWVudE1hdGNoZXIpOiBib29sZWFuIHtcbiAgICAgICAgc3dpdGNoKHR5cGVvZihlbGVtZW50TWF0Y2hlcikpIHtcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihFbGVtZW50Q29sbGVjdG9yLkVMRU1FTlRfTUFUQ0hFUl9UWVBFX0VSUk9SX01FU1NBR0UpO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgICAgICAgICAgICBsZXQgY3NzU2VsZWN0b3I6IHN0cmluZyA9IDxzdHJpbmc+ZWxlbWVudE1hdGNoZXI7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuaXNNYXRjaGluZ0VsZW1lbnRGcm9tQ3NzU2VsZWN0b3IoZWxlbWVudCwgY3NzU2VsZWN0b3IpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBjYXNlICdvYmplY3QnOlxuICAgICAgICAgICAgICAgIGxldCBvYmplY3QgPSA8T2JqZWN0PmVsZW1lbnRNYXRjaGVyO1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmlzTWF0Y2hpbmdFbGVtZW50RnJvbU9iamVjdChlbGVtZW50LCBvYmplY3QpO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgY2FzZSAnZnVuY3Rpb24nOlxuICAgICAgICAgICAgICAgIGxldCBlbGVtZW50VmlzdG9yID0gPEVsZW1lbnRWaXN0b3I+ZWxlbWVudE1hdGNoZXI7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuaXNNYXRjaGluZ0VsZW1lbnRGcm9tRWxlbWVudFZpc3RvcihlbGVtZW50LCBlbGVtZW50VmlzdG9yKTsgICAgICAgXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBjb2xsZWN0TWF0Y2hpbmdFbGVtZW50cyhlbGVtZW50OiBFbGVtZW50LCBlbGVtZW50TWF0Y2hlcjogRWxlbWVudE1hdGNoZXIpOiBFbGVtZW50W10ge1xuICAgICAgICBzd2l0Y2godHlwZW9mKGVsZW1lbnRNYXRjaGVyKSkge1xuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKEVsZW1lbnRDb2xsZWN0b3IuRUxFTUVOVF9NQVRDSEVSX1RZUEVfRVJST1JfTUVTU0FHRSk7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgICAgICAgICAgIGxldCBjc3NTZWxlY3Rvcjogc3RyaW5nID0gPHN0cmluZz5lbGVtZW50TWF0Y2hlcjtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5jb2xsZWN0TWF0Y2hpbmdFbGVtZW50c0Zyb21Dc3NTZWxlY3RvcihlbGVtZW50LCBjc3NTZWxlY3Rvcik7XG5cbiAgICAgICAgICAgIGNhc2UgJ29iamVjdCc6XG4gICAgICAgICAgICAgICAgbGV0IG9iamVjdCA9IDxPYmplY3Q+ZWxlbWVudE1hdGNoZXI7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuY29sbGVjdE1hdGNoaW5nRWxlbWVudHNGcm9tT2JqZWN0KGVsZW1lbnQsIG9iamVjdCk7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICBjYXNlICdmdW5jdGlvbic6XG4gICAgICAgICAgICAgICAgbGV0IGVsZW1lbnRWaXN0b3IgPSA8RWxlbWVudFZpc3Rvcj5lbGVtZW50TWF0Y2hlcjtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5jb2xsZWN0TWF0Y2hpbmdFbGVtZW50c0Zyb21FbGVtZW50VmlzdG9yKGVsZW1lbnQsIGVsZW1lbnRWaXN0b3IpOyAgICAgICBcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgaXNNYXRjaGluZ0VsZW1lbnRGcm9tQ3NzU2VsZWN0b3IoZWxlbWVudDogRWxlbWVudCwgY3NzU2VsZWN0b3I6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgICAgICBpZih0eXBlb2YoZWxlbWVudC5tYXRjaGVzKSA9PT0gJ2Z1bmN0aW9uJykgeyAvLyB0YWtlIGEgc2hvcnRjdXQgaW4gbW9kZXJuIGJyb3dzZXJzXG4gICAgICAgICAgICByZXR1cm4gZWxlbWVudC5tYXRjaGVzKGNzc1NlbGVjdG9yKTtcbiAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICByZXR1cm4gaXNNZW1iZXJPZkFycmF5TGlrZShkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKGNzc1NlbGVjdG9yKSwgZWxlbWVudCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGlzTWF0Y2hpbmdFbGVtZW50RnJvbU9iamVjdChlbGVtZW50OiBFbGVtZW50LCBvYmplY3Q6IE9iamVjdCk6IGJvb2xlYW4ge1xuICAgICAgICBpZihvYmplY3QgPT09IG51bGwpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICBpZihpc0FycmF5TGlrZShvYmplY3QpKSB7XG4gICAgICAgICAgICAgICAgbGV0IGFycmF5TGlrZSA9IDxBcnJheUxpa2U8YW55Pj5vYmplY3Q7XG5cbiAgICAgICAgICAgICAgICBpZihhcnJheUxpa2UubGVuZ3RoID09PSAwIHx8IGFycmF5TGlrZVswXSBpbnN0YW5jZW9mIEVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGlzTWVtYmVyT2ZBcnJheUxpa2UoYXJyYXlMaWtlLCBlbGVtZW50KTsgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoRWxlbWVudENvbGxlY3Rvci5FTEVNRU5UX01BVENIRVJfVFlQRV9FUlJPUl9NRVNTQUdFKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKEVsZW1lbnRDb2xsZWN0b3IuRUxFTUVOVF9NQVRDSEVSX1RZUEVfRVJST1JfTUVTU0FHRSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGlzTWF0Y2hpbmdFbGVtZW50RnJvbUVsZW1lbnRWaXN0b3IoZWxlbWVudDogRWxlbWVudCwgZWxlbWVudFZpc3RvcjogRWxlbWVudFZpc3Rvcik6IGJvb2xlYW4ge1xuICAgICAgICBsZXQgdmlzaXRvclJlc3VsdCA9IGVsZW1lbnRWaXN0b3IoZWxlbWVudCk7XG5cbiAgICAgICAgaWYodHlwZW9mKHZpc2l0b3JSZXN1bHQpID09PSAnYm9vbGVhbicpIHtcbiAgICAgICAgICAgIGxldCBpc01hdGNoID0gPGJvb2xlYW4+dmlzaXRvclJlc3VsdDtcbiAgICAgICAgICAgIHJldHVybiBpc01hdGNoO1xuICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgIGxldCBlbGVtZW50TWF0Y2hlciA9IDxFbGVtZW50TWF0Y2hlcj52aXNpdG9yUmVzdWx0O1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuaXNNYXRjaGluZ0VsZW1lbnQoZWxlbWVudCwgZWxlbWVudE1hdGNoZXIpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBjb2xsZWN0TWF0Y2hpbmdFbGVtZW50c0Zyb21Dc3NTZWxlY3RvcihlbGVtZW50OiBFbGVtZW50LCBjc3NTZWxlY3Rvcjogc3RyaW5nKTogRWxlbWVudFtdIHtcbiAgICAgICAgcmV0dXJuIHRvQXJyYXk8RWxlbWVudD4oZWxlbWVudC5xdWVyeVNlbGVjdG9yQWxsKGNzc1NlbGVjdG9yKSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBjb2xsZWN0TWF0Y2hpbmdFbGVtZW50c0Zyb21PYmplY3QoZWxlbWVudDogRWxlbWVudCwgb2JqZWN0OiBPYmplY3QpOiBFbGVtZW50W10ge1xuICAgICAgICBpZihvYmplY3QgPT09IG51bGwpIHtcbiAgICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICBpZihpc0FycmF5TGlrZShvYmplY3QpKSB7XG4gICAgICAgICAgICAgICAgbGV0IGFycmF5TGlrZSA9IDxBcnJheUxpa2U8YW55Pj5vYmplY3Q7XG5cbiAgICAgICAgICAgICAgICBpZihhcnJheUxpa2UubGVuZ3RoID09PSAwIHx8IGFycmF5TGlrZVswXSBpbnN0YW5jZW9mIEVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRvQXJyYXk8RWxlbWVudD4oYXJyYXlMaWtlKTsgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoRWxlbWVudENvbGxlY3Rvci5FTEVNRU5UX01BVENIRVJfVFlQRV9FUlJPUl9NRVNTQUdFKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKEVsZW1lbnRDb2xsZWN0b3IuRUxFTUVOVF9NQVRDSEVSX1RZUEVfRVJST1JfTUVTU0FHRSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGNvbGxlY3RNYXRjaGluZ0VsZW1lbnRzRnJvbUVsZW1lbnRWaXN0b3IoZWxlbWVudDogRWxlbWVudCwgZWxlbWVudFZpc3RvcjogRWxlbWVudFZpc3Rvcik6IEVsZW1lbnRbXSB7XG4gICAgICAgIGxldCBlbGVtZW50czogRWxlbWVudFtdID0gW107XG5cbiAgICAgICAgLy8gSSdtIGZpYmJpbmcgdG8gdGhlIGNvbXBpbGVyIGhlcmUuIGBlbGVtZW50LmNoaWxkcmVuYCBpcyBhIGBOb2RlTGlzdE9mPEVsZW1lbnQ+YCxcbiAgICAgICAgLy8gd2hpY2ggZG9lcyBub3QgaGF2ZSBhIGNvbXBhdGFibGUgaW50ZXJmYWNlIHdpdGggYEFycmF5PEVsZW1lbnQ+YDsgaG93ZXZlciwgdGhlXG4gICAgICAgIC8vIGdlbmVyYXRlZCBjb2RlIHN0aWxsIHdvcmtzIGJlY2F1c2UgaXQgZG9lc24ndCBhY3R1YWxseSB1c2UgdmVyeSBtdWNoIG9mIHRoZSBcbiAgICAgICAgLy8gYEFycmF5YCBpbnRlcmFjZSAoaXQgcmVhbGx5IG9ubHkgYXNzdW1lcyBhIG51bWJlcmljIGxlbmd0aCBwcm9wZXJ0eSBhbmQga2V5cyBmb3JcbiAgICAgICAgLy8gMC4uLmxlbmd0aCkuIENhc3RpbmcgdG8gYGFueWAgaGVyZSBkZXN0cm95cyB0aGF0IHR5cGUgaW5mb3JtYXRpb24sIHNvIHRoZSBcbiAgICAgICAgLy8gY29tcGlsZXIgY2FuJ3QgdGVsbCB0aGVyZSBpcyBhbiBpc3N1ZSBhbmQgYWxsb3dzIGl0IHdpdGhvdXQgYW4gZXJyb3IuXG4gICAgICAgIGZvcihsZXQgY2hpbGQgb2YgPGFueT5lbGVtZW50LmNoaWxkcmVuKSB7XG4gICAgICAgICAgICBpZihjaGlsZCBpbnN0YW5jZW9mIEVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgICBsZXQgZWxlbWVudDogRWxlbWVudCA9IGNoaWxkO1xuICAgICAgICAgICAgICAgIGxldCB2aXNpdG9yUmVzdWx0ID0gZWxlbWVudFZpc3RvcihlbGVtZW50KTtcblxuICAgICAgICAgICAgICAgIGlmKHR5cGVvZih2aXNpdG9yUmVzdWx0KSA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgICAgICAgICAgICAgIGxldCBpc01hdGNoID0gPGJvb2xlYW4+dmlzaXRvclJlc3VsdDtcblxuICAgICAgICAgICAgICAgICAgICBpZihpc01hdGNoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBlbGVtZW50cy5wdXNoKGVsZW1lbnQpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICAgICAgICAgIGVsZW1lbnRzLnB1c2goLi4udGhpcy5jb2xsZWN0TWF0Y2hpbmdFbGVtZW50cyhlbGVtZW50LCB2aXNpdG9yUmVzdWx0KSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGVsZW1lbnRzO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gaXNBcnJheUxpa2UodmFsdWU6IGFueSkge1xuICAgIHJldHVybiB0eXBlb2YodmFsdWUpID09PSAnb2JqZWN0JyAmJiB0eXBlb2YodmFsdWUubGVuZ3RoKSA9PT0gJ251bWJlcic7XG59XG5cbmZ1bmN0aW9uIHRvQXJyYXk8VD4oYXJyYXlMaWtlOiBBcnJheUxpa2U8VD4pOiBBcnJheTxUPiB7XG4gICAgaWYoaXNBcnJheUxpa2UoYXJyYXlMaWtlKSkge1xuICAgICAgICByZXR1cm4gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJyYXlMaWtlLCAwKTtcbiAgICB9ZWxzZXtcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignRXhwZWN0ZWQgQXJyYXlMaWtlJyk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBpc01lbWJlck9mQXJyYXlMaWtlKGhheXN0YWNrOiBBcnJheUxpa2U8YW55PiwgIG5lZWRsZTogYW55KSB7XG4gICAgcmV0dXJuIEFycmF5LnByb3RvdHlwZS5pbmRleE9mLmNhbGwoaGF5c3RhY2ssIG5lZWRsZSkgIT09IC0xO1xufVxuIiwiaW1wb3J0IHsgU3Vic2NyaXB0aW9uLCBTdWJzY3JpcHRpb25FeGVjdXRvciB9IGZyb20gJy4vc3Vic2NyaXB0aW9ucy9zdWJzY3JpcHRpb24nO1xuaW1wb3J0IHsgVHJpdmlhbFN1YnNjcmlwdGlvbiB9IGZyb20gJy4vc3Vic2NyaXB0aW9ucy90cml2aWFsX3N1YnNjcmlwdGlvbic7XG5pbXBvcnQgeyBNYXRjaGluZ0VsZW1lbnRzU3Vic2NyaXB0aW9uLCBNYXRjaGluZ0VsZW1lbnRzQ2hhbmdlZEV2ZW50IH0gZnJvbSAnLi9zdWJzY3JpcHRpb25zL21hdGNoaW5nX2VsZW1lbnRzX3N1YnNjcmlwdGlvbic7XG5pbXBvcnQgeyBFbGVtZW50TWF0Y2hlc1N1YnNjcmlwdGlvbiwgRWxlbWVudE1hdGNoZXNDaGFuZ2VkRXZlbnQsIEVsZW1lbnRNYXRjaGVyIH0gZnJvbSAnLi9zdWJzY3JpcHRpb25zL2VsZW1lbnRfbWF0Y2hlc19zdWJzY3JpcHRpb24nO1xuaW1wb3J0IHsgRXZlbnRTdWJzY3JpcHRpb24sIEV2ZW50TWF0Y2hlciB9IGZyb20gJy4vc3Vic2NyaXB0aW9ucy9ldmVudF9zdWJzY3JpcHRpb24nO1xuXG5leHBvcnQgY2xhc3MgU2NvcGUge1xuICAgIHN0YXRpYyBidWlsZFJvb3RTY29wZShlbGVtZW50OiBFbGVtZW50KTogU2NvcGUge1xuICAgICAgICBsZXQgc2NvcGUgPSBuZXcgU2NvcGUobnVsbCwgJzw8cm9vdD4+JywgZWxlbWVudCwgbnVsbCk7XG5cbiAgICAgICAgc2NvcGUuYWN0aXZhdGUoKTtcblxuICAgICAgICByZXR1cm4gc2NvcGU7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSByZWFkb25seSBwYXJlbnRTY29wZTogU2NvcGU7XG4gICAgcHJpdmF0ZSByZWFkb25seSBjaGlsZFNjb3BlczogU2NvcGVbXSA9IFtdOyAgICBcbiAgICBwcml2YXRlIHJlYWRvbmx5IGVsZW1lbnQ6IEVsZW1lbnQ7XG4gICAgcHJpdmF0ZSByZWFkb25seSBuYW1lOiBzdHJpbmc7XG5cbiAgICBwcml2YXRlIGlzQWN0aXZhdGVkOiBib29sZWFuID0gZmFsc2U7XG4gICAgcHJpdmF0ZSBzdWJzY3JpcHRpb25zOiBTdWJzY3JpcHRpb25bXSA9IFtdO1xuXG4gICAgY29uc3RydWN0b3IocGFyZW50U2NvcGU6IFNjb3BlLCBuYW1lOiBzdHJpbmcsIGVsZW1lbnQ6IEVsZW1lbnQsIGV4ZWN1dG9yPzogU2NvcGVFeGVjdXRvcikge1xuICAgICAgICB0aGlzLnBhcmVudFNjb3BlID0gcGFyZW50U2NvcGU7XG4gICAgICAgIHRoaXMubmFtZSA9IG5hbWU7XG4gICAgICAgIHRoaXMuZWxlbWVudCA9IGVsZW1lbnQ7XG5cbiAgICAgICAgaWYoZXhlY3V0b3IpIHtcbiAgICAgICAgICAgIGV4ZWN1dG9yLmNhbGwodGhpcywgdGhpcywgdGhpcy5lbGVtZW50KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGdldFBhcmVudFNjb3BlKCk6IFNjb3BlIHtcbiAgICAgICAgcmV0dXJuIHRoaXMucGFyZW50U2NvcGU7XG4gICAgfVxuXG4gICAgZ2V0Q2hpbGRTY29wZXMoKTogU2NvcGVbXSB7XG4gICAgICAgIHJldHVybiB0aGlzLmNoaWxkU2NvcGVzO1xuICAgIH1cblxuICAgIGNvbGxlY3REZXNjZW5kYW50U2NvcGVzKCk6IFNjb3BlW10ge1xuICAgICAgICBsZXQgc2NvcGVzOiBTY29wZVtdID0gW107XG5cbiAgICAgICAgZm9yKGxldCBzY29wZSBvZiB0aGlzLmNoaWxkU2NvcGVzKSB7XG4gICAgICAgICAgICBzY29wZXMucHVzaChzY29wZSwgLi4uc2NvcGUuY29sbGVjdERlc2NlbmRhbnRTY29wZXMoKSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gc2NvcGVzO1xuICAgIH1cblxuICAgIGRyYXdUcmVlKCk6IHN0cmluZyB7XG4gICAgICAgIHJldHVybiB0aGlzLmRyYXdUcmVlTGluZXMoKS5qb2luKCdcXG4nKTtcbiAgICB9XG5cbiAgICBkcmF3VHJlZUxpbmVzKCk6IHN0cmluZ1tdIHtcbiAgICAgICAgbGV0IGxpbmVzOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgICAgIGxldCBzZWxmID0gdGhpcy5uYW1lICsgJyAoJyArIHRoaXMuc3Vic2NyaXB0aW9ucy5sZW5ndGggKyAnKSc7XG5cbiAgICAgICAgaWYodGhpcy5jaGlsZFNjb3Blcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBsaW5lcy5wdXNoKHNlbGYgKyAnIHsnKTtcblxuICAgICAgICAgICAgZm9yKGxldCBzY29wZSBvZiB0aGlzLmNoaWxkU2NvcGVzKSB7XG4gICAgICAgICAgICAgICAgZm9yKGxldCBsaW5lIG9mIHNjb3BlLmRyYXdUcmVlTGluZXMoKSkge1xuICAgICAgICAgICAgICAgICAgICBsaW5lcy5wdXNoKCdcXHQnICsgbGluZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBsaW5lcy5wdXNoKCd9Jyk7XG4gICAgICAgIH1lbHNle1xuICAgICAgICAgICAgbGluZXMucHVzaChzZWxmKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBsaW5lcztcbiAgICB9XG5cbiAgICBnZXRFbGVtZW50KCk6IEVsZW1lbnQge1xuICAgICAgICByZXR1cm4gdGhpcy5lbGVtZW50O1xuICAgIH1cblxuICAgIG1hdGNoKGV4ZWN1dG9yOiBTdWJzY3JpcHRpb25FeGVjdXRvcik6IFNjb3BlIHtcbiAgICAgICAgdGhpcy5hZGRTdWJzY3JpcHRpb24obmV3IFRyaXZpYWxTdWJzY3JpcHRpb24odGhpcy5lbGVtZW50LCB7IGNvbm5lY3RlZDogdHJ1ZSB9LCBleGVjdXRvcikpO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHVubWF0Y2goZXhlY3V0b3I6IFN1YnNjcmlwdGlvbkV4ZWN1dG9yKTogU2NvcGUge1xuICAgICAgICB0aGlzLmFkZFN1YnNjcmlwdGlvbihuZXcgVHJpdmlhbFN1YnNjcmlwdGlvbih0aGlzLmVsZW1lbnQsIHsgZGlzY29ubmVjdGVkOiB0cnVlIH0sIGV4ZWN1dG9yKSk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgc2VsZWN0KG1hdGNoZXI6IEVsZW1lbnRNYXRjaGVyLCBleGVjdXRvcjogU2NvcGVFeGVjdXRvcik6IFNjb3BlIHtcbiAgICAgICAgdGhpcy5hZGRTdWJzY3JpcHRpb24obmV3IE1hdGNoaW5nRWxlbWVudHNTdWJzY3JpcHRpb24odGhpcy5lbGVtZW50LCBtYXRjaGVyLCB0aGlzLmJ1aWxkU2VsZWN0RXhlY3V0b3IoU3RyaW5nKG1hdGNoZXIpLCBleGVjdXRvcikpKTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICB3aGVuKG1hdGNoZXI6IEVsZW1lbnRNYXRjaGVyLCBleGVjdXRvcjogU2NvcGVFeGVjdXRvcik6IFNjb3BlIHtcblx0XHR0aGlzLmFkZFN1YnNjcmlwdGlvbihuZXcgRWxlbWVudE1hdGNoZXNTdWJzY3JpcHRpb24odGhpcy5lbGVtZW50LCBtYXRjaGVyLCB0aGlzLmJ1aWxkV2hlbkV4ZWN1dG9yKFN0cmluZyhtYXRjaGVyKSwgZXhlY3V0b3IpKSk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgb24oZXZlbnRNYXRjaGVyOiBFdmVudE1hdGNoZXIsIGV4ZWN1dG9yOiBTdWJzY3JpcHRpb25FeGVjdXRvcik6IFNjb3BlO1xuICAgIG9uKGV2ZW50TWF0Y2hlcjogRXZlbnRNYXRjaGVyLCBlbGVtZW50TWF0Y2hlcjogRWxlbWVudE1hdGNoZXIsIGV4ZWN1dG9yOiBTdWJzY3JpcHRpb25FeGVjdXRvcik6IFNjb3BlO1xuICAgIG9uKGV2ZW50TWF0Y2hlcjogRXZlbnRNYXRjaGVyLCBleGVjdXRvck9yRWxlbWVudE1hdGNoZXI6IFN1YnNjcmlwdGlvbkV4ZWN1dG9yIHwgRWxlbWVudE1hdGNoZXIsIG1heWJlRXhlY3V0b3I/OiBTdWJzY3JpcHRpb25FeGVjdXRvcik6IFNjb3BlIHtcbiAgICAgICAgbGV0IGFyZ3VtZW50c0NvdW50ID0gYXJndW1lbnRzLmxlbmd0aDtcblxuICAgICAgICBzd2l0Y2goYXJndW1lbnRzQ291bnQpIHtcbiAgICAgICAgICAgIGNhc2UgMjpcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5vbldpdGhUd29Bcmd1bWVudHMoZXZlbnRNYXRjaGVyLCA8U3Vic2NyaXB0aW9uRXhlY3V0b3I+ZXhlY3V0b3JPckVsZW1lbnRNYXRjaGVyKTtcbiAgICAgICAgICAgIGNhc2UgMzpcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5vbldpdGhUaHJlZUFyZ3VtZW50cyhldmVudE1hdGNoZXIsIDxFbGVtZW50TWF0Y2hlcj5leGVjdXRvck9yRWxlbWVudE1hdGNoZXIsIDxTdWJzY3JpcHRpb25FeGVjdXRvcj5tYXliZUV4ZWN1dG9yKTtcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcIkZhaWxlZCB0byBleGVjdXRlICdvbicgb24gJ1Njb3BlJzogMiBvciAzIGFyZ3VtZW50cyByZXF1aXJlZCwgYnV0IFwiICsgYXJndW1lbnRzQ291bnQgKyBcIiBwcmVzZW50LlwiKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgb25XaXRoVHdvQXJndW1lbnRzKGV2ZW50TWF0Y2hlcjogRXZlbnRNYXRjaGVyLCBleGVjdXRvcjogU3Vic2NyaXB0aW9uRXhlY3V0b3IpOiBTY29wZSB7XG4gICAgICAgIHRoaXMuYWRkU3Vic2NyaXB0aW9uKG5ldyBFdmVudFN1YnNjcmlwdGlvbih0aGlzLmVsZW1lbnQsIGV2ZW50TWF0Y2hlciwgZXhlY3V0b3IpKTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwcml2YXRlIG9uV2l0aFRocmVlQXJndW1lbnRzKGV2ZW50TWF0Y2hlcjogRXZlbnRNYXRjaGVyLCBlbGVtZW50TWF0Y2hlcjogRWxlbWVudE1hdGNoZXIsIGV4ZWN1dG9yOiBTdWJzY3JpcHRpb25FeGVjdXRvcik6IFNjb3BlIHtcbiAgICAgICAgdGhpcy5zZWxlY3QoZWxlbWVudE1hdGNoZXIsIChzY29wZSkgPT4ge1xuICAgICAgICAgICAgc2NvcGUub24oZXZlbnRNYXRjaGVyLCBleGVjdXRvcilcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuICAgIFxuICAgIC8vIFRoaXMgbWV0aG9kIGlzIGZvciB0ZXN0aW5nXG4gICAgcHJpc3RpbmUoKTogdm9pZCB7XG4gICAgICAgIGZvcihsZXQgc3Vic2NyaXB0aW9uIG9mIHRoaXMuc3Vic2NyaXB0aW9ucykge1xuICAgICAgICAgICAgc3Vic2NyaXB0aW9uLmRpc2Nvbm5lY3QoKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgdGhpcy5zdWJzY3JpcHRpb25zLnNwbGljZSgwKTtcbiAgICB9XG5cbiAgICBwcm90ZWN0ZWQgYWN0aXZhdGUoKTogdm9pZCB7XG4gICAgICAgIGlmKCF0aGlzLmlzQWN0aXZhdGVkKSB7XG4gICAgICAgICAgICB0aGlzLmlzQWN0aXZhdGVkID0gdHJ1ZTtcblxuICAgICAgICAgICAgZm9yKGxldCBzdWJzY3JpcHRpb24gb2YgdGhpcy5zdWJzY3JpcHRpb25zKSB7XG4gICAgICAgICAgICAgICAgc3Vic2NyaXB0aW9uLmNvbm5lY3QoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByb3RlY3RlZCBkZWFjdGl2YXRlKCk6IHZvaWQge1xuICAgICAgICBpZih0aGlzLmlzQWN0aXZhdGVkKSB7XG4gICAgICAgICAgICBmb3IobGV0IHN1YnNjcmlwdGlvbiBvZiB0aGlzLnN1YnNjcmlwdGlvbnMpIHtcbiAgICAgICAgICAgICAgICBzdWJzY3JpcHRpb24uZGlzY29ubmVjdCgpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZih0aGlzLmNoaWxkU2NvcGVzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oJ0J1ZyBkZXRlY3RlZCEnLCB0aGlzLCAnaXMgdHJ5aW5nIHRvIGRlYWN0aXZhdGUgd2l0aCBsZWZ0b3ZlciBjaGlsZHJlbicsIHRoaXMuY2hpbGRTY29wZXMsICchIFJlY292ZXJpbmcuLi4nKTtcblxuICAgICAgICAgICAgICAgIGxldCBjaGlsZFNjb3BlO1xuICAgICAgICAgICAgICAgIHdoaWxlKGNoaWxkU2NvcGUgPSB0aGlzLmNoaWxkU2NvcGVzWzBdKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZGVzdHJveUNoaWxkU2NvcGUoY2hpbGRTY29wZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLmlzQWN0aXZhdGVkID0gZmFsc2U7ICAgICAgICAgICAgXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGFkZFN1YnNjcmlwdGlvbihzdWJzY3JpcHRpb246IFN1YnNjcmlwdGlvbik6IHZvaWQge1xuICAgICAgICB0aGlzLnN1YnNjcmlwdGlvbnMucHVzaChzdWJzY3JpcHRpb24pO1xuXG4gICAgICAgIGlmKHRoaXMuaXNBY3RpdmF0ZWQpIHtcbiAgICAgICAgICAgIHN1YnNjcmlwdGlvbi5jb25uZWN0KCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIHJlbW92ZVN1YnNjcmlwdGlvbihzdWJzY3JpcHRpb246IFN1YnNjcmlwdGlvbik6IHZvaWQge1xuICAgICAgICB2YXIgaW5kZXggPSB0aGlzLnN1YnNjcmlwdGlvbnMuaW5kZXhPZihzdWJzY3JpcHRpb24pO1xuXG4gICAgICAgIGlmKGluZGV4ID49IDApIHtcbiAgICAgICAgICAgIHN1YnNjcmlwdGlvbi5kaXNjb25uZWN0KCk7XG5cbiAgICAgICAgICAgIHRoaXMuc3Vic2NyaXB0aW9ucy5zcGxpY2UoaW5kZXgsIDEpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBidWlsZFNlbGVjdEV4ZWN1dG9yKG5hbWU6IHN0cmluZywgZXhlY3V0b3I6IFNjb3BlRXhlY3V0b3IpOiBTdWJzY3JpcHRpb25FeGVjdXRvciB7XG4gICAgICAgIGxldCBzY29wZXM6IFNjb3BlW10gPSBbXTtcblxuICAgICAgICByZXR1cm4gKGV2ZW50OiBNYXRjaGluZ0VsZW1lbnRzQ2hhbmdlZEV2ZW50LCBlbGVtZW50OiBFbGVtZW50KSA9PiB7XG4gICAgICAgICAgICBmb3IobGV0IGVsZW1lbnQgb2YgZXZlbnQuYWRkZWRFbGVtZW50cykge1xuICAgICAgICAgICAgICAgIGxldCBzY29wZSA9IHRoaXMuY3JlYXRlQ2hpbGRTY29wZShuYW1lLCBlbGVtZW50LCBleGVjdXRvcik7XG5cbiAgICAgICAgICAgICAgICBzY29wZXMucHVzaChzY29wZSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZvcihsZXQgZWxlbWVudCBvZiBldmVudC5yZW1vdmVkRWxlbWVudHMpIHtcbiAgICAgICAgICAgICAgICBmb3IobGV0IGluZGV4ID0gMCwgbGVuZ3RoID0gc2NvcGVzLmxlbmd0aCwgc2NvcGUgOiBTY29wZTsgaW5kZXggPCBsZW5ndGg7IGluZGV4KyspIHtcbiAgICAgICAgICAgICAgICAgICAgc2NvcGUgPSBzY29wZXNbaW5kZXhdO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmKHNjb3BlLmVsZW1lbnQgPT09IGVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZGVzdHJveUNoaWxkU2NvcGUoc2NvcGUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgICAgICBzY29wZXMuc3BsaWNlKGluZGV4LCAxKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgIH1cblxuICAgIHByaXZhdGUgYnVpbGRXaGVuRXhlY3V0b3IobmFtZTogc3RyaW5nLCBleGVjdXRvcjogU2NvcGVFeGVjdXRvcik6IFN1YnNjcmlwdGlvbkV4ZWN1dG9yIHtcbiAgICAgICAgbGV0IHNjb3BlIDogU2NvcGUgPSBudWxsO1xuXG4gICAgICAgIHJldHVybiAoZXZlbnQ6IEVsZW1lbnRNYXRjaGVzQ2hhbmdlZEV2ZW50LCBlbGVtZW50OiBFbGVtZW50KSA9PiB7XG4gICAgICAgICAgICBpZihldmVudC5pc01hdGNoaW5nKSB7XG4gICAgICAgICAgICAgICAgc2NvcGUgPSB0aGlzLmNyZWF0ZUNoaWxkU2NvcGUoJyYnICsgbmFtZSwgdGhpcy5lbGVtZW50LCBleGVjdXRvcik7XG4gICAgICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgICAgICB0aGlzLmRlc3Ryb3lDaGlsZFNjb3BlKHNjb3BlKTtcbiAgICAgICAgICAgICAgICBzY29wZSA9IG51bGw7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBjcmVhdGVDaGlsZFNjb3BlKG5hbWU6IHN0cmluZywgZWxlbWVudDogRWxlbWVudCwgZXhlY3V0b3I/OiBTY29wZUV4ZWN1dG9yKTogU2NvcGUge1xuICAgICAgICBsZXQgc2NvcGUgPSBuZXcgU2NvcGUodGhpcywgbmFtZSwgZWxlbWVudCwgZXhlY3V0b3IpO1xuICAgICAgICB0aGlzLmNoaWxkU2NvcGVzLnB1c2goc2NvcGUpO1xuXG4gICAgICAgIHNjb3BlLmFjdGl2YXRlKCk7XG5cbiAgICAgICAgcmV0dXJuIHNjb3BlO1xuICAgIH1cblxuICAgIHByaXZhdGUgZGVzdHJveUNoaWxkU2NvcGUoc2NvcGU6IFNjb3BlKSB7XG4gICAgICAgIGxldCBpbmRleCA9IHRoaXMuY2hpbGRTY29wZXMuaW5kZXhPZihzY29wZSk7XG5cbiAgICAgICAgc2NvcGUuZGVhY3RpdmF0ZSgpO1xuXG4gICAgICAgIGlmKGluZGV4ID49IDApIHtcbiAgICAgICAgICAgIHRoaXMuY2hpbGRTY29wZXMuc3BsaWNlKGluZGV4LCAxKTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBTY29wZUV4ZWN1dG9yIHsgKHNjb3BlOiBTY29wZSwgZWxlbWVudDogRWxlbWVudCk6IHZvaWQgfTtcbmV4cG9ydCB7IEVsZW1lbnRNYXRjaGVyLCBFdmVudE1hdGNoZXIsIFN1YnNjcmlwdGlvbkV4ZWN1dG9yIH07XG4iLCJpbXBvcnQgeyBTdWJzY3JpcHRpb24sIFN1YnNjcmlwdGlvbkV4ZWN1dG9yLCBTdWJzY3JpcHRpb25FdmVudCB9IGZyb20gJy4vc3Vic2NyaXB0aW9uJztcblxuaW50ZXJmYWNlIENvbW1vbkpzUmVxdWlyZSB7XG4gICAgKGlkOiBzdHJpbmcpOiBhbnk7XG59XG5cbmRlY2xhcmUgdmFyIHJlcXVpcmU6IENvbW1vbkpzUmVxdWlyZTtcbmxldCBNdXRhdGlvbk9ic2VydmVyID0gcmVxdWlyZSgnbXV0YXRpb24tb2JzZXJ2ZXInKTsgLy8gdXNlIHBvbHlmaWxsXG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBCYXRjaGVkTXV0YXRpb25TdWJzY3JpcHRpb24gZXh0ZW5kcyBTdWJzY3JpcHRpb24ge1xuICAgIHN0YXRpYyByZWFkb25seSBtdXRhdGlvbk9ic2VydmVySW5pdDogTXV0YXRpb25PYnNlcnZlckluaXQgPSB7XG4gICAgICAgIGNoaWxkTGlzdDogdHJ1ZSxcbiAgICAgICAgYXR0cmlidXRlczogdHJ1ZSxcbiAgICAgICAgY2hhcmFjdGVyRGF0YTogdHJ1ZSxcbiAgICAgICAgc3VidHJlZTogdHJ1ZVxuICAgIH07XG5cbiAgICBwcml2YXRlIGlzTGlzdGVuaW5nIDogYm9vbGVhbiA9IGZhbHNlO1xuICAgIHByaXZhdGUgaGFuZGxlTXV0YXRpb25UaW1lb3V0IDogYW55ID0gbnVsbDtcblxuICAgIHByaXZhdGUgcmVhZG9ubHkgbXV0YXRpb25DYWxsYmFjazogTXV0YXRpb25DYWxsYmFjaztcbiAgICBwcml2YXRlIHJlYWRvbmx5IG11dGF0aW9uT2JzZXJ2ZXI6IE11dGF0aW9uT2JzZXJ2ZXI7XG5cbiAgICBjb25zdHJ1Y3RvcihlbGVtZW50OiBFbGVtZW50LCBleGVjdXRvcjogU3Vic2NyaXB0aW9uRXhlY3V0b3IpIHtcbiAgICAgICAgc3VwZXIoZWxlbWVudCwgZXhlY3V0b3IpO1xuXG4gICAgICAgIHRoaXMubXV0YXRpb25DYWxsYmFjayA9ICgpOiB2b2lkID0+IHtcbiAgICAgICAgICAgIHRoaXMuZGVmZXJIYW5kbGVNdXRhdGlvbnMoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMubXV0YXRpb25PYnNlcnZlciA9IG5ldyBNdXRhdGlvbk9ic2VydmVyKHRoaXMubXV0YXRpb25DYWxsYmFjayk7XG4gICAgfVxuXG4gICAgcHJvdGVjdGVkIHN0YXJ0TGlzdGVuaW5nKCk6IHZvaWQge1xuICAgICAgICBpZighdGhpcy5pc0xpc3RlbmluZykge1xuICAgICAgICAgICAgdGhpcy5tdXRhdGlvbk9ic2VydmVyLm9ic2VydmUodGhpcy5lbGVtZW50LCBCYXRjaGVkTXV0YXRpb25TdWJzY3JpcHRpb24ubXV0YXRpb25PYnNlcnZlckluaXQpO1xuXG4gICAgICAgICAgICB0aGlzLmlzTGlzdGVuaW5nID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByb3RlY3RlZCBzdG9wTGlzdGVuaW5nKCk6IHZvaWQge1xuICAgICAgICBpZih0aGlzLmlzTGlzdGVuaW5nKSB7XG4gICAgICAgICAgICB0aGlzLm11dGF0aW9uT2JzZXJ2ZXIuZGlzY29ubmVjdCgpO1xuICAgICAgICAgICAgdGhpcy5oYW5kbGVNdXRhdGlvbnNOb3coKTtcblxuICAgICAgICAgICAgdGhpcy5pc0xpc3RlbmluZyA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgfVxuICAgIFxuICAgIHByb3RlY3RlZCBhYnN0cmFjdCBoYW5kbGVNdXRhdGlvbnMoKTogdm9pZDtcblxuICAgIHByaXZhdGUgZGVmZXJIYW5kbGVNdXRhdGlvbnMoKTogdm9pZCB7XG4gICAgICAgIGlmKHRoaXMuaGFuZGxlTXV0YXRpb25UaW1lb3V0ID09PSBudWxsKSB7XG4gICAgICAgICAgICB0aGlzLmhhbmRsZU11dGF0aW9uVGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4geyBcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLm11dGF0aW9uT2JzZXJ2ZXIudGFrZVJlY29yZHMoKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5oYW5kbGVNdXRhdGlvbnMoKTtcbiAgICAgICAgICAgICAgICB9ZmluYWxseXtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5oYW5kbGVNdXRhdGlvblRpbWVvdXQgPSBudWxsO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sIDApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBoYW5kbGVNdXRhdGlvbnNOb3coKTogdm9pZCB7XG4gICAgICAgIGlmKHRoaXMuaGFuZGxlTXV0YXRpb25UaW1lb3V0ICE9PSBudWxsKSB7XG4gICAgICAgICAgICBjbGVhclRpbWVvdXQodGhpcy5oYW5kbGVNdXRhdGlvblRpbWVvdXQpO1xuICAgICAgICAgICAgdGhpcy5oYW5kbGVNdXRhdGlvblRpbWVvdXQgPSBudWxsO1xuXG4gICAgICAgICAgICB0aGlzLmhhbmRsZU11dGF0aW9ucygpOyAgICAgICAgICAgIFxuICAgICAgICB9XG4gICAgfVxufVxuXG5leHBvcnQgeyBTdWJzY3JpcHRpb24sIFN1YnNjcmlwdGlvbkV4ZWN1dG9yLCBTdWJzY3JpcHRpb25FdmVudCB9OyIsImltcG9ydCB7IEJhdGNoZWRNdXRhdGlvblN1YnNjcmlwdGlvbiwgU3Vic2NyaXB0aW9uRXhlY3V0b3IsIFN1YnNjcmlwdGlvbkV2ZW50IH0gZnJvbSAnLi9iYXRjaGVkX211dGF0aW9uX3N1YnNjcmlwdGlvbic7XG5pbXBvcnQgeyBFbGVtZW50TWF0Y2hlciwgRWxlbWVudENvbGxlY3RvciB9IGZyb20gJy4uL2VsZW1lbnRfY29sbGVjdG9yJztcblxuZXhwb3J0IGNsYXNzIEVsZW1lbnRNYXRjaGVzU3Vic2NyaXB0aW9uIGV4dGVuZHMgQmF0Y2hlZE11dGF0aW9uU3Vic2NyaXB0aW9uIHtcbiAgICByZWFkb25seSBtYXRjaGVyOiBFbGVtZW50TWF0Y2hlcjtcblxuICAgIHByaXZhdGUgaXNDb25uZWN0ZWQ6IGJvb2xlYW4gPSBmYWxzZTtcbiAgICBwcml2YXRlIGlzTWF0Y2hpbmdFbGVtZW50OiBib29sZWFuID0gZmFsc2U7XG5cbiAgICBjb25zdHJ1Y3RvcihlbGVtZW50OiBFbGVtZW50LCBtYXRjaGVyOiBFbGVtZW50TWF0Y2hlciwgZXhlY3V0b3I6IFN1YnNjcmlwdGlvbkV4ZWN1dG9yKSB7XG4gICAgICAgIHN1cGVyKGVsZW1lbnQsIGV4ZWN1dG9yKTtcblxuICAgICAgICB0aGlzLm1hdGNoZXIgPSBtYXRjaGVyO1xuICAgIH1cblxuICAgIGNvbm5lY3QoKTogdm9pZCB7XG4gICAgICAgIGlmKCF0aGlzLmlzQ29ubmVjdGVkKSB7XG4gICAgICAgICAgICB0aGlzLnVwZGF0ZUlzTWF0Y2hpbmdFbGVtZW50KHRoaXMuY29tcHV0ZUlzTWF0Y2hpbmdFbGVtZW50KCkpO1xuICAgICAgICAgICAgdGhpcy5zdGFydExpc3RlbmluZygpO1xuXG4gICAgICAgICAgICB0aGlzLmlzQ29ubmVjdGVkID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGRpc2Nvbm5lY3QoKTogdm9pZCB7XG4gICAgICAgIGlmKHRoaXMuaXNDb25uZWN0ZWQpIHtcbiAgICAgICAgICAgIHRoaXMudXBkYXRlSXNNYXRjaGluZ0VsZW1lbnQoZmFsc2UpO1xuICAgICAgICAgICAgdGhpcy5zdG9wTGlzdGVuaW5nKCk7XG5cbiAgICAgICAgICAgIHRoaXMuaXNDb25uZWN0ZWQgPSBmYWxzZTtcbiAgICAgICAgfSAgICAgICAgXG4gICAgfVxuXG4gICAgcHJvdGVjdGVkIGhhbmRsZU11dGF0aW9ucygpOiB2b2lkIHtcbiAgICAgICAgdGhpcy51cGRhdGVJc01hdGNoaW5nRWxlbWVudCh0aGlzLmNvbXB1dGVJc01hdGNoaW5nRWxlbWVudCgpKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHVwZGF0ZUlzTWF0Y2hpbmdFbGVtZW50KGlzTWF0Y2hpbmdFbGVtZW50OiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIGxldCB3YXNNYXRjaGluZ0VsZW1lbnQgPSB0aGlzLmlzTWF0Y2hpbmdFbGVtZW50O1xuICAgICAgICB0aGlzLmlzTWF0Y2hpbmdFbGVtZW50ID0gaXNNYXRjaGluZ0VsZW1lbnQ7XG5cbiAgICAgICAgaWYod2FzTWF0Y2hpbmdFbGVtZW50ICE9PSBpc01hdGNoaW5nRWxlbWVudCkge1xuICAgICAgICAgICAgbGV0IGV2ZW50ID0gbmV3IEVsZW1lbnRNYXRjaGVzQ2hhbmdlZEV2ZW50KHRoaXMsIGlzTWF0Y2hpbmdFbGVtZW50KTtcblxuICAgICAgICAgICAgdGhpcy5leGVjdXRvcihldmVudCwgdGhpcy5lbGVtZW50KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgY29tcHV0ZUlzTWF0Y2hpbmdFbGVtZW50KCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gRWxlbWVudENvbGxlY3Rvci5pc01hdGNoaW5nRWxlbWVudCh0aGlzLmVsZW1lbnQsIHRoaXMubWF0Y2hlcik7XG4gICAgfVxufVxuXG5leHBvcnQgY2xhc3MgRWxlbWVudE1hdGNoZXNDaGFuZ2VkRXZlbnQgZXh0ZW5kcyBTdWJzY3JpcHRpb25FdmVudCB7XG4gICAgcmVhZG9ubHkgaXNNYXRjaGluZzogYm9vbGVhbjtcblxuICAgIGNvbnN0cnVjdG9yKGVsZW1lbnRNYXRjaGVzU3Vic2NyaXB0aW9uOiBFbGVtZW50TWF0Y2hlc1N1YnNjcmlwdGlvbiwgaXNNYXRjaGluZzogYm9vbGVhbikge1xuICAgICAgICBzdXBlcihlbGVtZW50TWF0Y2hlc1N1YnNjcmlwdGlvbiwgJ0VsZW1lbnRNYXRjaGVzQ2hhbmdlZEV2ZW50Jyk7XG5cbiAgICAgICAgdGhpcy5pc01hdGNoaW5nID0gaXNNYXRjaGluZztcbiAgICB9XG59XG5cbmV4cG9ydCB7IEVsZW1lbnRNYXRjaGVyIH07XG4iLCJpbXBvcnQgeyBTdWJzY3JpcHRpb24sIFN1YnNjcmlwdGlvbkV4ZWN1dG9yIH0gZnJvbSAnLi9zdWJzY3JpcHRpb24nO1xuXG5leHBvcnQgY2xhc3MgRXZlbnRTdWJzY3JpcHRpb24gZXh0ZW5kcyBTdWJzY3JpcHRpb24ge1xuICAgIHJlYWRvbmx5IGV2ZW50TWF0Y2hlcjogRXZlbnRNYXRjaGVyO1xuXG4gICAgcHJpdmF0ZSBpc0Nvbm5lY3RlZCA6IGJvb2xlYW4gPSBmYWxzZTsgICAgXG4gICAgcHJpdmF0ZSByZWFkb25seSBldmVudExpc3RlbmVyOiBFdmVudExpc3RlbmVyO1xuICAgIHByaXZhdGUgcmVhZG9ubHkgZXZlbnROYW1lczogc3RyaW5nW107XG5cbiAgICBjb25zdHJ1Y3RvcihlbGVtZW50OiBFbGVtZW50LCBldmVudE1hdGNoZXI6IEV2ZW50TWF0Y2hlciwgZXhlY3V0b3I6IFN1YnNjcmlwdGlvbkV4ZWN1dG9yKSB7XG4gICAgICAgIHN1cGVyKGVsZW1lbnQsIGV4ZWN1dG9yKTtcblxuICAgICAgICB0aGlzLmV2ZW50TWF0Y2hlciA9IGV2ZW50TWF0Y2hlcjtcbiAgICAgICAgdGhpcy5ldmVudE5hbWVzID0gdGhpcy5wYXJzZUV2ZW50TWF0Y2hlcih0aGlzLmV2ZW50TWF0Y2hlcik7XG5cbiAgICAgICAgdGhpcy5ldmVudExpc3RlbmVyID0gKGV2ZW50OiBFdmVudCk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgdGhpcy5oYW5kbGVFdmVudChldmVudCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBjb25uZWN0KCk6IHZvaWQge1xuICAgICAgICBpZighdGhpcy5pc0Nvbm5lY3RlZCkge1xuICAgICAgICAgICAgdGhpcy5pc0Nvbm5lY3RlZCA9IHRydWU7XG5cbiAgICAgICAgICAgIGZvcihsZXQgZXZlbnROYW1lIG9mIHRoaXMuZXZlbnROYW1lcykge1xuICAgICAgICAgICAgICAgIHRoaXMuZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKGV2ZW50TmFtZSwgdGhpcy5ldmVudExpc3RlbmVyLCBmYWxzZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBkaXNjb25uZWN0KCk6IHZvaWQge1xuICAgICAgICBpZih0aGlzLmlzQ29ubmVjdGVkKSB7XG4gICAgICAgICAgICBmb3IobGV0IGV2ZW50TmFtZSBvZiB0aGlzLmV2ZW50TmFtZXMpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmVsZW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcihldmVudE5hbWUsIHRoaXMuZXZlbnRMaXN0ZW5lciwgZmFsc2UpO1xuICAgICAgICAgICAgfSAgICAgICAgICAgIFxuXG4gICAgICAgICAgICB0aGlzLmlzQ29ubmVjdGVkID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGhhbmRsZUV2ZW50KGV2ZW50OiBFdmVudCk6IHZvaWQge1xuICAgICAgICB0aGlzLmV4ZWN1dG9yKGV2ZW50LCB0aGlzLmVsZW1lbnQpOyAgICAgICAgIFxuICAgIH1cblxuICAgIHByaXZhdGUgcGFyc2VFdmVudE1hdGNoZXIoZXZlbnRNYXRjaGVyOiBFdmVudE1hdGNoZXIpOiBzdHJpbmdbXSB7XG4gICAgICAgIC8vIFRPRE86IFN1cHBvcnQgYWxsIG9mIHRoZSBqUXVlcnkgc3R5bGUgZXZlbnQgb3B0aW9uc1xuICAgICAgICByZXR1cm4gZXZlbnRNYXRjaGVyLnNwbGl0KCcgJyk7XG4gICAgfSBcbn1cblxuZXhwb3J0IGRlY2xhcmUgdHlwZSBFdmVudE1hdGNoZXIgPSBzdHJpbmc7XG4iLCJpbXBvcnQgeyBCYXRjaGVkTXV0YXRpb25TdWJzY3JpcHRpb24sIFN1YnNjcmlwdGlvbkV4ZWN1dG9yLCBTdWJzY3JpcHRpb25FdmVudCB9IGZyb20gJy4vYmF0Y2hlZF9tdXRhdGlvbl9zdWJzY3JpcHRpb24nO1xuaW1wb3J0IHsgRWxlbWVudE1hdGNoZXIsIEVsZW1lbnRDb2xsZWN0b3IgfSBmcm9tICcuLi9lbGVtZW50X2NvbGxlY3Rvcic7XG5cbmV4cG9ydCBjbGFzcyBNYXRjaGluZ0VsZW1lbnRzU3Vic2NyaXB0aW9uIGV4dGVuZHMgQmF0Y2hlZE11dGF0aW9uU3Vic2NyaXB0aW9uIHtcbiAgICByZWFkb25seSBtYXRjaGVyOiBFbGVtZW50TWF0Y2hlcjtcblxuICAgIHByaXZhdGUgaXNDb25uZWN0ZWQ6IGJvb2xlYW4gPSBmYWxzZTtcbiAgICBwcml2YXRlIG1hdGNoaW5nRWxlbWVudHM6IEVsZW1lbnRbXSA9IFtdO1xuXG4gICAgY29uc3RydWN0b3IoZWxlbWVudDogRWxlbWVudCwgbWF0Y2hlcjogRWxlbWVudE1hdGNoZXIsIGV4ZWN1dG9yOiBTdWJzY3JpcHRpb25FeGVjdXRvcikge1xuICAgICAgICBzdXBlcihlbGVtZW50LCBleGVjdXRvcik7XG5cbiAgICAgICAgdGhpcy5tYXRjaGVyID0gbWF0Y2hlcjtcbiAgICB9XG5cbiAgICBjb25uZWN0KCk6IHZvaWQge1xuICAgICAgICBpZighdGhpcy5pc0Nvbm5lY3RlZCkge1xuICAgICAgICAgICAgdGhpcy51cGRhdGVNYXRjaGluZ0VsZW1lbnRzKHRoaXMuY29sbGVjdE1hdGNoaW5nRWxlbWVudHMoKSk7XG4gICAgICAgICAgICB0aGlzLnN0YXJ0TGlzdGVuaW5nKCk7XG5cbiAgICAgICAgICAgIHRoaXMuaXNDb25uZWN0ZWQgPSB0cnVlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZGlzY29ubmVjdCgpOiB2b2lkIHtcbiAgICAgICAgaWYodGhpcy5pc0Nvbm5lY3RlZCkge1xuICAgICAgICAgICAgdGhpcy51cGRhdGVNYXRjaGluZ0VsZW1lbnRzKFtdKTtcbiAgICAgICAgICAgIHRoaXMuc3RvcExpc3RlbmluZygpO1xuXG4gICAgICAgICAgICB0aGlzLmlzQ29ubmVjdGVkID0gZmFsc2U7XG4gICAgICAgIH0gICAgICAgIFxuICAgIH1cblxuICAgIHByb3RlY3RlZCBoYW5kbGVNdXRhdGlvbnMoKTogdm9pZCB7XG4gICAgICAgIHRoaXMudXBkYXRlTWF0Y2hpbmdFbGVtZW50cyh0aGlzLmNvbGxlY3RNYXRjaGluZ0VsZW1lbnRzKCkpO1xuICAgIH1cblxuICAgIHByaXZhdGUgdXBkYXRlTWF0Y2hpbmdFbGVtZW50cyhtYXRjaGluZ0VsZW1lbnRzOiBFbGVtZW50W10pOiB2b2lkIHtcbiAgICAgICAgbGV0IHByZXZpb3VzbHlNYXRjaGluZ0VsZW1lbnRzID0gdGhpcy5tYXRjaGluZ0VsZW1lbnRzO1xuXG4gICAgICAgIGxldCBhZGRlZEVsZW1lbnRzID0gYXJyYXlTdWJ0cmFjdChtYXRjaGluZ0VsZW1lbnRzLCBwcmV2aW91c2x5TWF0Y2hpbmdFbGVtZW50cyk7XG4gICAgICAgIGxldCByZW1vdmVkRWxlbWVudHMgPSBhcnJheVN1YnRyYWN0KHByZXZpb3VzbHlNYXRjaGluZ0VsZW1lbnRzLCBtYXRjaGluZ0VsZW1lbnRzKTtcblxuICAgICAgICB0aGlzLm1hdGNoaW5nRWxlbWVudHMgPSBtYXRjaGluZ0VsZW1lbnRzOyAgIFxuICAgICAgICBcbiAgICAgICAgaWYoYWRkZWRFbGVtZW50cy5sZW5ndGggPiAwIHx8IHJlbW92ZWRFbGVtZW50cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBsZXQgZXZlbnQgPSBuZXcgTWF0Y2hpbmdFbGVtZW50c0NoYW5nZWRFdmVudCh0aGlzLCBhZGRlZEVsZW1lbnRzLCByZW1vdmVkRWxlbWVudHMpO1xuXG4gICAgICAgICAgICB0aGlzLmV4ZWN1dG9yKGV2ZW50LCB0aGlzLmVsZW1lbnQpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBjb2xsZWN0TWF0Y2hpbmdFbGVtZW50cygpOiBFbGVtZW50W10ge1xuICAgICAgICByZXR1cm4gRWxlbWVudENvbGxlY3Rvci5jb2xsZWN0TWF0Y2hpbmdFbGVtZW50cyh0aGlzLmVsZW1lbnQsIHRoaXMubWF0Y2hlcik7XG4gICAgfVxufVxuXG5leHBvcnQgY2xhc3MgTWF0Y2hpbmdFbGVtZW50c0NoYW5nZWRFdmVudCBleHRlbmRzIFN1YnNjcmlwdGlvbkV2ZW50IHtcbiAgICByZWFkb25seSBhZGRlZEVsZW1lbnRzOiBFbGVtZW50W107XG4gICAgcmVhZG9ubHkgcmVtb3ZlZEVsZW1lbnRzOiBFbGVtZW50W107XG5cbiAgICBjb25zdHJ1Y3RvcihtYXRjaGluZ0VsZW1lbnRzU3Vic2NyaXB0aW9uOiBNYXRjaGluZ0VsZW1lbnRzU3Vic2NyaXB0aW9uLCBhZGRlZEVsZW1lbnRzOiBFbGVtZW50W10sIHJlbW92ZWRFbGVtZW50czogRWxlbWVudFtdKSB7XG4gICAgICAgIHN1cGVyKG1hdGNoaW5nRWxlbWVudHNTdWJzY3JpcHRpb24sICdNYXRjaGluZ0VsZW1lbnRzQ2hhbmdlZCcpO1xuXG4gICAgICAgIHRoaXMuYWRkZWRFbGVtZW50cyA9IGFkZGVkRWxlbWVudHM7XG4gICAgICAgIHRoaXMucmVtb3ZlZEVsZW1lbnRzID0gcmVtb3ZlZEVsZW1lbnRzO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gYXJyYXlTdWJ0cmFjdDxUPihtaW51ZW5kOiBUW10sIHN1YnRyYWhlbmQ6IFRbXSk6IFRbXSB7XG4gICAgbGV0IGRpZmZlcmVuY2U6IFRbXSA9IFtdO1xuXG4gICAgZm9yKGxldCBtZW1iZXIgb2YgbWludWVuZCkge1xuICAgICAgICBpZihzdWJ0cmFoZW5kLmluZGV4T2YobWVtYmVyKSA9PT0gLTEpIHtcbiAgICAgICAgICAgIGRpZmZlcmVuY2UucHVzaChtZW1iZXIpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGRpZmZlcmVuY2U7XG59IiwiZXhwb3J0IGFic3RyYWN0IGNsYXNzIFN1YnNjcmlwdGlvbiB7XG4gICAgcHJvdGVjdGVkIHJlYWRvbmx5IGV4ZWN1dG9yOiBTdWJzY3JpcHRpb25FeGVjdXRvcjtcbiAgICBwcm90ZWN0ZWQgcmVhZG9ubHkgZWxlbWVudDogRWxlbWVudDtcbiAgICBcbiAgICBjb25zdHJ1Y3RvcihlbGVtZW50OiBFbGVtZW50LCBleGVjdXRvcjogU3Vic2NyaXB0aW9uRXhlY3V0b3IpIHtcbiAgICAgICAgdGhpcy5lbGVtZW50ID0gZWxlbWVudDtcbiAgICAgICAgdGhpcy5leGVjdXRvciA9IGV4ZWN1dG9yO1xuICAgIH1cblxuICAgIGFic3RyYWN0IGNvbm5lY3QoKSA6IHZvaWQ7XG4gICAgYWJzdHJhY3QgZGlzY29ubmVjdCgpIDogdm9pZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdWJzY3JpcHRpb25FeGVjdXRvciB7IFxuICAgIChldmVudDogRXZlbnQgfCBTdWJzY3JpcHRpb25FdmVudCwgZWxlbWVudDogRWxlbWVudCk6IHZvaWQgXG59XG5cbmV4cG9ydCBjbGFzcyBTdWJzY3JpcHRpb25FdmVudCB7XG4gICAgcmVhZG9ubHkgc3Vic2NyaXB0aW9uOiBTdWJzY3JpcHRpb247XG4gICAgcmVhZG9ubHkgbmFtZTogc3RyaW5nO1xuXG4gICAgY29uc3RydWN0b3Ioc3Vic2NyaXB0aW9uOiBTdWJzY3JpcHRpb24sIG5hbWU6IHN0cmluZykge1xuICAgICAgICB0aGlzLnN1YnNjcmlwdGlvbiA9IHN1YnNjcmlwdGlvbjtcbiAgICAgICAgdGhpcy5uYW1lID0gbmFtZTtcbiAgICB9XG59XG4iLCJpbXBvcnQgeyBTdWJzY3JpcHRpb24sIFN1YnNjcmlwdGlvbkV4ZWN1dG9yLCBTdWJzY3JpcHRpb25FdmVudCB9IGZyb20gJy4vc3Vic2NyaXB0aW9uJztcblxuZXhwb3J0IGludGVyZmFjZSBUcml2aWFsU3Vic2NyaXB0aW9uQ29uZmlndXJhdGlvbiB7XG4gICAgY29ubmVjdGVkPzogYm9vbGVhbixcbiAgICBkaXNjb25uZWN0ZWQ/OiBib29sZWFuXG59XG5cbmV4cG9ydCBjbGFzcyBFbGVtZW50Q29ubmVjdGlvbkNoYW5nZWRFdmVudCBleHRlbmRzIFN1YnNjcmlwdGlvbkV2ZW50IHtcbiAgICByZWFkb25seSBlbGVtZW50OiBFbGVtZW50O1xuICAgIHJlYWRvbmx5IGlzQ29ubmVjdGVkOiBib29sZWFuO1xuXG4gICAgY29uc3RydWN0b3IodHJpdmlhbFN1YnNjcmlwdGlvbjogVHJpdmlhbFN1YnNjcmlwdGlvbiwgZWxlbWVudDogRWxlbWVudCwgaXNDb25uZWN0ZWQ6IGJvb2xlYW4pIHtcbiAgICAgICAgc3VwZXIodHJpdmlhbFN1YnNjcmlwdGlvbiwgJ0VsZW1lbnRDb25uZWN0ZWQnKTtcblxuICAgICAgICB0aGlzLmVsZW1lbnQgPSBlbGVtZW50O1xuICAgICAgICB0aGlzLmlzQ29ubmVjdGVkID0gaXNDb25uZWN0ZWQ7XG4gICAgfVxufVxuXG5leHBvcnQgY2xhc3MgVHJpdmlhbFN1YnNjcmlwdGlvbiBleHRlbmRzIFN1YnNjcmlwdGlvbiB7XG4gICAgcHJpdmF0ZSBpc0Nvbm5lY3RlZDogYm9vbGVhbiA9IGZhbHNlO1xuICAgIHByaXZhdGUgY29uZmlnOiBUcml2aWFsU3Vic2NyaXB0aW9uQ29uZmlndXJhdGlvbjtcblxuICAgIGNvbnN0cnVjdG9yKGVsZW1lbnQ6IEVsZW1lbnQsIGNvbmZpZzogVHJpdmlhbFN1YnNjcmlwdGlvbkNvbmZpZ3VyYXRpb24sIGV4ZWN1dG9yOiBTdWJzY3JpcHRpb25FeGVjdXRvcikge1xuICAgICAgICBzdXBlcihlbGVtZW50LCBleGVjdXRvcik7XG5cbiAgICAgICAgdGhpcy5jb25maWcgPSBjb25maWc7XG4gICAgfVxuXG4gICAgY29ubmVjdCgpIHtcbiAgICAgICAgaWYoIXRoaXMuaXNDb25uZWN0ZWQpIHtcbiAgICAgICAgICAgIHRoaXMuaXNDb25uZWN0ZWQgPSB0cnVlO1xuXG4gICAgICAgICAgICBpZih0aGlzLmNvbmZpZy5jb25uZWN0ZWQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmV4ZWN1dG9yKHRoaXMuYnVpbGRFbGVtZW50Q29ubmVjdGlvbkNoYW5nZWRFdmVudCgpLCB0aGlzLmVsZW1lbnQpOyBcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGRpc2Nvbm5lY3QoKSB7XG4gICAgICAgIGlmKHRoaXMuaXNDb25uZWN0ZWQpIHtcbiAgICAgICAgICAgIHRoaXMuaXNDb25uZWN0ZWQgPSBmYWxzZTtcblxuICAgICAgICAgICAgaWYodGhpcy5jb25maWcuZGlzY29ubmVjdGVkKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5leGVjdXRvcih0aGlzLmJ1aWxkRWxlbWVudENvbm5lY3Rpb25DaGFuZ2VkRXZlbnQoKSwgdGhpcy5lbGVtZW50KTsgICAgIFxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIFxuICAgIHByaXZhdGUgYnVpbGRFbGVtZW50Q29ubmVjdGlvbkNoYW5nZWRFdmVudCgpOiBFbGVtZW50Q29ubmVjdGlvbkNoYW5nZWRFdmVudCB7XG4gICAgICAgIHJldHVybiBuZXcgRWxlbWVudENvbm5lY3Rpb25DaGFuZ2VkRXZlbnQodGhpcywgdGhpcy5lbGVtZW50LCB0aGlzLmlzQ29ubmVjdGVkKTtcbiAgICB9XG59Il19
