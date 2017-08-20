import { DocumentMutationSubscription, SubscriptionExecutor, SubscriptionEvent } from './document_mutation_subscription';
import { NodeMatcher, NodeCollector } from '../node_collector';

export class NodeMatchesSubscription extends DocumentMutationSubscription {
    readonly matcher: NodeMatcher;

    private isConnected: boolean = false;
    private isMatchingNode: boolean = false;

    constructor(node: Node, matcher: NodeMatcher, executor: SubscriptionExecutor) {
        super(node, executor);

        this.matcher = matcher;
    }

    connect(): void {
        if(!this.isConnected) {
            this.updateIsMatchingNode(this.computeIsMatchingNode());
            this.startListening();

            this.isConnected = true;
        }
    }

    disconnect(): void {
        if(this.isConnected) {
            this.stopListening();
            this.updateIsMatchingNode(false);

            this.isConnected = false;
        }        
    }

    protected handleMutations(): void {
        this.updateIsMatchingNode(this.computeIsMatchingNode());
    }

    private updateIsMatchingNode(isMatchingNode: boolean): void {
        let wasMatchingNode = this.isMatchingNode;
        this.isMatchingNode = isMatchingNode;

        if(wasMatchingNode !== isMatchingNode) {
            let event = new NodeMatchesChangedEvent(this, isMatchingNode);

            this.executor(event, this.node);
        }
    }

    private computeIsMatchingNode(): boolean {
        return NodeCollector.isMatchingNode(this.node, this.matcher);
    }
}

export class NodeMatchesChangedEvent extends SubscriptionEvent {
    readonly isMatching: boolean;

    constructor(nodeMatchesSubscription: NodeMatchesSubscription, isMatching: boolean) {
        super(nodeMatchesSubscription, 'NodeMatchesChangedEvent');

        this.isMatching = isMatching;
    }
}

export { NodeMatcher };
