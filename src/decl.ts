import { Scope, ElementMatcher, EventMatcher, ScopeExecutor, SubscriptionExecutor } from './scope';

export default Decl;

export { Scope, ElementMatcher, EventMatcher, ScopeExecutor, SubscriptionExecutor };

export class Decl {
    private static defaultInstance: Decl | null = null;

    static select(matcher: ElementMatcher, executor: ScopeExecutor): Scope {
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
        return this.defaultInstance || (this.defaultInstance = new Decl(document.documentElement));
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

    private scope: Scope;

    constructor(root: Element) {
        this.scope = Scope.buildRootScope(root);
    }

    select(matcher: ElementMatcher, executor: ScopeExecutor): Scope {
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
}

// Export to a global for the browser (there *has* to be a better way to do this!)
if(typeof(window) !== 'undefined') {
    (<any>window).Decl = Decl;
}
