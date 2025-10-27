import { expect } from 'chai';

describe('Basic Tests', () => {
    it('should return true for true', () => {
        expect(true).to.be.true;
    });

    it('should return false for false', () => {
        expect(false).to.be.false;
    });

    it('should add numbers correctly', () => {
        const sum = (a: number, b: number) => a + b;
        expect(sum(2, 3)).to.equal(5);
    });

    it('should concatenate strings correctly', () => {
        const concat = (a: string, b: string) => a + b;
        expect(concat('Hello, ', 'world!')).to.equal('Hello, world!');
    });
});
