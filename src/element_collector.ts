export default ElementCollector;

export interface ElementVistor { (element: Element): ElementMatcher | boolean }
export declare type ElementMatcher = string | NodeListOf<Element> | Element[] | ElementVistor;

export class ElementCollector {
    private static instance: ElementCollector;
    
    private static readonly ELEMENT_MATCHER_TYPE_ERROR_MESSAGE = "Decl: An `ElementMatcher` must be a CSS selector (string) or a function which takes a node under consideration and returns a CSS selector (string) that matches all matching nodes in the subtree, an array-like object of matching nodes in the subtree, or a boolean value as to whether the node should be included (in this case, the function will be invoked again for all children of the node).";

    static isMatchingElement(rootElement: Element, elementMatcher: ElementMatcher): boolean {
        return this.getInstance().isMatchingElement(rootElement, elementMatcher);
    }

    static collectMatchingElements(rootElement: Element, elementMatcher: ElementMatcher): Element[] {
        return this.getInstance().collectMatchingElements(rootElement, elementMatcher);
    }

    private static getInstance() : ElementCollector {
        return this.instance || (this.instance = new ElementCollector());
    }

    isMatchingElement(element: Element, elementMatcher: ElementMatcher): boolean {
        switch(typeof(elementMatcher)) {
            default:
                throw new TypeError(ElementCollector.ELEMENT_MATCHER_TYPE_ERROR_MESSAGE);
                
            case 'string':
                let cssSelector: string = <string>elementMatcher;
                return this.isMatchingElementFromCssSelector(element, cssSelector);
            
            case 'object':
                let object = <Object>elementMatcher;
                return this.isMatchingElementFromObject(element, object);
                
            case 'function':
                let elementVistor = <ElementVistor>elementMatcher;
                return this.isMatchingElementFromElementVistor(element, elementVistor);       
        }
    }

    collectMatchingElements(element: Element, elementMatcher: ElementMatcher): Element[] {
        switch(typeof(elementMatcher)) {
            default:
                throw new TypeError(ElementCollector.ELEMENT_MATCHER_TYPE_ERROR_MESSAGE);
                
            case 'string':
                let cssSelector: string = <string>elementMatcher;
                return this.collectMatchingElementsFromCssSelector(element, cssSelector);

            case 'object':
                let object = <Object>elementMatcher;
                return this.collectMatchingElementsFromObject(element, object);
                
            case 'function':
                let elementVistor = <ElementVistor>elementMatcher;
                return this.collectMatchingElementsFromElementVistor(element, elementVistor);       
        }
    }

    private isMatchingElementFromCssSelector(element: Element, cssSelector: string): boolean {
        if(typeof(element.matches) === 'function') { // take a shortcut in modern browsers
            return element.matches(cssSelector);
        }else{
            return isMemberOfArrayLike(document.querySelectorAll(cssSelector), element);
        }
    }

    private isMatchingElementFromObject(element: Element, object: Object): boolean {
        if(object === null) {
            return false;
        }else{
            if(isArrayLike(object)) {
                let arrayLike = <ArrayLike<any>>object;

                if(arrayLike.length === 0 || arrayLike[0] instanceof Element) {
                    return isMemberOfArrayLike(arrayLike, element);                
                }else{
                    throw new TypeError(ElementCollector.ELEMENT_MATCHER_TYPE_ERROR_MESSAGE);
                }
            }else{
                throw new TypeError(ElementCollector.ELEMENT_MATCHER_TYPE_ERROR_MESSAGE);
            }
        }
    }

    private isMatchingElementFromElementVistor(element: Element, elementVistor: ElementVistor): boolean {
        let visitorResult = elementVistor(element);

        if(typeof(visitorResult) === 'boolean') {
            let isMatch = <boolean>visitorResult;
            return isMatch;
        }else{
            let elementMatcher = <ElementMatcher>visitorResult;
            return this.isMatchingElement(element, elementMatcher);
        }
    }

    private collectMatchingElementsFromCssSelector(element: Element, cssSelector: string): Element[] {
        return toArray<Element>(element.querySelectorAll(cssSelector));
    }

    private collectMatchingElementsFromObject(element: Element, object: Object): Element[] {
        if(object === null) {
            return [];
        }else{
            if(isArrayLike(object)) {
                let arrayLike = <ArrayLike<any>>object;

                if(arrayLike.length === 0 || arrayLike[0] instanceof Element) {
                    return toArray<Element>(arrayLike);                
                }else{
                    throw new TypeError(ElementCollector.ELEMENT_MATCHER_TYPE_ERROR_MESSAGE);
                }
            }else{
                throw new TypeError(ElementCollector.ELEMENT_MATCHER_TYPE_ERROR_MESSAGE);
            }
        }
    }

    private collectMatchingElementsFromElementVistor(element: Element, elementVistor: ElementVistor): Element[] {
        let elements: Element[] = [];

        // I'm fibbing to the compiler here. `element.children` is a `NodeListOf<Element>`,
        // which does not have a compatable interface with `Array<Element>`; however, the
        // generated code still works because it doesn't actually use very much of the 
        // `Array` interace (it really only assumes a numberic length property and keys for
        // 0...length). Casting to `any` here destroys that type information, so the 
        // compiler can't tell there is an issue and allows it without an error.
        for(let child of <any>element.children) {
            if(child instanceof Element) {
                let element: Element = child;
                let visitorResult = elementVistor(element);

                if(typeof(visitorResult) === 'boolean') {
                    let isMatch = <boolean>visitorResult;

                    if(isMatch) {
                        elements.push(element);
                    }
                }else{
                    elements.push(...this.collectMatchingElements(element, visitorResult));
                }
            }
        }

        return elements;
    }
}

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
