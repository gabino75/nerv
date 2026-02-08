/**
 * CLAUDE.md and NERV.md types
 */

export interface ClaudeMdSection {
  name: string
  content: string
  startLine: number
  endLine: number
}

export interface ClaudeMdSuggestions {
  detected: string[]
  suggestions: {
    commands: Record<string, string>
    environment: string[]
    architecture: string[]
    codeStyle: string[]
    constraints: string[]
  }
}

export interface NervMdSizeCheck {
  tokens: number
  isWithinTarget: boolean
  isWithinMax: boolean
  warning?: string
}
