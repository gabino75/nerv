/**
 * Spec Parser - Parse multi-cycle benchmark specs into structured data
 *
 * Splits specs by `### N. Feature (Cycle N)` headers,
 * extracts acceptance criteria per cycle, and identifies
 * parallelizable subtasks (e.g., API vs UI work).
 *
 * Flat specs (no cycle markers) become a single cycle with a single task.
 */

import type { ParsedSpec, ParsedCycle, ParsedSubtask, UserScenario, MidProjectEvent } from '../shared/types/benchmark.js'

/**
 * Parse a markdown spec into structured cycles and subtasks.
 */
export function parseSpec(specContent: string): ParsedSpec {
  const title = extractTitle(specContent)
  const cycles = extractCycles(specContent)

  // Count total acceptance criteria across all cycles
  let totalAcceptanceCriteria = 0
  for (const cycle of cycles) {
    for (const subtask of cycle.subtasks) {
      totalAcceptanceCriteria += subtask.acceptanceCriteria.length
    }
  }

  return {
    title,
    rawContent: specContent,
    cycles,
    totalAcceptanceCriteria,
  }
}

/**
 * Extract the title from the first H1 or H2 heading.
 */
function extractTitle(content: string): string {
  const match = content.match(/^#{1,2}\s+(.+)$/m)
  return match ? match[1].trim() : 'Untitled Spec'
}

/**
 * Extract cycles from the spec content.
 * Looks for patterns like:
 *   ### 1. Feature Name (Cycle 1)
 *   ### 2. Feature Name (Cycle 2)
 * or:
 *   ### 1. Feature Name
 *   ### 2. Feature Name
 * Falls back to a single cycle if no cycle markers found.
 */
function extractCycles(content: string): ParsedCycle[] {
  // Pattern: ### N. Title (Cycle N) or ### N. Title
  const cyclePattern = /^###\s+(\d+)\.\s+(.+?)(?:\s*\(Cycle\s+\d+\))?\s*$/gm
  const matches: { index: number; cycleNum: number; title: string }[] = []

  let match: RegExpExecArray | null
  while ((match = cyclePattern.exec(content)) !== null) {
    matches.push({
      index: match.index,
      cycleNum: parseInt(match[1], 10),
      title: match[2].trim(),
    })
  }

  if (matches.length === 0) {
    // Flat spec: single cycle with a single task
    return [createFlatCycle(content)]
  }

  const cycles: ParsedCycle[] = []

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index
    const end = i + 1 < matches.length ? matches[i + 1].index : content.length
    const sectionContent = content.slice(start, end)

    const acceptanceCriteria = extractAcceptanceCriteria(sectionContent)
    const subtasks = identifySubtasks(matches[i].title, sectionContent, matches[i].cycleNum, acceptanceCriteria)

    cycles.push({
      cycleNumber: matches[i].cycleNum,
      title: matches[i].title,
      description: sectionContent.trim(),
      subtasks,
    })
  }

  return cycles
}

/**
 * Create a single-cycle fallback for flat specs.
 */
function createFlatCycle(content: string): ParsedCycle {
  const title = extractTitle(content)
  const acceptanceCriteria = extractAcceptanceCriteria(content)

  return {
    cycleNumber: 1,
    title,
    description: content.trim(),
    subtasks: [{
      id: 'task-1',
      title,
      description: content.trim(),
      acceptanceCriteria,
      parallelGroup: 'main',
    }],
  }
}

/**
 * Extract acceptance criteria from a section.
 * Looks for `- [ ]` checkbox patterns.
 */
export function extractAcceptanceCriteria(section: string): string[] {
  const criteria: string[] = []
  const pattern = /^-\s+\[[ x]\]\s+(.+)$/gm
  let match: RegExpExecArray | null
  while ((match = pattern.exec(section)) !== null) {
    criteria.push(match[1].trim())
  }
  return criteria
}

/**
 * Identify subtasks within a cycle section.
 * Looks for signals that work can be parallelized:
 * - API/Backend vs Frontend/UI mentions
 * - "API Endpoints" and "UI Components" subsections
 * - Multiple distinct user story groups
 */
