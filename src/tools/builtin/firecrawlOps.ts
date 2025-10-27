import { RegisteredTool, ToolHandler, ExecutionContext, ToolResult } from "../registry";

// Firecrawl Web Scraping Tool
const firecrawlScrapeHandler: ToolHandler = {
  async execute(
    params: {
      url: string;
      formats?: Array<'markdown' | 'html' | 'rawHtml' | 'links' | 'screenshot' | 'screenshot@fullPage' | 'extract' | 'json' | 'summary'>;
      onlyMainContent?: boolean;
      includeTags?: string[];
      excludeTags?: string[];
      headers?: Record<string, string>;
      waitFor?: number;
      timeout?: number;
    },
    context: ExecutionContext
  ): Promise<ToolResult> {
    const {
      url,
      formats = ['markdown', 'links'],
      onlyMainContent = true,
      includeTags,
      excludeTags,
      headers,
      waitFor = 0,
      timeout = 30000
    } = params;

    if (!url || !url.startsWith('http')) {
      return {
        success: false,
        error: "Invalid URL. Must start with http:// or https://"
      };
    }

    try {
      // Get API key from environment or config
      const apiKey = process.env.FIRECRAWL_API_KEY ||
                     context.config?.secrets?.firecrawl_api_key ||
                     context.config?.firecrawl?.api_key;

      if (!apiKey) {
        return {
          success: false,
          error: "Firecrawl API key not configured. Set FIRECRAWL_API_KEY environment variable or add to config"
        };
      }

      const { default: fetch } = await import('node-fetch');

      // Prepare request body
      const requestBody: any = {
        url,
        formats,
        onlyMainContent,
        waitFor,
        timeout
      };

      if (includeTags?.length) {
        requestBody.includeTags = includeTags;
      }

      if (excludeTags?.length) {
        requestBody.excludeTags = excludeTags;
      }

      if (headers && Object.keys(headers).length > 0) {
        requestBody.headers = headers;
      }

      // Make request to Firecrawl API
      const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody),
        timeout: timeout + 5000 // Add buffer to API timeout
      });

      if (!response.ok) {
        const errorData = await response.text();
        return {
          success: false,
          error: `Firecrawl API error (${response.status}): ${errorData}`
        };
      }

      const data = await response.json() as any;

      if (!data.success) {
        return {
          success: false,
          error: data.error || "Firecrawl scraping failed"
        };
      }

      // Process and format the response
      const result = data.data;
      let content = '';

      // Format content based on what was returned
      if (result.markdown) {
        content += `## Markdown Content\n\n${result.markdown}\n\n`;
      }

      if (result.summary) {
        content += `## Summary\n\n${result.summary}\n\n`;
      }

      if (result.html && formats.includes('html')) {
        content += `## HTML (truncated)\n\n${result.html.substring(0, 1000)}...\n\n`;
      }

      if (result.extract) {
        content += `## Extracted Data\n\n${JSON.stringify(result.extract, null, 2)}\n\n`;
      }

      if (result.links && result.links.length > 0) {
        content += `## Links Found (${result.links.length})\n\n`;
        result.links.slice(0, 20).forEach((link: any) => {
          content += `- [${link.text || 'No text'}](${link.href})\n`;
        });
        if (result.links.length > 20) {
          content += `\n... and ${result.links.length - 20} more links\n`;
        }
      }

      if (result.metadata) {
        content += `\n## Page Metadata\n`;
        content += `- Title: ${result.metadata.title || 'N/A'}\n`;
        content += `- Description: ${result.metadata.description || 'N/A'}\n`;
        content += `- Author: ${result.metadata.author || 'N/A'}\n`;
        content += `- Language: ${result.metadata.language || 'N/A'}\n`;
        if (result.metadata.keywords) {
          content += `- Keywords: ${result.metadata.keywords}\n`;
        }
      }

      return {
        success: true,
        content: content.trim(),
        metadata: {
          url,
          title: result.metadata?.title,
          description: result.metadata?.description,
          author: result.metadata?.author,
          language: result.metadata?.language,
          links_count: result.links?.length || 0,
          content_length: result.content?.length || 0,
          formats_returned: Object.keys(result).filter(k => formats.includes(k as any))
        }
      };

    } catch (error: any) {
      return {
        success: false,
        error: `Scraping failed: ${error.message}`
      };
    }
  }
};

