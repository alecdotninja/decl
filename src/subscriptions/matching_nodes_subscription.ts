import { BatchedMutationSubscription, SubscriptionExecutor, SubscriptionEvent } from './batched_mutation_subscription';
import { NodeMatcher, NodeCollector } from '../node_collector';

export { NodeMatcher };

export class MatchingNodesSubscription extends BatchedMutationSubscription {
    readonly matcher: NodeMatcher;

    private isConnected: boolean = false;
    private matchingNodes: Node[] = [];

    constructor(node: Node, matcher: NodeMatcher, executor: SubscriptionExecutor) {
        super(node, executor);

        this.matcher = matcher;
    }

    connect(): void {
        if(!this.isConnected) {
            this.updateMatchingNode(this.collectMatchingNodes());
            this.startListening();

            this.isConnected = true;
        }
    }

    disconnect(): void {
        if(this.isConnected) {
            this.stopListening();
            this.updateMatchingNode([]);

            this.isConnected = false;
        }        
    }

    protected handleMutations(): void {
        this.updateMatchingNode(this.collectMatchingNodes());
    }

    private updateMatchingNode(matchingNodes: Node[]): void {
        let previouslyMatchingNodes = this.matchingNodes;

        let addedNodes = arraySubtract(matchingNodes, previouslyMatchingNodes);
        let removedNodes = arraySubtract(previouslyMatchingNodes, matchingNodes);

        this.matchingNodes = matchingNodes;   
        
        if(addedNodes.length > 0 || removedNodes.length > 0) {
            let event = new MatchingNodesChangedEvent(this, addedNodes, removedNodes);

            this.executor(event, this.node);
        }
    }

    private collectMatchingNodes(): Node[] {
        return NodeCollector.collectMatchingNodes(this.node, this.matcher);
    }
}

export class MatchingNodesChangedEvent extends SubscriptionEvent {
    readonly addedNodes: Node[];
    readonly removedNodes: Node[];

    constructor(matchingNodesSubscription: MatchingNodesSubscription, addedNodes: Node[], removedNodes: Node[]) {
        super(matchingNodesSubscription, 'MatchingNodesChanged');

        this.addedNodes = addedNodes;
        this.removedNodes = removedNodes;
    }
}

function arraySubtract<T>(minuend: T[], subtrahend: T[]): T[] {
    let difference: T[] = [];

    for(let member of minuend) {
        if(subtrahend.indexOf(member) === -1) {
            difference.push(member);
        }
    }

    return difference;
}