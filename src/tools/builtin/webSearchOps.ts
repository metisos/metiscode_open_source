import { RegisteredTool, ToolHandler, ExecutionContext, ToolResult } from "../registry";

// DuckDuckGo Search Interface
interface DDGSearchResult {
  title: string;
  url: string;
  snippet: string;
  position: number;
}

// Web Search Tool - using DuckDuckGo
const webSearchHandler: ToolHandler = {
  async execute(
    params: {
      query: string;
      allowed_domains?: string[];
      blocked_domains?: string[];
    },
    context: ExecutionContext
  ): Promise<ToolResult> {
    const { query, allowed_domains, blocked_domains } = params;

    if (!query || query.trim().length < 2) {
      return {
        success: false,
        error: "Search query must be at least 2 characters long"
      };
    }

    try {
      const searchResults = await searchDuckDuckGo(query.trim(), allowed_domains, blocked_domains);

      if (searchResults.length === 0) {
        return {
          success: true,
          content: `No search results found for: "${query}"`,
          metadata: {
            query,
            result_count: 0,
            allowed_domains,
            blocked_domains,
            search_engine: "duckduckgo"
          }
        };
      }

      // Format results for display
      const formattedResults = searchResults
        .slice(0, 10) // Limit to top 10 results
        .map((result, index) => {
          return `${index + 1}. **${result.title}**\n   ${result.url}\n   ${result.snippet}\n`;
        })
        .join('\n');

      return {
        success: true,
        content: `Search results for: "${query}"\n\n${formattedResults}`,
        metadata: {
          query,
          result_count: searchResults.length,
          allowed_domains,
          blocked_domains,
          search_engine: "duckduckgo",
          results: searchResults.slice(0, 10)
        }
      };

    } catch (error: any) {
      return {
        success: false,
        error: `Search failed: ${error.message}`
      };
    }
  }
};

// DuckDuckGo search implementation
async function searchDuckDuckGo(
  query: string,
  allowedDomains?: string[],
  blockedDomains?: string[]
): Promise<DDGSearchResult[]> {
  const { default: fetch } = await import('node-fetch');

  // First try instant answers API (more reliable)
  try {
    const instantResults = await searchDuckDuckGoInstant(query, allowedDomains, blockedDomains);
    if (instantResults.length > 0) {
      return instantResults;
    }
  } catch (instantError) {
    // Continue to HTML fallback
  }

  // If instant API fails or returns no results, try HTML scraping
  try {
    const htmlResults = await searchDuckDuckGoHTML(query, allowedDomains, blockedDomains);
    if (htmlResults.length > 0) {
      return htmlResults;
    }
  } catch (htmlError) {
    // Continue with empty results
  }

  // Return empty results if both methods fail
  return [];
}

// DuckDuckGo HTML search (fallback)
async function searchDuckDuckGoHTML(
  query: string,
  allowedDomains?: string[],
  blockedDomains?: string[]
): Promise<DDGSearchResult[]> {
  const { default: fetch } = await import('node-fetch');

  // Try different DuckDuckGo endpoints
  const endpoints = [
    `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=us-en`
  ];

  for (const searchUrl of endpoints) {
    try {
      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        },
        timeout: 15000
      });

      if (response.ok) {
        const html = await response.text();
        const results = parseSearchResults(html);

        if (results.length > 0) {
          return filterResults(results, allowedDomains, blockedDomains);
        }
      }
    } catch (error) {
      // Continue to next endpoint
      continue;
    }
  }

  throw new Error('All DuckDuckGo HTML endpoints failed');
}

