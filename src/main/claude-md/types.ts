/**
 * CLAUDE.md Management - Type definitions
 */

/**
 * Stack detection configuration
 */
export interface StackDetection {
  name: string
  indicators: {
    files?: string[]
    packageDeps?: string[]
    devDeps?: string[]
  }
  suggestions: {
    commands?: Record<string, string>
    environment?: string[]
    architecture?: string[]
    codeStyle?: string[]
    constraints?: string[]
  }
}

/**
 * Parsed package.json structure
 */
export type PackageJson = {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

/**
 * Section in a CLAUDE.md file
 */
export interface ClaudeMdSection {
  name: string
  content: string
  startLine: number
  endLine: number
}

/**
 * Suggestions generated from stack detection
 */
export interface ClaudeMdSuggestions {
  commands: Record<string, string>
  environment: string[]
  architecture: string[]
  codeStyle: string[]
  constraints: string[]
}

/**
 * Result of getSuggestions
 */
export interface SuggestionsResult {
  detected: string[]
  suggestions: ClaudeMdSuggestions
}
