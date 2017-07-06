import { Declaration, SubscriptionExecutor } from './declaration';
import { TrivialSubscription } from '../subscriptions/trivial_subscription';

export { SubscriptionExecutor };

export class MatchDeclaration extends Declaration {
    protected readonly subscription: TrivialSubscription;
    protected readonly executor: SubscriptionExecutor;

    constructor(node: Node, executor: SubscriptionExecutor) {
        super(node);

        this.executor = executor;

        this.subscription = new TrivialSubscription(this.node, { connected: true }, this.executor);
    }

    inspect(): void {
        console.groupCollapsed('matches');
        console.log(this.executor);
        console.groupEnd();
    }
}