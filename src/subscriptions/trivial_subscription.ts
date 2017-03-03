import { Subscription, SubscriptionExecutor } from './subscription';

export interface TrivialSubscriptionConfiguration {
    connected?: boolean,
    disconnected?: boolean
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
                this.executor(this.element);            
            }
        }
    }

    disconnect() {
        if(this.isConnected) {
            this.isConnected = false;

            if(this.config.disconnected) {
                this.executor(this.element);            
            }
        }
    }
}