import { Scope, ScopeExecutor, ElementMatcher, EventMatcher, SubscriptionExecutor } from './scope';

export default Decl;

export class Decl {
    private static defaultInstance: Decl;

    static select(matcher: ElementMatcher, executor: ScopeExecutor): Scope {
        return this.getDefaultInstance().select(matcher, executor);
    }

    static on(matcher: EventMatcher, executor: SubscriptionExecutor): Scope {
        return this.getDefaultInstance().on(matcher, executor);
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
        return this.getScope().select(matcher, executor);
    }

    on(matcher: EventMatcher, executor: SubscriptionExecutor): Scope {
        return this.getScope().on(matcher, executor);
    }

    getScope(): Scope {
        return this.scope;
    }

    pristine(): void {
        this.scope.pristine();
    }
}

// Export to a global for the browser (there *has* to be a better way to do this!)
if(typeof(window) !== 'undefined') {
    (<any>window).Decl = Decl;
}

export { Scope, ScopeExecutor, ElementMatcher, EventMatcher, SubscriptionExecutor };
