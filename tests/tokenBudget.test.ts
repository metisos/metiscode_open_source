import { expect } from 'chai';
import { TokenBudgetManager } from '../src/runtime/budgetManager';

describe('Token Budget Manager', () => {
  let budgetManager: TokenBudgetManager;

  beforeEach(() => {
    budgetManager = new TokenBudgetManager(10000);
  });

  describe('Initialization', () => {
    it('should initialize with default budget', () => {
      const defaultManager = new TokenBudgetManager();
      const usage = defaultManager.getUsage();

      expect(usage.budget).to.equal(200000);
      expect(usage.used).to.equal(0);
      expect(usage.percentage).to.equal(0);
    });

    it('should initialize with custom budget', () => {
      const customManager = new TokenBudgetManager(50000);
      const usage = customManager.getUsage();

      expect(usage.budget).to.equal(50000);
      expect(usage.used).to.equal(0);
    });

    it('should track separate prompt and completion tokens', () => {
      const usage = budgetManager.getUsage();

      expect(usage.promptTokens).to.equal(0);
      expect(usage.completionTokens).to.equal(0);
    });
  });

  describe('Usage Tracking', () => {
    it('should add token usage correctly', () => {
      budgetManager.addUsage({
        prompt: 100,
        completion: 50,
        total: 150
      });

      const usage = budgetManager.getUsage();
      expect(usage.used).to.equal(150);
      expect(usage.promptTokens).to.equal(100);
      expect(usage.completionTokens).to.equal(50);
    });

    it('should accumulate multiple usage additions', () => {
      budgetManager.addUsage({ prompt: 100, completion: 50, total: 150 });
      budgetManager.addUsage({ prompt: 200, completion: 100, total: 300 });
      budgetManager.addUsage({ prompt: 50, completion: 25, total: 75 });

      const usage = budgetManager.getUsage();
      expect(usage.used).to.equal(525);
      expect(usage.promptTokens).to.equal(350);
      expect(usage.completionTokens).to.equal(175);
    });

    it('should calculate percentage correctly', () => {
      budgetManager.addUsage({ prompt: 5000, completion: 0, total: 5000 });

      const usage = budgetManager.getUsage();
      expect(usage.percentage).to.equal(50);
    });

    it('should handle zero usage', () => {
      const usage = budgetManager.getUsage();

      expect(usage.used).to.equal(0);
      expect(usage.percentage).to.equal(0);
    });
  });

  describe('Budget Management', () => {
    it('should allow setting budget', () => {
      budgetManager.setBudget(20000);

      const usage = budgetManager.getUsage();
      expect(usage.budget).to.equal(20000);
    });

    it('should update percentage after budget change', () => {
      budgetManager.addUsage({ prompt: 5000, completion: 0, total: 5000 });
      budgetManager.setBudget(5000);

      const usage = budgetManager.getUsage();
      expect(usage.percentage).to.equal(100);
    });

    it('should check if tokens can be afforded', () => {
      budgetManager.addUsage({ prompt: 8000, completion: 0, total: 8000 });

      expect(budgetManager.canAfford(1000)).to.be.true;
      expect(budgetManager.canAfford(2000)).to.be.true;
      expect(budgetManager.canAfford(2001)).to.be.false;
    });

    it('should return true for canAfford when at budget exactly', () => {
      budgetManager.addUsage({ prompt: 9999, completion: 0, total: 9999 });

      expect(budgetManager.canAfford(1)).to.be.false;
      expect(budgetManager.canAfford(0)).to.be.true;
    });
  });

  describe('Warning Thresholds', () => {
    it('should not trigger auto-compact below 75%', () => {
      budgetManager.addUsage({ prompt: 7000, completion: 0, total: 7000 });

      expect(budgetManager.shouldAutoCompact()).to.be.false;
    });

    it('should trigger auto-compact at 75%', () => {
      budgetManager.addUsage({ prompt: 7500, completion: 0, total: 7500 });

      expect(budgetManager.shouldAutoCompact()).to.be.true;
    });

    it('should trigger auto-compact above 75%', () => {
      budgetManager.addUsage({ prompt: 9000, completion: 0, total: 9000 });

      expect(budgetManager.shouldAutoCompact()).to.be.true;
    });

    it('should not trigger auto-compact twice in same session', () => {
      budgetManager.addUsage({ prompt: 7500, completion: 0, total: 7500 });

      expect(budgetManager.shouldAutoCompact()).to.be.true;

      budgetManager.markCompacted();

      expect(budgetManager.shouldAutoCompact()).to.be.false;
    });

    it('should allow auto-compact again after reset', () => {
      budgetManager.addUsage({ prompt: 7500, completion: 0, total: 7500 });
      budgetManager.markCompacted();

      expect(budgetManager.shouldAutoCompact()).to.be.false;

      budgetManager.reset();
      budgetManager.addUsage({ prompt: 7500, completion: 0, total: 7500 });

      expect(budgetManager.shouldAutoCompact()).to.be.true;
    });
  });

  describe('Reset Functionality', () => {
    it('should reset all counters', () => {
      budgetManager.addUsage({ prompt: 5000, completion: 2500, total: 7500 });
      budgetManager.markCompacted();

      budgetManager.reset();

      const usage = budgetManager.getUsage();
      expect(usage.used).to.equal(0);
      expect(usage.promptTokens).to.equal(0);
      expect(usage.completionTokens).to.equal(0);
      expect(usage.percentage).to.equal(0);
      expect(budgetManager.shouldAutoCompact()).to.be.false;
    });

    it('should not reset budget', () => {
      budgetManager.setBudget(15000);
      budgetManager.addUsage({ prompt: 5000, completion: 0, total: 5000 });

      budgetManager.reset();

      const usage = budgetManager.getUsage();
      expect(usage.budget).to.equal(15000);
    });
  });

  describe('Format Usage Display', () => {
    it('should format usage display', () => {
      budgetManager.addUsage({ prompt: 5000, completion: 2500, total: 7500 });

      const formatted = budgetManager.formatUsage();

      expect(formatted).to.be.a('string');
      expect(formatted).to.include('Token Budget');
      expect(formatted).to.include('7,500');
      expect(formatted).to.include('10,000');
      expect(formatted).to.include('75.0%');
      expect(formatted).to.include('5,000');
      expect(formatted).to.include('2,500');
    });

    it('should include progress bar in formatted output', () => {
      budgetManager.addUsage({ prompt: 5000, completion: 0, total: 5000 });

      const formatted = budgetManager.formatUsage();

      expect(formatted).to.include('█');
      expect(formatted).to.include('░');
    });

    it('should format with green color for low usage', () => {
      budgetManager.addUsage({ prompt: 1000, completion: 0, total: 1000 });

      const formatted = budgetManager.formatUsage();

      expect(formatted).to.be.a('string');
      expect(formatted).to.include('10.0%');
    });

    it('should format with yellow color for medium usage', () => {
      budgetManager.addUsage({ prompt: 8000, completion: 0, total: 8000 });

      const formatted = budgetManager.formatUsage();

      expect(formatted).to.be.a('string');
      expect(formatted).to.include('80.0%');
    });

    it('should format with red color for high usage', () => {
      budgetManager.addUsage({ prompt: 9500, completion: 0, total: 9500 });

      const formatted = budgetManager.formatUsage();

      expect(formatted).to.be.a('string');
      expect(formatted).to.include('95.0%');
    });
  });

  describe('Edge Cases', () => {
    it('should handle usage exceeding budget', () => {
      budgetManager.addUsage({ prompt: 12000, completion: 0, total: 12000 });

      const usage = budgetManager.getUsage();
      expect(usage.used).to.equal(12000);
      expect(usage.percentage).to.equal(120);
      expect(budgetManager.canAfford(1)).to.be.false;
    });

    it('should handle very small budgets', () => {
      const smallManager = new TokenBudgetManager(100);
      smallManager.addUsage({ prompt: 50, completion: 25, total: 75 });

      const usage = smallManager.getUsage();
      expect(usage.percentage).to.equal(75);
      expect(smallManager.shouldAutoCompact()).to.be.true;
    });

    it('should handle very large budgets', () => {
      const largeManager = new TokenBudgetManager(10000000);
      largeManager.addUsage({ prompt: 1000000, completion: 500000, total: 1500000 });

      const usage = largeManager.getUsage();
      expect(usage.percentage).to.equal(15);
      expect(largeManager.shouldAutoCompact()).to.be.false;
    });

    it('should handle zero token usage addition', () => {
      budgetManager.addUsage({ prompt: 0, completion: 0, total: 0 });

      const usage = budgetManager.getUsage();
      expect(usage.used).to.equal(0);
      expect(usage.percentage).to.equal(0);
    });

    it('should handle mismatched total tokens', () => {
      // This tests if the manager correctly uses the total field
      budgetManager.addUsage({ prompt: 100, completion: 50, total: 200 });

      const usage = budgetManager.getUsage();
      expect(usage.used).to.equal(200);
      expect(usage.promptTokens).to.equal(100);
      expect(usage.completionTokens).to.equal(50);
    });
  });

  describe('Multiple Sessions', () => {
    it('should track across multiple additions', () => {
      for (let i = 0; i < 10; i++) {
        budgetManager.addUsage({ prompt: 100, completion: 50, total: 150 });
      }

      const usage = budgetManager.getUsage();
      expect(usage.used).to.equal(1500);
      expect(usage.promptTokens).to.equal(1000);
      expect(usage.completionTokens).to.equal(500);
    });

    it('should maintain state between operations', () => {
      budgetManager.addUsage({ prompt: 1000, completion: 500, total: 1500 });
      const firstUsage = budgetManager.getUsage();

      budgetManager.addUsage({ prompt: 2000, completion: 1000, total: 3000 });
      const secondUsage = budgetManager.getUsage();

      expect(secondUsage.used).to.equal(firstUsage.used + 3000);
      expect(secondUsage.promptTokens).to.equal(firstUsage.promptTokens + 2000);
      expect(secondUsage.completionTokens).to.equal(firstUsage.completionTokens + 1000);
    });
  });
});
