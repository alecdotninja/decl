import { Declaration, SubscriptionExecutor } from './declarations/declaration';
import { MatchDeclaration } from './declarations/match_declaration';
import { UnmatchDeclaration } from './declarations/unmatch_declaration';
import { OnDeclaration, EventMatcher } from './declarations/on_declaration';

import { NodeMatcher } from './declarations/scope_tracking_declaration';
import { SelectDeclaration } from './declarations/select_declaration';
import { WhenDeclaration } from './declarations/when_declaration';

export { Declaration, SubscriptionExecutor, NodeMatcher, EventMatcher };

export interface ScopeExecutor { 
    (scope: Scope, node: Node): void
};

export class Scope {
    static buildRootScope(node: Node): Scope {
        let scope = new Scope(node);
        scope.activate();

        return scope;
    }

    private readonly node: Node;
    private readonly executors: ScopeExecutor[] = [];

    private isActivated: boolean = false;
    private declarations: Declaration[] = [];

    constructor(node: Node, executor?: ScopeExecutor) {
        this.node = node;

        if(executor) {
            this.addExecutor(executor);
        }
    }

    addExecutor(executor: ScopeExecutor): void {
        this.executors.push(executor);

        return executor.call(this, this, this.node);
    }

    getNode(): Node {
        return this.node;
    }

    getDeclarations(): Declaration[] {
        return this.declarations;
    }

    inspect(includeSource?: boolean): void {
        (<any>console.groupCollapsed)(this.node);

        try {
            if(includeSource) {
                console.groupCollapsed('source');
            
                for(let executor of this.executors) {
                    console.log(executor);
                }

                console.groupEnd();
            }
            
            for(let declaration of this.declarations) {
                declaration.inspect(includeSource);
            }
        }finally{
            (<any>console.groupEnd)();
        }
    }

    activate(): void {
        if(!this.isActivated) {
            this.isActivated = true;

            for(let declaration of this.declarations) {
                declaration.activate();
            }
        }
    }

    deactivate(): void {        
        if(this.isActivated) {
            this.isActivated = false;            
            
            for(let declaration of this.declarations) {
                declaration.deactivate();
            }
        }
    }

    pristine(): void {
        this.deactivate();
        this.removeAllDeclarations();
    }

    match(executor: SubscriptionExecutor): Scope {
        this.addDeclaration(new MatchDeclaration(this.node, executor));

        return this;
    }

    unmatch(executor: SubscriptionExecutor): Scope {
        this.addDeclaration(new UnmatchDeclaration(this.node, executor));

        return this;
    }

    select(matcher: NodeMatcher, executor: ScopeExecutor): Scope {
        this.addDeclaration(new SelectDeclaration(this.node, matcher, executor));

        return this;
    }

    when(matcher: NodeMatcher, executor: ScopeExecutor): Scope {
		this.addDeclaration(new WhenDeclaration(this.node, matcher, executor));

        return this;
    }

    on(eventMatcher: EventMatcher, executor: SubscriptionExecutor): Scope;
    on(eventMatcher: EventMatcher, nodeMatcher: NodeMatcher, executor: SubscriptionExecutor): Scope;
    on(eventMatcher: EventMatcher, executorOrNodeMatcher: SubscriptionExecutor | NodeMatcher, maybeExecutor?: SubscriptionExecutor): Scope {
        let argumentsCount = arguments.length;

        switch(argumentsCount) {
            case 2:
                return this.onWithTwoArguments(eventMatcher, <SubscriptionExecutor>executorOrNodeMatcher);
            case 3:
                return this.onWithThreeArguments(eventMatcher, <NodeMatcher>executorOrNodeMatcher, <SubscriptionExecutor>maybeExecutor);
            default:
                throw new TypeError("Failed to execute 'on' on 'Scope': 2 or 3 arguments required, but " + argumentsCount + " present.");
        }
    }

    private onWithTwoArguments(eventMatcher: EventMatcher, executor: SubscriptionExecutor): Scope {
        this.addDeclaration(new OnDeclaration(this.node, eventMatcher, executor));

        return this;
    }

    private onWithThreeArguments(eventMatcher: EventMatcher, nodeMatcher: NodeMatcher, executor: SubscriptionExecutor): Scope {
        this.select(nodeMatcher, (scope) => {
            scope.on(eventMatcher, executor);
        });

        return this;
    }

    private addDeclaration(declaration: Declaration): void {
        this.declarations.push(declaration);

        if(this.isActivated) {
            declaration.activate();
        }
    }

    private removeDeclaration(declaration: Declaration): void {  
        let index = this.declarations.indexOf(declaration);

        if(index >= 0) {
            this.declarations.splice(index, 1);
        }

        declaration.deactivate();        
    }

    private removeAllDeclarations() {        
        let declaration: Declaration;

        while(declaration = this.declarations[0]) {
            this.removeDeclaration(declaration);
        }
    }
}
