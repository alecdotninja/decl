import { Declaration } from './declaration';
import { TrivialSubscription, SubscriptionExecutor } from '../subscriptions/trivial_subscription';

export { SubscriptionExecutor };

export class UnmatchDeclaration extends Declaration {
    protected subscription: TrivialSubscription;
    protected executor: SubscriptionExecutor;

    constructor(element: Element, executor: SubscriptionExecutor) {
        super(element);

        this.executor = executor;

        this.subscription = new TrivialSubscription(this.element, { disconnected: true }, this.executor);
    }

    inspect(): void {
        console.log('fires', this.executor, 'when the element leaves the DOM (unmatches)');
    }
}