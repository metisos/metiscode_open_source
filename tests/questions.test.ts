import { expect } from 'chai';
import { askUserQuestionTool } from '../src/tools/builtin/questionOps';
import { ExecutionContext } from '../src/tools/registry';

const mockContext: ExecutionContext = {
  workingDirectory: process.cwd(),
  verbose: false
};

describe('Ask User Question Tool', () => {
  describe('Validation', () => {
    it('should require at least one question', async () => {
      const result = await askUserQuestionTool.handler.execute(
        { questions: [] },
        mockContext
      );

      expect(result.success).to.be.false;
      expect(result.error).to.contain('At least one question is required');
    });

    it('should reject more than 4 questions', async () => {
      const questions = Array(5).fill({
        question: "Test question?",
        header: "Test",
        options: [
          { label: "A", description: "Option A" },
          { label: "B", description: "Option B" }
        ],
        multiSelect: false
      });

      const result = await askUserQuestionTool.handler.execute(
        { questions },
        mockContext
      );

      expect(result.success).to.be.false;
      expect(result.error).to.contain('Maximum 4 questions');
    });

    it('should reject questions with headers longer than 12 characters', async () => {
      const result = await askUserQuestionTool.handler.execute(
        {
          questions: [{
            question: "What do you want?",
            header: "This is too long",
            options: [
              { label: "A", description: "Option A" },
              { label: "B", description: "Option B" }
            ],
            multiSelect: false
          }]
        },
        mockContext
      );

      expect(result.success).to.be.false;
      expect(result.error).to.contain('max 12 characters');
    });

    it('should reject questions with fewer than 2 options', async () => {
      const result = await askUserQuestionTool.handler.execute(
        {
          questions: [{
            question: "Choose one?",
            header: "Choice",
            options: [
              { label: "Only option", description: "The only option" }
            ],
            multiSelect: false
          }]
        },
        mockContext
      );

      expect(result.success).to.be.false;
      expect(result.error).to.contain('2-4 options');
    });

    it('should reject questions with more than 4 options', async () => {
      const result = await askUserQuestionTool.handler.execute(
        {
          questions: [{
            question: "Choose one?",
            header: "Choice",
            options: [
              { label: "A", description: "Option A" },
              { label: "B", description: "Option B" },
              { label: "C", description: "Option C" },
              { label: "D", description: "Option D" },
              { label: "E", description: "Option E" }
            ],
            multiSelect: false
          }]
        },
        mockContext
      );

      expect(result.success).to.be.false;
      expect(result.error).to.contain('2-4 options');
    });

    it('should require question field', async () => {
      const result = await askUserQuestionTool.handler.execute(
        {
          questions: [{
            header: "Test",
            options: [
              { label: "A", description: "Option A" },
              { label: "B", description: "Option B" }
            ],
            multiSelect: false
          } as any]
        },
        mockContext
      );

      expect(result.success).to.be.false;
      expect(result.error).to.contain('question field is required');
    });

    it('should require header field', async () => {
      const result = await askUserQuestionTool.handler.execute(
        {
          questions: [{
            question: "What?",
            options: [
              { label: "A", description: "Option A" },
              { label: "B", description: "Option B" }
            ],
            multiSelect: false
          } as any]
        },
        mockContext
      );

      expect(result.success).to.be.false;
      expect(result.error).to.contain('header field is required');
    });

    it('should require options to be an array', async () => {
      const result = await askUserQuestionTool.handler.execute(
        {
          questions: [{
            question: "What?",
            header: "Test",
            options: "not an array" as any,
            multiSelect: false
          }]
        },
        mockContext
      );

      expect(result.success).to.be.false;
      expect(result.error).to.contain('options must be an array');
    });

    it('should require label in options', async () => {
      const result = await askUserQuestionTool.handler.execute(
        {
          questions: [{
            question: "What?",
            header: "Test",
            options: [
              { description: "Option A" } as any,
              { label: "B", description: "Option B" }
            ],
            multiSelect: false
          }]
        },
        mockContext
      );

      expect(result.success).to.be.false;
      expect(result.error).to.contain('label is required');
    });

    it('should require description in options', async () => {
      const result = await askUserQuestionTool.handler.execute(
        {
          questions: [{
            question: "What?",
            header: "Test",
            options: [
              { label: "A" } as any,
              { label: "B", description: "Option B" }
            ],
            multiSelect: false
          }]
        },
        mockContext
      );

      expect(result.success).to.be.false;
      expect(result.error).to.contain('description is required');
    });

    it('should require multiSelect to be boolean', async () => {
      const result = await askUserQuestionTool.handler.execute(
        {
          questions: [{
            question: "What?",
            header: "Test",
            options: [
              { label: "A", description: "Option A" },
              { label: "B", description: "Option B" }
            ],
            multiSelect: "yes" as any
          }]
        },
        mockContext
      );

      expect(result.success).to.be.false;
      expect(result.error).to.contain('multiSelect must be a boolean');
    });

    it('should accept valid question structure', async () => {
      const oldEnv = process.env.METIS_HEADLESS;
      process.env.METIS_HEADLESS = 'true';

      const result = await askUserQuestionTool.handler.execute(
        {
          questions: [{
            question: "Which framework?",
            header: "Framework",
            options: [
              { label: "React", description: "Component-based UI library" },
              { label: "Vue", description: "Progressive framework" }
            ],
            multiSelect: false
          }]
        },
        mockContext
      );

      process.env.METIS_HEADLESS = oldEnv;

      expect(result.error).to.contain('headless mode');
    });
  });

  describe('Headless Mode', () => {
    it('should error in headless mode', async () => {
      const oldEnv = process.env.METIS_HEADLESS;
      process.env.METIS_HEADLESS = 'true';

      const result = await askUserQuestionTool.handler.execute(
        {
          questions: [{
            question: "Choose one?",
            header: "Choice",
            options: [
              { label: "A", description: "Option A" },
              { label: "B", description: "Option B" }
            ],
            multiSelect: false
          }]
        },
        mockContext
      );

      process.env.METIS_HEADLESS = oldEnv;

      expect(result.success).to.be.false;
      expect(result.error).to.contain('headless mode');
    });

    it('should error in CI mode', async () => {
      const oldEnv = process.env.CI;
      process.env.CI = 'true';

      const result = await askUserQuestionTool.handler.execute(
        {
          questions: [{
            question: "Choose one?",
            header: "Choice",
            options: [
              { label: "A", description: "Option A" },
              { label: "B", description: "Option B" }
            ],
            multiSelect: false
          }]
        },
        mockContext
      );

      process.env.CI = oldEnv;

      expect(result.success).to.be.false;
      expect(result.error).to.contain('headless mode');
    });
  });

  describe('Tool Schema', () => {
    it('should have correct tool name', () => {
      expect(askUserQuestionTool.name).to.equal('ask_user_question');
    });

    it('should have description', () => {
      expect(askUserQuestionTool.description).to.be.a('string');
      expect(askUserQuestionTool.description.length).to.be.greaterThan(0);
    });

    it('should require questions parameter', () => {
      expect(askUserQuestionTool.schema.required).to.include('questions');
    });

    it('should have proper safety settings', () => {
      expect(askUserQuestionTool.safety.require_approval).to.be.false;
      expect(askUserQuestionTool.safety.network_access).to.be.false;
      expect(askUserQuestionTool.safety.allowed_in_ci).to.be.false;
    });

    it('should have metadata', () => {
      expect(askUserQuestionTool.metadata).to.exist;
      expect(askUserQuestionTool.metadata.category).to.equal('user_interaction');
    });
  });

  describe('Question Structure Validation', () => {
    it('should validate multiple questions', async () => {
      const oldEnv = process.env.METIS_HEADLESS;
      process.env.METIS_HEADLESS = 'true';

      const result = await askUserQuestionTool.handler.execute(
        {
          questions: [
            {
              question: "Which framework?",
              header: "Framework",
              options: [
                { label: "React", description: "Component library" },
                { label: "Vue", description: "Progressive framework" }
              ],
              multiSelect: false
            },
            {
              question: "Which language?",
              header: "Language",
              options: [
                { label: "TypeScript", description: "Typed JavaScript" },
                { label: "JavaScript", description: "Dynamic scripting" }
              ],
              multiSelect: false
            }
          ]
        },
        mockContext
      );

      process.env.METIS_HEADLESS = oldEnv;

      expect(result.error).to.contain('headless mode');
    });

    it('should validate multiSelect questions', async () => {
      const oldEnv = process.env.METIS_HEADLESS;
      process.env.METIS_HEADLESS = 'true';

      const result = await askUserQuestionTool.handler.execute(
        {
          questions: [{
            question: "Which features do you want?",
            header: "Features",
            options: [
              { label: "Auth", description: "User authentication" },
              { label: "DB", description: "Database integration" },
              { label: "API", description: "REST API" }
            ],
            multiSelect: true
          }]
        },
        mockContext
      );

      process.env.METIS_HEADLESS = oldEnv;

      expect(result.error).to.contain('headless mode');
    });

    it('should provide detailed error for invalid question index', async () => {
      const result = await askUserQuestionTool.handler.execute(
        {
          questions: [
            {
              question: "Valid question?",
              header: "Valid",
              options: [
                { label: "A", description: "Option A" },
                { label: "B", description: "Option B" }
              ],
              multiSelect: false
            },
            {
              question: "Invalid question?",
              header: "This header is way too long",
              options: [
                { label: "A", description: "Option A" },
                { label: "B", description: "Option B" }
              ],
              multiSelect: false
            }
          ]
        },
        mockContext
      );

      expect(result.success).to.be.false;
      expect(result.error).to.contain('Question 2');
      expect(result.error).to.contain('max 12 characters');
    });
  });
});
