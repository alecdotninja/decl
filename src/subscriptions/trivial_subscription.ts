import { Subscription, SubscriptionExecutor, SubscriptionEvent } from './subscription';

export { SubscriptionExecutor };

export interface TrivialSubscriptionConfiguration {
    connected?: boolean,
    disconnected?: boolean
}

export class ElementConnectionChangedEvent extends SubscriptionEvent {
    readonly element: Element;
    readonly isConnected: boolean;

    constructor(trivialSubscription: TrivialSubscription, element: Element, isConnected: boolean) {
        super(trivialSubscription, 'ElementConnected');

        this.element = element;
        this.isConnected = isConnected;
    }
}

export class TrivialSubscription extends Subscription {
    private isConnected: boolean = false;
    private config: TrivialSubscriptionConfiguration;

    constructor(element: Element, config: TrivialSubscriptionConfiguration, executor: SubscriptionExecutor) {
        super(element, executor);

        this.config = config;
    }

    connect() {
        if(!this.isConnected) {
            this.isConnected = true;

            if(this.config.connected) {
                this.executor(this.buildElementConnectionChangedEvent(), this.element); 
            }
        }
    }

    disconnect() {
        if(this.isConnected) {
            this.isConnected = false;

            if(this.config.disconnected) {
                this.executor(this.buildElementConnectionChangedEvent(), this.element);     
            }
        }
    }
    
    private buildElementConnectionChangedEvent(): ElementConnectionChangedEvent {
        return new ElementConnectionChangedEvent(this, this.element, this.isConnected);
    }
}