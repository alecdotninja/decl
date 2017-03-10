import { Subscription, SubscriptionExecutor, SubscriptionEvent } from './subscription';

interface CommonJsRequire {
    (id: string): any;
}

declare var require: CommonJsRequire;
let MutationObserver = require('mutation-observer'); // use polyfill

export abstract class BatchedMutationSubscription extends Subscription {
    static readonly mutationObserverInit: MutationObserverInit = {
        childList: true,
        attributes: true,
        characterData: true,
        subtree: true
    };

    private isListening : boolean = false;
    private handleMutationTimeout : any = null;

    private readonly mutationCallback: MutationCallback;
    private readonly mutationObserver: MutationObserver;

    constructor(element: Element, executor: SubscriptionExecutor) {
        super(element, executor);

        this.mutationCallback = (): void => {
            this.deferHandleMutations();
        }

        this.mutationObserver = new MutationObserver(this.mutationCallback);
    }

    protected startListening(): void {
        if(!this.isListening) {
            this.mutationObserver.observe(this.element, BatchedMutationSubscription.mutationObserverInit);

            this.isListening = true;
        }
    }

    protected stopListening(): void {
        if(this.isListening) {
            this.mutationObserver.disconnect();
            this.handleMutationsNow();

            this.isListening = false;
        }
    }
    
    protected abstract handleMutations(): void;

    private deferHandleMutations(): void {
        if(this.handleMutationTimeout === null) {
            this.handleMutationTimeout = setTimeout(() => { 
                try {
                    this.mutationObserver.takeRecords();
                    this.handleMutations();
                }finally{
                    this.handleMutationTimeout = null;
                }
            }, 0);
        }
    }

    private handleMutationsNow(): void {
        if(this.handleMutationTimeout !== null) {
            clearTimeout(this.handleMutationTimeout);
            this.handleMutationTimeout = null;

            this.handleMutations();            
        }
    }
}

export { Subscription, SubscriptionExecutor, SubscriptionEvent };