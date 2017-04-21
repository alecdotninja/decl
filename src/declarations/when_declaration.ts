import { ScopeTrackingDeclaration, ElementMatcher, ScopeExecutor } from './scope_tracking_declaration';
import { ElementMatchesSubscription, ElementMatchesChangedEvent } from '../subscriptions/element_matches_subscription';

export { ElementMatcher, ScopeExecutor };

export class WhenDeclaration extends ScopeTrackingDeclaration {
    protected subscription: ElementMatchesSubscription;
    protected matcher: ElementMatcher;
    protected executor: ScopeExecutor;

    constructor(element: Element, matcher: ElementMatcher, executor: ScopeExecutor) {
        super(element);

        this.matcher = matcher;
        this.executor = executor;

        this.subscription = new ElementMatchesSubscription(this.element, this.matcher, (event: ElementMatchesChangedEvent) => {
            if(event.isMatching) {
                this.addChildScopeByElement(element, this.executor);
            }else{
                this.removeChildScopeByElement(element);
            }
        });
    }

    inspect(): void {
        (<any>console.group)('&', this.matcher, '(' + this.childScopes.length + ' matches)');

        try {
            for(let childScope of this.childScopes) {
                childScope.inspect();
            }
        }finally{
            console.groupEnd();
        }
    }
}