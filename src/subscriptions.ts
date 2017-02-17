import { ElementMatcher, ElementCollector } from './element_collector';

export default { Subscription, TrivialSubscription, EventSubscription, MatchingElementsSubscription, ElementMatchesSubscription };

export interface SubscriptionExecutor { (element: Element, event?: Event | DeclEvent): void }

export abstract class Subscription {
    protected readonly executor: SubscriptionExecutor;
    protected readonly element: Element;
    
    constructor(element: Element, executor: SubscriptionExecutor) {
        this.element = element;
        this.executor = executor;
    }

    abstract connect() : void;
    abstract disconnect() : void;
}

export interface TrivialSubscriptionConfiguration {
    connected?: boolean,
    disconnected?: boolean
}

export class TrivialSubscription extends Subscription {
    private isConnected: boolean;
    private config: TrivialSubscriptionConfiguration;

    constructor(element: Element, config: TrivialSubscriptionConfiguration, executor: SubscriptionExecutor) {
        super(element, executor);

        this.config = config;
    }

    connect() {
        if(!this.isConnected) {
            this.isConnected = true;

            if(this.config.connected) {
                this.executor(this.element);            
            }
        }
    }

    disconnect() {
        if(this.isConnected) {
            this.isConnected = false;

            if(this.config.disconnected) {
                this.executor(this.element);            
            }
        }
    }
}

export declare type EventMatcher = string;

export class EventSubscription extends Subscription {
    readonly eventMatcher: EventMatcher;

    private isConnected : boolean = false;    
    private readonly eventListener: EventListener;
    private readonly eventNames: string[];

    constructor(element: Element, eventMatcher: EventMatcher, executor: SubscriptionExecutor) {
        super(element, executor);

        this.eventMatcher = eventMatcher;
        this.eventNames = this.parseEventMatcher(this.eventMatcher);

        this.eventListener = (event: Event): void => {
            this.handleEvent(event);
        }
    }

    connect(): void {
        if(!this.isConnected) {
            this.isConnected = true;

            for(let eventName of this.eventNames) {
                this.element.addEventListener(eventName, this.eventListener, false);
            }
        }
    }

    disconnect(): void {
        if(this.isConnected) {
            for(let eventName of this.eventNames) {
                this.element.removeEventListener(eventName, this.eventListener, false);
            }            

            this.isConnected = false;
        }
    }

    private handleEvent(event: Event): void {
        this.executor(this.element, event);         
    }

    private parseEventMatcher(eventMatcher: EventMatcher): string[] {
        // TODO: Support all of the jQuery style event options
        return eventMatcher.split(' ');
    } 
}

abstract class BatchedMutationSubscription extends Subscription {
    static readonly mutationObserverInit: MutationObserverInit = {
        childList: true,
        attributes: true,
        characterData: true,
        subtree: true
    };

    private isListening : boolean = false;
    private handleMutationTimeout : any = null;

    private readonly mutationCallback: MutationCallback;
    private readonly mutationObserver: MutationObserver;

    constructor(element: Element, executor: SubscriptionExecutor) {
        super(element, executor);

        this.mutationCallback = (): void => {
            this.deferHandleMutations();
        }

        this.mutationObserver = new MutationObserver(this.mutationCallback);
    }

    protected startListening(): void {
        if(!this.isListening) {
            this.mutationObserver.observe(this.element, BatchedMutationSubscription.mutationObserverInit);

            this.isListening = true;
        }
    }

    protected stopListening(): void {
        if(this.isListening) {
            this.mutationObserver.disconnect();
            this.handleMutationsNow();

            this.isListening = false;
        }
    }
    
    protected abstract handleMutations(): void;

    private deferHandleMutations(): void {
        if(this.handleMutationTimeout === null) {
            this.handleMutationTimeout = setTimeout(() => { 
                try {
                    this.mutationObserver.takeRecords();
                    this.handleMutations();
                }finally{
                    this.handleMutationTimeout = null;
                }
            }, 0);
        }
    }

    private handleMutationsNow(): void {
        if(this.handleMutationTimeout !== null) {
            clearTimeout(this.handleMutationTimeout);
            this.handleMutationTimeout = null;

            this.handleMutations();            
        }
    }
}

