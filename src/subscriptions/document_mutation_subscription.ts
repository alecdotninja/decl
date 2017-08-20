import { Subscription, SubscriptionExecutor, SubscriptionEvent } from './subscription';

export abstract class DocumentMutationSubscription extends Subscription {
    static readonly mutationObserverInit: MutationObserverInit = {
        childList: true,
        attributes: true,
        characterData: true,
        subtree: true
    };

    private isListening : boolean = false;
    private readonly mutationObserver: MutationObserver;

    constructor(node: Node, executor: SubscriptionExecutor) {
        super(node, executor);

        this.mutationObserver = new MutationObserver((): void => {
            this.handleMutations();
        });
    }

    protected startListening(): void {
        if(!this.isListening) {
            this.mutationObserver.observe(this.node, DocumentMutationSubscription.mutationObserverInit);
            this.isListening = true;
        }
    }

    protected stopListening(): void {
        if(this.isListening) {
            this.mutationObserver.disconnect();
            this.isListening = false;
        }
    }
    
    protected abstract handleMutations(): void;
}

export { Subscription, SubscriptionExecutor, SubscriptionEvent };