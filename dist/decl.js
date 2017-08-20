(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var scope_1 = require("./scope");
exports.Scope = scope_1.Scope;
var Decl = /** @class */ (function () {
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
    Decl.activate = function () {
        return this.getDefaultInstance().activate();
    };
    Decl.deactivate = function () {
        return this.getDefaultInstance().deactivate();
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
    Decl.prototype.activate = function () {
        this.scope.activate();
    };
    Decl.prototype.deactivate = function () {
        this.scope.deactivate();
    };
    Decl.defaultInstance = null;
    return Decl;
}());
exports.Decl = Decl;
// Export to a global for the browser (there *has* to be a better way to do this!)
if (typeof (window) !== 'undefined') {
    window.Decl = Decl;
}
exports.default = Decl;

},{"./scope":10}],2:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var Declaration = /** @class */ (function () {
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

},{}],3:[function(require,module,exports){
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
var MatchDeclaration = /** @class */ (function (_super) {
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

},{"../subscriptions/trivial_subscription":16,"./declaration":2}],4:[function(require,module,exports){
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
var OnDeclaration = /** @class */ (function (_super) {
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

},{"../subscriptions/event_subscription":12,"./declaration":2}],5:[function(require,module,exports){
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
var ScopeTrackingDeclaration = /** @class */ (function (_super) {
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
                return; // loop must exit to avoid data-race
            }
        }
    };
    return ScopeTrackingDeclaration;
}(declaration_1.Declaration));
exports.ScopeTrackingDeclaration = ScopeTrackingDeclaration;

},{"../scope":10,"./declaration":2}],6:[function(require,module,exports){
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
var SelectDeclaration = /** @class */ (function (_super) {
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

},{"../subscriptions/matching_nodes_subscription":13,"./scope_tracking_declaration":5}],7:[function(require,module,exports){
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
var UnmatchDeclaration = /** @class */ (function (_super) {
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

},{"../subscriptions/trivial_subscription":16,"./declaration":2}],8:[function(require,module,exports){
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
var WhenDeclaration = /** @class */ (function (_super) {
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

},{"../subscriptions/node_matches_subscription":14,"./scope_tracking_declaration":5}],9:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var NodeCollector = /** @class */ (function () {
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
                throw new TypeError(NodeCollector.NODE_MATCHER_TYPE_ERROR_MESSAGE);
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
                throw new TypeError(NodeCollector.NODE_MATCHER_TYPE_ERROR_MESSAGE);
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
                    throw new TypeError(NodeCollector.NODE_MATCHER_TYPE_ERROR_MESSAGE);
                }
            }
            else {
                throw new TypeError(NodeCollector.NODE_MATCHER_TYPE_ERROR_MESSAGE);
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
                    throw new TypeError(NodeCollector.NODE_MATCHER_TYPE_ERROR_MESSAGE);
                }
            }
            else {
                throw new TypeError(NodeCollector.NODE_MATCHER_TYPE_ERROR_MESSAGE);
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
    NodeCollector.NODE_MATCHER_TYPE_ERROR_MESSAGE = "Decl: A `NodeMatcher` must be a CSS selector (string) or a function which takes " +
        "a node under consideration and returns a CSS selector (string) that matches all " +
        "matching nodes in the subtree, an array-like object of matching nodes in the " +
        "subtree, or a boolean value as to whether the node should be included (in this " +
        "case, the function will be invoked again for all children of the node).";
    return NodeCollector;
}());
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

},{}],10:[function(require,module,exports){
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
var Scope = /** @class */ (function () {
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
        console.groupCollapsed('<<', this.node, '>>');
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

},{"./declarations/declaration":2,"./declarations/match_declaration":3,"./declarations/on_declaration":4,"./declarations/select_declaration":6,"./declarations/unmatch_declaration":7,"./declarations/when_declaration":8}],11:[function(require,module,exports){
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
var DocumentMutationSubscription = /** @class */ (function (_super) {
    __extends(DocumentMutationSubscription, _super);
    function DocumentMutationSubscription(node, executor) {
        var _this = _super.call(this, node, executor) || this;
        _this.isListening = false;
        _this.mutationObserver = new MutationObserver(function () {
            _this.handleMutations();
        });
        return _this;
    }
    DocumentMutationSubscription.prototype.startListening = function () {
        if (!this.isListening) {
            this.mutationObserver.observe(this.node, DocumentMutationSubscription.mutationObserverInit);
            this.isListening = true;
        }
    };
    DocumentMutationSubscription.prototype.stopListening = function () {
        if (this.isListening) {
            this.mutationObserver.disconnect();
            this.isListening = false;
        }
    };
    DocumentMutationSubscription.mutationObserverInit = {
        childList: true,
        attributes: true,
        characterData: true,
        subtree: true
    };
    return DocumentMutationSubscription;
}(subscription_1.Subscription));
exports.DocumentMutationSubscription = DocumentMutationSubscription;

},{"./subscription":15}],12:[function(require,module,exports){
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
var EventSubscription = /** @class */ (function (_super) {
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

},{"./subscription":15}],13:[function(require,module,exports){
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
var document_mutation_subscription_1 = require("./document_mutation_subscription");
var node_collector_1 = require("../node_collector");
var MatchingNodesSubscription = /** @class */ (function (_super) {
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
}(document_mutation_subscription_1.DocumentMutationSubscription));
exports.MatchingNodesSubscription = MatchingNodesSubscription;
var MatchingNodesChangedEvent = /** @class */ (function (_super) {
    __extends(MatchingNodesChangedEvent, _super);
    function MatchingNodesChangedEvent(matchingNodesSubscription, addedNodes, removedNodes) {
        var _this = _super.call(this, matchingNodesSubscription, 'MatchingNodesChanged') || this;
        _this.addedNodes = addedNodes;
        _this.removedNodes = removedNodes;
        return _this;
    }
    return MatchingNodesChangedEvent;
}(document_mutation_subscription_1.SubscriptionEvent));
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

},{"../node_collector":9,"./document_mutation_subscription":11}],14:[function(require,module,exports){
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
var document_mutation_subscription_1 = require("./document_mutation_subscription");
var node_collector_1 = require("../node_collector");
var NodeMatchesSubscription = /** @class */ (function (_super) {
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
}(document_mutation_subscription_1.DocumentMutationSubscription));
exports.NodeMatchesSubscription = NodeMatchesSubscription;
var NodeMatchesChangedEvent = /** @class */ (function (_super) {
    __extends(NodeMatchesChangedEvent, _super);
    function NodeMatchesChangedEvent(nodeMatchesSubscription, isMatching) {
        var _this = _super.call(this, nodeMatchesSubscription, 'NodeMatchesChangedEvent') || this;
        _this.isMatching = isMatching;
        return _this;
    }
    return NodeMatchesChangedEvent;
}(document_mutation_subscription_1.SubscriptionEvent));
exports.NodeMatchesChangedEvent = NodeMatchesChangedEvent;

},{"../node_collector":9,"./document_mutation_subscription":11}],15:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var Subscription = /** @class */ (function () {
    function Subscription(node, executor) {
        this.node = node;
        this.executor = executor;
    }
    return Subscription;
}());
exports.Subscription = Subscription;
var SubscriptionEvent = /** @class */ (function () {
    function SubscriptionEvent(subscription, name) {
        this.subscription = subscription;
        this.name = name;
    }
    return SubscriptionEvent;
}());
exports.SubscriptionEvent = SubscriptionEvent;

},{}],16:[function(require,module,exports){
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
var NodeConnectionChangedEvent = /** @class */ (function (_super) {
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
var TrivialSubscription = /** @class */ (function (_super) {
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

},{"./subscription":15}]},{},[1])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvZGVjbC50cyIsInNyYy9kZWNsYXJhdGlvbnMvZGVjbGFyYXRpb24udHMiLCJzcmMvZGVjbGFyYXRpb25zL21hdGNoX2RlY2xhcmF0aW9uLnRzIiwic3JjL2RlY2xhcmF0aW9ucy9vbl9kZWNsYXJhdGlvbi50cyIsInNyYy9kZWNsYXJhdGlvbnMvc2NvcGVfdHJhY2tpbmdfZGVjbGFyYXRpb24udHMiLCJzcmMvZGVjbGFyYXRpb25zL3NlbGVjdF9kZWNsYXJhdGlvbi50cyIsInNyYy9kZWNsYXJhdGlvbnMvdW5tYXRjaF9kZWNsYXJhdGlvbi50cyIsInNyYy9kZWNsYXJhdGlvbnMvd2hlbl9kZWNsYXJhdGlvbi50cyIsInNyYy9ub2RlX2NvbGxlY3Rvci50cyIsInNyYy9zY29wZS50cyIsInNyYy9zdWJzY3JpcHRpb25zL2RvY3VtZW50X211dGF0aW9uX3N1YnNjcmlwdGlvbi50cyIsInNyYy9zdWJzY3JpcHRpb25zL2V2ZW50X3N1YnNjcmlwdGlvbi50cyIsInNyYy9zdWJzY3JpcHRpb25zL21hdGNoaW5nX25vZGVzX3N1YnNjcmlwdGlvbi50cyIsInNyYy9zdWJzY3JpcHRpb25zL25vZGVfbWF0Y2hlc19zdWJzY3JpcHRpb24udHMiLCJzcmMvc3Vic2NyaXB0aW9ucy9zdWJzY3JpcHRpb24udHMiLCJzcmMvc3Vic2NyaXB0aW9ucy90cml2aWFsX3N1YnNjcmlwdGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O0FDQUEsaUNBQWdHO0FBRXZGLGdCQUZBLGFBQUssQ0FFQTtBQUVkO0lBNENJLGNBQVksSUFBVTtRQUNsQixJQUFJLENBQUMsS0FBSyxHQUFHLGFBQUssQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDNUMsQ0FBQztJQTNDTSxXQUFNLEdBQWIsVUFBYyxPQUFvQixFQUFFLFFBQXVCO1FBQ3ZELE1BQU0sQ0FBQyxJQUFJLENBQUMsa0JB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LENBQUMsU0FHeEI7UUFQTyxpQkFBVyxHQUFZLEtBQUssQ0FBQztRQU1qQyxLQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQzs7SUFDekIsQ0FBQztJQUVELHFDQUFPLEdBQVA7UUFDSSxFQUFFLENBQUEsQ0FBQyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDO1lBQ25CLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDO1lBRXhCLEVBQUUsQ0FBQSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztnQkFDdkIsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsK0JBQStCLEVBQUUsRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDckUsQ0FBQztRQUNMLENBQUM7SUFDTCxDQUFDO0lBRUQsd0NBQVUsR0FBVjtRQUNJLEVBQUUsQ0FBQSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDO1lBQ2xCLElBQUksQ0FBQyxXQUFXLEdBQUcsS0FBSyxDQUFDO1lBRXpCLEVBQUUsQ0FBQSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQztnQkFDMUIsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsK0JBQStCLEVBQUUsRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDckUsQ0FBQztRQUNMLENBQUM7SUFDTCxDQUFDO0lBRU8sNkRBQStCLEdBQXZDO1FBQ0ksTUFBTSxDQUFDLElBQUksMEJBQTBCLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDO0lBQzdFLENBQUM7SUFDTCwwQkFBQztBQUFELENBakNBLEFBaUNDLENBakN3QywyQkFBWSxHQWlDcEQ7QUFqQ1ksa0RBQW1CIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsImltcG9ydCB7IFNjb3BlLCBOb2RlTWF0Y2hlciwgRXZlbnRNYXRjaGVyLCBTY29wZUV4ZWN1dG9yLCBTdWJzY3JpcHRpb25FeGVjdXRvciB9IGZyb20gJy4vc2NvcGUnO1xuXG5leHBvcnQgeyBTY29wZSwgTm9kZU1hdGNoZXIsIEV2ZW50TWF0Y2hlciwgU2NvcGVFeGVjdXRvciwgU3Vic2NyaXB0aW9uRXhlY3V0b3IgfTtcblxuZXhwb3J0IGNsYXNzIERlY2wge1xuICAgIHByaXZhdGUgc3RhdGljIGRlZmF1bHRJbnN0YW5jZTogRGVjbCB8IG51bGwgPSBudWxsO1xuXG4gICAgc3RhdGljIHNlbGVjdChtYXRjaGVyOiBOb2RlTWF0Y2hlciwgZXhlY3V0b3I6IFNjb3BlRXhlY3V0b3IpOiBTY29wZSB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldERlZmF1bHRJbnN0YW5jZSgpLnNlbGVjdChtYXRjaGVyLCBleGVjdXRvcik7XG4gICAgfVxuXG4gICAgc3RhdGljIG9uKG1hdGNoZXI6IEV2ZW50TWF0Y2hlciwgZXhlY3V0b3I6IFN1YnNjcmlwdGlvbkV4ZWN1dG9yKTogU2NvcGUge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXREZWZhdWx0SW5zdGFuY2UoKS5vbihtYXRjaGVyLCBleGVjdXRvcik7XG4gICAgfVxuXG4gICAgc3RhdGljIGdldFJvb3RTY29wZSgpOiBTY29wZSB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldERlZmF1bHRJbnN0YW5jZSgpLmdldFJvb3RTY29wZSgpO1xuICAgIH1cblxuICAgIHN0YXRpYyBpbnNwZWN0KGluY2x1ZGVTb3VyY2U/OiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIHRoaXMuZ2V0RGVmYXVsdEluc3RhbmNlKCkuaW5zcGVjdChpbmNsdWRlU291cmNlKTtcbiAgICB9XG5cbiAgICBzdGF0aWMgZ2V0RGVmYXVsdEluc3RhbmNlKCkgOiBEZWNsIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZGVmYXVsdEluc3RhbmNlIHx8ICh0aGlzLmRlZmF1bHRJbnN0YW5jZSA9IG5ldyBEZWNsKHdpbmRvdy5kb2N1bWVudCkpO1xuICAgIH1cblxuICAgIHN0YXRpYyBzZXREZWZhdWx0SW5zdGFuY2UoZGVjbDogRGVjbCkgOiBEZWNsIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZGVmYXVsdEluc3RhbmNlID0gZGVjbDtcbiAgICB9XG5cbiAgICBzdGF0aWMgcHJpc3RpbmUoKTogdm9pZCB7XG4gICAgICAgIGlmKHRoaXMuZGVmYXVsdEluc3RhbmNlKSB7XG4gICAgICAgICAgICB0aGlzLmRlZmF1bHRJbnN0YW5jZS5wcmlzdGluZSgpO1xuICAgICAgICAgICAgdGhpcy5kZWZhdWx0SW5zdGFuY2UgPSBudWxsO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgc3RhdGljIGFjdGl2YXRlKCk6IHZvaWQge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXREZWZhdWx0SW5zdGFuY2UoKS5hY3RpdmF0ZSgpO1xuICAgIH1cblxuICAgIHN0YXRpYyBkZWFjdGl2YXRlKCk6IHZvaWQge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXREZWZhdWx0SW5zdGFuY2UoKS5kZWFjdGl2YXRlKCk7ICAgICAgICBcbiAgICB9XG5cbiAgICBwcml2YXRlIHNjb3BlOiBTY29wZTtcblxuICAgIGNvbnN0cnVjdG9yKHJvb3Q6IE5vZGUpIHtcbiAgICAgICAgdGhpcy5zY29wZSA9IFNjb3BlLmJ1aWxkUm9vdFNjb3BlKHJvb3QpO1xuICAgIH1cblxuICAgIHNlbGVjdChtYXRjaGVyOiBOb2RlTWF0Y2hlciwgZXhlY3V0b3I6IFNjb3BlRXhlY3V0b3IpOiBTY29wZSB7XG4gICAgICAgIHJldHVybiB0aGlzLnNjb3BlLnNlbGVjdChtYXRjaGVyLCBleGVjdXRvcik7XG4gICAgfVxuXG4gICAgb24obWF0Y2hlcjogRXZlbnRNYXRjaGVyLCBleGVjdXRvcjogU3Vic2NyaXB0aW9uRXhlY3V0b3IpOiBTY29wZSB7XG4gICAgICAgIHJldHVybiB0aGlzLnNjb3BlLm9uKG1hdGNoZXIsIGV4ZWN1dG9yKTtcbiAgICB9XG5cbiAgICBnZXRSb290U2NvcGUoKTogU2NvcGUge1xuICAgICAgIHJldHVybiB0aGlzLnNjb3BlOyBcbiAgICB9XG5cbiAgICBpbnNwZWN0KGluY2x1ZGVTb3VyY2U/OiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIGNvbnNvbGUuZ3JvdXBDb2xsYXBzZWQoJzw8cm9vdD4+Jyk7XG4gICAgICAgIFxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgdGhpcy5zY29wZS5pbnNwZWN0KGluY2x1ZGVTb3VyY2UpOyAgICAgICAgXG4gICAgICAgIH1maW5hbGx5e1xuICAgICAgICAgICAgY29uc29sZS5ncm91cEVuZCgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpc3RpbmUoKTogdm9pZCB7XG4gICAgICAgIHRoaXMuc2NvcGUucHJpc3RpbmUoKTtcbiAgICB9XG5cbiAgICBhY3RpdmF0ZSgpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5zY29wZS5hY3RpdmF0ZSgpOyAgICAgICAgXG4gICAgfVxuXG4gICAgZGVhY3RpdmF0ZSgpOiB2b2lkIHsgICAgICAgIFxuICAgICAgICB0aGlzLnNjb3BlLmRlYWN0aXZhdGUoKTtcbiAgICB9XG59XG5cbi8vIEV4cG9ydCB0byBhIGdsb2JhbCBmb3IgdGhlIGJyb3dzZXIgKHRoZXJlICpoYXMqIHRvIGJlIGEgYmV0dGVyIHdheSB0byBkbyB0aGlzISlcbmlmKHR5cGVvZih3aW5kb3cpICE9PSAndW5kZWZpbmVkJykge1xuICAgICg8YW55PndpbmRvdykuRGVjbCA9IERlY2w7XG59XG5cbmV4cG9ydCBkZWZhdWx0IERlY2w7XG4iLCJpbXBvcnQgeyBTdWJzY3JpcHRpb24sIFN1YnNjcmlwdGlvbkV4ZWN1dG9yIH0gZnJvbSAnLi4vc3Vic2NyaXB0aW9ucy9zdWJzY3JpcHRpb24nO1xuXG5leHBvcnQgeyBTdWJzY3JpcHRpb25FeGVjdXRvciB9O1xuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgRGVjbGFyYXRpb24ge1xuICAgIHByb3RlY3RlZCBpc0FjdGl2YXRlZDogYm9vbGVhbiA9IGZhbHNlO1xuICAgIHByb3RlY3RlZCByZWFkb25seSBub2RlOiBOb2RlO1xuICAgIHByb3RlY3RlZCByZWFkb25seSBzdWJzY3JpcHRpb246IFN1YnNjcmlwdGlvbjtcblxuICAgIGNvbnN0cnVjdG9yKG5vZGU6IE5vZGUpIHtcbiAgICAgICAgdGhpcy5ub2RlID0gbm9kZTtcbiAgICB9XG5cbiAgICBhY3RpdmF0ZSgpOiB2b2lkIHtcbiAgICAgICAgaWYoIXRoaXMuaXNBY3RpdmF0ZWQpIHtcbiAgICAgICAgICAgIHRoaXMuaXNBY3RpdmF0ZWQgPSB0cnVlO1xuXG4gICAgICAgICAgICB0aGlzLnN1YnNjcmlwdGlvbi5jb25uZWN0KCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBkZWFjdGl2YXRlKCk6IHZvaWQge1xuICAgICAgICBpZih0aGlzLmlzQWN0aXZhdGVkKSB7XG4gICAgICAgICAgICB0aGlzLmlzQWN0aXZhdGVkID0gZmFsc2U7XG5cbiAgICAgICAgICAgIHRoaXMuc3Vic2NyaXB0aW9uLmRpc2Nvbm5lY3QoKTtcbiAgICAgICAgfSAgICAgICAgXG4gICAgfVxuXG4gICAgYWJzdHJhY3QgaW5zcGVjdChpbmNsdWRlU291cmNlPzogYm9vbGVhbik6IHZvaWQ7XG59IiwiaW1wb3J0IHsgRGVjbGFyYXRpb24sIFN1YnNjcmlwdGlvbkV4ZWN1dG9yIH0gZnJvbSAnLi9kZWNsYXJhdGlvbic7XG5pbXBvcnQgeyBUcml2aWFsU3Vic2NyaXB0aW9uIH0gZnJvbSAnLi4vc3Vic2NyaXB0aW9ucy90cml2aWFsX3N1YnNjcmlwdGlvbic7XG5cbmV4cG9ydCB7IFN1YnNjcmlwdGlvbkV4ZWN1dG9yIH07XG5cbmV4cG9ydCBjbGFzcyBNYXRjaERlY2xhcmF0aW9uIGV4dGVuZHMgRGVjbGFyYXRpb24ge1xuICAgIHByb3RlY3RlZCByZWFkb25seSBzdWJzY3JpcHRpb246IFRyaXZpYWxTdWJzY3JpcHRpb247XG4gICAgcHJvdGVjdGVkIHJlYWRvbmx5IGV4ZWN1dG9yOiBTdWJzY3JpcHRpb25FeGVjdXRvcjtcblxuICAgIGNvbnN0cnVjdG9yKG5vZGU6IE5vZGUsIGV4ZWN1dG9yOiBTdWJzY3JpcHRpb25FeGVjdXRvcikge1xuICAgICAgICBzdXBlcihub2RlKTtcblxuICAgICAgICB0aGlzLmV4ZWN1dG9yID0gZXhlY3V0b3I7XG5cbiAgICAgICAgdGhpcy5zdWJzY3JpcHRpb24gPSBuZXcgVHJpdmlhbFN1YnNjcmlwdGlvbih0aGlzLm5vZGUsIHsgY29ubmVjdGVkOiB0cnVlIH0sIHRoaXMuZXhlY3V0b3IpO1xuICAgIH1cblxuICAgIGluc3BlY3QoKTogdm9pZCB7XG4gICAgICAgIGNvbnNvbGUuZ3JvdXBDb2xsYXBzZWQoJ21hdGNoZXMnKTtcbiAgICAgICAgY29uc29sZS5sb2codGhpcy5leGVjdXRvcik7XG4gICAgICAgIGNvbnNvbGUuZ3JvdXBFbmQoKTtcbiAgICB9XG59IiwiaW1wb3J0IHsgRGVjbGFyYXRpb24sIFN1YnNjcmlwdGlvbkV4ZWN1dG9yIH0gZnJvbSAnLi9kZWNsYXJhdGlvbic7XG5pbXBvcnQgeyBFdmVudFN1YnNjcmlwdGlvbiwgRXZlbnRNYXRjaGVyIH0gZnJvbSAnLi4vc3Vic2NyaXB0aW9ucy9ldmVudF9zdWJzY3JpcHRpb24nO1xuXG5leHBvcnQgeyBFdmVudE1hdGNoZXIsIFN1YnNjcmlwdGlvbkV4ZWN1dG9yIH07XG5cbmV4cG9ydCBjbGFzcyBPbkRlY2xhcmF0aW9uIGV4dGVuZHMgRGVjbGFyYXRpb24ge1xuICAgIHByb3RlY3RlZCBzdWJzY3JpcHRpb246IEV2ZW50U3Vic2NyaXB0aW9uO1xuICAgIHByb3RlY3RlZCBtYXRjaGVyOiBFdmVudE1hdGNoZXI7XG4gICAgcHJvdGVjdGVkIGV4ZWN1dG9yOiBTdWJzY3JpcHRpb25FeGVjdXRvcjtcblxuICAgIGNvbnN0cnVjdG9yKG5vZGU6IE5vZGUsIG1hdGNoZXI6IEV2ZW50TWF0Y2hlciwgZXhlY3V0b3I6IFN1YnNjcmlwdGlvbkV4ZWN1dG9yKSB7XG4gICAgICAgIHN1cGVyKG5vZGUpO1xuXG4gICAgICAgIHRoaXMubWF0Y2hlciA9IG1hdGNoZXI7XG4gICAgICAgIHRoaXMuZXhlY3V0b3IgPSBleGVjdXRvcjtcblxuICAgICAgICB0aGlzLnN1YnNjcmlwdGlvbiA9IG5ldyBFdmVudFN1YnNjcmlwdGlvbih0aGlzLm5vZGUsIHRoaXMubWF0Y2hlciwgdGhpcy5leGVjdXRvcik7ICAgIFxuICAgIH1cblxuICAgIGluc3BlY3QoKTogdm9pZCB7XG4gICAgICAgIGNvbnNvbGUuZ3JvdXBDb2xsYXBzZWQoJ29uJywgdGhpcy5tYXRjaGVyKTtcblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc29sZS5sb2codGhpcy5leGVjdXRvcik7XG4gICAgICAgIH1maW5hbGx5e1xuICAgICAgICAgICAgY29uc29sZS5ncm91cEVuZCgpO1xuICAgICAgICB9XG4gICAgfVxufSIsImltcG9ydCB7IERlY2xhcmF0aW9uIH0gZnJvbSAnLi9kZWNsYXJhdGlvbic7XG5pbXBvcnQgeyBOb2RlTWF0Y2hlciB9IGZyb20gJy4uL25vZGVfY29sbGVjdG9yJztcbmltcG9ydCB7IFNjb3BlLCBTY29wZUV4ZWN1dG9yIH0gZnJvbSAnLi4vc2NvcGUnO1xuXG5leHBvcnQgeyBOb2RlTWF0Y2hlciwgU2NvcGVFeGVjdXRvciB9O1xuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgU2NvcGVUcmFja2luZ0RlY2xhcmF0aW9uIGV4dGVuZHMgRGVjbGFyYXRpb24ge1xuICAgIHByaXZhdGUgcmVhZG9ubHkgY2hpbGRTY29wZXM6IFNjb3BlW10gPSBbXTtcbiAgICBcbiAgICBkZWFjdGl2YXRlKCk6IHZvaWQge1xuICAgICAgICB0aGlzLnJlbW92ZUFsbENoaWxkU2NvcGVzKCk7XG4gICAgICAgIHN1cGVyLmRlYWN0aXZhdGUoKTtcbiAgICB9XG5cbiAgICBnZXRDaGlsZFNjb3BlcygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY2hpbGRTY29wZXM7XG4gICAgfVxuXG4gICAgcHJvdGVjdGVkIGluc3BlY3RDaGlsZFNjb3BlcyhpbmNsdWRlU291cmNlPzogYm9vbGVhbik6IHZvaWQgeyAgICAgICAgXG4gICAgICAgIGZvcihsZXQgY2hpbGRTY29wZSBvZiB0aGlzLmNoaWxkU2NvcGVzKSB7XG4gICAgICAgICAgICBjaGlsZFNjb3BlLmluc3BlY3QoaW5jbHVkZVNvdXJjZSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcm90ZWN0ZWQgYWRkQ2hpbGRTY29wZShzY29wZTogU2NvcGUpIHtcbiAgICAgICAgaWYodGhpcy5pc0FjdGl2YXRlZCkge1xuICAgICAgICAgICAgdGhpcy5jaGlsZFNjb3Blcy5wdXNoKHNjb3BlKTtcblxuICAgICAgICAgICAgc2NvcGUuYWN0aXZhdGUoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByb3RlY3RlZCByZW1vdmVDaGlsZFNjb3BlKHNjb3BlOiBTY29wZSkgeyBcbiAgICAgICAgc2NvcGUuZGVhY3RpdmF0ZSgpO1xuXG4gICAgICAgIGlmKHRoaXMuaXNBY3RpdmF0ZWQpIHtcbiAgICAgICAgICAgIGxldCBpbmRleCA9IHRoaXMuY2hpbGRTY29wZXMuaW5kZXhPZihzY29wZSk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGlmKGluZGV4ID49IDApIHtcbiAgICAgICAgICAgICAgICB0aGlzLmNoaWxkU2NvcGVzLnNwbGljZShpbmRleCwgMSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcm90ZWN0ZWQgcmVtb3ZlQWxsQ2hpbGRTY29wZXMoKSB7XG4gICAgICAgIGxldCBjaGlsZFNjb3BlOiBTY29wZTtcblxuICAgICAgICB3aGlsZShjaGlsZFNjb3BlID0gdGhpcy5jaGlsZFNjb3Blc1swXSkge1xuICAgICAgICAgICAgdGhpcy5yZW1vdmVDaGlsZFNjb3BlKGNoaWxkU2NvcGUpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJvdGVjdGVkIGFkZENoaWxkU2NvcGVCeU5vZGUobm9kZTogTm9kZSwgZXhlY3V0b3I/OiBTY29wZUV4ZWN1dG9yKSB7XG4gICAgICAgIGxldCBjaGlsZFNjb3BlID0gbmV3IFNjb3BlKG5vZGUsIGV4ZWN1dG9yKTtcblxuICAgICAgICB0aGlzLmFkZENoaWxkU2NvcGUoY2hpbGRTY29wZSk7XG4gICAgfVxuXG4gICAgcHJvdGVjdGVkIHJlbW92ZUNoaWxkU2NvcGVCeU5vZGUobm9kZTogTm9kZSkge1xuICAgICAgICBmb3IobGV0IGNoaWxkU2NvcGUgb2YgdGhpcy5jaGlsZFNjb3Blcykge1xuICAgICAgICAgICAgaWYoY2hpbGRTY29wZS5nZXROb2RlKCkgPT09IG5vZGUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnJlbW92ZUNoaWxkU2NvcGUoY2hpbGRTY29wZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuOyAvLyBsb29wIG11c3QgZXhpdCB0byBhdm9pZCBkYXRhLXJhY2VcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbn0iLCJpbXBvcnQgeyBTY29wZVRyYWNraW5nRGVjbGFyYXRpb24sIE5vZGVNYXRjaGVyLCBTY29wZUV4ZWN1dG9yIH0gZnJvbSAnLi9zY29wZV90cmFja2luZ19kZWNsYXJhdGlvbic7XG5pbXBvcnQgeyBNYXRjaGluZ05vZGVzU3Vic2NyaXB0aW9uLCBNYXRjaGluZ05vZGVzQ2hhbmdlZEV2ZW50IH0gZnJvbSAnLi4vc3Vic2NyaXB0aW9ucy9tYXRjaGluZ19ub2Rlc19zdWJzY3JpcHRpb24nO1xuXG5leHBvcnQgeyBOb2RlTWF0Y2hlciwgU2NvcGVFeGVjdXRvciB9O1xuXG5leHBvcnQgY2xhc3MgU2VsZWN0RGVjbGFyYXRpb24gZXh0ZW5kcyBTY29wZVRyYWNraW5nRGVjbGFyYXRpb24ge1xuICAgIHByb3RlY3RlZCBzdWJzY3JpcHRpb246IE1hdGNoaW5nTm9kZXNTdWJzY3JpcHRpb247XG4gICAgcHJvdGVjdGVkIG1hdGNoZXI6IE5vZGVNYXRjaGVyO1xuICAgIHByb3RlY3RlZCBleGVjdXRvcjogU2NvcGVFeGVjdXRvcjtcblxuICAgIGNvbnN0cnVjdG9yKG5vZGU6IE5vZGUsIG1hdGNoZXI6IE5vZGVNYXRjaGVyLCBleGVjdXRvcjogU2NvcGVFeGVjdXRvcikge1xuICAgICAgICBzdXBlcihub2RlKTtcblxuICAgICAgICB0aGlzLm1hdGNoZXIgPSBtYXRjaGVyO1xuICAgICAgICB0aGlzLmV4ZWN1dG9yID0gZXhlY3V0b3I7XG5cbiAgICAgICAgdGhpcy5zdWJzY3JpcHRpb24gPSBuZXcgTWF0Y2hpbmdOb2Rlc1N1YnNjcmlwdGlvbih0aGlzLm5vZGUsIHRoaXMubWF0Y2hlciwgKGV2ZW50OiBNYXRjaGluZ05vZGVzQ2hhbmdlZEV2ZW50KSA9PiB7XG4gICAgICAgICAgICBmb3IobGV0IG5vZGUgb2YgZXZlbnQuYWRkZWROb2Rlcykge1xuICAgICAgICAgICAgICAgIHRoaXMuYWRkQ2hpbGRTY29wZUJ5Tm9kZShub2RlLCB0aGlzLmV4ZWN1dG9yKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZm9yKGxldCBub2RlIG9mIGV2ZW50LnJlbW92ZWROb2Rlcykge1xuICAgICAgICAgICAgICAgIHRoaXMucmVtb3ZlQ2hpbGRTY29wZUJ5Tm9kZShub2RlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgaW5zcGVjdChpbmNsdWRlU291cmNlPzogYm9vbGVhbik6IHZvaWQge1xuICAgICAgICBjb25zb2xlLmdyb3VwQ29sbGFwc2VkKCdzZWxlY3QnLCB0aGlzLm1hdGNoZXIpO1xuXG4gICAgICAgIHRyeXtcbiAgICAgICAgICAgIHRoaXMuaW5zcGVjdENoaWxkU2NvcGVzKGluY2x1ZGVTb3VyY2UpOyAgICAgICAgXG4gICAgICAgIH1maW5hbGx5e1xuICAgICAgICAgICAgY29uc29sZS5ncm91cEVuZCgpO1xuICAgICAgICB9XG4gICAgfVxufSIsImltcG9ydCB7IERlY2xhcmF0aW9uIH0gZnJvbSAnLi9kZWNsYXJhdGlvbic7XG5pbXBvcnQgeyBUcml2aWFsU3Vic2NyaXB0aW9uLCBTdWJzY3JpcHRpb25FeGVjdXRvciB9IGZyb20gJy4uL3N1YnNjcmlwdGlvbnMvdHJpdmlhbF9zdWJzY3JpcHRpb24nO1xuXG5leHBvcnQgeyBTdWJzY3JpcHRpb25FeGVjdXRvciB9O1xuXG5leHBvcnQgY2xhc3MgVW5tYXRjaERlY2xhcmF0aW9uIGV4dGVuZHMgRGVjbGFyYXRpb24ge1xuICAgIHByb3RlY3RlZCBzdWJzY3JpcHRpb246IFRyaXZpYWxTdWJzY3JpcHRpb247XG4gICAgcHJvdGVjdGVkIGV4ZWN1dG9yOiBTdWJzY3JpcHRpb25FeGVjdXRvcjtcblxuICAgIGNvbnN0cnVjdG9yKG5vZGU6IE5vZGUsIGV4ZWN1dG9yOiBTdWJzY3JpcHRpb25FeGVjdXRvcikge1xuICAgICAgICBzdXBlcihub2RlKTtcblxuICAgICAgICB0aGlzLmV4ZWN1dG9yID0gZXhlY3V0b3I7XG5cbiAgICAgICAgdGhpcy5zdWJzY3JpcHRpb24gPSBuZXcgVHJpdmlhbFN1YnNjcmlwdGlvbih0aGlzLm5vZGUsIHsgZGlzY29ubmVjdGVkOiB0cnVlIH0sIHRoaXMuZXhlY3V0b3IpO1xuICAgIH1cblxuICAgIGluc3BlY3QoKTogdm9pZCB7XG4gICAgICAgIGNvbnNvbGUuZ3JvdXBDb2xsYXBzZWQoJ3VubWF0Y2hlcycpO1xuICAgICAgICBjb25zb2xlLmxvZyh0aGlzLmV4ZWN1dG9yKTtcbiAgICAgICAgY29uc29sZS5ncm91cEVuZCgpO1xuICAgIH1cbn0iLCJpbXBvcnQgeyBTY29wZVRyYWNraW5nRGVjbGFyYXRpb24sIE5vZGVNYXRjaGVyLCBTY29wZUV4ZWN1dG9yIH0gZnJvbSAnLi9zY29wZV90cmFja2luZ19kZWNsYXJhdGlvbic7XG5pbXBvcnQgeyBOb2RlTWF0Y2hlc1N1YnNjcmlwdGlvbiwgTm9kZU1hdGNoZXNDaGFuZ2VkRXZlbnQgfSBmcm9tICcuLi9zdWJzY3JpcHRpb25zL25vZGVfbWF0Y2hlc19zdWJzY3JpcHRpb24nO1xuXG5leHBvcnQgeyBOb2RlTWF0Y2hlciwgU2NvcGVFeGVjdXRvciB9O1xuXG5leHBvcnQgY2xhc3MgV2hlbkRlY2xhcmF0aW9uIGV4dGVuZHMgU2NvcGVUcmFja2luZ0RlY2xhcmF0aW9uIHtcbiAgICBwcm90ZWN0ZWQgc3Vic2NyaXB0aW9uOiBOb2RlTWF0Y2hlc1N1YnNjcmlwdGlvbjtcbiAgICBwcm90ZWN0ZWQgbWF0Y2hlcjogTm9kZU1hdGNoZXI7XG4gICAgcHJvdGVjdGVkIGV4ZWN1dG9yOiBTY29wZUV4ZWN1dG9yO1xuXG4gICAgY29uc3RydWN0b3Iobm9kZTogTm9kZSwgbWF0Y2hlcjogTm9kZU1hdGNoZXIsIGV4ZWN1dG9yOiBTY29wZUV4ZWN1dG9yKSB7XG4gICAgICAgIHN1cGVyKG5vZGUpO1xuXG4gICAgICAgIHRoaXMubWF0Y2hlciA9IG1hdGNoZXI7XG4gICAgICAgIHRoaXMuZXhlY3V0b3IgPSBleGVjdXRvcjtcblxuICAgICAgICB0aGlzLnN1YnNjcmlwdGlvbiA9IG5ldyBOb2RlTWF0Y2hlc1N1YnNjcmlwdGlvbih0aGlzLm5vZGUsIHRoaXMubWF0Y2hlciwgKGV2ZW50OiBOb2RlTWF0Y2hlc0NoYW5nZWRFdmVudCkgPT4ge1xuICAgICAgICAgICAgaWYoZXZlbnQuaXNNYXRjaGluZykge1xuICAgICAgICAgICAgICAgIHRoaXMuYWRkQ2hpbGRTY29wZUJ5Tm9kZSh0aGlzLm5vZGUsIHRoaXMuZXhlY3V0b3IpO1xuICAgICAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICAgICAgdGhpcy5yZW1vdmVDaGlsZFNjb3BlQnlOb2RlKHRoaXMubm9kZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGluc3BlY3QoaW5jbHVkZVNvdXJjZT86IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgY29uc29sZS5ncm91cENvbGxhcHNlZCgnd2hlbicsIHRoaXMubWF0Y2hlcik7XG5cbiAgICAgICAgdHJ5e1xuICAgICAgICAgICAgdGhpcy5pbnNwZWN0Q2hpbGRTY29wZXMoaW5jbHVkZVNvdXJjZSk7ICAgICAgICBcbiAgICAgICAgfWZpbmFsbHl7XG4gICAgICAgICAgICBjb25zb2xlLmdyb3VwRW5kKCk7XG4gICAgICAgIH1cbiAgICB9XG59IiwiZXhwb3J0IGludGVyZmFjZSBOb2RlVmlzaXRvciB7IChub2RlOiBOb2RlKTogTm9kZU1hdGNoZXIgfCBib29sZWFuIH1cbmV4cG9ydCBkZWNsYXJlIHR5cGUgTm9kZU1hdGNoZXIgPSBzdHJpbmcgfCBOb2RlTGlzdE9mPE5vZGU+IHwgTm9kZVtdIHwgTm9kZVZpc2l0b3I7XG5cbmV4cG9ydCBjbGFzcyBOb2RlQ29sbGVjdG9yIHtcbiAgICBwcml2YXRlIHN0YXRpYyBpbnN0YW5jZTogTm9kZUNvbGxlY3RvcjtcbiAgICBcbiAgICBwcml2YXRlIHN0YXRpYyByZWFkb25seSBOT0RFX01BVENIRVJfVFlQRV9FUlJPUl9NRVNTQUdFID0gXG4gICAgICAgIFwiRGVjbDogQSBgTm9kZU1hdGNoZXJgIG11c3QgYmUgYSBDU1Mgc2VsZWN0b3IgKHN0cmluZykgb3IgYSBmdW5jdGlvbiB3aGljaCB0YWtlcyBcIiAgK1xuICAgICAgICBcImEgbm9kZSB1bmRlciBjb25zaWRlcmF0aW9uIGFuZCByZXR1cm5zIGEgQ1NTIHNlbGVjdG9yIChzdHJpbmcpIHRoYXQgbWF0Y2hlcyBhbGwgXCIgICsgXG4gICAgICAgIFwibWF0Y2hpbmcgbm9kZXMgaW4gdGhlIHN1YnRyZWUsIGFuIGFycmF5LWxpa2Ugb2JqZWN0IG9mIG1hdGNoaW5nIG5vZGVzIGluIHRoZSBcIiAgICAgKyBcbiAgICAgICAgXCJzdWJ0cmVlLCBvciBhIGJvb2xlYW4gdmFsdWUgYXMgdG8gd2hldGhlciB0aGUgbm9kZSBzaG91bGQgYmUgaW5jbHVkZWQgKGluIHRoaXMgXCIgICArXG4gICAgICAgIFwiY2FzZSwgdGhlIGZ1bmN0aW9uIHdpbGwgYmUgaW52b2tlZCBhZ2FpbiBmb3IgYWxsIGNoaWxkcmVuIG9mIHRoZSBub2RlKS5cIjtcblxuICAgIHN0YXRpYyBpc01hdGNoaW5nTm9kZShyb290Tm9kZTogTm9kZSwgbm9kZU1hdGNoZXI6IE5vZGVNYXRjaGVyKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldEluc3RhbmNlKCkuaXNNYXRjaGluZ05vZGUocm9vdE5vZGUsIG5vZGVNYXRjaGVyKTtcbiAgICB9XG5cbiAgICBzdGF0aWMgY29sbGVjdE1hdGNoaW5nTm9kZXMocm9vdE5vZGU6IE5vZGUsIG5vZGVNYXRjaGVyOiBOb2RlTWF0Y2hlcik6IE5vZGVbXSB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldEluc3RhbmNlKCkuY29sbGVjdE1hdGNoaW5nTm9kZXMocm9vdE5vZGUsIG5vZGVNYXRjaGVyKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHN0YXRpYyBnZXRJbnN0YW5jZSgpIDogTm9kZUNvbGxlY3RvciB7XG4gICAgICAgIHJldHVybiB0aGlzLmluc3RhbmNlIHx8ICh0aGlzLmluc3RhbmNlID0gbmV3IE5vZGVDb2xsZWN0b3IoKSk7XG4gICAgfVxuXG4gICAgaXNNYXRjaGluZ05vZGUobm9kZTogTm9kZSwgbm9kZU1hdGNoZXI6IE5vZGVNYXRjaGVyKTogYm9vbGVhbiB7XG4gICAgICAgIHN3aXRjaCh0eXBlb2Yobm9kZU1hdGNoZXIpKSB7XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoTm9kZUNvbGxlY3Rvci5OT0RFX01BVENIRVJfVFlQRV9FUlJPUl9NRVNTQUdFKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgICAgICAgICAgICAgbGV0IGNzc1NlbGVjdG9yOiBzdHJpbmcgPSA8c3RyaW5nPm5vZGVNYXRjaGVyO1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmlzTWF0Y2hpbmdOb2RlRnJvbUNzc1NlbGVjdG9yKG5vZGUsIGNzc1NlbGVjdG9yKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgICAgICAgICAgICBsZXQgb2JqZWN0ID0gPE9iamVjdD5ub2RlTWF0Y2hlcjtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5pc01hdGNoaW5nTm9kZUZyb21PYmplY3Qobm9kZSwgb2JqZWN0KTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIGNhc2UgJ2Z1bmN0aW9uJzpcbiAgICAgICAgICAgICAgICBsZXQgbm9kZVZpc3RvciA9IDxOb2RlVmlzaXRvcj5ub2RlTWF0Y2hlcjtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5pc01hdGNoaW5nTm9kZUZyb21Ob2RlVmlzdG9yKG5vZGUsIG5vZGVWaXN0b3IpOyAgICAgICBcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGNvbGxlY3RNYXRjaGluZ05vZGVzKG5vZGU6IE5vZGUsIG5vZGVNYXRjaGVyOiBOb2RlTWF0Y2hlcik6IE5vZGVbXSB7XG4gICAgICAgIHN3aXRjaCh0eXBlb2Yobm9kZU1hdGNoZXIpKSB7XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoTm9kZUNvbGxlY3Rvci5OT0RFX01BVENIRVJfVFlQRV9FUlJPUl9NRVNTQUdFKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgICAgICAgICAgICAgbGV0IGNzc1NlbGVjdG9yOiBzdHJpbmcgPSA8c3RyaW5nPm5vZGVNYXRjaGVyO1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmNvbGxlY3RNYXRjaGluZ05vZGVzRnJvbUNzc1NlbGVjdG9yKG5vZGUsIGNzc1NlbGVjdG9yKTtcblxuICAgICAgICAgICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgICAgICAgICAgICBsZXQgb2JqZWN0ID0gPE9iamVjdD5ub2RlTWF0Y2hlcjtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5jb2xsZWN0TWF0Y2hpbmdOb2Rlc0Zyb21PYmplY3Qobm9kZSwgb2JqZWN0KTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIGNhc2UgJ2Z1bmN0aW9uJzpcbiAgICAgICAgICAgICAgICBsZXQgbm9kZVZpc3RvciA9IDxOb2RlVmlzaXRvcj5ub2RlTWF0Y2hlcjtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5jb2xsZWN0TWF0Y2hpbmdOb2Rlc0Zyb21Ob2RlVmlzdG9yKG5vZGUsIG5vZGVWaXN0b3IpOyAgICAgICBcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgaXNNYXRjaGluZ05vZGVGcm9tQ3NzU2VsZWN0b3Iobm9kZTogTm9kZSwgY3NzU2VsZWN0b3I6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgICAgICBpZihub2RlIGluc3RhbmNlb2YgRWxlbWVudCAmJiB0eXBlb2Yobm9kZS5tYXRjaGVzKSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgcmV0dXJuIG5vZGUubWF0Y2hlcyhjc3NTZWxlY3Rvcik7XG4gICAgICAgIH1lbHNle1xuICAgICAgICAgICAgcmV0dXJuIGlzTWVtYmVyT2ZBcnJheUxpa2Uobm9kZS5vd25lckRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoY3NzU2VsZWN0b3IpLCBub2RlKTsgICAgICAgICAgICBcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgaXNNYXRjaGluZ05vZGVGcm9tT2JqZWN0KG5vZGU6IE5vZGUsIG9iamVjdDogT2JqZWN0KTogYm9vbGVhbiB7XG4gICAgICAgIGlmKG9iamVjdCA9PT0gbnVsbCkge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgIGlmKGlzQXJyYXlMaWtlKG9iamVjdCkpIHtcbiAgICAgICAgICAgICAgICBsZXQgYXJyYXlMaWtlID0gPEFycmF5TGlrZTxhbnk+Pm9iamVjdDtcblxuICAgICAgICAgICAgICAgIGlmKGFycmF5TGlrZS5sZW5ndGggPT09IDAgfHwgYXJyYXlMaWtlWzBdIGluc3RhbmNlb2YgTm9kZSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gaXNNZW1iZXJPZkFycmF5TGlrZShhcnJheUxpa2UsIG5vZGUpOyAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihOb2RlQ29sbGVjdG9yLk5PREVfTUFUQ0hFUl9UWVBFX0VSUk9SX01FU1NBR0UpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1lbHNle1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoTm9kZUNvbGxlY3Rvci5OT0RFX01BVENIRVJfVFlQRV9FUlJPUl9NRVNTQUdFKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgaXNNYXRjaGluZ05vZGVGcm9tTm9kZVZpc3Rvcihub2RlOiBOb2RlLCBub2RlVmlzdG9yOiBOb2RlVmlzaXRvcik6IGJvb2xlYW4ge1xuICAgICAgICBsZXQgdmlzaXRvclJlc3VsdCA9IG5vZGVWaXN0b3Iobm9kZSk7XG5cbiAgICAgICAgaWYodHlwZW9mKHZpc2l0b3JSZXN1bHQpID09PSAnYm9vbGVhbicpIHtcbiAgICAgICAgICAgIGxldCBpc01hdGNoID0gPGJvb2xlYW4+dmlzaXRvclJlc3VsdDtcbiAgICAgICAgICAgIHJldHVybiBpc01hdGNoO1xuICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgIGxldCBub2RlTWF0Y2hlciA9IDxOb2RlTWF0Y2hlcj52aXNpdG9yUmVzdWx0O1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuaXNNYXRjaGluZ05vZGUobm9kZSwgbm9kZU1hdGNoZXIpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBjb2xsZWN0TWF0Y2hpbmdOb2Rlc0Zyb21Dc3NTZWxlY3Rvcihub2RlOiBOb2RlLCBjc3NTZWxlY3Rvcjogc3RyaW5nKTogTm9kZVtdIHtcbiAgICAgICAgaWYobm9kZSBpbnN0YW5jZW9mIEVsZW1lbnQgfHwgbm9kZSBpbnN0YW5jZW9mIERvY3VtZW50IHx8IG5vZGUgaW5zdGFuY2VvZiBEb2N1bWVudEZyYWdtZW50KSB7XG4gICAgICAgICAgICByZXR1cm4gdG9BcnJheTxOb2RlPihub2RlLnF1ZXJ5U2VsZWN0b3JBbGwoY3NzU2VsZWN0b3IpKTtcbiAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGNvbGxlY3RNYXRjaGluZ05vZGVzRnJvbU9iamVjdChfbm9kZTogTm9kZSwgb2JqZWN0OiBPYmplY3QpOiBOb2RlW10ge1xuICAgICAgICBpZihvYmplY3QgPT09IG51bGwpIHtcbiAgICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICBpZihpc0FycmF5TGlrZShvYmplY3QpKSB7XG4gICAgICAgICAgICAgICAgbGV0IGFycmF5TGlrZSA9IDxBcnJheUxpa2U8YW55Pj5vYmplY3Q7XG5cbiAgICAgICAgICAgICAgICBpZihhcnJheUxpa2UubGVuZ3RoID09PSAwIHx8IGFycmF5TGlrZVswXSBpbnN0YW5jZW9mIE5vZGUpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRvQXJyYXk8Tm9kZT4oYXJyYXlMaWtlKTsgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoTm9kZUNvbGxlY3Rvci5OT0RFX01BVENIRVJfVFlQRV9FUlJPUl9NRVNTQUdFKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKE5vZGVDb2xsZWN0b3IuTk9ERV9NQVRDSEVSX1RZUEVfRVJST1JfTUVTU0FHRSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGNvbGxlY3RNYXRjaGluZ05vZGVzRnJvbU5vZGVWaXN0b3Iobm9kZTogTm9kZSwgbm9kZVZpc3RvcjogTm9kZVZpc2l0b3IpOiBOb2RlW10ge1xuICAgICAgICBsZXQgbm9kZXM6IE5vZGVbXSA9IFtdO1xuICAgICAgICBsZXQgY2hpbGROb2RlcyA9IG5vZGUuY2hpbGROb2RlcztcbiAgICAgICAgXG4gICAgICAgIGZvcihsZXQgaW5kZXggPSAwLCBsZW5ndGggPSBjaGlsZE5vZGVzLmxlbmd0aDsgaW5kZXggPCBsZW5ndGg7IGluZGV4KyspIHtcbiAgICAgICAgICAgIGxldCBjaGlsZCA9IGNoaWxkTm9kZXNbaW5kZXhdO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBpZihjaGlsZCBpbnN0YW5jZW9mIE5vZGUpIHtcbiAgICAgICAgICAgICAgICBsZXQgbm9kZTogTm9kZSA9IGNoaWxkO1xuICAgICAgICAgICAgICAgIGxldCB2aXNpdG9yUmVzdWx0ID0gbm9kZVZpc3Rvcihub2RlKTtcblxuICAgICAgICAgICAgICAgIGlmKHR5cGVvZih2aXNpdG9yUmVzdWx0KSA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgICAgICAgICAgICAgIGxldCBpc01hdGNoID0gPGJvb2xlYW4+dmlzaXRvclJlc3VsdDtcblxuICAgICAgICAgICAgICAgICAgICBpZihpc01hdGNoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBub2Rlcy5wdXNoKG5vZGUpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICAgICAgICAgIG5vZGVzLnB1c2goLi4udGhpcy5jb2xsZWN0TWF0Y2hpbmdOb2Rlcyhub2RlLCB2aXNpdG9yUmVzdWx0KSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG5vZGVzO1xuICAgIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgTm9kZUNvbGxlY3RvcjtcblxuZnVuY3Rpb24gaXNBcnJheUxpa2UodmFsdWU6IGFueSkge1xuICAgIHJldHVybiB0eXBlb2YodmFsdWUpID09PSAnb2JqZWN0JyAmJiB0eXBlb2YodmFsdWUubGVuZ3RoKSA9PT0gJ251bWJlcic7XG59XG5cbmZ1bmN0aW9uIHRvQXJyYXk8VD4oYXJyYXlMaWtlOiBBcnJheUxpa2U8VD4pOiBBcnJheTxUPiB7XG4gICAgaWYoaXNBcnJheUxpa2UoYXJyYXlMaWtlKSkge1xuICAgICAgICByZXR1cm4gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJyYXlMaWtlLCAwKTtcbiAgICB9ZWxzZXtcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignRXhwZWN0ZWQgQXJyYXlMaWtlJyk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBpc01lbWJlck9mQXJyYXlMaWtlKGhheXN0YWNrOiBBcnJheUxpa2U8YW55PiwgIG5lZWRsZTogYW55KSB7XG4gICAgcmV0dXJuIEFycmF5LnByb3RvdHlwZS5pbmRleE9mLmNhbGwoaGF5c3RhY2ssIG5lZWRsZSkgIT09IC0xO1xufVxuIiwiaW1wb3J0IHsgRGVjbGFyYXRpb24sIFN1YnNjcmlwdGlvbkV4ZWN1dG9yIH0gZnJvbSAnLi9kZWNsYXJhdGlvbnMvZGVjbGFyYXRpb24nO1xuaW1wb3J0IHsgTWF0Y2hEZWNsYXJhdGlvbiB9IGZyb20gJy4vZGVjbGFyYXRpb25zL21hdGNoX2RlY2xhcmF0aW9uJztcbmltcG9ydCB7IFVubWF0Y2hEZWNsYXJhdGlvbiB9IGZyb20gJy4vZGVjbGFyYXRpb25zL3VubWF0Y2hfZGVjbGFyYXRpb24nO1xuaW1wb3J0IHsgT25EZWNsYXJhdGlvbiwgRXZlbnRNYXRjaGVyIH0gZnJvbSAnLi9kZWNsYXJhdGlvbnMvb25fZGVjbGFyYXRpb24nO1xuXG5pbXBvcnQgeyBOb2RlTWF0Y2hlciB9IGZyb20gJy4vZGVjbGFyYXRpb25zL3Njb3BlX3RyYWNraW5nX2RlY2xhcmF0aW9uJztcbmltcG9ydCB7IFNlbGVjdERlY2xhcmF0aW9uIH0gZnJvbSAnLi9kZWNsYXJhdGlvbnMvc2VsZWN0X2RlY2xhcmF0aW9uJztcbmltcG9ydCB7IFdoZW5EZWNsYXJhdGlvbiB9IGZyb20gJy4vZGVjbGFyYXRpb25zL3doZW5fZGVjbGFyYXRpb24nO1xuXG5leHBvcnQgeyBEZWNsYXJhdGlvbiwgU3Vic2NyaXB0aW9uRXhlY3V0b3IsIE5vZGVNYXRjaGVyLCBFdmVudE1hdGNoZXIgfTtcblxuZXhwb3J0IGludGVyZmFjZSBTY29wZUV4ZWN1dG9yIHsgXG4gICAgKHNjb3BlOiBTY29wZSwgbm9kZTogTm9kZSk6IHZvaWRcbn07XG5cbmV4cG9ydCBjbGFzcyBTY29wZSB7XG4gICAgc3RhdGljIGJ1aWxkUm9vdFNjb3BlKG5vZGU6IE5vZGUpOiBTY29wZSB7XG4gICAgICAgIGxldCBzY29wZSA9IG5ldyBTY29wZShub2RlKTtcbiAgICAgICAgc2NvcGUuYWN0aXZhdGUoKTtcblxuICAgICAgICByZXR1cm4gc2NvcGU7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSByZWFkb25seSBub2RlOiBOb2RlO1xuICAgIHByaXZhdGUgcmVhZG9ubHkgZXhlY3V0b3JzOiBTY29wZUV4ZWN1dG9yW10gPSBbXTtcblxuICAgIHByaXZhdGUgaXNBY3RpdmF0ZWQ6IGJvb2xlYW4gPSBmYWxzZTtcbiAgICBwcml2YXRlIGRlY2xhcmF0aW9uczogRGVjbGFyYXRpb25bXSA9IFtdO1xuXG4gICAgY29uc3RydWN0b3Iobm9kZTogTm9kZSwgZXhlY3V0b3I/OiBTY29wZUV4ZWN1dG9yKSB7XG4gICAgICAgIHRoaXMubm9kZSA9IG5vZGU7XG5cbiAgICAgICAgaWYoZXhlY3V0b3IpIHtcbiAgICAgICAgICAgIHRoaXMuYWRkRXhlY3V0b3IoZXhlY3V0b3IpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgYWRkRXhlY3V0b3IoZXhlY3V0b3I6IFNjb3BlRXhlY3V0b3IpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5leGVjdXRvcnMucHVzaChleGVjdXRvcik7XG5cbiAgICAgICAgcmV0dXJuIGV4ZWN1dG9yLmNhbGwodGhpcywgdGhpcywgdGhpcy5ub2RlKTtcbiAgICB9XG5cbiAgICBnZXROb2RlKCk6IE5vZGUge1xuICAgICAgICByZXR1cm4gdGhpcy5ub2RlO1xuICAgIH1cblxuICAgIGdldERlY2xhcmF0aW9ucygpOiBEZWNsYXJhdGlvbltdIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZGVjbGFyYXRpb25zO1xuICAgIH1cblxuICAgIGluc3BlY3QoaW5jbHVkZVNvdXJjZT86IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgY29uc29sZS5ncm91cENvbGxhcHNlZCgnPDwnLCB0aGlzLm5vZGUsICc+PicpO1xuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBpZihpbmNsdWRlU291cmNlKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5ncm91cENvbGxhcHNlZCgnc291cmNlJyk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBmb3IobGV0IGV4ZWN1dG9yIG9mIHRoaXMuZXhlY3V0b3JzKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGV4ZWN1dG9yKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBjb25zb2xlLmdyb3VwRW5kKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGZvcihsZXQgZGVjbGFyYXRpb24gb2YgdGhpcy5kZWNsYXJhdGlvbnMpIHtcbiAgICAgICAgICAgICAgICBkZWNsYXJhdGlvbi5pbnNwZWN0KGluY2x1ZGVTb3VyY2UpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9ZmluYWxseXtcbiAgICAgICAgICAgICg8YW55PmNvbnNvbGUuZ3JvdXBFbmQpKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBhY3RpdmF0ZSgpOiB2b2lkIHtcbiAgICAgICAgaWYoIXRoaXMuaXNBY3RpdmF0ZWQpIHtcbiAgICAgICAgICAgIHRoaXMuaXNBY3RpdmF0ZWQgPSB0cnVlO1xuXG4gICAgICAgICAgICBmb3IobGV0IGRlY2xhcmF0aW9uIG9mIHRoaXMuZGVjbGFyYXRpb25zKSB7XG4gICAgICAgICAgICAgICAgZGVjbGFyYXRpb24uYWN0aXZhdGUoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGRlYWN0aXZhdGUoKTogdm9pZCB7ICAgICAgICBcbiAgICAgICAgaWYodGhpcy5pc0FjdGl2YXRlZCkge1xuICAgICAgICAgICAgdGhpcy5pc0FjdGl2YXRlZCA9IGZhbHNlOyAgICAgICAgICAgIFxuICAgICAgICAgICAgXG4gICAgICAgICAgICBmb3IobGV0IGRlY2xhcmF0aW9uIG9mIHRoaXMuZGVjbGFyYXRpb25zKSB7XG4gICAgICAgICAgICAgICAgZGVjbGFyYXRpb24uZGVhY3RpdmF0ZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpc3RpbmUoKTogdm9pZCB7XG4gICAgICAgIHRoaXMuZGVhY3RpdmF0ZSgpO1xuICAgICAgICB0aGlzLnJlbW92ZUFsbERlY2xhcmF0aW9ucygpO1xuICAgIH1cblxuICAgIG1hdGNoKGV4ZWN1dG9yOiBTdWJzY3JpcHRpb25FeGVjdXRvcik6IFNjb3BlIHtcbiAgICAgICAgdGhpcy5hZGREZWNsYXJhdGlvbihuZXcgTWF0Y2hEZWNsYXJhdGlvbih0aGlzLm5vZGUsIGV4ZWN1dG9yKSk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgdW5tYXRjaChleGVjdXRvcjogU3Vic2NyaXB0aW9uRXhlY3V0b3IpOiBTY29wZSB7XG4gICAgICAgIHRoaXMuYWRkRGVjbGFyYXRpb24obmV3IFVubWF0Y2hEZWNsYXJhdGlvbih0aGlzLm5vZGUsIGV4ZWN1dG9yKSk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgc2VsZWN0KG1hdGNoZXI6IE5vZGVNYXRjaGVyLCBleGVjdXRvcjogU2NvcGVFeGVjdXRvcik6IFNjb3BlIHtcbiAgICAgICAgdGhpcy5hZGREZWNsYXJhdGlvbihuZXcgU2VsZWN0RGVjbGFyYXRpb24odGhpcy5ub2RlLCBtYXRjaGVyLCBleGVjdXRvcikpO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHdoZW4obWF0Y2hlcjogTm9kZU1hdGNoZXIsIGV4ZWN1dG9yOiBTY29wZUV4ZWN1dG9yKTogU2NvcGUge1xuXHRcdHRoaXMuYWRkRGVjbGFyYXRpb24obmV3IFdoZW5EZWNsYXJhdGlvbih0aGlzLm5vZGUsIG1hdGNoZXIsIGV4ZWN1dG9yKSk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgb24oZXZlbnRNYXRjaGVyOiBFdmVudE1hdGNoZXIsIGV4ZWN1dG9yOiBTdWJzY3JpcHRpb25FeGVjdXRvcik6IFNjb3BlO1xuICAgIG9uKGV2ZW50TWF0Y2hlcjogRXZlbnRNYXRjaGVyLCBub2RlTWF0Y2hlcjogTm9kZU1hdGNoZXIsIGV4ZWN1dG9yOiBTdWJzY3JpcHRpb25FeGVjdXRvcik6IFNjb3BlO1xuICAgIG9uKGV2ZW50TWF0Y2hlcjogRXZlbnRNYXRjaGVyLCBleGVjdXRvck9yTm9kZU1hdGNoZXI6IFN1YnNjcmlwdGlvbkV4ZWN1dG9yIHwgTm9kZU1hdGNoZXIsIG1heWJlRXhlY3V0b3I/OiBTdWJzY3JpcHRpb25FeGVjdXRvcik6IFNjb3BlIHtcbiAgICAgICAgbGV0IGFyZ3VtZW50c0NvdW50ID0gYXJndW1lbnRzLmxlbmd0aDtcblxuICAgICAgICBzd2l0Y2goYXJndW1lbnRzQ291bnQpIHtcbiAgICAgICAgICAgIGNhc2UgMjpcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5vbldpdGhUd29Bcmd1bWVudHMoZXZlbnRNYXRjaGVyLCA8U3Vic2NyaXB0aW9uRXhlY3V0b3I+ZXhlY3V0b3JPck5vZGVNYXRjaGVyKTtcbiAgICAgICAgICAgIGNhc2UgMzpcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5vbldpdGhUaHJlZUFyZ3VtZW50cyhldmVudE1hdGNoZXIsIDxOb2RlTWF0Y2hlcj5leGVjdXRvck9yTm9kZU1hdGNoZXIsIDxTdWJzY3JpcHRpb25FeGVjdXRvcj5tYXliZUV4ZWN1dG9yKTtcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcIkZhaWxlZCB0byBleGVjdXRlICdvbicgb24gJ1Njb3BlJzogMiBvciAzIGFyZ3VtZW50cyByZXF1aXJlZCwgYnV0IFwiICsgYXJndW1lbnRzQ291bnQgKyBcIiBwcmVzZW50LlwiKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgb25XaXRoVHdvQXJndW1lbnRzKGV2ZW50TWF0Y2hlcjogRXZlbnRNYXRjaGVyLCBleGVjdXRvcjogU3Vic2NyaXB0aW9uRXhlY3V0b3IpOiBTY29wZSB7XG4gICAgICAgIHRoaXMuYWRkRGVjbGFyYXRpb24obmV3IE9uRGVjbGFyYXRpb24odGhpcy5ub2RlLCBldmVudE1hdGNoZXIsIGV4ZWN1dG9yKSk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBvbldpdGhUaHJlZUFyZ3VtZW50cyhldmVudE1hdGNoZXI6IEV2ZW50TWF0Y2hlciwgbm9kZU1hdGNoZXI6IE5vZGVNYXRjaGVyLCBleGVjdXRvcjogU3Vic2NyaXB0aW9uRXhlY3V0b3IpOiBTY29wZSB7XG4gICAgICAgIHRoaXMuc2VsZWN0KG5vZGVNYXRjaGVyLCAoc2NvcGUpID0+IHtcbiAgICAgICAgICAgIHNjb3BlLm9uKGV2ZW50TWF0Y2hlciwgZXhlY3V0b3IpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwcml2YXRlIGFkZERlY2xhcmF0aW9uKGRlY2xhcmF0aW9uOiBEZWNsYXJhdGlvbik6IHZvaWQge1xuICAgICAgICB0aGlzLmRlY2xhcmF0aW9ucy5wdXNoKGRlY2xhcmF0aW9uKTtcblxuICAgICAgICBpZih0aGlzLmlzQWN0aXZhdGVkKSB7XG4gICAgICAgICAgICBkZWNsYXJhdGlvbi5hY3RpdmF0ZSgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSByZW1vdmVEZWNsYXJhdGlvbihkZWNsYXJhdGlvbjogRGVjbGFyYXRpb24pOiB2b2lkIHsgIFxuICAgICAgICBsZXQgaW5kZXggPSB0aGlzLmRlY2xhcmF0aW9ucy5pbmRleE9mKGRlY2xhcmF0aW9uKTtcblxuICAgICAgICBpZihpbmRleCA+PSAwKSB7XG4gICAgICAgICAgICB0aGlzLmRlY2xhcmF0aW9ucy5zcGxpY2UoaW5kZXgsIDEpO1xuICAgICAgICB9XG5cbiAgICAgICAgZGVjbGFyYXRpb24uZGVhY3RpdmF0ZSgpOyAgICAgICAgXG4gICAgfVxuXG4gICAgcHJpdmF0ZSByZW1vdmVBbGxEZWNsYXJhdGlvbnMoKSB7ICAgICAgICBcbiAgICAgICAgbGV0IGRlY2xhcmF0aW9uOiBEZWNsYXJhdGlvbjtcblxuICAgICAgICB3aGlsZShkZWNsYXJhdGlvbiA9IHRoaXMuZGVjbGFyYXRpb25zWzBdKSB7XG4gICAgICAgICAgICB0aGlzLnJlbW92ZURlY2xhcmF0aW9uKGRlY2xhcmF0aW9uKTtcbiAgICAgICAgfVxuICAgIH1cbn1cbiIsImltcG9ydCB7IFN1YnNjcmlwdGlvbiwgU3Vic2NyaXB0aW9uRXhlY3V0b3IsIFN1YnNjcmlwdGlvbkV2ZW50IH0gZnJvbSAnLi9zdWJzY3JpcHRpb24nO1xuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgRG9jdW1lbnRNdXRhdGlvblN1YnNjcmlwdGlvbiBleHRlbmRzIFN1YnNjcmlwdGlvbiB7XG4gICAgc3RhdGljIHJlYWRvbmx5IG11dGF0aW9uT2JzZXJ2ZXJJbml0OiBNdXRhdGlvbk9ic2VydmVySW5pdCA9IHtcbiAgICAgICAgY2hpbGRMaXN0OiB0cnVlLFxuICAgICAgICBhdHRyaWJ1dGVzOiB0cnVlLFxuICAgICAgICBjaGFyYWN0ZXJEYXRhOiB0cnVlLFxuICAgICAgICBzdWJ0cmVlOiB0cnVlXG4gICAgfTtcblxuICAgIHByaXZhdGUgaXNMaXN0ZW5pbmcgOiBib29sZWFuID0gZmFsc2U7XG4gICAgcHJpdmF0ZSByZWFkb25seSBtdXRhdGlvbk9ic2VydmVyOiBNdXRhdGlvbk9ic2VydmVyO1xuXG4gICAgY29uc3RydWN0b3Iobm9kZTogTm9kZSwgZXhlY3V0b3I6IFN1YnNjcmlwdGlvbkV4ZWN1dG9yKSB7XG4gICAgICAgIHN1cGVyKG5vZGUsIGV4ZWN1dG9yKTtcblxuICAgICAgICB0aGlzLm11dGF0aW9uT2JzZXJ2ZXIgPSBuZXcgTXV0YXRpb25PYnNlcnZlcigoKTogdm9pZCA9PiB7XG4gICAgICAgICAgICB0aGlzLmhhbmRsZU11dGF0aW9ucygpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcm90ZWN0ZWQgc3RhcnRMaXN0ZW5pbmcoKTogdm9pZCB7XG4gICAgICAgIGlmKCF0aGlzLmlzTGlzdGVuaW5nKSB7XG4gICAgICAgICAgICB0aGlzLm11dGF0aW9uT2JzZXJ2ZXIub2JzZXJ2ZSh0aGlzLm5vZGUsIERvY3VtZW50TXV0YXRpb25TdWJzY3JpcHRpb24ubXV0YXRpb25PYnNlcnZlckluaXQpO1xuICAgICAgICAgICAgdGhpcy5pc0xpc3RlbmluZyA9IHRydWU7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcm90ZWN0ZWQgc3RvcExpc3RlbmluZygpOiB2b2lkIHtcbiAgICAgICAgaWYodGhpcy5pc0xpc3RlbmluZykge1xuICAgICAgICAgICAgdGhpcy5tdXRhdGlvbk9ic2VydmVyLmRpc2Nvbm5lY3QoKTtcbiAgICAgICAgICAgIHRoaXMuaXNMaXN0ZW5pbmcgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBcbiAgICBwcm90ZWN0ZWQgYWJzdHJhY3QgaGFuZGxlTXV0YXRpb25zKCk6IHZvaWQ7XG59XG5cbmV4cG9ydCB7IFN1YnNjcmlwdGlvbiwgU3Vic2NyaXB0aW9uRXhlY3V0b3IsIFN1YnNjcmlwdGlvbkV2ZW50IH07IiwiaW1wb3J0IHsgU3Vic2NyaXB0aW9uLCBTdWJzY3JpcHRpb25FeGVjdXRvciB9IGZyb20gJy4vc3Vic2NyaXB0aW9uJztcblxuZXhwb3J0IHsgU3Vic2NyaXB0aW9uRXhlY3V0b3IgfTtcblxuZXhwb3J0IGNsYXNzIEV2ZW50U3Vic2NyaXB0aW9uIGV4dGVuZHMgU3Vic2NyaXB0aW9uIHtcbiAgICByZWFkb25seSBldmVudE1hdGNoZXI6IEV2ZW50TWF0Y2hlcjtcbiAgICByZWFkb25seSBldmVudE5hbWVzOiBzdHJpbmdbXTtcblxuICAgIHByaXZhdGUgaXNDb25uZWN0ZWQgOiBib29sZWFuID0gZmFsc2U7ICAgIFxuICAgIHByaXZhdGUgcmVhZG9ubHkgZXZlbnRMaXN0ZW5lcjogRXZlbnRMaXN0ZW5lcjtcblxuICAgIGNvbnN0cnVjdG9yKG5vZGU6IE5vZGUsIGV2ZW50TWF0Y2hlcjogRXZlbnRNYXRjaGVyLCBleGVjdXRvcjogU3Vic2NyaXB0aW9uRXhlY3V0b3IpIHtcbiAgICAgICAgc3VwZXIobm9kZSwgZXhlY3V0b3IpO1xuXG4gICAgICAgIHRoaXMuZXZlbnRNYXRjaGVyID0gZXZlbnRNYXRjaGVyO1xuICAgICAgICB0aGlzLmV2ZW50TmFtZXMgPSB0aGlzLnBhcnNlRXZlbnRNYXRjaGVyKHRoaXMuZXZlbnRNYXRjaGVyKTtcblxuICAgICAgICB0aGlzLmV2ZW50TGlzdGVuZXIgPSAoZXZlbnQ6IEV2ZW50KTogdm9pZCA9PiB7XG4gICAgICAgICAgICB0aGlzLmhhbmRsZUV2ZW50KGV2ZW50KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGNvbm5lY3QoKTogdm9pZCB7XG4gICAgICAgIGlmKCF0aGlzLmlzQ29ubmVjdGVkKSB7XG4gICAgICAgICAgICB0aGlzLmlzQ29ubmVjdGVkID0gdHJ1ZTtcblxuICAgICAgICAgICAgZm9yKGxldCBldmVudE5hbWUgb2YgdGhpcy5ldmVudE5hbWVzKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5ub2RlLmFkZEV2ZW50TGlzdGVuZXIoZXZlbnROYW1lLCB0aGlzLmV2ZW50TGlzdGVuZXIsIGZhbHNlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGRpc2Nvbm5lY3QoKTogdm9pZCB7XG4gICAgICAgIGlmKHRoaXMuaXNDb25uZWN0ZWQpIHtcbiAgICAgICAgICAgIGZvcihsZXQgZXZlbnROYW1lIG9mIHRoaXMuZXZlbnROYW1lcykge1xuICAgICAgICAgICAgICAgIHRoaXMubm9kZS5yZW1vdmVFdmVudExpc3RlbmVyKGV2ZW50TmFtZSwgdGhpcy5ldmVudExpc3RlbmVyLCBmYWxzZSk7XG4gICAgICAgICAgICB9ICAgICAgICAgICAgXG5cbiAgICAgICAgICAgIHRoaXMuaXNDb25uZWN0ZWQgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgaGFuZGxlRXZlbnQoZXZlbnQ6IEV2ZW50KTogdm9pZCB7XG4gICAgICAgIHRoaXMuZXhlY3V0b3IoZXZlbnQsIHRoaXMubm9kZSk7ICAgICAgICAgXG4gICAgfVxuXG4gICAgcHJpdmF0ZSBwYXJzZUV2ZW50TWF0Y2hlcihldmVudE1hdGNoZXI6IEV2ZW50TWF0Y2hlcik6IHN0cmluZ1tdIHtcbiAgICAgICAgLy8gVE9ETzogU3VwcG9ydCBhbGwgb2YgdGhlIGpRdWVyeSBzdHlsZSBldmVudCBvcHRpb25zXG4gICAgICAgIHJldHVybiBldmVudE1hdGNoZXIuc3BsaXQoJyAnKTtcbiAgICB9IFxufVxuXG5leHBvcnQgZGVjbGFyZSB0eXBlIEV2ZW50TWF0Y2hlciA9IHN0cmluZztcbiIsImltcG9ydCB7IERvY3VtZW50TXV0YXRpb25TdWJzY3JpcHRpb24sIFN1YnNjcmlwdGlvbkV4ZWN1dG9yLCBTdWJzY3JpcHRpb25FdmVudCB9IGZyb20gJy4vZG9jdW1lbnRfbXV0YXRpb25fc3Vic2NyaXB0aW9uJztcbmltcG9ydCB7IE5vZGVNYXRjaGVyLCBOb2RlQ29sbGVjdG9yIH0gZnJvbSAnLi4vbm9kZV9jb2xsZWN0b3InO1xuXG5leHBvcnQgeyBOb2RlTWF0Y2hlciB9O1xuXG5leHBvcnQgY2xhc3MgTWF0Y2hpbmdOb2Rlc1N1YnNjcmlwdGlvbiBleHRlbmRzIERvY3VtZW50TXV0YXRpb25TdWJzY3JpcHRpb24ge1xuICAgIHJlYWRvbmx5IG1hdGNoZXI6IE5vZGVNYXRjaGVyO1xuXG4gICAgcHJpdmF0ZSBpc0Nvbm5lY3RlZDogYm9vbGVhbiA9IGZhbHNlO1xuICAgIHByaXZhdGUgbWF0Y2hpbmdOb2RlczogTm9kZVtdID0gW107XG5cbiAgICBjb25zdHJ1Y3Rvcihub2RlOiBOb2RlLCBtYXRjaGVyOiBOb2RlTWF0Y2hlciwgZXhlY3V0b3I6IFN1YnNjcmlwdGlvbkV4ZWN1dG9yKSB7XG4gICAgICAgIHN1cGVyKG5vZGUsIGV4ZWN1dG9yKTtcblxuICAgICAgICB0aGlzLm1hdGNoZXIgPSBtYXRjaGVyO1xuICAgIH1cblxuICAgIGNvbm5lY3QoKTogdm9pZCB7XG4gICAgICAgIGlmKCF0aGlzLmlzQ29ubmVjdGVkKSB7XG4gICAgICAgICAgICB0aGlzLnVwZGF0ZU1hdGNoaW5nTm9kZSh0aGlzLmNvbGxlY3RNYXRjaGluZ05vZGVzKCkpO1xuICAgICAgICAgICAgdGhpcy5zdGFydExpc3RlbmluZygpO1xuXG4gICAgICAgICAgICB0aGlzLmlzQ29ubmVjdGVkID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGRpc2Nvbm5lY3QoKTogdm9pZCB7XG4gICAgICAgIGlmKHRoaXMuaXNDb25uZWN0ZWQpIHtcbiAgICAgICAgICAgIHRoaXMuc3RvcExpc3RlbmluZygpO1xuICAgICAgICAgICAgdGhpcy51cGRhdGVNYXRjaGluZ05vZGUoW10pO1xuXG4gICAgICAgICAgICB0aGlzLmlzQ29ubmVjdGVkID0gZmFsc2U7XG4gICAgICAgIH0gICAgICAgIFxuICAgIH1cblxuICAgIHByb3RlY3RlZCBoYW5kbGVNdXRhdGlvbnMoKTogdm9pZCB7XG4gICAgICAgIHRoaXMudXBkYXRlTWF0Y2hpbmdOb2RlKHRoaXMuY29sbGVjdE1hdGNoaW5nTm9kZXMoKSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSB1cGRhdGVNYXRjaGluZ05vZGUobWF0Y2hpbmdOb2RlczogTm9kZVtdKTogdm9pZCB7XG4gICAgICAgIGxldCBwcmV2aW91c2x5TWF0Y2hpbmdOb2RlcyA9IHRoaXMubWF0Y2hpbmdOb2RlcztcblxuICAgICAgICBsZXQgYWRkZWROb2RlcyA9IGFycmF5U3VidHJhY3QobWF0Y2hpbmdOb2RlcywgcHJldmlvdXNseU1hdGNoaW5nTm9kZXMpO1xuICAgICAgICBsZXQgcmVtb3ZlZE5vZGVzID0gYXJyYXlTdWJ0cmFjdChwcmV2aW91c2x5TWF0Y2hpbmdOb2RlcywgbWF0Y2hpbmdOb2Rlcyk7XG5cbiAgICAgICAgdGhpcy5tYXRjaGluZ05vZGVzID0gbWF0Y2hpbmdOb2RlczsgICBcbiAgICAgICAgXG4gICAgICAgIGlmKGFkZGVkTm9kZXMubGVuZ3RoID4gMCB8fCByZW1vdmVkTm9kZXMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgbGV0IGV2ZW50ID0gbmV3IE1hdGNoaW5nTm9kZXNDaGFuZ2VkRXZlbnQodGhpcywgYWRkZWROb2RlcywgcmVtb3ZlZE5vZGVzKTtcblxuICAgICAgICAgICAgdGhpcy5leGVjdXRvcihldmVudCwgdGhpcy5ub2RlKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgY29sbGVjdE1hdGNoaW5nTm9kZXMoKTogTm9kZVtdIHtcbiAgICAgICAgcmV0dXJuIE5vZGVDb2xsZWN0b3IuY29sbGVjdE1hdGNoaW5nTm9kZXModGhpcy5ub2RlLCB0aGlzLm1hdGNoZXIpO1xuICAgIH1cbn1cblxuZXhwb3J0IGNsYXNzIE1hdGNoaW5nTm9kZXNDaGFuZ2VkRXZlbnQgZXh0ZW5kcyBTdWJzY3JpcHRpb25FdmVudCB7XG4gICAgcmVhZG9ubHkgYWRkZWROb2RlczogTm9kZVtdO1xuICAgIHJlYWRvbmx5IHJlbW92ZWROb2RlczogTm9kZVtdO1xuXG4gICAgY29uc3RydWN0b3IobWF0Y2hpbmdOb2Rlc1N1YnNjcmlwdGlvbjogTWF0Y2hpbmdOb2Rlc1N1YnNjcmlwdGlvbiwgYWRkZWROb2RlczogTm9kZVtdLCByZW1vdmVkTm9kZXM6IE5vZGVbXSkge1xuICAgICAgICBzdXBlcihtYXRjaGluZ05vZGVzU3Vic2NyaXB0aW9uLCAnTWF0Y2hpbmdOb2Rlc0NoYW5nZWQnKTtcblxuICAgICAgICB0aGlzLmFkZGVkTm9kZXMgPSBhZGRlZE5vZGVzO1xuICAgICAgICB0aGlzLnJlbW92ZWROb2RlcyA9IHJlbW92ZWROb2RlcztcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGFycmF5U3VidHJhY3Q8VD4obWludWVuZDogVFtdLCBzdWJ0cmFoZW5kOiBUW10pOiBUW10ge1xuICAgIGxldCBkaWZmZXJlbmNlOiBUW10gPSBbXTtcblxuICAgIGZvcihsZXQgbWVtYmVyIG9mIG1pbnVlbmQpIHtcbiAgICAgICAgaWYoc3VidHJhaGVuZC5pbmRleE9mKG1lbWJlcikgPT09IC0xKSB7XG4gICAgICAgICAgICBkaWZmZXJlbmNlLnB1c2gobWVtYmVyKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBkaWZmZXJlbmNlO1xufSIsImltcG9ydCB7IERvY3VtZW50TXV0YXRpb25TdWJzY3JpcHRpb24sIFN1YnNjcmlwdGlvbkV4ZWN1dG9yLCBTdWJzY3JpcHRpb25FdmVudCB9IGZyb20gJy4vZG9jdW1lbnRfbXV0YXRpb25fc3Vic2NyaXB0aW9uJztcbmltcG9ydCB7IE5vZGVNYXRjaGVyLCBOb2RlQ29sbGVjdG9yIH0gZnJvbSAnLi4vbm9kZV9jb2xsZWN0b3InO1xuXG5leHBvcnQgY2xhc3MgTm9kZU1hdGNoZXNTdWJzY3JpcHRpb24gZXh0ZW5kcyBEb2N1bWVudE11dGF0aW9uU3Vic2NyaXB0aW9uIHtcbiAgICByZWFkb25seSBtYXRjaGVyOiBOb2RlTWF0Y2hlcjtcblxuICAgIHByaXZhdGUgaXNDb25uZWN0ZWQ6IGJvb2xlYW4gPSBmYWxzZTtcbiAgICBwcml2YXRlIGlzTWF0Y2hpbmdOb2RlOiBib29sZWFuID0gZmFsc2U7XG5cbiAgICBjb25zdHJ1Y3Rvcihub2RlOiBOb2RlLCBtYXRjaGVyOiBOb2RlTWF0Y2hlciwgZXhlY3V0b3I6IFN1YnNjcmlwdGlvbkV4ZWN1dG9yKSB7XG4gICAgICAgIHN1cGVyKG5vZGUsIGV4ZWN1dG9yKTtcblxuICAgICAgICB0aGlzLm1hdGNoZXIgPSBtYXRjaGVyO1xuICAgIH1cblxuICAgIGNvbm5lY3QoKTogdm9pZCB7XG4gICAgICAgIGlmKCF0aGlzLmlzQ29ubmVjdGVkKSB7XG4gICAgICAgICAgICB0aGlzLnVwZGF0ZUlzTWF0Y2hpbmdOb2RlKHRoaXMuY29tcHV0ZUlzTWF0Y2hpbmdOb2RlKCkpO1xuICAgICAgICAgICAgdGhpcy5zdGFydExpc3RlbmluZygpO1xuXG4gICAgICAgICAgICB0aGlzLmlzQ29ubmVjdGVkID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGRpc2Nvbm5lY3QoKTogdm9pZCB7XG4gICAgICAgIGlmKHRoaXMuaXNDb25uZWN0ZWQpIHtcbiAgICAgICAgICAgIHRoaXMuc3RvcExpc3RlbmluZygpO1xuICAgICAgICAgICAgdGhpcy51cGRhdGVJc01hdGNoaW5nTm9kZShmYWxzZSk7XG5cbiAgICAgICAgICAgIHRoaXMuaXNDb25uZWN0ZWQgPSBmYWxzZTtcbiAgICAgICAgfSAgICAgICAgXG4gICAgfVxuXG4gICAgcHJvdGVjdGVkIGhhbmRsZU11dGF0aW9ucygpOiB2b2lkIHtcbiAgICAgICAgdGhpcy51cGRhdGVJc01hdGNoaW5nTm9kZSh0aGlzLmNvbXB1dGVJc01hdGNoaW5nTm9kZSgpKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHVwZGF0ZUlzTWF0Y2hpbmdOb2RlKGlzTWF0Y2hpbmdOb2RlOiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIGxldCB3YXNNYXRjaGluZ05vZGUgPSB0aGlzLmlzTWF0Y2hpbmdOb2RlO1xuICAgICAgICB0aGlzLmlzTWF0Y2hpbmdOb2RlID0gaXNNYXRjaGluZ05vZGU7XG5cbiAgICAgICAgaWYod2FzTWF0Y2hpbmdOb2RlICE9PSBpc01hdGNoaW5nTm9kZSkge1xuICAgICAgICAgICAgbGV0IGV2ZW50ID0gbmV3IE5vZGVNYXRjaGVzQ2hhbmdlZEV2ZW50KHRoaXMsIGlzTWF0Y2hpbmdOb2RlKTtcblxuICAgICAgICAgICAgdGhpcy5leGVjdXRvcihldmVudCwgdGhpcy5ub2RlKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgY29tcHV0ZUlzTWF0Y2hpbmdOb2RlKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gTm9kZUNvbGxlY3Rvci5pc01hdGNoaW5nTm9kZSh0aGlzLm5vZGUsIHRoaXMubWF0Y2hlcik7XG4gICAgfVxufVxuXG5leHBvcnQgY2xhc3MgTm9kZU1hdGNoZXNDaGFuZ2VkRXZlbnQgZXh0ZW5kcyBTdWJzY3JpcHRpb25FdmVudCB7XG4gICAgcmVhZG9ubHkgaXNNYXRjaGluZzogYm9vbGVhbjtcblxuICAgIGNvbnN0cnVjdG9yKG5vZGVNYXRjaGVzU3Vic2NyaXB0aW9uOiBOb2RlTWF0Y2hlc1N1YnNjcmlwdGlvbiwgaXNNYXRjaGluZzogYm9vbGVhbikge1xuICAgICAgICBzdXBlcihub2RlTWF0Y2hlc1N1YnNjcmlwdGlvbiwgJ05vZGVNYXRjaGVzQ2hhbmdlZEV2ZW50Jyk7XG5cbiAgICAgICAgdGhpcy5pc01hdGNoaW5nID0gaXNNYXRjaGluZztcbiAgICB9XG59XG5cbmV4cG9ydCB7IE5vZGVNYXRjaGVyIH07XG4iLCJleHBvcnQgYWJzdHJhY3QgY2xhc3MgU3Vic2NyaXB0aW9uIHtcbiAgICByZWFkb25seSBleGVjdXRvcjogU3Vic2NyaXB0aW9uRXhlY3V0b3I7XG4gICAgcmVhZG9ubHkgbm9kZTogTm9kZTtcbiAgICBcbiAgICBjb25zdHJ1Y3Rvcihub2RlOiBOb2RlLCBleGVjdXRvcjogU3Vic2NyaXB0aW9uRXhlY3V0b3IpIHtcbiAgICAgICAgdGhpcy5ub2RlID0gbm9kZTtcbiAgICAgICAgdGhpcy5leGVjdXRvciA9IGV4ZWN1dG9yO1xuICAgIH1cblxuICAgIGFic3RyYWN0IGNvbm5lY3QoKSA6IHZvaWQ7XG4gICAgYWJzdHJhY3QgZGlzY29ubmVjdCgpIDogdm9pZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdWJzY3JpcHRpb25FeGVjdXRvciB7IFxuICAgIChldmVudDogRXZlbnQgfCBTdWJzY3JpcHRpb25FdmVudCwgbm9kZTogTm9kZSk6IHZvaWQgXG59XG5cbmV4cG9ydCBjbGFzcyBTdWJzY3JpcHRpb25FdmVudCB7XG4gICAgcmVhZG9ubHkgc3Vic2NyaXB0aW9uOiBTdWJzY3JpcHRpb247XG4gICAgcmVhZG9ubHkgbmFtZTogc3RyaW5nO1xuXG4gICAgY29uc3RydWN0b3Ioc3Vic2NyaXB0aW9uOiBTdWJzY3JpcHRpb24sIG5hbWU6IHN0cmluZykge1xuICAgICAgICB0aGlzLnN1YnNjcmlwdGlvbiA9IHN1YnNjcmlwdGlvbjtcbiAgICAgICAgdGhpcy5uYW1lID0gbmFtZTtcbiAgICB9XG59XG4iLCJpbXBvcnQgeyBTdWJzY3JpcHRpb24sIFN1YnNjcmlwdGlvbkV4ZWN1dG9yLCBTdWJzY3JpcHRpb25FdmVudCB9IGZyb20gJy4vc3Vic2NyaXB0aW9uJztcblxuZXhwb3J0IHsgU3Vic2NyaXB0aW9uRXhlY3V0b3IgfTtcblxuZXhwb3J0IGludGVyZmFjZSBUcml2aWFsU3Vic2NyaXB0aW9uQ29uZmlndXJhdGlvbiB7XG4gICAgY29ubmVjdGVkPzogYm9vbGVhbixcbiAgICBkaXNjb25uZWN0ZWQ/OiBib29sZWFuXG59XG5cbmV4cG9ydCBjbGFzcyBOb2RlQ29ubmVjdGlvbkNoYW5nZWRFdmVudCBleHRlbmRzIFN1YnNjcmlwdGlvbkV2ZW50IHtcbiAgICByZWFkb25seSBub2RlOiBOb2RlO1xuICAgIHJlYWRvbmx5IGlzQ29ubmVjdGVkOiBib29sZWFuO1xuXG4gICAgY29uc3RydWN0b3IodHJpdmlhbFN1YnNjcmlwdGlvbjogVHJpdmlhbFN1YnNjcmlwdGlvbiwgbm9kZTogTm9kZSwgaXNDb25uZWN0ZWQ6IGJvb2xlYW4pIHtcbiAgICAgICAgc3VwZXIodHJpdmlhbFN1YnNjcmlwdGlvbiwgJ05vZGVDb25uZWN0ZWQnKTtcblxuICAgICAgICB0aGlzLm5vZGUgPSBub2RlO1xuICAgICAgICB0aGlzLmlzQ29ubmVjdGVkID0gaXNDb25uZWN0ZWQ7XG4gICAgfVxufVxuXG5leHBvcnQgY2xhc3MgVHJpdmlhbFN1YnNjcmlwdGlvbiBleHRlbmRzIFN1YnNjcmlwdGlvbiB7XG4gICAgcHJpdmF0ZSBpc0Nvbm5lY3RlZDogYm9vbGVhbiA9IGZhbHNlO1xuICAgIHByaXZhdGUgY29uZmlnOiBUcml2aWFsU3Vic2NyaXB0aW9uQ29uZmlndXJhdGlvbjtcblxuICAgIGNvbnN0cnVjdG9yKG5vZGU6IE5vZGUsIGNvbmZpZzogVHJpdmlhbFN1YnNjcmlwdGlvbkNvbmZpZ3VyYXRpb24sIGV4ZWN1dG9yOiBTdWJzY3JpcHRpb25FeGVjdXRvcikge1xuICAgICAgICBzdXBlcihub2RlLCBleGVjdXRvcik7XG5cbiAgICAgICAgdGhpcy5jb25maWcgPSBjb25maWc7XG4gICAgfVxuXG4gICAgY29ubmVjdCgpIHtcbiAgICAgICAgaWYoIXRoaXMuaXNDb25uZWN0ZWQpIHtcbiAgICAgICAgICAgIHRoaXMuaXNDb25uZWN0ZWQgPSB0cnVlO1xuXG4gICAgICAgICAgICBpZih0aGlzLmNvbmZpZy5jb25uZWN0ZWQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmV4ZWN1dG9yKHRoaXMuYnVpbGROb2RlQ29ubmVjdGlvbkNoYW5nZWRFdmVudCgpLCB0aGlzLm5vZGUpOyBcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGRpc2Nvbm5lY3QoKSB7XG4gICAgICAgIGlmKHRoaXMuaXNDb25uZWN0ZWQpIHtcbiAgICAgICAgICAgIHRoaXMuaXNDb25uZWN0ZWQgPSBmYWxzZTtcblxuICAgICAgICAgICAgaWYodGhpcy5jb25maWcuZGlzY29ubmVjdGVkKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5leGVjdXRvcih0aGlzLmJ1aWxkTm9kZUNvbm5lY3Rpb25DaGFuZ2VkRXZlbnQoKSwgdGhpcy5ub2RlKTsgICAgIFxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIFxuICAgIHByaXZhdGUgYnVpbGROb2RlQ29ubmVjdGlvbkNoYW5nZWRFdmVudCgpOiBOb2RlQ29ubmVjdGlvbkNoYW5nZWRFdmVudCB7XG4gICAgICAgIHJldHVybiBuZXcgTm9kZUNvbm5lY3Rpb25DaGFuZ2VkRXZlbnQodGhpcywgdGhpcy5ub2RlLCB0aGlzLmlzQ29ubmVjdGVkKTtcbiAgICB9XG59Il19
