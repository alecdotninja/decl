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
    Decl.inspect = function (includeSource) {
        this.getDefaultInstance().inspect(includeSource);
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
    Decl.prototype.inspect = function (includeSource) {
        console.groupCollapsed('<<root>>');
        try {
            this.scope.inspect(includeSource);
        }
        finally {
            console.groupEnd();
        }
    };
    Decl.prototype.pristine = function () {
        this.scope.pristine();
    };
    return Decl;
}());
Decl.defaultInstance = null;
exports.Decl = Decl;
// Export to a global for the browser (there *has* to be a better way to do this!)
if (typeof (window) !== 'undefined') {
    window.Decl = Decl;
}

},{"./scope":11}],3:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var Declaration = (function () {
    function Declaration(element) {
        this.isActivated = false;
        this.element = element;
    }
    Declaration.prototype.activate = function () {
        if (!this.isActivated) {
            this.isActivated = true;
            this.subscription.connect();
        }
    };
    Declaration.prototype.deactivate = function () {
        if (this.isActivated) {
            this.isActivated = false;
            this.subscription.disconnect();
        }
    };
    return Declaration;
}());
exports.Declaration = Declaration;

},{}],4:[function(require,module,exports){
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
var declaration_1 = require("./declaration");
var trivial_subscription_1 = require("../subscriptions/trivial_subscription");
var MatchDeclaration = (function (_super) {
    __extends(MatchDeclaration, _super);
    function MatchDeclaration(element, executor) {
        var _this = _super.call(this, element) || this;
        _this.executor = executor;
        _this.subscription = new trivial_subscription_1.TrivialSubscription(_this.element, { connected: true }, _this.executor);
        return _this;
    }
    MatchDeclaration.prototype.inspect = function () {
        console.groupCollapsed('matches');
        console.log(this.executor);
        console.groupEnd();
    };
    return MatchDeclaration;
}(declaration_1.Declaration));
exports.MatchDeclaration = MatchDeclaration;

},{"../subscriptions/trivial_subscription":17,"./declaration":3}],5:[function(require,module,exports){
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
var declaration_1 = require("./declaration");
var event_subscription_1 = require("../subscriptions/event_subscription");
var OnDeclaration = (function (_super) {
    __extends(OnDeclaration, _super);
    function OnDeclaration(element, matcher, executor) {
        var _this = _super.call(this, element) || this;
        _this.matcher = matcher;
        _this.executor = executor;
        _this.subscription = new event_subscription_1.EventSubscription(_this.element, _this.matcher, _this.executor);
        return _this;
    }
    OnDeclaration.prototype.inspect = function () {
        console.groupCollapsed('on', this.matcher);
        try {
            console.log(this.executor);
        }
        finally {
            console.groupEnd();
        }
    };
    return OnDeclaration;
}(declaration_1.Declaration));
exports.OnDeclaration = OnDeclaration;

},{"../subscriptions/event_subscription":14,"./declaration":3}],6:[function(require,module,exports){
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
var declaration_1 = require("./declaration");
var scope_1 = require("../scope");
var ScopeTrackingDeclaration = (function (_super) {
    __extends(ScopeTrackingDeclaration, _super);
    function ScopeTrackingDeclaration() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.childScopes = [];
        return _this;
    }
    ScopeTrackingDeclaration.prototype.deactivate = function () {
        this.removeAllChildScopes();
        _super.prototype.deactivate.call(this);
    };
    ScopeTrackingDeclaration.prototype.getChildScopes = function () {
        return this.childScopes;
    };
    ScopeTrackingDeclaration.prototype.inspectChildScopes = function (includeSource) {
        for (var _i = 0, _a = this.childScopes; _i < _a.length; _i++) {
            var childScope = _a[_i];
            childScope.inspect(includeSource);
        }
    };
    ScopeTrackingDeclaration.prototype.addChildScope = function (scope) {
        if (this.isActivated) {
            this.childScopes.push(scope);
            scope.activate();
        }
    };
    ScopeTrackingDeclaration.prototype.removeChildScope = function (scope) {
        scope.deactivate();
        if (this.isActivated) {
            var index = this.childScopes.indexOf(scope);
            if (index >= 0) {
                this.childScopes.splice(index, 1);
            }
        }
    };
    ScopeTrackingDeclaration.prototype.removeAllChildScopes = function () {
        var childScope;
        while (childScope = this.childScopes[0]) {
            this.removeChildScope(childScope);
        }
    };
    ScopeTrackingDeclaration.prototype.addChildScopeByElement = function (element, executor) {
        var childScope = new scope_1.Scope(element, executor);
        this.addChildScope(childScope);
    };
    ScopeTrackingDeclaration.prototype.removeChildScopeByElement = function (element) {
        for (var _i = 0, _a = this.childScopes; _i < _a.length; _i++) {
            var childScope = _a[_i];
            if (childScope.getElement() === element) {
                this.removeChildScope(childScope);
                return; // loop must exist to avoid data-race
            }
        }
    };
    return ScopeTrackingDeclaration;
}(declaration_1.Declaration));
exports.ScopeTrackingDeclaration = ScopeTrackingDeclaration;

},{"../scope":11,"./declaration":3}],7:[function(require,module,exports){
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
var scope_tracking_declaration_1 = require("./scope_tracking_declaration");
var matching_elements_subscription_1 = require("../subscriptions/matching_elements_subscription");
var SelectDeclaration = (function (_super) {
    __extends(SelectDeclaration, _super);
    function SelectDeclaration(element, matcher, executor) {
        var _this = _super.call(this, element) || this;
        _this.matcher = matcher;
        _this.executor = executor;
        _this.subscription = new matching_elements_subscription_1.MatchingElementsSubscription(_this.element, _this.matcher, function (event) {
            for (var _i = 0, _a = event.addedElements; _i < _a.length; _i++) {
                var element_1 = _a[_i];
                _this.addChildScopeByElement(element_1, _this.executor);
            }
            for (var _b = 0, _c = event.removedElements; _b < _c.length; _b++) {
                var element_2 = _c[_b];
                _this.removeChildScopeByElement(element_2);
            }
        });
        return _this;
    }
    SelectDeclaration.prototype.inspect = function (includeSource) {
        console.groupCollapsed('select', this.matcher);
        try {
            this.inspectChildScopes(includeSource);
        }
        finally {
            console.groupEnd();
        }
    };
    return SelectDeclaration;
}(scope_tracking_declaration_1.ScopeTrackingDeclaration));
exports.SelectDeclaration = SelectDeclaration;

},{"../subscriptions/matching_elements_subscription":15,"./scope_tracking_declaration":6}],8:[function(require,module,exports){
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
var declaration_1 = require("./declaration");
var trivial_subscription_1 = require("../subscriptions/trivial_subscription");
var UnmatchDeclaration = (function (_super) {
    __extends(UnmatchDeclaration, _super);
    function UnmatchDeclaration(element, executor) {
        var _this = _super.call(this, element) || this;
        _this.executor = executor;
        _this.subscription = new trivial_subscription_1.TrivialSubscription(_this.element, { disconnected: true }, _this.executor);
        return _this;
    }
    UnmatchDeclaration.prototype.inspect = function () {
        console.groupCollapsed('unmatches');
        console.log(this.executor);
        console.groupEnd();
    };
    return UnmatchDeclaration;
}(declaration_1.Declaration));
exports.UnmatchDeclaration = UnmatchDeclaration;

},{"../subscriptions/trivial_subscription":17,"./declaration":3}],9:[function(require,module,exports){
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
var scope_tracking_declaration_1 = require("./scope_tracking_declaration");
var element_matches_subscription_1 = require("../subscriptions/element_matches_subscription");
var WhenDeclaration = (function (_super) {
    __extends(WhenDeclaration, _super);
    function WhenDeclaration(element, matcher, executor) {
        var _this = _super.call(this, element) || this;
        _this.matcher = matcher;
        _this.executor = executor;
        _this.subscription = new element_matches_subscription_1.ElementMatchesSubscription(_this.element, _this.matcher, function (event) {
            if (event.isMatching) {
                _this.addChildScopeByElement(element, _this.executor);
            }
            else {
                _this.removeChildScopeByElement(element);
            }
        });
        return _this;
    }
    WhenDeclaration.prototype.inspect = function (includeSource) {
        console.groupCollapsed('when', this.matcher);
        try {
            this.inspectChildScopes(includeSource);
        }
        finally {
            console.groupEnd();
        }
    };
    return WhenDeclaration;
}(scope_tracking_declaration_1.ScopeTrackingDeclaration));
exports.WhenDeclaration = WhenDeclaration;

},{"../subscriptions/element_matches_subscription":13,"./scope_tracking_declaration":6}],10:[function(require,module,exports){
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
    ElementCollector.prototype.collectMatchingElementsFromObject = function (_element, object) {
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
        var children = element.children;
        for (var index = 0, length_1 = children.length; index < length_1; index++) {
            var child = children[index];
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

},{}],11:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var declaration_1 = require("./declarations/declaration");
exports.Declaration = declaration_1.Declaration;
var match_declaration_1 = require("./declarations/match_declaration");
var unmatch_declaration_1 = require("./declarations/unmatch_declaration");
var on_declaration_1 = require("./declarations/on_declaration");
var select_declaration_1 = require("./declarations/select_declaration");
var when_declaration_1 = require("./declarations/when_declaration");
;
var Scope = (function () {
    function Scope(element, executor) {
        this.executors = [];
        this.isActivated = false;
        this.declarations = [];
        this.element = element;
        if (executor) {
            this.addExecutor(executor);
        }
    }
    Scope.buildRootScope = function (element) {
        var scope = new Scope(element);
        scope.activate();
        return scope;
    };
    Scope.prototype.addExecutor = function (executor) {
        this.executors.push(executor);
        return executor.call(this, this, this.element);
    };
    Scope.prototype.getElement = function () {
        return this.element;
    };
    Scope.prototype.getDeclarations = function () {
        return this.declarations;
    };
    Scope.prototype.inspect = function (includeSource) {
        console.groupCollapsed(this.element);
        try {
            if (includeSource) {
                console.groupCollapsed('source');
                for (var _i = 0, _a = this.executors; _i < _a.length; _i++) {
                    var executor = _a[_i];
                    console.log(executor);
                }
                console.groupEnd();
            }
            for (var _b = 0, _c = this.declarations; _b < _c.length; _b++) {
                var declaration = _c[_b];
                declaration.inspect(includeSource);
            }
        }
        finally {
            console.groupEnd();
        }
    };
    Scope.prototype.activate = function () {
        if (!this.isActivated) {
            this.isActivated = true;
            for (var _i = 0, _a = this.declarations; _i < _a.length; _i++) {
                var declaration = _a[_i];
                declaration.activate();
            }
        }
    };
    Scope.prototype.deactivate = function () {
        if (this.isActivated) {
            this.isActivated = false;
            for (var _i = 0, _a = this.declarations; _i < _a.length; _i++) {
                var declaration = _a[_i];
                declaration.deactivate();
            }
        }
    };
    Scope.prototype.pristine = function () {
        this.deactivate();
        this.removeAllDeclarations();
    };
    Scope.prototype.match = function (executor) {
        this.addDeclaration(new match_declaration_1.MatchDeclaration(this.element, executor));
        return this;
    };
    Scope.prototype.unmatch = function (executor) {
        this.addDeclaration(new unmatch_declaration_1.UnmatchDeclaration(this.element, executor));
        return this;
    };
    Scope.prototype.select = function (matcher, executor) {
        this.addDeclaration(new select_declaration_1.SelectDeclaration(this.element, matcher, executor));
        return this;
    };
    Scope.prototype.when = function (matcher, executor) {
        this.addDeclaration(new when_declaration_1.WhenDeclaration(this.element, matcher, executor));
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
        this.addDeclaration(new on_declaration_1.OnDeclaration(this.element, eventMatcher, executor));
        return this;
    };
    Scope.prototype.onWithThreeArguments = function (eventMatcher, elementMatcher, executor) {
        this.select(elementMatcher, function (scope) {
            scope.on(eventMatcher, executor);
        });
        return this;
    };
    Scope.prototype.addDeclaration = function (declaration) {
        this.declarations.push(declaration);
        if (this.isActivated) {
            declaration.activate();
        }
    };
    Scope.prototype.removeDeclaration = function (declaration) {
        var index = this.declarations.indexOf(declaration);
        if (index >= 0) {
            this.declarations.splice(index, 1);
        }
        declaration.deactivate();
    };
    Scope.prototype.removeAllDeclarations = function () {
        var declaration;
        while (declaration = this.declarations[0]) {
            this.removeDeclaration(declaration);
        }
    };
    return Scope;
}());
exports.Scope = Scope;

},{"./declarations/declaration":3,"./declarations/match_declaration":4,"./declarations/on_declaration":5,"./declarations/select_declaration":7,"./declarations/unmatch_declaration":8,"./declarations/when_declaration":9}],12:[function(require,module,exports){
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

},{"./subscription":16,"mutation-observer":1}],13:[function(require,module,exports){
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
            this.stopListening();
            this.updateIsMatchingElement(false);
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

},{"../element_collector":10,"./batched_mutation_subscription":12}],14:[function(require,module,exports){
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

},{"./subscription":16}],15:[function(require,module,exports){
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
            this.stopListening();
            this.updateMatchingElements([]);
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

},{"../element_collector":10,"./batched_mutation_subscription":12}],16:[function(require,module,exports){
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

},{}],17:[function(require,module,exports){
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

},{"./subscription":16}]},{},[2])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvbXV0YXRpb24tb2JzZXJ2ZXIvaW5kZXguanMiLCJzcmMvZGVjbC50cyIsInNyYy9kZWNsYXJhdGlvbnMvZGVjbGFyYXRpb24udHMiLCJzcmMvZGVjbGFyYXRpb25zL21hdGNoX2RlY2xhcmF0aW9uLnRzIiwic3JjL2RlY2xhcmF0aW9ucy9vbl9kZWNsYXJhdGlvbi50cyIsInNyYy9kZWNsYXJhdGlvbnMvc2NvcGVfdHJhY2tpbmdfZGVjbGFyYXRpb24udHMiLCJzcmMvZGVjbGFyYXRpb25zL3NlbGVjdF9kZWNsYXJhdGlvbi50cyIsInNyYy9kZWNsYXJhdGlvbnMvdW5tYXRjaF9kZWNsYXJhdGlvbi50cyIsInNyYy9kZWNsYXJhdGlvbnMvd2hlbl9kZWNsYXJhdGlvbi50cyIsInNyYy9lbGVtZW50X2NvbGxlY3Rvci50cyIsInNyYy9zY29wZS50cyIsInNyYy9zdWJzY3JpcHRpb25zL2JhdGNoZWRfbXV0YXRpb25fc3Vic2NyaXB0aW9uLnRzIiwic3JjL3N1YnNjcmlwdGlvbnMvZWxlbWVudF9tYXRjaGVzX3N1YnNjcmlwdGlvbi50cyIsInNyYy9zdWJzY3JpcHRpb25zL2V2ZW50X3N1YnNjcmlwdGlvbi50cyIsInNyYy9zdWJzY3JpcHRpb25zL21hdGNoaW5nX2VsZW1lbnRzX3N1YnNjcmlwdGlvbi50cyIsInNyYy9zdWJzY3JpcHRpb25zL3N1YnNjcmlwdGlvbi50cyIsInNyYy9zdWJzY3JpcHRpb25zL3RyaXZpYWxfc3Vic2NyaXB0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtB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QztZQUNsQixJQUFJLENBQUMsV0FBVyxHQUFHLEtBQUssQ0FBQztZQUV6QixFQUFFLENBQUEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUM7Z0JBQzFCLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLGtDQUFrQyxFQUFFLEVBQUUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQzNFLENBQUM7UUFDTCxDQUFDO0lBQ0wsQ0FBQztJQUVPLGdFQUFrQyxHQUExQztRQUNJLE1BQU0sQ0FBQyxJQUFJLDZCQUE2QixDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQztJQUNuRixDQUFDO0lBQ0wsMEJBQUM7QUFBRCxDQWpDQSxBQWlDQyxDQWpDd0MsMkJBQVksR0FpQ3BEO0FBakNZLGtEQUFtQiIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJ2YXIgTXV0YXRpb25PYnNlcnZlciA9IHdpbmRvdy5NdXRhdGlvbk9ic2VydmVyXG4gIHx8IHdpbmRvdy5XZWJLaXRNdXRhdGlvbk9ic2VydmVyXG4gIHx8IHdpbmRvdy5Nb3pNdXRhdGlvbk9ic2VydmVyO1xuXG4vKlxuICogQ29weXJpZ2h0IDIwMTIgVGhlIFBvbHltZXIgQXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqIFVzZSBvZiB0aGlzIHNvdXJjZSBjb2RlIGlzIGdvdmVyZW5lZCBieSBhIEJTRC1zdHlsZVxuICogbGljZW5zZSB0aGF0IGNhbiBiZSBmb3VuZCBpbiB0aGUgTElDRU5TRSBmaWxlLlxuICovXG5cbnZhciBXZWFrTWFwID0gd2luZG93LldlYWtNYXA7XG5cbmlmICh0eXBlb2YgV2Vha01hcCA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgdmFyIGRlZmluZVByb3BlcnR5ID0gT2JqZWN0LmRlZmluZVByb3BlcnR5O1xuICB2YXIgY291bnRlciA9IERhdGUubm93KCkgJSAxZTk7XG5cbiAgV2Vha01hcCA9IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMubmFtZSA9ICdfX3N0JyArIChNYXRoLnJhbmRvbSgpICogMWU5ID4+PiAwKSArIChjb3VudGVyKysgKyAnX18nKTtcbiAgfTtcblxuICBXZWFrTWFwLnByb3RvdHlwZSA9IHtcbiAgICBzZXQ6IGZ1bmN0aW9uKGtleSwgdmFsdWUpIHtcbiAgICAgIHZhciBlbnRyeSA9IGtleVt0aGlzLm5hbWVdO1xuICAgICAgaWYgKGVudHJ5ICYmIGVudHJ5WzBdID09PSBrZXkpXG4gICAgICAgIGVudHJ5WzFdID0gdmFsdWU7XG4gICAgICBlbHNlXG4gICAgICAgIGRlZmluZVByb3BlcnR5KGtleSwgdGhpcy5uYW1lLCB7dmFsdWU6IFtrZXksIHZhbHVlXSwgd3JpdGFibGU6IHRydWV9KTtcbiAgICAgIHJldHVybiB0aGlzO1xuICAgIH0sXG4gICAgZ2V0OiBmdW5jdGlvbihrZXkpIHtcbiAgICAgIHZhciBlbnRyeTtcbiAgICAgIHJldHVybiAoZW50cnkgPSBrZXlbdGhpcy5uYW1lXSkgJiYgZW50cnlbMF0gPT09IGtleSA/XG4gICAgICAgICAgZW50cnlbMV0gOiB1bmRlZmluZWQ7XG4gICAgfSxcbiAgICAnZGVsZXRlJzogZnVuY3Rpb24oa2V5KSB7XG4gICAgICB2YXIgZW50cnkgPSBrZXlbdGhpcy5uYW1lXTtcbiAgICAgIGlmICghZW50cnkpIHJldHVybiBmYWxzZTtcbiAgICAgIHZhciBoYXNWYWx1ZSA9IGVudHJ5WzBdID09PSBrZXk7XG4gICAgICBlbnRyeVswXSA9IGVudHJ5WzFdID0gdW5kZWZpbmVkO1xuICAgICAgcmV0dXJuIGhhc1ZhbHVlO1xuICAgIH0sXG4gICAgaGFzOiBmdW5jdGlvbihrZXkpIHtcbiAgICAgIHZhciBlbnRyeSA9IGtleVt0aGlzLm5hbWVdO1xuICAgICAgaWYgKCFlbnRyeSkgcmV0dXJuIGZhbHNlO1xuICAgICAgcmV0dXJuIGVudHJ5WzBdID09PSBrZXk7XG4gICAgfVxuICB9O1xufVxuXG52YXIgcmVnaXN0cmF0aW9uc1RhYmxlID0gbmV3IFdlYWtNYXAoKTtcblxuLy8gV2UgdXNlIHNldEltbWVkaWF0ZSBvciBwb3N0TWVzc2FnZSBmb3Igb3VyIGZ1dHVyZSBjYWxsYmFjay5cbnZhciBzZXRJbW1lZGlhdGUgPSB3aW5kb3cubXNTZXRJbW1lZGlhdGU7XG5cbi8vIFVzZSBwb3N0IG1lc3NhZ2UgdG8gZW11bGF0ZSBzZXRJbW1lZGlhdGUuXG5pZiAoIXNldEltbWVkaWF0ZSkge1xuICB2YXIgc2V0SW1tZWRpYXRlUXVldWUgPSBbXTtcbiAgdmFyIHNlbnRpbmVsID0gU3RyaW5nKE1hdGgucmFuZG9tKCkpO1xuICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbWVzc2FnZScsIGZ1bmN0aW9uKGUpIHtcbiAgICBpZiAoZS5kYXRhID09PSBzZW50aW5lbCkge1xuICAgICAgdmFyIHF1ZXVlID0gc2V0SW1tZWRpYXRlUXVldWU7XG4gICAgICBzZXRJbW1lZGlhdGVRdWV1ZSA9IFtdO1xuICAgICAgcXVldWUuZm9yRWFjaChmdW5jdGlvbihmdW5jKSB7XG4gICAgICAgIGZ1bmMoKTtcbiAgICAgIH0pO1xuICAgIH1cbiAgfSk7XG4gIHNldEltbWVkaWF0ZSA9IGZ1bmN0aW9uKGZ1bmMpIHtcbiAgICBzZXRJbW1lZGlhdGVRdWV1ZS5wdXNoKGZ1bmMpO1xuICAgIHdpbmRvdy5wb3N0TWVzc2FnZShzZW50aW5lbCwgJyonKTtcbiAgfTtcbn1cblxuLy8gVGhpcyBpcyB1c2VkIHRvIGVuc3VyZSB0aGF0IHdlIG5ldmVyIHNjaGVkdWxlIDIgY2FsbGFzIHRvIHNldEltbWVkaWF0ZVxudmFyIGlzU2NoZWR1bGVkID0gZmFsc2U7XG5cbi8vIEtlZXAgdHJhY2sgb2Ygb2JzZXJ2ZXJzIHRoYXQgbmVlZHMgdG8gYmUgbm90aWZpZWQgbmV4dCB0aW1lLlxudmFyIHNjaGVkdWxlZE9ic2VydmVycyA9IFtdO1xuXG4vKipcbiAqIFNjaGVkdWxlcyB8ZGlzcGF0Y2hDYWxsYmFja3wgdG8gYmUgY2FsbGVkIGluIHRoZSBmdXR1cmUuXG4gKiBAcGFyYW0ge011dGF0aW9uT2JzZXJ2ZXJ9IG9ic2VydmVyXG4gKi9cbmZ1bmN0aW9uIHNjaGVkdWxlQ2FsbGJhY2sob2JzZXJ2ZXIpIHtcbiAgc2NoZWR1bGVkT2JzZXJ2ZXJzLnB1c2gob2JzZXJ2ZXIpO1xuICBpZiAoIWlzU2NoZWR1bGVkKSB7XG4gICAgaXNTY2hlZHVsZWQgPSB0cnVlO1xuICAgIHNldEltbWVkaWF0ZShkaXNwYXRjaENhbGxiYWNrcyk7XG4gIH1cbn1cblxuZnVuY3Rpb24gd3JhcElmTmVlZGVkKG5vZGUpIHtcbiAgcmV0dXJuIHdpbmRvdy5TaGFkb3dET01Qb2x5ZmlsbCAmJlxuICAgICAgd2luZG93LlNoYWRvd0RPTVBvbHlmaWxsLndyYXBJZk5lZWRlZChub2RlKSB8fFxuICAgICAgbm9kZTtcbn1cblxuZnVuY3Rpb24gZGlzcGF0Y2hDYWxsYmFja3MoKSB7XG4gIC8vIGh0dHA6Ly9kb20uc3BlYy53aGF0d2cub3JnLyNtdXRhdGlvbi1vYnNlcnZlcnNcblxuICBpc1NjaGVkdWxlZCA9IGZhbHNlOyAvLyBVc2VkIHRvIGFsbG93IGEgbmV3IHNldEltbWVkaWF0ZSBjYWxsIGFib3ZlLlxuXG4gIHZhciBvYnNlcnZlcnMgPSBzY2hlZHVsZWRPYnNlcnZlcnM7XG4gIHNjaGVkdWxlZE9ic2VydmVycyA9IFtdO1xuICAvLyBTb3J0IG9ic2VydmVycyBiYXNlZCBvbiB0aGVpciBjcmVhdGlvbiBVSUQgKGluY3JlbWVudGFsKS5cbiAgb2JzZXJ2ZXJzLnNvcnQoZnVuY3Rpb24obzEsIG8yKSB7XG4gICAgcmV0dXJuIG8xLnVpZF8gLSBvMi51aWRfO1xuICB9KTtcblxuICB2YXIgYW55Tm9uRW1wdHkgPSBmYWxzZTtcbiAgb2JzZXJ2ZXJzLmZvckVhY2goZnVuY3Rpb24ob2JzZXJ2ZXIpIHtcblxuICAgIC8vIDIuMSwgMi4yXG4gICAgdmFyIHF1ZXVlID0gb2JzZXJ2ZXIudGFrZVJlY29yZHMoKTtcbiAgICAvLyAyLjMuIFJlbW92ZSBhbGwgdHJhbnNpZW50IHJlZ2lzdGVyZWQgb2JzZXJ2ZXJzIHdob3NlIG9ic2VydmVyIGlzIG1vLlxuICAgIHJlbW92ZVRyYW5zaWVudE9ic2VydmVyc0ZvcihvYnNlcnZlcik7XG5cbiAgICAvLyAyLjRcbiAgICBpZiAocXVldWUubGVuZ3RoKSB7XG4gICAgICBvYnNlcnZlci5jYWxsYmFja18ocXVldWUsIG9ic2VydmVyKTtcbiAgICAgIGFueU5vbkVtcHR5ID0gdHJ1ZTtcbiAgICB9XG4gIH0pO1xuXG4gIC8vIDMuXG4gIGlmIChhbnlOb25FbXB0eSlcbiAgICBkaXNwYXRjaENhbGxiYWNrcygpO1xufVxuXG5mdW5jdGlvbiByZW1vdmVUcmFuc2llbnRPYnNlcnZlcnNGb3Iob2JzZXJ2ZXIpIHtcbiAgb2JzZXJ2ZXIubm9kZXNfLmZvckVhY2goZnVuY3Rpb24obm9kZSkge1xuICAgIHZhciByZWdpc3RyYXRpb25zID0gcmVnaXN0cmF0aW9uc1RhYmxlLmdldChub2RlKTtcbiAgICBpZiAoIXJlZ2lzdHJhdGlvbnMpXG4gICAgICByZXR1cm47XG4gICAgcmVnaXN0cmF0aW9ucy5mb3JFYWNoKGZ1bmN0aW9uKHJlZ2lzdHJhdGlvbikge1xuICAgICAgaWYgKHJlZ2lzdHJhdGlvbi5vYnNlcnZlciA9PT0gb2JzZXJ2ZXIpXG4gICAgICAgIHJlZ2lzdHJhdGlvbi5yZW1vdmVUcmFuc2llbnRPYnNlcnZlcnMoKTtcbiAgICB9KTtcbiAgfSk7XG59XG5cbi8qKlxuICogVGhpcyBmdW5jdGlvbiBpcyB1c2VkIGZvciB0aGUgXCJGb3IgZWFjaCByZWdpc3RlcmVkIG9ic2VydmVyIG9ic2VydmVyICh3aXRoXG4gKiBvYnNlcnZlcidzIG9wdGlvbnMgYXMgb3B0aW9ucykgaW4gdGFyZ2V0J3MgbGlzdCBvZiByZWdpc3RlcmVkIG9ic2VydmVycyxcbiAqIHJ1biB0aGVzZSBzdWJzdGVwczpcIiBhbmQgdGhlIFwiRm9yIGVhY2ggYW5jZXN0b3IgYW5jZXN0b3Igb2YgdGFyZ2V0LCBhbmQgZm9yXG4gKiBlYWNoIHJlZ2lzdGVyZWQgb2JzZXJ2ZXIgb2JzZXJ2ZXIgKHdpdGggb3B0aW9ucyBvcHRpb25zKSBpbiBhbmNlc3RvcidzIGxpc3RcbiAqIG9mIHJlZ2lzdGVyZWQgb2JzZXJ2ZXJzLCBydW4gdGhlc2Ugc3Vic3RlcHM6XCIgcGFydCBvZiB0aGUgYWxnb3JpdGhtcy4gVGhlXG4gKiB8b3B0aW9ucy5zdWJ0cmVlfCBpcyBjaGVja2VkIHRvIGVuc3VyZSB0aGF0IHRoZSBjYWxsYmFjayBpcyBjYWxsZWRcbiAqIGNvcnJlY3RseS5cbiAqXG4gKiBAcGFyYW0ge05vZGV9IHRhcmdldFxuICogQHBhcmFtIHtmdW5jdGlvbihNdXRhdGlvbk9ic2VydmVySW5pdCk6TXV0YXRpb25SZWNvcmR9IGNhbGxiYWNrXG4gKi9cbmZ1bmN0aW9uIGZvckVhY2hBbmNlc3RvckFuZE9ic2VydmVyRW5xdWV1ZVJlY29yZCh0YXJnZXQsIGNhbGxiYWNrKSB7XG4gIGZvciAodmFyIG5vZGUgPSB0YXJnZXQ7IG5vZGU7IG5vZGUgPSBub2RlLnBhcmVudE5vZGUpIHtcbiAgICB2YXIgcmVnaXN0cmF0aW9ucyA9IHJlZ2lzdHJhdGlvbnNUYWJsZS5nZXQobm9kZSk7XG5cbiAgICBpZiAocmVnaXN0cmF0aW9ucykge1xuICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCByZWdpc3RyYXRpb25zLmxlbmd0aDsgaisrKSB7XG4gICAgICAgIHZhciByZWdpc3RyYXRpb24gPSByZWdpc3RyYXRpb25zW2pdO1xuICAgICAgICB2YXIgb3B0aW9ucyA9IHJlZ2lzdHJhdGlvbi5vcHRpb25zO1xuXG4gICAgICAgIC8vIE9ubHkgdGFyZ2V0IGlnbm9yZXMgc3VidHJlZS5cbiAgICAgICAgaWYgKG5vZGUgIT09IHRhcmdldCAmJiAhb3B0aW9ucy5zdWJ0cmVlKVxuICAgICAgICAgIGNvbnRpbnVlO1xuXG4gICAgICAgIHZhciByZWNvcmQgPSBjYWxsYmFjayhvcHRpb25zKTtcbiAgICAgICAgaWYgKHJlY29yZClcbiAgICAgICAgICByZWdpc3RyYXRpb24uZW5xdWV1ZShyZWNvcmQpO1xuICAgICAgfVxuICAgIH1cbiAgfVxufVxuXG52YXIgdWlkQ291bnRlciA9IDA7XG5cbi8qKlxuICogVGhlIGNsYXNzIHRoYXQgbWFwcyB0byB0aGUgRE9NIE11dGF0aW9uT2JzZXJ2ZXIgaW50ZXJmYWNlLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2suXG4gKiBAY29uc3RydWN0b3JcbiAqL1xuZnVuY3Rpb24gSnNNdXRhdGlvbk9ic2VydmVyKGNhbGxiYWNrKSB7XG4gIHRoaXMuY2FsbGJhY2tfID0gY2FsbGJhY2s7XG4gIHRoaXMubm9kZXNfID0gW107XG4gIHRoaXMucmVjb3Jkc18gPSBbXTtcbiAgdGhpcy51aWRfID0gKyt1aWRDb3VudGVyO1xufVxuXG5Kc011dGF0aW9uT2JzZXJ2ZXIucHJvdG90eXBlID0ge1xuICBvYnNlcnZlOiBmdW5jdGlvbih0YXJnZXQsIG9wdGlvbnMpIHtcbiAgICB0YXJnZXQgPSB3cmFwSWZOZWVkZWQodGFyZ2V0KTtcblxuICAgIC8vIDEuMVxuICAgIGlmICghb3B0aW9ucy5jaGlsZExpc3QgJiYgIW9wdGlvbnMuYXR0cmlidXRlcyAmJiAhb3B0aW9ucy5jaGFyYWN0ZXJEYXRhIHx8XG5cbiAgICAgICAgLy8gMS4yXG4gICAgICAgIG9wdGlvbnMuYXR0cmlidXRlT2xkVmFsdWUgJiYgIW9wdGlvbnMuYXR0cmlidXRlcyB8fFxuXG4gICAgICAgIC8vIDEuM1xuICAgICAgICBvcHRpb25zLmF0dHJpYnV0ZUZpbHRlciAmJiBvcHRpb25zLmF0dHJpYnV0ZUZpbHRlci5sZW5ndGggJiZcbiAgICAgICAgICAgICFvcHRpb25zLmF0dHJpYnV0ZXMgfHxcblxuICAgICAgICAvLyAxLjRcbiAgICAgICAgb3B0aW9ucy5jaGFyYWN0ZXJEYXRhT2xkVmFsdWUgJiYgIW9wdGlvbnMuY2hhcmFjdGVyRGF0YSkge1xuXG4gICAgICB0aHJvdyBuZXcgU3ludGF4RXJyb3IoKTtcbiAgICB9XG5cbiAgICB2YXIgcmVnaXN0cmF0aW9ucyA9IHJlZ2lzdHJhdGlvbnNUYWJsZS5nZXQodGFyZ2V0KTtcbiAgICBpZiAoIXJlZ2lzdHJhdGlvbnMpXG4gICAgICByZWdpc3RyYXRpb25zVGFibGUuc2V0KHRhcmdldCwgcmVnaXN0cmF0aW9ucyA9IFtdKTtcblxuICAgIC8vIDJcbiAgICAvLyBJZiB0YXJnZXQncyBsaXN0IG9mIHJlZ2lzdGVyZWQgb2JzZXJ2ZXJzIGFscmVhZHkgaW5jbHVkZXMgYSByZWdpc3RlcmVkXG4gICAgLy8gb2JzZXJ2ZXIgYXNzb2NpYXRlZCB3aXRoIHRoZSBjb250ZXh0IG9iamVjdCwgcmVwbGFjZSB0aGF0IHJlZ2lzdGVyZWRcbiAgICAvLyBvYnNlcnZlcidzIG9wdGlvbnMgd2l0aCBvcHRpb25zLlxuICAgIHZhciByZWdpc3RyYXRpb247XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCByZWdpc3RyYXRpb25zLmxlbmd0aDsgaSsrKSB7XG4gICAgICBpZiAocmVnaXN0cmF0aW9uc1tpXS5vYnNlcnZlciA9PT0gdGhpcykge1xuICAgICAgICByZWdpc3RyYXRpb24gPSByZWdpc3RyYXRpb25zW2ldO1xuICAgICAgICByZWdpc3RyYXRpb24ucmVtb3ZlTGlzdGVuZXJzKCk7XG4gICAgICAgIHJlZ2lzdHJhdGlvbi5vcHRpb25zID0gb3B0aW9ucztcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gMy5cbiAgICAvLyBPdGhlcndpc2UsIGFkZCBhIG5ldyByZWdpc3RlcmVkIG9ic2VydmVyIHRvIHRhcmdldCdzIGxpc3Qgb2YgcmVnaXN0ZXJlZFxuICAgIC8vIG9ic2VydmVycyB3aXRoIHRoZSBjb250ZXh0IG9iamVjdCBhcyB0aGUgb2JzZXJ2ZXIgYW5kIG9wdGlvbnMgYXMgdGhlXG4gICAgLy8gb3B0aW9ucywgYW5kIGFkZCB0YXJnZXQgdG8gY29udGV4dCBvYmplY3QncyBsaXN0IG9mIG5vZGVzIG9uIHdoaWNoIGl0XG4gICAgLy8gaXMgcmVnaXN0ZXJlZC5cbiAgICBpZiAoIXJlZ2lzdHJhdGlvbikge1xuICAgICAgcmVnaXN0cmF0aW9uID0gbmV3IFJlZ2lzdHJhdGlvbih0aGlzLCB0YXJnZXQsIG9wdGlvbnMpO1xuICAgICAgcmVnaXN0cmF0aW9ucy5wdXNoKHJlZ2lzdHJhdGlvbik7XG4gICAgICB0aGlzLm5vZGVzXy5wdXNoKHRhcmdldCk7XG4gICAgfVxuXG4gICAgcmVnaXN0cmF0aW9uLmFkZExpc3RlbmVycygpO1xuICB9LFxuXG4gIGRpc2Nvbm5lY3Q6IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMubm9kZXNfLmZvckVhY2goZnVuY3Rpb24obm9kZSkge1xuICAgICAgdmFyIHJlZ2lzdHJhdGlvbnMgPSByZWdpc3RyYXRpb25zVGFibGUuZ2V0KG5vZGUpO1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCByZWdpc3RyYXRpb25zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhciByZWdpc3RyYXRpb24gPSByZWdpc3RyYXRpb25zW2ldO1xuICAgICAgICBpZiAocmVnaXN0cmF0aW9uLm9ic2VydmVyID09PSB0aGlzKSB7XG4gICAgICAgICAgcmVnaXN0cmF0aW9uLnJlbW92ZUxpc3RlbmVycygpO1xuICAgICAgICAgIHJlZ2lzdHJhdGlvbnMuc3BsaWNlKGksIDEpO1xuICAgICAgICAgIC8vIEVhY2ggbm9kZSBjYW4gb25seSBoYXZlIG9uZSByZWdpc3RlcmVkIG9ic2VydmVyIGFzc29jaWF0ZWQgd2l0aFxuICAgICAgICAgIC8vIHRoaXMgb2JzZXJ2ZXIuXG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LCB0aGlzKTtcbiAgICB0aGlzLnJlY29yZHNfID0gW107XG4gIH0sXG5cbiAgdGFrZVJlY29yZHM6IGZ1bmN0aW9uKCkge1xuICAgIHZhciBjb3B5T2ZSZWNvcmRzID0gdGhpcy5yZWNvcmRzXztcbiAgICB0aGlzLnJlY29yZHNfID0gW107XG4gICAgcmV0dXJuIGNvcHlPZlJlY29yZHM7XG4gIH1cbn07XG5cbi8qKlxuICogQHBhcmFtIHtzdHJpbmd9IHR5cGVcbiAqIEBwYXJhbSB7Tm9kZX0gdGFyZ2V0XG4gKiBAY29uc3RydWN0b3JcbiAqL1xuZnVuY3Rpb24gTXV0YXRpb25SZWNvcmQodHlwZSwgdGFyZ2V0KSB7XG4gIHRoaXMudHlwZSA9IHR5cGU7XG4gIHRoaXMudGFyZ2V0ID0gdGFyZ2V0O1xuICB0aGlzLmFkZGVkTm9kZXMgPSBbXTtcbiAgdGhpcy5yZW1vdmVkTm9kZXMgPSBbXTtcbiAgdGhpcy5wcmV2aW91c1NpYmxpbmcgPSBudWxsO1xuICB0aGlzLm5leHRTaWJsaW5nID0gbnVsbDtcbiAgdGhpcy5hdHRyaWJ1dGVOYW1lID0gbnVsbDtcbiAgdGhpcy5hdHRyaWJ1dGVOYW1lc3BhY2UgPSBudWxsO1xuICB0aGlzLm9sZFZhbHVlID0gbnVsbDtcbn1cblxuZnVuY3Rpb24gY29weU11dGF0aW9uUmVjb3JkKG9yaWdpbmFsKSB7XG4gIHZhciByZWNvcmQgPSBuZXcgTXV0YXRpb25SZWNvcmQob3JpZ2luYWwudHlwZSwgb3JpZ2luYWwudGFyZ2V0KTtcbiAgcmVjb3JkLmFkZGVkTm9kZXMgPSBvcmlnaW5hbC5hZGRlZE5vZGVzLnNsaWNlKCk7XG4gIHJlY29yZC5yZW1vdmVkTm9kZXMgPSBvcmlnaW5hbC5yZW1vdmVkTm9kZXMuc2xpY2UoKTtcbiAgcmVjb3JkLnByZXZpb3VzU2libGluZyA9IG9yaWdpbmFsLnByZXZpb3VzU2libGluZztcbiAgcmVjb3JkLm5leHRTaWJsaW5nID0gb3JpZ2luYWwubmV4dFNpYmxpbmc7XG4gIHJlY29yZC5hdHRyaWJ1dGVOYW1lID0gb3JpZ2luYWwuYXR0cmlidXRlTmFtZTtcbiAgcmVjb3JkLmF0dHJpYnV0ZU5hbWVzcGFjZSA9IG9yaWdpbmFsLmF0dHJpYnV0ZU5hbWVzcGFjZTtcbiAgcmVjb3JkLm9sZFZhbHVlID0gb3JpZ2luYWwub2xkVmFsdWU7XG4gIHJldHVybiByZWNvcmQ7XG59O1xuXG4vLyBXZSBrZWVwIHRyYWNrIG9mIHRoZSB0d28gKHBvc3NpYmx5IG9uZSkgcmVjb3JkcyB1c2VkIGluIGEgc2luZ2xlIG11dGF0aW9uLlxudmFyIGN1cnJlbnRSZWNvcmQsIHJlY29yZFdpdGhPbGRWYWx1ZTtcblxuLyoqXG4gKiBDcmVhdGVzIGEgcmVjb3JkIHdpdGhvdXQgfG9sZFZhbHVlfCBhbmQgY2FjaGVzIGl0IGFzIHxjdXJyZW50UmVjb3JkfCBmb3JcbiAqIGxhdGVyIHVzZS5cbiAqIEBwYXJhbSB7c3RyaW5nfSBvbGRWYWx1ZVxuICogQHJldHVybiB7TXV0YXRpb25SZWNvcmR9XG4gKi9cbmZ1bmN0aW9uIGdldFJlY29yZCh0eXBlLCB0YXJnZXQpIHtcbiAgcmV0dXJuIGN1cnJlbnRSZWNvcmQgPSBuZXcgTXV0YXRpb25SZWNvcmQodHlwZSwgdGFyZ2V0KTtcbn1cblxuLyoqXG4gKiBHZXRzIG9yIGNyZWF0ZXMgYSByZWNvcmQgd2l0aCB8b2xkVmFsdWV8IGJhc2VkIGluIHRoZSB8Y3VycmVudFJlY29yZHxcbiAqIEBwYXJhbSB7c3RyaW5nfSBvbGRWYWx1ZVxuICogQHJldHVybiB7TXV0YXRpb25SZWNvcmR9XG4gKi9cbmZ1bmN0aW9uIGdldFJlY29yZFdpdGhPbGRWYWx1ZShvbGRWYWx1ZSkge1xuICBpZiAocmVjb3JkV2l0aE9sZFZhbHVlKVxuICAgIHJldHVybiByZWNvcmRXaXRoT2xkVmFsdWU7XG4gIHJlY29yZFdpdGhPbGRWYWx1ZSA9IGNvcHlNdXRhdGlvblJlY29yZChjdXJyZW50UmVjb3JkKTtcbiAgcmVjb3JkV2l0aE9sZFZhbHVlLm9sZFZhbHVlID0gb2xkVmFsdWU7XG4gIHJldHVybiByZWNvcmRXaXRoT2xkVmFsdWU7XG59XG5cbmZ1bmN0aW9uIGNsZWFyUmVjb3JkcygpIHtcbiAgY3VycmVudFJlY29yZCA9IHJlY29yZFdpdGhPbGRWYWx1ZSA9IHVuZGVmaW5lZDtcbn1cblxuLyoqXG4gKiBAcGFyYW0ge011dGF0aW9uUmVjb3JkfSByZWNvcmRcbiAqIEByZXR1cm4ge2Jvb2xlYW59IFdoZXRoZXIgdGhlIHJlY29yZCByZXByZXNlbnRzIGEgcmVjb3JkIGZyb20gdGhlIGN1cnJlbnRcbiAqIG11dGF0aW9uIGV2ZW50LlxuICovXG5mdW5jdGlvbiByZWNvcmRSZXByZXNlbnRzQ3VycmVudE11dGF0aW9uKHJlY29yZCkge1xuICByZXR1cm4gcmVjb3JkID09PSByZWNvcmRXaXRoT2xkVmFsdWUgfHwgcmVjb3JkID09PSBjdXJyZW50UmVjb3JkO1xufVxuXG4vKipcbiAqIFNlbGVjdHMgd2hpY2ggcmVjb3JkLCBpZiBhbnksIHRvIHJlcGxhY2UgdGhlIGxhc3QgcmVjb3JkIGluIHRoZSBxdWV1ZS5cbiAqIFRoaXMgcmV0dXJucyB8bnVsbHwgaWYgbm8gcmVjb3JkIHNob3VsZCBiZSByZXBsYWNlZC5cbiAqXG4gKiBAcGFyYW0ge011dGF0aW9uUmVjb3JkfSBsYXN0UmVjb3JkXG4gKiBAcGFyYW0ge011dGF0aW9uUmVjb3JkfSBuZXdSZWNvcmRcbiAqIEBwYXJhbSB7TXV0YXRpb25SZWNvcmR9XG4gKi9cbmZ1bmN0aW9uIHNlbGVjdFJlY29yZChsYXN0UmVjb3JkLCBuZXdSZWNvcmQpIHtcbiAgaWYgKGxhc3RSZWNvcmQgPT09IG5ld1JlY29yZClcbiAgICByZXR1cm4gbGFzdFJlY29yZDtcblxuICAvLyBDaGVjayBpZiB0aGUgdGhlIHJlY29yZCB3ZSBhcmUgYWRkaW5nIHJlcHJlc2VudHMgdGhlIHNhbWUgcmVjb3JkLiBJZlxuICAvLyBzbywgd2Uga2VlcCB0aGUgb25lIHdpdGggdGhlIG9sZFZhbHVlIGluIGl0LlxuICBpZiAocmVjb3JkV2l0aE9sZFZhbHVlICYmIHJlY29yZFJlcHJlc2VudHNDdXJyZW50TXV0YXRpb24obGFzdFJlY29yZCkpXG4gICAgcmV0dXJuIHJlY29yZFdpdGhPbGRWYWx1ZTtcblxuICByZXR1cm4gbnVsbDtcbn1cblxuLyoqXG4gKiBDbGFzcyB1c2VkIHRvIHJlcHJlc2VudCBhIHJlZ2lzdGVyZWQgb2JzZXJ2ZXIuXG4gKiBAcGFyYW0ge011dGF0aW9uT2JzZXJ2ZXJ9IG9ic2VydmVyXG4gKiBAcGFyYW0ge05vZGV9IHRhcmdldFxuICogQHBhcmFtIHtNdXRhdGlvbk9ic2VydmVySW5pdH0gb3B0aW9uc1xuICogQGNvbnN0cnVjdG9yXG4gKi9cbmZ1bmN0aW9uIFJlZ2lzdHJhdGlvbihvYnNlcnZlciwgdGFyZ2V0LCBvcHRpb25zKSB7XG4gIHRoaXMub2JzZXJ2ZXIgPSBvYnNlcnZlcjtcbiAgdGhpcy50YXJnZXQgPSB0YXJnZXQ7XG4gIHRoaXMub3B0aW9ucyA9IG9wdGlvbnM7XG4gIHRoaXMudHJhbnNpZW50T2JzZXJ2ZWROb2RlcyA9IFtdO1xufVxuXG5SZWdpc3RyYXRpb24ucHJvdG90eXBlID0ge1xuICBlbnF1ZXVlOiBmdW5jdGlvbihyZWNvcmQpIHtcbiAgICB2YXIgcmVjb3JkcyA9IHRoaXMub2JzZXJ2ZXIucmVjb3Jkc187XG4gICAgdmFyIGxlbmd0aCA9IHJlY29yZHMubGVuZ3RoO1xuXG4gICAgLy8gVGhlcmUgYXJlIGNhc2VzIHdoZXJlIHdlIHJlcGxhY2UgdGhlIGxhc3QgcmVjb3JkIHdpdGggdGhlIG5ldyByZWNvcmQuXG4gICAgLy8gRm9yIGV4YW1wbGUgaWYgdGhlIHJlY29yZCByZXByZXNlbnRzIHRoZSBzYW1lIG11dGF0aW9uIHdlIG5lZWQgdG8gdXNlXG4gICAgLy8gdGhlIG9uZSB3aXRoIHRoZSBvbGRWYWx1ZS4gSWYgd2UgZ2V0IHNhbWUgcmVjb3JkICh0aGlzIGNhbiBoYXBwZW4gYXMgd2VcbiAgICAvLyB3YWxrIHVwIHRoZSB0cmVlKSB3ZSBpZ25vcmUgdGhlIG5ldyByZWNvcmQuXG4gICAgaWYgKHJlY29yZHMubGVuZ3RoID4gMCkge1xuICAgICAgdmFyIGxhc3RSZWNvcmQgPSByZWNvcmRzW2xlbmd0aCAtIDFdO1xuICAgICAgdmFyIHJlY29yZFRvUmVwbGFjZUxhc3QgPSBzZWxlY3RSZWNvcmQobGFzdFJlY29yZCwgcmVjb3JkKTtcbiAgICAgIGlmIChyZWNvcmRUb1JlcGxhY2VMYXN0KSB7XG4gICAgICAgIHJlY29yZHNbbGVuZ3RoIC0gMV0gPSByZWNvcmRUb1JlcGxhY2VMYXN0O1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHNjaGVkdWxlQ2FsbGJhY2sodGhpcy5vYnNlcnZlcik7XG4gICAgfVxuXG4gICAgcmVjb3Jkc1tsZW5ndGhdID0gcmVjb3JkO1xuICB9LFxuXG4gIGFkZExpc3RlbmVyczogZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5hZGRMaXN0ZW5lcnNfKHRoaXMudGFyZ2V0KTtcbiAgfSxcblxuICBhZGRMaXN0ZW5lcnNfOiBmdW5jdGlvbihub2RlKSB7XG4gICAgdmFyIG9wdGlvbnMgPSB0aGlzLm9wdGlvbnM7XG4gICAgaWYgKG9wdGlvbnMuYXR0cmlidXRlcylcbiAgICAgIG5vZGUuYWRkRXZlbnRMaXN0ZW5lcignRE9NQXR0ck1vZGlmaWVkJywgdGhpcywgdHJ1ZSk7XG5cbiAgICBpZiAob3B0aW9ucy5jaGFyYWN0ZXJEYXRhKVxuICAgICAgbm9kZS5hZGRFdmVudExpc3RlbmVyKCdET01DaGFyYWN0ZXJEYXRhTW9kaWZpZWQnLCB0aGlzLCB0cnVlKTtcblxuICAgIGlmIChvcHRpb25zLmNoaWxkTGlzdClcbiAgICAgIG5vZGUuYWRkRXZlbnRMaXN0ZW5lcignRE9NTm9kZUluc2VydGVkJywgdGhpcywgdHJ1ZSk7XG5cbiAgICBpZiAob3B0aW9ucy5jaGlsZExpc3QgfHwgb3B0aW9ucy5zdWJ0cmVlKVxuICAgICAgbm9kZS5hZGRFdmVudExpc3RlbmVyKCdET01Ob2RlUmVtb3ZlZCcsIHRoaXMsIHRydWUpO1xuICB9LFxuXG4gIHJlbW92ZUxpc3RlbmVyczogZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5yZW1vdmVMaXN0ZW5lcnNfKHRoaXMudGFyZ2V0KTtcbiAgfSxcblxuICByZW1vdmVMaXN0ZW5lcnNfOiBmdW5jdGlvbihub2RlKSB7XG4gICAgdmFyIG9wdGlvbnMgPSB0aGlzLm9wdGlvbnM7XG4gICAgaWYgKG9wdGlvbnMuYXR0cmlidXRlcylcbiAgICAgIG5vZGUucmVtb3ZlRXZlbnRMaXN0ZW5lcignRE9NQXR0ck1vZGlmaWVkJywgdGhpcywgdHJ1ZSk7XG5cbiAgICBpZiAob3B0aW9ucy5jaGFyYWN0ZXJEYXRhKVxuICAgICAgbm9kZS5yZW1vdmVFdmVudExpc3RlbmVyKCdET01DaGFyYWN0ZXJEYXRhTW9kaWZpZWQnLCB0aGlzLCB0cnVlKTtcblxuICAgIGlmIChvcHRpb25zLmNoaWxkTGlzdClcbiAgICAgIG5vZGUucmVtb3ZlRXZlbnRMaXN0ZW5lcignRE9NTm9kZUluc2VydGVkJywgdGhpcywgdHJ1ZSk7XG5cbiAgICBpZiAob3B0aW9ucy5jaGlsZExpc3QgfHwgb3B0aW9ucy5zdWJ0cmVlKVxuICAgICAgbm9kZS5yZW1vdmVFdmVudExpc3RlbmVyKCdET01Ob2RlUmVtb3ZlZCcsIHRoaXMsIHRydWUpO1xuICB9LFxuXG4gIC8qKlxuICAgKiBBZGRzIGEgdHJhbnNpZW50IG9ic2VydmVyIG9uIG5vZGUuIFRoZSB0cmFuc2llbnQgb2JzZXJ2ZXIgZ2V0cyByZW1vdmVkXG4gICAqIG5leHQgdGltZSB3ZSBkZWxpdmVyIHRoZSBjaGFuZ2UgcmVjb3Jkcy5cbiAgICogQHBhcmFtIHtOb2RlfSBub2RlXG4gICAqL1xuICBhZGRUcmFuc2llbnRPYnNlcnZlcjogZnVuY3Rpb24obm9kZSkge1xuICAgIC8vIERvbid0IGFkZCB0cmFuc2llbnQgb2JzZXJ2ZXJzIG9uIHRoZSB0YXJnZXQgaXRzZWxmLiBXZSBhbHJlYWR5IGhhdmUgYWxsXG4gICAgLy8gdGhlIHJlcXVpcmVkIGxpc3RlbmVycyBzZXQgdXAgb24gdGhlIHRhcmdldC5cbiAgICBpZiAobm9kZSA9PT0gdGhpcy50YXJnZXQpXG4gICAgICByZXR1cm47XG5cbiAgICB0aGlzLmFkZExpc3RlbmVyc18obm9kZSk7XG4gICAgdGhpcy50cmFuc2llbnRPYnNlcnZlZE5vZGVzLnB1c2gobm9kZSk7XG4gICAgdmFyIHJlZ2lzdHJhdGlvbnMgPSByZWdpc3RyYXRpb25zVGFibGUuZ2V0KG5vZGUpO1xuICAgIGlmICghcmVnaXN0cmF0aW9ucylcbiAgICAgIHJlZ2lzdHJhdGlvbnNUYWJsZS5zZXQobm9kZSwgcmVnaXN0cmF0aW9ucyA9IFtdKTtcblxuICAgIC8vIFdlIGtub3cgdGhhdCByZWdpc3RyYXRpb25zIGRvZXMgbm90IGNvbnRhaW4gdGhpcyBiZWNhdXNlIHdlIGFscmVhZHlcbiAgICAvLyBjaGVja2VkIGlmIG5vZGUgPT09IHRoaXMudGFyZ2V0LlxuICAgIHJlZ2lzdHJhdGlvbnMucHVzaCh0aGlzKTtcbiAgfSxcblxuICByZW1vdmVUcmFuc2llbnRPYnNlcnZlcnM6IGZ1bmN0aW9uKCkge1xuICAgIHZhciB0cmFuc2llbnRPYnNlcnZlZE5vZGVzID0gdGhpcy50cmFuc2llbnRPYnNlcnZlZE5vZGVzO1xuICAgIHRoaXMudHJhbnNpZW50T2JzZXJ2ZWROb2RlcyA9IFtdO1xuXG4gICAgdHJhbnNpZW50T2JzZXJ2ZWROb2Rlcy5mb3JFYWNoKGZ1bmN0aW9uKG5vZGUpIHtcbiAgICAgIC8vIFRyYW5zaWVudCBvYnNlcnZlcnMgYXJlIG5ldmVyIGFkZGVkIHRvIHRoZSB0YXJnZXQuXG4gICAgICB0aGlzLnJlbW92ZUxpc3RlbmVyc18obm9kZSk7XG5cbiAgICAgIHZhciByZWdpc3RyYXRpb25zID0gcmVnaXN0cmF0aW9uc1RhYmxlLmdldChub2RlKTtcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcmVnaXN0cmF0aW9ucy5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAocmVnaXN0cmF0aW9uc1tpXSA9PT0gdGhpcykge1xuICAgICAgICAgIHJlZ2lzdHJhdGlvbnMuc3BsaWNlKGksIDEpO1xuICAgICAgICAgIC8vIEVhY2ggbm9kZSBjYW4gb25seSBoYXZlIG9uZSByZWdpc3RlcmVkIG9ic2VydmVyIGFzc29jaWF0ZWQgd2l0aFxuICAgICAgICAgIC8vIHRoaXMgb2JzZXJ2ZXIuXG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LCB0aGlzKTtcbiAgfSxcblxuICBoYW5kbGVFdmVudDogZnVuY3Rpb24oZSkge1xuICAgIC8vIFN0b3AgcHJvcGFnYXRpb24gc2luY2Ugd2UgYXJlIG1hbmFnaW5nIHRoZSBwcm9wYWdhdGlvbiBtYW51YWxseS5cbiAgICAvLyBUaGlzIG1lYW5zIHRoYXQgb3RoZXIgbXV0YXRpb24gZXZlbnRzIG9uIHRoZSBwYWdlIHdpbGwgbm90IHdvcmtcbiAgICAvLyBjb3JyZWN0bHkgYnV0IHRoYXQgaXMgYnkgZGVzaWduLlxuICAgIGUuc3RvcEltbWVkaWF0ZVByb3BhZ2F0aW9uKCk7XG5cbiAgICBzd2l0Y2ggKGUudHlwZSkge1xuICAgICAgY2FzZSAnRE9NQXR0ck1vZGlmaWVkJzpcbiAgICAgICAgLy8gaHR0cDovL2RvbS5zcGVjLndoYXR3Zy5vcmcvI2NvbmNlcHQtbW8tcXVldWUtYXR0cmlidXRlc1xuXG4gICAgICAgIHZhciBuYW1lID0gZS5hdHRyTmFtZTtcbiAgICAgICAgdmFyIG5hbWVzcGFjZSA9IGUucmVsYXRlZE5vZGUubmFtZXNwYWNlVVJJO1xuICAgICAgICB2YXIgdGFyZ2V0ID0gZS50YXJnZXQ7XG5cbiAgICAgICAgLy8gMS5cbiAgICAgICAgdmFyIHJlY29yZCA9IG5ldyBnZXRSZWNvcmQoJ2F0dHJpYnV0ZXMnLCB0YXJnZXQpO1xuICAgICAgICByZWNvcmQuYXR0cmlidXRlTmFtZSA9IG5hbWU7XG4gICAgICAgIHJlY29yZC5hdHRyaWJ1dGVOYW1lc3BhY2UgPSBuYW1lc3BhY2U7XG5cbiAgICAgICAgLy8gMi5cbiAgICAgICAgdmFyIG9sZFZhbHVlID1cbiAgICAgICAgICAgIGUuYXR0ckNoYW5nZSA9PT0gTXV0YXRpb25FdmVudC5BRERJVElPTiA/IG51bGwgOiBlLnByZXZWYWx1ZTtcblxuICAgICAgICBmb3JFYWNoQW5jZXN0b3JBbmRPYnNlcnZlckVucXVldWVSZWNvcmQodGFyZ2V0LCBmdW5jdGlvbihvcHRpb25zKSB7XG4gICAgICAgICAgLy8gMy4xLCA0LjJcbiAgICAgICAgICBpZiAoIW9wdGlvbnMuYXR0cmlidXRlcylcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICAgIC8vIDMuMiwgNC4zXG4gICAgICAgICAgaWYgKG9wdGlvbnMuYXR0cmlidXRlRmlsdGVyICYmIG9wdGlvbnMuYXR0cmlidXRlRmlsdGVyLmxlbmd0aCAmJlxuICAgICAgICAgICAgICBvcHRpb25zLmF0dHJpYnV0ZUZpbHRlci5pbmRleE9mKG5hbWUpID09PSAtMSAmJlxuICAgICAgICAgICAgICBvcHRpb25zLmF0dHJpYnV0ZUZpbHRlci5pbmRleE9mKG5hbWVzcGFjZSkgPT09IC0xKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIDMuMywgNC40XG4gICAgICAgICAgaWYgKG9wdGlvbnMuYXR0cmlidXRlT2xkVmFsdWUpXG4gICAgICAgICAgICByZXR1cm4gZ2V0UmVjb3JkV2l0aE9sZFZhbHVlKG9sZFZhbHVlKTtcblxuICAgICAgICAgIC8vIDMuNCwgNC41XG4gICAgICAgICAgcmV0dXJuIHJlY29yZDtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgYnJlYWs7XG5cbiAgICAgIGNhc2UgJ0RPTUNoYXJhY3RlckRhdGFNb2RpZmllZCc6XG4gICAgICAgIC8vIGh0dHA6Ly9kb20uc3BlYy53aGF0d2cub3JnLyNjb25jZXB0LW1vLXF1ZXVlLWNoYXJhY3RlcmRhdGFcbiAgICAgICAgdmFyIHRhcmdldCA9IGUudGFyZ2V0O1xuXG4gICAgICAgIC8vIDEuXG4gICAgICAgIHZhciByZWNvcmQgPSBnZXRSZWNvcmQoJ2NoYXJhY3RlckRhdGEnLCB0YXJnZXQpO1xuXG4gICAgICAgIC8vIDIuXG4gICAgICAgIHZhciBvbGRWYWx1ZSA9IGUucHJldlZhbHVlO1xuXG5cbiAgICAgICAgZm9yRWFjaEFuY2VzdG9yQW5kT2JzZXJ2ZXJFbnF1ZXVlUmVjb3JkKHRhcmdldCwgZnVuY3Rpb24ob3B0aW9ucykge1xuICAgICAgICAgIC8vIDMuMSwgNC4yXG4gICAgICAgICAgaWYgKCFvcHRpb25zLmNoYXJhY3RlckRhdGEpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgICAvLyAzLjIsIDQuM1xuICAgICAgICAgIGlmIChvcHRpb25zLmNoYXJhY3RlckRhdGFPbGRWYWx1ZSlcbiAgICAgICAgICAgIHJldHVybiBnZXRSZWNvcmRXaXRoT2xkVmFsdWUob2xkVmFsdWUpO1xuXG4gICAgICAgICAgLy8gMy4zLCA0LjRcbiAgICAgICAgICByZXR1cm4gcmVjb3JkO1xuICAgICAgICB9KTtcblxuICAgICAgICBicmVhaztcblxuICAgICAgY2FzZSAnRE9NTm9kZVJlbW92ZWQnOlxuICAgICAgICB0aGlzLmFkZFRyYW5zaWVudE9ic2VydmVyKGUudGFyZ2V0KTtcbiAgICAgICAgLy8gRmFsbCB0aHJvdWdoLlxuICAgICAgY2FzZSAnRE9NTm9kZUluc2VydGVkJzpcbiAgICAgICAgLy8gaHR0cDovL2RvbS5zcGVjLndoYXR3Zy5vcmcvI2NvbmNlcHQtbW8tcXVldWUtY2hpbGRsaXN0XG4gICAgICAgIHZhciB0YXJnZXQgPSBlLnJlbGF0ZWROb2RlO1xuICAgICAgICB2YXIgY2hhbmdlZE5vZGUgPSBlLnRhcmdldDtcbiAgICAgICAgdmFyIGFkZGVkTm9kZXMsIHJlbW92ZWROb2RlcztcbiAgICAgICAgaWYgKGUudHlwZSA9PT0gJ0RPTU5vZGVJbnNlcnRlZCcpIHtcbiAgICAgICAgICBhZGRlZE5vZGVzID0gW2NoYW5nZWROb2RlXTtcbiAgICAgICAgICByZW1vdmVkTm9kZXMgPSBbXTtcbiAgICAgICAgfSBlbHNlIHtcblxuICAgICAgICAgIGFkZGVkTm9kZXMgPSBbXTtcbiAgICAgICAgICByZW1vdmVkTm9kZXMgPSBbY2hhbmdlZE5vZGVdO1xuICAgICAgICB9XG4gICAgICAgIHZhciBwcmV2aW91c1NpYmxpbmcgPSBjaGFuZ2VkTm9kZS5wcmV2aW91c1NpYmxpbmc7XG4gICAgICAgIHZhciBuZXh0U2libGluZyA9IGNoYW5nZWROb2RlLm5leHRTaWJsaW5nO1xuXG4gICAgICAgIC8vIDEuXG4gICAgICAgIHZhciByZWNvcmQgPSBnZXRSZWNvcmQoJ2NoaWxkTGlzdCcsIHRhcmdldCk7XG4gICAgICAgIHJlY29yZC5hZGRlZE5vZGVzID0gYWRkZWROb2RlcztcbiAgICAgICAgcmVjb3JkLnJlbW92ZWROb2RlcyA9IHJlbW92ZWROb2RlcztcbiAgICAgICAgcmVjb3JkLnByZXZpb3VzU2libGluZyA9IHByZXZpb3VzU2libGluZztcbiAgICAgICAgcmVjb3JkLm5leHRTaWJsaW5nID0gbmV4dFNpYmxpbmc7XG5cbiAgICAgICAgZm9yRWFjaEFuY2VzdG9yQW5kT2JzZXJ2ZXJFbnF1ZXVlUmVjb3JkKHRhcmdldCwgZnVuY3Rpb24ob3B0aW9ucykge1xuICAgICAgICAgIC8vIDIuMSwgMy4yXG4gICAgICAgICAgaWYgKCFvcHRpb25zLmNoaWxkTGlzdClcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICAgIC8vIDIuMiwgMy4zXG4gICAgICAgICAgcmV0dXJuIHJlY29yZDtcbiAgICAgICAgfSk7XG5cbiAgICB9XG5cbiAgICBjbGVhclJlY29yZHMoKTtcbiAgfVxufTtcblxuaWYgKCFNdXRhdGlvbk9ic2VydmVyKSB7XG4gIE11dGF0aW9uT2JzZXJ2ZXIgPSBKc011dGF0aW9uT2JzZXJ2ZXI7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gTXV0YXRpb25PYnNlcnZlcjtcbiIsImltcG9ydCB7IFNjb3BlLCBFbGVtZW50TWF0Y2hlciwgRXZlbnRNYXRjaGVyLCBTY29wZUV4ZWN1dG9yLCBTdWJzY3JpcHRpb25FeGVjdXRvciB9IGZyb20gJy4vc2NvcGUnO1xuXG5leHBvcnQgZGVmYXVsdCBEZWNsO1xuXG5leHBvcnQgeyBTY29wZSwgRWxlbWVudE1hdGNoZXIsIEV2ZW50TWF0Y2hlciwgU2NvcGVFeGVjdXRvciwgU3Vic2NyaXB0aW9uRXhlY3V0b3IgfTtcblxuZXhwb3J0IGNsYXNzIERlY2wge1xuICAgIHByaXZhdGUgc3RhdGljIGRlZmF1bHRJbnN0YW5jZTogRGVjbCB8IG51bGwgPSBudWxsO1xuXG4gICAgc3RhdGljIHNlbGVjdChtYXRjaGVyOiBFbGVtZW50TWF0Y2hlciwgZXhlY3V0b3I6IFNjb3BlRXhlY3V0b3IpOiBTY29wZSB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldERlZmF1bHRJbnN0YW5jZSgpLnNlbGVjdChtYXRjaGVyLCBleGVjdXRvcik7XG4gICAgfVxuXG4gICAgc3RhdGljIG9uKG1hdGNoZXI6IEV2ZW50TWF0Y2hlciwgZXhlY3V0b3I6IFN1YnNjcmlwdGlvbkV4ZWN1dG9yKTogU2NvcGUge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXREZWZhdWx0SW5zdGFuY2UoKS5vbihtYXRjaGVyLCBleGVjdXRvcik7XG4gICAgfVxuXG4gICAgc3RhdGljIGdldFJvb3RTY29wZSgpOiBTY29wZSB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldERlZmF1bHRJbnN0YW5jZSgpLmdldFJvb3RTY29wZSgpO1xuICAgIH1cblxuICAgIHN0YXRpYyBpbnNwZWN0KGluY2x1ZGVTb3VyY2U/OiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIHRoaXMuZ2V0RGVmYXVsdEluc3RhbmNlKCkuaW5zcGVjdChpbmNsdWRlU291cmNlKTtcbiAgICB9XG5cbiAgICBzdGF0aWMgZ2V0RGVmYXVsdEluc3RhbmNlKCkgOiBEZWNsIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZGVmYXVsdEluc3RhbmNlIHx8ICh0aGlzLmRlZmF1bHRJbnN0YW5jZSA9IG5ldyBEZWNsKGRvY3VtZW50LmRvY3VtZW50RWxlbWVudCkpO1xuICAgIH1cblxuICAgIHN0YXRpYyBzZXREZWZhdWx0SW5zdGFuY2UoZGVjbDogRGVjbCkgOiBEZWNsIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZGVmYXVsdEluc3RhbmNlID0gZGVjbDtcbiAgICB9XG5cbiAgICBzdGF0aWMgcHJpc3RpbmUoKTogdm9pZCB7XG4gICAgICAgIGlmKHRoaXMuZGVmYXVsdEluc3RhbmNlKSB7XG4gICAgICAgICAgICB0aGlzLmRlZmF1bHRJbnN0YW5jZS5wcmlzdGluZSgpO1xuICAgICAgICAgICAgdGhpcy5kZWZhdWx0SW5zdGFuY2UgPSBudWxsO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBzY29wZTogU2NvcGU7XG5cbiAgICBjb25zdHJ1Y3Rvcihyb290OiBFbGVtZW50KSB7XG4gICAgICAgIHRoaXMuc2NvcGUgPSBTY29wZS5idWlsZFJvb3RTY29wZShyb290KTtcbiAgICB9XG5cbiAgICBzZWxlY3QobWF0Y2hlcjogRWxlbWVudE1hdGNoZXIsIGV4ZWN1dG9yOiBTY29wZUV4ZWN1dG9yKTogU2NvcGUge1xuICAgICAgICByZXR1cm4gdGhpcy5zY29wZS5zZWxlY3QobWF0Y2hlciwgZXhlY3V0b3IpO1xuICAgIH1cblxuICAgIG9uKG1hdGNoZXI6IEV2ZW50TWF0Y2hlciwgZXhlY3V0b3I6IFN1YnNjcmlwdGlvbkV4ZWN1dG9yKTogU2NvcGUge1xuICAgICAgICByZXR1cm4gdGhpcy5zY29wZS5vbihtYXRjaGVyLCBleGVjdXRvcik7XG4gICAgfVxuXG4gICAgZ2V0Um9vdFNjb3BlKCk6IFNjb3BlIHtcbiAgICAgICByZXR1cm4gdGhpcy5zY29wZTsgXG4gICAgfVxuXG4gICAgaW5zcGVjdChpbmNsdWRlU291cmNlPzogYm9vbGVhbik6IHZvaWQge1xuICAgICAgICBjb25zb2xlLmdyb3VwQ29sbGFwc2VkKCc8PHJvb3Q+PicpO1xuICAgICAgICBcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHRoaXMuc2NvcGUuaW5zcGVjdChpbmNsdWRlU291cmNlKTsgICAgICAgIFxuICAgICAgICB9ZmluYWxseXtcbiAgICAgICAgICAgIGNvbnNvbGUuZ3JvdXBFbmQoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXN0aW5lKCk6IHZvaWQge1xuICAgICAgICB0aGlzLnNjb3BlLnByaXN0aW5lKCk7XG4gICAgfVxufVxuXG4vLyBFeHBvcnQgdG8gYSBnbG9iYWwgZm9yIHRoZSBicm93c2VyICh0aGVyZSAqaGFzKiB0byBiZSBhIGJldHRlciB3YXkgdG8gZG8gdGhpcyEpXG5pZih0eXBlb2Yod2luZG93KSAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAoPGFueT53aW5kb3cpLkRlY2wgPSBEZWNsO1xufVxuIiwiaW1wb3J0IHsgU3Vic2NyaXB0aW9uLCBTdWJzY3JpcHRpb25FeGVjdXRvciB9IGZyb20gJy4uL3N1YnNjcmlwdGlvbnMvc3Vic2NyaXB0aW9uJztcblxuZXhwb3J0IHsgU3Vic2NyaXB0aW9uRXhlY3V0b3IgfTtcblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIERlY2xhcmF0aW9uIHtcbiAgICBwcm90ZWN0ZWQgaXNBY3RpdmF0ZWQ6IGJvb2xlYW4gPSBmYWxzZTtcbiAgICBwcm90ZWN0ZWQgcmVhZG9ubHkgZWxlbWVudDogRWxlbWVudDtcbiAgICBwcm90ZWN0ZWQgcmVhZG9ubHkgc3Vic2NyaXB0aW9uOiBTdWJzY3JpcHRpb247XG5cbiAgICBjb25zdHJ1Y3RvcihlbGVtZW50OiBFbGVtZW50KSB7XG4gICAgICAgIHRoaXMuZWxlbWVudCA9IGVsZW1lbnQ7XG4gICAgfVxuXG4gICAgYWN0aXZhdGUoKTogdm9pZCB7XG4gICAgICAgIGlmKCF0aGlzLmlzQWN0aXZhdGVkKSB7XG4gICAgICAgICAgICB0aGlzLmlzQWN0aXZhdGVkID0gdHJ1ZTtcblxuICAgICAgICAgICAgdGhpcy5zdWJzY3JpcHRpb24uY29ubmVjdCgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZGVhY3RpdmF0ZSgpOiB2b2lkIHtcbiAgICAgICAgaWYodGhpcy5pc0FjdGl2YXRlZCkge1xuICAgICAgICAgICAgdGhpcy5pc0FjdGl2YXRlZCA9IGZhbHNlO1xuXG4gICAgICAgICAgICB0aGlzLnN1YnNjcmlwdGlvbi5kaXNjb25uZWN0KCk7XG4gICAgICAgIH0gICAgICAgIFxuICAgIH1cblxuICAgIGFic3RyYWN0IGluc3BlY3QoaW5jbHVkZVNvdXJjZT86IGJvb2xlYW4pOiB2b2lkO1xufSIsImltcG9ydCB7IERlY2xhcmF0aW9uLCBTdWJzY3JpcHRpb25FeGVjdXRvciB9IGZyb20gJy4vZGVjbGFyYXRpb24nO1xuaW1wb3J0IHsgVHJpdmlhbFN1YnNjcmlwdGlvbiB9IGZyb20gJy4uL3N1YnNjcmlwdGlvbnMvdHJpdmlhbF9zdWJzY3JpcHRpb24nO1xuXG5leHBvcnQgeyBTdWJzY3JpcHRpb25FeGVjdXRvciB9O1xuXG5leHBvcnQgY2xhc3MgTWF0Y2hEZWNsYXJhdGlvbiBleHRlbmRzIERlY2xhcmF0aW9uIHtcbiAgICBwcm90ZWN0ZWQgcmVhZG9ubHkgc3Vic2NyaXB0aW9uOiBUcml2aWFsU3Vic2NyaXB0aW9uO1xuICAgIHByb3RlY3RlZCByZWFkb25seSBleGVjdXRvcjogU3Vic2NyaXB0aW9uRXhlY3V0b3I7XG5cbiAgICBjb25zdHJ1Y3RvcihlbGVtZW50OiBFbGVtZW50LCBleGVjdXRvcjogU3Vic2NyaXB0aW9uRXhlY3V0b3IpIHtcbiAgICAgICAgc3VwZXIoZWxlbWVudCk7XG5cbiAgICAgICAgdGhpcy5leGVjdXRvciA9IGV4ZWN1dG9yO1xuXG4gICAgICAgIHRoaXMuc3Vic2NyaXB0aW9uID0gbmV3IFRyaXZpYWxTdWJzY3JpcHRpb24odGhpcy5lbGVtZW50LCB7IGNvbm5lY3RlZDogdHJ1ZSB9LCB0aGlzLmV4ZWN1dG9yKTtcbiAgICB9XG5cbiAgICBpbnNwZWN0KCk6IHZvaWQge1xuICAgICAgICBjb25zb2xlLmdyb3VwQ29sbGFwc2VkKCdtYXRjaGVzJyk7XG4gICAgICAgIGNvbnNvbGUubG9nKHRoaXMuZXhlY3V0b3IpO1xuICAgICAgICBjb25zb2xlLmdyb3VwRW5kKCk7XG4gICAgfVxufSIsImltcG9ydCB7IERlY2xhcmF0aW9uLCBTdWJzY3JpcHRpb25FeGVjdXRvciB9IGZyb20gJy4vZGVjbGFyYXRpb24nO1xuaW1wb3J0IHsgRXZlbnRTdWJzY3JpcHRpb24sIEV2ZW50TWF0Y2hlciB9IGZyb20gJy4uL3N1YnNjcmlwdGlvbnMvZXZlbnRfc3Vic2NyaXB0aW9uJztcblxuZXhwb3J0IHsgRXZlbnRNYXRjaGVyLCBTdWJzY3JpcHRpb25FeGVjdXRvciB9O1xuXG5leHBvcnQgY2xhc3MgT25EZWNsYXJhdGlvbiBleHRlbmRzIERlY2xhcmF0aW9uIHtcbiAgICBwcm90ZWN0ZWQgc3Vic2NyaXB0aW9uOiBFdmVudFN1YnNjcmlwdGlvbjtcbiAgICBwcm90ZWN0ZWQgbWF0Y2hlcjogRXZlbnRNYXRjaGVyO1xuICAgIHByb3RlY3RlZCBleGVjdXRvcjogU3Vic2NyaXB0aW9uRXhlY3V0b3I7XG5cbiAgICBjb25zdHJ1Y3RvcihlbGVtZW50OiBFbGVtZW50LCBtYXRjaGVyOiBFdmVudE1hdGNoZXIsIGV4ZWN1dG9yOiBTdWJzY3JpcHRpb25FeGVjdXRvcikge1xuICAgICAgICBzdXBlcihlbGVtZW50KTtcblxuICAgICAgICB0aGlzLm1hdGNoZXIgPSBtYXRjaGVyO1xuICAgICAgICB0aGlzLmV4ZWN1dG9yID0gZXhlY3V0b3I7XG5cbiAgICAgICAgdGhpcy5zdWJzY3JpcHRpb24gPSBuZXcgRXZlbnRTdWJzY3JpcHRpb24odGhpcy5lbGVtZW50LCB0aGlzLm1hdGNoZXIsIHRoaXMuZXhlY3V0b3IpOyAgICBcbiAgICB9XG5cbiAgICBpbnNwZWN0KCk6IHZvaWQge1xuICAgICAgICAoPGFueT5jb25zb2xlLmdyb3VwQ29sbGFwc2VkKSgnb24nLCB0aGlzLm1hdGNoZXIpO1xuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyh0aGlzLmV4ZWN1dG9yKTtcbiAgICAgICAgfWZpbmFsbHl7XG4gICAgICAgICAgICBjb25zb2xlLmdyb3VwRW5kKCk7XG4gICAgICAgIH1cbiAgICB9XG59IiwiaW1wb3J0IHsgRGVjbGFyYXRpb24gfSBmcm9tICcuL2RlY2xhcmF0aW9uJztcbmltcG9ydCB7IEVsZW1lbnRNYXRjaGVyIH0gZnJvbSAnLi4vZWxlbWVudF9jb2xsZWN0b3InO1xuaW1wb3J0IHsgU2NvcGUsIFNjb3BlRXhlY3V0b3IgfSBmcm9tICcuLi9zY29wZSc7XG5cbmV4cG9ydCB7IEVsZW1lbnRNYXRjaGVyLCBTY29wZUV4ZWN1dG9yIH07XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBTY29wZVRyYWNraW5nRGVjbGFyYXRpb24gZXh0ZW5kcyBEZWNsYXJhdGlvbiB7XG4gICAgcHJpdmF0ZSByZWFkb25seSBjaGlsZFNjb3BlczogU2NvcGVbXSA9IFtdO1xuICAgIFxuICAgIGRlYWN0aXZhdGUoKTogdm9pZCB7XG4gICAgICAgIHRoaXMucmVtb3ZlQWxsQ2hpbGRTY29wZXMoKTtcbiAgICAgICAgc3VwZXIuZGVhY3RpdmF0ZSgpO1xuICAgIH1cblxuICAgIGdldENoaWxkU2NvcGVzKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5jaGlsZFNjb3BlcztcbiAgICB9XG5cbiAgICBwcm90ZWN0ZWQgaW5zcGVjdENoaWxkU2NvcGVzKGluY2x1ZGVTb3VyY2U/OiBib29sZWFuKTogdm9pZCB7ICAgICAgICBcbiAgICAgICAgZm9yKGxldCBjaGlsZFNjb3BlIG9mIHRoaXMuY2hpbGRTY29wZXMpIHtcbiAgICAgICAgICAgIGNoaWxkU2NvcGUuaW5zcGVjdChpbmNsdWRlU291cmNlKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByb3RlY3RlZCBhZGRDaGlsZFNjb3BlKHNjb3BlOiBTY29wZSkge1xuICAgICAgICBpZih0aGlzLmlzQWN0aXZhdGVkKSB7XG4gICAgICAgICAgICB0aGlzLmNoaWxkU2NvcGVzLnB1c2goc2NvcGUpO1xuXG4gICAgICAgICAgICBzY29wZS5hY3RpdmF0ZSgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJvdGVjdGVkIHJlbW92ZUNoaWxkU2NvcGUoc2NvcGU6IFNjb3BlKSB7IFxuICAgICAgICBzY29wZS5kZWFjdGl2YXRlKCk7XG5cbiAgICAgICAgaWYodGhpcy5pc0FjdGl2YXRlZCkge1xuICAgICAgICAgICAgbGV0IGluZGV4ID0gdGhpcy5jaGlsZFNjb3Blcy5pbmRleE9mKHNjb3BlKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgaWYoaW5kZXggPj0gMCkge1xuICAgICAgICAgICAgICAgIHRoaXMuY2hpbGRTY29wZXMuc3BsaWNlKGluZGV4LCAxKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByb3RlY3RlZCByZW1vdmVBbGxDaGlsZFNjb3BlcygpIHtcbiAgICAgICAgbGV0IGNoaWxkU2NvcGU6IFNjb3BlO1xuXG4gICAgICAgIHdoaWxlKGNoaWxkU2NvcGUgPSB0aGlzLmNoaWxkU2NvcGVzWzBdKSB7XG4gICAgICAgICAgICB0aGlzLnJlbW92ZUNoaWxkU2NvcGUoY2hpbGRTY29wZSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcm90ZWN0ZWQgYWRkQ2hpbGRTY29wZUJ5RWxlbWVudChlbGVtZW50OiBFbGVtZW50LCBleGVjdXRvcj86IFNjb3BlRXhlY3V0b3IpIHtcbiAgICAgICAgbGV0IGNoaWxkU2NvcGUgPSBuZXcgU2NvcGUoZWxlbWVudCwgZXhlY3V0b3IpO1xuXG4gICAgICAgIHRoaXMuYWRkQ2hpbGRTY29wZShjaGlsZFNjb3BlKTtcbiAgICB9XG5cbiAgICBwcm90ZWN0ZWQgcmVtb3ZlQ2hpbGRTY29wZUJ5RWxlbWVudChlbGVtZW50OiBFbGVtZW50KSB7XG4gICAgICAgIGZvcihsZXQgY2hpbGRTY29wZSBvZiB0aGlzLmNoaWxkU2NvcGVzKSB7XG4gICAgICAgICAgICBpZihjaGlsZFNjb3BlLmdldEVsZW1lbnQoKSA9PT0gZWxlbWVudCkge1xuICAgICAgICAgICAgICAgIHRoaXMucmVtb3ZlQ2hpbGRTY29wZShjaGlsZFNjb3BlKTtcbiAgICAgICAgICAgICAgICByZXR1cm47IC8vIGxvb3AgbXVzdCBleGlzdCB0byBhdm9pZCBkYXRhLXJhY2VcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbn0iLCJpbXBvcnQgeyBTY29wZVRyYWNraW5nRGVjbGFyYXRpb24sIEVsZW1lbnRNYXRjaGVyLCBTY29wZUV4ZWN1dG9yIH0gZnJvbSAnLi9zY29wZV90cmFja2luZ19kZWNsYXJhdGlvbic7XG5pbXBvcnQgeyBNYXRjaGluZ0VsZW1lbnRzU3Vic2NyaXB0aW9uLCBNYXRjaGluZ0VsZW1lbnRzQ2hhbmdlZEV2ZW50IH0gZnJvbSAnLi4vc3Vic2NyaXB0aW9ucy9tYXRjaGluZ19lbGVtZW50c19zdWJzY3JpcHRpb24nO1xuXG5leHBvcnQgeyBFbGVtZW50TWF0Y2hlciwgU2NvcGVFeGVjdXRvciB9O1xuXG5leHBvcnQgY2xhc3MgU2VsZWN0RGVjbGFyYXRpb24gZXh0ZW5kcyBTY29wZVRyYWNraW5nRGVjbGFyYXRpb24ge1xuICAgIHByb3RlY3RlZCBzdWJzY3JpcHRpb246IE1hdGNoaW5nRWxlbWVudHNTdWJzY3JpcHRpb247XG4gICAgcHJvdGVjdGVkIG1hdGNoZXI6IEVsZW1lbnRNYXRjaGVyO1xuICAgIHByb3RlY3RlZCBleGVjdXRvcjogU2NvcGVFeGVjdXRvcjtcblxuICAgIGNvbnN0cnVjdG9yKGVsZW1lbnQ6IEVsZW1lbnQsIG1hdGNoZXI6IEVsZW1lbnRNYXRjaGVyLCBleGVjdXRvcjogU2NvcGVFeGVjdXRvcikge1xuICAgICAgICBzdXBlcihlbGVtZW50KTtcblxuICAgICAgICB0aGlzLm1hdGNoZXIgPSBtYXRjaGVyO1xuICAgICAgICB0aGlzLmV4ZWN1dG9yID0gZXhlY3V0b3I7XG5cbiAgICAgICAgdGhpcy5zdWJzY3JpcHRpb24gPSBuZXcgTWF0Y2hpbmdFbGVtZW50c1N1YnNjcmlwdGlvbih0aGlzLmVsZW1lbnQsIHRoaXMubWF0Y2hlciwgKGV2ZW50OiBNYXRjaGluZ0VsZW1lbnRzQ2hhbmdlZEV2ZW50KSA9PiB7XG4gICAgICAgICAgICBmb3IobGV0IGVsZW1lbnQgb2YgZXZlbnQuYWRkZWRFbGVtZW50cykge1xuICAgICAgICAgICAgICAgIHRoaXMuYWRkQ2hpbGRTY29wZUJ5RWxlbWVudChlbGVtZW50LCB0aGlzLmV4ZWN1dG9yKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZm9yKGxldCBlbGVtZW50IG9mIGV2ZW50LnJlbW92ZWRFbGVtZW50cykge1xuICAgICAgICAgICAgICAgIHRoaXMucmVtb3ZlQ2hpbGRTY29wZUJ5RWxlbWVudChlbGVtZW50KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgaW5zcGVjdChpbmNsdWRlU291cmNlPzogYm9vbGVhbik6IHZvaWQge1xuICAgICAgICAoPGFueT5jb25zb2xlLmdyb3VwQ29sbGFwc2VkKSgnc2VsZWN0JywgdGhpcy5tYXRjaGVyKTtcblxuICAgICAgICB0cnl7XG4gICAgICAgICAgICB0aGlzLmluc3BlY3RDaGlsZFNjb3BlcyhpbmNsdWRlU291cmNlKTsgICAgICAgIFxuICAgICAgICB9ZmluYWxseXtcbiAgICAgICAgICAgIGNvbnNvbGUuZ3JvdXBFbmQoKTtcbiAgICAgICAgfVxuICAgIH1cbn0iLCJpbXBvcnQgeyBEZWNsYXJhdGlvbiB9IGZyb20gJy4vZGVjbGFyYXRpb24nO1xuaW1wb3J0IHsgVHJpdmlhbFN1YnNjcmlwdGlvbiwgU3Vic2NyaXB0aW9uRXhlY3V0b3IgfSBmcm9tICcuLi9zdWJzY3JpcHRpb25zL3RyaXZpYWxfc3Vic2NyaXB0aW9uJztcblxuZXhwb3J0IHsgU3Vic2NyaXB0aW9uRXhlY3V0b3IgfTtcblxuZXhwb3J0IGNsYXNzIFVubWF0Y2hEZWNsYXJhdGlvbiBleHRlbmRzIERlY2xhcmF0aW9uIHtcbiAgICBwcm90ZWN0ZWQgc3Vic2NyaXB0aW9uOiBUcml2aWFsU3Vic2NyaXB0aW9uO1xuICAgIHByb3RlY3RlZCBleGVjdXRvcjogU3Vic2NyaXB0aW9uRXhlY3V0b3I7XG5cbiAgICBjb25zdHJ1Y3RvcihlbGVtZW50OiBFbGVtZW50LCBleGVjdXRvcjogU3Vic2NyaXB0aW9uRXhlY3V0b3IpIHtcbiAgICAgICAgc3VwZXIoZWxlbWVudCk7XG5cbiAgICAgICAgdGhpcy5leGVjdXRvciA9IGV4ZWN1dG9yO1xuXG4gICAgICAgIHRoaXMuc3Vic2NyaXB0aW9uID0gbmV3IFRyaXZpYWxTdWJzY3JpcHRpb24odGhpcy5lbGVtZW50LCB7IGRpc2Nvbm5lY3RlZDogdHJ1ZSB9LCB0aGlzLmV4ZWN1dG9yKTtcbiAgICB9XG5cbiAgICBpbnNwZWN0KCk6IHZvaWQge1xuICAgICAgICBjb25zb2xlLmdyb3VwQ29sbGFwc2VkKCd1bm1hdGNoZXMnKTtcbiAgICAgICAgY29uc29sZS5sb2codGhpcy5leGVjdXRvcik7XG4gICAgICAgIGNvbnNvbGUuZ3JvdXBFbmQoKTtcbiAgICB9XG59IiwiaW1wb3J0IHsgU2NvcGVUcmFja2luZ0RlY2xhcmF0aW9uLCBFbGVtZW50TWF0Y2hlciwgU2NvcGVFeGVjdXRvciB9IGZyb20gJy4vc2NvcGVfdHJhY2tpbmdfZGVjbGFyYXRpb24nO1xuaW1wb3J0IHsgRWxlbWVudE1hdGNoZXNTdWJzY3JpcHRpb24sIEVsZW1lbnRNYXRjaGVzQ2hhbmdlZEV2ZW50IH0gZnJvbSAnLi4vc3Vic2NyaXB0aW9ucy9lbGVtZW50X21hdGNoZXNfc3Vic2NyaXB0aW9uJztcblxuZXhwb3J0IHsgRWxlbWVudE1hdGNoZXIsIFNjb3BlRXhlY3V0b3IgfTtcblxuZXhwb3J0IGNsYXNzIFdoZW5EZWNsYXJhdGlvbiBleHRlbmRzIFNjb3BlVHJhY2tpbmdEZWNsYXJhdGlvbiB7XG4gICAgcHJvdGVjdGVkIHN1YnNjcmlwdGlvbjogRWxlbWVudE1hdGNoZXNTdWJzY3JpcHRpb247XG4gICAgcHJvdGVjdGVkIG1hdGNoZXI6IEVsZW1lbnRNYXRjaGVyO1xuICAgIHByb3RlY3RlZCBleGVjdXRvcjogU2NvcGVFeGVjdXRvcjtcblxuICAgIGNvbnN0cnVjdG9yKGVsZW1lbnQ6IEVsZW1lbnQsIG1hdGNoZXI6IEVsZW1lbnRNYXRjaGVyLCBleGVjdXRvcjogU2NvcGVFeGVjdXRvcikge1xuICAgICAgICBzdXBlcihlbGVtZW50KTtcblxuICAgICAgICB0aGlzLm1hdGNoZXIgPSBtYXRjaGVyO1xuICAgICAgICB0aGlzLmV4ZWN1dG9yID0gZXhlY3V0b3I7XG5cbiAgICAgICAgdGhpcy5zdWJzY3JpcHRpb24gPSBuZXcgRWxlbWVudE1hdGNoZXNTdWJzY3JpcHRpb24odGhpcy5lbGVtZW50LCB0aGlzLm1hdGNoZXIsIChldmVudDogRWxlbWVudE1hdGNoZXNDaGFuZ2VkRXZlbnQpID0+IHtcbiAgICAgICAgICAgIGlmKGV2ZW50LmlzTWF0Y2hpbmcpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmFkZENoaWxkU2NvcGVCeUVsZW1lbnQoZWxlbWVudCwgdGhpcy5leGVjdXRvcik7XG4gICAgICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgICAgICB0aGlzLnJlbW92ZUNoaWxkU2NvcGVCeUVsZW1lbnQoZWxlbWVudCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGluc3BlY3QoaW5jbHVkZVNvdXJjZT86IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgKDxhbnk+Y29uc29sZS5ncm91cENvbGxhcHNlZCkoJ3doZW4nLCB0aGlzLm1hdGNoZXIpO1xuXG4gICAgICAgIHRyeXtcbiAgICAgICAgICAgIHRoaXMuaW5zcGVjdENoaWxkU2NvcGVzKGluY2x1ZGVTb3VyY2UpOyAgICAgICAgXG4gICAgICAgIH1maW5hbGx5e1xuICAgICAgICAgICAgY29uc29sZS5ncm91cEVuZCgpO1xuICAgICAgICB9XG4gICAgfVxufSIsImV4cG9ydCBkZWZhdWx0IEVsZW1lbnRDb2xsZWN0b3I7XG5cbmV4cG9ydCBpbnRlcmZhY2UgRWxlbWVudFZpc3RvciB7IChlbGVtZW50OiBFbGVtZW50KTogRWxlbWVudE1hdGNoZXIgfCBib29sZWFuIH1cbmV4cG9ydCBkZWNsYXJlIHR5cGUgRWxlbWVudE1hdGNoZXIgPSBzdHJpbmcgfCBOb2RlTGlzdE9mPEVsZW1lbnQ+IHwgRWxlbWVudFtdIHwgRWxlbWVudFZpc3RvcjtcblxuZXhwb3J0IGNsYXNzIEVsZW1lbnRDb2xsZWN0b3Ige1xuICAgIHByaXZhdGUgc3RhdGljIGluc3RhbmNlOiBFbGVtZW50Q29sbGVjdG9yO1xuICAgIFxuICAgIHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IEVMRU1FTlRfTUFUQ0hFUl9UWVBFX0VSUk9SX01FU1NBR0UgPSBcIkRlY2w6IEFuIGBFbGVtZW50TWF0Y2hlcmAgbXVzdCBiZSBhIENTUyBzZWxlY3RvciAoc3RyaW5nKSBvciBhIGZ1bmN0aW9uIHdoaWNoIHRha2VzIGEgbm9kZSB1bmRlciBjb25zaWRlcmF0aW9uIGFuZCByZXR1cm5zIGEgQ1NTIHNlbGVjdG9yIChzdHJpbmcpIHRoYXQgbWF0Y2hlcyBhbGwgbWF0Y2hpbmcgbm9kZXMgaW4gdGhlIHN1YnRyZWUsIGFuIGFycmF5LWxpa2Ugb2JqZWN0IG9mIG1hdGNoaW5nIG5vZGVzIGluIHRoZSBzdWJ0cmVlLCBvciBhIGJvb2xlYW4gdmFsdWUgYXMgdG8gd2hldGhlciB0aGUgbm9kZSBzaG91bGQgYmUgaW5jbHVkZWQgKGluIHRoaXMgY2FzZSwgdGhlIGZ1bmN0aW9uIHdpbGwgYmUgaW52b2tlZCBhZ2FpbiBmb3IgYWxsIGNoaWxkcmVuIG9mIHRoZSBub2RlKS5cIjtcblxuICAgIHN0YXRpYyBpc01hdGNoaW5nRWxlbWVudChyb290RWxlbWVudDogRWxlbWVudCwgZWxlbWVudE1hdGNoZXI6IEVsZW1lbnRNYXRjaGVyKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldEluc3RhbmNlKCkuaXNNYXRjaGluZ0VsZW1lbnQocm9vdEVsZW1lbnQsIGVsZW1lbnRNYXRjaGVyKTtcbiAgICB9XG5cbiAgICBzdGF0aWMgY29sbGVjdE1hdGNoaW5nRWxlbWVudHMocm9vdEVsZW1lbnQ6IEVsZW1lbnQsIGVsZW1lbnRNYXRjaGVyOiBFbGVtZW50TWF0Y2hlcik6IEVsZW1lbnRbXSB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldEluc3RhbmNlKCkuY29sbGVjdE1hdGNoaW5nRWxlbWVudHMocm9vdEVsZW1lbnQsIGVsZW1lbnRNYXRjaGVyKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHN0YXRpYyBnZXRJbnN0YW5jZSgpIDogRWxlbWVudENvbGxlY3RvciB7XG4gICAgICAgIHJldHVybiB0aGlzLmluc3RhbmNlIHx8ICh0aGlzLmluc3RhbmNlID0gbmV3IEVsZW1lbnRDb2xsZWN0b3IoKSk7XG4gICAgfVxuXG4gICAgaXNNYXRjaGluZ0VsZW1lbnQoZWxlbWVudDogRWxlbWVudCwgZWxlbWVudE1hdGNoZXI6IEVsZW1lbnRNYXRjaGVyKTogYm9vbGVhbiB7XG4gICAgICAgIHN3aXRjaCh0eXBlb2YoZWxlbWVudE1hdGNoZXIpKSB7XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoRWxlbWVudENvbGxlY3Rvci5FTEVNRU5UX01BVENIRVJfVFlQRV9FUlJPUl9NRVNTQUdFKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgICAgICAgICAgICAgbGV0IGNzc1NlbGVjdG9yOiBzdHJpbmcgPSA8c3RyaW5nPmVsZW1lbnRNYXRjaGVyO1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmlzTWF0Y2hpbmdFbGVtZW50RnJvbUNzc1NlbGVjdG9yKGVsZW1lbnQsIGNzc1NlbGVjdG9yKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgICAgICAgICAgICBsZXQgb2JqZWN0ID0gPE9iamVjdD5lbGVtZW50TWF0Y2hlcjtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5pc01hdGNoaW5nRWxlbWVudEZyb21PYmplY3QoZWxlbWVudCwgb2JqZWN0KTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIGNhc2UgJ2Z1bmN0aW9uJzpcbiAgICAgICAgICAgICAgICBsZXQgZWxlbWVudFZpc3RvciA9IDxFbGVtZW50VmlzdG9yPmVsZW1lbnRNYXRjaGVyO1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmlzTWF0Y2hpbmdFbGVtZW50RnJvbUVsZW1lbnRWaXN0b3IoZWxlbWVudCwgZWxlbWVudFZpc3Rvcik7ICAgICAgIFxuICAgICAgICB9XG4gICAgfVxuXG4gICAgY29sbGVjdE1hdGNoaW5nRWxlbWVudHMoZWxlbWVudDogRWxlbWVudCwgZWxlbWVudE1hdGNoZXI6IEVsZW1lbnRNYXRjaGVyKTogRWxlbWVudFtdIHtcbiAgICAgICAgc3dpdGNoKHR5cGVvZihlbGVtZW50TWF0Y2hlcikpIHtcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihFbGVtZW50Q29sbGVjdG9yLkVMRU1FTlRfTUFUQ0hFUl9UWVBFX0VSUk9SX01FU1NBR0UpO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgICAgICAgICAgICBsZXQgY3NzU2VsZWN0b3I6IHN0cmluZyA9IDxzdHJpbmc+ZWxlbWVudE1hdGNoZXI7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuY29sbGVjdE1hdGNoaW5nRWxlbWVudHNGcm9tQ3NzU2VsZWN0b3IoZWxlbWVudCwgY3NzU2VsZWN0b3IpO1xuXG4gICAgICAgICAgICBjYXNlICdvYmplY3QnOlxuICAgICAgICAgICAgICAgIGxldCBvYmplY3QgPSA8T2JqZWN0PmVsZW1lbnRNYXRjaGVyO1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmNvbGxlY3RNYXRjaGluZ0VsZW1lbnRzRnJvbU9iamVjdChlbGVtZW50LCBvYmplY3QpO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgY2FzZSAnZnVuY3Rpb24nOlxuICAgICAgICAgICAgICAgIGxldCBlbGVtZW50VmlzdG9yID0gPEVsZW1lbnRWaXN0b3I+ZWxlbWVudE1hdGNoZXI7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuY29sbGVjdE1hdGNoaW5nRWxlbWVudHNGcm9tRWxlbWVudFZpc3RvcihlbGVtZW50LCBlbGVtZW50VmlzdG9yKTsgICAgICAgXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGlzTWF0Y2hpbmdFbGVtZW50RnJvbUNzc1NlbGVjdG9yKGVsZW1lbnQ6IEVsZW1lbnQsIGNzc1NlbGVjdG9yOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICAgICAgaWYodHlwZW9mKGVsZW1lbnQubWF0Y2hlcykgPT09ICdmdW5jdGlvbicpIHsgLy8gdGFrZSBhIHNob3J0Y3V0IGluIG1vZGVybiBicm93c2Vyc1xuICAgICAgICAgICAgcmV0dXJuIGVsZW1lbnQubWF0Y2hlcyhjc3NTZWxlY3Rvcik7XG4gICAgICAgIH1lbHNle1xuICAgICAgICAgICAgcmV0dXJuIGlzTWVtYmVyT2ZBcnJheUxpa2UoZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbChjc3NTZWxlY3RvciksIGVsZW1lbnQpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBpc01hdGNoaW5nRWxlbWVudEZyb21PYmplY3QoZWxlbWVudDogRWxlbWVudCwgb2JqZWN0OiBPYmplY3QpOiBib29sZWFuIHtcbiAgICAgICAgaWYob2JqZWN0ID09PSBudWxsKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1lbHNle1xuICAgICAgICAgICAgaWYoaXNBcnJheUxpa2Uob2JqZWN0KSkge1xuICAgICAgICAgICAgICAgIGxldCBhcnJheUxpa2UgPSA8QXJyYXlMaWtlPGFueT4+b2JqZWN0O1xuXG4gICAgICAgICAgICAgICAgaWYoYXJyYXlMaWtlLmxlbmd0aCA9PT0gMCB8fCBhcnJheUxpa2VbMF0gaW5zdGFuY2VvZiBFbGVtZW50KSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBpc01lbWJlck9mQXJyYXlMaWtlKGFycmF5TGlrZSwgZWxlbWVudCk7ICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIH1lbHNle1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKEVsZW1lbnRDb2xsZWN0b3IuRUxFTUVOVF9NQVRDSEVSX1RZUEVfRVJST1JfTUVTU0FHRSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihFbGVtZW50Q29sbGVjdG9yLkVMRU1FTlRfTUFUQ0hFUl9UWVBFX0VSUk9SX01FU1NBR0UpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBpc01hdGNoaW5nRWxlbWVudEZyb21FbGVtZW50VmlzdG9yKGVsZW1lbnQ6IEVsZW1lbnQsIGVsZW1lbnRWaXN0b3I6IEVsZW1lbnRWaXN0b3IpOiBib29sZWFuIHtcbiAgICAgICAgbGV0IHZpc2l0b3JSZXN1bHQgPSBlbGVtZW50VmlzdG9yKGVsZW1lbnQpO1xuXG4gICAgICAgIGlmKHR5cGVvZih2aXNpdG9yUmVzdWx0KSA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgICAgICBsZXQgaXNNYXRjaCA9IDxib29sZWFuPnZpc2l0b3JSZXN1bHQ7XG4gICAgICAgICAgICByZXR1cm4gaXNNYXRjaDtcbiAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICBsZXQgZWxlbWVudE1hdGNoZXIgPSA8RWxlbWVudE1hdGNoZXI+dmlzaXRvclJlc3VsdDtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmlzTWF0Y2hpbmdFbGVtZW50KGVsZW1lbnQsIGVsZW1lbnRNYXRjaGVyKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgY29sbGVjdE1hdGNoaW5nRWxlbWVudHNGcm9tQ3NzU2VsZWN0b3IoZWxlbWVudDogRWxlbWVudCwgY3NzU2VsZWN0b3I6IHN0cmluZyk6IEVsZW1lbnRbXSB7XG4gICAgICAgIHJldHVybiB0b0FycmF5PEVsZW1lbnQ+KGVsZW1lbnQucXVlcnlTZWxlY3RvckFsbChjc3NTZWxlY3RvcikpO1xuICAgIH1cblxuICAgIHByaXZhdGUgY29sbGVjdE1hdGNoaW5nRWxlbWVudHNGcm9tT2JqZWN0KF9lbGVtZW50OiBFbGVtZW50LCBvYmplY3Q6IE9iamVjdCk6IEVsZW1lbnRbXSB7XG4gICAgICAgIGlmKG9iamVjdCA9PT0gbnVsbCkge1xuICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgIGlmKGlzQXJyYXlMaWtlKG9iamVjdCkpIHtcbiAgICAgICAgICAgICAgICBsZXQgYXJyYXlMaWtlID0gPEFycmF5TGlrZTxhbnk+Pm9iamVjdDtcblxuICAgICAgICAgICAgICAgIGlmKGFycmF5TGlrZS5sZW5ndGggPT09IDAgfHwgYXJyYXlMaWtlWzBdIGluc3RhbmNlb2YgRWxlbWVudCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdG9BcnJheTxFbGVtZW50PihhcnJheUxpa2UpOyAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihFbGVtZW50Q29sbGVjdG9yLkVMRU1FTlRfTUFUQ0hFUl9UWVBFX0VSUk9SX01FU1NBR0UpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1lbHNle1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoRWxlbWVudENvbGxlY3Rvci5FTEVNRU5UX01BVENIRVJfVFlQRV9FUlJPUl9NRVNTQUdFKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgY29sbGVjdE1hdGNoaW5nRWxlbWVudHNGcm9tRWxlbWVudFZpc3RvcihlbGVtZW50OiBFbGVtZW50LCBlbGVtZW50VmlzdG9yOiBFbGVtZW50VmlzdG9yKTogRWxlbWVudFtdIHtcbiAgICAgICAgbGV0IGVsZW1lbnRzOiBFbGVtZW50W10gPSBbXTtcbiAgICAgICAgbGV0IGNoaWxkcmVuID0gZWxlbWVudC5jaGlsZHJlbjtcbiAgICAgICAgXG4gICAgICAgIGZvcihsZXQgaW5kZXggPSAwLCBsZW5ndGggPSBjaGlsZHJlbi5sZW5ndGg7IGluZGV4IDwgbGVuZ3RoOyBpbmRleCsrKSB7XG4gICAgICAgICAgICBsZXQgY2hpbGQgPSBjaGlsZHJlbltpbmRleF07XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGlmKGNoaWxkIGluc3RhbmNlb2YgRWxlbWVudCkge1xuICAgICAgICAgICAgICAgIGxldCBlbGVtZW50OiBFbGVtZW50ID0gY2hpbGQ7XG4gICAgICAgICAgICAgICAgbGV0IHZpc2l0b3JSZXN1bHQgPSBlbGVtZW50VmlzdG9yKGVsZW1lbnQpO1xuXG4gICAgICAgICAgICAgICAgaWYodHlwZW9mKHZpc2l0b3JSZXN1bHQpID09PSAnYm9vbGVhbicpIHtcbiAgICAgICAgICAgICAgICAgICAgbGV0IGlzTWF0Y2ggPSA8Ym9vbGVhbj52aXNpdG9yUmVzdWx0O1xuXG4gICAgICAgICAgICAgICAgICAgIGlmKGlzTWF0Y2gpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsZW1lbnRzLnB1c2goZWxlbWVudCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudHMucHVzaCguLi50aGlzLmNvbGxlY3RNYXRjaGluZ0VsZW1lbnRzKGVsZW1lbnQsIHZpc2l0b3JSZXN1bHQpKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gZWxlbWVudHM7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBpc0FycmF5TGlrZSh2YWx1ZTogYW55KSB7XG4gICAgcmV0dXJuIHR5cGVvZih2YWx1ZSkgPT09ICdvYmplY3QnICYmIHR5cGVvZih2YWx1ZS5sZW5ndGgpID09PSAnbnVtYmVyJztcbn1cblxuZnVuY3Rpb24gdG9BcnJheTxUPihhcnJheUxpa2U6IEFycmF5TGlrZTxUPik6IEFycmF5PFQ+IHtcbiAgICBpZihpc0FycmF5TGlrZShhcnJheUxpa2UpKSB7XG4gICAgICAgIHJldHVybiBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcnJheUxpa2UsIDApO1xuICAgIH1lbHNle1xuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdFeHBlY3RlZCBBcnJheUxpa2UnKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGlzTWVtYmVyT2ZBcnJheUxpa2UoaGF5c3RhY2s6IEFycmF5TGlrZTxhbnk+LCAgbmVlZGxlOiBhbnkpIHtcbiAgICByZXR1cm4gQXJyYXkucHJvdG90eXBlLmluZGV4T2YuY2FsbChoYXlzdGFjaywgbmVlZGxlKSAhPT0gLTE7XG59XG4iLCJpbXBvcnQgeyBEZWNsYXJhdGlvbiwgU3Vic2NyaXB0aW9uRXhlY3V0b3IgfSBmcm9tICcuL2RlY2xhcmF0aW9ucy9kZWNsYXJhdGlvbic7XG5pbXBvcnQgeyBNYXRjaERlY2xhcmF0aW9uIH0gZnJvbSAnLi9kZWNsYXJhdGlvbnMvbWF0Y2hfZGVjbGFyYXRpb24nO1xuaW1wb3J0IHsgVW5tYXRjaERlY2xhcmF0aW9uIH0gZnJvbSAnLi9kZWNsYXJhdGlvbnMvdW5tYXRjaF9kZWNsYXJhdGlvbic7XG5pbXBvcnQgeyBPbkRlY2xhcmF0aW9uLCBFdmVudE1hdGNoZXIgfSBmcm9tICcuL2RlY2xhcmF0aW9ucy9vbl9kZWNsYXJhdGlvbic7XG5cbmltcG9ydCB7IEVsZW1lbnRNYXRjaGVyIH0gZnJvbSAnLi9kZWNsYXJhdGlvbnMvc2NvcGVfdHJhY2tpbmdfZGVjbGFyYXRpb24nO1xuaW1wb3J0IHsgU2VsZWN0RGVjbGFyYXRpb24gfSBmcm9tICcuL2RlY2xhcmF0aW9ucy9zZWxlY3RfZGVjbGFyYXRpb24nO1xuaW1wb3J0IHsgV2hlbkRlY2xhcmF0aW9uIH0gZnJvbSAnLi9kZWNsYXJhdGlvbnMvd2hlbl9kZWNsYXJhdGlvbic7XG5cbmV4cG9ydCB7IERlY2xhcmF0aW9uLCBTdWJzY3JpcHRpb25FeGVjdXRvciwgRWxlbWVudE1hdGNoZXIsIEV2ZW50TWF0Y2hlciB9O1xuXG5leHBvcnQgaW50ZXJmYWNlIFNjb3BlRXhlY3V0b3IgeyBcbiAgICAoc2NvcGU6IFNjb3BlLCBlbGVtZW50OiBFbGVtZW50KTogdm9pZFxufTtcblxuZXhwb3J0IGNsYXNzIFNjb3BlIHtcbiAgICBzdGF0aWMgYnVpbGRSb290U2NvcGUoZWxlbWVudDogRWxlbWVudCk6IFNjb3BlIHtcbiAgICAgICAgbGV0IHNjb3BlID0gbmV3IFNjb3BlKGVsZW1lbnQpO1xuICAgICAgICBzY29wZS5hY3RpdmF0ZSgpO1xuXG4gICAgICAgIHJldHVybiBzY29wZTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHJlYWRvbmx5IGVsZW1lbnQ6IEVsZW1lbnQ7XG4gICAgcHJpdmF0ZSByZWFkb25seSBleGVjdXRvcnM6IFNjb3BlRXhlY3V0b3JbXSA9IFtdO1xuXG4gICAgcHJpdmF0ZSBpc0FjdGl2YXRlZDogYm9vbGVhbiA9IGZhbHNlO1xuICAgIHByaXZhdGUgZGVjbGFyYXRpb25zOiBEZWNsYXJhdGlvbltdID0gW107XG5cbiAgICBjb25zdHJ1Y3RvcihlbGVtZW50OiBFbGVtZW50LCBleGVjdXRvcj86IFNjb3BlRXhlY3V0b3IpIHtcbiAgICAgICAgdGhpcy5lbGVtZW50ID0gZWxlbWVudDtcblxuICAgICAgICBpZihleGVjdXRvcikge1xuICAgICAgICAgICAgdGhpcy5hZGRFeGVjdXRvcihleGVjdXRvcik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBhZGRFeGVjdXRvcihleGVjdXRvcjogU2NvcGVFeGVjdXRvcik6IHZvaWQge1xuICAgICAgICB0aGlzLmV4ZWN1dG9ycy5wdXNoKGV4ZWN1dG9yKTtcblxuICAgICAgICByZXR1cm4gZXhlY3V0b3IuY2FsbCh0aGlzLCB0aGlzLCB0aGlzLmVsZW1lbnQpO1xuICAgIH1cblxuICAgIGdldEVsZW1lbnQoKTogRWxlbWVudCB7XG4gICAgICAgIHJldHVybiB0aGlzLmVsZW1lbnQ7XG4gICAgfVxuXG4gICAgZ2V0RGVjbGFyYXRpb25zKCk6IERlY2xhcmF0aW9uW10ge1xuICAgICAgICByZXR1cm4gdGhpcy5kZWNsYXJhdGlvbnM7XG4gICAgfVxuXG4gICAgaW5zcGVjdChpbmNsdWRlU291cmNlPzogYm9vbGVhbik6IHZvaWQge1xuICAgICAgICAoPGFueT5jb25zb2xlLmdyb3VwQ29sbGFwc2VkKSh0aGlzLmVsZW1lbnQpO1xuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBpZihpbmNsdWRlU291cmNlKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5ncm91cENvbGxhcHNlZCgnc291cmNlJyk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBmb3IobGV0IGV4ZWN1dG9yIG9mIHRoaXMuZXhlY3V0b3JzKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGV4ZWN1dG9yKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBjb25zb2xlLmdyb3VwRW5kKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGZvcihsZXQgZGVjbGFyYXRpb24gb2YgdGhpcy5kZWNsYXJhdGlvbnMpIHtcbiAgICAgICAgICAgICAgICBkZWNsYXJhdGlvbi5pbnNwZWN0KGluY2x1ZGVTb3VyY2UpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9ZmluYWxseXtcbiAgICAgICAgICAgICg8YW55PmNvbnNvbGUuZ3JvdXBFbmQpKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBhY3RpdmF0ZSgpOiB2b2lkIHtcbiAgICAgICAgaWYoIXRoaXMuaXNBY3RpdmF0ZWQpIHtcbiAgICAgICAgICAgIHRoaXMuaXNBY3RpdmF0ZWQgPSB0cnVlO1xuXG4gICAgICAgICAgICBmb3IobGV0IGRlY2xhcmF0aW9uIG9mIHRoaXMuZGVjbGFyYXRpb25zKSB7XG4gICAgICAgICAgICAgICAgZGVjbGFyYXRpb24uYWN0aXZhdGUoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGRlYWN0aXZhdGUoKTogdm9pZCB7ICAgICAgICBcbiAgICAgICAgaWYodGhpcy5pc0FjdGl2YXRlZCkge1xuICAgICAgICAgICAgdGhpcy5pc0FjdGl2YXRlZCA9IGZhbHNlOyAgICAgICAgICAgIFxuICAgICAgICAgICAgXG4gICAgICAgICAgICBmb3IobGV0IGRlY2xhcmF0aW9uIG9mIHRoaXMuZGVjbGFyYXRpb25zKSB7XG4gICAgICAgICAgICAgICAgZGVjbGFyYXRpb24uZGVhY3RpdmF0ZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpc3RpbmUoKTogdm9pZCB7XG4gICAgICAgIHRoaXMuZGVhY3RpdmF0ZSgpO1xuICAgICAgICB0aGlzLnJlbW92ZUFsbERlY2xhcmF0aW9ucygpO1xuICAgIH1cblxuICAgIG1hdGNoKGV4ZWN1dG9yOiBTdWJzY3JpcHRpb25FeGVjdXRvcik6IFNjb3BlIHtcbiAgICAgICAgdGhpcy5hZGREZWNsYXJhdGlvbihuZXcgTWF0Y2hEZWNsYXJhdGlvbih0aGlzLmVsZW1lbnQsIGV4ZWN1dG9yKSk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgdW5tYXRjaChleGVjdXRvcjogU3Vic2NyaXB0aW9uRXhlY3V0b3IpOiBTY29wZSB7XG4gICAgICAgIHRoaXMuYWRkRGVjbGFyYXRpb24obmV3IFVubWF0Y2hEZWNsYXJhdGlvbih0aGlzLmVsZW1lbnQsIGV4ZWN1dG9yKSk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgc2VsZWN0KG1hdGNoZXI6IEVsZW1lbnRNYXRjaGVyLCBleGVjdXRvcjogU2NvcGVFeGVjdXRvcik6IFNjb3BlIHtcbiAgICAgICAgdGhpcy5hZGREZWNsYXJhdGlvbihuZXcgU2VsZWN0RGVjbGFyYXRpb24odGhpcy5lbGVtZW50LCBtYXRjaGVyLCBleGVjdXRvcikpO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHdoZW4obWF0Y2hlcjogRWxlbWVudE1hdGNoZXIsIGV4ZWN1dG9yOiBTY29wZUV4ZWN1dG9yKTogU2NvcGUge1xuXHRcdHRoaXMuYWRkRGVjbGFyYXRpb24obmV3IFdoZW5EZWNsYXJhdGlvbih0aGlzLmVsZW1lbnQsIG1hdGNoZXIsIGV4ZWN1dG9yKSk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgb24oZXZlbnRNYXRjaGVyOiBFdmVudE1hdGNoZXIsIGV4ZWN1dG9yOiBTdWJzY3JpcHRpb25FeGVjdXRvcik6IFNjb3BlO1xuICAgIG9uKGV2ZW50TWF0Y2hlcjogRXZlbnRNYXRjaGVyLCBlbGVtZW50TWF0Y2hlcjogRWxlbWVudE1hdGNoZXIsIGV4ZWN1dG9yOiBTdWJzY3JpcHRpb25FeGVjdXRvcik6IFNjb3BlO1xuICAgIG9uKGV2ZW50TWF0Y2hlcjogRXZlbnRNYXRjaGVyLCBleGVjdXRvck9yRWxlbWVudE1hdGNoZXI6IFN1YnNjcmlwdGlvbkV4ZWN1dG9yIHwgRWxlbWVudE1hdGNoZXIsIG1heWJlRXhlY3V0b3I/OiBTdWJzY3JpcHRpb25FeGVjdXRvcik6IFNjb3BlIHtcbiAgICAgICAgbGV0IGFyZ3VtZW50c0NvdW50ID0gYXJndW1lbnRzLmxlbmd0aDtcblxuICAgICAgICBzd2l0Y2goYXJndW1lbnRzQ291bnQpIHtcbiAgICAgICAgICAgIGNhc2UgMjpcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5vbldpdGhUd29Bcmd1bWVudHMoZXZlbnRNYXRjaGVyLCA8U3Vic2NyaXB0aW9uRXhlY3V0b3I+ZXhlY3V0b3JPckVsZW1lbnRNYXRjaGVyKTtcbiAgICAgICAgICAgIGNhc2UgMzpcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5vbldpdGhUaHJlZUFyZ3VtZW50cyhldmVudE1hdGNoZXIsIDxFbGVtZW50TWF0Y2hlcj5leGVjdXRvck9yRWxlbWVudE1hdGNoZXIsIDxTdWJzY3JpcHRpb25FeGVjdXRvcj5tYXliZUV4ZWN1dG9yKTtcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcIkZhaWxlZCB0byBleGVjdXRlICdvbicgb24gJ1Njb3BlJzogMiBvciAzIGFyZ3VtZW50cyByZXF1aXJlZCwgYnV0IFwiICsgYXJndW1lbnRzQ291bnQgKyBcIiBwcmVzZW50LlwiKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgb25XaXRoVHdvQXJndW1lbnRzKGV2ZW50TWF0Y2hlcjogRXZlbnRNYXRjaGVyLCBleGVjdXRvcjogU3Vic2NyaXB0aW9uRXhlY3V0b3IpOiBTY29wZSB7XG4gICAgICAgIHRoaXMuYWRkRGVjbGFyYXRpb24obmV3IE9uRGVjbGFyYXRpb24odGhpcy5lbGVtZW50LCBldmVudE1hdGNoZXIsIGV4ZWN1dG9yKSk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBvbldpdGhUaHJlZUFyZ3VtZW50cyhldmVudE1hdGNoZXI6IEV2ZW50TWF0Y2hlciwgZWxlbWVudE1hdGNoZXI6IEVsZW1lbnRNYXRjaGVyLCBleGVjdXRvcjogU3Vic2NyaXB0aW9uRXhlY3V0b3IpOiBTY29wZSB7XG4gICAgICAgIHRoaXMuc2VsZWN0KGVsZW1lbnRNYXRjaGVyLCAoc2NvcGUpID0+IHtcbiAgICAgICAgICAgIHNjb3BlLm9uKGV2ZW50TWF0Y2hlciwgZXhlY3V0b3IpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwcml2YXRlIGFkZERlY2xhcmF0aW9uKGRlY2xhcmF0aW9uOiBEZWNsYXJhdGlvbik6IHZvaWQge1xuICAgICAgICB0aGlzLmRlY2xhcmF0aW9ucy5wdXNoKGRlY2xhcmF0aW9uKTtcblxuICAgICAgICBpZih0aGlzLmlzQWN0aXZhdGVkKSB7XG4gICAgICAgICAgICBkZWNsYXJhdGlvbi5hY3RpdmF0ZSgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSByZW1vdmVEZWNsYXJhdGlvbihkZWNsYXJhdGlvbjogRGVjbGFyYXRpb24pOiB2b2lkIHsgIFxuICAgICAgICBsZXQgaW5kZXggPSB0aGlzLmRlY2xhcmF0aW9ucy5pbmRleE9mKGRlY2xhcmF0aW9uKTtcblxuICAgICAgICBpZihpbmRleCA+PSAwKSB7XG4gICAgICAgICAgICB0aGlzLmRlY2xhcmF0aW9ucy5zcGxpY2UoaW5kZXgsIDEpO1xuICAgICAgICB9XG5cbiAgICAgICAgZGVjbGFyYXRpb24uZGVhY3RpdmF0ZSgpOyAgICAgICAgXG4gICAgfVxuXG4gICAgcHJpdmF0ZSByZW1vdmVBbGxEZWNsYXJhdGlvbnMoKSB7ICAgICAgICBcbiAgICAgICAgbGV0IGRlY2xhcmF0aW9uOiBEZWNsYXJhdGlvbjtcblxuICAgICAgICB3aGlsZShkZWNsYXJhdGlvbiA9IHRoaXMuZGVjbGFyYXRpb25zWzBdKSB7XG4gICAgICAgICAgICB0aGlzLnJlbW92ZURlY2xhcmF0aW9uKGRlY2xhcmF0aW9uKTtcbiAgICAgICAgfVxuICAgIH1cbn1cbiIsImltcG9ydCB7IFN1YnNjcmlwdGlvbiwgU3Vic2NyaXB0aW9uRXhlY3V0b3IsIFN1YnNjcmlwdGlvbkV2ZW50IH0gZnJvbSAnLi9zdWJzY3JpcHRpb24nO1xuXG5pbnRlcmZhY2UgQ29tbW9uSnNSZXF1aXJlIHtcbiAgICAoaWQ6IHN0cmluZyk6IGFueTtcbn1cblxuZGVjbGFyZSB2YXIgcmVxdWlyZTogQ29tbW9uSnNSZXF1aXJlO1xubGV0IE11dGF0aW9uT2JzZXJ2ZXIgPSByZXF1aXJlKCdtdXRhdGlvbi1vYnNlcnZlcicpOyAvLyB1c2UgcG9seWZpbGxcblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEJhdGNoZWRNdXRhdGlvblN1YnNjcmlwdGlvbiBleHRlbmRzIFN1YnNjcmlwdGlvbiB7XG4gICAgc3RhdGljIHJlYWRvbmx5IG11dGF0aW9uT2JzZXJ2ZXJJbml0OiBNdXRhdGlvbk9ic2VydmVySW5pdCA9IHtcbiAgICAgICAgY2hpbGRMaXN0OiB0cnVlLFxuICAgICAgICBhdHRyaWJ1dGVzOiB0cnVlLFxuICAgICAgICBjaGFyYWN0ZXJEYXRhOiB0cnVlLFxuICAgICAgICBzdWJ0cmVlOiB0cnVlXG4gICAgfTtcblxuICAgIHByaXZhdGUgaXNMaXN0ZW5pbmcgOiBib29sZWFuID0gZmFsc2U7XG4gICAgcHJpdmF0ZSBoYW5kbGVNdXRhdGlvblRpbWVvdXQgOiBhbnkgPSBudWxsO1xuXG4gICAgcHJpdmF0ZSByZWFkb25seSBtdXRhdGlvbkNhbGxiYWNrOiBNdXRhdGlvbkNhbGxiYWNrO1xuICAgIHByaXZhdGUgcmVhZG9ubHkgbXV0YXRpb25PYnNlcnZlcjogTXV0YXRpb25PYnNlcnZlcjtcblxuICAgIGNvbnN0cnVjdG9yKGVsZW1lbnQ6IEVsZW1lbnQsIGV4ZWN1dG9yOiBTdWJzY3JpcHRpb25FeGVjdXRvcikge1xuICAgICAgICBzdXBlcihlbGVtZW50LCBleGVjdXRvcik7XG5cbiAgICAgICAgdGhpcy5tdXRhdGlvbkNhbGxiYWNrID0gKCk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgdGhpcy5kZWZlckhhbmRsZU11dGF0aW9ucygpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5tdXRhdGlvbk9ic2VydmVyID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIodGhpcy5tdXRhdGlvbkNhbGxiYWNrKTtcbiAgICB9XG5cbiAgICBwcm90ZWN0ZWQgc3RhcnRMaXN0ZW5pbmcoKTogdm9pZCB7XG4gICAgICAgIGlmKCF0aGlzLmlzTGlzdGVuaW5nKSB7XG4gICAgICAgICAgICB0aGlzLm11dGF0aW9uT2JzZXJ2ZXIub2JzZXJ2ZSh0aGlzLmVsZW1lbnQsIEJhdGNoZWRNdXRhdGlvblN1YnNjcmlwdGlvbi5tdXRhdGlvbk9ic2VydmVySW5pdCk7XG5cbiAgICAgICAgICAgIHRoaXMuaXNMaXN0ZW5pbmcgPSB0cnVlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJvdGVjdGVkIHN0b3BMaXN0ZW5pbmcoKTogdm9pZCB7XG4gICAgICAgIGlmKHRoaXMuaXNMaXN0ZW5pbmcpIHtcbiAgICAgICAgICAgIHRoaXMubXV0YXRpb25PYnNlcnZlci5kaXNjb25uZWN0KCk7XG4gICAgICAgICAgICB0aGlzLmhhbmRsZU11dGF0aW9uc05vdygpO1xuXG4gICAgICAgICAgICB0aGlzLmlzTGlzdGVuaW5nID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgcHJvdGVjdGVkIGFic3RyYWN0IGhhbmRsZU11dGF0aW9ucygpOiB2b2lkO1xuXG4gICAgcHJpdmF0ZSBkZWZlckhhbmRsZU11dGF0aW9ucygpOiB2b2lkIHtcbiAgICAgICAgaWYodGhpcy5oYW5kbGVNdXRhdGlvblRpbWVvdXQgPT09IG51bGwpIHtcbiAgICAgICAgICAgIHRoaXMuaGFuZGxlTXV0YXRpb25UaW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB7IFxuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMubXV0YXRpb25PYnNlcnZlci50YWtlUmVjb3JkcygpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmhhbmRsZU11dGF0aW9ucygpO1xuICAgICAgICAgICAgICAgIH1maW5hbGx5e1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmhhbmRsZU11dGF0aW9uVGltZW91dCA9IG51bGw7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSwgMCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGhhbmRsZU11dGF0aW9uc05vdygpOiB2b2lkIHtcbiAgICAgICAgaWYodGhpcy5oYW5kbGVNdXRhdGlvblRpbWVvdXQgIT09IG51bGwpIHtcbiAgICAgICAgICAgIGNsZWFyVGltZW91dCh0aGlzLmhhbmRsZU11dGF0aW9uVGltZW91dCk7XG4gICAgICAgICAgICB0aGlzLmhhbmRsZU11dGF0aW9uVGltZW91dCA9IG51bGw7XG5cbiAgICAgICAgICAgIHRoaXMuaGFuZGxlTXV0YXRpb25zKCk7ICAgICAgICAgICAgXG4gICAgICAgIH1cbiAgICB9XG59XG5cbmV4cG9ydCB7IFN1YnNjcmlwdGlvbiwgU3Vic2NyaXB0aW9uRXhlY3V0b3IsIFN1YnNjcmlwdGlvbkV2ZW50IH07IiwiaW1wb3J0IHsgQmF0Y2hlZE11dGF0aW9uU3Vic2NyaXB0aW9uLCBTdWJzY3JpcHRpb25FeGVjdXRvciwgU3Vic2NyaXB0aW9uRXZlbnQgfSBmcm9tICcuL2JhdGNoZWRfbXV0YXRpb25fc3Vic2NyaXB0aW9uJztcbmltcG9ydCB7IEVsZW1lbnRNYXRjaGVyLCBFbGVtZW50Q29sbGVjdG9yIH0gZnJvbSAnLi4vZWxlbWVudF9jb2xsZWN0b3InO1xuXG5leHBvcnQgY2xhc3MgRWxlbWVudE1hdGNoZXNTdWJzY3JpcHRpb24gZXh0ZW5kcyBCYXRjaGVkTXV0YXRpb25TdWJzY3JpcHRpb24ge1xuICAgIHJlYWRvbmx5IG1hdGNoZXI6IEVsZW1lbnRNYXRjaGVyO1xuXG4gICAgcHJpdmF0ZSBpc0Nvbm5lY3RlZDogYm9vbGVhbiA9IGZhbHNlO1xuICAgIHByaXZhdGUgaXNNYXRjaGluZ0VsZW1lbnQ6IGJvb2xlYW4gPSBmYWxzZTtcblxuICAgIGNvbnN0cnVjdG9yKGVsZW1lbnQ6IEVsZW1lbnQsIG1hdGNoZXI6IEVsZW1lbnRNYXRjaGVyLCBleGVjdXRvcjogU3Vic2NyaXB0aW9uRXhlY3V0b3IpIHtcbiAgICAgICAgc3VwZXIoZWxlbWVudCwgZXhlY3V0b3IpO1xuXG4gICAgICAgIHRoaXMubWF0Y2hlciA9IG1hdGNoZXI7XG4gICAgfVxuXG4gICAgY29ubmVjdCgpOiB2b2lkIHtcbiAgICAgICAgaWYoIXRoaXMuaXNDb25uZWN0ZWQpIHtcbiAgICAgICAgICAgIHRoaXMudXBkYXRlSXNNYXRjaGluZ0VsZW1lbnQodGhpcy5jb21wdXRlSXNNYXRjaGluZ0VsZW1lbnQoKSk7XG4gICAgICAgICAgICB0aGlzLnN0YXJ0TGlzdGVuaW5nKCk7XG5cbiAgICAgICAgICAgIHRoaXMuaXNDb25uZWN0ZWQgPSB0cnVlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZGlzY29ubmVjdCgpOiB2b2lkIHtcbiAgICAgICAgaWYodGhpcy5pc0Nvbm5lY3RlZCkge1xuICAgICAgICAgICAgdGhpcy5zdG9wTGlzdGVuaW5nKCk7XG4gICAgICAgICAgICB0aGlzLnVwZGF0ZUlzTWF0Y2hpbmdFbGVtZW50KGZhbHNlKTtcblxuICAgICAgICAgICAgdGhpcy5pc0Nvbm5lY3RlZCA9IGZhbHNlO1xuICAgICAgICB9ICAgICAgICBcbiAgICB9XG5cbiAgICBwcm90ZWN0ZWQgaGFuZGxlTXV0YXRpb25zKCk6IHZvaWQge1xuICAgICAgICB0aGlzLnVwZGF0ZUlzTWF0Y2hpbmdFbGVtZW50KHRoaXMuY29tcHV0ZUlzTWF0Y2hpbmdFbGVtZW50KCkpO1xuICAgIH1cblxuICAgIHByaXZhdGUgdXBkYXRlSXNNYXRjaGluZ0VsZW1lbnQoaXNNYXRjaGluZ0VsZW1lbnQ6IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgbGV0IHdhc01hdGNoaW5nRWxlbWVudCA9IHRoaXMuaXNNYXRjaGluZ0VsZW1lbnQ7XG4gICAgICAgIHRoaXMuaXNNYXRjaGluZ0VsZW1lbnQgPSBpc01hdGNoaW5nRWxlbWVudDtcblxuICAgICAgICBpZih3YXNNYXRjaGluZ0VsZW1lbnQgIT09IGlzTWF0Y2hpbmdFbGVtZW50KSB7XG4gICAgICAgICAgICBsZXQgZXZlbnQgPSBuZXcgRWxlbWVudE1hdGNoZXNDaGFuZ2VkRXZlbnQodGhpcywgaXNNYXRjaGluZ0VsZW1lbnQpO1xuXG4gICAgICAgICAgICB0aGlzLmV4ZWN1dG9yKGV2ZW50LCB0aGlzLmVsZW1lbnQpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBjb21wdXRlSXNNYXRjaGluZ0VsZW1lbnQoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiBFbGVtZW50Q29sbGVjdG9yLmlzTWF0Y2hpbmdFbGVtZW50KHRoaXMuZWxlbWVudCwgdGhpcy5tYXRjaGVyKTtcbiAgICB9XG59XG5cbmV4cG9ydCBjbGFzcyBFbGVtZW50TWF0Y2hlc0NoYW5nZWRFdmVudCBleHRlbmRzIFN1YnNjcmlwdGlvbkV2ZW50IHtcbiAgICByZWFkb25seSBpc01hdGNoaW5nOiBib29sZWFuO1xuXG4gICAgY29uc3RydWN0b3IoZWxlbWVudE1hdGNoZXNTdWJzY3JpcHRpb246IEVsZW1lbnRNYXRjaGVzU3Vic2NyaXB0aW9uLCBpc01hdGNoaW5nOiBib29sZWFuKSB7XG4gICAgICAgIHN1cGVyKGVsZW1lbnRNYXRjaGVzU3Vic2NyaXB0aW9uLCAnRWxlbWVudE1hdGNoZXNDaGFuZ2VkRXZlbnQnKTtcblxuICAgICAgICB0aGlzLmlzTWF0Y2hpbmcgPSBpc01hdGNoaW5nO1xuICAgIH1cbn1cblxuZXhwb3J0IHsgRWxlbWVudE1hdGNoZXIgfTtcbiIsImltcG9ydCB7IFN1YnNjcmlwdGlvbiwgU3Vic2NyaXB0aW9uRXhlY3V0b3IgfSBmcm9tICcuL3N1YnNjcmlwdGlvbic7XG5cbmV4cG9ydCB7IFN1YnNjcmlwdGlvbkV4ZWN1dG9yIH07XG5cbmV4cG9ydCBjbGFzcyBFdmVudFN1YnNjcmlwdGlvbiBleHRlbmRzIFN1YnNjcmlwdGlvbiB7XG4gICAgcmVhZG9ubHkgZXZlbnRNYXRjaGVyOiBFdmVudE1hdGNoZXI7XG4gICAgcmVhZG9ubHkgZXZlbnROYW1lczogc3RyaW5nW107XG5cbiAgICBwcml2YXRlIGlzQ29ubmVjdGVkIDogYm9vbGVhbiA9IGZhbHNlOyAgICBcbiAgICBwcml2YXRlIHJlYWRvbmx5IGV2ZW50TGlzdGVuZXI6IEV2ZW50TGlzdGVuZXI7XG5cbiAgICBjb25zdHJ1Y3RvcihlbGVtZW50OiBFbGVtZW50LCBldmVudE1hdGNoZXI6IEV2ZW50TWF0Y2hlciwgZXhlY3V0b3I6IFN1YnNjcmlwdGlvbkV4ZWN1dG9yKSB7XG4gICAgICAgIHN1cGVyKGVsZW1lbnQsIGV4ZWN1dG9yKTtcblxuICAgICAgICB0aGlzLmV2ZW50TWF0Y2hlciA9IGV2ZW50TWF0Y2hlcjtcbiAgICAgICAgdGhpcy5ldmVudE5hbWVzID0gdGhpcy5wYXJzZUV2ZW50TWF0Y2hlcih0aGlzLmV2ZW50TWF0Y2hlcik7XG5cbiAgICAgICAgdGhpcy5ldmVudExpc3RlbmVyID0gKGV2ZW50OiBFdmVudCk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgdGhpcy5oYW5kbGVFdmVudChldmVudCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBjb25uZWN0KCk6IHZvaWQge1xuICAgICAgICBpZighdGhpcy5pc0Nvbm5lY3RlZCkge1xuICAgICAgICAgICAgdGhpcy5pc0Nvbm5lY3RlZCA9IHRydWU7XG5cbiAgICAgICAgICAgIGZvcihsZXQgZXZlbnROYW1lIG9mIHRoaXMuZXZlbnROYW1lcykge1xuICAgICAgICAgICAgICAgIHRoaXMuZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKGV2ZW50TmFtZSwgdGhpcy5ldmVudExpc3RlbmVyLCBmYWxzZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBkaXNjb25uZWN0KCk6IHZvaWQge1xuICAgICAgICBpZih0aGlzLmlzQ29ubmVjdGVkKSB7XG4gICAgICAgICAgICBmb3IobGV0IGV2ZW50TmFtZSBvZiB0aGlzLmV2ZW50TmFtZXMpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmVsZW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcihldmVudE5hbWUsIHRoaXMuZXZlbnRMaXN0ZW5lciwgZmFsc2UpO1xuICAgICAgICAgICAgfSAgICAgICAgICAgIFxuXG4gICAgICAgICAgICB0aGlzLmlzQ29ubmVjdGVkID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGhhbmRsZUV2ZW50KGV2ZW50OiBFdmVudCk6IHZvaWQge1xuICAgICAgICB0aGlzLmV4ZWN1dG9yKGV2ZW50LCB0aGlzLmVsZW1lbnQpOyAgICAgICAgIFxuICAgIH1cblxuICAgIHByaXZhdGUgcGFyc2VFdmVudE1hdGNoZXIoZXZlbnRNYXRjaGVyOiBFdmVudE1hdGNoZXIpOiBzdHJpbmdbXSB7XG4gICAgICAgIC8vIFRPRE86IFN1cHBvcnQgYWxsIG9mIHRoZSBqUXVlcnkgc3R5bGUgZXZlbnQgb3B0aW9uc1xuICAgICAgICByZXR1cm4gZXZlbnRNYXRjaGVyLnNwbGl0KCcgJyk7XG4gICAgfSBcbn1cblxuZXhwb3J0IGRlY2xhcmUgdHlwZSBFdmVudE1hdGNoZXIgPSBzdHJpbmc7XG4iLCJpbXBvcnQgeyBCYXRjaGVkTXV0YXRpb25TdWJzY3JpcHRpb24sIFN1YnNjcmlwdGlvbkV4ZWN1dG9yLCBTdWJzY3JpcHRpb25FdmVudCB9IGZyb20gJy4vYmF0Y2hlZF9tdXRhdGlvbl9zdWJzY3JpcHRpb24nO1xuaW1wb3J0IHsgRWxlbWVudE1hdGNoZXIsIEVsZW1lbnRDb2xsZWN0b3IgfSBmcm9tICcuLi9lbGVtZW50X2NvbGxlY3Rvcic7XG5cbmV4cG9ydCB7IEVsZW1lbnRNYXRjaGVyIH07XG5cbmV4cG9ydCBjbGFzcyBNYXRjaGluZ0VsZW1lbnRzU3Vic2NyaXB0aW9uIGV4dGVuZHMgQmF0Y2hlZE11dGF0aW9uU3Vic2NyaXB0aW9uIHtcbiAgICByZWFkb25seSBtYXRjaGVyOiBFbGVtZW50TWF0Y2hlcjtcblxuICAgIHByaXZhdGUgaXNDb25uZWN0ZWQ6IGJvb2xlYW4gPSBmYWxzZTtcbiAgICBwcml2YXRlIG1hdGNoaW5nRWxlbWVudHM6IEVsZW1lbnRbXSA9IFtdO1xuXG4gICAgY29uc3RydWN0b3IoZWxlbWVudDogRWxlbWVudCwgbWF0Y2hlcjogRWxlbWVudE1hdGNoZXIsIGV4ZWN1dG9yOiBTdWJzY3JpcHRpb25FeGVjdXRvcikge1xuICAgICAgICBzdXBlcihlbGVtZW50LCBleGVjdXRvcik7XG5cbiAgICAgICAgdGhpcy5tYXRjaGVyID0gbWF0Y2hlcjtcbiAgICB9XG5cbiAgICBjb25uZWN0KCk6IHZvaWQge1xuICAgICAgICBpZighdGhpcy5pc0Nvbm5lY3RlZCkge1xuICAgICAgICAgICAgdGhpcy51cGRhdGVNYXRjaGluZ0VsZW1lbnRzKHRoaXMuY29sbGVjdE1hdGNoaW5nRWxlbWVudHMoKSk7XG4gICAgICAgICAgICB0aGlzLnN0YXJ0TGlzdGVuaW5nKCk7XG5cbiAgICAgICAgICAgIHRoaXMuaXNDb25uZWN0ZWQgPSB0cnVlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZGlzY29ubmVjdCgpOiB2b2lkIHtcbiAgICAgICAgaWYodGhpcy5pc0Nvbm5lY3RlZCkge1xuICAgICAgICAgICAgdGhpcy5zdG9wTGlzdGVuaW5nKCk7XG4gICAgICAgICAgICB0aGlzLnVwZGF0ZU1hdGNoaW5nRWxlbWVudHMoW10pO1xuXG4gICAgICAgICAgICB0aGlzLmlzQ29ubmVjdGVkID0gZmFsc2U7XG4gICAgICAgIH0gICAgICAgIFxuICAgIH1cblxuICAgIHByb3RlY3RlZCBoYW5kbGVNdXRhdGlvbnMoKTogdm9pZCB7XG4gICAgICAgIHRoaXMudXBkYXRlTWF0Y2hpbmdFbGVtZW50cyh0aGlzLmNvbGxlY3RNYXRjaGluZ0VsZW1lbnRzKCkpO1xuICAgIH1cblxuICAgIHByaXZhdGUgdXBkYXRlTWF0Y2hpbmdFbGVtZW50cyhtYXRjaGluZ0VsZW1lbnRzOiBFbGVtZW50W10pOiB2b2lkIHtcbiAgICAgICAgbGV0IHByZXZpb3VzbHlNYXRjaGluZ0VsZW1lbnRzID0gdGhpcy5tYXRjaGluZ0VsZW1lbnRzO1xuXG4gICAgICAgIGxldCBhZGRlZEVsZW1lbnRzID0gYXJyYXlTdWJ0cmFjdChtYXRjaGluZ0VsZW1lbnRzLCBwcmV2aW91c2x5TWF0Y2hpbmdFbGVtZW50cyk7XG4gICAgICAgIGxldCByZW1vdmVkRWxlbWVudHMgPSBhcnJheVN1YnRyYWN0KHByZXZpb3VzbHlNYXRjaGluZ0VsZW1lbnRzLCBtYXRjaGluZ0VsZW1lbnRzKTtcblxuICAgICAgICB0aGlzLm1hdGNoaW5nRWxlbWVudHMgPSBtYXRjaGluZ0VsZW1lbnRzOyAgIFxuICAgICAgICBcbiAgICAgICAgaWYoYWRkZWRFbGVtZW50cy5sZW5ndGggPiAwIHx8IHJlbW92ZWRFbGVtZW50cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBsZXQgZXZlbnQgPSBuZXcgTWF0Y2hpbmdFbGVtZW50c0NoYW5nZWRFdmVudCh0aGlzLCBhZGRlZEVsZW1lbnRzLCByZW1vdmVkRWxlbWVudHMpO1xuXG4gICAgICAgICAgICB0aGlzLmV4ZWN1dG9yKGV2ZW50LCB0aGlzLmVsZW1lbnQpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBjb2xsZWN0TWF0Y2hpbmdFbGVtZW50cygpOiBFbGVtZW50W10ge1xuICAgICAgICByZXR1cm4gRWxlbWVudENvbGxlY3Rvci5jb2xsZWN0TWF0Y2hpbmdFbGVtZW50cyh0aGlzLmVsZW1lbnQsIHRoaXMubWF0Y2hlcik7XG4gICAgfVxufVxuXG5leHBvcnQgY2xhc3MgTWF0Y2hpbmdFbGVtZW50c0NoYW5nZWRFdmVudCBleHRlbmRzIFN1YnNjcmlwdGlvbkV2ZW50IHtcbiAgICByZWFkb25seSBhZGRlZEVsZW1lbnRzOiBFbGVtZW50W107XG4gICAgcmVhZG9ubHkgcmVtb3ZlZEVsZW1lbnRzOiBFbGVtZW50W107XG5cbiAgICBjb25zdHJ1Y3RvcihtYXRjaGluZ0VsZW1lbnRzU3Vic2NyaXB0aW9uOiBNYXRjaGluZ0VsZW1lbnRzU3Vic2NyaXB0aW9uLCBhZGRlZEVsZW1lbnRzOiBFbGVtZW50W10sIHJlbW92ZWRFbGVtZW50czogRWxlbWVudFtdKSB7XG4gICAgICAgIHN1cGVyKG1hdGNoaW5nRWxlbWVudHNTdWJzY3JpcHRpb24sICdNYXRjaGluZ0VsZW1lbnRzQ2hhbmdlZCcpO1xuXG4gICAgICAgIHRoaXMuYWRkZWRFbGVtZW50cyA9IGFkZGVkRWxlbWVudHM7XG4gICAgICAgIHRoaXMucmVtb3ZlZEVsZW1lbnRzID0gcmVtb3ZlZEVsZW1lbnRzO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gYXJyYXlTdWJ0cmFjdDxUPihtaW51ZW5kOiBUW10sIHN1YnRyYWhlbmQ6IFRbXSk6IFRbXSB7XG4gICAgbGV0IGRpZmZlcmVuY2U6IFRbXSA9IFtdO1xuXG4gICAgZm9yKGxldCBtZW1iZXIgb2YgbWludWVuZCkge1xuICAgICAgICBpZihzdWJ0cmFoZW5kLmluZGV4T2YobWVtYmVyKSA9PT0gLTEpIHtcbiAgICAgICAgICAgIGRpZmZlcmVuY2UucHVzaChtZW1iZXIpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGRpZmZlcmVuY2U7XG59IiwiZXhwb3J0IGFic3RyYWN0IGNsYXNzIFN1YnNjcmlwdGlvbiB7XG4gICAgcmVhZG9ubHkgZXhlY3V0b3I6IFN1YnNjcmlwdGlvbkV4ZWN1dG9yO1xuICAgIHJlYWRvbmx5IGVsZW1lbnQ6IEVsZW1lbnQ7XG4gICAgXG4gICAgY29uc3RydWN0b3IoZWxlbWVudDogRWxlbWVudCwgZXhlY3V0b3I6IFN1YnNjcmlwdGlvbkV4ZWN1dG9yKSB7XG4gICAgICAgIHRoaXMuZWxlbWVudCA9IGVsZW1lbnQ7XG4gICAgICAgIHRoaXMuZXhlY3V0b3IgPSBleGVjdXRvcjtcbiAgICB9XG5cbiAgICBhYnN0cmFjdCBjb25uZWN0KCkgOiB2b2lkO1xuICAgIGFic3RyYWN0IGRpc2Nvbm5lY3QoKSA6IHZvaWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3Vic2NyaXB0aW9uRXhlY3V0b3IgeyBcbiAgICAoZXZlbnQ6IEV2ZW50IHwgU3Vic2NyaXB0aW9uRXZlbnQsIGVsZW1lbnQ6IEVsZW1lbnQpOiB2b2lkIFxufVxuXG5leHBvcnQgY2xhc3MgU3Vic2NyaXB0aW9uRXZlbnQge1xuICAgIHJlYWRvbmx5IHN1YnNjcmlwdGlvbjogU3Vic2NyaXB0aW9uO1xuICAgIHJlYWRvbmx5IG5hbWU6IHN0cmluZztcblxuICAgIGNvbnN0cnVjdG9yKHN1YnNjcmlwdGlvbjogU3Vic2NyaXB0aW9uLCBuYW1lOiBzdHJpbmcpIHtcbiAgICAgICAgdGhpcy5zdWJzY3JpcHRpb24gPSBzdWJzY3JpcHRpb247XG4gICAgICAgIHRoaXMubmFtZSA9IG5hbWU7XG4gICAgfVxufVxuIiwiaW1wb3J0IHsgU3Vic2NyaXB0aW9uLCBTdWJzY3JpcHRpb25FeGVjdXRvciwgU3Vic2NyaXB0aW9uRXZlbnQgfSBmcm9tICcuL3N1YnNjcmlwdGlvbic7XG5cbmV4cG9ydCB7IFN1YnNjcmlwdGlvbkV4ZWN1dG9yIH07XG5cbmV4cG9ydCBpbnRlcmZhY2UgVHJpdmlhbFN1YnNjcmlwdGlvbkNvbmZpZ3VyYXRpb24ge1xuICAgIGNvbm5lY3RlZD86IGJvb2xlYW4sXG4gICAgZGlzY29ubmVjdGVkPzogYm9vbGVhblxufVxuXG5leHBvcnQgY2xhc3MgRWxlbWVudENvbm5lY3Rpb25DaGFuZ2VkRXZlbnQgZXh0ZW5kcyBTdWJzY3JpcHRpb25FdmVudCB7XG4gICAgcmVhZG9ubHkgZWxlbWVudDogRWxlbWVudDtcbiAgICByZWFkb25seSBpc0Nvbm5lY3RlZDogYm9vbGVhbjtcblxuICAgIGNvbnN0cnVjdG9yKHRyaXZpYWxTdWJzY3JpcHRpb246IFRyaXZpYWxTdWJzY3JpcHRpb24sIGVsZW1lbnQ6IEVsZW1lbnQsIGlzQ29ubmVjdGVkOiBib29sZWFuKSB7XG4gICAgICAgIHN1cGVyKHRyaXZpYWxTdWJzY3JpcHRpb24sICdFbGVtZW50Q29ubmVjdGVkJyk7XG5cbiAgICAgICAgdGhpcy5lbGVtZW50ID0gZWxlbWVudDtcbiAgICAgICAgdGhpcy5pc0Nvbm5lY3RlZCA9IGlzQ29ubmVjdGVkO1xuICAgIH1cbn1cblxuZXhwb3J0IGNsYXNzIFRyaXZpYWxTdWJzY3JpcHRpb24gZXh0ZW5kcyBTdWJzY3JpcHRpb24ge1xuICAgIHByaXZhdGUgaXNDb25uZWN0ZWQ6IGJvb2xlYW4gPSBmYWxzZTtcbiAgICBwcml2YXRlIGNvbmZpZzogVHJpdmlhbFN1YnNjcmlwdGlvbkNvbmZpZ3VyYXRpb247XG5cbiAgICBjb25zdHJ1Y3RvcihlbGVtZW50OiBFbGVtZW50LCBjb25maWc6IFRyaXZpYWxTdWJzY3JpcHRpb25Db25maWd1cmF0aW9uLCBleGVjdXRvcjogU3Vic2NyaXB0aW9uRXhlY3V0b3IpIHtcbiAgICAgICAgc3VwZXIoZWxlbWVudCwgZXhlY3V0b3IpO1xuXG4gICAgICAgIHRoaXMuY29uZmlnID0gY29uZmlnO1xuICAgIH1cblxuICAgIGNvbm5lY3QoKSB7XG4gICAgICAgIGlmKCF0aGlzLmlzQ29ubmVjdGVkKSB7XG4gICAgICAgICAgICB0aGlzLmlzQ29ubmVjdGVkID0gdHJ1ZTtcblxuICAgICAgICAgICAgaWYodGhpcy5jb25maWcuY29ubmVjdGVkKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5leGVjdXRvcih0aGlzLmJ1aWxkRWxlbWVudENvbm5lY3Rpb25DaGFuZ2VkRXZlbnQoKSwgdGhpcy5lbGVtZW50KTsgXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBkaXNjb25uZWN0KCkge1xuICAgICAgICBpZih0aGlzLmlzQ29ubmVjdGVkKSB7XG4gICAgICAgICAgICB0aGlzLmlzQ29ubmVjdGVkID0gZmFsc2U7XG5cbiAgICAgICAgICAgIGlmKHRoaXMuY29uZmlnLmRpc2Nvbm5lY3RlZCkge1xuICAgICAgICAgICAgICAgIHRoaXMuZXhlY3V0b3IodGhpcy5idWlsZEVsZW1lbnRDb25uZWN0aW9uQ2hhbmdlZEV2ZW50KCksIHRoaXMuZWxlbWVudCk7ICAgICBcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICBcbiAgICBwcml2YXRlIGJ1aWxkRWxlbWVudENvbm5lY3Rpb25DaGFuZ2VkRXZlbnQoKTogRWxlbWVudENvbm5lY3Rpb25DaGFuZ2VkRXZlbnQge1xuICAgICAgICByZXR1cm4gbmV3IEVsZW1lbnRDb25uZWN0aW9uQ2hhbmdlZEV2ZW50KHRoaXMsIHRoaXMuZWxlbWVudCwgdGhpcy5pc0Nvbm5lY3RlZCk7XG4gICAgfVxufSJdfQ==
