import { Subscription, SubscriptionExecutor } from '../subscriptions/subscription';

export { SubscriptionExecutor };

export abstract class Declaration {
    protected isActivated: boolean = false;
    protected readonly element: Element;
    protected readonly subscription: Subscription;

    constructor(element: Element) {
        this.element = element;
    }

    activate(): void {
        if(!this.isActivated) {
            this.isActivated = true;

            this.subscription.connect();
        }
    }

    deactivate(): void {
        if(this.isActivated) {
            this.isActivated = false;

            this.subscription.disconnect();
        }        
    }

    abstract inspect(includeSource?: boolean): void;
}