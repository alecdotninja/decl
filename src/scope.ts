import { Subscription, SubscriptionExecutor } from './subscriptions/subscription';
import { TrivialSubscription } from './subscriptions/trivial_subscription';
import { MatchingElementsSubscription, MatchingElementsChangedEvent } from './subscriptions/matching_elements_subscription';
import { ElementMatchesSubscription, ElementMatchesChangedEvent, ElementMatcher } from './subscriptions/element_matches_subscription';
import { EventSubscription, EventMatcher } from './subscriptions/event_subscription';

export class Scope {
    static buildRootScope(element: Element): Scope {
        let scope = new Scope(element);

        scope.activate();

        return scope;
    }

    private readonly element: Element;
    private isActivated: boolean = false;
    private subscriptions: Subscription[] = [];
    private children: Scope[] = [];

    constructor(element: Element, executor?: ScopeExecutor) {
        this.element = element;

        if(executor) {
            executor.call(this, this, this.element);
        }
    }

    getElement(): Element {
        return this.element;
    }

    match(executor: SubscriptionExecutor): Scope {
        this.addSubscription(new TrivialSubscription(this.element, { connected: true }, executor));

        return this;
    }

    unmatch(executor: SubscriptionExecutor): Scope {
        this.addSubscription(new TrivialSubscription(this.element, { disconnected: true }, executor));

        return this;
    }

    select(matcher: ElementMatcher, executor: ScopeExecutor): Scope {
        this.addSubscription(new MatchingElementsSubscription(this.element, matcher, this.buildSelectExecutor(executor)));

        return this;
    }

    when(matcher: ElementMatcher, executor: ScopeExecutor): Scope {
		this.addSubscription(new ElementMatchesSubscription(this.element, matcher, this.buildWhenExecutor(executor)));

        return this;
    }

    on(matcher: EventMatcher, executor: SubscriptionExecutor): Scope {
        this.addSubscription(new EventSubscription(this.element, matcher, executor));

        return this;
    }

    // This method is for testing
    pristine(): void {
        for(let subscription of this.subscriptions) {
            subscription.disconnect();
        }
        
        this.subscriptions.splice(0);
    }

    protected activate(): void {
        if(!this.isActivated) {
            this.isActivated = true;

            for(let subscription of this.subscriptions) {
                subscription.connect();
            }
        }
    }

    protected deactivate(): void {
        if(this.isActivated) {
            for(let subscription of this.subscriptions) {
                subscription.disconnect();
            }

            this.isActivated = false;            
        }
    }

    private addSubscription(subscription: Subscription): void {
        this.subscriptions.push(subscription);

        if(this.isActivated) {
            subscription.connect();
        }
    }

    private removeSubscription(subscription: Subscription): void {
        var index = this.subscriptions.indexOf(subscription);

        if(index >= 0) {
            subscription.disconnect();

            this.subscriptions.splice(index, 1);
        }
    }

    private buildSelectExecutor(executor: ScopeExecutor): SubscriptionExecutor {
        let scopes: Scope[] = [];

        return (event: MatchingElementsChangedEvent, element: Element) => {
            for(let element of event.addedElements) {
                let scope = new Scope(element, executor);

                scopes.push(scope);	
                scope.activate();
            }

            for(let element of event.removedElements) {
                for(let index = 0, length = scopes.length, scope : Scope; index < length; index++) {
                    scope = scopes[index];

                    if(scope.element === element) {
                        scope.deactivate();
                        
                        scopes.splice(index, 1);
                        break;
                    }
                }
            }
        };
    }

    private buildWhenExecutor(executor: ScopeExecutor): SubscriptionExecutor {
        let scope : Scope = null;

        return (event: ElementMatchesChangedEvent, element: Element) => {
            if(event.isMatching) {
                scope = new Scope(this.element, executor);
                scope.activate();
            }else{
                scope.deactivate();
                scope = null;
            }
        };
    }
}

export interface ScopeExecutor { (scope: Scope, element: Element): void };
export { ElementMatcher, EventMatcher, SubscriptionExecutor };
