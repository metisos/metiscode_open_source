import inquirer from 'inquirer';
import kleur from 'kleur';

export interface QuestionOption {
  label: string;
  description: string;
}

export interface Question {
  question: string;
  header: string;
  options: QuestionOption[];
  multiSelect: boolean;
}

export class QuestionPrompt {
  async askQuestions(questions: Question[]): Promise<Record<string, string | string[]>> {
    const answers: Record<string, string | string[]> = {};

    for (const q of questions) {
      console.log(`\n${kleur.cyan(q.question)}\n`);

      const choices = q.options.map(opt => ({
        name: `${kleur.yellow(opt.label)} - ${kleur.gray(opt.description)}`,
        value: opt.label,
        short: opt.label
      }));

      choices.push({
        name: kleur.gray('Other (enter custom text)'),
        value: '__OTHER__',
        short: 'Other'
      });

      const promptConfig = q.multiSelect
        ? {
            type: 'checkbox' as const,
            name: 'answer',
            message: q.header,
            choices
          }
        : {
            type: 'list' as const,
            name: 'answer',
            message: q.header,
            choices
          };

      const result = await inquirer.prompt([promptConfig]);

      if (result.answer === '__OTHER__' ||
          (Array.isArray(result.answer) && result.answer.includes('__OTHER__'))) {
        const customAnswer = await inquirer.prompt([{
          type: 'input',
          name: 'custom',
          message: 'Enter your answer:'
        }]);

        if (Array.isArray(result.answer)) {
          result.answer = result.answer
            .filter((a: string) => a !== '__OTHER__')
            .concat(customAnswer.custom);
        } else {
          result.answer = customAnswer.custom;
        }
      }

      answers[q.header] = result.answer;
    }

    return answers;
  }

  async askSingleQuestion(
    question: string,
    options: QuestionOption[],
    multiSelect: boolean = false
  ): Promise<string | string[]> {
    const result = await this.askQuestions([{
      question,
      header: question.substring(0, 12),
      options,
      multiSelect
    }]);

    const key = Object.keys(result)[0];
    return result[key];
  }
}

export function createQuestionPrompt(): QuestionPrompt {
  return new QuestionPrompt();
}
