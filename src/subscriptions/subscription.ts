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
    (element: Element, event?: Event | SubscriptionEvent): void 
}

export class SubscriptionEvent {
    readonly name : string;

    constructor(name : string) {
        this.name = name;
    }
}
