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

export interface SubscriptionExecutor { 
    (event: Event | SubscriptionEvent, element: Element): void 
}

export class SubscriptionEvent {
    readonly subscription: Subscription;
    readonly name: string;

    constructor(subscription: Subscription, name: string) {
        this.subscription = subscription;
        this.name = name;
    }
}