function identifySubtasks(
  cycleTitle: string,
  sectionContent: string,
  cycleNum: number,
  allCriteria: string[],
): ParsedSubtask[] {
  const hasApiSection = /\*\*API Endpoints?\*\*|```\s*\n(?:GET|POST|PUT|PATCH|DELETE)\s/m.test(sectionContent)
  const hasUiSection = /\*\*UI Components?\*\*|```\s*\n[┌│└─┤├]/m.test(sectionContent)

  // If we have both API and UI sections, split into parallel subtasks
  if (hasApiSection && hasUiSection) {
    const apiCriteria: string[] = []
    const uiCriteria: string[] = []

    for (const c of allCriteria) {
      if (isApiCriterion(c)) {
        apiCriteria.push(c)
      } else {
        uiCriteria.push(c)
      }
    }

    // If all criteria ended up in one bucket, don't split
    if (apiCriteria.length === 0 || uiCriteria.length === 0) {
      return [{
        id: `cycle-${cycleNum}-task-1`,
        title: cycleTitle,
        description: sectionContent.trim(),
        acceptanceCriteria: allCriteria,
        parallelGroup: 'main',
      }]
    }

    return [
      {
        id: `cycle-${cycleNum}-api`,
        title: `${cycleTitle} - API/Backend`,
        description: extractApiSection(sectionContent),
        acceptanceCriteria: apiCriteria,
        parallelGroup: 'api',
      },
      {
        id: `cycle-${cycleNum}-ui`,
        title: `${cycleTitle} - UI/Frontend`,
        description: extractUiSection(sectionContent),
        acceptanceCriteria: uiCriteria,
        parallelGroup: 'ui',
      },
    ]
  }

  // Single task for this cycle
  return [{
    id: `cycle-${cycleNum}-task-1`,
    title: cycleTitle,
    description: sectionContent.trim(),
    acceptanceCriteria: allCriteria,
    parallelGroup: 'main',
  }]
}

/**
 * Check if a criterion is API-related.
 */
function isApiCriterion(criterion: string): boolean {
  const apiKeywords = [
    /api/i, /endpoint/i, /route/i, /\b(GET|POST|PUT|PATCH|DELETE)\b/,
    /401/i, /403/i, /status code/i, /jwt/i, /token/i, /hash/i,
    /password/i, /auth/i, /database/i, /sql/i, /schema/i,
    /validation/i, /parameterized/i,
  ]
  return apiKeywords.some(re => re.test(criterion))
}

/**
 * Extract the API section from a cycle's content.
 */
function extractApiSection(content: string): string {
  const sections: string[] = []
  // Get everything from API Endpoints to the next major section
  const apiMatch = content.match(/\*\*API Endpoints?\*\*[\s\S]*?(?=\*\*(?:UI|Acceptance)|$)/m)
  if (apiMatch) sections.push(apiMatch[0])
  // Also include user stories that mention API
  const storyMatch = content.match(/\*\*User Stories?:\*\*[\s\S]*?(?=\*\*)/m)
  if (storyMatch) sections.push(storyMatch[0])
  return sections.join('\n\n') || content
}

/**
 * Extract the UI section from a cycle's content.
 */
function extractUiSection(content: string): string {
  const sections: string[] = []
  const uiMatch = content.match(/\*\*UI Components?\*\*[\s\S]*?(?=\*\*(?:API|Acceptance)|$)/m)
  if (uiMatch) sections.push(uiMatch[0])
  return sections.join('\n\n') || content
}

// ============================================================================
// User Scenario Format (UI Benchmark)
// ============================================================================

/**
 * Check if a spec uses the user scenario format (has ## Project Idea section).
 */
export function isUserScenarioFormat(content: string): boolean {
  return /^##\s+Project Idea/m.test(content)
}

/**
 * Extract a UserScenario from a spec written in the user scenario format.
 * Returns null if the spec doesn't use this format.
 */
