import inquirer from 'inquirer';
import kleur from 'kleur';

export interface DropdownChoice<T = any> {
  name: string;
  value: T;
  short?: string;
}

export interface DropdownOptions<T = any> {
  message: string;
  choices: DropdownChoice<T>[];
  pageSize?: number;
  defaultValue?: T;
}

export interface CheckboxChoice<T = any> {
  name: string;
  value: T;
  checked?: boolean;
  disabled?: boolean | string;
}

export interface CheckboxOptions<T = any> {
  message: string;
  choices: CheckboxChoice<T>[];
  pageSize?: number;
  validate?: (answers: T[]) => boolean | string;
}

export class DropdownHelpers {
  /**
   * Show a single-selection dropdown menu
   */
  static async selectOne<T>(options: DropdownOptions<T>): Promise<T> {
    const { selection } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selection',
        message: options.message,
        choices: options.choices,
        pageSize: options.pageSize || 10,
        default: options.defaultValue
      }
    ]);

    return selection;
  }

  /**
   * Show a multi-selection checkbox menu
   */
  static async selectMultiple<T>(options: CheckboxOptions<T>): Promise<T[]> {
    const { selections } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'selections',
        message: options.message,
        choices: options.choices,
        pageSize: options.pageSize || 10,
        validate: options.validate
      }
    ]);

    return selections;
  }

  /**
   * Prompt for text input with validation
   */
  static async inputText(options: {
    message: string;
    default?: string;
    validate?: (input: string) => boolean | string;
    filter?: (input: string) => string;
  }): Promise<string> {
    const { input } = await inquirer.prompt([
      {
        type: 'input',
        name: 'input',
        message: options.message,
        default: options.default,
        validate: options.validate,
        filter: options.filter
      }
    ]);

    return input;
  }

  /**
   * Show a confirmation prompt
   */
  static async confirm(message: string, defaultValue = false): Promise<boolean> {
    const { confirmed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmed',
        message,
        default: defaultValue
      }
    ]);

    return confirmed;
  }

  /**
   * Show an expandable choices menu (good for commands with many options)
   */
  static async expand<T>(options: {
    message: string;
    choices: Array<{
      key: string;
      name: string;
      value: T;
    }>;
    default?: string;
  }): Promise<T> {
    const { selection } = await inquirer.prompt([
      {
        type: 'expand',
        name: 'selection',
        message: options.message,
        choices: options.choices,
        default: options.default
      }
    ]);

    return selection;
  }

  /**
   * Create formatted choices for common patterns
   */
  static createChoices<T>(items: T[], formatter: (item: T) => { name: string; value: T; short?: string }): DropdownChoice<T>[] {
    return items.map(formatter);
  }

  /**
   * Create choices with icons/emojis for better UX
   */
  static createIconChoices<T>(items: Array<{ item: T; icon: string; name: string; description?: string }>): DropdownChoice<T>[] {
    return items.map(({ item, icon, name, description }) => ({
      name: `${icon} ${name}${description ? kleur.gray(` - ${description}`) : ''}`,
      value: item,
      short: name
    }));
  }

  /**
   * Create choices with status indicators
   */
  static createStatusChoices<T>(items: Array<{ item: T; name: string; status: 'active' | 'inactive' | 'error' | 'warning'; description?: string }>): DropdownChoice<T>[] {
    const statusIcons = {
      active: '✅',
      inactive: '⚪',
      error: '❌',
      warning: '⚠️'
    };

    const statusColors = {
      active: kleur.green,
      inactive: kleur.gray,
      error: kleur.red,
      warning: kleur.yellow
    };

    return items.map(({ item, name, status, description }) => ({
      name: `${statusIcons[status]} ${statusColors[status](name)}${description ? kleur.gray(` - ${description}`) : ''}`,
      value: item,
      short: name
    }));
  }

  /**
   * Handle common error scenarios with user-friendly messages
   */
  static handleError(error: any, context: string): void {
    if (error.isTtyError) {
      console.error(kleur.red(`❌ ${context} requires an interactive terminal`));
      console.error(kleur.gray('Try using command-line arguments instead'));
    } else {
      console.error(kleur.red(`❌ Error in ${context}:`), error.message);
    }
  }

  /**
   * Show a separator with title
   */
  static separator(title?: string): inquirer.SeparatorOptions {
    return new inquirer.Separator(title ? kleur.gray(`─── ${title} ───`) : undefined);
  }

  /**
   * Create a "Back" or "Cancel" choice
   */
  static backChoice<T>(value: T, label = 'Back'): DropdownChoice<T> {
    return {
      name: kleur.gray(`← ${label}`),
      value,
      short: label
    };
  }

  /**
   * Create an "Exit" choice
   */
  static exitChoice<T>(value: T): DropdownChoice<T> {
    return {
      name: kleur.red('🚪 Exit'),
      value,
      short: 'Exit'
    };
  }
}