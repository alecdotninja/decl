import { ScopeTrackingDeclaration, ElementMatcher, ScopeExecutor } from './scope_tracking_declaration';
import { MatchingElementsSubscription, MatchingElementsChangedEvent } from '../subscriptions/matching_elements_subscription';

export { ElementMatcher, ScopeExecutor };

export class SelectDeclaration extends ScopeTrackingDeclaration {
    protected subscription: MatchingElementsSubscription;
    protected matcher: ElementMatcher;
    protected executor: ScopeExecutor;

    constructor(element: Element, matcher: ElementMatcher, executor: ScopeExecutor) {
        super(element);

        this.matcher = matcher;
        this.executor = executor;

        this.subscription = new MatchingElementsSubscription(this.element, this.matcher, (event: MatchingElementsChangedEvent) => {
            for(let element of event.addedElements) {
                this.addChildScopeByElement(element, this.executor);
            }

            for(let element of event.removedElements) {
                this.removeChildScopeByElement(element);
            }
        });
    }

    inspect(includeSource?: boolean): void {
        (<any>console.groupCollapsed)('select', this.matcher);

        try{
            this.inspectChildScopes(includeSource);        
        }finally{
            console.groupEnd();
        }
    }
}