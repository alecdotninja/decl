import { BatchedMutationSubscription, SubscriptionExecutor, SubscriptionEvent } from './batched_mutation_subscription';
import { ElementMatcher, ElementCollector } from '../element_collector';

export class ElementMatchesSubscription extends BatchedMutationSubscription {
    readonly matcher: ElementMatcher;

    private isConnected: boolean = false;
    private isMatchingElement: boolean = false;

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
            this.stopListening();
            this.updateIsMatchingElement(false);

            this.isConnected = false;
        }        
    }

    protected handleMutations(): void {
        this.updateIsMatchingElement(this.computeIsMatchingElement());
    }

    private updateIsMatchingElement(isMatchingElement: boolean): void {
        let wasMatchingElement = this.isMatchingElement;
        this.isMatchingElement = isMatchingElement;

        if(wasMatchingElement !== isMatchingElement) {
            let event = new ElementMatchesChangedEvent(this, isMatchingElement);

            this.executor(event, this.element);
        }
    }

    private computeIsMatchingElement(): boolean {
        return ElementCollector.isMatchingElement(this.element, this.matcher);
    }
}

export class ElementMatchesChangedEvent extends SubscriptionEvent {
    readonly isMatching: boolean;

    constructor(elementMatchesSubscription: ElementMatchesSubscription, isMatching: boolean) {
        super(elementMatchesSubscription, 'ElementMatchesChangedEvent');

        this.isMatching = isMatching;
    }
}

export { ElementMatcher };
