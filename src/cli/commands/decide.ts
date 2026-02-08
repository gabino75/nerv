/**
 * Decision management commands
 *
 * nerv decide "title"                  - Record a decision
 * nerv decide "title" --rationale "X"  - Record with rationale
 * nerv decisions                       - List all decisions
 */

import type { DatabaseService } from '../../core/database.js'
import { CLI_EXIT_CODES } from '../../shared/constants.js'
import { colors } from '../colors.js'

function addDecision(args: string[], db: DatabaseService): void {
  const project = db.getCurrentProject()
  if (!project) {
    console.error(`${colors.red}No project selected. Use: nerv project switch <id>${colors.reset}`)
    process.exit(CLI_EXIT_CODES.PROJECT_NOT_FOUND)
  }

  // Find the title (first non-flag argument)
  let title: string | undefined
  let rationale: string | undefined
  let alternatives: string | undefined

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--rationale' && args[i + 1]) {
      rationale = args[i + 1]
      i++
    } else if (args[i] === '--alternatives' && args[i + 1]) {
      alternatives = args[i + 1]
      i++
    } else if (!args[i].startsWith('--') && !title) {
      title = args[i]
    }
  }

  if (!title) {
    console.error(`${colors.red}Error: Decision title required${colors.reset}`)
    console.log('Usage: nerv decide "Your decision" [--rationale "Why"] [--alternatives "Other options"]')
    process.exit(CLI_EXIT_CODES.INVALID_ARGS)
  }

  // Get active cycle if any
  const cycle = db.getActiveCycle(project.id)
  const decision = db.createDecision(project.id, title, rationale, cycle?.id, alternatives)

  console.log(`${colors.green}✓${colors.reset} Decision recorded`)
  console.log(`  ${colors.bold}${decision.title}${colors.reset}`)
  if (rationale) {
    console.log(`  Rationale: ${colors.gray}${rationale}${colors.reset}`)
  }
  if (alternatives) {
    console.log(`  Alternatives: ${colors.gray}${alternatives}${colors.reset}`)
  }
}

function listDecisions(args: string[], db: DatabaseService): void {
  const project = db.getCurrentProject()
  if (!project) {
    console.error(`${colors.red}No project selected. Use: nerv project switch <id>${colors.reset}`)
    process.exit(CLI_EXIT_CODES.PROJECT_NOT_FOUND)
  }

  const decisions = db.getDecisionsForProject(project.id)

  if (args.includes('--json')) {
    console.log(JSON.stringify(decisions, null, 2))
    return
  }

  if (decisions.length === 0) {
    console.log(`${colors.gray}No decisions recorded. Add one with: nerv decide "Your decision"${colors.reset}`)
    return
  }

  console.log(`${colors.bold}Decisions (${decisions.length})${colors.reset}\n`)

  for (const decision of decisions) {
    const date = new Date(decision.created_at).toLocaleDateString()
    console.log(`${colors.cyan}●${colors.reset} ${colors.bold}${decision.title}${colors.reset}`)
    console.log(`  ${colors.gray}${date}${colors.reset}`)
    if (decision.rationale) {
      console.log(`  Rationale: ${decision.rationale}`)
    }
    if (decision.alternatives) {
      console.log(`  Alternatives: ${decision.alternatives}`)
    }
    console.log('')
  }
}

export async function decideCommand(args: string[], db: DatabaseService): Promise<void> {
  if (args.length === 0) {
    console.error(`${colors.red}Error: Decision title required${colors.reset}`)
    console.log('Usage: nerv decide "Your decision" [--rationale "Why"] [--alternatives "Other options"]')
    process.exit(CLI_EXIT_CODES.INVALID_ARGS)
  }

  addDecision(args, db)
}

export async function decisionsCommand(args: string[], db: DatabaseService): Promise<void> {
  listDecisions(args, db)
}
