import { Declaration, SubscriptionExecutor } from './declarations/declaration';
import { MatchDeclaration } from './declarations/match_declaration';
import { UnmatchDeclaration } from './declarations/unmatch_declaration';
import { OnDeclaration, EventMatcher } from './declarations/on_declaration';

import { ElementMatcher } from './declarations/scope_tracking_declaration';
import { SelectDeclaration } from './declarations/select_declaration';
import { WhenDeclaration } from './declarations/when_declaration';

export { Declaration, SubscriptionExecutor, ElementMatcher, EventMatcher };

export interface ScopeExecutor { 
    (scope: Scope, element: Element): void
};

export class Scope {
    static buildRootScope(element: Element): Scope {
        let scope = new Scope(element);
        scope.activate();

        return scope;
    }

    private readonly element: Element;

    private isActivated: boolean = false;
    private declarations: Declaration[] = [];

    constructor(element: Element, executor?: ScopeExecutor) {
        this.element = element;

        if(executor) {
            executor.call(this, this, this.element);
        }
    }

    getElement(): Element {
        return this.element;
    }

    getDeclarations(): Declaration[] {
        return this.declarations;
    }

    inspect(): void {
        if(this.isActivated) {
            (<any>console.group)(this.element, '(active)');
        }else{
            (<any>console.group)(this.element, '(inactive)');
        }

        try {
            for(let declaration of this.declarations) {
                declaration.inspect();
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
        this.addDeclaration(new MatchDeclaration(this.element, executor));

        return this;
    }

    unmatch(executor: SubscriptionExecutor): Scope {
        this.addDeclaration(new UnmatchDeclaration(this.element, executor));

        return this;
    }

    select(matcher: ElementMatcher, executor: ScopeExecutor): Scope {
        this.addDeclaration(new SelectDeclaration(this.element, matcher, executor));

        return this;
    }

    when(matcher: ElementMatcher, executor: ScopeExecutor): Scope {
		this.addDeclaration(new WhenDeclaration(this.element, matcher, executor));

        return this;
    }

    on(eventMatcher: EventMatcher, executor: SubscriptionExecutor): Scope;
    on(eventMatcher: EventMatcher, elementMatcher: ElementMatcher, executor: SubscriptionExecutor): Scope;
    on(eventMatcher: EventMatcher, executorOrElementMatcher: SubscriptionExecutor | ElementMatcher, maybeExecutor?: SubscriptionExecutor): Scope {
        let argumentsCount = arguments.length;

        switch(argumentsCount) {
            case 2:
                return this.onWithTwoArguments(eventMatcher, <SubscriptionExecutor>executorOrElementMatcher);
            case 3:
                return this.onWithThreeArguments(eventMatcher, <ElementMatcher>executorOrElementMatcher, <SubscriptionExecutor>maybeExecutor);
            default:
                throw new TypeError("Failed to execute 'on' on 'Scope': 2 or 3 arguments required, but " + argumentsCount + " present.");
        }
    }

    private onWithTwoArguments(eventMatcher: EventMatcher, executor: SubscriptionExecutor): Scope {
        this.addDeclaration(new OnDeclaration(this.element, eventMatcher, executor));

        return this;
    }

    private onWithThreeArguments(eventMatcher: EventMatcher, elementMatcher: ElementMatcher, executor: SubscriptionExecutor): Scope {
        this.select(elementMatcher, (scope) => {
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
