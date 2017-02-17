import { Decl } from "../src/decl";
import { expect } from "chai";

describe('Decl', () => {
    beforeEach(() => { 
        Decl.pristine();
        pristineDocument();
    });

    describe('select', () => {
        beforeEach(() => {
            Decl.select('[data-detect-me]', scope => {
                scope.match(element => {
                    element.innerHTML = 'detected';
                });

                scope.on('click', element => {
                    element.innerHTML = 'clicked';
                });
            });
        });

        it('detects a matching and runs the callback at the next repaint', () => {
            setContent('body', '<div data-detect-me></div>', () => {
                expect(textOf('[data-detect-me]')).to.eq('detected');
            });
        });

        it('correctly registers event handles', () => {
            setContent('body', '<div data-detect-me></div>', () => {
                simulateEvent('[data-detect-me]', 'click', () => {
                    expect(textOf('[data-detect-me]')).to.eq('detected');                
                });
            });
        });
    });
});

function setContent(selector : string, htmlContent : string, thenCallback?: () => void): void {
    let element = document.querySelector(selector);

    if(element) {
        element.innerHTML = htmlContent;
    }
    
    if(thenCallback) {
        waitForRepaint(thenCallback);
    }
}

function simulateEvent(selector : string, eventName : string, thenCallback?: () => void): void {
    let element = document.querySelector(selector);

    if(element) {
        let event = document.createEvent('Events');
        event.initEvent(eventName, true, true);

        element.dispatchEvent(event);
    }

    if(thenCallback) {
        setTimeout(thenCallback, 0);
    }
}

function waitForRepaint(callback: () => void): void {
    // wait for the next repaint...
    requestAnimationFrame(() => {
        // ...but make sure that we are the *last* thing that happens        
        setTimeout(callback, 0);
    });
}

function textOf(selector : string) : string {
    let element = document.querySelector(selector);

    if(element) {
        return element.textContent;
    }else{
        return null;
    }
}

function pristineDocument() {
    document.replaceChild(document.createElement('HTML'), document.documentElement);
}