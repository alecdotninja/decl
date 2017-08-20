import { ScopeTrackingDeclaration, NodeMatcher, ScopeExecutor } from './scope_tracking_declaration';
import { NodeMatchesSubscription, NodeMatchesChangedEvent } from '../subscriptions/node_matches_subscription';

export { NodeMatcher, ScopeExecutor };

export class WhenDeclaration extends ScopeTrackingDeclaration {
    protected subscription: NodeMatchesSubscription;
    protected matcher: NodeMatcher;
    protected executor: ScopeExecutor;

    constructor(node: Node, matcher: NodeMatcher, executor: ScopeExecutor) {
        super(node);

        this.matcher = matcher;
        this.executor = executor;

        this.subscription = new NodeMatchesSubscription(this.node, this.matcher, (event: NodeMatchesChangedEvent) => {
            if(event.isMatching) {
                this.addChildScopeByNode(this.node, this.executor);
            }else{
                this.removeChildScopeByNode(this.node);
            }
        });
    }

    inspect(includeSource?: boolean): void {
        console.groupCollapsed('when', this.matcher);

        try{
            this.inspectChildScopes(includeSource);        
        }finally{
            console.groupEnd();
        }
    }
}