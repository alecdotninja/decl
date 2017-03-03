import { BatchedMutationSubscription, SubscriptionExecutor, SubscriptionEvent } from './batched_mutation_subscription';
import { ElementMatcher, ElementCollector } from '../element_collector';

export class MatchingElementsSubscription extends BatchedMutationSubscription {
    readonly matcher: ElementMatcher;

    private isConnected: boolean = false;
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

export class MatchingElementsChangedEvent extends SubscriptionEvent {
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

function arraySubtract<T>(minuend: T[], subtrahend: T[]): T[] {
    let difference: T[] = [];

    for(let member of minuend) {
        if(subtrahend.indexOf(member) === -1) {
            difference.push(member);
        }
    }

    return difference;
}