// Firecrawl Crawl Tool (for crawling entire sites)
const firecrawlCrawlHandler: ToolHandler = {
  async execute(
    params: {
      url: string;
      maxDepth?: number;
      limit?: number;
      allowBackwardLinks?: boolean;
      allowExternalLinks?: boolean;
      ignoreSitemap?: boolean;
      excludePaths?: string[];
      includePaths?: string[];
      formats?: Array<'markdown' | 'html' | 'rawHtml' | 'links'>;
    },
    context: ExecutionContext
  ): Promise<ToolResult> {
    const {
      url,
      maxDepth = 2,
      limit = 10,
      allowBackwardLinks = false,
      allowExternalLinks = false,
      ignoreSitemap = false,
      excludePaths,
      includePaths,
      formats = ['markdown']
    } = params;

    if (!url || !url.startsWith('http')) {
      return {
        success: false,
        error: "Invalid URL. Must start with http:// or https://"
      };
    }

    try {
      // Get API key from environment or config
      const apiKey = process.env.FIRECRAWL_API_KEY ||
                     context.config?.secrets?.firecrawl_api_key ||
                     context.config?.firecrawl?.api_key;

      if (!apiKey) {
        return {
          success: false,
          error: "Firecrawl API key not configured. Set FIRECRAWL_API_KEY environment variable or add to config"
        };
      }

      const { default: fetch } = await import('node-fetch');

      // Prepare crawl request
      const requestBody: any = {
        url,
        maxDepth,
        limit,
        allowBackwardLinks,
        allowExternalLinks,
        ignoreSitemap,
        formats
      };

      if (excludePaths?.length) {
        requestBody.excludePaths = excludePaths;
      }

      if (includePaths?.length) {
        requestBody.includePaths = includePaths;
      }

      // Start crawl job
      const startResponse = await fetch('https://api.firecrawl.dev/v1/crawl', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody),
        timeout: 30000
      });

      if (!startResponse.ok) {
        const errorData = await startResponse.text();
        return {
          success: false,
          error: `Failed to start crawl (${startResponse.status}): ${errorData}`
        };
      }

      const startData = await startResponse.json() as any;

      if (!startData.success || !startData.id) {
        return {
          success: false,
          error: startData.error || "Failed to start crawl job"
        };
      }

      const jobId = startData.id;

      // Poll for results (max 60 seconds)
      const maxPollingTime = 60000;
      const pollInterval = 2000;
      const startTime = Date.now();

      while (Date.now() - startTime < maxPollingTime) {
        // Check job status
        const statusResponse = await fetch(`https://api.firecrawl.dev/v1/crawl/${jobId}`, {
          headers: {
            'Authorization': `Bearer ${apiKey}`
          },
          timeout: 10000
        });

        if (!statusResponse.ok) {
          return {
            success: false,
            error: `Failed to check crawl status: ${statusResponse.status}`
          };
        }

        const statusData = await statusResponse.json() as any;

        if (statusData.status === 'completed') {
          // Format results
          const results = statusData.data || [];
          let content = `# Crawl Results for ${url}\n\n`;
          content += `**Pages crawled:** ${results.length}\n`;
          content += `**Max depth:** ${maxDepth}\n\n`;

          results.forEach((page: any, index: number) => {
            content += `## Page ${index + 1}: ${page.metadata?.title || page.url}\n`;
            content += `**URL:** ${page.url}\n\n`;

            if (page.markdown) {
              const truncated = page.markdown.substring(0, 500);
              content += `${truncated}${page.markdown.length > 500 ? '...' : ''}\n\n`;
            } else if (page.content) {
              const truncated = page.content.substring(0, 500);
              content += `${truncated}${page.content.length > 500 ? '...' : ''}\n\n`;
            }

            content += `---\n\n`;
          });

          return {
            success: true,
            content,
            metadata: {
              job_id: jobId,
              pages_crawled: results.length,
              max_depth: maxDepth,
              base_url: url,
              urls: results.map((r: any) => r.url)
            }
          };
        } else if (statusData.status === 'failed') {
          return {
            success: false,
            error: statusData.error || "Crawl job failed"
          };
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }

      return {
        success: false,
        error: `Crawl job timed out after ${maxPollingTime / 1000} seconds. Job ID: ${jobId}`
      };

    } catch (error: any) {
      return {
        success: false,
        error: `Crawl failed: ${error.message}`
      };
    }
  }
};

