import { Declaration, SubscriptionExecutor } from './declaration';
import { EventSubscription, EventMatcher } from '../subscriptions/event_subscription';

export { EventMatcher, SubscriptionExecutor };

export class OnDeclaration extends Declaration {
    protected subscription: EventSubscription;
    protected matcher: EventMatcher;
    protected executor: SubscriptionExecutor;

    constructor(element: Element, matcher: EventMatcher, executor: SubscriptionExecutor) {
        super(element);

        this.matcher = matcher;
        this.executor = executor;

        this.subscription = new EventSubscription(this.element, this.matcher, this.executor);    
    }

    inspect(): void {
        (<any>console.groupCollapsed)('on', this.matcher);

        try {
            console.log(this.executor);
        }finally{
            console.groupEnd();
        }
    }
}