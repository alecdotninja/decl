(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";
var scope_1 = require("./scope");
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Decl;
var Decl = (function () {
    function Decl(root) {
        this.scope = scope_1.Scope.buildRootScope(root);
    }
    Decl.select = function (matcher, executor) {
        return this.getDefaultInstance().select(matcher, executor);
    };
    Decl.when = function (matcher, executor) {
        return this.getDefaultInstance().when(matcher, executor);
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
    Decl.prototype.getScope = function () {
        return this.scope;
    };
    Decl.prototype.select = function (matcher, executor) {
        return this.scope.select(matcher, executor);
    };
    Decl.prototype.when = function (matcher, executor) {
        return this.scope.when(matcher, executor);
    };
    Decl.prototype.on = function (matcher, executor) {
        return this.scope.on(matcher, executor);
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

},{"./scope":3}],2:[function(require,module,exports){
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

},{}],3:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Scope;
var subscriptions_1 = require("./subscriptions");
;
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
        this.addSubscription(new subscriptions_1.TrivialSubscription(this.element, { connected: true }, executor));
        return this;
    };
    Scope.prototype.unmatch = function (executor) {
        this.addSubscription(new subscriptions_1.TrivialSubscription(this.element, { disconnected: true }, executor));
        return this;
    };
    Scope.prototype.select = function (matcher, executor) {
        this.addSubscription(new subscriptions_1.MatchingElementsSubscription(this.element, matcher, this.buildSelectExecutor(executor)));
        return this;
    };
    Scope.prototype.when = function (matcher, executor) {
        this.addSubscription(new subscriptions_1.ElementMatchesSubscription(this.element, matcher, this.buildWhenExecutor(executor)));
        return this;
    };
    Scope.prototype.on = function (matcher, executor) {
        this.addSubscription(new subscriptions_1.EventSubscription(this.element, matcher, executor));
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

},{"./subscriptions":4}],4:[function(require,module,exports){
"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var element_collector_1 = require("./element_collector");
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = { Subscription: Subscription, TrivialSubscription: TrivialSubscription, EventSubscription: EventSubscription, MatchingElementsSubscription: MatchingElementsSubscription, ElementMatchesSubscription: ElementMatchesSubscription };
var Subscription = (function () {
    function Subscription(element, executor) {
        this.element = element;
        this.executor = executor;
    }
    return Subscription;
}());
exports.Subscription = Subscription;
var TrivialSubscription = (function (_super) {
    __extends(TrivialSubscription, _super);
    function TrivialSubscription(element, config, executor) {
        var _this = _super.call(this, element, executor) || this;
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
}(Subscription));
exports.TrivialSubscription = TrivialSubscription;
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
}(Subscription));
exports.EventSubscription = EventSubscription;
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
}(Subscription));
BatchedMutationSubscription.mutationObserverInit = {
    childList: true,
    attributes: true,
    characterData: true,
    subtree: true
};
var DeclEvent = (function () {
    function DeclEvent(name) {
        this.name = name;
    }
    return DeclEvent;
}());
exports.DeclEvent = DeclEvent;
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
}(DeclEvent));
exports.MatchingElementsChangedEvent = MatchingElementsChangedEvent;
var MatchingElementsSubscription = (function (_super) {
    __extends(MatchingElementsSubscription, _super);
    function MatchingElementsSubscription(element, matcher, executor) {
        var _this = _super.call(this, element, executor) || this;
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
}(BatchedMutationSubscription));
exports.MatchingElementsSubscription = MatchingElementsSubscription;
var ElementMatchsChangedEvent = (function (_super) {
    __extends(ElementMatchsChangedEvent, _super);
    function ElementMatchsChangedEvent(elementMatchesSubscription, isMatching) {
        var _this = _super.call(this, 'ElementMatchsChangedEvent') || this;
        _this.elementMatchesSubscription = elementMatchesSubscription;
        _this.isMatching = isMatching;
        return _this;
    }
    return ElementMatchsChangedEvent;
}(DeclEvent));
exports.ElementMatchsChangedEvent = ElementMatchsChangedEvent;
var ElementMatchesSubscription = (function (_super) {
    __extends(ElementMatchesSubscription, _super);
    function ElementMatchesSubscription(element, matcher, executor) {
        var _this = _super.call(this, element, executor) || this;
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
        this.isMatchingElement = wasMatchingElement;
        if (wasMatchingElement !== isMatchingElement) {
            var event_2 = new ElementMatchsChangedEvent(this, isMatchingElement);
            this.executor(this.element, event_2);
        }
    };
    ElementMatchesSubscription.prototype.computeIsMatchingElement = function () {
        return element_collector_1.ElementCollector.isMatchingElement(this.element, this.matcher);
    };
    return ElementMatchesSubscription;
}(BatchedMutationSubscription));
exports.ElementMatchesSubscription = ElementMatchesSubscription;
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

},{"./element_collector":2}]},{},[1])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvZGVjbC50cyIsInNyYy9lbGVtZW50X2NvbGxlY3Rvci50cyIsInNyYy9zY29wZS50cyIsInNyYy9zdWJzY3JpcHRpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOztBQ0FBLGlDQUErQzs7QUFJL0Msa0JBQWUsSUFBSSxDQUFDO0FBRXBCO0lBZ0NJLGNBQVksSUFBYTtRQUNyQixJQUFJLENBQUMsS0FBSyxHQUFHLGFBQUssQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDNUMsQ0FBQztJQS9CTSxXQUFNLEdBQWIsVUFBYyxPQUF1QixFQUFFLFFBQXVCO1FBQzFELE1BQU0sQ0FBQyxJQUFJLENBQUMsa0JBQWtCLEVBQUUsQ0FBQyxNQUFNLENBQUMsT0FBTyxFQUFFLFFBQVEsQ0FBQyxDQUFDO0lBQy9ELENBQUM7SUFFTSxTQUFJLEdBQVgsVUFBWSxPQUF1QixFQUFFLFFBQXVCO1FBQ3hELE1BQU0sQ0FBQyxJQUFJLENBQUMsa0JBQWtCLEVBQUUsQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLFFBQVEsQ0FBQyxDQUFDO0lBQzdELENBQUM7SUFFTSxPQUFFLEdBQVQsVUFBVSxPQUFxQixFQUFFLFFBQThCO1FBQzNELE1BQU0sQ0FBQyxJQUFJLENBQUMsa0JBQWtCLEVBQUUsQ0FBQyxFQUFFLENBQUMsT0FBTyxFQUFFLFFBQVEsQ0FBQyxDQUFDO0lBQzNELENBQUM7SUFFTSx1QkFBa0IsR0FBekI7UUFDSSxNQUFNLENBQUMsSUFBSSxDQUFDLGVBQWUsSUFBSSxDQUFDLElBQUksQ0FBQyxlQUFlLEdBQUcsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUM7SUFDL0YsQ0FBQztJQUVNLHVCQUFrQixHQUF6QixVQUEwQixJQUFVO1FBQ2hDLE1BQU0sQ0FBQyxJQUFJLENBQUMsZUFBZSxHQUFHLElBQUksQ0FBQztJQUN2QyxDQUFD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QjtBQWtEdkMsdUJBQTBCLE9BQVksRUFBRSxVQUFlO0lBQ25ELElBQUksVUFBVSxHQUFRLEVBQUUsQ0FBQztJQUV6QixHQUFHLENBQUEsQ0FBZSxVQUFPLEVBQVAsbUJBQU8sRUFBUCxxQkFBTyxFQUFQLElBQU87UUFBckIsSUFBSSxNQUFNLGdCQUFBO1FBQ1YsRUFBRSxDQUFBLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDbkMsVUFBVSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUM1QixDQUFDO0tBQ0o7SUFFRCxNQUFNLENBQUMsVUFBVSxDQUFDO0FBQ3RCLENBQUMiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiaW1wb3J0IHsgU2NvcGUsIFNjb3BlRXhlY3V0b3IgfSBmcm9tICcuL3Njb3BlJztcbmltcG9ydCB7IEVsZW1lbnRNYXRjaGVyIH0gZnJvbSAnLi9lbGVtZW50X2NvbGxlY3Rvcic7XG5pbXBvcnQgeyBFdmVudE1hdGNoZXIsIFN1YnNjcmlwdGlvbkV4ZWN1dG9yIH0gZnJvbSAnLi9zdWJzY3JpcHRpb25zJztcblxuZXhwb3J0IGRlZmF1bHQgRGVjbDtcblxuZXhwb3J0IGNsYXNzIERlY2wge1xuICAgIHByaXZhdGUgc3RhdGljIGRlZmF1bHRJbnN0YW5jZTogRGVjbDtcblxuICAgIHN0YXRpYyBzZWxlY3QobWF0Y2hlcjogRWxlbWVudE1hdGNoZXIsIGV4ZWN1dG9yOiBTY29wZUV4ZWN1dG9yKTogU2NvcGUge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXREZWZhdWx0SW5zdGFuY2UoKS5zZWxlY3QobWF0Y2hlciwgZXhlY3V0b3IpO1xuICAgIH1cblxuICAgIHN0YXRpYyB3aGVuKG1hdGNoZXI6IEVsZW1lbnRNYXRjaGVyLCBleGVjdXRvcjogU2NvcGVFeGVjdXRvcik6IFNjb3BlIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0RGVmYXVsdEluc3RhbmNlKCkud2hlbihtYXRjaGVyLCBleGVjdXRvcik7XG4gICAgfVxuXG4gICAgc3RhdGljIG9uKG1hdGNoZXI6IEV2ZW50TWF0Y2hlciwgZXhlY3V0b3I6IFN1YnNjcmlwdGlvbkV4ZWN1dG9yKTogU2NvcGUge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXREZWZhdWx0SW5zdGFuY2UoKS5vbihtYXRjaGVyLCBleGVjdXRvcik7XG4gICAgfVxuXG4gICAgc3RhdGljIGdldERlZmF1bHRJbnN0YW5jZSgpIDogRGVjbCB7XG4gICAgICAgIHJldHVybiB0aGlzLmRlZmF1bHRJbnN0YW5jZSB8fCAodGhpcy5kZWZhdWx0SW5zdGFuY2UgPSBuZXcgRGVjbChkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQpKTtcbiAgICB9XG5cbiAgICBzdGF0aWMgc2V0RGVmYXVsdEluc3RhbmNlKGRlY2w6IERlY2wpIDogRGVjbCB7XG4gICAgICAgIHJldHVybiB0aGlzLmRlZmF1bHRJbnN0YW5jZSA9IGRlY2w7XG4gICAgfVxuXG4gICAgc3RhdGljIHByaXN0aW5lKCk6IHZvaWQge1xuICAgICAgICBpZih0aGlzLmRlZmF1bHRJbnN0YW5jZSkge1xuICAgICAgICAgICAgdGhpcy5kZWZhdWx0SW5zdGFuY2UucHJpc3RpbmUoKTtcbiAgICAgICAgICAgIHRoaXMuZGVmYXVsdEluc3RhbmNlID0gbnVsbDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgc2NvcGU6IFNjb3BlO1xuXG4gICAgY29uc3RydWN0b3Iocm9vdDogRWxlbWVudCkge1xuICAgICAgICB0aGlzLnNjb3BlID0gU2NvcGUuYnVpbGRSb290U2NvcGUocm9vdCk7XG4gICAgfVxuXG4gICAgZ2V0U2NvcGUoKTogU2NvcGUge1xuICAgICAgICByZXR1cm4gdGhpcy5zY29wZTtcbiAgICB9XG4gICAgXG4gICAgc2VsZWN0KG1hdGNoZXI6IEVsZW1lbnRNYXRjaGVyLCBleGVjdXRvcjogU2NvcGVFeGVjdXRvcik6IFNjb3BlIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2NvcGUuc2VsZWN0KG1hdGNoZXIsIGV4ZWN1dG9yKTtcbiAgICB9XG5cbiAgICB3aGVuKG1hdGNoZXI6IEVsZW1lbnRNYXRjaGVyLCBleGVjdXRvcjogU2NvcGVFeGVjdXRvcik6IFNjb3BlIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2NvcGUud2hlbihtYXRjaGVyLCBleGVjdXRvcik7XG4gICAgfVxuXG4gICAgb24obWF0Y2hlcjogRXZlbnRNYXRjaGVyLCBleGVjdXRvcjogU3Vic2NyaXB0aW9uRXhlY3V0b3IpOiBTY29wZSB7XG4gICAgICAgIHJldHVybiB0aGlzLnNjb3BlLm9uKG1hdGNoZXIsIGV4ZWN1dG9yKTtcbiAgICB9XG5cbiAgICBwcmlzdGluZSgpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5zY29wZS5wcmlzdGluZSgpO1xuICAgIH1cbn1cblxuLy8gRXhwb3J0IHRvIGEgZ2xvYmFsIGZvciB0aGUgYnJvd3NlciAodGhlcmUgKmhhcyogdG8gYmUgYSBiZXR0ZXIgd2F5IHRvIGRvIHRoaXMhKVxuaWYodHlwZW9mKHdpbmRvdykgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgKDxhbnk+d2luZG93KS5EZWNsID0gRGVjbDtcbn1cbiIsImV4cG9ydCBkZWZhdWx0IEVsZW1lbnRDb2xsZWN0b3I7XG5cbmV4cG9ydCBpbnRlcmZhY2UgRWxlbWVudFZpc3RvciB7IChlbGVtZW50OiBFbGVtZW50KTogRWxlbWVudE1hdGNoZXIgfCBib29sZWFuIH1cbmV4cG9ydCBkZWNsYXJlIHR5cGUgRWxlbWVudE1hdGNoZXIgPSBzdHJpbmcgfCBOb2RlTGlzdE9mPEVsZW1lbnQ+IHwgRWxlbWVudFtdIHwgRWxlbWVudFZpc3RvcjtcblxuZXhwb3J0IGNsYXNzIEVsZW1lbnRDb2xsZWN0b3Ige1xuICAgIHByaXZhdGUgc3RhdGljIGluc3RhbmNlOiBFbGVtZW50Q29sbGVjdG9yO1xuICAgIFxuICAgIHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IEVMRU1FTlRfTUFUQ0hFUl9UWVBFX0VSUk9SX01FU1NBR0UgPSBcIkRlY2w6IEFuIGBFbGVtZW50TWF0Y2hlcmAgbXVzdCBiZSBhIENTUyBzZWxlY3RvciAoc3RyaW5nKSBvciBhIGZ1bmN0aW9uIHdoaWNoIHRha2VzIGEgbm9kZSB1bmRlciBjb25zaWRlcmF0aW9uIGFuZCByZXR1cm5zIGEgQ1NTIHNlbGVjdG9yIChzdHJpbmcpIHRoYXQgbWF0Y2hlcyBhbGwgbWF0Y2hpbmcgbm9kZXMgaW4gdGhlIHN1YnRyZWUsIGFuIGFycmF5LWxpa2Ugb2JqZWN0IG9mIG1hdGNoaW5nIG5vZGVzIGluIHRoZSBzdWJ0cmVlLCBvciBhIGJvb2xlYW4gdmFsdWUgYXMgdG8gd2hldGhlciB0aGUgbm9kZSBzaG91bGQgYmUgaW5jbHVkZWQgKGluIHRoaXMgY2FzZSwgdGhlIGZ1bmN0aW9uIHdpbGwgYmUgaW52b2tlZCBhZ2FpbiBmb3IgYWxsIGNoaWxkcmVuIG9mIHRoZSBub2RlKS5cIjtcblxuICAgIHN0YXRpYyBpc01hdGNoaW5nRWxlbWVudChyb290RWxlbWVudDogRWxlbWVudCwgZWxlbWVudE1hdGNoZXI6IEVsZW1lbnRNYXRjaGVyKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldEluc3RhbmNlKCkuaXNNYXRjaGluZ0VsZW1lbnQocm9vdEVsZW1lbnQsIGVsZW1lbnRNYXRjaGVyKTtcbiAgICB9XG5cbiAgICBzdGF0aWMgY29sbGVjdE1hdGNoaW5nRWxlbWVudHMocm9vdEVsZW1lbnQ6IEVsZW1lbnQsIGVsZW1lbnRNYXRjaGVyOiBFbGVtZW50TWF0Y2hlcik6IEVsZW1lbnRbXSB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldEluc3RhbmNlKCkuY29sbGVjdE1hdGNoaW5nRWxlbWVudHMocm9vdEVsZW1lbnQsIGVsZW1lbnRNYXRjaGVyKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHN0YXRpYyBnZXRJbnN0YW5jZSgpIDogRWxlbWVudENvbGxlY3RvciB7XG4gICAgICAgIHJldHVybiB0aGlzLmluc3RhbmNlIHx8ICh0aGlzLmluc3RhbmNlID0gbmV3IEVsZW1lbnRDb2xsZWN0b3IoKSk7XG4gICAgfVxuXG4gICAgaXNNYXRjaGluZ0VsZW1lbnQoZWxlbWVudDogRWxlbWVudCwgZWxlbWVudE1hdGNoZXI6IEVsZW1lbnRNYXRjaGVyKTogYm9vbGVhbiB7XG4gICAgICAgIHN3aXRjaCh0eXBlb2YoZWxlbWVudE1hdGNoZXIpKSB7XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoRWxlbWVudENvbGxlY3Rvci5FTEVNRU5UX01BVENIRVJfVFlQRV9FUlJPUl9NRVNTQUdFKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgICAgICAgICAgICAgbGV0IGNzc1NlbGVjdG9yOiBzdHJpbmcgPSA8c3RyaW5nPmVsZW1lbnRNYXRjaGVyO1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmlzTWF0Y2hpbmdFbGVtZW50RnJvbUNzc1NlbGVjdG9yKGVsZW1lbnQsIGNzc1NlbGVjdG9yKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgICAgICAgICAgICBsZXQgb2JqZWN0ID0gPE9iamVjdD5lbGVtZW50TWF0Y2hlcjtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5pc01hdGNoaW5nRWxlbWVudEZyb21PYmplY3QoZWxlbWVudCwgb2JqZWN0KTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIGNhc2UgJ2Z1bmN0aW9uJzpcbiAgICAgICAgICAgICAgICBsZXQgZWxlbWVudFZpc3RvciA9IDxFbGVtZW50VmlzdG9yPmVsZW1lbnRNYXRjaGVyO1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmlzTWF0Y2hpbmdFbGVtZW50RnJvbUVsZW1lbnRWaXN0b3IoZWxlbWVudCwgZWxlbWVudFZpc3Rvcik7ICAgICAgIFxuICAgICAgICB9XG4gICAgfVxuXG4gICAgY29sbGVjdE1hdGNoaW5nRWxlbWVudHMoZWxlbWVudDogRWxlbWVudCwgZWxlbWVudE1hdGNoZXI6IEVsZW1lbnRNYXRjaGVyKTogRWxlbWVudFtdIHtcbiAgICAgICAgc3dpdGNoKHR5cGVvZihlbGVtZW50TWF0Y2hlcikpIHtcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihFbGVtZW50Q29sbGVjdG9yLkVMRU1FTlRfTUFUQ0hFUl9UWVBFX0VSUk9SX01FU1NBR0UpO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgICAgICAgICAgICBsZXQgY3NzU2VsZWN0b3I6IHN0cmluZyA9IDxzdHJpbmc+ZWxlbWVudE1hdGNoZXI7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuY29sbGVjdE1hdGNoaW5nRWxlbWVudHNGcm9tQ3NzU2VsZWN0b3IoZWxlbWVudCwgY3NzU2VsZWN0b3IpO1xuXG4gICAgICAgICAgICBjYXNlICdvYmplY3QnOlxuICAgICAgICAgICAgICAgIGxldCBvYmplY3QgPSA8T2JqZWN0PmVsZW1lbnRNYXRjaGVyO1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmNvbGxlY3RNYXRjaGluZ0VsZW1lbnRzRnJvbU9iamVjdChlbGVtZW50LCBvYmplY3QpO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgY2FzZSAnZnVuY3Rpb24nOlxuICAgICAgICAgICAgICAgIGxldCBlbGVtZW50VmlzdG9yID0gPEVsZW1lbnRWaXN0b3I+ZWxlbWVudE1hdGNoZXI7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuY29sbGVjdE1hdGNoaW5nRWxlbWVudHNGcm9tRWxlbWVudFZpc3RvcihlbGVtZW50LCBlbGVtZW50VmlzdG9yKTsgICAgICAgXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGlzTWF0Y2hpbmdFbGVtZW50RnJvbUNzc1NlbGVjdG9yKGVsZW1lbnQ6IEVsZW1lbnQsIGNzc1NlbGVjdG9yOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICAgICAgaWYodHlwZW9mKGVsZW1lbnQubWF0Y2hlcykgPT09ICdmdW5jdGlvbicpIHsgLy8gdGFrZSBhIHNob3J0Y3V0IGluIG1vZGVybiBicm93c2Vyc1xuICAgICAgICAgICAgcmV0dXJuIGVsZW1lbnQubWF0Y2hlcyhjc3NTZWxlY3Rvcik7XG4gICAgICAgIH1lbHNle1xuICAgICAgICAgICAgcmV0dXJuIGlzTWVtYmVyT2ZBcnJheUxpa2UoZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbChjc3NTZWxlY3RvciksIGVsZW1lbnQpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBpc01hdGNoaW5nRWxlbWVudEZyb21PYmplY3QoZWxlbWVudDogRWxlbWVudCwgb2JqZWN0OiBPYmplY3QpOiBib29sZWFuIHtcbiAgICAgICAgaWYob2JqZWN0ID09PSBudWxsKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1lbHNle1xuICAgICAgICAgICAgaWYoaXNBcnJheUxpa2Uob2JqZWN0KSkge1xuICAgICAgICAgICAgICAgIGxldCBhcnJheUxpa2UgPSA8QXJyYXlMaWtlPGFueT4+b2JqZWN0O1xuXG4gICAgICAgICAgICAgICAgaWYoYXJyYXlMaWtlLmxlbmd0aCA9PT0gMCB8fCBhcnJheUxpa2VbMF0gaW5zdGFuY2VvZiBFbGVtZW50KSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBpc01lbWJlck9mQXJyYXlMaWtlKGFycmF5TGlrZSwgZWxlbWVudCk7ICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIH1lbHNle1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKEVsZW1lbnRDb2xsZWN0b3IuRUxFTUVOVF9NQVRDSEVSX1RZUEVfRVJST1JfTUVTU0FHRSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihFbGVtZW50Q29sbGVjdG9yLkVMRU1FTlRfTUFUQ0hFUl9UWVBFX0VSUk9SX01FU1NBR0UpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBpc01hdGNoaW5nRWxlbWVudEZyb21FbGVtZW50VmlzdG9yKGVsZW1lbnQ6IEVsZW1lbnQsIGVsZW1lbnRWaXN0b3I6IEVsZW1lbnRWaXN0b3IpOiBib29sZWFuIHtcbiAgICAgICAgbGV0IHZpc2l0b3JSZXN1bHQgPSBlbGVtZW50VmlzdG9yKGVsZW1lbnQpO1xuXG4gICAgICAgIGlmKHR5cGVvZih2aXNpdG9yUmVzdWx0KSA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgICAgICBsZXQgaXNNYXRjaCA9IDxib29sZWFuPnZpc2l0b3JSZXN1bHQ7XG4gICAgICAgICAgICByZXR1cm4gaXNNYXRjaDtcbiAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICBsZXQgZWxlbWVudE1hdGNoZXIgPSA8RWxlbWVudE1hdGNoZXI+dmlzaXRvclJlc3VsdDtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmlzTWF0Y2hpbmdFbGVtZW50KGVsZW1lbnQsIGVsZW1lbnRNYXRjaGVyKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgY29sbGVjdE1hdGNoaW5nRWxlbWVudHNGcm9tQ3NzU2VsZWN0b3IoZWxlbWVudDogRWxlbWVudCwgY3NzU2VsZWN0b3I6IHN0cmluZyk6IEVsZW1lbnRbXSB7XG4gICAgICAgIHJldHVybiB0b0FycmF5PEVsZW1lbnQ+KGVsZW1lbnQucXVlcnlTZWxlY3RvckFsbChjc3NTZWxlY3RvcikpO1xuICAgIH1cblxuICAgIHByaXZhdGUgY29sbGVjdE1hdGNoaW5nRWxlbWVudHNGcm9tT2JqZWN0KGVsZW1lbnQ6IEVsZW1lbnQsIG9iamVjdDogT2JqZWN0KTogRWxlbWVudFtdIHtcbiAgICAgICAgaWYob2JqZWN0ID09PSBudWxsKSB7XG4gICAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgIH1lbHNle1xuICAgICAgICAgICAgaWYoaXNBcnJheUxpa2Uob2JqZWN0KSkge1xuICAgICAgICAgICAgICAgIGxldCBhcnJheUxpa2UgPSA8QXJyYXlMaWtlPGFueT4+b2JqZWN0O1xuXG4gICAgICAgICAgICAgICAgaWYoYXJyYXlMaWtlLmxlbmd0aCA9PT0gMCB8fCBhcnJheUxpa2VbMF0gaW5zdGFuY2VvZiBFbGVtZW50KSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0b0FycmF5PEVsZW1lbnQ+KGFycmF5TGlrZSk7ICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIH1lbHNle1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKEVsZW1lbnRDb2xsZWN0b3IuRUxFTUVOVF9NQVRDSEVSX1RZUEVfRVJST1JfTUVTU0FHRSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihFbGVtZW50Q29sbGVjdG9yLkVMRU1FTlRfTUFUQ0hFUl9UWVBFX0VSUk9SX01FU1NBR0UpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBjb2xsZWN0TWF0Y2hpbmdFbGVtZW50c0Zyb21FbGVtZW50VmlzdG9yKGVsZW1lbnQ6IEVsZW1lbnQsIGVsZW1lbnRWaXN0b3I6IEVsZW1lbnRWaXN0b3IpOiBFbGVtZW50W10ge1xuICAgICAgICBsZXQgZWxlbWVudHM6IEVsZW1lbnRbXSA9IFtdO1xuXG4gICAgICAgIC8vIEknbSBmaWJiaW5nIHRvIHRoZSBjb21waWxlciBoZXJlLiBgZWxlbWVudC5jaGlsZHJlbmAgaXMgYSBgTm9kZUxpc3RPZjxFbGVtZW50PmAsXG4gICAgICAgIC8vIHdoaWNoIGRvZXMgbm90IGhhdmUgYSBjb21wYXRhYmxlIGludGVyZmFjZSB3aXRoIGBBcnJheTxFbGVtZW50PmA7IGhvd2V2ZXIsIHRoZVxuICAgICAgICAvLyBnZW5lcmF0ZWQgY29kZSBzdGlsbCB3b3JrcyBiZWNhdXNlIGl0IGRvZXNuJ3QgYWN0dWFsbHkgdXNlIHZlcnkgbXVjaCBvZiB0aGUgXG4gICAgICAgIC8vIGBBcnJheWAgaW50ZXJhY2UgKGl0IHJlYWxseSBvbmx5IGFzc3VtZXMgYSBudW1iZXJpYyBsZW5ndGggcHJvcGVydHkgYW5kIGtleXMgZm9yXG4gICAgICAgIC8vIDAuLi5sZW5ndGgpLiBDYXN0aW5nIHRvIGBhbnlgIGhlcmUgZGVzdHJveXMgdGhhdCB0eXBlIGluZm9ybWF0aW9uLCBzbyB0aGUgXG4gICAgICAgIC8vIGNvbXBpbGVyIGNhbid0IHRlbGwgdGhlcmUgaXMgYW4gaXNzdWUgYW5kIGFsbG93cyBpdCB3aXRob3V0IGFuIGVycm9yLlxuICAgICAgICBmb3IobGV0IGNoaWxkIG9mIDxhbnk+ZWxlbWVudC5jaGlsZHJlbikge1xuICAgICAgICAgICAgaWYoY2hpbGQgaW5zdGFuY2VvZiBFbGVtZW50KSB7XG4gICAgICAgICAgICAgICAgbGV0IGVsZW1lbnQ6IEVsZW1lbnQgPSBjaGlsZDtcbiAgICAgICAgICAgICAgICBsZXQgdmlzaXRvclJlc3VsdCA9IGVsZW1lbnRWaXN0b3IoZWxlbWVudCk7XG5cbiAgICAgICAgICAgICAgICBpZih0eXBlb2YodmlzaXRvclJlc3VsdCkgPT09ICdib29sZWFuJykge1xuICAgICAgICAgICAgICAgICAgICBsZXQgaXNNYXRjaCA9IDxib29sZWFuPnZpc2l0b3JSZXN1bHQ7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYoaXNNYXRjaCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZWxlbWVudHMucHVzaChlbGVtZW50KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1lbHNle1xuICAgICAgICAgICAgICAgICAgICBlbGVtZW50cy5wdXNoKC4uLnRoaXMuY29sbGVjdE1hdGNoaW5nRWxlbWVudHMoZWxlbWVudCwgdmlzaXRvclJlc3VsdCkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBlbGVtZW50cztcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGlzQXJyYXlMaWtlKHZhbHVlOiBhbnkpIHtcbiAgICByZXR1cm4gdHlwZW9mKHZhbHVlKSA9PT0gJ29iamVjdCcgJiYgdHlwZW9mKHZhbHVlLmxlbmd0aCkgPT09ICdudW1iZXInO1xufVxuXG5mdW5jdGlvbiB0b0FycmF5PFQ+KGFycmF5TGlrZTogQXJyYXlMaWtlPFQ+KTogQXJyYXk8VD4ge1xuICAgIGlmKGlzQXJyYXlMaWtlKGFycmF5TGlrZSkpIHtcbiAgICAgICAgcmV0dXJuIEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFycmF5TGlrZSwgMCk7XG4gICAgfWVsc2V7XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0V4cGVjdGVkIEFycmF5TGlrZScpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gaXNNZW1iZXJPZkFycmF5TGlrZShoYXlzdGFjazogQXJyYXlMaWtlPGFueT4sICBuZWVkbGU6IGFueSkge1xuICAgIHJldHVybiBBcnJheS5wcm90b3R5cGUuaW5kZXhPZi5jYWxsKGhheXN0YWNrLCBuZWVkbGUpICE9PSAtMTtcbn1cbiIsImV4cG9ydCBkZWZhdWx0IFNjb3BlO1xuXG5pbXBvcnQgeyBFbGVtZW50TWF0Y2hlciB9IGZyb20gJy4vZWxlbWVudF9jb2xsZWN0b3InO1xuaW1wb3J0IHsgU3Vic2NyaXB0aW9uRXhlY3V0b3IsIFN1YnNjcmlwdGlvbiwgVHJpdmlhbFN1YnNjcmlwdGlvbiwgRXZlbnRNYXRjaGVyLCBFdmVudFN1YnNjcmlwdGlvbiwgTWF0Y2hpbmdFbGVtZW50c0NoYW5nZWRFdmVudCwgTWF0Y2hpbmdFbGVtZW50c1N1YnNjcmlwdGlvbiwgRWxlbWVudE1hdGNoZXNTdWJzY3JpcHRpb24sIEVsZW1lbnRNYXRjaHNDaGFuZ2VkRXZlbnQgfSBmcm9tICcuL3N1YnNjcmlwdGlvbnMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFNjb3BlRXhlY3V0b3IgeyAoc2NvcGU6IFNjb3BlKTogdm9pZCB9O1xuXG5leHBvcnQgY2xhc3MgU2NvcGUge1xuICAgIHN0YXRpYyBidWlsZFJvb3RTY29wZShlbGVtZW50OiBFbGVtZW50KTogU2NvcGUge1xuICAgICAgICBsZXQgc2NvcGUgPSBuZXcgU2NvcGUoZWxlbWVudCk7XG5cbiAgICAgICAgc2NvcGUuYWN0aXZhdGUoKTtcblxuICAgICAgICByZXR1cm4gc2NvcGU7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSByZWFkb25seSBlbGVtZW50OiBFbGVtZW50O1xuICAgIHByaXZhdGUgaXNBY3RpdmF0ZWQ6IGJvb2xlYW4gPSBmYWxzZTtcbiAgICBwcml2YXRlIHN1YnNjcmlwdGlvbnM6IFN1YnNjcmlwdGlvbltdID0gW107XG4gICAgcHJpdmF0ZSBjaGlsZHJlbjogU2NvcGVbXSA9IFtdO1xuXG4gICAgY29uc3RydWN0b3IoZWxlbWVudDogRWxlbWVudCwgZXhlY3V0b3I/OiBTY29wZUV4ZWN1dG9yKSB7XG4gICAgICAgIHRoaXMuZWxlbWVudCA9IGVsZW1lbnQ7XG5cbiAgICAgICAgaWYoZXhlY3V0b3IpIHtcbiAgICAgICAgICAgIGV4ZWN1dG9yLmNhbGwodGhpcywgdGhpcyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBnZXRFbGVtZW50KCk6IEVsZW1lbnQge1xuICAgICAgICByZXR1cm4gdGhpcy5lbGVtZW50O1xuICAgIH1cblxuICAgIG1hdGNoKGV4ZWN1dG9yOiBTdWJzY3JpcHRpb25FeGVjdXRvcik6IFNjb3BlIHtcbiAgICAgICAgdGhpcy5hZGRTdWJzY3JpcHRpb24obmV3IFRyaXZpYWxTdWJzY3JpcHRpb24odGhpcy5lbGVtZW50LCB7IGNvbm5lY3RlZDogdHJ1ZSB9LCBleGVjdXRvcikpO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHVubWF0Y2goZXhlY3V0b3I6IFN1YnNjcmlwdGlvbkV4ZWN1dG9yKTogU2NvcGUge1xuICAgICAgICB0aGlzLmFkZFN1YnNjcmlwdGlvbihuZXcgVHJpdmlhbFN1YnNjcmlwdGlvbih0aGlzLmVsZW1lbnQsIHsgZGlzY29ubmVjdGVkOiB0cnVlIH0sIGV4ZWN1dG9yKSk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgc2VsZWN0KG1hdGNoZXI6IEVsZW1lbnRNYXRjaGVyLCBleGVjdXRvcjogU2NvcGVFeGVjdXRvcik6IFNjb3BlIHtcbiAgICAgICAgdGhpcy5hZGRTdWJzY3JpcHRpb24obmV3IE1hdGNoaW5nRWxlbWVudHNTdWJzY3JpcHRpb24odGhpcy5lbGVtZW50LCBtYXRjaGVyLCB0aGlzLmJ1aWxkU2VsZWN0RXhlY3V0b3IoZXhlY3V0b3IpKSk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgd2hlbihtYXRjaGVyOiBFbGVtZW50TWF0Y2hlciwgZXhlY3V0b3I6IFNjb3BlRXhlY3V0b3IpOiBTY29wZSB7XG5cdFx0dGhpcy5hZGRTdWJzY3JpcHRpb24obmV3IEVsZW1lbnRNYXRjaGVzU3Vic2NyaXB0aW9uKHRoaXMuZWxlbWVudCwgbWF0Y2hlciwgdGhpcy5idWlsZFdoZW5FeGVjdXRvcihleGVjdXRvcikpKTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBvbihtYXRjaGVyOiBFdmVudE1hdGNoZXIsIGV4ZWN1dG9yOiBTdWJzY3JpcHRpb25FeGVjdXRvcik6IFNjb3BlIHtcbiAgICAgICAgdGhpcy5hZGRTdWJzY3JpcHRpb24obmV3IEV2ZW50U3Vic2NyaXB0aW9uKHRoaXMuZWxlbWVudCwgbWF0Y2hlciwgZXhlY3V0b3IpKTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvLyBUaGlzIG1ldGhvZCBpcyBmb3IgdGVzdGluZ1xuICAgIHByaXN0aW5lKCk6IHZvaWQge1xuICAgICAgICBmb3IobGV0IHN1YnNjcmlwdGlvbiBvZiB0aGlzLnN1YnNjcmlwdGlvbnMpIHtcbiAgICAgICAgICAgIHN1YnNjcmlwdGlvbi5kaXNjb25uZWN0KCk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHRoaXMuc3Vic2NyaXB0aW9ucy5zcGxpY2UoMCk7XG4gICAgfVxuXG4gICAgcHJvdGVjdGVkIGFjdGl2YXRlKCk6IHZvaWQge1xuICAgICAgICBpZighdGhpcy5pc0FjdGl2YXRlZCkge1xuICAgICAgICAgICAgdGhpcy5pc0FjdGl2YXRlZCA9IHRydWU7XG5cbiAgICAgICAgICAgIGZvcihsZXQgc3Vic2NyaXB0aW9uIG9mIHRoaXMuc3Vic2NyaXB0aW9ucykge1xuICAgICAgICAgICAgICAgIHN1YnNjcmlwdGlvbi5jb25uZWN0KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcm90ZWN0ZWQgZGVhY3RpdmF0ZSgpOiB2b2lkIHtcbiAgICAgICAgaWYodGhpcy5pc0FjdGl2YXRlZCkge1xuICAgICAgICAgICAgZm9yKGxldCBzdWJzY3JpcHRpb24gb2YgdGhpcy5zdWJzY3JpcHRpb25zKSB7XG4gICAgICAgICAgICAgICAgc3Vic2NyaXB0aW9uLmRpc2Nvbm5lY3QoKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5pc0FjdGl2YXRlZCA9IGZhbHNlOyAgICAgICAgICAgIFxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhZGRTdWJzY3JpcHRpb24oc3Vic2NyaXB0aW9uOiBTdWJzY3JpcHRpb24pOiB2b2lkIHtcbiAgICAgICAgdGhpcy5zdWJzY3JpcHRpb25zLnB1c2goc3Vic2NyaXB0aW9uKTtcblxuICAgICAgICBpZih0aGlzLmlzQWN0aXZhdGVkKSB7XG4gICAgICAgICAgICBzdWJzY3JpcHRpb24uY29ubmVjdCgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSByZW1vdmVTdWJzY3JpcHRpb24oc3Vic2NyaXB0aW9uOiBTdWJzY3JpcHRpb24pOiB2b2lkIHtcbiAgICAgICAgdmFyIGluZGV4ID0gdGhpcy5zdWJzY3JpcHRpb25zLmluZGV4T2Yoc3Vic2NyaXB0aW9uKTtcblxuICAgICAgICBpZihpbmRleCA+PSAwKSB7XG4gICAgICAgICAgICBzdWJzY3JpcHRpb24uZGlzY29ubmVjdCgpO1xuXG4gICAgICAgICAgICB0aGlzLnN1YnNjcmlwdGlvbnMuc3BsaWNlKGluZGV4LCAxKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYnVpbGRTZWxlY3RFeGVjdXRvcihleGVjdXRvcjogU2NvcGVFeGVjdXRvcik6IFN1YnNjcmlwdGlvbkV4ZWN1dG9yIHtcbiAgICAgICAgbGV0IHNjb3BlczogU2NvcGVbXSA9IFtdO1xuXG4gICAgICAgIHJldHVybiAoZWxlbWVudDogRWxlbWVudCwgZXZlbnQ6IE1hdGNoaW5nRWxlbWVudHNDaGFuZ2VkRXZlbnQpID0+IHtcbiAgICAgICAgICAgIGZvcihsZXQgZWxlbWVudCBvZiBldmVudC5hZGRlZEVsZW1lbnRzKSB7XG4gICAgICAgICAgICAgICAgbGV0IHNjb3BlID0gbmV3IFNjb3BlKGVsZW1lbnQsIGV4ZWN1dG9yKTtcblxuICAgICAgICAgICAgICAgIHNjb3Blcy5wdXNoKHNjb3BlKTtcdFxuICAgICAgICAgICAgICAgIHNjb3BlLmFjdGl2YXRlKCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZvcihsZXQgZWxlbWVudCBvZiBldmVudC5yZW1vdmVkRWxlbWVudHMpIHtcbiAgICAgICAgICAgICAgICBmb3IobGV0IGluZGV4ID0gMCwgbGVuZ3RoID0gc2NvcGVzLmxlbmd0aCwgc2NvcGUgOiBTY29wZTsgaW5kZXggPCBsZW5ndGg7IGluZGV4KyspIHtcbiAgICAgICAgICAgICAgICAgICAgc2NvcGUgPSBzY29wZXNbaW5kZXhdO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmKHNjb3BlLmVsZW1lbnQgPT09IGVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNjb3BlLmRlYWN0aXZhdGUoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAgICAgc2NvcGVzLnNwbGljZShpbmRleCwgMSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGJ1aWxkV2hlbkV4ZWN1dG9yKGV4ZWN1dG9yOiBTY29wZUV4ZWN1dG9yKTogU3Vic2NyaXB0aW9uRXhlY3V0b3Ige1xuICAgICAgICBsZXQgc2NvcGUgOiBTY29wZSA9IG51bGw7XG5cbiAgICAgICAgcmV0dXJuIChlbGVtZW50OiBFbGVtZW50LCBldmVudDogRWxlbWVudE1hdGNoc0NoYW5nZWRFdmVudCkgPT4ge1xuICAgICAgICAgICAgaWYoZXZlbnQuaXNNYXRjaGluZykge1xuICAgICAgICAgICAgICAgIHNjb3BlID0gbmV3IFNjb3BlKHRoaXMuZWxlbWVudCwgZXhlY3V0b3IpO1xuICAgICAgICAgICAgICAgIHNjb3BlLmFjdGl2YXRlKCk7XG4gICAgICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgICAgICBzY29wZS5kZWFjdGl2YXRlKCk7XG4gICAgICAgICAgICAgICAgc2NvcGUgPSBudWxsO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgIH1cbn1cbiIsImltcG9ydCB7IEVsZW1lbnRNYXRjaGVyLCBFbGVtZW50Q29sbGVjdG9yIH0gZnJvbSAnLi9lbGVtZW50X2NvbGxlY3Rvcic7XG5cbmV4cG9ydCBkZWZhdWx0IHsgU3Vic2NyaXB0aW9uLCBUcml2aWFsU3Vic2NyaXB0aW9uLCBFdmVudFN1YnNjcmlwdGlvbiwgTWF0Y2hpbmdFbGVtZW50c1N1YnNjcmlwdGlvbiwgRWxlbWVudE1hdGNoZXNTdWJzY3JpcHRpb24gfTtcblxuZXhwb3J0IGludGVyZmFjZSBTdWJzY3JpcHRpb25FeGVjdXRvciB7IChlbGVtZW50OiBFbGVtZW50LCBldmVudD86IEV2ZW50IHwgRGVjbEV2ZW50KTogdm9pZCB9XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBTdWJzY3JpcHRpb24ge1xuICAgIHByb3RlY3RlZCByZWFkb25seSBleGVjdXRvcjogU3Vic2NyaXB0aW9uRXhlY3V0b3I7XG4gICAgcHJvdGVjdGVkIHJlYWRvbmx5IGVsZW1lbnQ6IEVsZW1lbnQ7XG4gICAgXG4gICAgY29uc3RydWN0b3IoZWxlbWVudDogRWxlbWVudCwgZXhlY3V0b3I6IFN1YnNjcmlwdGlvbkV4ZWN1dG9yKSB7XG4gICAgICAgIHRoaXMuZWxlbWVudCA9IGVsZW1lbnQ7XG4gICAgICAgIHRoaXMuZXhlY3V0b3IgPSBleGVjdXRvcjtcbiAgICB9XG5cbiAgICBhYnN0cmFjdCBjb25uZWN0KCkgOiB2b2lkO1xuICAgIGFic3RyYWN0IGRpc2Nvbm5lY3QoKSA6IHZvaWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVHJpdmlhbFN1YnNjcmlwdGlvbkNvbmZpZ3VyYXRpb24ge1xuICAgIGNvbm5lY3RlZD86IGJvb2xlYW4sXG4gICAgZGlzY29ubmVjdGVkPzogYm9vbGVhblxufVxuXG5leHBvcnQgY2xhc3MgVHJpdmlhbFN1YnNjcmlwdGlvbiBleHRlbmRzIFN1YnNjcmlwdGlvbiB7XG4gICAgcHJpdmF0ZSBpc0Nvbm5lY3RlZDogYm9vbGVhbjtcbiAgICBwcml2YXRlIGNvbmZpZzogVHJpdmlhbFN1YnNjcmlwdGlvbkNvbmZpZ3VyYXRpb247XG5cbiAgICBjb25zdHJ1Y3RvcihlbGVtZW50OiBFbGVtZW50LCBjb25maWc6IFRyaXZpYWxTdWJzY3JpcHRpb25Db25maWd1cmF0aW9uLCBleGVjdXRvcjogU3Vic2NyaXB0aW9uRXhlY3V0b3IpIHtcbiAgICAgICAgc3VwZXIoZWxlbWVudCwgZXhlY3V0b3IpO1xuXG4gICAgICAgIHRoaXMuY29uZmlnID0gY29uZmlnO1xuICAgIH1cblxuICAgIGNvbm5lY3QoKSB7XG4gICAgICAgIGlmKCF0aGlzLmlzQ29ubmVjdGVkKSB7XG4gICAgICAgICAgICB0aGlzLmlzQ29ubmVjdGVkID0gdHJ1ZTtcblxuICAgICAgICAgICAgaWYodGhpcy5jb25maWcuY29ubmVjdGVkKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5leGVjdXRvcih0aGlzLmVsZW1lbnQpOyAgICAgICAgICAgIFxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgZGlzY29ubmVjdCgpIHtcbiAgICAgICAgaWYodGhpcy5pc0Nvbm5lY3RlZCkge1xuICAgICAgICAgICAgdGhpcy5pc0Nvbm5lY3RlZCA9IGZhbHNlO1xuXG4gICAgICAgICAgICBpZih0aGlzLmNvbmZpZy5kaXNjb25uZWN0ZWQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmV4ZWN1dG9yKHRoaXMuZWxlbWVudCk7ICAgICAgICAgICAgXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG59XG5cbmV4cG9ydCBkZWNsYXJlIHR5cGUgRXZlbnRNYXRjaGVyID0gc3RyaW5nO1xuXG5leHBvcnQgY2xhc3MgRXZlbnRTdWJzY3JpcHRpb24gZXh0ZW5kcyBTdWJzY3JpcHRpb24ge1xuICAgIHJlYWRvbmx5IGV2ZW50TWF0Y2hlcjogRXZlbnRNYXRjaGVyO1xuXG4gICAgcHJpdmF0ZSBpc0Nvbm5lY3RlZCA6IGJvb2xlYW4gPSBmYWxzZTsgICAgXG4gICAgcHJpdmF0ZSByZWFkb25seSBldmVudExpc3RlbmVyOiBFdmVudExpc3RlbmVyO1xuICAgIHByaXZhdGUgcmVhZG9ubHkgZXZlbnROYW1lczogc3RyaW5nW107XG5cbiAgICBjb25zdHJ1Y3RvcihlbGVtZW50OiBFbGVtZW50LCBldmVudE1hdGNoZXI6IEV2ZW50TWF0Y2hlciwgZXhlY3V0b3I6IFN1YnNjcmlwdGlvbkV4ZWN1dG9yKSB7XG4gICAgICAgIHN1cGVyKGVsZW1lbnQsIGV4ZWN1dG9yKTtcblxuICAgICAgICB0aGlzLmV2ZW50TWF0Y2hlciA9IGV2ZW50TWF0Y2hlcjtcbiAgICAgICAgdGhpcy5ldmVudE5hbWVzID0gdGhpcy5wYXJzZUV2ZW50TWF0Y2hlcih0aGlzLmV2ZW50TWF0Y2hlcik7XG5cbiAgICAgICAgdGhpcy5ldmVudExpc3RlbmVyID0gKGV2ZW50OiBFdmVudCk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgdGhpcy5oYW5kbGVFdmVudChldmVudCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBjb25uZWN0KCk6IHZvaWQge1xuICAgICAgICBpZighdGhpcy5pc0Nvbm5lY3RlZCkge1xuICAgICAgICAgICAgdGhpcy5pc0Nvbm5lY3RlZCA9IHRydWU7XG5cbiAgICAgICAgICAgIGZvcihsZXQgZXZlbnROYW1lIG9mIHRoaXMuZXZlbnROYW1lcykge1xuICAgICAgICAgICAgICAgIHRoaXMuZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKGV2ZW50TmFtZSwgdGhpcy5ldmVudExpc3RlbmVyLCBmYWxzZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBkaXNjb25uZWN0KCk6IHZvaWQge1xuICAgICAgICBpZih0aGlzLmlzQ29ubmVjdGVkKSB7XG4gICAgICAgICAgICBmb3IobGV0IGV2ZW50TmFtZSBvZiB0aGlzLmV2ZW50TmFtZXMpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmVsZW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcihldmVudE5hbWUsIHRoaXMuZXZlbnRMaXN0ZW5lciwgZmFsc2UpO1xuICAgICAgICAgICAgfSAgICAgICAgICAgIFxuXG4gICAgICAgICAgICB0aGlzLmlzQ29ubmVjdGVkID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGhhbmRsZUV2ZW50KGV2ZW50OiBFdmVudCk6IHZvaWQge1xuICAgICAgICB0aGlzLmV4ZWN1dG9yKHRoaXMuZWxlbWVudCwgZXZlbnQpOyAgICAgICAgIFxuICAgIH1cblxuICAgIHByaXZhdGUgcGFyc2VFdmVudE1hdGNoZXIoZXZlbnRNYXRjaGVyOiBFdmVudE1hdGNoZXIpOiBzdHJpbmdbXSB7XG4gICAgICAgIC8vIFRPRE86IFN1cHBvcnQgYWxsIG9mIHRoZSBqUXVlcnkgc3R5bGUgZXZlbnQgb3B0aW9uc1xuICAgICAgICByZXR1cm4gZXZlbnRNYXRjaGVyLnNwbGl0KCcgJyk7XG4gICAgfSBcbn1cblxuYWJzdHJhY3QgY2xhc3MgQmF0Y2hlZE11dGF0aW9uU3Vic2NyaXB0aW9uIGV4dGVuZHMgU3Vic2NyaXB0aW9uIHtcbiAgICBzdGF0aWMgcmVhZG9ubHkgbXV0YXRpb25PYnNlcnZlckluaXQ6IE11dGF0aW9uT2JzZXJ2ZXJJbml0ID0ge1xuICAgICAgICBjaGlsZExpc3Q6IHRydWUsXG4gICAgICAgIGF0dHJpYnV0ZXM6IHRydWUsXG4gICAgICAgIGNoYXJhY3RlckRhdGE6IHRydWUsXG4gICAgICAgIHN1YnRyZWU6IHRydWVcbiAgICB9O1xuXG4gICAgcHJpdmF0ZSBpc0xpc3RlbmluZyA6IGJvb2xlYW4gPSBmYWxzZTtcbiAgICBwcml2YXRlIGhhbmRsZU11dGF0aW9uVGltZW91dCA6IGFueSA9IG51bGw7XG5cbiAgICBwcml2YXRlIHJlYWRvbmx5IG11dGF0aW9uQ2FsbGJhY2s6IE11dGF0aW9uQ2FsbGJhY2s7XG4gICAgcHJpdmF0ZSByZWFkb25seSBtdXRhdGlvbk9ic2VydmVyOiBNdXRhdGlvbk9ic2VydmVyO1xuXG4gICAgY29uc3RydWN0b3IoZWxlbWVudDogRWxlbWVudCwgZXhlY3V0b3I6IFN1YnNjcmlwdGlvbkV4ZWN1dG9yKSB7XG4gICAgICAgIHN1cGVyKGVsZW1lbnQsIGV4ZWN1dG9yKTtcblxuICAgICAgICB0aGlzLm11dGF0aW9uQ2FsbGJhY2sgPSAoKTogdm9pZCA9PiB7XG4gICAgICAgICAgICB0aGlzLmRlZmVySGFuZGxlTXV0YXRpb25zKCk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLm11dGF0aW9uT2JzZXJ2ZXIgPSBuZXcgTXV0YXRpb25PYnNlcnZlcih0aGlzLm11dGF0aW9uQ2FsbGJhY2spO1xuICAgIH1cblxuICAgIHByb3RlY3RlZCBzdGFydExpc3RlbmluZygpOiB2b2lkIHtcbiAgICAgICAgaWYoIXRoaXMuaXNMaXN0ZW5pbmcpIHtcbiAgICAgICAgICAgIHRoaXMubXV0YXRpb25PYnNlcnZlci5vYnNlcnZlKHRoaXMuZWxlbWVudCwgQmF0Y2hlZE11dGF0aW9uU3Vic2NyaXB0aW9uLm11dGF0aW9uT2JzZXJ2ZXJJbml0KTtcblxuICAgICAgICAgICAgdGhpcy5pc0xpc3RlbmluZyA9IHRydWU7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcm90ZWN0ZWQgc3RvcExpc3RlbmluZygpOiB2b2lkIHtcbiAgICAgICAgaWYodGhpcy5pc0xpc3RlbmluZykge1xuICAgICAgICAgICAgdGhpcy5tdXRhdGlvbk9ic2VydmVyLmRpc2Nvbm5lY3QoKTtcbiAgICAgICAgICAgIHRoaXMuaGFuZGxlTXV0YXRpb25zTm93KCk7XG5cbiAgICAgICAgICAgIHRoaXMuaXNMaXN0ZW5pbmcgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBcbiAgICBwcm90ZWN0ZWQgYWJzdHJhY3QgaGFuZGxlTXV0YXRpb25zKCk6IHZvaWQ7XG5cbiAgICBwcml2YXRlIGRlZmVySGFuZGxlTXV0YXRpb25zKCk6IHZvaWQge1xuICAgICAgICBpZih0aGlzLmhhbmRsZU11dGF0aW9uVGltZW91dCA9PT0gbnVsbCkge1xuICAgICAgICAgICAgdGhpcy5oYW5kbGVNdXRhdGlvblRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHsgXG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5tdXRhdGlvbk9ic2VydmVyLnRha2VSZWNvcmRzKCk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuaGFuZGxlTXV0YXRpb25zKCk7XG4gICAgICAgICAgICAgICAgfWZpbmFsbHl7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuaGFuZGxlTXV0YXRpb25UaW1lb3V0ID0gbnVsbDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LCAwKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgaGFuZGxlTXV0YXRpb25zTm93KCk6IHZvaWQge1xuICAgICAgICBpZih0aGlzLmhhbmRsZU11dGF0aW9uVGltZW91dCAhPT0gbnVsbCkge1xuICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXMuaGFuZGxlTXV0YXRpb25UaW1lb3V0KTtcbiAgICAgICAgICAgIHRoaXMuaGFuZGxlTXV0YXRpb25UaW1lb3V0ID0gbnVsbDtcblxuICAgICAgICAgICAgdGhpcy5oYW5kbGVNdXRhdGlvbnMoKTsgICAgICAgICAgICBcbiAgICAgICAgfVxuICAgIH1cbn1cblxuZXhwb3J0IGNsYXNzIERlY2xFdmVudCB7XG4gICAgcmVhZG9ubHkgbmFtZSA6IHN0cmluZztcblxuICAgIGNvbnN0cnVjdG9yKG5hbWUgOiBzdHJpbmcpIHtcbiAgICAgICAgdGhpcy5uYW1lID0gbmFtZTtcbiAgICB9XG59XG5cbmV4cG9ydCBjbGFzcyBNYXRjaGluZ0VsZW1lbnRzQ2hhbmdlZEV2ZW50IGV4dGVuZHMgRGVjbEV2ZW50IHtcbiAgICByZWFkb25seSBtYXRjaGluZ0VsZW1lbnRzU3Vic2NyaXB0aW9uOiBNYXRjaGluZ0VsZW1lbnRzU3Vic2NyaXB0aW9uO1xuICAgIHJlYWRvbmx5IGFkZGVkRWxlbWVudHM6IEVsZW1lbnRbXTtcbiAgICByZWFkb25seSByZW1vdmVkRWxlbWVudHM6IEVsZW1lbnRbXTtcblxuICAgIGNvbnN0cnVjdG9yKG1hdGNoaW5nRWxlbWVudHNTdWJzY3JpcHRpb246IE1hdGNoaW5nRWxlbWVudHNTdWJzY3JpcHRpb24sIGFkZGVkRWxlbWVudHM6IEVsZW1lbnRbXSwgcmVtb3ZlZEVsZW1lbnRzOiBFbGVtZW50W10pIHtcbiAgICAgICAgc3VwZXIoJ01hdGNoaW5nRWxlbWVudHNDaGFuZ2VkJylcblxuICAgICAgICB0aGlzLm1hdGNoaW5nRWxlbWVudHNTdWJzY3JpcHRpb24gPSBtYXRjaGluZ0VsZW1lbnRzU3Vic2NyaXB0aW9uO1xuICAgICAgICB0aGlzLmFkZGVkRWxlbWVudHMgPSBhZGRlZEVsZW1lbnRzO1xuICAgICAgICB0aGlzLnJlbW92ZWRFbGVtZW50cyA9IHJlbW92ZWRFbGVtZW50cztcbiAgICB9XG59XG5cbmV4cG9ydCBjbGFzcyBNYXRjaGluZ0VsZW1lbnRzU3Vic2NyaXB0aW9uIGV4dGVuZHMgQmF0Y2hlZE11dGF0aW9uU3Vic2NyaXB0aW9uIHtcbiAgICByZWFkb25seSBtYXRjaGVyOiBFbGVtZW50TWF0Y2hlcjtcblxuICAgIHByaXZhdGUgaXNDb25uZWN0ZWQ6IGJvb2xlYW47XG4gICAgcHJpdmF0ZSBtYXRjaGluZ0VsZW1lbnRzOiBFbGVtZW50W10gPSBbXTtcblxuICAgIGNvbnN0cnVjdG9yKGVsZW1lbnQ6IEVsZW1lbnQsIG1hdGNoZXI6IEVsZW1lbnRNYXRjaGVyLCBleGVjdXRvcjogU3Vic2NyaXB0aW9uRXhlY3V0b3IpIHtcbiAgICAgICAgc3VwZXIoZWxlbWVudCwgZXhlY3V0b3IpO1xuXG4gICAgICAgIHRoaXMubWF0Y2hlciA9IG1hdGNoZXI7XG4gICAgfVxuXG4gICAgY29ubmVjdCgpOiB2b2lkIHtcbiAgICAgICAgaWYoIXRoaXMuaXNDb25uZWN0ZWQpIHtcbiAgICAgICAgICAgIHRoaXMudXBkYXRlTWF0Y2hpbmdFbGVtZW50cyh0aGlzLmNvbGxlY3RNYXRjaGluZ0VsZW1lbnRzKCkpO1xuICAgICAgICAgICAgdGhpcy5zdGFydExpc3RlbmluZygpO1xuXG4gICAgICAgICAgICB0aGlzLmlzQ29ubmVjdGVkID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGRpc2Nvbm5lY3QoKTogdm9pZCB7XG4gICAgICAgIGlmKHRoaXMuaXNDb25uZWN0ZWQpIHtcbiAgICAgICAgICAgIHRoaXMudXBkYXRlTWF0Y2hpbmdFbGVtZW50cyhbXSk7XG4gICAgICAgICAgICB0aGlzLnN0b3BMaXN0ZW5pbmcoKTtcblxuICAgICAgICAgICAgdGhpcy5pc0Nvbm5lY3RlZCA9IGZhbHNlO1xuICAgICAgICB9ICAgICAgICBcbiAgICB9XG5cbiAgICBwcm90ZWN0ZWQgaGFuZGxlTXV0YXRpb25zKCk6IHZvaWQge1xuICAgICAgICB0aGlzLnVwZGF0ZU1hdGNoaW5nRWxlbWVudHModGhpcy5jb2xsZWN0TWF0Y2hpbmdFbGVtZW50cygpKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHVwZGF0ZU1hdGNoaW5nRWxlbWVudHMobWF0Y2hpbmdFbGVtZW50czogRWxlbWVudFtdKTogdm9pZCB7XG4gICAgICAgIGxldCBwcmV2aW91c2x5TWF0Y2hpbmdFbGVtZW50cyA9IHRoaXMubWF0Y2hpbmdFbGVtZW50cztcblxuICAgICAgICBsZXQgYWRkZWRFbGVtZW50cyA9IGFycmF5U3VidHJhY3QobWF0Y2hpbmdFbGVtZW50cywgcHJldmlvdXNseU1hdGNoaW5nRWxlbWVudHMpO1xuICAgICAgICBsZXQgcmVtb3ZlZEVsZW1lbnRzID0gYXJyYXlTdWJ0cmFjdChwcmV2aW91c2x5TWF0Y2hpbmdFbGVtZW50cywgbWF0Y2hpbmdFbGVtZW50cyk7XG5cbiAgICAgICAgdGhpcy5tYXRjaGluZ0VsZW1lbnRzID0gbWF0Y2hpbmdFbGVtZW50czsgICBcbiAgICAgICAgXG4gICAgICAgIGlmKGFkZGVkRWxlbWVudHMubGVuZ3RoID4gMCB8fCByZW1vdmVkRWxlbWVudHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgbGV0IGV2ZW50ID0gbmV3IE1hdGNoaW5nRWxlbWVudHNDaGFuZ2VkRXZlbnQodGhpcywgYWRkZWRFbGVtZW50cywgcmVtb3ZlZEVsZW1lbnRzKTtcblxuICAgICAgICAgICAgdGhpcy5leGVjdXRvcih0aGlzLmVsZW1lbnQsIGV2ZW50KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgY29sbGVjdE1hdGNoaW5nRWxlbWVudHMoKTogRWxlbWVudFtdIHtcbiAgICAgICAgcmV0dXJuIEVsZW1lbnRDb2xsZWN0b3IuY29sbGVjdE1hdGNoaW5nRWxlbWVudHModGhpcy5lbGVtZW50LCB0aGlzLm1hdGNoZXIpO1xuICAgIH1cbn1cblxuZXhwb3J0IGNsYXNzIEVsZW1lbnRNYXRjaHNDaGFuZ2VkRXZlbnQgZXh0ZW5kcyBEZWNsRXZlbnQge1xuICAgIHJlYWRvbmx5IGVsZW1lbnRNYXRjaGVzU3Vic2NyaXB0aW9uOiBFbGVtZW50TWF0Y2hlc1N1YnNjcmlwdGlvbjtcbiAgICByZWFkb25seSBpc01hdGNoaW5nOiBib29sZWFuO1xuXG4gICAgY29uc3RydWN0b3IoZWxlbWVudE1hdGNoZXNTdWJzY3JpcHRpb246IEVsZW1lbnRNYXRjaGVzU3Vic2NyaXB0aW9uLCBpc01hdGNoaW5nOiBib29sZWFuKSB7XG4gICAgICAgIHN1cGVyKCdFbGVtZW50TWF0Y2hzQ2hhbmdlZEV2ZW50JylcblxuICAgICAgICB0aGlzLmVsZW1lbnRNYXRjaGVzU3Vic2NyaXB0aW9uID0gZWxlbWVudE1hdGNoZXNTdWJzY3JpcHRpb247XG4gICAgICAgIHRoaXMuaXNNYXRjaGluZyA9IGlzTWF0Y2hpbmc7XG4gICAgfVxufVxuXG5leHBvcnQgY2xhc3MgRWxlbWVudE1hdGNoZXNTdWJzY3JpcHRpb24gZXh0ZW5kcyBCYXRjaGVkTXV0YXRpb25TdWJzY3JpcHRpb24ge1xuICAgIHJlYWRvbmx5IG1hdGNoZXI6IEVsZW1lbnRNYXRjaGVyO1xuXG4gICAgcHJpdmF0ZSBpc0Nvbm5lY3RlZDogYm9vbGVhbjtcbiAgICBwcml2YXRlIGlzTWF0Y2hpbmdFbGVtZW50OiBib29sZWFuO1xuXG4gICAgY29uc3RydWN0b3IoZWxlbWVudDogRWxlbWVudCwgbWF0Y2hlcjogRWxlbWVudE1hdGNoZXIsIGV4ZWN1dG9yOiBTdWJzY3JpcHRpb25FeGVjdXRvcikge1xuICAgICAgICBzdXBlcihlbGVtZW50LCBleGVjdXRvcik7XG5cbiAgICAgICAgdGhpcy5tYXRjaGVyID0gbWF0Y2hlcjtcbiAgICB9XG5cbiAgICBjb25uZWN0KCk6IHZvaWQge1xuICAgICAgICBpZighdGhpcy5pc0Nvbm5lY3RlZCkge1xuICAgICAgICAgICAgdGhpcy51cGRhdGVJc01hdGNoaW5nRWxlbWVudCh0aGlzLmNvbXB1dGVJc01hdGNoaW5nRWxlbWVudCgpKTtcbiAgICAgICAgICAgIHRoaXMuc3RhcnRMaXN0ZW5pbmcoKTtcblxuICAgICAgICAgICAgdGhpcy5pc0Nvbm5lY3RlZCA9IHRydWU7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBkaXNjb25uZWN0KCk6IHZvaWQge1xuICAgICAgICBpZih0aGlzLmlzQ29ubmVjdGVkKSB7XG4gICAgICAgICAgICB0aGlzLnVwZGF0ZUlzTWF0Y2hpbmdFbGVtZW50KGZhbHNlKTtcbiAgICAgICAgICAgIHRoaXMuc3RvcExpc3RlbmluZygpO1xuXG4gICAgICAgICAgICB0aGlzLmlzQ29ubmVjdGVkID0gZmFsc2U7XG4gICAgICAgIH0gICAgICAgIFxuICAgIH1cblxuICAgIHByb3RlY3RlZCBoYW5kbGVNdXRhdGlvbnMoKTogdm9pZCB7XG4gICAgICAgIHRoaXMudXBkYXRlSXNNYXRjaGluZ0VsZW1lbnQodGhpcy5jb21wdXRlSXNNYXRjaGluZ0VsZW1lbnQoKSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSB1cGRhdGVJc01hdGNoaW5nRWxlbWVudChpc01hdGNoaW5nRWxlbWVudDogYm9vbGVhbik6IHZvaWQge1xuICAgICAgICBsZXQgd2FzTWF0Y2hpbmdFbGVtZW50ID0gdGhpcy5pc01hdGNoaW5nRWxlbWVudDtcbiAgICAgICAgdGhpcy5pc01hdGNoaW5nRWxlbWVudCA9IHdhc01hdGNoaW5nRWxlbWVudDtcblxuICAgICAgICBpZih3YXNNYXRjaGluZ0VsZW1lbnQgIT09IGlzTWF0Y2hpbmdFbGVtZW50KSB7XG4gICAgICAgICAgICBsZXQgZXZlbnQgPSBuZXcgRWxlbWVudE1hdGNoc0NoYW5nZWRFdmVudCh0aGlzLCBpc01hdGNoaW5nRWxlbWVudCk7XG5cbiAgICAgICAgICAgIHRoaXMuZXhlY3V0b3IodGhpcy5lbGVtZW50LCBldmVudCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGNvbXB1dGVJc01hdGNoaW5nRWxlbWVudCgpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIEVsZW1lbnRDb2xsZWN0b3IuaXNNYXRjaGluZ0VsZW1lbnQodGhpcy5lbGVtZW50LCB0aGlzLm1hdGNoZXIpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gYXJyYXlTdWJ0cmFjdDxUPihtaW51ZW5kOiBUW10sIHN1YnRyYWhlbmQ6IFRbXSk6IFRbXSB7XG4gICAgbGV0IGRpZmZlcmVuY2U6IFRbXSA9IFtdO1xuXG4gICAgZm9yKGxldCBtZW1iZXIgb2YgbWludWVuZCkge1xuICAgICAgICBpZihzdWJ0cmFoZW5kLmluZGV4T2YobWVtYmVyKSA9PT0gLTEpIHtcbiAgICAgICAgICAgIGRpZmZlcmVuY2UucHVzaChtZW1iZXIpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGRpZmZlcmVuY2U7XG59Il19
