import { Subscription, SubscriptionExecutor } from './subscription';

export { SubscriptionExecutor };

export class EventSubscription extends Subscription {
    readonly eventMatcher: EventMatcher;
    readonly eventNames: string[];

    private isConnected : boolean = false;    
    private readonly eventListener: EventListener;

    constructor(node: Node, eventMatcher: EventMatcher, executor: SubscriptionExecutor) {
        super(node, executor);

        this.eventMatcher = eventMatcher;
        this.eventNames = this.parseEventMatcher(this.eventMatcher);

        this.eventListener = (event: Event): void => {
            this.handleEvent(event);
        }
    }

    connect(): void {
        if(!this.isConnected) {
            this.isConnected = true;

            for(let eventName of this.eventNames) {
                this.node.addEventListener(eventName, this.eventListener, false);
            }
        }
    }

    disconnect(): void {
        if(this.isConnected) {
            for(let eventName of this.eventNames) {
                this.node.removeEventListener(eventName, this.eventListener, false);
            }            

            this.isConnected = false;
        }
    }

    private handleEvent(event: Event): void {
        this.executor(event, this.node);         
    }

    private parseEventMatcher(eventMatcher: EventMatcher): string[] {
        // TODO: Support all of the jQuery style event options
        return eventMatcher.split(' ');
    } 
}

export declare type EventMatcher = string;
