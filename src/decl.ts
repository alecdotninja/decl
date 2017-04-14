import { Scope, ScopeExecutor, ElementMatcher, EventMatcher, SubscriptionExecutor } from './scope';

export default Decl;

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

    static collectScopes(): Scope[] {
        return this.getDefaultInstance().collectScopes();
    }

    static drawTree(): void {
        this.getDefaultInstance().drawTree();
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
    
    collectScopes(): Scope[] {
        return [this.scope, ...this.scope.collectDescendantScopes()];
    }

    drawTree(): void {
        this.scope.drawTree();
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
