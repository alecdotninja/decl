export interface NodeVisitor { (node: Node): NodeMatcher | boolean }
export declare type NodeMatcher = string | NodeListOf<Node> | Node[] | NodeVisitor;

export class NodeCollector {
    private static instance: NodeCollector;
    
    private static readonly NODE_MATCHER_TYPE_ERROR_MESSAGE = 
        "Decl: A `NodeMatcher` must be a CSS selector (string) or a function which takes "  +
        "a node under consideration and returns a CSS selector (string) that matches all "  + 
        "matching nodes in the subtree, an array-like object of matching nodes in the "     + 
        "subtree, or a boolean value as to whether the node should be included (in this "   +
        "case, the function will be invoked again for all children of the node).";

    static isMatchingNode(rootNode: Node, nodeMatcher: NodeMatcher): boolean {
        return this.getInstance().isMatchingNode(rootNode, nodeMatcher);
    }

    static collectMatchingNodes(rootNode: Node, nodeMatcher: NodeMatcher): Node[] {
        return this.getInstance().collectMatchingNodes(rootNode, nodeMatcher);
    }

    private static getInstance() : NodeCollector {
        return this.instance || (this.instance = new NodeCollector());
    }

    isMatchingNode(node: Node, nodeMatcher: NodeMatcher): boolean {
        switch(typeof(nodeMatcher)) {
            default:
                throw new TypeError(NodeCollector.NODE_MATCHER_TYPE_ERROR_MESSAGE);
                
            case 'string':
                let cssSelector: string = <string>nodeMatcher;
                return this.isMatchingNodeFromCssSelector(node, cssSelector);
            
            case 'object':
                let object = <Object>nodeMatcher;
                return this.isMatchingNodeFromObject(node, object);
                
            case 'function':
                let nodeVistor = <NodeVisitor>nodeMatcher;
                return this.isMatchingNodeFromNodeVistor(node, nodeVistor);       
        }
    }

    collectMatchingNodes(node: Node, nodeMatcher: NodeMatcher): Node[] {
        switch(typeof(nodeMatcher)) {
            default:
                throw new TypeError(NodeCollector.NODE_MATCHER_TYPE_ERROR_MESSAGE);
                
            case 'string':
                let cssSelector: string = <string>nodeMatcher;
                return this.collectMatchingNodesFromCssSelector(node, cssSelector);

            case 'object':
                let object = <Object>nodeMatcher;
                return this.collectMatchingNodesFromObject(node, object);
                
            case 'function':
                let nodeVistor = <NodeVisitor>nodeMatcher;
                return this.collectMatchingNodesFromNodeVistor(node, nodeVistor);       
        }
    }

    private isMatchingNodeFromCssSelector(node: Node, cssSelector: string): boolean {
        if(node instanceof Element && typeof(node.matches) === 'function') {
            return node.matches(cssSelector);
        }else{
            return isMemberOfArrayLike(node.ownerDocument.querySelectorAll(cssSelector), node);            
        }
    }

    private isMatchingNodeFromObject(node: Node, object: Object): boolean {
        if(object === null) {
            return false;
        }else{
            if(isArrayLike(object)) {
                let arrayLike = <ArrayLike<any>>object;

                if(arrayLike.length === 0 || arrayLike[0] instanceof Node) {
                    return isMemberOfArrayLike(arrayLike, node);                
                }else{
                    throw new TypeError(NodeCollector.NODE_MATCHER_TYPE_ERROR_MESSAGE);
                }
            }else{
                throw new TypeError(NodeCollector.NODE_MATCHER_TYPE_ERROR_MESSAGE);
            }
        }
    }

    private isMatchingNodeFromNodeVistor(node: Node, nodeVistor: NodeVisitor): boolean {
        let visitorResult = nodeVistor(node);

        if(typeof(visitorResult) === 'boolean') {
            let isMatch = <boolean>visitorResult;
            return isMatch;
        }else{
            let nodeMatcher = <NodeMatcher>visitorResult;
            return this.isMatchingNode(node, nodeMatcher);
        }
    }

    private collectMatchingNodesFromCssSelector(node: Node, cssSelector: string): Node[] {
        if(node instanceof Element || node instanceof Document || node instanceof DocumentFragment) {
            return toArray<Node>(node.querySelectorAll(cssSelector));
        }else{
            return [];
        }
    }

    private collectMatchingNodesFromObject(_node: Node, object: Object): Node[] {
        if(object === null) {
            return [];
        }else{
            if(isArrayLike(object)) {
                let arrayLike = <ArrayLike<any>>object;

                if(arrayLike.length === 0 || arrayLike[0] instanceof Node) {
                    return toArray<Node>(arrayLike);                
                }else{
                    throw new TypeError(NodeCollector.NODE_MATCHER_TYPE_ERROR_MESSAGE);
                }
            }else{
                throw new TypeError(NodeCollector.NODE_MATCHER_TYPE_ERROR_MESSAGE);
            }
        }
    }

    private collectMatchingNodesFromNodeVistor(node: Node, nodeVistor: NodeVisitor): Node[] {
        let nodes: Node[] = [];
        let childNodes = node.childNodes;
        
        for(let index = 0, length = childNodes.length; index < length; index++) {
            let child = childNodes[index];
            
            if(child instanceof Node) {
                let node: Node = child;
                let visitorResult = nodeVistor(node);

                if(typeof(visitorResult) === 'boolean') {
                    let isMatch = <boolean>visitorResult;

                    if(isMatch) {
                        nodes.push(node);
                    }
                }else{
                    nodes.push(...this.collectMatchingNodes(node, visitorResult));
                }
            }
        }

        return nodes;
    }
}

export default NodeCollector;

function isArrayLike(value: any) {
    return typeof(value) === 'object' && typeof(value.length) === 'number';
}

function toArray<T>(arrayLike: ArrayLike<T>): Array<T> {
    if(isArrayLike(arrayLike)) {
        return Array.prototype.slice.call(arrayLike, 0);
    }else{
        throw new TypeError('Expected ArrayLike');
    }
}

function isMemberOfArrayLike(haystack: ArrayLike<any>,  needle: any) {
    return Array.prototype.indexOf.call(haystack, needle) !== -1;
}
