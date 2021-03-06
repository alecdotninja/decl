import { Decl, Scope } from "../src/decl";
import { expect } from "chai";
import { Promise } from "es6-promise";

describe('Scope', () => {
    beforeEach(() => { 
        Decl.pristine();
        pristineDocument();
    });

    it('is initalized with a matched node', () => {
        let scope = new Scope(document.documentElement);

        expect(scope.getNode()).to.equal(document.documentElement);
    });

    it('invokes the scope executor during initialization', () => {
        let didRunExecutorDuringInitalization = false;

        new Scope(document.documentElement, () => {
            didRunExecutorDuringInitalization = true;
        });

        expect(didRunExecutorDuringInitalization).to.equal(true);
    });

    describe('#match', () => {
        it('invokes the provided executor when activated', () => {
            let didInvokeExecutorWhenActivated = false; 

            Decl.select('[data-match-me]', (scope) => {
                scope.match(() => {
                    didInvokeExecutorWhenActivated = true;
                });
            });

            return setContent('body', '<div data-match-me></div>').then(() => {
                expect(didInvokeExecutorWhenActivated).to.equal(true);
            });
        });
    });

    describe('#unmatch', () => {
        it('invokes the provided executor when deactivated', () => {
            let didInvokeExecutorWhenDecativated = false;

            Decl.select('[data-match-me]', (scope) => {
                scope.unmatch(() => {
                    didInvokeExecutorWhenDecativated = true;
                });
            });

            return setContent('body', '<div data-match-me></div>').then(() => {
                return setContent('body', '<div></div>').then(() => {
                    expect(didInvokeExecutorWhenDecativated).to.equal(true);
                });
            });            
        });
    });

    describe('#select', () => {
        context('when a child of the matched node matches the provided node matcher outright', () => {
            it('activates a new scope with the provided scope executor', () => {
                let didActivateScope = false;

                Decl.select('[data-match-me]', (scope) => {
                    scope.select('[data-also-match-me]', (scope) => {
                        scope.match(() => {
                            didActivateScope = true;
                        });
                    });
                });

                return setContent('body', '<div data-match-me><div data-also-match-me></div></div>').then(() => {
                    expect(didActivateScope).to.equal(true);
                });   
            });
        });

        context('when a child of the matched node does *not* match the provided node matcher outright', () => {
            it('does *not* activate a new scope with the provided scope executor', () => {
                let didActivateScope = false;

                Decl.select('[data-match-me]', (scope) => {
                    scope.select('[data-also-match-me]', (scope) => {
                        scope.match(() => {
                            didActivateScope = true;
                        });
                    });
                });

                return setContent('body', '<div data-match-me><div data-do-not-match-me></div></div>').then(() => {
                    expect(didActivateScope).to.equal(false);
                });
            });
        });

        context('when a child of the matched node mutates to match the provided node matcher', () => {
            it('activates a new scope with the provided scope executor', () => {
                let didActivateScope = false;

                Decl.select('[data-match-me]', (scope) => {
                    scope.select('[data-also-match-me]', (scope) => {
                        scope.match(() => {
                            didActivateScope = true;
                        });
                    });
                });

                return setContent('body', '<div data-match-me><div data-do-not-match-me></div></div>').then(() => {
                    return setContent('[data-match-me]', '<div data-also-match-me />').then(() => {
                        expect(didActivateScope).to.equal(true);
                    });
                });
            });
        });

        context('when a child of the matched node mutates to no longer match the provided node matcher', () => {
            it('deactivates the scope that was activated when a child of the matched node first matched the node matcher', () => {
                let didDeactivateScope = false;

                Decl.select('[data-match-me]', (scope) => {
                    scope.select('[data-also-match-me]', (scope) => {
                        scope.unmatch(() => {
                            didDeactivateScope = true;
                        });
                    });
                });

                return setContent('body', '<div data-match-me><div data-also-match-me></div></div>').then(() => {
                    return setContent('[data-match-me]', '').then(() => {
                        expect(didDeactivateScope).to.equal(true);
                    });
                });
            });
        });

        context('when an node which is not a child of the matched node mutates to match the provided node matcher', () => {
            it('does *not* activate a new scope with the provided scope executor', () => {
                let didActivateScope = false;

                Decl.select('[data-match-me]', (scope) => {
                    scope.select('[data-also-match-me]', (scope) => {
                        scope.match(() => {
                            didActivateScope = true;
                        });
                    });
                });

                return setContent('body', '<div data-match-me></div><div data-do-not-match-me></div>').then(() => {
                    return setContent('[data-do-not-match-me]', '<div data-also-match-me></div>').then(() => {
                        expect(didActivateScope).to.equal(false);
                    });
                });
            });
        });
    });

    describe('#when', () => {
        context('when the matched node also matches the provided node matcher outright', () => {
            it('activates a new scope with the provided scope executor', () => {
                let didActivateScope = false;

                Decl.select('[data-match-me]', (scope) => {
                    scope.when('[data-magic]', (scope) => {
                        scope.match(() => {
                            didActivateScope = true;
                        });
                    });
                });

                return setContent('body', '<div data-match-me data-magic></div>').then(() => {
                    expect(didActivateScope).to.equal(true);
                });
            });
        });

        context('when the matched node does *not* match the provided node matcher outright', () => {
            it('does *not* activate a new scope with the provided scope executor', () => {
                let didActivateScope = false;

                Decl.select('[data-match-me]', (scope) => {
                    scope.when('[data-magic]', (scope) => {
                        scope.match(() => {
                            didActivateScope = true;
                        });
                    });
                });

                return setContent('body', '<div data-match-me></div>').then(() => {
                    expect(didActivateScope).to.equal(false);
                });
            });
        });

        context('when the matched node mutates to match the provided node matcher', () => {
            it('activates a new scope with the provided scope executor', () => {
                let didActivateScope = false;

                Decl.select('[data-match-me]', (scope) => {
                    scope.when('.matches-when', (scope) => {
                        scope.match(() => {
                            didActivateScope = true;
                        });
                    });
                });

                return setContent('body', '<div data-match-me></div>').then(() => {
                    return setAttribute('[data-match-me]', 'class', 'matches-when').then(() => {
                        expect(didActivateScope).to.equal(true);                    
                    });
                });
            });
        });

        context('when the matched node mutates to no longer match the provided node matcher', () => {
            it('deactivates the scope that was activated when the matched node first matched the node matcher', () => {
                let didDeactivateScope = false;

                Decl.select('[data-match-me]', (scope) => {
                    scope.when('.matches-when', (scope) => {
                        scope.unmatch(() => {
                            didDeactivateScope = true;
                        });
                    });
                });

                return setContent('body', '<div data-match-me class="matches-when"></div>').then(() => {
                    return setAttribute('[data-match-me]', 'class', '').then(() => {
                        expect(didDeactivateScope).to.equal(true);                    
                    });
                });
            });
        });

        context('when another node besides the matched node mutates to match the provided node matcher', () => {
            it('does *not* activate a new scope with the provided scope executor', () => {
                let didActivateScope = false;

                Decl.select('[data-match-me]', (scope) => {
                    scope.when('.matches-when', (scope) => {
                        scope.match(() => {
                            didActivateScope = true;
                        });
                    });
                });

                return setContent('body', '<div data-do-not-match-me></div>').then(() => {
                    return setAttribute('[data-do-not-match-me]', 'class', 'matches-when').then(() => {
                        expect(didActivateScope).to.equal(false);                    
                    });
                });
            });
        });
    });

    describe('#on', () => {
        context('when a matching event occurs', () => {
            context('on the matched node', () => {
                it('runs the executor', () => {
                    let didRunExecutor = false;

                    Decl.select('[data-match-me]', (scope) => {
                        scope.on('click', () => {
                            didRunExecutor = true;
                        });
                    });

                    return setContent('body', '<div data-match-me></div>').then(() => {
                        return simulateEvent('[data-match-me]', 'click').then(() => {
                            expect(didRunExecutor).to.equal(true);
                        });
                    });
                });
            });

            context('on another node besides the matched node', () => {
                it('does *not* run the executor', () => {
                    let didRunExecutor = false;

                    Decl.select('[data-match-me]', (scope) => {
                        scope.on('click', () => {
                            didRunExecutor = true;
                        });
                    });

                    return setContent('body', '<div data-do-not-match-me></div>').then(() => {
                        return simulateEvent('[data-do-not-match-me]', 'click').then(() => {
                            expect(didRunExecutor).to.equal(false);
                        });
                    });
                });
            });
        });

        context('when a non-matching event occurs', () => {
            context('on the matched node', () => {
                it('does *not* run the executor', () => {
                    let didRunExecutor = false;

                    Decl.select('[data-match-me]', (scope) => {
                        scope.on('click', () => {
                            didRunExecutor = true;
                        });
                    });

                    return setContent('body', '<div data-match-me></div>').then(() => {
                        return simulateEvent('[data-match-me]', 'mouseover').then(() => {
                            expect(didRunExecutor).to.equal(false);
                        });
                    });
                });
            });

            context('on another node besides the matched node', () => {
                it('does *not* run the executor', () => {
                    let didRunExecutor = false;

                    Decl.select('[data-match-me]', (scope) => {
                        scope.on('click', () => {
                            didRunExecutor = true;
                        });
                    });

                    return setContent('body', '<div data-do-not-match-me></div>').then(() => {
                        return simulateEvent('[data-do-not-match-me]', 'mouseover').then(() => {
                            expect(didRunExecutor).to.equal(false);
                        });
                    });                    
                });                    
            });
        });
    });
});

