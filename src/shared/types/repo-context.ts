/**
 * Repository context scanning types (PRD Section 24)
 */

export type RepoContextType =
  | 'claude_md'
  | 'skill'
  | 'mcp_config'
  | 'readme'
  | 'contributing'
  | 'architecture'
  | 'api_docs'
  | 'package_config'
  | 'ci_cd'
  | 'testing_config'

export interface RepoContext {
  id: string
  repo_id: string
  context_type: RepoContextType
  file_path: string
  content: string
  parsed_sections: string | null // JSON string of ParsedClaudeMd or similar
  last_scanned_at: number
  file_hash: string
}

export interface RepoSkill {
  id: string
  repo_id: string
  skill_name: string
  skill_path: string
  description: string | null
  trigger_pattern: string | null
  content: string
}

export interface ParsedClaudeMd {
  commands: Array<{ name: string; command: string; description?: string }>
  constraints: Array<{ rule: string; severity: 'error' | 'warning' }>
  codeStyle: Array<{ pattern: string; example?: string }>
  architecture: Array<{ path: string; description: string }>
  environment: Array<{ requirement: string }>
  testing?: { command: string; framework?: string }
  rawSections: Record<string, string>
}

export interface RepoScanResult {
  claudeMd: ParsedClaudeMd | null
  skills: Array<{
    name: string
    path: string
    description?: string
    trigger?: string
    content: string
  }>
  mcpConfig: Record<string, unknown> | null
  readme: string | null
  contributing: string | null
  architecture: string | null
  packageInfo: {
    name?: string
    version?: string
    scripts?: Record<string, string>
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  } | null
  ciCd: Array<{ path: string; content: string }> | null
  testingConfigs: Array<{ path: string; content: string }> | null
}
