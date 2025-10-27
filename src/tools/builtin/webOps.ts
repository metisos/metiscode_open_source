import { RegisteredTool, ToolHandler, ExecutionContext, ToolResult } from "../registry";

// Web Fetch Tool - equivalent to Claude Code's WebFetch
const webFetchHandler: ToolHandler = {
  async execute(params: { url: string; prompt: string }, context: ExecutionContext): Promise<ToolResult> {
    const { url, prompt } = params;

    try {
      // Simple fetch implementation
      const response = await fetch(url);
      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`
        };
      }

      const content = await response.text();

      // Basic HTML to text conversion
      const textContent = content
        .replace(/<script[^>]*>.*?<\/script>/gis, '')
        .replace(/<style[^>]*>.*?<\/style>/gis, '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      return {
        success: true,
        content: textContent.substring(0, 10000), // Limit to prevent token overflow
        metadata: {
          url,
          status: response.status,
          contentType: response.headers.get('content-type'),
          size: textContent.length
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to fetch URL: ${error.message}`
      };
    }
  }
};

export const webFetchTool: RegisteredTool = {
  name: "web_fetch",
  description: "Fetch content from a URL and extract text",
  schema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "URL to fetch content from"
      },
      prompt: {
        type: "string",
        description: "Description of what information to extract"
      }
    },
    required: ["url", "prompt"]
  },
  safety: {
    require_approval: true,
    network_access: true,
    max_execution_time: 10000,
    allowed_in_ci: false
  },
  handler: webFetchHandler,
  metadata: {
    category: "web_operations",
    version: "1.0",
    author: "metis-team"
  }
};