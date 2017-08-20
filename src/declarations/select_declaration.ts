import { ScopeTrackingDeclaration, NodeMatcher, ScopeExecutor } from './scope_tracking_declaration';
import { MatchingNodesSubscription, MatchingNodesChangedEvent } from '../subscriptions/matching_nodes_subscription';

export { NodeMatcher, ScopeExecutor };

export class SelectDeclaration extends ScopeTrackingDeclaration {
    protected subscription: MatchingNodesSubscription;
    protected matcher: NodeMatcher;
    protected executor: ScopeExecutor;

    constructor(node: Node, matcher: NodeMatcher, executor: ScopeExecutor) {
        super(node);

        this.matcher = matcher;
        this.executor = executor;

        this.subscription = new MatchingNodesSubscription(this.node, this.matcher, (event: MatchingNodesChangedEvent) => {
            for(let node of event.addedNodes) {
                this.addChildScopeByNode(node, this.executor);
            }

            for(let node of event.removedNodes) {
                this.removeChildScopeByNode(node);
            }
        });
    }

    inspect(includeSource?: boolean): void {
        console.groupCollapsed('select', this.matcher);

        try{
            this.inspectChildScopes(includeSource);        
        }finally{
            console.groupEnd();
        }
    }
}