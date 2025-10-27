import { describe, it, expect, vi, beforeEach } from "vitest";
import { MetisError } from "../src/errors/MetisError";
import { ErrorHandler } from "../src/errors/errorHandler";

describe("MetisError", () => {
  it("should create structured errors with suggestions", () => {
    const error = MetisError.apiKeyMissing("openai");
    
    expect(error.code).toBe("API_KEY_MISSING");
    expect(error.category).toBe("config");
    expect(error.recoverable).toBe(true);
    expect(error.suggestions).toContain('Run "metiscode auth set --provider openai --key YOUR_API_KEY"');
  });

  it("should format user-friendly error messages", () => {
    const error = MetisError.fileNotFound("missing.txt");
    const formatted = error.toUserFriendlyString();
    
    expect(formatted).toContain("❌ File not found: missing.txt");
    expect(formatted).toContain("Suggestions:");
    expect(formatted).toContain("Check that the file path is correct");
  });

  it("should create task complexity errors", () => {
    const error = MetisError.taskTooComplex();
    
    expect(error.code).toBe("TASK_TOO_COMPLEX");
    expect(error.suggestions).toContain("Break your task into smaller, more specific steps");
  });
});

describe("ErrorHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock process.exit to prevent test termination
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it("should convert network errors to structured errors", async () => {
    const networkError = new Error("fetch failed");
    
    try {
      ErrorHandler.handle(networkError);
    } catch {
      // Expected to exit
    }
    
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("API request failed")
    );
  });

  it("should handle retry logic for recoverable errors", async () => {
    let attempts = 0;
    const operation = vi.fn(() => {
      attempts++;
      if (attempts < 2) {
        throw new Error("timeout");
      }
      return Promise.resolve("success");
    });

    const result = await ErrorHandler.withRecovery(operation, 2);
    expect(result).toBe("success");
    expect(attempts).toBe(2);
  });

  it("should not retry non-recoverable errors", async () => {
    let attempts = 0;
    const operation = vi.fn(() => {
      attempts++;
      throw MetisError.unsupportedProvider("invalid");
    });

    try {
      await ErrorHandler.withRecovery(operation, 2);
    } catch {
      // Expected to fail
    }
    
    expect(attempts).toBe(1);
  });
});