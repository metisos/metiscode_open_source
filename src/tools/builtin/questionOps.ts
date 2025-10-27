import { RegisteredTool, ToolHandler, ExecutionContext, ToolResult } from "../registry";
import { QuestionPrompt, Question } from "../../cli/questionPrompt";

const askUserQuestionHandler: ToolHandler = {
  async execute(params: {
    questions: Question[];
  }, context: ExecutionContext): Promise<ToolResult> {

    const { questions } = params;

    if (!questions || questions.length === 0) {
      return {
        success: false,
        error: "At least one question is required"
      };
    }

    if (questions.length > 4) {
      return {
        success: false,
        error: "Maximum 4 questions allowed"
      };
    }

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];

      if (!q.question || typeof q.question !== 'string') {
        return {
          success: false,
          error: `Question ${i + 1}: question field is required and must be a string`
        };
      }

      if (!q.header || typeof q.header !== 'string') {
        return {
          success: false,
          error: `Question ${i + 1}: header field is required and must be a string`
        };
      }

      if (q.header.length > 12) {
        return {
          success: false,
          error: `Question ${i + 1}: header must be max 12 characters (current: ${q.header.length})`
        };
      }

      if (!q.options || !Array.isArray(q.options)) {
        return {
          success: false,
          error: `Question ${i + 1}: options must be an array`
        };
      }

      if (q.options.length < 2 || q.options.length > 4) {
        return {
          success: false,
          error: `Question ${i + 1}: must have 2-4 options (current: ${q.options.length})`
        };
      }

      for (let j = 0; j < q.options.length; j++) {
        const opt = q.options[j];
        if (!opt.label || typeof opt.label !== 'string') {
          return {
            success: false,
            error: `Question ${i + 1}, option ${j + 1}: label is required and must be a string`
          };
        }
        if (!opt.description || typeof opt.description !== 'string') {
          return {
            success: false,
            error: `Question ${i + 1}, option ${j + 1}: description is required and must be a string`
          };
        }
      }

      if (typeof q.multiSelect !== 'boolean') {
        return {
          success: false,
          error: `Question ${i + 1}: multiSelect must be a boolean`
        };
      }
    }

    if (process.env.METIS_HEADLESS === 'true' || process.env.CI === 'true') {
      return {
        success: false,
        error: "Cannot ask questions in headless mode. Questions require user interaction. Either run in interactive mode or provide defaults."
      };
    }

    try {
      const prompter = new QuestionPrompt();
      const answers = await prompter.askQuestions(questions);

      const formattedAnswers: Record<string, any> = {};
      for (const [key, value] of Object.entries(answers)) {
        if (Array.isArray(value)) {
          formattedAnswers[key] = value.join(', ');
        } else {
          formattedAnswers[key] = value;
        }
      }

      return {
        success: true,
        content: `User provided answers: ${JSON.stringify(formattedAnswers, null, 2)}`,
        metadata: {
          answers,
          question_count: questions.length
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to prompt user: ${error.message}`
      };
    }
  }
};

export const askUserQuestionTool: RegisteredTool = {
  name: "ask_user_question",
  description: "Ask structured questions to gather user preferences or decisions during execution",
  schema: {
    type: "object",
    properties: {
      questions: {
        type: "array",
        description: "Questions to ask the user (1-4 questions)",
        items: {
          type: "object",
          properties: {
            question: {
              type: "string",
              description: "The complete question to ask. Should be clear and specific, ending with a question mark."
            },
            header: {
              type: "string",
              description: "Short label displayed as a chip/tag (max 12 chars). Examples: 'Auth method', 'Library', 'Approach'"
            },
            options: {
              type: "array",
              description: "Available choices (2-4 options). Each option should be distinct and mutually exclusive unless multiSelect is true.",
              items: {
                type: "object",
                properties: {
                  label: {
                    type: "string",
                    description: "The display text for this option (1-5 words). Should be concise and clearly describe the choice."
                  },
                  description: {
                    type: "string",
                    description: "Explanation of what this option means or what will happen if chosen. Useful for providing context about trade-offs or implications."
                  }
                },
                required: ["label", "description"]
              },
              minItems: 2,
              maxItems: 4
            },
            multiSelect: {
              type: "boolean",
              description: "Set to true to allow multiple selections. Use when choices are not mutually exclusive."
            }
          },
          required: ["question", "header", "options", "multiSelect"]
        },
        minItems: 1,
        maxItems: 4
      }
    },
    required: ["questions"]
  },
  safety: {
    require_approval: false,
    network_access: false,
    max_execution_time: 120000,
    allowed_in_ci: false
  },
  handler: askUserQuestionHandler,
  metadata: {
    category: "user_interaction",
    version: "1.0",
    author: "metis-team"
  }
};
