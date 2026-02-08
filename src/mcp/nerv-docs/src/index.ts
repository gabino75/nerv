#!/usr/bin/env node
/**
 * NERV Documentation Search MCP Server
 *
 * Provides a scoped documentation search tool for Claude Code sessions.
 * Reads allowed domains from NERV_ALLOWED_DOMAINS environment variable.
 *
 * This MCP server exposes a single tool:
 * - search_docs: Search documentation within allowed domains
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js'

// Parse allowed domains from environment
function getAllowedDomains(): string[] {
  const domainsEnv = process.env.NERV_ALLOWED_DOMAINS || ''
  if (!domainsEnv) {
    return []
  }
  return domainsEnv
    .split(',')
    .map(d => d.trim())
    .filter(d => d.length > 0)
}

// Check if a URL is within allowed domains
function isUrlAllowed(url: string, allowedDomains: string[]): boolean {
  if (allowedDomains.length === 0) {
    // If no domains configured, allow nothing
    return false
  }

  try {
    const parsed = new URL(url)
    const hostname = parsed.hostname.toLowerCase()

    return allowedDomains.some(domain => {
      const normalizedDomain = domain.toLowerCase().replace(/^https?:\/\//, '')
      // Match exact domain or subdomain
      return hostname === normalizedDomain || hostname.endsWith('.' + normalizedDomain)
    })
  } catch {
    return false
  }
}

// Simple fetch-based documentation search
// In a real implementation, this could use a search API
async function searchDocs(
  query: string,
  domains: string[]
): Promise<{ results: SearchResult[]; error?: string }> {
  const results: SearchResult[] = []

  if (domains.length === 0) {
    return {
      results: [],
      error: 'No documentation sources configured. Add sources in NERV dashboard.'
    }
  }

  // For MVP, return domain-specific search URLs
  // In a full implementation, this could:
  // 1. Use Google Custom Search API scoped to domains
  // 2. Use each site's native search API
  // 3. Crawl and index docs locally

  for (const domain of domains) {
    const normalizedDomain = domain.replace(/^https?:\/\//, '').replace(/\/+$/, '')

    // Generate search URL suggestions for common documentation sites
    const searchUrls = generateSearchUrls(normalizedDomain, query)

    results.push({
      domain: normalizedDomain,
      query,
      searchUrls,
      suggestion: `Search "${query}" on ${normalizedDomain}`
    })
  }

  return { results }
}

interface SearchResult {
  domain: string
  query: string
  searchUrls: string[]
  suggestion: string
}

// Generate search URLs for common documentation patterns
function generateSearchUrls(domain: string, query: string): string[] {
  const encodedQuery = encodeURIComponent(query)
  const urls: string[] = []

  // Common documentation search patterns
  if (domain.includes('docs.aws.amazon.com')) {
    urls.push(`https://docs.aws.amazon.com/search/doc-search.html?searchPath=documentation&searchQuery=${encodedQuery}`)
  } else if (domain.includes('auth0.com')) {
    urls.push(`https://auth0.com/docs/search?query=${encodedQuery}`)
  } else if (domain.includes('developer.mozilla.org')) {
    urls.push(`https://developer.mozilla.org/en-US/search?q=${encodedQuery}`)
  } else if (domain.includes('reactjs.org') || domain.includes('react.dev')) {
    urls.push(`https://react.dev/search?q=${encodedQuery}`)
  } else if (domain.includes('nodejs.org')) {
    urls.push(`https://nodejs.org/api/all.html#all_${encodedQuery.toLowerCase().replace(/%20/g, '_')}`)
  } else if (domain.includes('typescriptlang.org')) {
    urls.push(`https://www.typescriptlang.org/search/?q=${encodedQuery}`)
  } else {
    // Generic: suggest Google site-scoped search
    urls.push(`https://www.google.com/search?q=site:${domain}+${encodedQuery}`)
  }

  return urls
}

// Fetch and extract content from a URL
async function fetchDocContent(url: string, allowedDomains: string[]): Promise<{ content: string; error?: string }> {
  if (!isUrlAllowed(url, allowedDomains)) {
    return {
      content: '',
      error: `URL not allowed. Must be from: ${allowedDomains.join(', ')}`
    }
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'NERV-MCP-Docs/1.0 (Documentation Search)',
        'Accept': 'text/html,application/xhtml+xml,text/plain'
      }
    })

    if (!response.ok) {
      return {
        content: '',
        error: `HTTP ${response.status}: ${response.statusText}`
      }
    }

    const text = await response.text()

    // Basic HTML to text conversion (strip tags)
    const content = text
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 50000) // Limit content size

    return { content }
  } catch (error) {
    return {
      content: '',
      error: `Failed to fetch: ${error instanceof Error ? error.message : 'Unknown error'}`
    }
  }
}

// Create and configure the MCP server
const server = new Server(
  {
    name: 'nerv-docs',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
)

// Handle list tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const allowedDomains = getAllowedDomains()

  return {
    tools: [
      {
        name: 'search_docs',
        description: `Search documentation within configured sources. Currently allowed domains: ${allowedDomains.length > 0 ? allowedDomains.join(', ') : '(none configured)'}`,
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query for documentation'
            }
          },
          required: ['query']
        }
      },
      {
        name: 'fetch_doc',
        description: `Fetch content from a documentation URL. Only URLs from allowed domains will work: ${allowedDomains.length > 0 ? allowedDomains.join(', ') : '(none configured)'}`,
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'URL to fetch documentation from'
            }
          },
          required: ['url']
        }
      }
    ]
  }
})

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const allowedDomains = getAllowedDomains()

  switch (request.params.name) {
    case 'search_docs': {
      const query = request.params.arguments?.query as string

      if (!query) {
        throw new McpError(ErrorCode.InvalidParams, 'Query is required')
      }

      const { results, error } = await searchDocs(query, allowedDomains)

      if (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error}`
            }
          ]
        }
      }

      // Format results as text
      const formattedResults = results.map(r =>
        `## ${r.domain}\n${r.suggestion}\nSearch URLs:\n${r.searchUrls.map(u => `- ${u}`).join('\n')}`
      ).join('\n\n')

      return {
        content: [
          {
            type: 'text',
            text: formattedResults || 'No documentation sources configured.'
          }
        ]
      }
    }

    case 'fetch_doc': {
      const url = request.params.arguments?.url as string

      if (!url) {
        throw new McpError(ErrorCode.InvalidParams, 'URL is required')
      }

      const { content, error } = await fetchDocContent(url, allowedDomains)

      if (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error}`
            }
          ]
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: content
          }
        ]
      }
    }

    default:
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`)
  }
})

// Main entry point
async function main() {
  const allowedDomains = getAllowedDomains()
  console.error(`[nerv-docs] Starting MCP server`)
  console.error(`[nerv-docs] Allowed domains: ${allowedDomains.length > 0 ? allowedDomains.join(', ') : '(none)'}`)
  console.error(`[nerv-docs] Project ID: ${process.env.NERV_PROJECT_ID || '(not set)'}`)

  const transport = new StdioServerTransport()
  await server.connect(transport)

  console.error('[nerv-docs] Server connected via stdio')
}

main().catch((error) => {
  console.error('[nerv-docs] Fatal error:', error)
  process.exit(1)
})
