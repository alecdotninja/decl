import { Scope, NodeMatcher, EventMatcher, ScopeExecutor, SubscriptionExecutor } from './scope';

export { Scope, NodeMatcher, EventMatcher, ScopeExecutor, SubscriptionExecutor };

export class Decl {
    private static defaultInstance: Decl | null = null;

    static select(matcher: NodeMatcher, executor: ScopeExecutor): Scope {
        return this.getDefaultInstance().select(matcher, executor);
    }

    static on(matcher: EventMatcher, executor: SubscriptionExecutor): Scope {
        return this.getDefaultInstance().on(matcher, executor);
    }

    static getRootScope(): Scope {
        return this.getDefaultInstance().getRootScope();
    }

    static inspect(includeSource?: boolean): void {
        this.getDefaultInstance().inspect(includeSource);
    }

    static getDefaultInstance() : Decl {
        return this.defaultInstance || (this.defaultInstance = new Decl(window.document));
    }

    static setDefaultInstance(decl: Decl) : Decl {
        return this.defaultInstance = decl;
    }

    static pristine(): void {
        if(this.defaultInstance) {
            this.defaultInstance.pristine();
            this.defaultInstance = null;
        }
    }

    static activate(): void {
        return this.getDefaultInstance().activate();
    }

    static deactivate(): void {
        return this.getDefaultInstance().deactivate();        
    }

    private scope: Scope;

    constructor(root: Node) {
        this.scope = Scope.buildRootScope(root);
    }

    select(matcher: NodeMatcher, executor: ScopeExecutor): Scope {
        return this.scope.select(matcher, executor);
    }

    on(matcher: EventMatcher, executor: SubscriptionExecutor): Scope {
        return this.scope.on(matcher, executor);
    }

    getRootScope(): Scope {
       return this.scope; 
    }

    inspect(includeSource?: boolean): void {
        console.groupCollapsed('<<root>>');
        
        try {
            this.scope.inspect(includeSource);        
        }finally{
            console.groupEnd();
        }
    }

    pristine(): void {
        this.scope.pristine();
    }

    activate(): void {
        this.scope.activate();        
    }

    deactivate(): void {        
        this.scope.deactivate();
    }
}

// Export to a global for the browser (there *has* to be a better way to do this!)
if(typeof(window) !== 'undefined') {
    (<any>window).Decl = Decl;
}

export default Decl;