export const firecrawlScrapeTool: RegisteredTool = {
  name: "firecrawl_scrape",
  description: "Advanced web scraping using Firecrawl - extracts clean content, markdown, links, and metadata from any webpage",
  schema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The URL to scrape"
      },
      formats: {
        type: "array",
        items: {
          type: "string",
          enum: ["markdown", "html", "rawHtml", "links", "screenshot", "screenshot@fullPage", "extract", "json", "summary"]
        },
        description: "Formats to return (default: markdown, links)",
        default: ["markdown", "links"]
      },
      onlyMainContent: {
        type: "boolean",
        description: "Extract only main content, removing headers/footers/ads",
        default: true
      },
      includeTags: {
        type: "array",
        items: { type: "string" },
        description: "CSS selectors to include (e.g., ['.main-content', 'article'])"
      },
      excludeTags: {
        type: "array",
        items: { type: "string" },
        description: "CSS selectors to exclude (e.g., ['.ads', '.sidebar'])"
      },
      headers: {
        type: "object",
        description: "Custom HTTP headers for the request"
      },
      waitFor: {
        type: "number",
        description: "Time to wait (ms) for page to load",
        default: 0
      },
      timeout: {
        type: "number",
        description: "Request timeout in milliseconds",
        default: 30000
      }
    },
    required: ["url"]
  },
  safety: {
    require_approval: false,
    network_access: true,
    max_execution_time: 60000,
    allowed_in_ci: false
  },
  handler: firecrawlScrapeHandler,
  metadata: {
    category: "web_operations",
    version: "1.0",
    author: "metis-team"
  }
};

export const firecrawlCrawlTool: RegisteredTool = {
  name: "firecrawl_crawl",
  description: "Crawl entire websites with Firecrawl - extracts content from multiple pages following links",
  schema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The base URL to start crawling from"
      },
      maxDepth: {
        type: "number",
        description: "Maximum depth to crawl",
        default: 2
      },
      limit: {
        type: "number",
        description: "Maximum number of pages to crawl",
        default: 10
      },
      allowBackwardLinks: {
        type: "boolean",
        description: "Allow crawling pages that link back",
        default: false
      },
      allowExternalLinks: {
        type: "boolean",
        description: "Allow crawling external domains",
        default: false
      },
      ignoreSitemap: {
        type: "boolean",
        description: "Ignore sitemap.xml if present",
        default: false
      },
      excludePaths: {
        type: "array",
        items: { type: "string" },
        description: "Path patterns to exclude (e.g., ['/admin/*', '/private/*'])"
      },
      includePaths: {
        type: "array",
        items: { type: "string" },
        description: "Path patterns to include (e.g., ['/docs/*', '/blog/*'])"
      },
      formats: {
        type: "array",
        items: {
          type: "string",
          enum: ["markdown", "html", "rawHtml", "links"]
        },
        description: "Formats to return for each page",
        default: ["markdown"]
      }
    },
    required: ["url"]
  },
  safety: {
    require_approval: true, // Crawling requires approval as it can be extensive
    network_access: true,
    max_execution_time: 120000,
    allowed_in_ci: false
  },
  handler: firecrawlCrawlHandler,
  metadata: {
    category: "web_operations",
    version: "1.0",
    author: "metis-team"
  }
};