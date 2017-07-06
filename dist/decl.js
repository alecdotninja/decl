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
        return this.defaultInstance || (this.defaultInstance = new Decl(window.document));
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
exports.default = Decl;

},{"./scope":11}],3:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var Declaration = (function () {
    function Declaration(node) {
        this.isActivated = false;
        this.node = node;
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
    function MatchDeclaration(node, executor) {
        var _this = _super.call(this, node) || this;
        _this.executor = executor;
        _this.subscription = new trivial_subscription_1.TrivialSubscription(_this.node, { connected: true }, _this.executor);
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
    function OnDeclaration(node, matcher, executor) {
        var _this = _super.call(this, node) || this;
        _this.matcher = matcher;
        _this.executor = executor;
        _this.subscription = new event_subscription_1.EventSubscription(_this.node, _this.matcher, _this.executor);
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

},{"../subscriptions/event_subscription":13,"./declaration":3}],6:[function(require,module,exports){
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
    ScopeTrackingDeclaration.prototype.addChildScopeByNode = function (node, executor) {
        var childScope = new scope_1.Scope(node, executor);
        this.addChildScope(childScope);
    };
    ScopeTrackingDeclaration.prototype.removeChildScopeByNode = function (node) {
        for (var _i = 0, _a = this.childScopes; _i < _a.length; _i++) {
            var childScope = _a[_i];
            if (childScope.getNode() === node) {
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
var matching_nodes_subscription_1 = require("../subscriptions/matching_nodes_subscription");
var SelectDeclaration = (function (_super) {
    __extends(SelectDeclaration, _super);
    function SelectDeclaration(node, matcher, executor) {
        var _this = _super.call(this, node) || this;
        _this.matcher = matcher;
        _this.executor = executor;
        _this.subscription = new matching_nodes_subscription_1.MatchingNodesSubscription(_this.node, _this.matcher, function (event) {
            for (var _i = 0, _a = event.addedNodes; _i < _a.length; _i++) {
                var node_1 = _a[_i];
                _this.addChildScopeByNode(node_1, _this.executor);
            }
            for (var _b = 0, _c = event.removedNodes; _b < _c.length; _b++) {
                var node_2 = _c[_b];
                _this.removeChildScopeByNode(node_2);
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

},{"../subscriptions/matching_nodes_subscription":14,"./scope_tracking_declaration":6}],8:[function(require,module,exports){
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
    function UnmatchDeclaration(node, executor) {
        var _this = _super.call(this, node) || this;
        _this.executor = executor;
        _this.subscription = new trivial_subscription_1.TrivialSubscription(_this.node, { disconnected: true }, _this.executor);
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
var node_matches_subscription_1 = require("../subscriptions/node_matches_subscription");
var WhenDeclaration = (function (_super) {
    __extends(WhenDeclaration, _super);
    function WhenDeclaration(node, matcher, executor) {
        var _this = _super.call(this, node) || this;
        _this.matcher = matcher;
        _this.executor = executor;
        _this.subscription = new node_matches_subscription_1.NodeMatchesSubscription(_this.node, _this.matcher, function (event) {
            if (event.isMatching) {
                _this.addChildScopeByNode(_this.node, _this.executor);
            }
            else {
                _this.removeChildScopeByNode(_this.node);
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

},{"../subscriptions/node_matches_subscription":15,"./scope_tracking_declaration":6}],10:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var NodeCollector = (function () {
    function NodeCollector() {
    }
    NodeCollector.isMatchingNode = function (rootNode, nodeMatcher) {
        return this.getInstance().isMatchingNode(rootNode, nodeMatcher);
    };
    NodeCollector.collectMatchingNodes = function (rootNode, nodeMatcher) {
        return this.getInstance().collectMatchingNodes(rootNode, nodeMatcher);
    };
    NodeCollector.getInstance = function () {
        return this.instance || (this.instance = new NodeCollector());
    };
    NodeCollector.prototype.isMatchingNode = function (node, nodeMatcher) {
        switch (typeof (nodeMatcher)) {
            default:
                throw new TypeError(NodeCollector.ELEMENT_MATCHER_TYPE_ERROR_MESSAGE);
            case 'string':
                var cssSelector = nodeMatcher;
                return this.isMatchingNodeFromCssSelector(node, cssSelector);
            case 'object':
                var object = nodeMatcher;
                return this.isMatchingNodeFromObject(node, object);
            case 'function':
                var nodeVistor = nodeMatcher;
                return this.isMatchingNodeFromNodeVistor(node, nodeVistor);
        }
    };
    NodeCollector.prototype.collectMatchingNodes = function (node, nodeMatcher) {
        switch (typeof (nodeMatcher)) {
            default:
                throw new TypeError(NodeCollector.ELEMENT_MATCHER_TYPE_ERROR_MESSAGE);
            case 'string':
                var cssSelector = nodeMatcher;
                return this.collectMatchingNodesFromCssSelector(node, cssSelector);
            case 'object':
                var object = nodeMatcher;
                return this.collectMatchingNodesFromObject(node, object);
            case 'function':
                var nodeVistor = nodeMatcher;
                return this.collectMatchingNodesFromNodeVistor(node, nodeVistor);
        }
    };
    NodeCollector.prototype.isMatchingNodeFromCssSelector = function (node, cssSelector) {
        if (node instanceof Element && typeof (node.matches) === 'function') {
            return node.matches(cssSelector);
        }
        else {
            return isMemberOfArrayLike(node.ownerDocument.querySelectorAll(cssSelector), node);
        }
    };
    NodeCollector.prototype.isMatchingNodeFromObject = function (node, object) {
        if (object === null) {
            return false;
        }
        else {
            if (isArrayLike(object)) {
                var arrayLike = object;
                if (arrayLike.length === 0 || arrayLike[0] instanceof Node) {
                    return isMemberOfArrayLike(arrayLike, node);
                }
                else {
                    throw new TypeError(NodeCollector.ELEMENT_MATCHER_TYPE_ERROR_MESSAGE);
                }
            }
            else {
                throw new TypeError(NodeCollector.ELEMENT_MATCHER_TYPE_ERROR_MESSAGE);
            }
        }
    };
    NodeCollector.prototype.isMatchingNodeFromNodeVistor = function (node, nodeVistor) {
        var visitorResult = nodeVistor(node);
        if (typeof (visitorResult) === 'boolean') {
            var isMatch = visitorResult;
            return isMatch;
        }
        else {
            var nodeMatcher = visitorResult;
            return this.isMatchingNode(node, nodeMatcher);
        }
    };
    NodeCollector.prototype.collectMatchingNodesFromCssSelector = function (node, cssSelector) {
        if (node instanceof Element || node instanceof Document || node instanceof DocumentFragment) {
            return toArray(node.querySelectorAll(cssSelector));
        }
        else {
            return [];
        }
    };
    NodeCollector.prototype.collectMatchingNodesFromObject = function (_node, object) {
        if (object === null) {
            return [];
        }
        else {
            if (isArrayLike(object)) {
                var arrayLike = object;
                if (arrayLike.length === 0 || arrayLike[0] instanceof Node) {
                    return toArray(arrayLike);
                }
                else {
                    throw new TypeError(NodeCollector.ELEMENT_MATCHER_TYPE_ERROR_MESSAGE);
                }
            }
            else {
                throw new TypeError(NodeCollector.ELEMENT_MATCHER_TYPE_ERROR_MESSAGE);
            }
        }
    };
    NodeCollector.prototype.collectMatchingNodesFromNodeVistor = function (node, nodeVistor) {
        var nodes = [];
        var childNodes = node.childNodes;
        for (var index = 0, length_1 = childNodes.length; index < length_1; index++) {
            var child = childNodes[index];
            if (child instanceof Node) {
                var node_1 = child;
                var visitorResult = nodeVistor(node_1);
                if (typeof (visitorResult) === 'boolean') {
                    var isMatch = visitorResult;
                    if (isMatch) {
                        nodes.push(node_1);
                    }
                }
                else {
                    nodes.push.apply(nodes, this.collectMatchingNodes(node_1, visitorResult));
                }
            }
        }
        return nodes;
    };
    return NodeCollector;
}());
NodeCollector.ELEMENT_MATCHER_TYPE_ERROR_MESSAGE = "Decl: An `NodeMatcher` must be a CSS selector (string) or a function which takes a node under consideration and returns a CSS selector (string) that matches all matching nodes in the subtree, an array-like object of matching nodes in the subtree, or a boolean value as to whether the node should be included (in this case, the function will be invoked again for all children of the node).";
exports.NodeCollector = NodeCollector;
exports.default = NodeCollector;
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
    function Scope(node, executor) {
        this.executors = [];
        this.isActivated = false;
        this.declarations = [];
        this.node = node;
        if (executor) {
            this.addExecutor(executor);
        }
    }
    Scope.buildRootScope = function (node) {
        var scope = new Scope(node);
        scope.activate();
        return scope;
    };
    Scope.prototype.addExecutor = function (executor) {
        this.executors.push(executor);
        return executor.call(this, this, this.node);
    };
    Scope.prototype.getNode = function () {
        return this.node;
    };
    Scope.prototype.getDeclarations = function () {
        return this.declarations;
    };
    Scope.prototype.inspect = function (includeSource) {
        console.groupCollapsed(this.node);
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
        this.addDeclaration(new match_declaration_1.MatchDeclaration(this.node, executor));
        return this;
    };
    Scope.prototype.unmatch = function (executor) {
        this.addDeclaration(new unmatch_declaration_1.UnmatchDeclaration(this.node, executor));
        return this;
    };
    Scope.prototype.select = function (matcher, executor) {
        this.addDeclaration(new select_declaration_1.SelectDeclaration(this.node, matcher, executor));
        return this;
    };
    Scope.prototype.when = function (matcher, executor) {
        this.addDeclaration(new when_declaration_1.WhenDeclaration(this.node, matcher, executor));
        return this;
    };
    Scope.prototype.on = function (eventMatcher, executorOrNodeMatcher, maybeExecutor) {
        var argumentsCount = arguments.length;
        switch (argumentsCount) {
            case 2:
                return this.onWithTwoArguments(eventMatcher, executorOrNodeMatcher);
            case 3:
                return this.onWithThreeArguments(eventMatcher, executorOrNodeMatcher, maybeExecutor);
            default:
                throw new TypeError("Failed to execute 'on' on 'Scope': 2 or 3 arguments required, but " + argumentsCount + " present.");
        }
    };
    Scope.prototype.onWithTwoArguments = function (eventMatcher, executor) {
        this.addDeclaration(new on_declaration_1.OnDeclaration(this.node, eventMatcher, executor));
        return this;
    };
    Scope.prototype.onWithThreeArguments = function (eventMatcher, nodeMatcher, executor) {
        this.select(nodeMatcher, function (scope) {
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
    function BatchedMutationSubscription(node, executor) {
        var _this = _super.call(this, node, executor) || this;
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
            this.mutationObserver.observe(this.node, BatchedMutationSubscription.mutationObserverInit);
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
var subscription_1 = require("./subscription");
var EventSubscription = (function (_super) {
    __extends(EventSubscription, _super);
    function EventSubscription(node, eventMatcher, executor) {
        var _this = _super.call(this, node, executor) || this;
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
                this.node.addEventListener(eventName, this.eventListener, false);
            }
        }
    };
    EventSubscription.prototype.disconnect = function () {
        if (this.isConnected) {
            for (var _i = 0, _a = this.eventNames; _i < _a.length; _i++) {
                var eventName = _a[_i];
                this.node.removeEventListener(eventName, this.eventListener, false);
            }
            this.isConnected = false;
        }
    };
    EventSubscription.prototype.handleEvent = function (event) {
        this.executor(event, this.node);
    };
    EventSubscription.prototype.parseEventMatcher = function (eventMatcher) {
        // TODO: Support all of the jQuery style event options
        return eventMatcher.split(' ');
    };
    return EventSubscription;
}(subscription_1.Subscription));
exports.EventSubscription = EventSubscription;

},{"./subscription":16}],14:[function(require,module,exports){
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
var node_collector_1 = require("../node_collector");
var MatchingNodesSubscription = (function (_super) {
    __extends(MatchingNodesSubscription, _super);
    function MatchingNodesSubscription(node, matcher, executor) {
        var _this = _super.call(this, node, executor) || this;
        _this.isConnected = false;
        _this.matchingNodes = [];
        _this.matcher = matcher;
        return _this;
    }
    MatchingNodesSubscription.prototype.connect = function () {
        if (!this.isConnected) {
            this.updateMatchingNode(this.collectMatchingNodes());
            this.startListening();
            this.isConnected = true;
        }
    };
    MatchingNodesSubscription.prototype.disconnect = function () {
        if (this.isConnected) {
            this.stopListening();
            this.updateMatchingNode([]);
            this.isConnected = false;
        }
    };
    MatchingNodesSubscription.prototype.handleMutations = function () {
        this.updateMatchingNode(this.collectMatchingNodes());
    };
    MatchingNodesSubscription.prototype.updateMatchingNode = function (matchingNodes) {
        var previouslyMatchingNodes = this.matchingNodes;
        var addedNodes = arraySubtract(matchingNodes, previouslyMatchingNodes);
        var removedNodes = arraySubtract(previouslyMatchingNodes, matchingNodes);
        this.matchingNodes = matchingNodes;
        if (addedNodes.length > 0 || removedNodes.length > 0) {
            var event_1 = new MatchingNodesChangedEvent(this, addedNodes, removedNodes);
            this.executor(event_1, this.node);
        }
    };
    MatchingNodesSubscription.prototype.collectMatchingNodes = function () {
        return node_collector_1.NodeCollector.collectMatchingNodes(this.node, this.matcher);
    };
    return MatchingNodesSubscription;
}(batched_mutation_subscription_1.BatchedMutationSubscription));
exports.MatchingNodesSubscription = MatchingNodesSubscription;
var MatchingNodesChangedEvent = (function (_super) {
    __extends(MatchingNodesChangedEvent, _super);
    function MatchingNodesChangedEvent(matchingNodesSubscription, addedNodes, removedNodes) {
        var _this = _super.call(this, matchingNodesSubscription, 'MatchingNodesChanged') || this;
        _this.addedNodes = addedNodes;
        _this.removedNodes = removedNodes;
        return _this;
    }
    return MatchingNodesChangedEvent;
}(batched_mutation_subscription_1.SubscriptionEvent));
exports.MatchingNodesChangedEvent = MatchingNodesChangedEvent;
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

},{"../node_collector":10,"./batched_mutation_subscription":12}],15:[function(require,module,exports){
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
var node_collector_1 = require("../node_collector");
var NodeMatchesSubscription = (function (_super) {
    __extends(NodeMatchesSubscription, _super);
    function NodeMatchesSubscription(node, matcher, executor) {
        var _this = _super.call(this, node, executor) || this;
        _this.isConnected = false;
        _this.isMatchingNode = false;
        _this.matcher = matcher;
        return _this;
    }
    NodeMatchesSubscription.prototype.connect = function () {
        if (!this.isConnected) {
            this.updateIsMatchingNode(this.computeIsMatchingNode());
            this.startListening();
            this.isConnected = true;
        }
    };
    NodeMatchesSubscription.prototype.disconnect = function () {
        if (this.isConnected) {
            this.stopListening();
            this.updateIsMatchingNode(false);
            this.isConnected = false;
        }
    };
    NodeMatchesSubscription.prototype.handleMutations = function () {
        this.updateIsMatchingNode(this.computeIsMatchingNode());
    };
    NodeMatchesSubscription.prototype.updateIsMatchingNode = function (isMatchingNode) {
        var wasMatchingNode = this.isMatchingNode;
        this.isMatchingNode = isMatchingNode;
        if (wasMatchingNode !== isMatchingNode) {
            var event_1 = new NodeMatchesChangedEvent(this, isMatchingNode);
            this.executor(event_1, this.node);
        }
    };
    NodeMatchesSubscription.prototype.computeIsMatchingNode = function () {
        return node_collector_1.NodeCollector.isMatchingNode(this.node, this.matcher);
    };
    return NodeMatchesSubscription;
}(batched_mutation_subscription_1.BatchedMutationSubscription));
exports.NodeMatchesSubscription = NodeMatchesSubscription;
var NodeMatchesChangedEvent = (function (_super) {
    __extends(NodeMatchesChangedEvent, _super);
    function NodeMatchesChangedEvent(nodeMatchesSubscription, isMatching) {
        var _this = _super.call(this, nodeMatchesSubscription, 'NodeMatchesChangedEvent') || this;
        _this.isMatching = isMatching;
        return _this;
    }
    return NodeMatchesChangedEvent;
}(batched_mutation_subscription_1.SubscriptionEvent));
exports.NodeMatchesChangedEvent = NodeMatchesChangedEvent;

},{"../node_collector":10,"./batched_mutation_subscription":12}],16:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var Subscription = (function () {
    function Subscription(node, executor) {
        this.node = node;
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
var NodeConnectionChangedEvent = (function (_super) {
    __extends(NodeConnectionChangedEvent, _super);
    function NodeConnectionChangedEvent(trivialSubscription, node, isConnected) {
        var _this = _super.call(this, trivialSubscription, 'NodeConnected') || this;
        _this.node = node;
        _this.isConnected = isConnected;
        return _this;
    }
    return NodeConnectionChangedEvent;
}(subscription_1.SubscriptionEvent));
exports.NodeConnectionChangedEvent = NodeConnectionChangedEvent;
var TrivialSubscription = (function (_super) {
    __extends(TrivialSubscription, _super);
    function TrivialSubscription(node, config, executor) {
        var _this = _super.call(this, node, executor) || this;
        _this.isConnected = false;
        _this.config = config;
        return _this;
    }
    TrivialSubscription.prototype.connect = function () {
        if (!this.isConnected) {
            this.isConnected = true;
            if (this.config.connected) {
                this.executor(this.buildNodeConnectionChangedEvent(), this.node);
            }
        }
    };
    TrivialSubscription.prototype.disconnect = function () {
        if (this.isConnected) {
            this.isConnected = false;
            if (this.config.disconnected) {
                this.executor(this.buildNodeConnectionChangedEvent(), this.node);
            }
        }
    };
    TrivialSubscription.prototype.buildNodeConnectionChangedEvent = function () {
        return new NodeConnectionChangedEvent(this, this.node, this.isConnected);
    };
    return TrivialSubscription;
}(subscription_1.Subscription));
exports.TrivialSubscription = TrivialSubscription;

},{"./subscription":16}]},{},[2])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvbXV0YXRpb24tb2JzZXJ2ZXIvaW5kZXguanMiLCJzcmMvZGVjbC50cyIsInNyYy9kZWNsYXJhdGlvbnMvZGVjbGFyYXRpb24udHMiLCJzcmMvZGVjbGFyYXRpb25zL21hdGNoX2RlY2xhcmF0aW9uLnRzIiwic3JjL2RlY2xhcmF0aW9ucy9vbl9kZWNsYXJhdGlvbi50cyIsInNyYy9kZWNsYXJhdGlvbnMvc2NvcGVfdHJhY2tpbmdfZGVjbGFyYXRpb24udHMiLCJzcmMvZGVjbGFyYXRpb25zL3NlbGVjdF9kZWNsYXJhdGlvbi50cyIsInNyYy9kZWNsYXJhdGlvbnMvdW5tYXRjaF9kZWNsYXJhdGlvbi50cyIsInNyYy9kZWNsYXJhdGlvbnMvd2hlbl9kZWNsYXJhdGlvbi50cyIsInNyYy9ub2RlX2NvbGxlY3Rvci50cyIsInNyYy9zY29wZS50cyIsInNyYy9zdWJzY3JpcHRpb25zL2JhdGNoZWRfbXV0YXRpb25fc3Vic2NyaXB0aW9uLnRzIiwic3JjL3N1YnNjcmlwdGlvbnMvZXZlbnRfc3Vic2NyaXB0aW9uLnRzIiwic3JjL3N1YnNjcmlwdGlvbnMvbWF0Y2hpbmdfbm9kZXNfc3Vic2NyaXB0aW9uLnRzIiwic3JjL3N1YnNjcmlwdGlvbnMvbm9kZV9tYXRjaGVzX3N1YnNjcmlwdGlvbi50cyIsInNyYy9zdWJzY3JpcHRpb25zL3N1YnNjcmlwdGlvbi50cyIsInNyYy9zdWJzY3JpcHRpb25zL3RyaXZpYWxfc3Vic2NyaXB0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7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QyxJQUFJLENBQUMsK0JBQStCLEVBQUUsRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDckUsQ0FBQztRQUNMLENBQUM7SUFDTCxDQUFDO0lBRUQsd0NBQVUsR0FBVjtRQUNJLEVBQUUsQ0FBQSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDO1lBQ2xCLElBQUksQ0FBQyxXQUFXLEdBQUcsS0FBSyxDQUFDO1lBRXpCLEVBQUUsQ0FBQSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQztnQkFDMUIsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsK0JBQStCLEVBQUUsRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDckUsQ0FBQztRQUNMLENBQUM7SUFDTCxDQUFDO0lBRU8sNkRBQStCLEdBQXZDO1FBQ0ksTUFBTSxDQUFDLElBQUksMEJBQTBCLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDO0lBQzdFLENBQUM7SUFDTCwwQkFBQztBQUFELENBakNBLEFBaUNDLENBakN3QywyQkFBWSxHQWlDcEQ7QUFqQ1ksa0RBQW1CIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsInZhciBNdXRhdGlvbk9ic2VydmVyID0gd2luZG93Lk11dGF0aW9uT2JzZXJ2ZXJcbiAgfHwgd2luZG93LldlYktpdE11dGF0aW9uT2JzZXJ2ZXJcbiAgfHwgd2luZG93Lk1vek11dGF0aW9uT2JzZXJ2ZXI7XG5cbi8qXG4gKiBDb3B5cmlnaHQgMjAxMiBUaGUgUG9seW1lciBBdXRob3JzLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogVXNlIG9mIHRoaXMgc291cmNlIGNvZGUgaXMgZ292ZXJlbmVkIGJ5IGEgQlNELXN0eWxlXG4gKiBsaWNlbnNlIHRoYXQgY2FuIGJlIGZvdW5kIGluIHRoZSBMSUNFTlNFIGZpbGUuXG4gKi9cblxudmFyIFdlYWtNYXAgPSB3aW5kb3cuV2Vha01hcDtcblxuaWYgKHR5cGVvZiBXZWFrTWFwID09PSAndW5kZWZpbmVkJykge1xuICB2YXIgZGVmaW5lUHJvcGVydHkgPSBPYmplY3QuZGVmaW5lUHJvcGVydHk7XG4gIHZhciBjb3VudGVyID0gRGF0ZS5ub3coKSAlIDFlOTtcblxuICBXZWFrTWFwID0gZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5uYW1lID0gJ19fc3QnICsgKE1hdGgucmFuZG9tKCkgKiAxZTkgPj4+IDApICsgKGNvdW50ZXIrKyArICdfXycpO1xuICB9O1xuXG4gIFdlYWtNYXAucHJvdG90eXBlID0ge1xuICAgIHNldDogZnVuY3Rpb24oa2V5LCB2YWx1ZSkge1xuICAgICAgdmFyIGVudHJ5ID0ga2V5W3RoaXMubmFtZV07XG4gICAgICBpZiAoZW50cnkgJiYgZW50cnlbMF0gPT09IGtleSlcbiAgICAgICAgZW50cnlbMV0gPSB2YWx1ZTtcbiAgICAgIGVsc2VcbiAgICAgICAgZGVmaW5lUHJvcGVydHkoa2V5LCB0aGlzLm5hbWUsIHt2YWx1ZTogW2tleSwgdmFsdWVdLCB3cml0YWJsZTogdHJ1ZX0pO1xuICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSxcbiAgICBnZXQ6IGZ1bmN0aW9uKGtleSkge1xuICAgICAgdmFyIGVudHJ5O1xuICAgICAgcmV0dXJuIChlbnRyeSA9IGtleVt0aGlzLm5hbWVdKSAmJiBlbnRyeVswXSA9PT0ga2V5ID9cbiAgICAgICAgICBlbnRyeVsxXSA6IHVuZGVmaW5lZDtcbiAgICB9LFxuICAgICdkZWxldGUnOiBmdW5jdGlvbihrZXkpIHtcbiAgICAgIHZhciBlbnRyeSA9IGtleVt0aGlzLm5hbWVdO1xuICAgICAgaWYgKCFlbnRyeSkgcmV0dXJuIGZhbHNlO1xuICAgICAgdmFyIGhhc1ZhbHVlID0gZW50cnlbMF0gPT09IGtleTtcbiAgICAgIGVudHJ5WzBdID0gZW50cnlbMV0gPSB1bmRlZmluZWQ7XG4gICAgICByZXR1cm4gaGFzVmFsdWU7XG4gICAgfSxcbiAgICBoYXM6IGZ1bmN0aW9uKGtleSkge1xuICAgICAgdmFyIGVudHJ5ID0ga2V5W3RoaXMubmFtZV07XG4gICAgICBpZiAoIWVudHJ5KSByZXR1cm4gZmFsc2U7XG4gICAgICByZXR1cm4gZW50cnlbMF0gPT09IGtleTtcbiAgICB9XG4gIH07XG59XG5cbnZhciByZWdpc3RyYXRpb25zVGFibGUgPSBuZXcgV2Vha01hcCgpO1xuXG4vLyBXZSB1c2Ugc2V0SW1tZWRpYXRlIG9yIHBvc3RNZXNzYWdlIGZvciBvdXIgZnV0dXJlIGNhbGxiYWNrLlxudmFyIHNldEltbWVkaWF0ZSA9IHdpbmRvdy5tc1NldEltbWVkaWF0ZTtcblxuLy8gVXNlIHBvc3QgbWVzc2FnZSB0byBlbXVsYXRlIHNldEltbWVkaWF0ZS5cbmlmICghc2V0SW1tZWRpYXRlKSB7XG4gIHZhciBzZXRJbW1lZGlhdGVRdWV1ZSA9IFtdO1xuICB2YXIgc2VudGluZWwgPSBTdHJpbmcoTWF0aC5yYW5kb20oKSk7XG4gIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdtZXNzYWdlJywgZnVuY3Rpb24oZSkge1xuICAgIGlmIChlLmRhdGEgPT09IHNlbnRpbmVsKSB7XG4gICAgICB2YXIgcXVldWUgPSBzZXRJbW1lZGlhdGVRdWV1ZTtcbiAgICAgIHNldEltbWVkaWF0ZVF1ZXVlID0gW107XG4gICAgICBxdWV1ZS5mb3JFYWNoKGZ1bmN0aW9uKGZ1bmMpIHtcbiAgICAgICAgZnVuYygpO1xuICAgICAgfSk7XG4gICAgfVxuICB9KTtcbiAgc2V0SW1tZWRpYXRlID0gZnVuY3Rpb24oZnVuYykge1xuICAgIHNldEltbWVkaWF0ZVF1ZXVlLnB1c2goZnVuYyk7XG4gICAgd2luZG93LnBvc3RNZXNzYWdlKHNlbnRpbmVsLCAnKicpO1xuICB9O1xufVxuXG4vLyBUaGlzIGlzIHVzZWQgdG8gZW5zdXJlIHRoYXQgd2UgbmV2ZXIgc2NoZWR1bGUgMiBjYWxsYXMgdG8gc2V0SW1tZWRpYXRlXG52YXIgaXNTY2hlZHVsZWQgPSBmYWxzZTtcblxuLy8gS2VlcCB0cmFjayBvZiBvYnNlcnZlcnMgdGhhdCBuZWVkcyB0byBiZSBub3RpZmllZCBuZXh0IHRpbWUuXG52YXIgc2NoZWR1bGVkT2JzZXJ2ZXJzID0gW107XG5cbi8qKlxuICogU2NoZWR1bGVzIHxkaXNwYXRjaENhbGxiYWNrfCB0byBiZSBjYWxsZWQgaW4gdGhlIGZ1dHVyZS5cbiAqIEBwYXJhbSB7TXV0YXRpb25PYnNlcnZlcn0gb2JzZXJ2ZXJcbiAqL1xuZnVuY3Rpb24gc2NoZWR1bGVDYWxsYmFjayhvYnNlcnZlcikge1xuICBzY2hlZHVsZWRPYnNlcnZlcnMucHVzaChvYnNlcnZlcik7XG4gIGlmICghaXNTY2hlZHVsZWQpIHtcbiAgICBpc1NjaGVkdWxlZCA9IHRydWU7XG4gICAgc2V0SW1tZWRpYXRlKGRpc3BhdGNoQ2FsbGJhY2tzKTtcbiAgfVxufVxuXG5mdW5jdGlvbiB3cmFwSWZOZWVkZWQobm9kZSkge1xuICByZXR1cm4gd2luZG93LlNoYWRvd0RPTVBvbHlmaWxsICYmXG4gICAgICB3aW5kb3cuU2hhZG93RE9NUG9seWZpbGwud3JhcElmTmVlZGVkKG5vZGUpIHx8XG4gICAgICBub2RlO1xufVxuXG5mdW5jdGlvbiBkaXNwYXRjaENhbGxiYWNrcygpIHtcbiAgLy8gaHR0cDovL2RvbS5zcGVjLndoYXR3Zy5vcmcvI211dGF0aW9uLW9ic2VydmVyc1xuXG4gIGlzU2NoZWR1bGVkID0gZmFsc2U7IC8vIFVzZWQgdG8gYWxsb3cgYSBuZXcgc2V0SW1tZWRpYXRlIGNhbGwgYWJvdmUuXG5cbiAgdmFyIG9ic2VydmVycyA9IHNjaGVkdWxlZE9ic2VydmVycztcbiAgc2NoZWR1bGVkT2JzZXJ2ZXJzID0gW107XG4gIC8vIFNvcnQgb2JzZXJ2ZXJzIGJhc2VkIG9uIHRoZWlyIGNyZWF0aW9uIFVJRCAoaW5jcmVtZW50YWwpLlxuICBvYnNlcnZlcnMuc29ydChmdW5jdGlvbihvMSwgbzIpIHtcbiAgICByZXR1cm4gbzEudWlkXyAtIG8yLnVpZF87XG4gIH0pO1xuXG4gIHZhciBhbnlOb25FbXB0eSA9IGZhbHNlO1xuICBvYnNlcnZlcnMuZm9yRWFjaChmdW5jdGlvbihvYnNlcnZlcikge1xuXG4gICAgLy8gMi4xLCAyLjJcbiAgICB2YXIgcXVldWUgPSBvYnNlcnZlci50YWtlUmVjb3JkcygpO1xuICAgIC8vIDIuMy4gUmVtb3ZlIGFsbCB0cmFuc2llbnQgcmVnaXN0ZXJlZCBvYnNlcnZlcnMgd2hvc2Ugb2JzZXJ2ZXIgaXMgbW8uXG4gICAgcmVtb3ZlVHJhbnNpZW50T2JzZXJ2ZXJzRm9yKG9ic2VydmVyKTtcblxuICAgIC8vIDIuNFxuICAgIGlmIChxdWV1ZS5sZW5ndGgpIHtcbiAgICAgIG9ic2VydmVyLmNhbGxiYWNrXyhxdWV1ZSwgb2JzZXJ2ZXIpO1xuICAgICAgYW55Tm9uRW1wdHkgPSB0cnVlO1xuICAgIH1cbiAgfSk7XG5cbiAgLy8gMy5cbiAgaWYgKGFueU5vbkVtcHR5KVxuICAgIGRpc3BhdGNoQ2FsbGJhY2tzKCk7XG59XG5cbmZ1bmN0aW9uIHJlbW92ZVRyYW5zaWVudE9ic2VydmVyc0ZvcihvYnNlcnZlcikge1xuICBvYnNlcnZlci5ub2Rlc18uZm9yRWFjaChmdW5jdGlvbihub2RlKSB7XG4gICAgdmFyIHJlZ2lzdHJhdGlvbnMgPSByZWdpc3RyYXRpb25zVGFibGUuZ2V0KG5vZGUpO1xuICAgIGlmICghcmVnaXN0cmF0aW9ucylcbiAgICAgIHJldHVybjtcbiAgICByZWdpc3RyYXRpb25zLmZvckVhY2goZnVuY3Rpb24ocmVnaXN0cmF0aW9uKSB7XG4gICAgICBpZiAocmVnaXN0cmF0aW9uLm9ic2VydmVyID09PSBvYnNlcnZlcilcbiAgICAgICAgcmVnaXN0cmF0aW9uLnJlbW92ZVRyYW5zaWVudE9ic2VydmVycygpO1xuICAgIH0pO1xuICB9KTtcbn1cblxuLyoqXG4gKiBUaGlzIGZ1bmN0aW9uIGlzIHVzZWQgZm9yIHRoZSBcIkZvciBlYWNoIHJlZ2lzdGVyZWQgb2JzZXJ2ZXIgb2JzZXJ2ZXIgKHdpdGhcbiAqIG9ic2VydmVyJ3Mgb3B0aW9ucyBhcyBvcHRpb25zKSBpbiB0YXJnZXQncyBsaXN0IG9mIHJlZ2lzdGVyZWQgb2JzZXJ2ZXJzLFxuICogcnVuIHRoZXNlIHN1YnN0ZXBzOlwiIGFuZCB0aGUgXCJGb3IgZWFjaCBhbmNlc3RvciBhbmNlc3RvciBvZiB0YXJnZXQsIGFuZCBmb3JcbiAqIGVhY2ggcmVnaXN0ZXJlZCBvYnNlcnZlciBvYnNlcnZlciAod2l0aCBvcHRpb25zIG9wdGlvbnMpIGluIGFuY2VzdG9yJ3MgbGlzdFxuICogb2YgcmVnaXN0ZXJlZCBvYnNlcnZlcnMsIHJ1biB0aGVzZSBzdWJzdGVwczpcIiBwYXJ0IG9mIHRoZSBhbGdvcml0aG1zLiBUaGVcbiAqIHxvcHRpb25zLnN1YnRyZWV8IGlzIGNoZWNrZWQgdG8gZW5zdXJlIHRoYXQgdGhlIGNhbGxiYWNrIGlzIGNhbGxlZFxuICogY29ycmVjdGx5LlxuICpcbiAqIEBwYXJhbSB7Tm9kZX0gdGFyZ2V0XG4gKiBAcGFyYW0ge2Z1bmN0aW9uKE11dGF0aW9uT2JzZXJ2ZXJJbml0KTpNdXRhdGlvblJlY29yZH0gY2FsbGJhY2tcbiAqL1xuZnVuY3Rpb24gZm9yRWFjaEFuY2VzdG9yQW5kT2JzZXJ2ZXJFbnF1ZXVlUmVjb3JkKHRhcmdldCwgY2FsbGJhY2spIHtcbiAgZm9yICh2YXIgbm9kZSA9IHRhcmdldDsgbm9kZTsgbm9kZSA9IG5vZGUucGFyZW50Tm9kZSkge1xuICAgIHZhciByZWdpc3RyYXRpb25zID0gcmVnaXN0cmF0aW9uc1RhYmxlLmdldChub2RlKTtcblxuICAgIGlmIChyZWdpc3RyYXRpb25zKSB7XG4gICAgICBmb3IgKHZhciBqID0gMDsgaiA8IHJlZ2lzdHJhdGlvbnMubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgdmFyIHJlZ2lzdHJhdGlvbiA9IHJlZ2lzdHJhdGlvbnNbal07XG4gICAgICAgIHZhciBvcHRpb25zID0gcmVnaXN0cmF0aW9uLm9wdGlvbnM7XG5cbiAgICAgICAgLy8gT25seSB0YXJnZXQgaWdub3JlcyBzdWJ0cmVlLlxuICAgICAgICBpZiAobm9kZSAhPT0gdGFyZ2V0ICYmICFvcHRpb25zLnN1YnRyZWUpXG4gICAgICAgICAgY29udGludWU7XG5cbiAgICAgICAgdmFyIHJlY29yZCA9IGNhbGxiYWNrKG9wdGlvbnMpO1xuICAgICAgICBpZiAocmVjb3JkKVxuICAgICAgICAgIHJlZ2lzdHJhdGlvbi5lbnF1ZXVlKHJlY29yZCk7XG4gICAgICB9XG4gICAgfVxuICB9XG59XG5cbnZhciB1aWRDb3VudGVyID0gMDtcblxuLyoqXG4gKiBUaGUgY2xhc3MgdGhhdCBtYXBzIHRvIHRoZSBET00gTXV0YXRpb25PYnNlcnZlciBpbnRlcmZhY2UuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjay5cbiAqIEBjb25zdHJ1Y3RvclxuICovXG5mdW5jdGlvbiBKc011dGF0aW9uT2JzZXJ2ZXIoY2FsbGJhY2spIHtcbiAgdGhpcy5jYWxsYmFja18gPSBjYWxsYmFjaztcbiAgdGhpcy5ub2Rlc18gPSBbXTtcbiAgdGhpcy5yZWNvcmRzXyA9IFtdO1xuICB0aGlzLnVpZF8gPSArK3VpZENvdW50ZXI7XG59XG5cbkpzTXV0YXRpb25PYnNlcnZlci5wcm90b3R5cGUgPSB7XG4gIG9ic2VydmU6IGZ1bmN0aW9uKHRhcmdldCwgb3B0aW9ucykge1xuICAgIHRhcmdldCA9IHdyYXBJZk5lZWRlZCh0YXJnZXQpO1xuXG4gICAgLy8gMS4xXG4gICAgaWYgKCFvcHRpb25zLmNoaWxkTGlzdCAmJiAhb3B0aW9ucy5hdHRyaWJ1dGVzICYmICFvcHRpb25zLmNoYXJhY3RlckRhdGEgfHxcblxuICAgICAgICAvLyAxLjJcbiAgICAgICAgb3B0aW9ucy5hdHRyaWJ1dGVPbGRWYWx1ZSAmJiAhb3B0aW9ucy5hdHRyaWJ1dGVzIHx8XG5cbiAgICAgICAgLy8gMS4zXG4gICAgICAgIG9wdGlvbnMuYXR0cmlidXRlRmlsdGVyICYmIG9wdGlvbnMuYXR0cmlidXRlRmlsdGVyLmxlbmd0aCAmJlxuICAgICAgICAgICAgIW9wdGlvbnMuYXR0cmlidXRlcyB8fFxuXG4gICAgICAgIC8vIDEuNFxuICAgICAgICBvcHRpb25zLmNoYXJhY3RlckRhdGFPbGRWYWx1ZSAmJiAhb3B0aW9ucy5jaGFyYWN0ZXJEYXRhKSB7XG5cbiAgICAgIHRocm93IG5ldyBTeW50YXhFcnJvcigpO1xuICAgIH1cblxuICAgIHZhciByZWdpc3RyYXRpb25zID0gcmVnaXN0cmF0aW9uc1RhYmxlLmdldCh0YXJnZXQpO1xuICAgIGlmICghcmVnaXN0cmF0aW9ucylcbiAgICAgIHJlZ2lzdHJhdGlvbnNUYWJsZS5zZXQodGFyZ2V0LCByZWdpc3RyYXRpb25zID0gW10pO1xuXG4gICAgLy8gMlxuICAgIC8vIElmIHRhcmdldCdzIGxpc3Qgb2YgcmVnaXN0ZXJlZCBvYnNlcnZlcnMgYWxyZWFkeSBpbmNsdWRlcyBhIHJlZ2lzdGVyZWRcbiAgICAvLyBvYnNlcnZlciBhc3NvY2lhdGVkIHdpdGggdGhlIGNvbnRleHQgb2JqZWN0LCByZXBsYWNlIHRoYXQgcmVnaXN0ZXJlZFxuICAgIC8vIG9ic2VydmVyJ3Mgb3B0aW9ucyB3aXRoIG9wdGlvbnMuXG4gICAgdmFyIHJlZ2lzdHJhdGlvbjtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHJlZ2lzdHJhdGlvbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGlmIChyZWdpc3RyYXRpb25zW2ldLm9ic2VydmVyID09PSB0aGlzKSB7XG4gICAgICAgIHJlZ2lzdHJhdGlvbiA9IHJlZ2lzdHJhdGlvbnNbaV07XG4gICAgICAgIHJlZ2lzdHJhdGlvbi5yZW1vdmVMaXN0ZW5lcnMoKTtcbiAgICAgICAgcmVnaXN0cmF0aW9uLm9wdGlvbnMgPSBvcHRpb25zO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyAzLlxuICAgIC8vIE90aGVyd2lzZSwgYWRkIGEgbmV3IHJlZ2lzdGVyZWQgb2JzZXJ2ZXIgdG8gdGFyZ2V0J3MgbGlzdCBvZiByZWdpc3RlcmVkXG4gICAgLy8gb2JzZXJ2ZXJzIHdpdGggdGhlIGNvbnRleHQgb2JqZWN0IGFzIHRoZSBvYnNlcnZlciBhbmQgb3B0aW9ucyBhcyB0aGVcbiAgICAvLyBvcHRpb25zLCBhbmQgYWRkIHRhcmdldCB0byBjb250ZXh0IG9iamVjdCdzIGxpc3Qgb2Ygbm9kZXMgb24gd2hpY2ggaXRcbiAgICAvLyBpcyByZWdpc3RlcmVkLlxuICAgIGlmICghcmVnaXN0cmF0aW9uKSB7XG4gICAgICByZWdpc3RyYXRpb24gPSBuZXcgUmVnaXN0cmF0aW9uKHRoaXMsIHRhcmdldCwgb3B0aW9ucyk7XG4gICAgICByZWdpc3RyYXRpb25zLnB1c2gocmVnaXN0cmF0aW9uKTtcbiAgICAgIHRoaXMubm9kZXNfLnB1c2godGFyZ2V0KTtcbiAgICB9XG5cbiAgICByZWdpc3RyYXRpb24uYWRkTGlzdGVuZXJzKCk7XG4gIH0sXG5cbiAgZGlzY29ubmVjdDogZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5ub2Rlc18uZm9yRWFjaChmdW5jdGlvbihub2RlKSB7XG4gICAgICB2YXIgcmVnaXN0cmF0aW9ucyA9IHJlZ2lzdHJhdGlvbnNUYWJsZS5nZXQobm9kZSk7XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHJlZ2lzdHJhdGlvbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFyIHJlZ2lzdHJhdGlvbiA9IHJlZ2lzdHJhdGlvbnNbaV07XG4gICAgICAgIGlmIChyZWdpc3RyYXRpb24ub2JzZXJ2ZXIgPT09IHRoaXMpIHtcbiAgICAgICAgICByZWdpc3RyYXRpb24ucmVtb3ZlTGlzdGVuZXJzKCk7XG4gICAgICAgICAgcmVnaXN0cmF0aW9ucy5zcGxpY2UoaSwgMSk7XG4gICAgICAgICAgLy8gRWFjaCBub2RlIGNhbiBvbmx5IGhhdmUgb25lIHJlZ2lzdGVyZWQgb2JzZXJ2ZXIgYXNzb2NpYXRlZCB3aXRoXG4gICAgICAgICAgLy8gdGhpcyBvYnNlcnZlci5cbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sIHRoaXMpO1xuICAgIHRoaXMucmVjb3Jkc18gPSBbXTtcbiAgfSxcblxuICB0YWtlUmVjb3JkczogZnVuY3Rpb24oKSB7XG4gICAgdmFyIGNvcHlPZlJlY29yZHMgPSB0aGlzLnJlY29yZHNfO1xuICAgIHRoaXMucmVjb3Jkc18gPSBbXTtcbiAgICByZXR1cm4gY29weU9mUmVjb3JkcztcbiAgfVxufTtcblxuLyoqXG4gKiBAcGFyYW0ge3N0cmluZ30gdHlwZVxuICogQHBhcmFtIHtOb2RlfSB0YXJnZXRcbiAqIEBjb25zdHJ1Y3RvclxuICovXG5mdW5jdGlvbiBNdXRhdGlvblJlY29yZCh0eXBlLCB0YXJnZXQpIHtcbiAgdGhpcy50eXBlID0gdHlwZTtcbiAgdGhpcy50YXJnZXQgPSB0YXJnZXQ7XG4gIHRoaXMuYWRkZWROb2RlcyA9IFtdO1xuICB0aGlzLnJlbW92ZWROb2RlcyA9IFtdO1xuICB0aGlzLnByZXZpb3VzU2libGluZyA9IG51bGw7XG4gIHRoaXMubmV4dFNpYmxpbmcgPSBudWxsO1xuICB0aGlzLmF0dHJpYnV0ZU5hbWUgPSBudWxsO1xuICB0aGlzLmF0dHJpYnV0ZU5hbWVzcGFjZSA9IG51bGw7XG4gIHRoaXMub2xkVmFsdWUgPSBudWxsO1xufVxuXG5mdW5jdGlvbiBjb3B5TXV0YXRpb25SZWNvcmQob3JpZ2luYWwpIHtcbiAgdmFyIHJlY29yZCA9IG5ldyBNdXRhdGlvblJlY29yZChvcmlnaW5hbC50eXBlLCBvcmlnaW5hbC50YXJnZXQpO1xuICByZWNvcmQuYWRkZWROb2RlcyA9IG9yaWdpbmFsLmFkZGVkTm9kZXMuc2xpY2UoKTtcbiAgcmVjb3JkLnJlbW92ZWROb2RlcyA9IG9yaWdpbmFsLnJlbW92ZWROb2Rlcy5zbGljZSgpO1xuICByZWNvcmQucHJldmlvdXNTaWJsaW5nID0gb3JpZ2luYWwucHJldmlvdXNTaWJsaW5nO1xuICByZWNvcmQubmV4dFNpYmxpbmcgPSBvcmlnaW5hbC5uZXh0U2libGluZztcbiAgcmVjb3JkLmF0dHJpYnV0ZU5hbWUgPSBvcmlnaW5hbC5hdHRyaWJ1dGVOYW1lO1xuICByZWNvcmQuYXR0cmlidXRlTmFtZXNwYWNlID0gb3JpZ2luYWwuYXR0cmlidXRlTmFtZXNwYWNlO1xuICByZWNvcmQub2xkVmFsdWUgPSBvcmlnaW5hbC5vbGRWYWx1ZTtcbiAgcmV0dXJuIHJlY29yZDtcbn07XG5cbi8vIFdlIGtlZXAgdHJhY2sgb2YgdGhlIHR3byAocG9zc2libHkgb25lKSByZWNvcmRzIHVzZWQgaW4gYSBzaW5nbGUgbXV0YXRpb24uXG52YXIgY3VycmVudFJlY29yZCwgcmVjb3JkV2l0aE9sZFZhbHVlO1xuXG4vKipcbiAqIENyZWF0ZXMgYSByZWNvcmQgd2l0aG91dCB8b2xkVmFsdWV8IGFuZCBjYWNoZXMgaXQgYXMgfGN1cnJlbnRSZWNvcmR8IGZvclxuICogbGF0ZXIgdXNlLlxuICogQHBhcmFtIHtzdHJpbmd9IG9sZFZhbHVlXG4gKiBAcmV0dXJuIHtNdXRhdGlvblJlY29yZH1cbiAqL1xuZnVuY3Rpb24gZ2V0UmVjb3JkKHR5cGUsIHRhcmdldCkge1xuICByZXR1cm4gY3VycmVudFJlY29yZCA9IG5ldyBNdXRhdGlvblJlY29yZCh0eXBlLCB0YXJnZXQpO1xufVxuXG4vKipcbiAqIEdldHMgb3IgY3JlYXRlcyBhIHJlY29yZCB3aXRoIHxvbGRWYWx1ZXwgYmFzZWQgaW4gdGhlIHxjdXJyZW50UmVjb3JkfFxuICogQHBhcmFtIHtzdHJpbmd9IG9sZFZhbHVlXG4gKiBAcmV0dXJuIHtNdXRhdGlvblJlY29yZH1cbiAqL1xuZnVuY3Rpb24gZ2V0UmVjb3JkV2l0aE9sZFZhbHVlKG9sZFZhbHVlKSB7XG4gIGlmIChyZWNvcmRXaXRoT2xkVmFsdWUpXG4gICAgcmV0dXJuIHJlY29yZFdpdGhPbGRWYWx1ZTtcbiAgcmVjb3JkV2l0aE9sZFZhbHVlID0gY29weU11dGF0aW9uUmVjb3JkKGN1cnJlbnRSZWNvcmQpO1xuICByZWNvcmRXaXRoT2xkVmFsdWUub2xkVmFsdWUgPSBvbGRWYWx1ZTtcbiAgcmV0dXJuIHJlY29yZFdpdGhPbGRWYWx1ZTtcbn1cblxuZnVuY3Rpb24gY2xlYXJSZWNvcmRzKCkge1xuICBjdXJyZW50UmVjb3JkID0gcmVjb3JkV2l0aE9sZFZhbHVlID0gdW5kZWZpbmVkO1xufVxuXG4vKipcbiAqIEBwYXJhbSB7TXV0YXRpb25SZWNvcmR9IHJlY29yZFxuICogQHJldHVybiB7Ym9vbGVhbn0gV2hldGhlciB0aGUgcmVjb3JkIHJlcHJlc2VudHMgYSByZWNvcmQgZnJvbSB0aGUgY3VycmVudFxuICogbXV0YXRpb24gZXZlbnQuXG4gKi9cbmZ1bmN0aW9uIHJlY29yZFJlcHJlc2VudHNDdXJyZW50TXV0YXRpb24ocmVjb3JkKSB7XG4gIHJldHVybiByZWNvcmQgPT09IHJlY29yZFdpdGhPbGRWYWx1ZSB8fCByZWNvcmQgPT09IGN1cnJlbnRSZWNvcmQ7XG59XG5cbi8qKlxuICogU2VsZWN0cyB3aGljaCByZWNvcmQsIGlmIGFueSwgdG8gcmVwbGFjZSB0aGUgbGFzdCByZWNvcmQgaW4gdGhlIHF1ZXVlLlxuICogVGhpcyByZXR1cm5zIHxudWxsfCBpZiBubyByZWNvcmQgc2hvdWxkIGJlIHJlcGxhY2VkLlxuICpcbiAqIEBwYXJhbSB7TXV0YXRpb25SZWNvcmR9IGxhc3RSZWNvcmRcbiAqIEBwYXJhbSB7TXV0YXRpb25SZWNvcmR9IG5ld1JlY29yZFxuICogQHBhcmFtIHtNdXRhdGlvblJlY29yZH1cbiAqL1xuZnVuY3Rpb24gc2VsZWN0UmVjb3JkKGxhc3RSZWNvcmQsIG5ld1JlY29yZCkge1xuICBpZiAobGFzdFJlY29yZCA9PT0gbmV3UmVjb3JkKVxuICAgIHJldHVybiBsYXN0UmVjb3JkO1xuXG4gIC8vIENoZWNrIGlmIHRoZSB0aGUgcmVjb3JkIHdlIGFyZSBhZGRpbmcgcmVwcmVzZW50cyB0aGUgc2FtZSByZWNvcmQuIElmXG4gIC8vIHNvLCB3ZSBrZWVwIHRoZSBvbmUgd2l0aCB0aGUgb2xkVmFsdWUgaW4gaXQuXG4gIGlmIChyZWNvcmRXaXRoT2xkVmFsdWUgJiYgcmVjb3JkUmVwcmVzZW50c0N1cnJlbnRNdXRhdGlvbihsYXN0UmVjb3JkKSlcbiAgICByZXR1cm4gcmVjb3JkV2l0aE9sZFZhbHVlO1xuXG4gIHJldHVybiBudWxsO1xufVxuXG4vKipcbiAqIENsYXNzIHVzZWQgdG8gcmVwcmVzZW50IGEgcmVnaXN0ZXJlZCBvYnNlcnZlci5cbiAqIEBwYXJhbSB7TXV0YXRpb25PYnNlcnZlcn0gb2JzZXJ2ZXJcbiAqIEBwYXJhbSB7Tm9kZX0gdGFyZ2V0XG4gKiBAcGFyYW0ge011dGF0aW9uT2JzZXJ2ZXJJbml0fSBvcHRpb25zXG4gKiBAY29uc3RydWN0b3JcbiAqL1xuZnVuY3Rpb24gUmVnaXN0cmF0aW9uKG9ic2VydmVyLCB0YXJnZXQsIG9wdGlvbnMpIHtcbiAgdGhpcy5vYnNlcnZlciA9IG9ic2VydmVyO1xuICB0aGlzLnRhcmdldCA9IHRhcmdldDtcbiAgdGhpcy5vcHRpb25zID0gb3B0aW9ucztcbiAgdGhpcy50cmFuc2llbnRPYnNlcnZlZE5vZGVzID0gW107XG59XG5cblJlZ2lzdHJhdGlvbi5wcm90b3R5cGUgPSB7XG4gIGVucXVldWU6IGZ1bmN0aW9uKHJlY29yZCkge1xuICAgIHZhciByZWNvcmRzID0gdGhpcy5vYnNlcnZlci5yZWNvcmRzXztcbiAgICB2YXIgbGVuZ3RoID0gcmVjb3Jkcy5sZW5ndGg7XG5cbiAgICAvLyBUaGVyZSBhcmUgY2FzZXMgd2hlcmUgd2UgcmVwbGFjZSB0aGUgbGFzdCByZWNvcmQgd2l0aCB0aGUgbmV3IHJlY29yZC5cbiAgICAvLyBGb3IgZXhhbXBsZSBpZiB0aGUgcmVjb3JkIHJlcHJlc2VudHMgdGhlIHNhbWUgbXV0YXRpb24gd2UgbmVlZCB0byB1c2VcbiAgICAvLyB0aGUgb25lIHdpdGggdGhlIG9sZFZhbHVlLiBJZiB3ZSBnZXQgc2FtZSByZWNvcmQgKHRoaXMgY2FuIGhhcHBlbiBhcyB3ZVxuICAgIC8vIHdhbGsgdXAgdGhlIHRyZWUpIHdlIGlnbm9yZSB0aGUgbmV3IHJlY29yZC5cbiAgICBpZiAocmVjb3Jkcy5sZW5ndGggPiAwKSB7XG4gICAgICB2YXIgbGFzdFJlY29yZCA9IHJlY29yZHNbbGVuZ3RoIC0gMV07XG4gICAgICB2YXIgcmVjb3JkVG9SZXBsYWNlTGFzdCA9IHNlbGVjdFJlY29yZChsYXN0UmVjb3JkLCByZWNvcmQpO1xuICAgICAgaWYgKHJlY29yZFRvUmVwbGFjZUxhc3QpIHtcbiAgICAgICAgcmVjb3Jkc1tsZW5ndGggLSAxXSA9IHJlY29yZFRvUmVwbGFjZUxhc3Q7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgc2NoZWR1bGVDYWxsYmFjayh0aGlzLm9ic2VydmVyKTtcbiAgICB9XG5cbiAgICByZWNvcmRzW2xlbmd0aF0gPSByZWNvcmQ7XG4gIH0sXG5cbiAgYWRkTGlzdGVuZXJzOiBmdW5jdGlvbigpIHtcbiAgICB0aGlzLmFkZExpc3RlbmVyc18odGhpcy50YXJnZXQpO1xuICB9LFxuXG4gIGFkZExpc3RlbmVyc186IGZ1bmN0aW9uKG5vZGUpIHtcbiAgICB2YXIgb3B0aW9ucyA9IHRoaXMub3B0aW9ucztcbiAgICBpZiAob3B0aW9ucy5hdHRyaWJ1dGVzKVxuICAgICAgbm9kZS5hZGRFdmVudExpc3RlbmVyKCdET01BdHRyTW9kaWZpZWQnLCB0aGlzLCB0cnVlKTtcblxuICAgIGlmIChvcHRpb25zLmNoYXJhY3RlckRhdGEpXG4gICAgICBub2RlLmFkZEV2ZW50TGlzdGVuZXIoJ0RPTUNoYXJhY3RlckRhdGFNb2RpZmllZCcsIHRoaXMsIHRydWUpO1xuXG4gICAgaWYgKG9wdGlvbnMuY2hpbGRMaXN0KVxuICAgICAgbm9kZS5hZGRFdmVudExpc3RlbmVyKCdET01Ob2RlSW5zZXJ0ZWQnLCB0aGlzLCB0cnVlKTtcblxuICAgIGlmIChvcHRpb25zLmNoaWxkTGlzdCB8fCBvcHRpb25zLnN1YnRyZWUpXG4gICAgICBub2RlLmFkZEV2ZW50TGlzdGVuZXIoJ0RPTU5vZGVSZW1vdmVkJywgdGhpcywgdHJ1ZSk7XG4gIH0sXG5cbiAgcmVtb3ZlTGlzdGVuZXJzOiBmdW5jdGlvbigpIHtcbiAgICB0aGlzLnJlbW92ZUxpc3RlbmVyc18odGhpcy50YXJnZXQpO1xuICB9LFxuXG4gIHJlbW92ZUxpc3RlbmVyc186IGZ1bmN0aW9uKG5vZGUpIHtcbiAgICB2YXIgb3B0aW9ucyA9IHRoaXMub3B0aW9ucztcbiAgICBpZiAob3B0aW9ucy5hdHRyaWJ1dGVzKVxuICAgICAgbm9kZS5yZW1vdmVFdmVudExpc3RlbmVyKCdET01BdHRyTW9kaWZpZWQnLCB0aGlzLCB0cnVlKTtcblxuICAgIGlmIChvcHRpb25zLmNoYXJhY3RlckRhdGEpXG4gICAgICBub2RlLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ0RPTUNoYXJhY3RlckRhdGFNb2RpZmllZCcsIHRoaXMsIHRydWUpO1xuXG4gICAgaWYgKG9wdGlvbnMuY2hpbGRMaXN0KVxuICAgICAgbm9kZS5yZW1vdmVFdmVudExpc3RlbmVyKCdET01Ob2RlSW5zZXJ0ZWQnLCB0aGlzLCB0cnVlKTtcblxuICAgIGlmIChvcHRpb25zLmNoaWxkTGlzdCB8fCBvcHRpb25zLnN1YnRyZWUpXG4gICAgICBub2RlLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ0RPTU5vZGVSZW1vdmVkJywgdGhpcywgdHJ1ZSk7XG4gIH0sXG5cbiAgLyoqXG4gICAqIEFkZHMgYSB0cmFuc2llbnQgb2JzZXJ2ZXIgb24gbm9kZS4gVGhlIHRyYW5zaWVudCBvYnNlcnZlciBnZXRzIHJlbW92ZWRcbiAgICogbmV4dCB0aW1lIHdlIGRlbGl2ZXIgdGhlIGNoYW5nZSByZWNvcmRzLlxuICAgKiBAcGFyYW0ge05vZGV9IG5vZGVcbiAgICovXG4gIGFkZFRyYW5zaWVudE9ic2VydmVyOiBmdW5jdGlvbihub2RlKSB7XG4gICAgLy8gRG9uJ3QgYWRkIHRyYW5zaWVudCBvYnNlcnZlcnMgb24gdGhlIHRhcmdldCBpdHNlbGYuIFdlIGFscmVhZHkgaGF2ZSBhbGxcbiAgICAvLyB0aGUgcmVxdWlyZWQgbGlzdGVuZXJzIHNldCB1cCBvbiB0aGUgdGFyZ2V0LlxuICAgIGlmIChub2RlID09PSB0aGlzLnRhcmdldClcbiAgICAgIHJldHVybjtcblxuICAgIHRoaXMuYWRkTGlzdGVuZXJzXyhub2RlKTtcbiAgICB0aGlzLnRyYW5zaWVudE9ic2VydmVkTm9kZXMucHVzaChub2RlKTtcbiAgICB2YXIgcmVnaXN0cmF0aW9ucyA9IHJlZ2lzdHJhdGlvbnNUYWJsZS5nZXQobm9kZSk7XG4gICAgaWYgKCFyZWdpc3RyYXRpb25zKVxuICAgICAgcmVnaXN0cmF0aW9uc1RhYmxlLnNldChub2RlLCByZWdpc3RyYXRpb25zID0gW10pO1xuXG4gICAgLy8gV2Uga25vdyB0aGF0IHJlZ2lzdHJhdGlvbnMgZG9lcyBub3QgY29udGFpbiB0aGlzIGJlY2F1c2Ugd2UgYWxyZWFkeVxuICAgIC8vIGNoZWNrZWQgaWYgbm9kZSA9PT0gdGhpcy50YXJnZXQuXG4gICAgcmVnaXN0cmF0aW9ucy5wdXNoKHRoaXMpO1xuICB9LFxuXG4gIHJlbW92ZVRyYW5zaWVudE9ic2VydmVyczogZnVuY3Rpb24oKSB7XG4gICAgdmFyIHRyYW5zaWVudE9ic2VydmVkTm9kZXMgPSB0aGlzLnRyYW5zaWVudE9ic2VydmVkTm9kZXM7XG4gICAgdGhpcy50cmFuc2llbnRPYnNlcnZlZE5vZGVzID0gW107XG5cbiAgICB0cmFuc2llbnRPYnNlcnZlZE5vZGVzLmZvckVhY2goZnVuY3Rpb24obm9kZSkge1xuICAgICAgLy8gVHJhbnNpZW50IG9ic2VydmVycyBhcmUgbmV2ZXIgYWRkZWQgdG8gdGhlIHRhcmdldC5cbiAgICAgIHRoaXMucmVtb3ZlTGlzdGVuZXJzXyhub2RlKTtcblxuICAgICAgdmFyIHJlZ2lzdHJhdGlvbnMgPSByZWdpc3RyYXRpb25zVGFibGUuZ2V0KG5vZGUpO1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCByZWdpc3RyYXRpb25zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmIChyZWdpc3RyYXRpb25zW2ldID09PSB0aGlzKSB7XG4gICAgICAgICAgcmVnaXN0cmF0aW9ucy5zcGxpY2UoaSwgMSk7XG4gICAgICAgICAgLy8gRWFjaCBub2RlIGNhbiBvbmx5IGhhdmUgb25lIHJlZ2lzdGVyZWQgb2JzZXJ2ZXIgYXNzb2NpYXRlZCB3aXRoXG4gICAgICAgICAgLy8gdGhpcyBvYnNlcnZlci5cbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sIHRoaXMpO1xuICB9LFxuXG4gIGhhbmRsZUV2ZW50OiBmdW5jdGlvbihlKSB7XG4gICAgLy8gU3RvcCBwcm9wYWdhdGlvbiBzaW5jZSB3ZSBhcmUgbWFuYWdpbmcgdGhlIHByb3BhZ2F0aW9uIG1hbnVhbGx5LlxuICAgIC8vIFRoaXMgbWVhbnMgdGhhdCBvdGhlciBtdXRhdGlvbiBldmVudHMgb24gdGhlIHBhZ2Ugd2lsbCBub3Qgd29ya1xuICAgIC8vIGNvcnJlY3RseSBidXQgdGhhdCBpcyBieSBkZXNpZ24uXG4gICAgZS5zdG9wSW1tZWRpYXRlUHJvcGFnYXRpb24oKTtcblxuICAgIHN3aXRjaCAoZS50eXBlKSB7XG4gICAgICBjYXNlICdET01BdHRyTW9kaWZpZWQnOlxuICAgICAgICAvLyBodHRwOi8vZG9tLnNwZWMud2hhdHdnLm9yZy8jY29uY2VwdC1tby1xdWV1ZS1hdHRyaWJ1dGVzXG5cbiAgICAgICAgdmFyIG5hbWUgPSBlLmF0dHJOYW1lO1xuICAgICAgICB2YXIgbmFtZXNwYWNlID0gZS5yZWxhdGVkTm9kZS5uYW1lc3BhY2VVUkk7XG4gICAgICAgIHZhciB0YXJnZXQgPSBlLnRhcmdldDtcblxuICAgICAgICAvLyAxLlxuICAgICAgICB2YXIgcmVjb3JkID0gbmV3IGdldFJlY29yZCgnYXR0cmlidXRlcycsIHRhcmdldCk7XG4gICAgICAgIHJlY29yZC5hdHRyaWJ1dGVOYW1lID0gbmFtZTtcbiAgICAgICAgcmVjb3JkLmF0dHJpYnV0ZU5hbWVzcGFjZSA9IG5hbWVzcGFjZTtcblxuICAgICAgICAvLyAyLlxuICAgICAgICB2YXIgb2xkVmFsdWUgPVxuICAgICAgICAgICAgZS5hdHRyQ2hhbmdlID09PSBNdXRhdGlvbkV2ZW50LkFERElUSU9OID8gbnVsbCA6IGUucHJldlZhbHVlO1xuXG4gICAgICAgIGZvckVhY2hBbmNlc3RvckFuZE9ic2VydmVyRW5xdWV1ZVJlY29yZCh0YXJnZXQsIGZ1bmN0aW9uKG9wdGlvbnMpIHtcbiAgICAgICAgICAvLyAzLjEsIDQuMlxuICAgICAgICAgIGlmICghb3B0aW9ucy5hdHRyaWJ1dGVzKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgICAgLy8gMy4yLCA0LjNcbiAgICAgICAgICBpZiAob3B0aW9ucy5hdHRyaWJ1dGVGaWx0ZXIgJiYgb3B0aW9ucy5hdHRyaWJ1dGVGaWx0ZXIubGVuZ3RoICYmXG4gICAgICAgICAgICAgIG9wdGlvbnMuYXR0cmlidXRlRmlsdGVyLmluZGV4T2YobmFtZSkgPT09IC0xICYmXG4gICAgICAgICAgICAgIG9wdGlvbnMuYXR0cmlidXRlRmlsdGVyLmluZGV4T2YobmFtZXNwYWNlKSA9PT0gLTEpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gMy4zLCA0LjRcbiAgICAgICAgICBpZiAob3B0aW9ucy5hdHRyaWJ1dGVPbGRWYWx1ZSlcbiAgICAgICAgICAgIHJldHVybiBnZXRSZWNvcmRXaXRoT2xkVmFsdWUob2xkVmFsdWUpO1xuXG4gICAgICAgICAgLy8gMy40LCA0LjVcbiAgICAgICAgICByZXR1cm4gcmVjb3JkO1xuICAgICAgICB9KTtcblxuICAgICAgICBicmVhaztcblxuICAgICAgY2FzZSAnRE9NQ2hhcmFjdGVyRGF0YU1vZGlmaWVkJzpcbiAgICAgICAgLy8gaHR0cDovL2RvbS5zcGVjLndoYXR3Zy5vcmcvI2NvbmNlcHQtbW8tcXVldWUtY2hhcmFjdGVyZGF0YVxuICAgICAgICB2YXIgdGFyZ2V0ID0gZS50YXJnZXQ7XG5cbiAgICAgICAgLy8gMS5cbiAgICAgICAgdmFyIHJlY29yZCA9IGdldFJlY29yZCgnY2hhcmFjdGVyRGF0YScsIHRhcmdldCk7XG5cbiAgICAgICAgLy8gMi5cbiAgICAgICAgdmFyIG9sZFZhbHVlID0gZS5wcmV2VmFsdWU7XG5cblxuICAgICAgICBmb3JFYWNoQW5jZXN0b3JBbmRPYnNlcnZlckVucXVldWVSZWNvcmQodGFyZ2V0LCBmdW5jdGlvbihvcHRpb25zKSB7XG4gICAgICAgICAgLy8gMy4xLCA0LjJcbiAgICAgICAgICBpZiAoIW9wdGlvbnMuY2hhcmFjdGVyRGF0YSlcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICAgIC8vIDMuMiwgNC4zXG4gICAgICAgICAgaWYgKG9wdGlvbnMuY2hhcmFjdGVyRGF0YU9sZFZhbHVlKVxuICAgICAgICAgICAgcmV0dXJuIGdldFJlY29yZFdpdGhPbGRWYWx1ZShvbGRWYWx1ZSk7XG5cbiAgICAgICAgICAvLyAzLjMsIDQuNFxuICAgICAgICAgIHJldHVybiByZWNvcmQ7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGJyZWFrO1xuXG4gICAgICBjYXNlICdET01Ob2RlUmVtb3ZlZCc6XG4gICAgICAgIHRoaXMuYWRkVHJhbnNpZW50T2JzZXJ2ZXIoZS50YXJnZXQpO1xuICAgICAgICAvLyBGYWxsIHRocm91Z2guXG4gICAgICBjYXNlICdET01Ob2RlSW5zZXJ0ZWQnOlxuICAgICAgICAvLyBodHRwOi8vZG9tLnNwZWMud2hhdHdnLm9yZy8jY29uY2VwdC1tby1xdWV1ZS1jaGlsZGxpc3RcbiAgICAgICAgdmFyIHRhcmdldCA9IGUucmVsYXRlZE5vZGU7XG4gICAgICAgIHZhciBjaGFuZ2VkTm9kZSA9IGUudGFyZ2V0O1xuICAgICAgICB2YXIgYWRkZWROb2RlcywgcmVtb3ZlZE5vZGVzO1xuICAgICAgICBpZiAoZS50eXBlID09PSAnRE9NTm9kZUluc2VydGVkJykge1xuICAgICAgICAgIGFkZGVkTm9kZXMgPSBbY2hhbmdlZE5vZGVdO1xuICAgICAgICAgIHJlbW92ZWROb2RlcyA9IFtdO1xuICAgICAgICB9IGVsc2Uge1xuXG4gICAgICAgICAgYWRkZWROb2RlcyA9IFtdO1xuICAgICAgICAgIHJlbW92ZWROb2RlcyA9IFtjaGFuZ2VkTm9kZV07XG4gICAgICAgIH1cbiAgICAgICAgdmFyIHByZXZpb3VzU2libGluZyA9IGNoYW5nZWROb2RlLnByZXZpb3VzU2libGluZztcbiAgICAgICAgdmFyIG5leHRTaWJsaW5nID0gY2hhbmdlZE5vZGUubmV4dFNpYmxpbmc7XG5cbiAgICAgICAgLy8gMS5cbiAgICAgICAgdmFyIHJlY29yZCA9IGdldFJlY29yZCgnY2hpbGRMaXN0JywgdGFyZ2V0KTtcbiAgICAgICAgcmVjb3JkLmFkZGVkTm9kZXMgPSBhZGRlZE5vZGVzO1xuICAgICAgICByZWNvcmQucmVtb3ZlZE5vZGVzID0gcmVtb3ZlZE5vZGVzO1xuICAgICAgICByZWNvcmQucHJldmlvdXNTaWJsaW5nID0gcHJldmlvdXNTaWJsaW5nO1xuICAgICAgICByZWNvcmQubmV4dFNpYmxpbmcgPSBuZXh0U2libGluZztcblxuICAgICAgICBmb3JFYWNoQW5jZXN0b3JBbmRPYnNlcnZlckVucXVldWVSZWNvcmQodGFyZ2V0LCBmdW5jdGlvbihvcHRpb25zKSB7XG4gICAgICAgICAgLy8gMi4xLCAzLjJcbiAgICAgICAgICBpZiAoIW9wdGlvbnMuY2hpbGRMaXN0KVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgICAgLy8gMi4yLCAzLjNcbiAgICAgICAgICByZXR1cm4gcmVjb3JkO1xuICAgICAgICB9KTtcblxuICAgIH1cblxuICAgIGNsZWFyUmVjb3JkcygpO1xuICB9XG59O1xuXG5pZiAoIU11dGF0aW9uT2JzZXJ2ZXIpIHtcbiAgTXV0YXRpb25PYnNlcnZlciA9IEpzTXV0YXRpb25PYnNlcnZlcjtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBNdXRhdGlvbk9ic2VydmVyO1xuIiwiaW1wb3J0IHsgU2NvcGUsIE5vZGVNYXRjaGVyLCBFdmVudE1hdGNoZXIsIFNjb3BlRXhlY3V0b3IsIFN1YnNjcmlwdGlvbkV4ZWN1dG9yIH0gZnJvbSAnLi9zY29wZSc7XG5cbmV4cG9ydCB7IFNjb3BlLCBOb2RlTWF0Y2hlciwgRXZlbnRNYXRjaGVyLCBTY29wZUV4ZWN1dG9yLCBTdWJzY3JpcHRpb25FeGVjdXRvciB9O1xuXG5leHBvcnQgY2xhc3MgRGVjbCB7XG4gICAgcHJpdmF0ZSBzdGF0aWMgZGVmYXVsdEluc3RhbmNlOiBEZWNsIHwgbnVsbCA9IG51bGw7XG5cbiAgICBzdGF0aWMgc2VsZWN0KG1hdGNoZXI6IE5vZGVNYXRjaGVyLCBleGVjdXRvcjogU2NvcGVFeGVjdXRvcik6IFNjb3BlIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0RGVmYXVsdEluc3RhbmNlKCkuc2VsZWN0KG1hdGNoZXIsIGV4ZWN1dG9yKTtcbiAgICB9XG5cbiAgICBzdGF0aWMgb24obWF0Y2hlcjogRXZlbnRNYXRjaGVyLCBleGVjdXRvcjogU3Vic2NyaXB0aW9uRXhlY3V0b3IpOiBTY29wZSB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldERlZmF1bHRJbnN0YW5jZSgpLm9uKG1hdGNoZXIsIGV4ZWN1dG9yKTtcbiAgICB9XG5cbiAgICBzdGF0aWMgZ2V0Um9vdFNjb3BlKCk6IFNjb3BlIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0RGVmYXVsdEluc3RhbmNlKCkuZ2V0Um9vdFNjb3BlKCk7XG4gICAgfVxuXG4gICAgc3RhdGljIGluc3BlY3QoaW5jbHVkZVNvdXJjZT86IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgdGhpcy5nZXREZWZhdWx0SW5zdGFuY2UoKS5pbnNwZWN0KGluY2x1ZGVTb3VyY2UpO1xuICAgIH1cblxuICAgIHN0YXRpYyBnZXREZWZhdWx0SW5zdGFuY2UoKSA6IERlY2wge1xuICAgICAgICByZXR1cm4gdGhpcy5kZWZhdWx0SW5zdGFuY2UgfHwgKHRoaXMuZGVmYXVsdEluc3RhbmNlID0gbmV3IERlY2wod2luZG93LmRvY3VtZW50KSk7XG4gICAgfVxuXG4gICAgc3RhdGljIHNldERlZmF1bHRJbnN0YW5jZShkZWNsOiBEZWNsKSA6IERlY2wge1xuICAgICAgICByZXR1cm4gdGhpcy5kZWZhdWx0SW5zdGFuY2UgPSBkZWNsO1xuICAgIH1cblxuICAgIHN0YXRpYyBwcmlzdGluZSgpOiB2b2lkIHtcbiAgICAgICAgaWYodGhpcy5kZWZhdWx0SW5zdGFuY2UpIHtcbiAgICAgICAgICAgIHRoaXMuZGVmYXVsdEluc3RhbmNlLnByaXN0aW5lKCk7XG4gICAgICAgICAgICB0aGlzLmRlZmF1bHRJbnN0YW5jZSA9IG51bGw7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIHNjb3BlOiBTY29wZTtcblxuICAgIGNvbnN0cnVjdG9yKHJvb3Q6IE5vZGUpIHtcbiAgICAgICAgdGhpcy5zY29wZSA9IFNjb3BlLmJ1aWxkUm9vdFNjb3BlKHJvb3QpO1xuICAgIH1cblxuICAgIHNlbGVjdChtYXRjaGVyOiBOb2RlTWF0Y2hlciwgZXhlY3V0b3I6IFNjb3BlRXhlY3V0b3IpOiBTY29wZSB7XG4gICAgICAgIHJldHVybiB0aGlzLnNjb3BlLnNlbGVjdChtYXRjaGVyLCBleGVjdXRvcik7XG4gICAgfVxuXG4gICAgb24obWF0Y2hlcjogRXZlbnRNYXRjaGVyLCBleGVjdXRvcjogU3Vic2NyaXB0aW9uRXhlY3V0b3IpOiBTY29wZSB7XG4gICAgICAgIHJldHVybiB0aGlzLnNjb3BlLm9uKG1hdGNoZXIsIGV4ZWN1dG9yKTtcbiAgICB9XG5cbiAgICBnZXRSb290U2NvcGUoKTogU2NvcGUge1xuICAgICAgIHJldHVybiB0aGlzLnNjb3BlOyBcbiAgICB9XG5cbiAgICBpbnNwZWN0KGluY2x1ZGVTb3VyY2U/OiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIGNvbnNvbGUuZ3JvdXBDb2xsYXBzZWQoJzw8cm9vdD4+Jyk7XG4gICAgICAgIFxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgdGhpcy5zY29wZS5pbnNwZWN0KGluY2x1ZGVTb3VyY2UpOyAgICAgICAgXG4gICAgICAgIH1maW5hbGx5e1xuICAgICAgICAgICAgY29uc29sZS5ncm91cEVuZCgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpc3RpbmUoKTogdm9pZCB7XG4gICAgICAgIHRoaXMuc2NvcGUucHJpc3RpbmUoKTtcbiAgICB9XG59XG5cbi8vIEV4cG9ydCB0byBhIGdsb2JhbCBmb3IgdGhlIGJyb3dzZXIgKHRoZXJlICpoYXMqIHRvIGJlIGEgYmV0dGVyIHdheSB0byBkbyB0aGlzISlcbmlmKHR5cGVvZih3aW5kb3cpICE9PSAndW5kZWZpbmVkJykge1xuICAgICg8YW55PndpbmRvdykuRGVjbCA9IERlY2w7XG59XG5cbmV4cG9ydCBkZWZhdWx0IERlY2w7XG4iLCJpbXBvcnQgeyBTdWJzY3JpcHRpb24sIFN1YnNjcmlwdGlvbkV4ZWN1dG9yIH0gZnJvbSAnLi4vc3Vic2NyaXB0aW9ucy9zdWJzY3JpcHRpb24nO1xuXG5leHBvcnQgeyBTdWJzY3JpcHRpb25FeGVjdXRvciB9O1xuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgRGVjbGFyYXRpb24ge1xuICAgIHByb3RlY3RlZCBpc0FjdGl2YXRlZDogYm9vbGVhbiA9IGZhbHNlO1xuICAgIHByb3RlY3RlZCByZWFkb25seSBub2RlOiBOb2RlO1xuICAgIHByb3RlY3RlZCByZWFkb25seSBzdWJzY3JpcHRpb246IFN1YnNjcmlwdGlvbjtcblxuICAgIGNvbnN0cnVjdG9yKG5vZGU6IE5vZGUpIHtcbiAgICAgICAgdGhpcy5ub2RlID0gbm9kZTtcbiAgICB9XG5cbiAgICBhY3RpdmF0ZSgpOiB2b2lkIHtcbiAgICAgICAgaWYoIXRoaXMuaXNBY3RpdmF0ZWQpIHtcbiAgICAgICAgICAgIHRoaXMuaXNBY3RpdmF0ZWQgPSB0cnVlO1xuXG4gICAgICAgICAgICB0aGlzLnN1YnNjcmlwdGlvbi5jb25uZWN0KCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBkZWFjdGl2YXRlKCk6IHZvaWQge1xuICAgICAgICBpZih0aGlzLmlzQWN0aXZhdGVkKSB7XG4gICAgICAgICAgICB0aGlzLmlzQWN0aXZhdGVkID0gZmFsc2U7XG5cbiAgICAgICAgICAgIHRoaXMuc3Vic2NyaXB0aW9uLmRpc2Nvbm5lY3QoKTtcbiAgICAgICAgfSAgICAgICAgXG4gICAgfVxuXG4gICAgYWJzdHJhY3QgaW5zcGVjdChpbmNsdWRlU291cmNlPzogYm9vbGVhbik6IHZvaWQ7XG59IiwiaW1wb3J0IHsgRGVjbGFyYXRpb24sIFN1YnNjcmlwdGlvbkV4ZWN1dG9yIH0gZnJvbSAnLi9kZWNsYXJhdGlvbic7XG5pbXBvcnQgeyBUcml2aWFsU3Vic2NyaXB0aW9uIH0gZnJvbSAnLi4vc3Vic2NyaXB0aW9ucy90cml2aWFsX3N1YnNjcmlwdGlvbic7XG5cbmV4cG9ydCB7IFN1YnNjcmlwdGlvbkV4ZWN1dG9yIH07XG5cbmV4cG9ydCBjbGFzcyBNYXRjaERlY2xhcmF0aW9uIGV4dGVuZHMgRGVjbGFyYXRpb24ge1xuICAgIHByb3RlY3RlZCByZWFkb25seSBzdWJzY3JpcHRpb246IFRyaXZpYWxTdWJzY3JpcHRpb247XG4gICAgcHJvdGVjdGVkIHJlYWRvbmx5IGV4ZWN1dG9yOiBTdWJzY3JpcHRpb25FeGVjdXRvcjtcblxuICAgIGNvbnN0cnVjdG9yKG5vZGU6IE5vZGUsIGV4ZWN1dG9yOiBTdWJzY3JpcHRpb25FeGVjdXRvcikge1xuICAgICAgICBzdXBlcihub2RlKTtcblxuICAgICAgICB0aGlzLmV4ZWN1dG9yID0gZXhlY3V0b3I7XG5cbiAgICAgICAgdGhpcy5zdWJzY3JpcHRpb24gPSBuZXcgVHJpdmlhbFN1YnNjcmlwdGlvbih0aGlzLm5vZGUsIHsgY29ubmVjdGVkOiB0cnVlIH0sIHRoaXMuZXhlY3V0b3IpO1xuICAgIH1cblxuICAgIGluc3BlY3QoKTogdm9pZCB7XG4gICAgICAgIGNvbnNvbGUuZ3JvdXBDb2xsYXBzZWQoJ21hdGNoZXMnKTtcbiAgICAgICAgY29uc29sZS5sb2codGhpcy5leGVjdXRvcik7XG4gICAgICAgIGNvbnNvbGUuZ3JvdXBFbmQoKTtcbiAgICB9XG59IiwiaW1wb3J0IHsgRGVjbGFyYXRpb24sIFN1YnNjcmlwdGlvbkV4ZWN1dG9yIH0gZnJvbSAnLi9kZWNsYXJhdGlvbic7XG5pbXBvcnQgeyBFdmVudFN1YnNjcmlwdGlvbiwgRXZlbnRNYXRjaGVyIH0gZnJvbSAnLi4vc3Vic2NyaXB0aW9ucy9ldmVudF9zdWJzY3JpcHRpb24nO1xuXG5leHBvcnQgeyBFdmVudE1hdGNoZXIsIFN1YnNjcmlwdGlvbkV4ZWN1dG9yIH07XG5cbmV4cG9ydCBjbGFzcyBPbkRlY2xhcmF0aW9uIGV4dGVuZHMgRGVjbGFyYXRpb24ge1xuICAgIHByb3RlY3RlZCBzdWJzY3JpcHRpb246IEV2ZW50U3Vic2NyaXB0aW9uO1xuICAgIHByb3RlY3RlZCBtYXRjaGVyOiBFdmVudE1hdGNoZXI7XG4gICAgcHJvdGVjdGVkIGV4ZWN1dG9yOiBTdWJzY3JpcHRpb25FeGVjdXRvcjtcblxuICAgIGNvbnN0cnVjdG9yKG5vZGU6IE5vZGUsIG1hdGNoZXI6IEV2ZW50TWF0Y2hlciwgZXhlY3V0b3I6IFN1YnNjcmlwdGlvbkV4ZWN1dG9yKSB7XG4gICAgICAgIHN1cGVyKG5vZGUpO1xuXG4gICAgICAgIHRoaXMubWF0Y2hlciA9IG1hdGNoZXI7XG4gICAgICAgIHRoaXMuZXhlY3V0b3IgPSBleGVjdXRvcjtcblxuICAgICAgICB0aGlzLnN1YnNjcmlwdGlvbiA9IG5ldyBFdmVudFN1YnNjcmlwdGlvbih0aGlzLm5vZGUsIHRoaXMubWF0Y2hlciwgdGhpcy5leGVjdXRvcik7ICAgIFxuICAgIH1cblxuICAgIGluc3BlY3QoKTogdm9pZCB7XG4gICAgICAgICg8YW55PmNvbnNvbGUuZ3JvdXBDb2xsYXBzZWQpKCdvbicsIHRoaXMubWF0Y2hlcik7XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKHRoaXMuZXhlY3V0b3IpO1xuICAgICAgICB9ZmluYWxseXtcbiAgICAgICAgICAgIGNvbnNvbGUuZ3JvdXBFbmQoKTtcbiAgICAgICAgfVxuICAgIH1cbn0iLCJpbXBvcnQgeyBEZWNsYXJhdGlvbiB9IGZyb20gJy4vZGVjbGFyYXRpb24nO1xuaW1wb3J0IHsgTm9kZU1hdGNoZXIgfSBmcm9tICcuLi9ub2RlX2NvbGxlY3Rvcic7XG5pbXBvcnQgeyBTY29wZSwgU2NvcGVFeGVjdXRvciB9IGZyb20gJy4uL3Njb3BlJztcblxuZXhwb3J0IHsgTm9kZU1hdGNoZXIsIFNjb3BlRXhlY3V0b3IgfTtcblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIFNjb3BlVHJhY2tpbmdEZWNsYXJhdGlvbiBleHRlbmRzIERlY2xhcmF0aW9uIHtcbiAgICBwcml2YXRlIHJlYWRvbmx5IGNoaWxkU2NvcGVzOiBTY29wZVtdID0gW107XG4gICAgXG4gICAgZGVhY3RpdmF0ZSgpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5yZW1vdmVBbGxDaGlsZFNjb3BlcygpO1xuICAgICAgICBzdXBlci5kZWFjdGl2YXRlKCk7XG4gICAgfVxuXG4gICAgZ2V0Q2hpbGRTY29wZXMoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmNoaWxkU2NvcGVzO1xuICAgIH1cblxuICAgIHByb3RlY3RlZCBpbnNwZWN0Q2hpbGRTY29wZXMoaW5jbHVkZVNvdXJjZT86IGJvb2xlYW4pOiB2b2lkIHsgICAgICAgIFxuICAgICAgICBmb3IobGV0IGNoaWxkU2NvcGUgb2YgdGhpcy5jaGlsZFNjb3Blcykge1xuICAgICAgICAgICAgY2hpbGRTY29wZS5pbnNwZWN0KGluY2x1ZGVTb3VyY2UpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJvdGVjdGVkIGFkZENoaWxkU2NvcGUoc2NvcGU6IFNjb3BlKSB7XG4gICAgICAgIGlmKHRoaXMuaXNBY3RpdmF0ZWQpIHtcbiAgICAgICAgICAgIHRoaXMuY2hpbGRTY29wZXMucHVzaChzY29wZSk7XG5cbiAgICAgICAgICAgIHNjb3BlLmFjdGl2YXRlKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcm90ZWN0ZWQgcmVtb3ZlQ2hpbGRTY29wZShzY29wZTogU2NvcGUpIHsgXG4gICAgICAgIHNjb3BlLmRlYWN0aXZhdGUoKTtcblxuICAgICAgICBpZih0aGlzLmlzQWN0aXZhdGVkKSB7XG4gICAgICAgICAgICBsZXQgaW5kZXggPSB0aGlzLmNoaWxkU2NvcGVzLmluZGV4T2Yoc2NvcGUpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBpZihpbmRleCA+PSAwKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5jaGlsZFNjb3Blcy5zcGxpY2UoaW5kZXgsIDEpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJvdGVjdGVkIHJlbW92ZUFsbENoaWxkU2NvcGVzKCkge1xuICAgICAgICBsZXQgY2hpbGRTY29wZTogU2NvcGU7XG5cbiAgICAgICAgd2hpbGUoY2hpbGRTY29wZSA9IHRoaXMuY2hpbGRTY29wZXNbMF0pIHtcbiAgICAgICAgICAgIHRoaXMucmVtb3ZlQ2hpbGRTY29wZShjaGlsZFNjb3BlKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByb3RlY3RlZCBhZGRDaGlsZFNjb3BlQnlOb2RlKG5vZGU6IE5vZGUsIGV4ZWN1dG9yPzogU2NvcGVFeGVjdXRvcikge1xuICAgICAgICBsZXQgY2hpbGRTY29wZSA9IG5ldyBTY29wZShub2RlLCBleGVjdXRvcik7XG5cbiAgICAgICAgdGhpcy5hZGRDaGlsZFNjb3BlKGNoaWxkU2NvcGUpO1xuICAgIH1cblxuICAgIHByb3RlY3RlZCByZW1vdmVDaGlsZFNjb3BlQnlOb2RlKG5vZGU6IE5vZGUpIHtcbiAgICAgICAgZm9yKGxldCBjaGlsZFNjb3BlIG9mIHRoaXMuY2hpbGRTY29wZXMpIHtcbiAgICAgICAgICAgIGlmKGNoaWxkU2NvcGUuZ2V0Tm9kZSgpID09PSBub2RlKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5yZW1vdmVDaGlsZFNjb3BlKGNoaWxkU2NvcGUpO1xuICAgICAgICAgICAgICAgIHJldHVybjsgLy8gbG9vcCBtdXN0IGV4aXN0IHRvIGF2b2lkIGRhdGEtcmFjZVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxufSIsImltcG9ydCB7IFNjb3BlVHJhY2tpbmdEZWNsYXJhdGlvbiwgTm9kZU1hdGNoZXIsIFNjb3BlRXhlY3V0b3IgfSBmcm9tICcuL3Njb3BlX3RyYWNraW5nX2RlY2xhcmF0aW9uJztcbmltcG9ydCB7IE1hdGNoaW5nTm9kZXNTdWJzY3JpcHRpb24sIE1hdGNoaW5nTm9kZXNDaGFuZ2VkRXZlbnQgfSBmcm9tICcuLi9zdWJzY3JpcHRpb25zL21hdGNoaW5nX25vZGVzX3N1YnNjcmlwdGlvbic7XG5cbmV4cG9ydCB7IE5vZGVNYXRjaGVyLCBTY29wZUV4ZWN1dG9yIH07XG5cbmV4cG9ydCBjbGFzcyBTZWxlY3REZWNsYXJhdGlvbiBleHRlbmRzIFNjb3BlVHJhY2tpbmdEZWNsYXJhdGlvbiB7XG4gICAgcHJvdGVjdGVkIHN1YnNjcmlwdGlvbjogTWF0Y2hpbmdOb2Rlc1N1YnNjcmlwdGlvbjtcbiAgICBwcm90ZWN0ZWQgbWF0Y2hlcjogTm9kZU1hdGNoZXI7XG4gICAgcHJvdGVjdGVkIGV4ZWN1dG9yOiBTY29wZUV4ZWN1dG9yO1xuXG4gICAgY29uc3RydWN0b3Iobm9kZTogTm9kZSwgbWF0Y2hlcjogTm9kZU1hdGNoZXIsIGV4ZWN1dG9yOiBTY29wZUV4ZWN1dG9yKSB7XG4gICAgICAgIHN1cGVyKG5vZGUpO1xuXG4gICAgICAgIHRoaXMubWF0Y2hlciA9IG1hdGNoZXI7XG4gICAgICAgIHRoaXMuZXhlY3V0b3IgPSBleGVjdXRvcjtcblxuICAgICAgICB0aGlzLnN1YnNjcmlwdGlvbiA9IG5ldyBNYXRjaGluZ05vZGVzU3Vic2NyaXB0aW9uKHRoaXMubm9kZSwgdGhpcy5tYXRjaGVyLCAoZXZlbnQ6IE1hdGNoaW5nTm9kZXNDaGFuZ2VkRXZlbnQpID0+IHtcbiAgICAgICAgICAgIGZvcihsZXQgbm9kZSBvZiBldmVudC5hZGRlZE5vZGVzKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5hZGRDaGlsZFNjb3BlQnlOb2RlKG5vZGUsIHRoaXMuZXhlY3V0b3IpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmb3IobGV0IG5vZGUgb2YgZXZlbnQucmVtb3ZlZE5vZGVzKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5yZW1vdmVDaGlsZFNjb3BlQnlOb2RlKG5vZGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBpbnNwZWN0KGluY2x1ZGVTb3VyY2U/OiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgICg8YW55PmNvbnNvbGUuZ3JvdXBDb2xsYXBzZWQpKCdzZWxlY3QnLCB0aGlzLm1hdGNoZXIpO1xuXG4gICAgICAgIHRyeXtcbiAgICAgICAgICAgIHRoaXMuaW5zcGVjdENoaWxkU2NvcGVzKGluY2x1ZGVTb3VyY2UpOyAgICAgICAgXG4gICAgICAgIH1maW5hbGx5e1xuICAgICAgICAgICAgY29uc29sZS5ncm91cEVuZCgpO1xuICAgICAgICB9XG4gICAgfVxufSIsImltcG9ydCB7IERlY2xhcmF0aW9uIH0gZnJvbSAnLi9kZWNsYXJhdGlvbic7XG5pbXBvcnQgeyBUcml2aWFsU3Vic2NyaXB0aW9uLCBTdWJzY3JpcHRpb25FeGVjdXRvciB9IGZyb20gJy4uL3N1YnNjcmlwdGlvbnMvdHJpdmlhbF9zdWJzY3JpcHRpb24nO1xuXG5leHBvcnQgeyBTdWJzY3JpcHRpb25FeGVjdXRvciB9O1xuXG5leHBvcnQgY2xhc3MgVW5tYXRjaERlY2xhcmF0aW9uIGV4dGVuZHMgRGVjbGFyYXRpb24ge1xuICAgIHByb3RlY3RlZCBzdWJzY3JpcHRpb246IFRyaXZpYWxTdWJzY3JpcHRpb247XG4gICAgcHJvdGVjdGVkIGV4ZWN1dG9yOiBTdWJzY3JpcHRpb25FeGVjdXRvcjtcblxuICAgIGNvbnN0cnVjdG9yKG5vZGU6IE5vZGUsIGV4ZWN1dG9yOiBTdWJzY3JpcHRpb25FeGVjdXRvcikge1xuICAgICAgICBzdXBlcihub2RlKTtcblxuICAgICAgICB0aGlzLmV4ZWN1dG9yID0gZXhlY3V0b3I7XG5cbiAgICAgICAgdGhpcy5zdWJzY3JpcHRpb24gPSBuZXcgVHJpdmlhbFN1YnNjcmlwdGlvbih0aGlzLm5vZGUsIHsgZGlzY29ubmVjdGVkOiB0cnVlIH0sIHRoaXMuZXhlY3V0b3IpO1xuICAgIH1cblxuICAgIGluc3BlY3QoKTogdm9pZCB7XG4gICAgICAgIGNvbnNvbGUuZ3JvdXBDb2xsYXBzZWQoJ3VubWF0Y2hlcycpO1xuICAgICAgICBjb25zb2xlLmxvZyh0aGlzLmV4ZWN1dG9yKTtcbiAgICAgICAgY29uc29sZS5ncm91cEVuZCgpO1xuICAgIH1cbn0iLCJpbXBvcnQgeyBTY29wZVRyYWNraW5nRGVjbGFyYXRpb24sIE5vZGVNYXRjaGVyLCBTY29wZUV4ZWN1dG9yIH0gZnJvbSAnLi9zY29wZV90cmFja2luZ19kZWNsYXJhdGlvbic7XG5pbXBvcnQgeyBOb2RlTWF0Y2hlc1N1YnNjcmlwdGlvbiwgTm9kZU1hdGNoZXNDaGFuZ2VkRXZlbnQgfSBmcm9tICcuLi9zdWJzY3JpcHRpb25zL25vZGVfbWF0Y2hlc19zdWJzY3JpcHRpb24nO1xuXG5leHBvcnQgeyBOb2RlTWF0Y2hlciwgU2NvcGVFeGVjdXRvciB9O1xuXG5leHBvcnQgY2xhc3MgV2hlbkRlY2xhcmF0aW9uIGV4dGVuZHMgU2NvcGVUcmFja2luZ0RlY2xhcmF0aW9uIHtcbiAgICBwcm90ZWN0ZWQgc3Vic2NyaXB0aW9uOiBOb2RlTWF0Y2hlc1N1YnNjcmlwdGlvbjtcbiAgICBwcm90ZWN0ZWQgbWF0Y2hlcjogTm9kZU1hdGNoZXI7XG4gICAgcHJvdGVjdGVkIGV4ZWN1dG9yOiBTY29wZUV4ZWN1dG9yO1xuXG4gICAgY29uc3RydWN0b3Iobm9kZTogTm9kZSwgbWF0Y2hlcjogTm9kZU1hdGNoZXIsIGV4ZWN1dG9yOiBTY29wZUV4ZWN1dG9yKSB7XG4gICAgICAgIHN1cGVyKG5vZGUpO1xuXG4gICAgICAgIHRoaXMubWF0Y2hlciA9IG1hdGNoZXI7XG4gICAgICAgIHRoaXMuZXhlY3V0b3IgPSBleGVjdXRvcjtcblxuICAgICAgICB0aGlzLnN1YnNjcmlwdGlvbiA9IG5ldyBOb2RlTWF0Y2hlc1N1YnNjcmlwdGlvbih0aGlzLm5vZGUsIHRoaXMubWF0Y2hlciwgKGV2ZW50OiBOb2RlTWF0Y2hlc0NoYW5nZWRFdmVudCkgPT4ge1xuICAgICAgICAgICAgaWYoZXZlbnQuaXNNYXRjaGluZykge1xuICAgICAgICAgICAgICAgIHRoaXMuYWRkQ2hpbGRTY29wZUJ5Tm9kZSh0aGlzLm5vZGUsIHRoaXMuZXhlY3V0b3IpO1xuICAgICAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICAgICAgdGhpcy5yZW1vdmVDaGlsZFNjb3BlQnlOb2RlKHRoaXMubm9kZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGluc3BlY3QoaW5jbHVkZVNvdXJjZT86IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgKDxhbnk+Y29uc29sZS5ncm91cENvbGxhcHNlZCkoJ3doZW4nLCB0aGlzLm1hdGNoZXIpO1xuXG4gICAgICAgIHRyeXtcbiAgICAgICAgICAgIHRoaXMuaW5zcGVjdENoaWxkU2NvcGVzKGluY2x1ZGVTb3VyY2UpOyAgICAgICAgXG4gICAgICAgIH1maW5hbGx5e1xuICAgICAgICAgICAgY29uc29sZS5ncm91cEVuZCgpO1xuICAgICAgICB9XG4gICAgfVxufSIsImV4cG9ydCBpbnRlcmZhY2UgTm9kZVZpc3RvciB7IChub2RlOiBOb2RlKTogTm9kZU1hdGNoZXIgfCBib29sZWFuIH1cbmV4cG9ydCBkZWNsYXJlIHR5cGUgTm9kZU1hdGNoZXIgPSBzdHJpbmcgfCBOb2RlTGlzdE9mPE5vZGU+IHwgTm9kZVtdIHwgTm9kZVZpc3RvcjtcblxuZXhwb3J0IGNsYXNzIE5vZGVDb2xsZWN0b3Ige1xuICAgIHByaXZhdGUgc3RhdGljIGluc3RhbmNlOiBOb2RlQ29sbGVjdG9yO1xuICAgIFxuICAgIHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IEVMRU1FTlRfTUFUQ0hFUl9UWVBFX0VSUk9SX01FU1NBR0UgPSBcIkRlY2w6IEFuIGBOb2RlTWF0Y2hlcmAgbXVzdCBiZSBhIENTUyBzZWxlY3RvciAoc3RyaW5nKSBvciBhIGZ1bmN0aW9uIHdoaWNoIHRha2VzIGEgbm9kZSB1bmRlciBjb25zaWRlcmF0aW9uIGFuZCByZXR1cm5zIGEgQ1NTIHNlbGVjdG9yIChzdHJpbmcpIHRoYXQgbWF0Y2hlcyBhbGwgbWF0Y2hpbmcgbm9kZXMgaW4gdGhlIHN1YnRyZWUsIGFuIGFycmF5LWxpa2Ugb2JqZWN0IG9mIG1hdGNoaW5nIG5vZGVzIGluIHRoZSBzdWJ0cmVlLCBvciBhIGJvb2xlYW4gdmFsdWUgYXMgdG8gd2hldGhlciB0aGUgbm9kZSBzaG91bGQgYmUgaW5jbHVkZWQgKGluIHRoaXMgY2FzZSwgdGhlIGZ1bmN0aW9uIHdpbGwgYmUgaW52b2tlZCBhZ2FpbiBmb3IgYWxsIGNoaWxkcmVuIG9mIHRoZSBub2RlKS5cIjtcblxuICAgIHN0YXRpYyBpc01hdGNoaW5nTm9kZShyb290Tm9kZTogTm9kZSwgbm9kZU1hdGNoZXI6IE5vZGVNYXRjaGVyKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldEluc3RhbmNlKCkuaXNNYXRjaGluZ05vZGUocm9vdE5vZGUsIG5vZGVNYXRjaGVyKTtcbiAgICB9XG5cbiAgICBzdGF0aWMgY29sbGVjdE1hdGNoaW5nTm9kZXMocm9vdE5vZGU6IE5vZGUsIG5vZGVNYXRjaGVyOiBOb2RlTWF0Y2hlcik6IE5vZGVbXSB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldEluc3RhbmNlKCkuY29sbGVjdE1hdGNoaW5nTm9kZXMocm9vdE5vZGUsIG5vZGVNYXRjaGVyKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHN0YXRpYyBnZXRJbnN0YW5jZSgpIDogTm9kZUNvbGxlY3RvciB7XG4gICAgICAgIHJldHVybiB0aGlzLmluc3RhbmNlIHx8ICh0aGlzLmluc3RhbmNlID0gbmV3IE5vZGVDb2xsZWN0b3IoKSk7XG4gICAgfVxuXG4gICAgaXNNYXRjaGluZ05vZGUobm9kZTogTm9kZSwgbm9kZU1hdGNoZXI6IE5vZGVNYXRjaGVyKTogYm9vbGVhbiB7XG4gICAgICAgIHN3aXRjaCh0eXBlb2Yobm9kZU1hdGNoZXIpKSB7XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoTm9kZUNvbGxlY3Rvci5FTEVNRU5UX01BVENIRVJfVFlQRV9FUlJPUl9NRVNTQUdFKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgICAgICAgICAgICAgbGV0IGNzc1NlbGVjdG9yOiBzdHJpbmcgPSA8c3RyaW5nPm5vZGVNYXRjaGVyO1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmlzTWF0Y2hpbmdOb2RlRnJvbUNzc1NlbGVjdG9yKG5vZGUsIGNzc1NlbGVjdG9yKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgICAgICAgICAgICBsZXQgb2JqZWN0ID0gPE9iamVjdD5ub2RlTWF0Y2hlcjtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5pc01hdGNoaW5nTm9kZUZyb21PYmplY3Qobm9kZSwgb2JqZWN0KTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIGNhc2UgJ2Z1bmN0aW9uJzpcbiAgICAgICAgICAgICAgICBsZXQgbm9kZVZpc3RvciA9IDxOb2RlVmlzdG9yPm5vZGVNYXRjaGVyO1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmlzTWF0Y2hpbmdOb2RlRnJvbU5vZGVWaXN0b3Iobm9kZSwgbm9kZVZpc3Rvcik7ICAgICAgIFxuICAgICAgICB9XG4gICAgfVxuXG4gICAgY29sbGVjdE1hdGNoaW5nTm9kZXMobm9kZTogTm9kZSwgbm9kZU1hdGNoZXI6IE5vZGVNYXRjaGVyKTogTm9kZVtdIHtcbiAgICAgICAgc3dpdGNoKHR5cGVvZihub2RlTWF0Y2hlcikpIHtcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihOb2RlQ29sbGVjdG9yLkVMRU1FTlRfTUFUQ0hFUl9UWVBFX0VSUk9SX01FU1NBR0UpO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgICAgICAgICAgICBsZXQgY3NzU2VsZWN0b3I6IHN0cmluZyA9IDxzdHJpbmc+bm9kZU1hdGNoZXI7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuY29sbGVjdE1hdGNoaW5nTm9kZXNGcm9tQ3NzU2VsZWN0b3Iobm9kZSwgY3NzU2VsZWN0b3IpO1xuXG4gICAgICAgICAgICBjYXNlICdvYmplY3QnOlxuICAgICAgICAgICAgICAgIGxldCBvYmplY3QgPSA8T2JqZWN0Pm5vZGVNYXRjaGVyO1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmNvbGxlY3RNYXRjaGluZ05vZGVzRnJvbU9iamVjdChub2RlLCBvYmplY3QpO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgY2FzZSAnZnVuY3Rpb24nOlxuICAgICAgICAgICAgICAgIGxldCBub2RlVmlzdG9yID0gPE5vZGVWaXN0b3I+bm9kZU1hdGNoZXI7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuY29sbGVjdE1hdGNoaW5nTm9kZXNGcm9tTm9kZVZpc3Rvcihub2RlLCBub2RlVmlzdG9yKTsgICAgICAgXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGlzTWF0Y2hpbmdOb2RlRnJvbUNzc1NlbGVjdG9yKG5vZGU6IE5vZGUsIGNzc1NlbGVjdG9yOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICAgICAgaWYobm9kZSBpbnN0YW5jZW9mIEVsZW1lbnQgJiYgdHlwZW9mKG5vZGUubWF0Y2hlcykgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIHJldHVybiBub2RlLm1hdGNoZXMoY3NzU2VsZWN0b3IpO1xuICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgIHJldHVybiBpc01lbWJlck9mQXJyYXlMaWtlKG5vZGUub3duZXJEb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKGNzc1NlbGVjdG9yKSwgbm9kZSk7ICAgICAgICAgICAgXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGlzTWF0Y2hpbmdOb2RlRnJvbU9iamVjdChub2RlOiBOb2RlLCBvYmplY3Q6IE9iamVjdCk6IGJvb2xlYW4ge1xuICAgICAgICBpZihvYmplY3QgPT09IG51bGwpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICBpZihpc0FycmF5TGlrZShvYmplY3QpKSB7XG4gICAgICAgICAgICAgICAgbGV0IGFycmF5TGlrZSA9IDxBcnJheUxpa2U8YW55Pj5vYmplY3Q7XG5cbiAgICAgICAgICAgICAgICBpZihhcnJheUxpa2UubGVuZ3RoID09PSAwIHx8IGFycmF5TGlrZVswXSBpbnN0YW5jZW9mIE5vZGUpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGlzTWVtYmVyT2ZBcnJheUxpa2UoYXJyYXlMaWtlLCBub2RlKTsgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoTm9kZUNvbGxlY3Rvci5FTEVNRU5UX01BVENIRVJfVFlQRV9FUlJPUl9NRVNTQUdFKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKE5vZGVDb2xsZWN0b3IuRUxFTUVOVF9NQVRDSEVSX1RZUEVfRVJST1JfTUVTU0FHRSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGlzTWF0Y2hpbmdOb2RlRnJvbU5vZGVWaXN0b3Iobm9kZTogTm9kZSwgbm9kZVZpc3RvcjogTm9kZVZpc3Rvcik6IGJvb2xlYW4ge1xuICAgICAgICBsZXQgdmlzaXRvclJlc3VsdCA9IG5vZGVWaXN0b3Iobm9kZSk7XG5cbiAgICAgICAgaWYodHlwZW9mKHZpc2l0b3JSZXN1bHQpID09PSAnYm9vbGVhbicpIHtcbiAgICAgICAgICAgIGxldCBpc01hdGNoID0gPGJvb2xlYW4+dmlzaXRvclJlc3VsdDtcbiAgICAgICAgICAgIHJldHVybiBpc01hdGNoO1xuICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgIGxldCBub2RlTWF0Y2hlciA9IDxOb2RlTWF0Y2hlcj52aXNpdG9yUmVzdWx0O1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuaXNNYXRjaGluZ05vZGUobm9kZSwgbm9kZU1hdGNoZXIpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBjb2xsZWN0TWF0Y2hpbmdOb2Rlc0Zyb21Dc3NTZWxlY3Rvcihub2RlOiBOb2RlLCBjc3NTZWxlY3Rvcjogc3RyaW5nKTogTm9kZVtdIHtcbiAgICAgICAgaWYobm9kZSBpbnN0YW5jZW9mIEVsZW1lbnQgfHwgbm9kZSBpbnN0YW5jZW9mIERvY3VtZW50IHx8IG5vZGUgaW5zdGFuY2VvZiBEb2N1bWVudEZyYWdtZW50KSB7XG4gICAgICAgICAgICByZXR1cm4gdG9BcnJheTxOb2RlPihub2RlLnF1ZXJ5U2VsZWN0b3JBbGwoY3NzU2VsZWN0b3IpKTtcbiAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGNvbGxlY3RNYXRjaGluZ05vZGVzRnJvbU9iamVjdChfbm9kZTogTm9kZSwgb2JqZWN0OiBPYmplY3QpOiBOb2RlW10ge1xuICAgICAgICBpZihvYmplY3QgPT09IG51bGwpIHtcbiAgICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICBpZihpc0FycmF5TGlrZShvYmplY3QpKSB7XG4gICAgICAgICAgICAgICAgbGV0IGFycmF5TGlrZSA9IDxBcnJheUxpa2U8YW55Pj5vYmplY3Q7XG5cbiAgICAgICAgICAgICAgICBpZihhcnJheUxpa2UubGVuZ3RoID09PSAwIHx8IGFycmF5TGlrZVswXSBpbnN0YW5jZW9mIE5vZGUpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRvQXJyYXk8Tm9kZT4oYXJyYXlMaWtlKTsgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoTm9kZUNvbGxlY3Rvci5FTEVNRU5UX01BVENIRVJfVFlQRV9FUlJPUl9NRVNTQUdFKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKE5vZGVDb2xsZWN0b3IuRUxFTUVOVF9NQVRDSEVSX1RZUEVfRVJST1JfTUVTU0FHRSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGNvbGxlY3RNYXRjaGluZ05vZGVzRnJvbU5vZGVWaXN0b3Iobm9kZTogTm9kZSwgbm9kZVZpc3RvcjogTm9kZVZpc3Rvcik6IE5vZGVbXSB7XG4gICAgICAgIGxldCBub2RlczogTm9kZVtdID0gW107XG4gICAgICAgIGxldCBjaGlsZE5vZGVzID0gbm9kZS5jaGlsZE5vZGVzO1xuICAgICAgICBcbiAgICAgICAgZm9yKGxldCBpbmRleCA9IDAsIGxlbmd0aCA9IGNoaWxkTm9kZXMubGVuZ3RoOyBpbmRleCA8IGxlbmd0aDsgaW5kZXgrKykge1xuICAgICAgICAgICAgbGV0IGNoaWxkID0gY2hpbGROb2Rlc1tpbmRleF07XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGlmKGNoaWxkIGluc3RhbmNlb2YgTm9kZSkge1xuICAgICAgICAgICAgICAgIGxldCBub2RlOiBOb2RlID0gY2hpbGQ7XG4gICAgICAgICAgICAgICAgbGV0IHZpc2l0b3JSZXN1bHQgPSBub2RlVmlzdG9yKG5vZGUpO1xuXG4gICAgICAgICAgICAgICAgaWYodHlwZW9mKHZpc2l0b3JSZXN1bHQpID09PSAnYm9vbGVhbicpIHtcbiAgICAgICAgICAgICAgICAgICAgbGV0IGlzTWF0Y2ggPSA8Ym9vbGVhbj52aXNpdG9yUmVzdWx0O1xuXG4gICAgICAgICAgICAgICAgICAgIGlmKGlzTWF0Y2gpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG5vZGVzLnB1c2gobm9kZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgICAgICAgICAgbm9kZXMucHVzaCguLi50aGlzLmNvbGxlY3RNYXRjaGluZ05vZGVzKG5vZGUsIHZpc2l0b3JSZXN1bHQpKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gbm9kZXM7XG4gICAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBOb2RlQ29sbGVjdG9yO1xuXG5mdW5jdGlvbiBpc0FycmF5TGlrZSh2YWx1ZTogYW55KSB7XG4gICAgcmV0dXJuIHR5cGVvZih2YWx1ZSkgPT09ICdvYmplY3QnICYmIHR5cGVvZih2YWx1ZS5sZW5ndGgpID09PSAnbnVtYmVyJztcbn1cblxuZnVuY3Rpb24gdG9BcnJheTxUPihhcnJheUxpa2U6IEFycmF5TGlrZTxUPik6IEFycmF5PFQ+IHtcbiAgICBpZihpc0FycmF5TGlrZShhcnJheUxpa2UpKSB7XG4gICAgICAgIHJldHVybiBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcnJheUxpa2UsIDApO1xuICAgIH1lbHNle1xuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdFeHBlY3RlZCBBcnJheUxpa2UnKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGlzTWVtYmVyT2ZBcnJheUxpa2UoaGF5c3RhY2s6IEFycmF5TGlrZTxhbnk+LCAgbmVlZGxlOiBhbnkpIHtcbiAgICByZXR1cm4gQXJyYXkucHJvdG90eXBlLmluZGV4T2YuY2FsbChoYXlzdGFjaywgbmVlZGxlKSAhPT0gLTE7XG59XG4iLCJpbXBvcnQgeyBEZWNsYXJhdGlvbiwgU3Vic2NyaXB0aW9uRXhlY3V0b3IgfSBmcm9tICcuL2RlY2xhcmF0aW9ucy9kZWNsYXJhdGlvbic7XG5pbXBvcnQgeyBNYXRjaERlY2xhcmF0aW9uIH0gZnJvbSAnLi9kZWNsYXJhdGlvbnMvbWF0Y2hfZGVjbGFyYXRpb24nO1xuaW1wb3J0IHsgVW5tYXRjaERlY2xhcmF0aW9uIH0gZnJvbSAnLi9kZWNsYXJhdGlvbnMvdW5tYXRjaF9kZWNsYXJhdGlvbic7XG5pbXBvcnQgeyBPbkRlY2xhcmF0aW9uLCBFdmVudE1hdGNoZXIgfSBmcm9tICcuL2RlY2xhcmF0aW9ucy9vbl9kZWNsYXJhdGlvbic7XG5cbmltcG9ydCB7IE5vZGVNYXRjaGVyIH0gZnJvbSAnLi9kZWNsYXJhdGlvbnMvc2NvcGVfdHJhY2tpbmdfZGVjbGFyYXRpb24nO1xuaW1wb3J0IHsgU2VsZWN0RGVjbGFyYXRpb24gfSBmcm9tICcuL2RlY2xhcmF0aW9ucy9zZWxlY3RfZGVjbGFyYXRpb24nO1xuaW1wb3J0IHsgV2hlbkRlY2xhcmF0aW9uIH0gZnJvbSAnLi9kZWNsYXJhdGlvbnMvd2hlbl9kZWNsYXJhdGlvbic7XG5cbmV4cG9ydCB7IERlY2xhcmF0aW9uLCBTdWJzY3JpcHRpb25FeGVjdXRvciwgTm9kZU1hdGNoZXIsIEV2ZW50TWF0Y2hlciB9O1xuXG5leHBvcnQgaW50ZXJmYWNlIFNjb3BlRXhlY3V0b3IgeyBcbiAgICAoc2NvcGU6IFNjb3BlLCBub2RlOiBOb2RlKTogdm9pZFxufTtcblxuZXhwb3J0IGNsYXNzIFNjb3BlIHtcbiAgICBzdGF0aWMgYnVpbGRSb290U2NvcGUobm9kZTogTm9kZSk6IFNjb3BlIHtcbiAgICAgICAgbGV0IHNjb3BlID0gbmV3IFNjb3BlKG5vZGUpO1xuICAgICAgICBzY29wZS5hY3RpdmF0ZSgpO1xuXG4gICAgICAgIHJldHVybiBzY29wZTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHJlYWRvbmx5IG5vZGU6IE5vZGU7XG4gICAgcHJpdmF0ZSByZWFkb25seSBleGVjdXRvcnM6IFNjb3BlRXhlY3V0b3JbXSA9IFtdO1xuXG4gICAgcHJpdmF0ZSBpc0FjdGl2YXRlZDogYm9vbGVhbiA9IGZhbHNlO1xuICAgIHByaXZhdGUgZGVjbGFyYXRpb25zOiBEZWNsYXJhdGlvbltdID0gW107XG5cbiAgICBjb25zdHJ1Y3Rvcihub2RlOiBOb2RlLCBleGVjdXRvcj86IFNjb3BlRXhlY3V0b3IpIHtcbiAgICAgICAgdGhpcy5ub2RlID0gbm9kZTtcblxuICAgICAgICBpZihleGVjdXRvcikge1xuICAgICAgICAgICAgdGhpcy5hZGRFeGVjdXRvcihleGVjdXRvcik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBhZGRFeGVjdXRvcihleGVjdXRvcjogU2NvcGVFeGVjdXRvcik6IHZvaWQge1xuICAgICAgICB0aGlzLmV4ZWN1dG9ycy5wdXNoKGV4ZWN1dG9yKTtcblxuICAgICAgICByZXR1cm4gZXhlY3V0b3IuY2FsbCh0aGlzLCB0aGlzLCB0aGlzLm5vZGUpO1xuICAgIH1cblxuICAgIGdldE5vZGUoKTogTm9kZSB7XG4gICAgICAgIHJldHVybiB0aGlzLm5vZGU7XG4gICAgfVxuXG4gICAgZ2V0RGVjbGFyYXRpb25zKCk6IERlY2xhcmF0aW9uW10ge1xuICAgICAgICByZXR1cm4gdGhpcy5kZWNsYXJhdGlvbnM7XG4gICAgfVxuXG4gICAgaW5zcGVjdChpbmNsdWRlU291cmNlPzogYm9vbGVhbik6IHZvaWQge1xuICAgICAgICAoPGFueT5jb25zb2xlLmdyb3VwQ29sbGFwc2VkKSh0aGlzLm5vZGUpO1xuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBpZihpbmNsdWRlU291cmNlKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5ncm91cENvbGxhcHNlZCgnc291cmNlJyk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBmb3IobGV0IGV4ZWN1dG9yIG9mIHRoaXMuZXhlY3V0b3JzKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGV4ZWN1dG9yKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBjb25zb2xlLmdyb3VwRW5kKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGZvcihsZXQgZGVjbGFyYXRpb24gb2YgdGhpcy5kZWNsYXJhdGlvbnMpIHtcbiAgICAgICAgICAgICAgICBkZWNsYXJhdGlvbi5pbnNwZWN0KGluY2x1ZGVTb3VyY2UpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9ZmluYWxseXtcbiAgICAgICAgICAgICg8YW55PmNvbnNvbGUuZ3JvdXBFbmQpKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBhY3RpdmF0ZSgpOiB2b2lkIHtcbiAgICAgICAgaWYoIXRoaXMuaXNBY3RpdmF0ZWQpIHtcbiAgICAgICAgICAgIHRoaXMuaXNBY3RpdmF0ZWQgPSB0cnVlO1xuXG4gICAgICAgICAgICBmb3IobGV0IGRlY2xhcmF0aW9uIG9mIHRoaXMuZGVjbGFyYXRpb25zKSB7XG4gICAgICAgICAgICAgICAgZGVjbGFyYXRpb24uYWN0aXZhdGUoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGRlYWN0aXZhdGUoKTogdm9pZCB7ICAgICAgICBcbiAgICAgICAgaWYodGhpcy5pc0FjdGl2YXRlZCkge1xuICAgICAgICAgICAgdGhpcy5pc0FjdGl2YXRlZCA9IGZhbHNlOyAgICAgICAgICAgIFxuICAgICAgICAgICAgXG4gICAgICAgICAgICBmb3IobGV0IGRlY2xhcmF0aW9uIG9mIHRoaXMuZGVjbGFyYXRpb25zKSB7XG4gICAgICAgICAgICAgICAgZGVjbGFyYXRpb24uZGVhY3RpdmF0ZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpc3RpbmUoKTogdm9pZCB7XG4gICAgICAgIHRoaXMuZGVhY3RpdmF0ZSgpO1xuICAgICAgICB0aGlzLnJlbW92ZUFsbERlY2xhcmF0aW9ucygpO1xuICAgIH1cblxuICAgIG1hdGNoKGV4ZWN1dG9yOiBTdWJzY3JpcHRpb25FeGVjdXRvcik6IFNjb3BlIHtcbiAgICAgICAgdGhpcy5hZGREZWNsYXJhdGlvbihuZXcgTWF0Y2hEZWNsYXJhdGlvbih0aGlzLm5vZGUsIGV4ZWN1dG9yKSk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgdW5tYXRjaChleGVjdXRvcjogU3Vic2NyaXB0aW9uRXhlY3V0b3IpOiBTY29wZSB7XG4gICAgICAgIHRoaXMuYWRkRGVjbGFyYXRpb24obmV3IFVubWF0Y2hEZWNsYXJhdGlvbih0aGlzLm5vZGUsIGV4ZWN1dG9yKSk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgc2VsZWN0KG1hdGNoZXI6IE5vZGVNYXRjaGVyLCBleGVjdXRvcjogU2NvcGVFeGVjdXRvcik6IFNjb3BlIHtcbiAgICAgICAgdGhpcy5hZGREZWNsYXJhdGlvbihuZXcgU2VsZWN0RGVjbGFyYXRpb24odGhpcy5ub2RlLCBtYXRjaGVyLCBleGVjdXRvcikpO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHdoZW4obWF0Y2hlcjogTm9kZU1hdGNoZXIsIGV4ZWN1dG9yOiBTY29wZUV4ZWN1dG9yKTogU2NvcGUge1xuXHRcdHRoaXMuYWRkRGVjbGFyYXRpb24obmV3IFdoZW5EZWNsYXJhdGlvbih0aGlzLm5vZGUsIG1hdGNoZXIsIGV4ZWN1dG9yKSk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgb24oZXZlbnRNYXRjaGVyOiBFdmVudE1hdGNoZXIsIGV4ZWN1dG9yOiBTdWJzY3JpcHRpb25FeGVjdXRvcik6IFNjb3BlO1xuICAgIG9uKGV2ZW50TWF0Y2hlcjogRXZlbnRNYXRjaGVyLCBub2RlTWF0Y2hlcjogTm9kZU1hdGNoZXIsIGV4ZWN1dG9yOiBTdWJzY3JpcHRpb25FeGVjdXRvcik6IFNjb3BlO1xuICAgIG9uKGV2ZW50TWF0Y2hlcjogRXZlbnRNYXRjaGVyLCBleGVjdXRvck9yTm9kZU1hdGNoZXI6IFN1YnNjcmlwdGlvbkV4ZWN1dG9yIHwgTm9kZU1hdGNoZXIsIG1heWJlRXhlY3V0b3I/OiBTdWJzY3JpcHRpb25FeGVjdXRvcik6IFNjb3BlIHtcbiAgICAgICAgbGV0IGFyZ3VtZW50c0NvdW50ID0gYXJndW1lbnRzLmxlbmd0aDtcblxuICAgICAgICBzd2l0Y2goYXJndW1lbnRzQ291bnQpIHtcbiAgICAgICAgICAgIGNhc2UgMjpcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5vbldpdGhUd29Bcmd1bWVudHMoZXZlbnRNYXRjaGVyLCA8U3Vic2NyaXB0aW9uRXhlY3V0b3I+ZXhlY3V0b3JPck5vZGVNYXRjaGVyKTtcbiAgICAgICAgICAgIGNhc2UgMzpcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5vbldpdGhUaHJlZUFyZ3VtZW50cyhldmVudE1hdGNoZXIsIDxOb2RlTWF0Y2hlcj5leGVjdXRvck9yTm9kZU1hdGNoZXIsIDxTdWJzY3JpcHRpb25FeGVjdXRvcj5tYXliZUV4ZWN1dG9yKTtcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcIkZhaWxlZCB0byBleGVjdXRlICdvbicgb24gJ1Njb3BlJzogMiBvciAzIGFyZ3VtZW50cyByZXF1aXJlZCwgYnV0IFwiICsgYXJndW1lbnRzQ291bnQgKyBcIiBwcmVzZW50LlwiKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgb25XaXRoVHdvQXJndW1lbnRzKGV2ZW50TWF0Y2hlcjogRXZlbnRNYXRjaGVyLCBleGVjdXRvcjogU3Vic2NyaXB0aW9uRXhlY3V0b3IpOiBTY29wZSB7XG4gICAgICAgIHRoaXMuYWRkRGVjbGFyYXRpb24obmV3IE9uRGVjbGFyYXRpb24odGhpcy5ub2RlLCBldmVudE1hdGNoZXIsIGV4ZWN1dG9yKSk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBvbldpdGhUaHJlZUFyZ3VtZW50cyhldmVudE1hdGNoZXI6IEV2ZW50TWF0Y2hlciwgbm9kZU1hdGNoZXI6IE5vZGVNYXRjaGVyLCBleGVjdXRvcjogU3Vic2NyaXB0aW9uRXhlY3V0b3IpOiBTY29wZSB7XG4gICAgICAgIHRoaXMuc2VsZWN0KG5vZGVNYXRjaGVyLCAoc2NvcGUpID0+IHtcbiAgICAgICAgICAgIHNjb3BlLm9uKGV2ZW50TWF0Y2hlciwgZXhlY3V0b3IpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwcml2YXRlIGFkZERlY2xhcmF0aW9uKGRlY2xhcmF0aW9uOiBEZWNsYXJhdGlvbik6IHZvaWQge1xuICAgICAgICB0aGlzLmRlY2xhcmF0aW9ucy5wdXNoKGRlY2xhcmF0aW9uKTtcblxuICAgICAgICBpZih0aGlzLmlzQWN0aXZhdGVkKSB7XG4gICAgICAgICAgICBkZWNsYXJhdGlvbi5hY3RpdmF0ZSgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSByZW1vdmVEZWNsYXJhdGlvbihkZWNsYXJhdGlvbjogRGVjbGFyYXRpb24pOiB2b2lkIHsgIFxuICAgICAgICBsZXQgaW5kZXggPSB0aGlzLmRlY2xhcmF0aW9ucy5pbmRleE9mKGRlY2xhcmF0aW9uKTtcblxuICAgICAgICBpZihpbmRleCA+PSAwKSB7XG4gICAgICAgICAgICB0aGlzLmRlY2xhcmF0aW9ucy5zcGxpY2UoaW5kZXgsIDEpO1xuICAgICAgICB9XG5cbiAgICAgICAgZGVjbGFyYXRpb24uZGVhY3RpdmF0ZSgpOyAgICAgICAgXG4gICAgfVxuXG4gICAgcHJpdmF0ZSByZW1vdmVBbGxEZWNsYXJhdGlvbnMoKSB7ICAgICAgICBcbiAgICAgICAgbGV0IGRlY2xhcmF0aW9uOiBEZWNsYXJhdGlvbjtcblxuICAgICAgICB3aGlsZShkZWNsYXJhdGlvbiA9IHRoaXMuZGVjbGFyYXRpb25zWzBdKSB7XG4gICAgICAgICAgICB0aGlzLnJlbW92ZURlY2xhcmF0aW9uKGRlY2xhcmF0aW9uKTtcbiAgICAgICAgfVxuICAgIH1cbn1cbiIsImltcG9ydCB7IFN1YnNjcmlwdGlvbiwgU3Vic2NyaXB0aW9uRXhlY3V0b3IsIFN1YnNjcmlwdGlvbkV2ZW50IH0gZnJvbSAnLi9zdWJzY3JpcHRpb24nO1xuXG5pbnRlcmZhY2UgQ29tbW9uSnNSZXF1aXJlIHtcbiAgICAoaWQ6IHN0cmluZyk6IGFueTtcbn1cblxuZGVjbGFyZSB2YXIgcmVxdWlyZTogQ29tbW9uSnNSZXF1aXJlO1xubGV0IE11dGF0aW9uT2JzZXJ2ZXIgPSByZXF1aXJlKCdtdXRhdGlvbi1vYnNlcnZlcicpOyAvLyB1c2UgcG9seWZpbGxcblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEJhdGNoZWRNdXRhdGlvblN1YnNjcmlwdGlvbiBleHRlbmRzIFN1YnNjcmlwdGlvbiB7XG4gICAgc3RhdGljIHJlYWRvbmx5IG11dGF0aW9uT2JzZXJ2ZXJJbml0OiBNdXRhdGlvbk9ic2VydmVySW5pdCA9IHtcbiAgICAgICAgY2hpbGRMaXN0OiB0cnVlLFxuICAgICAgICBhdHRyaWJ1dGVzOiB0cnVlLFxuICAgICAgICBjaGFyYWN0ZXJEYXRhOiB0cnVlLFxuICAgICAgICBzdWJ0cmVlOiB0cnVlXG4gICAgfTtcblxuICAgIHByaXZhdGUgaXNMaXN0ZW5pbmcgOiBib29sZWFuID0gZmFsc2U7XG4gICAgcHJpdmF0ZSBoYW5kbGVNdXRhdGlvblRpbWVvdXQgOiBhbnkgPSBudWxsO1xuXG4gICAgcHJpdmF0ZSByZWFkb25seSBtdXRhdGlvbkNhbGxiYWNrOiBNdXRhdGlvbkNhbGxiYWNrO1xuICAgIHByaXZhdGUgcmVhZG9ubHkgbXV0YXRpb25PYnNlcnZlcjogTXV0YXRpb25PYnNlcnZlcjtcblxuICAgIGNvbnN0cnVjdG9yKG5vZGU6IE5vZGUsIGV4ZWN1dG9yOiBTdWJzY3JpcHRpb25FeGVjdXRvcikge1xuICAgICAgICBzdXBlcihub2RlLCBleGVjdXRvcik7XG5cbiAgICAgICAgdGhpcy5tdXRhdGlvbkNhbGxiYWNrID0gKCk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgdGhpcy5kZWZlckhhbmRsZU11dGF0aW9ucygpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5tdXRhdGlvbk9ic2VydmVyID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIodGhpcy5tdXRhdGlvbkNhbGxiYWNrKTtcbiAgICB9XG5cbiAgICBwcm90ZWN0ZWQgc3RhcnRMaXN0ZW5pbmcoKTogdm9pZCB7XG4gICAgICAgIGlmKCF0aGlzLmlzTGlzdGVuaW5nKSB7XG4gICAgICAgICAgICB0aGlzLm11dGF0aW9uT2JzZXJ2ZXIub2JzZXJ2ZSh0aGlzLm5vZGUsIEJhdGNoZWRNdXRhdGlvblN1YnNjcmlwdGlvbi5tdXRhdGlvbk9ic2VydmVySW5pdCk7XG5cbiAgICAgICAgICAgIHRoaXMuaXNMaXN0ZW5pbmcgPSB0cnVlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJvdGVjdGVkIHN0b3BMaXN0ZW5pbmcoKTogdm9pZCB7XG4gICAgICAgIGlmKHRoaXMuaXNMaXN0ZW5pbmcpIHtcbiAgICAgICAgICAgIHRoaXMubXV0YXRpb25PYnNlcnZlci5kaXNjb25uZWN0KCk7XG4gICAgICAgICAgICB0aGlzLmhhbmRsZU11dGF0aW9uc05vdygpO1xuXG4gICAgICAgICAgICB0aGlzLmlzTGlzdGVuaW5nID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgcHJvdGVjdGVkIGFic3RyYWN0IGhhbmRsZU11dGF0aW9ucygpOiB2b2lkO1xuXG4gICAgcHJpdmF0ZSBkZWZlckhhbmRsZU11dGF0aW9ucygpOiB2b2lkIHtcbiAgICAgICAgaWYodGhpcy5oYW5kbGVNdXRhdGlvblRpbWVvdXQgPT09IG51bGwpIHtcbiAgICAgICAgICAgIHRoaXMuaGFuZGxlTXV0YXRpb25UaW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB7IFxuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMubXV0YXRpb25PYnNlcnZlci50YWtlUmVjb3JkcygpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmhhbmRsZU11dGF0aW9ucygpO1xuICAgICAgICAgICAgICAgIH1maW5hbGx5e1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmhhbmRsZU11dGF0aW9uVGltZW91dCA9IG51bGw7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSwgMCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGhhbmRsZU11dGF0aW9uc05vdygpOiB2b2lkIHtcbiAgICAgICAgaWYodGhpcy5oYW5kbGVNdXRhdGlvblRpbWVvdXQgIT09IG51bGwpIHtcbiAgICAgICAgICAgIGNsZWFyVGltZW91dCh0aGlzLmhhbmRsZU11dGF0aW9uVGltZW91dCk7XG4gICAgICAgICAgICB0aGlzLmhhbmRsZU11dGF0aW9uVGltZW91dCA9IG51bGw7XG5cbiAgICAgICAgICAgIHRoaXMuaGFuZGxlTXV0YXRpb25zKCk7ICAgICAgICAgICAgXG4gICAgICAgIH1cbiAgICB9XG59XG5cbmV4cG9ydCB7IFN1YnNjcmlwdGlvbiwgU3Vic2NyaXB0aW9uRXhlY3V0b3IsIFN1YnNjcmlwdGlvbkV2ZW50IH07IiwiaW1wb3J0IHsgU3Vic2NyaXB0aW9uLCBTdWJzY3JpcHRpb25FeGVjdXRvciB9IGZyb20gJy4vc3Vic2NyaXB0aW9uJztcblxuZXhwb3J0IHsgU3Vic2NyaXB0aW9uRXhlY3V0b3IgfTtcblxuZXhwb3J0IGNsYXNzIEV2ZW50U3Vic2NyaXB0aW9uIGV4dGVuZHMgU3Vic2NyaXB0aW9uIHtcbiAgICByZWFkb25seSBldmVudE1hdGNoZXI6IEV2ZW50TWF0Y2hlcjtcbiAgICByZWFkb25seSBldmVudE5hbWVzOiBzdHJpbmdbXTtcblxuICAgIHByaXZhdGUgaXNDb25uZWN0ZWQgOiBib29sZWFuID0gZmFsc2U7ICAgIFxuICAgIHByaXZhdGUgcmVhZG9ubHkgZXZlbnRMaXN0ZW5lcjogRXZlbnRMaXN0ZW5lcjtcblxuICAgIGNvbnN0cnVjdG9yKG5vZGU6IE5vZGUsIGV2ZW50TWF0Y2hlcjogRXZlbnRNYXRjaGVyLCBleGVjdXRvcjogU3Vic2NyaXB0aW9uRXhlY3V0b3IpIHtcbiAgICAgICAgc3VwZXIobm9kZSwgZXhlY3V0b3IpO1xuXG4gICAgICAgIHRoaXMuZXZlbnRNYXRjaGVyID0gZXZlbnRNYXRjaGVyO1xuICAgICAgICB0aGlzLmV2ZW50TmFtZXMgPSB0aGlzLnBhcnNlRXZlbnRNYXRjaGVyKHRoaXMuZXZlbnRNYXRjaGVyKTtcblxuICAgICAgICB0aGlzLmV2ZW50TGlzdGVuZXIgPSAoZXZlbnQ6IEV2ZW50KTogdm9pZCA9PiB7XG4gICAgICAgICAgICB0aGlzLmhhbmRsZUV2ZW50KGV2ZW50KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGNvbm5lY3QoKTogdm9pZCB7XG4gICAgICAgIGlmKCF0aGlzLmlzQ29ubmVjdGVkKSB7XG4gICAgICAgICAgICB0aGlzLmlzQ29ubmVjdGVkID0gdHJ1ZTtcblxuICAgICAgICAgICAgZm9yKGxldCBldmVudE5hbWUgb2YgdGhpcy5ldmVudE5hbWVzKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5ub2RlLmFkZEV2ZW50TGlzdGVuZXIoZXZlbnROYW1lLCB0aGlzLmV2ZW50TGlzdGVuZXIsIGZhbHNlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGRpc2Nvbm5lY3QoKTogdm9pZCB7XG4gICAgICAgIGlmKHRoaXMuaXNDb25uZWN0ZWQpIHtcbiAgICAgICAgICAgIGZvcihsZXQgZXZlbnROYW1lIG9mIHRoaXMuZXZlbnROYW1lcykge1xuICAgICAgICAgICAgICAgIHRoaXMubm9kZS5yZW1vdmVFdmVudExpc3RlbmVyKGV2ZW50TmFtZSwgdGhpcy5ldmVudExpc3RlbmVyLCBmYWxzZSk7XG4gICAgICAgICAgICB9ICAgICAgICAgICAgXG5cbiAgICAgICAgICAgIHRoaXMuaXNDb25uZWN0ZWQgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgaGFuZGxlRXZlbnQoZXZlbnQ6IEV2ZW50KTogdm9pZCB7XG4gICAgICAgIHRoaXMuZXhlY3V0b3IoZXZlbnQsIHRoaXMubm9kZSk7ICAgICAgICAgXG4gICAgfVxuXG4gICAgcHJpdmF0ZSBwYXJzZUV2ZW50TWF0Y2hlcihldmVudE1hdGNoZXI6IEV2ZW50TWF0Y2hlcik6IHN0cmluZ1tdIHtcbiAgICAgICAgLy8gVE9ETzogU3VwcG9ydCBhbGwgb2YgdGhlIGpRdWVyeSBzdHlsZSBldmVudCBvcHRpb25zXG4gICAgICAgIHJldHVybiBldmVudE1hdGNoZXIuc3BsaXQoJyAnKTtcbiAgICB9IFxufVxuXG5leHBvcnQgZGVjbGFyZSB0eXBlIEV2ZW50TWF0Y2hlciA9IHN0cmluZztcbiIsImltcG9ydCB7IEJhdGNoZWRNdXRhdGlvblN1YnNjcmlwdGlvbiwgU3Vic2NyaXB0aW9uRXhlY3V0b3IsIFN1YnNjcmlwdGlvbkV2ZW50IH0gZnJvbSAnLi9iYXRjaGVkX211dGF0aW9uX3N1YnNjcmlwdGlvbic7XG5pbXBvcnQgeyBOb2RlTWF0Y2hlciwgTm9kZUNvbGxlY3RvciB9IGZyb20gJy4uL25vZGVfY29sbGVjdG9yJztcblxuZXhwb3J0IHsgTm9kZU1hdGNoZXIgfTtcblxuZXhwb3J0IGNsYXNzIE1hdGNoaW5nTm9kZXNTdWJzY3JpcHRpb24gZXh0ZW5kcyBCYXRjaGVkTXV0YXRpb25TdWJzY3JpcHRpb24ge1xuICAgIHJlYWRvbmx5IG1hdGNoZXI6IE5vZGVNYXRjaGVyO1xuXG4gICAgcHJpdmF0ZSBpc0Nvbm5lY3RlZDogYm9vbGVhbiA9IGZhbHNlO1xuICAgIHByaXZhdGUgbWF0Y2hpbmdOb2RlczogTm9kZVtdID0gW107XG5cbiAgICBjb25zdHJ1Y3Rvcihub2RlOiBOb2RlLCBtYXRjaGVyOiBOb2RlTWF0Y2hlciwgZXhlY3V0b3I6IFN1YnNjcmlwdGlvbkV4ZWN1dG9yKSB7XG4gICAgICAgIHN1cGVyKG5vZGUsIGV4ZWN1dG9yKTtcblxuICAgICAgICB0aGlzLm1hdGNoZXIgPSBtYXRjaGVyO1xuICAgIH1cblxuICAgIGNvbm5lY3QoKTogdm9pZCB7XG4gICAgICAgIGlmKCF0aGlzLmlzQ29ubmVjdGVkKSB7XG4gICAgICAgICAgICB0aGlzLnVwZGF0ZU1hdGNoaW5nTm9kZSh0aGlzLmNvbGxlY3RNYXRjaGluZ05vZGVzKCkpO1xuICAgICAgICAgICAgdGhpcy5zdGFydExpc3RlbmluZygpO1xuXG4gICAgICAgICAgICB0aGlzLmlzQ29ubmVjdGVkID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGRpc2Nvbm5lY3QoKTogdm9pZCB7XG4gICAgICAgIGlmKHRoaXMuaXNDb25uZWN0ZWQpIHtcbiAgICAgICAgICAgIHRoaXMuc3RvcExpc3RlbmluZygpO1xuICAgICAgICAgICAgdGhpcy51cGRhdGVNYXRjaGluZ05vZGUoW10pO1xuXG4gICAgICAgICAgICB0aGlzLmlzQ29ubmVjdGVkID0gZmFsc2U7XG4gICAgICAgIH0gICAgICAgIFxuICAgIH1cblxuICAgIHByb3RlY3RlZCBoYW5kbGVNdXRhdGlvbnMoKTogdm9pZCB7XG4gICAgICAgIHRoaXMudXBkYXRlTWF0Y2hpbmdOb2RlKHRoaXMuY29sbGVjdE1hdGNoaW5nTm9kZXMoKSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSB1cGRhdGVNYXRjaGluZ05vZGUobWF0Y2hpbmdOb2RlczogTm9kZVtdKTogdm9pZCB7XG4gICAgICAgIGxldCBwcmV2aW91c2x5TWF0Y2hpbmdOb2RlcyA9IHRoaXMubWF0Y2hpbmdOb2RlcztcblxuICAgICAgICBsZXQgYWRkZWROb2RlcyA9IGFycmF5U3VidHJhY3QobWF0Y2hpbmdOb2RlcywgcHJldmlvdXNseU1hdGNoaW5nTm9kZXMpO1xuICAgICAgICBsZXQgcmVtb3ZlZE5vZGVzID0gYXJyYXlTdWJ0cmFjdChwcmV2aW91c2x5TWF0Y2hpbmdOb2RlcywgbWF0Y2hpbmdOb2Rlcyk7XG5cbiAgICAgICAgdGhpcy5tYXRjaGluZ05vZGVzID0gbWF0Y2hpbmdOb2RlczsgICBcbiAgICAgICAgXG4gICAgICAgIGlmKGFkZGVkTm9kZXMubGVuZ3RoID4gMCB8fCByZW1vdmVkTm9kZXMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgbGV0IGV2ZW50ID0gbmV3IE1hdGNoaW5nTm9kZXNDaGFuZ2VkRXZlbnQodGhpcywgYWRkZWROb2RlcywgcmVtb3ZlZE5vZGVzKTtcblxuICAgICAgICAgICAgdGhpcy5leGVjdXRvcihldmVudCwgdGhpcy5ub2RlKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgY29sbGVjdE1hdGNoaW5nTm9kZXMoKTogTm9kZVtdIHtcbiAgICAgICAgcmV0dXJuIE5vZGVDb2xsZWN0b3IuY29sbGVjdE1hdGNoaW5nTm9kZXModGhpcy5ub2RlLCB0aGlzLm1hdGNoZXIpO1xuICAgIH1cbn1cblxuZXhwb3J0IGNsYXNzIE1hdGNoaW5nTm9kZXNDaGFuZ2VkRXZlbnQgZXh0ZW5kcyBTdWJzY3JpcHRpb25FdmVudCB7XG4gICAgcmVhZG9ubHkgYWRkZWROb2RlczogTm9kZVtdO1xuICAgIHJlYWRvbmx5IHJlbW92ZWROb2RlczogTm9kZVtdO1xuXG4gICAgY29uc3RydWN0b3IobWF0Y2hpbmdOb2Rlc1N1YnNjcmlwdGlvbjogTWF0Y2hpbmdOb2Rlc1N1YnNjcmlwdGlvbiwgYWRkZWROb2RlczogTm9kZVtdLCByZW1vdmVkTm9kZXM6IE5vZGVbXSkge1xuICAgICAgICBzdXBlcihtYXRjaGluZ05vZGVzU3Vic2NyaXB0aW9uLCAnTWF0Y2hpbmdOb2Rlc0NoYW5nZWQnKTtcblxuICAgICAgICB0aGlzLmFkZGVkTm9kZXMgPSBhZGRlZE5vZGVzO1xuICAgICAgICB0aGlzLnJlbW92ZWROb2RlcyA9IHJlbW92ZWROb2RlcztcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGFycmF5U3VidHJhY3Q8VD4obWludWVuZDogVFtdLCBzdWJ0cmFoZW5kOiBUW10pOiBUW10ge1xuICAgIGxldCBkaWZmZXJlbmNlOiBUW10gPSBbXTtcblxuICAgIGZvcihsZXQgbWVtYmVyIG9mIG1pbnVlbmQpIHtcbiAgICAgICAgaWYoc3VidHJhaGVuZC5pbmRleE9mKG1lbWJlcikgPT09IC0xKSB7XG4gICAgICAgICAgICBkaWZmZXJlbmNlLnB1c2gobWVtYmVyKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBkaWZmZXJlbmNlO1xufSIsImltcG9ydCB7IEJhdGNoZWRNdXRhdGlvblN1YnNjcmlwdGlvbiwgU3Vic2NyaXB0aW9uRXhlY3V0b3IsIFN1YnNjcmlwdGlvbkV2ZW50IH0gZnJvbSAnLi9iYXRjaGVkX211dGF0aW9uX3N1YnNjcmlwdGlvbic7XG5pbXBvcnQgeyBOb2RlTWF0Y2hlciwgTm9kZUNvbGxlY3RvciB9IGZyb20gJy4uL25vZGVfY29sbGVjdG9yJztcblxuZXhwb3J0IGNsYXNzIE5vZGVNYXRjaGVzU3Vic2NyaXB0aW9uIGV4dGVuZHMgQmF0Y2hlZE11dGF0aW9uU3Vic2NyaXB0aW9uIHtcbiAgICByZWFkb25seSBtYXRjaGVyOiBOb2RlTWF0Y2hlcjtcblxuICAgIHByaXZhdGUgaXNDb25uZWN0ZWQ6IGJvb2xlYW4gPSBmYWxzZTtcbiAgICBwcml2YXRlIGlzTWF0Y2hpbmdOb2RlOiBib29sZWFuID0gZmFsc2U7XG5cbiAgICBjb25zdHJ1Y3Rvcihub2RlOiBOb2RlLCBtYXRjaGVyOiBOb2RlTWF0Y2hlciwgZXhlY3V0b3I6IFN1YnNjcmlwdGlvbkV4ZWN1dG9yKSB7XG4gICAgICAgIHN1cGVyKG5vZGUsIGV4ZWN1dG9yKTtcblxuICAgICAgICB0aGlzLm1hdGNoZXIgPSBtYXRjaGVyO1xuICAgIH1cblxuICAgIGNvbm5lY3QoKTogdm9pZCB7XG4gICAgICAgIGlmKCF0aGlzLmlzQ29ubmVjdGVkKSB7XG4gICAgICAgICAgICB0aGlzLnVwZGF0ZUlzTWF0Y2hpbmdOb2RlKHRoaXMuY29tcHV0ZUlzTWF0Y2hpbmdOb2RlKCkpO1xuICAgICAgICAgICAgdGhpcy5zdGFydExpc3RlbmluZygpO1xuXG4gICAgICAgICAgICB0aGlzLmlzQ29ubmVjdGVkID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGRpc2Nvbm5lY3QoKTogdm9pZCB7XG4gICAgICAgIGlmKHRoaXMuaXNDb25uZWN0ZWQpIHtcbiAgICAgICAgICAgIHRoaXMuc3RvcExpc3RlbmluZygpO1xuICAgICAgICAgICAgdGhpcy51cGRhdGVJc01hdGNoaW5nTm9kZShmYWxzZSk7XG5cbiAgICAgICAgICAgIHRoaXMuaXNDb25uZWN0ZWQgPSBmYWxzZTtcbiAgICAgICAgfSAgICAgICAgXG4gICAgfVxuXG4gICAgcHJvdGVjdGVkIGhhbmRsZU11dGF0aW9ucygpOiB2b2lkIHtcbiAgICAgICAgdGhpcy51cGRhdGVJc01hdGNoaW5nTm9kZSh0aGlzLmNvbXB1dGVJc01hdGNoaW5nTm9kZSgpKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHVwZGF0ZUlzTWF0Y2hpbmdOb2RlKGlzTWF0Y2hpbmdOb2RlOiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIGxldCB3YXNNYXRjaGluZ05vZGUgPSB0aGlzLmlzTWF0Y2hpbmdOb2RlO1xuICAgICAgICB0aGlzLmlzTWF0Y2hpbmdOb2RlID0gaXNNYXRjaGluZ05vZGU7XG5cbiAgICAgICAgaWYod2FzTWF0Y2hpbmdOb2RlICE9PSBpc01hdGNoaW5nTm9kZSkge1xuICAgICAgICAgICAgbGV0IGV2ZW50ID0gbmV3IE5vZGVNYXRjaGVzQ2hhbmdlZEV2ZW50KHRoaXMsIGlzTWF0Y2hpbmdOb2RlKTtcblxuICAgICAgICAgICAgdGhpcy5leGVjdXRvcihldmVudCwgdGhpcy5ub2RlKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgY29tcHV0ZUlzTWF0Y2hpbmdOb2RlKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gTm9kZUNvbGxlY3Rvci5pc01hdGNoaW5nTm9kZSh0aGlzLm5vZGUsIHRoaXMubWF0Y2hlcik7XG4gICAgfVxufVxuXG5leHBvcnQgY2xhc3MgTm9kZU1hdGNoZXNDaGFuZ2VkRXZlbnQgZXh0ZW5kcyBTdWJzY3JpcHRpb25FdmVudCB7XG4gICAgcmVhZG9ubHkgaXNNYXRjaGluZzogYm9vbGVhbjtcblxuICAgIGNvbnN0cnVjdG9yKG5vZGVNYXRjaGVzU3Vic2NyaXB0aW9uOiBOb2RlTWF0Y2hlc1N1YnNjcmlwdGlvbiwgaXNNYXRjaGluZzogYm9vbGVhbikge1xuICAgICAgICBzdXBlcihub2RlTWF0Y2hlc1N1YnNjcmlwdGlvbiwgJ05vZGVNYXRjaGVzQ2hhbmdlZEV2ZW50Jyk7XG5cbiAgICAgICAgdGhpcy5pc01hdGNoaW5nID0gaXNNYXRjaGluZztcbiAgICB9XG59XG5cbmV4cG9ydCB7IE5vZGVNYXRjaGVyIH07XG4iLCJleHBvcnQgYWJzdHJhY3QgY2xhc3MgU3Vic2NyaXB0aW9uIHtcbiAgICByZWFkb25seSBleGVjdXRvcjogU3Vic2NyaXB0aW9uRXhlY3V0b3I7XG4gICAgcmVhZG9ubHkgbm9kZTogTm9kZTtcbiAgICBcbiAgICBjb25zdHJ1Y3Rvcihub2RlOiBOb2RlLCBleGVjdXRvcjogU3Vic2NyaXB0aW9uRXhlY3V0b3IpIHtcbiAgICAgICAgdGhpcy5ub2RlID0gbm9kZTtcbiAgICAgICAgdGhpcy5leGVjdXRvciA9IGV4ZWN1dG9yO1xuICAgIH1cblxuICAgIGFic3RyYWN0IGNvbm5lY3QoKSA6IHZvaWQ7XG4gICAgYWJzdHJhY3QgZGlzY29ubmVjdCgpIDogdm9pZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdWJzY3JpcHRpb25FeGVjdXRvciB7IFxuICAgIChldmVudDogRXZlbnQgfCBTdWJzY3JpcHRpb25FdmVudCwgbm9kZTogTm9kZSk6IHZvaWQgXG59XG5cbmV4cG9ydCBjbGFzcyBTdWJzY3JpcHRpb25FdmVudCB7XG4gICAgcmVhZG9ubHkgc3Vic2NyaXB0aW9uOiBTdWJzY3JpcHRpb247XG4gICAgcmVhZG9ubHkgbmFtZTogc3RyaW5nO1xuXG4gICAgY29uc3RydWN0b3Ioc3Vic2NyaXB0aW9uOiBTdWJzY3JpcHRpb24sIG5hbWU6IHN0cmluZykge1xuICAgICAgICB0aGlzLnN1YnNjcmlwdGlvbiA9IHN1YnNjcmlwdGlvbjtcbiAgICAgICAgdGhpcy5uYW1lID0gbmFtZTtcbiAgICB9XG59XG4iLCJpbXBvcnQgeyBTdWJzY3JpcHRpb24sIFN1YnNjcmlwdGlvbkV4ZWN1dG9yLCBTdWJzY3JpcHRpb25FdmVudCB9IGZyb20gJy4vc3Vic2NyaXB0aW9uJztcblxuZXhwb3J0IHsgU3Vic2NyaXB0aW9uRXhlY3V0b3IgfTtcblxuZXhwb3J0IGludGVyZmFjZSBUcml2aWFsU3Vic2NyaXB0aW9uQ29uZmlndXJhdGlvbiB7XG4gICAgY29ubmVjdGVkPzogYm9vbGVhbixcbiAgICBkaXNjb25uZWN0ZWQ/OiBib29sZWFuXG59XG5cbmV4cG9ydCBjbGFzcyBOb2RlQ29ubmVjdGlvbkNoYW5nZWRFdmVudCBleHRlbmRzIFN1YnNjcmlwdGlvbkV2ZW50IHtcbiAgICByZWFkb25seSBub2RlOiBOb2RlO1xuICAgIHJlYWRvbmx5IGlzQ29ubmVjdGVkOiBib29sZWFuO1xuXG4gICAgY29uc3RydWN0b3IodHJpdmlhbFN1YnNjcmlwdGlvbjogVHJpdmlhbFN1YnNjcmlwdGlvbiwgbm9kZTogTm9kZSwgaXNDb25uZWN0ZWQ6IGJvb2xlYW4pIHtcbiAgICAgICAgc3VwZXIodHJpdmlhbFN1YnNjcmlwdGlvbiwgJ05vZGVDb25uZWN0ZWQnKTtcblxuICAgICAgICB0aGlzLm5vZGUgPSBub2RlO1xuICAgICAgICB0aGlzLmlzQ29ubmVjdGVkID0gaXNDb25uZWN0ZWQ7XG4gICAgfVxufVxuXG5leHBvcnQgY2xhc3MgVHJpdmlhbFN1YnNjcmlwdGlvbiBleHRlbmRzIFN1YnNjcmlwdGlvbiB7XG4gICAgcHJpdmF0ZSBpc0Nvbm5lY3RlZDogYm9vbGVhbiA9IGZhbHNlO1xuICAgIHByaXZhdGUgY29uZmlnOiBUcml2aWFsU3Vic2NyaXB0aW9uQ29uZmlndXJhdGlvbjtcblxuICAgIGNvbnN0cnVjdG9yKG5vZGU6IE5vZGUsIGNvbmZpZzogVHJpdmlhbFN1YnNjcmlwdGlvbkNvbmZpZ3VyYXRpb24sIGV4ZWN1dG9yOiBTdWJzY3JpcHRpb25FeGVjdXRvcikge1xuICAgICAgICBzdXBlcihub2RlLCBleGVjdXRvcik7XG5cbiAgICAgICAgdGhpcy5jb25maWcgPSBjb25maWc7XG4gICAgfVxuXG4gICAgY29ubmVjdCgpIHtcbiAgICAgICAgaWYoIXRoaXMuaXNDb25uZWN0ZWQpIHtcbiAgICAgICAgICAgIHRoaXMuaXNDb25uZWN0ZWQgPSB0cnVlO1xuXG4gICAgICAgICAgICBpZih0aGlzLmNvbmZpZy5jb25uZWN0ZWQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmV4ZWN1dG9yKHRoaXMuYnVpbGROb2RlQ29ubmVjdGlvbkNoYW5nZWRFdmVudCgpLCB0aGlzLm5vZGUpOyBcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGRpc2Nvbm5lY3QoKSB7XG4gICAgICAgIGlmKHRoaXMuaXNDb25uZWN0ZWQpIHtcbiAgICAgICAgICAgIHRoaXMuaXNDb25uZWN0ZWQgPSBmYWxzZTtcblxuICAgICAgICAgICAgaWYodGhpcy5jb25maWcuZGlzY29ubmVjdGVkKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5leGVjdXRvcih0aGlzLmJ1aWxkTm9kZUNvbm5lY3Rpb25DaGFuZ2VkRXZlbnQoKSwgdGhpcy5ub2RlKTsgICAgIFxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIFxuICAgIHByaXZhdGUgYnVpbGROb2RlQ29ubmVjdGlvbkNoYW5nZWRFdmVudCgpOiBOb2RlQ29ubmVjdGlvbkNoYW5nZWRFdmVudCB7XG4gICAgICAgIHJldHVybiBuZXcgTm9kZUNvbm5lY3Rpb25DaGFuZ2VkRXZlbnQodGhpcywgdGhpcy5ub2RlLCB0aGlzLmlzQ29ubmVjdGVkKTtcbiAgICB9XG59Il19