// Parse HTML search results from DuckDuckGo
function parseSearchResults(html: string): DDGSearchResult[] {
  const results: DDGSearchResult[] = [];

  // Basic regex parsing for DuckDuckGo HTML results
  // Look for result containers
  const resultPattern = /<div class="result__body">[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>[\s\S]*?<\/a>[\s\S]*?<\/div>/g;
  const titlePattern = /<a[^>]*class="result__a"[^>]*>([^<]*)<\/a>/;
  const snippetPattern = /<a[^>]*class="result__snippet"[^>]*>([^<]*)<\/a>/;

  let match;
  let position = 1;

  while ((match = resultPattern.exec(html)) !== null && position <= 20) {
    const resultHtml = match[0];
    const url = match[1];

    // Skip non-HTTP URLs and ads
    if (!url || !url.startsWith('http') || url.includes('/y.js?')) {
      continue;
    }

    const titleMatch = titlePattern.exec(resultHtml);
    const snippetMatch = snippetPattern.exec(resultHtml);

    if (titleMatch && url) {
      results.push({
        title: cleanText(titleMatch[1] || 'No title'),
        url: url,
        snippet: cleanText(snippetMatch?.[1] || 'No description available'),
        position: position++
      });
    }
  }

  return results;
}

// DuckDuckGo Instant Answers API
async function searchDuckDuckGoInstant(
  query: string,
  allowedDomains?: string[],
  blockedDomains?: string[]
): Promise<DDGSearchResult[]> {
  const { default: fetch } = await import('node-fetch');

  const instantUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;

  const response = await fetch(instantUrl, {
    timeout: 8000,
    headers: {
      'User-Agent': 'MetisCode/1.6.0 (https://github.com/metis-team/metis-code)'
    }
  });

  if (!response.ok) {
    throw new Error(`DuckDuckGo Instant API failed: ${response.status}`);
  }

  const data = await response.json() as any;
  const results: DDGSearchResult[] = [];

  // Process abstract answer
  if (data.Abstract && data.AbstractURL) {
    results.push({
      title: data.Heading || data.AbstractSource || 'Instant Answer',
      url: data.AbstractURL,
      snippet: data.Abstract,
      position: 1
    });
  }

  // Process definition
  if (data.Definition && data.DefinitionURL) {
    results.push({
      title: `Definition: ${query}`,
      url: data.DefinitionURL,
      snippet: data.Definition,
      position: results.length + 1
    });
  }

  // Process answer (direct facts)
  if (data.Answer && data.AnswerType) {
    // Create a search result for the answer
    const answerUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
    results.push({
      title: `${data.AnswerType}: ${query}`,
      url: answerUrl,
      snippet: data.Answer,
      position: results.length + 1
    });
  }

  // Process related topics (can be nested)
  if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
    data.RelatedTopics.forEach((topic: any) => {
      if (topic.FirstURL && topic.Text) {
        results.push({
          title: extractTitleFromTopic(topic.Text) || `Related: ${query}`,
          url: topic.FirstURL,
          snippet: topic.Text,
          position: results.length + 1
        });
      } else if (topic.Topics && Array.isArray(topic.Topics)) {
        // Handle nested topics
        topic.Topics.forEach((nestedTopic: any) => {
          if (nestedTopic.FirstURL && nestedTopic.Text) {
            results.push({
              title: extractTitleFromTopic(nestedTopic.Text) || `Related: ${query}`,
              url: nestedTopic.FirstURL,
              snippet: nestedTopic.Text,
              position: results.length + 1
            });
          }
        });
      }
    });
  }

  // Process results section (sometimes present)
  if (data.Results && Array.isArray(data.Results)) {
    data.Results.forEach((result: any) => {
      if (result.FirstURL && result.Text) {
        results.push({
          title: extractTitleFromTopic(result.Text) || `Result: ${query}`,
          url: result.FirstURL,
          snippet: result.Text,
          position: results.length + 1
        });
      }
    });
  }

  // Return filtered results (even if empty)
  return filterResults(results, allowedDomains, blockedDomains);
}

// Extract title from topic text
function extractTitleFromTopic(text: string): string | null {
  // Topic text often comes in format "Title - Description"
  const parts = text.split(' - ');
  if (parts.length > 1) {
    return parts[0].trim();
  }

  // Or format "Title: Description"
  const colonParts = text.split(': ');
  if (colonParts.length > 1) {
    return colonParts[0].trim();
  }

  // Fallback: take first 50 chars
  return text.length > 50 ? text.substring(0, 50) + '...' : text;
}

// Filter results by domain restrictions
function filterResults(
  results: DDGSearchResult[],
  allowedDomains?: string[],
  blockedDomains?: string[]
): DDGSearchResult[] {
  return results.filter(result => {
    try {
      const domain = new URL(result.url).hostname.toLowerCase();

      // Check blocked domains
      if (blockedDomains?.some(blocked => domain.includes(blocked.toLowerCase()))) {
        return false;
      }

      // Check allowed domains (if specified, only include these)
      if (allowedDomains?.length) {
        return allowedDomains.some(allowed => domain.includes(allowed.toLowerCase()));
      }

      return true;
    } catch {
      return false; // Invalid URL
    }
  });
}

// Clean extracted text
function cleanText(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export const webSearchTool: RegisteredTool = {
  name: "web_search",
  description: "Search the web for current information using DuckDuckGo",
  schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query",
        minLength: 2
      },
      allowed_domains: {
        type: "array",
        items: { type: "string" },
        description: "Only include results from these domains"
      },
      blocked_domains: {
        type: "array",
        items: { type: "string" },
        description: "Never include results from these domains"
      }
    },
    required: ["query"]
  },
  safety: {
    require_approval: false,
    network_access: true,
    max_execution_time: 10000,
    allowed_in_ci: false
  },
  handler: webSearchHandler,
  metadata: {
    category: "web_operations",
    version: "1.0",
    author: "metis-team"
  }
};