export class DeclEvent {
    readonly name : string;

    constructor(name : string) {
        this.name = name;
    }
}

export class MatchingElementsChangedEvent extends DeclEvent {
    readonly matchingElementsSubscription: MatchingElementsSubscription;
    readonly addedElements: Element[];
    readonly removedElements: Element[];

    constructor(matchingElementsSubscription: MatchingElementsSubscription, addedElements: Element[], removedElements: Element[]) {
        super('MatchingElementsChanged')

        this.matchingElementsSubscription = matchingElementsSubscription;
        this.addedElements = addedElements;
        this.removedElements = removedElements;
    }
}

export class MatchingElementsSubscription extends BatchedMutationSubscription {
    readonly matcher: ElementMatcher;

    private isConnected: boolean;
    private matchingElements: Element[] = [];

    constructor(element: Element, matcher: ElementMatcher, executor: SubscriptionExecutor) {
        super(element, executor);

        this.matcher = matcher;
    }

    connect(): void {
        if(!this.isConnected) {
            this.updateMatchingElements(this.collectMatchingElements());
            this.startListening();

            this.isConnected = true;
        }
    }

    disconnect(): void {
        if(this.isConnected) {
            this.updateMatchingElements([]);
            this.stopListening();

            this.isConnected = false;
        }        
    }

    protected handleMutations(): void {
        this.updateMatchingElements(this.collectMatchingElements());
    }

    private updateMatchingElements(matchingElements: Element[]): void {
        let previouslyMatchingElements = this.matchingElements;

        let addedElements = arraySubtract(matchingElements, previouslyMatchingElements);
        let removedElements = arraySubtract(previouslyMatchingElements, matchingElements);

        this.matchingElements = matchingElements;   
        
        if(addedElements.length > 0 || removedElements.length > 0) {
            let event = new MatchingElementsChangedEvent(this, addedElements, removedElements);

            this.executor(this.element, event);
        }
    }

    private collectMatchingElements(): Element[] {
        return ElementCollector.collectMatchingElements(this.element, this.matcher);
    }
}

export class ElementMatchsChangedEvent extends DeclEvent {
    readonly elementMatchesSubscription: ElementMatchesSubscription;
    readonly isMatching: boolean;

    constructor(elementMatchesSubscription: ElementMatchesSubscription, isMatching: boolean) {
        super('ElementMatchsChangedEvent')

        this.elementMatchesSubscription = elementMatchesSubscription;
        this.isMatching = isMatching;
    }
}

export class ElementMatchesSubscription extends BatchedMutationSubscription {
    readonly matcher: ElementMatcher;

    private isConnected: boolean;
    private isMatchingElement: boolean;

    constructor(element: Element, matcher: ElementMatcher, executor: SubscriptionExecutor) {
        super(element, executor);

        this.matcher = matcher;
    }

    connect(): void {
        if(!this.isConnected) {
            this.updateIsMatchingElement(this.computeIsMatchingElement());
            this.startListening();

            this.isConnected = true;
        }
    }

    disconnect(): void {
        if(this.isConnected) {
            this.updateIsMatchingElement(false);
            this.stopListening();

            this.isConnected = false;
        }        
    }

    protected handleMutations(): void {
        this.updateIsMatchingElement(this.computeIsMatchingElement());
    }

    private updateIsMatchingElement(isMatchingElement: boolean): void {
        let wasMatchingElement = this.isMatchingElement;
        this.isMatchingElement = wasMatchingElement;

        if(wasMatchingElement !== isMatchingElement) {
            let event = new ElementMatchsChangedEvent(this, isMatchingElement);

            this.executor(this.element, event);
        }
    }

    private computeIsMatchingElement(): boolean {
        return ElementCollector.isMatchingElement(this.element, this.matcher);
    }
}

function arraySubtract<T>(minuend: T[], subtrahend: T[]): T[] {
    let difference: T[] = [];

    for(let member of minuend) {
        if(subtrahend.indexOf(member) === -1) {
            difference.push(member);
        }
    }

    return difference;
}