function setAttribute(selector : string, attributeName: string, attribueValue: string) {
    let node = document.querySelector(selector);

        if(node) {
        node.setAttribute(attributeName, attribueValue);
        return waitForRepaint();
    }else{
        return Promise.reject('Cannot change attribue ' + attributeName + ' of ' + selector + ' to ' + attribueValue);
    }
}

function setContent(selector : string, htmlContent : string): Promise<any> {
    let node = document.querySelector(selector);

    if(node) {
        node.innerHTML = htmlContent;
        return waitForRepaint();
    }else{
        return Promise.reject('Cannot set content of ' + selector);
    }
}

function simulateEvent(selector : string, eventName : string): Promise<any> {
    let node = document.querySelector(selector);

    if(node) {
        let event = document.createEvent('Events');
        event.initEvent(eventName, true, true);

        node.dispatchEvent(event);

        return waitForRepaint();
    }else{
        return Promise.reject('Cannot simulate ' + eventName + ' on ' + selector);
    }
}

function waitForRepaint(): Promise<any> {
    return new Promise(function(resolve) {
        setTimeout(resolve, 100);  
    });
}

function pristineDocument(): void {
    document.replaceChild(document.createElement('HTML'), document.documentElement);
    document.documentElement.appendChild(document.createElement('HEAD'));
    document.documentElement.appendChild(document.createElement('BODY'));
}