import { Decl } from "../src/decl";
import { expect } from "chai";
import { Promise } from "es6-promise";

describe('Decl', () => {
    beforeEach(() => { 
        Decl.pristine();
        pristineDocument();
    });

    describe('.select', () => {
        it('delegates to the default instance', () => {
            return expectMethodToBeCalledBy(Decl.getDefaultInstance(), 'select', () => {
                Decl.select('[data-match-me]', () => {});
            });
        });
    });

    describe('.on', () => {
        it('delegates to the default instance', () => {
            return expectMethodToBeCalledBy(Decl.getDefaultInstance(), 'on', () => {
                Decl.on('click', () => {});
            });
        });
    });

    describe('.getDefaultInstance', () => {
        context('when the default instance has been externally set', () => {
            beforeEach(() => {
                Decl.setDefaultInstance(new Decl(document.body));
            });

            it('returns the externally set default instance', () => {
                expect(Decl.getDefaultInstance().getRootScope().getElement()).to.equal(document.body);
            });
        });

        context('when the default instance has not been externally set', () => {
            it('constructs a new default instance with the root of the document', () => {
                expect(Decl.getDefaultInstance().getRootScope().getElement()).to.equal(document.documentElement);
            });
        });
    });

    describe('.setDefaultInstance', () => {
        let defaultInstance = new Decl(document.body);

        beforeEach(() => {
            Decl.setDefaultInstance(defaultInstance);
        });

        it('sets the default instance', () => {
            expect(Decl.getDefaultInstance()).to.equal(defaultInstance);
        });
    });

    describe('#select', () => {
        it('delegates to the root scope', () => {
            return expectMethodToBeCalledBy(Decl.getDefaultInstance().getRootScope(), 'select', () => {
                Decl.getDefaultInstance().select('[data-match-me]', () => {});
            });
        });
    });

    describe('#on', () => {
        it('delegates to the root scope', () => {
            return expectMethodToBeCalledBy(Decl.getDefaultInstance().getRootScope(), 'on', () => {
                Decl.getDefaultInstance().on('click', () => {});
            });
        });        
    });

    describe('#getScope', () => {
        it('returns the root scope', () => {
            expect(Decl.getDefaultInstance().getRootScope().getElement()).to.equal(document.documentElement);
        });  
    });
});

function pristineDocument(): void {
    document.replaceChild(document.createElement('HTML'), document.documentElement);
    document.documentElement.appendChild(document.createElement('HEAD'));
    document.documentElement.appendChild(document.createElement('BODY'));
}

function expectMethodToBeCalledBy(object: Object, propertyName : string, executor: Function): Promise<any> {
    return new Promise(function(resolve) {
        let original: Function = (<any>object)[propertyName];

        (<any>object)[propertyName] = function(this: any): any {
            let returnValue: any = original.apply(this, arguments);

            resolve();

            return returnValue;
        };

        return executor();
    });
}