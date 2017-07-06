import { Subscription, SubscriptionExecutor, SubscriptionEvent } from './subscription';

export { SubscriptionExecutor };

export interface TrivialSubscriptionConfiguration {
    connected?: boolean,
    disconnected?: boolean
}

export class NodeConnectionChangedEvent extends SubscriptionEvent {
    readonly node: Node;
    readonly isConnected: boolean;

    constructor(trivialSubscription: TrivialSubscription, node: Node, isConnected: boolean) {
        super(trivialSubscription, 'NodeConnected');

        this.node = node;
        this.isConnected = isConnected;
    }
}

export class TrivialSubscription extends Subscription {
    private isConnected: boolean = false;
    private config: TrivialSubscriptionConfiguration;

    constructor(node: Node, config: TrivialSubscriptionConfiguration, executor: SubscriptionExecutor) {
        super(node, executor);

        this.config = config;
    }

    connect() {
        if(!this.isConnected) {
            this.isConnected = true;

            if(this.config.connected) {
                this.executor(this.buildNodeConnectionChangedEvent(), this.node); 
            }
        }
    }

    disconnect() {
        if(this.isConnected) {
            this.isConnected = false;

            if(this.config.disconnected) {
                this.executor(this.buildNodeConnectionChangedEvent(), this.node);     
            }
        }
    }
    
    private buildNodeConnectionChangedEvent(): NodeConnectionChangedEvent {
        return new NodeConnectionChangedEvent(this, this.node, this.isConnected);
    }
}