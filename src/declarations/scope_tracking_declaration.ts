import { Declaration } from './declaration';
import { NodeMatcher } from '../node_collector';
import { Scope, ScopeExecutor } from '../scope';

export { NodeMatcher, ScopeExecutor };

export abstract class ScopeTrackingDeclaration extends Declaration {
    private readonly childScopes: Scope[] = [];
    
    deactivate(): void {
        this.removeAllChildScopes();
        super.deactivate();
    }

    getChildScopes() {
        return this.childScopes;
    }

    protected inspectChildScopes(includeSource?: boolean): void {        
        for(let childScope of this.childScopes) {
            childScope.inspect(includeSource);
        }
    }

    protected addChildScope(scope: Scope) {
        if(this.isActivated) {
            this.childScopes.push(scope);

            scope.activate();
        }
    }

    protected removeChildScope(scope: Scope) { 
        scope.deactivate();

        if(this.isActivated) {
            let index = this.childScopes.indexOf(scope);
            
            if(index >= 0) {
                this.childScopes.splice(index, 1);
            }
        }
    }

    protected removeAllChildScopes() {
        let childScope: Scope;

        while(childScope = this.childScopes[0]) {
            this.removeChildScope(childScope);
        }
    }

    protected addChildScopeByNode(node: Node, executor?: ScopeExecutor) {
        let childScope = new Scope(node, executor);

        this.addChildScope(childScope);
    }

    protected removeChildScopeByNode(node: Node) {
        for(let childScope of this.childScopes) {
            if(childScope.getNode() === node) {
                this.removeChildScope(childScope);
                return; // loop must exit to avoid data-race
            }
        }
    }
}