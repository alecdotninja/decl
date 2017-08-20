import { Declaration, SubscriptionExecutor } from './declaration';
import { EventSubscription, EventMatcher } from '../subscriptions/event_subscription';

export { EventMatcher, SubscriptionExecutor };

export class OnDeclaration extends Declaration {
    protected subscription: EventSubscription;
    protected matcher: EventMatcher;
    protected executor: SubscriptionExecutor;

    constructor(node: Node, matcher: EventMatcher, executor: SubscriptionExecutor) {
        super(node);

        this.matcher = matcher;
        this.executor = executor;

        this.subscription = new EventSubscription(this.node, this.matcher, this.executor);    
    }

    inspect(): void {
        console.groupCollapsed('on', this.matcher);

        try {
            console.log(this.executor);
        }finally{
            console.groupEnd();
        }
    }
}