export abstract class Subscription {
    readonly executor: SubscriptionExecutor;
    readonly node: Node;
    
    constructor(node: Node, executor: SubscriptionExecutor) {
        this.node = node;
        this.executor = executor;
    }

    abstract connect() : void;
    abstract disconnect() : void;
}

export interface SubscriptionExecutor { 
    (event: Event | SubscriptionEvent, node: Node): void 
}

export class SubscriptionEvent {
    readonly subscription: Subscription;
    readonly name: string;

    constructor(subscription: Subscription, name: string) {
        this.subscription = subscription;
        this.name = name;
    }
}
