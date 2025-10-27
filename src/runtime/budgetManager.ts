import kleur from 'kleur';

export interface TokenUsage {
  prompt: number;
  completion: number;
  total: number;
}

export interface BudgetStats {
  used: number;
  budget: number;
  percentage: number;
  promptTokens: number;
  completionTokens: number;
}

export class TokenBudgetManager {
  private budget: number;
  private used: number = 0;
  private promptTokens: number = 0;
  private completionTokens: number = 0;
  private warningThresholds = [75, 90];
  private warnedAt: Set<number> = new Set();
  private compactedThisSession: boolean = false;

  constructor(budget: number = 200000) {
    this.budget = budget;
  }

  setBudget(budget: number): void {
    this.budget = budget;
  }

  addUsage(usage: TokenUsage): void {
    this.used += usage.total;
    this.promptTokens += usage.prompt;
    this.completionTokens += usage.completion;

    this.checkThresholds();
  }

  private checkThresholds(): void {
    const percentage = this.getPercentage();

    for (const threshold of this.warningThresholds) {
      if (percentage >= threshold && !this.warnedAt.has(threshold)) {
        this.warnedAt.add(threshold);
        this.emitWarning(threshold, percentage);
      }
    }
  }

  private emitWarning(threshold: number, actual: number): void {
    if (threshold >= 90) {
      console.warn(kleur.red(`\nToken budget at ${actual.toFixed(1)}%`));
      console.warn(kleur.red('Consider running /compact to compress history\n'));
    } else if (threshold >= 75) {
      console.warn(kleur.yellow(`\nToken budget at ${actual.toFixed(1)}%\n`));
    }
  }

  getUsage(): BudgetStats {
    return {
      used: this.used,
      budget: this.budget,
      percentage: this.getPercentage(),
      promptTokens: this.promptTokens,
      completionTokens: this.completionTokens
    };
  }

  private getPercentage(): number {
    return (this.used / this.budget) * 100;
  }

  canAfford(estimatedTokens: number): boolean {
    return (this.used + estimatedTokens) < this.budget;
  }

  shouldAutoCompact(): boolean {
    const percentage = this.getPercentage();
    return percentage >= 75 && !this.compactedThisSession;
  }

  markCompacted(): void {
    this.compactedThisSession = true;
  }

  reset(): void {
    this.used = 0;
    this.promptTokens = 0;
    this.completionTokens = 0;
    this.warnedAt.clear();
    this.compactedThisSession = false;
  }

  formatUsage(): string {
    const stats = this.getUsage();

    let output = '';
    output += kleur.cyan('\nToken Budget\n\n');
    output += `  Used: ${kleur.yellow(stats.used.toLocaleString())} tokens\n`;
    output += `  Budget: ${kleur.gray(stats.budget.toLocaleString())} tokens\n`;
    output += `  Percentage: ${this.formatPercentage(stats.percentage)}\n`;

    const barLength = 30;
    const filled = Math.floor((stats.percentage / 100) * barLength);
    const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);
    output += `  [${this.colorBar(bar, stats.percentage)}]\n`;

    output += `\n  Prompt tokens: ${stats.promptTokens.toLocaleString()}\n`;
    output += `  Completion tokens: ${stats.completionTokens.toLocaleString()}\n`;

    return output;
  }

  private formatPercentage(pct: number): string {
    if (pct >= 90) return kleur.red(`${pct.toFixed(1)}%`);
    if (pct >= 75) return kleur.yellow(`${pct.toFixed(1)}%`);
    return kleur.green(`${pct.toFixed(1)}%`);
  }

  private colorBar(bar: string, percentage: number): string {
    if (percentage >= 90) return kleur.red(bar);
    if (percentage >= 75) return kleur.yellow(bar);
    return kleur.green(bar);
  }
}