export function extractUserScenario(content: string): UserScenario | null {
  if (!isUserScenarioFormat(content)) return null

  const projectIdea = extractSection(content, 'Project Idea')
  const userProfile = extractUserProfile(content)
  const techPreferences = extractBulletList(content, 'Tech Preferences')
  const roughMilestones = extractQuotedList(content, 'Rough Milestones')
  const midProjectEvents = extractMidProjectEvents(content)
  const qualityBar = extractBulletList(content, 'Quality Bar')

  return {
    projectIdea: projectIdea.replace(/^["""]|["""]$/g, '').trim(),
    userProfile,
    techPreferences,
    roughMilestones,
    midProjectEvents,
    qualityBar,
  }
}

/**
 * Extract content between ## heading and next ## heading.
 */
function extractSection(content: string, heading: string): string {
  // Find the heading line
  const headingPattern = new RegExp(`^##\\s+${escapeRegex(heading)}\\s*$`, 'm')
  const headingMatch = headingPattern.exec(content)
  if (!headingMatch) return ''

  const startIdx = headingMatch.index + headingMatch[0].length
  // Find the next ## heading (or end of string)
  const nextHeadingMatch = /^##\s+/m.exec(content.slice(startIdx))
  const endIdx = nextHeadingMatch ? startIdx + nextHeadingMatch.index : content.length

  return content.slice(startIdx, endIdx).trim()
}

/**
 * Extract user profile structured data.
 */
function extractUserProfile(content: string): UserScenario['userProfile'] {
  const section = extractSection(content, 'User Profile')
  return {
    strong: extractProfileLine(section, 'Strong'),
    moderate: extractProfileLine(section, 'Moderate'),
    weak: extractProfileLine(section, 'Weak'),
    neverUsed: extractProfileLine(section, 'Never used'),
  }
}

function extractProfileLine(section: string, label: string): string[] {
  const pattern = new RegExp(`^-\\s+${escapeRegex(label)}:\\s*(.+)$`, 'mi')
  const match = section.match(pattern)
  if (!match) return []
  return match[1].split(',').map(s => s.trim()).filter(Boolean)
}

/**
 * Extract a bullet list under a ## heading.
 */
function extractBulletList(content: string, heading: string): string[] {
  const section = extractSection(content, heading)
  const items: string[] = []
  const pattern = /^-\s+(.+)$/gm
  let match: RegExpExecArray | null
  while ((match = pattern.exec(section)) !== null) {
    items.push(match[1].trim())
  }
  return items
}

/**
 * Extract quoted items from a section (lines starting with - "...").
 */
function extractQuotedList(content: string, heading: string): string[] {
  const section = extractSection(content, heading)
  const items: string[] = []
  const pattern = /^-\s+["""](.+?)["""]$/gm
  let match: RegExpExecArray | null
  while ((match = pattern.exec(section)) !== null) {
    items.push(match[1].trim())
  }
  return items
}

/**
 * Extract mid-project events from ## Mid-Project Events section.
 */
function extractMidProjectEvents(content: string): MidProjectEvent[] {
  const section = extractSection(content, 'Mid-Project Events')
  if (!section) return []

  const events: MidProjectEvent[] = []
  const blockPattern = /^after_cycle_(\d+):\s*$/gm
  const blocks: { cycleNum: number; index: number; start: number }[] = []

  let match: RegExpExecArray | null
  while ((match = blockPattern.exec(section)) !== null) {
    blocks.push({
      cycleNum: parseInt(match[1], 10),
      index: match.index,
      start: match.index + match[0].length,
    })
  }

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    const end = i + 1 < blocks.length ? blocks[i + 1].index : section.length
    const blockContent = section.slice(block.start, end)

    const eventPattern = /^\s+-\s+(scope_creep|mind_change|user_says):\s+["""](.+?)["""]$/gm
    let eventMatch: RegExpExecArray | null
    while ((eventMatch = eventPattern.exec(blockContent)) !== null) {
      events.push({
        afterCycle: block.cycleNum,
        type: eventMatch[1] as MidProjectEvent['type'],
        content: eventMatch[2].trim(),
      })
    }
  }

  return events
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
