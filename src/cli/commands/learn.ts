/**
 * Learning management commands
 *
 * nerv learn "content"              - Add a learning
 * nerv learn "content" --category X - Add with category
 * nerv learnings                    - List all learnings
 * nerv learnings --export FILE      - Export to file
 */

import * as fs from 'fs'
import type { DatabaseService } from '../../core/database.js'
import type { LearningCategory } from '../../shared/types.js'
import { CLI_EXIT_CODES } from '../../shared/constants.js'
import { colors } from '../colors.js'

const validCategories: LearningCategory[] = ['technical', 'process', 'domain', 'architecture', 'other']

function addLearning(args: string[], db: DatabaseService): void {
  const project = db.getCurrentProject()
  if (!project) {
    console.error(`${colors.red}No project selected. Use: nerv project switch <id>${colors.reset}`)
    process.exit(CLI_EXIT_CODES.PROJECT_NOT_FOUND)
  }

  // Find the content (first non-flag argument after 'learn')
  let content: string | undefined
  let category: LearningCategory | undefined

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--category' && args[i + 1]) {
      const cat = args[i + 1].toLowerCase() as LearningCategory
      if (validCategories.includes(cat)) {
        category = cat
      } else {
        console.error(`${colors.red}Invalid category: ${args[i + 1]}${colors.reset}`)
        console.log(`Valid categories: ${validCategories.join(', ')}`)
        process.exit(CLI_EXIT_CODES.INVALID_ARGS)
      }
      i++ // Skip next arg
    } else if (!args[i].startsWith('--') && !content) {
      content = args[i]
    }
  }

  if (!content) {
    console.error(`${colors.red}Error: Learning content required${colors.reset}`)
    console.log('Usage: nerv learn "Your learning here" [--category technical|process|domain|architecture|other]')
    process.exit(CLI_EXIT_CODES.INVALID_ARGS)
  }

  const learning = db.createLearning(project.id, content, category, 'manual')
  console.log(`${colors.green}✓${colors.reset} Learning recorded`)
  if (category) {
    console.log(`  Category: ${colors.cyan}${category}${colors.reset}`)
  }
  console.log(`  ${colors.gray}${content}${colors.reset}`)
}

function listLearnings(args: string[], db: DatabaseService): void {
  const project = db.getCurrentProject()
  if (!project) {
    console.error(`${colors.red}No project selected. Use: nerv project switch <id>${colors.reset}`)
    process.exit(CLI_EXIT_CODES.PROJECT_NOT_FOUND)
  }

  const exportIndex = args.indexOf('--export')
  if (exportIndex !== -1 && args[exportIndex + 1]) {
    const exportPath = args[exportIndex + 1]
    const content = db.exportLearnings(project.id)
    fs.writeFileSync(exportPath, content, 'utf-8')
    console.log(`${colors.green}✓${colors.reset} Exported learnings to: ${colors.cyan}${exportPath}${colors.reset}`)
    return
  }

  const learnings = db.getLearningsForProject(project.id)

  if (args.includes('--json')) {
    console.log(JSON.stringify(learnings, null, 2))
    return
  }

  if (learnings.length === 0) {
    console.log(`${colors.gray}No learnings recorded. Add one with: nerv learn "Your learning"${colors.reset}`)
    return
  }

  console.log(`${colors.bold}Learnings (${learnings.length})${colors.reset}\n`)

  // Group by category
  const grouped: Record<string, typeof learnings> = {}
  for (const learning of learnings) {
    const cat = learning.category || 'uncategorized'
    if (!grouped[cat]) {
      grouped[cat] = []
    }
    grouped[cat].push(learning)
  }

  for (const [category, items] of Object.entries(grouped)) {
    console.log(`${colors.cyan}${category.charAt(0).toUpperCase() + category.slice(1)}${colors.reset}`)
    for (const item of items) {
      const date = new Date(item.created_at).toLocaleDateString()
      console.log(`  • ${item.content}`)
      console.log(`    ${colors.gray}${date} via ${item.source || 'unknown'}${colors.reset}`)
    }
    console.log('')
  }
}

export async function learnCommand(args: string[], db: DatabaseService): Promise<void> {
  if (args.length === 0) {
    // No args, list learnings
    listLearnings([], db)
    return
  }

  // Check if first arg is a flag
  if (args[0].startsWith('--')) {
    listLearnings(args, db)
    return
  }

  // Otherwise add a learning
  addLearning(args, db)
}

export async function learningsCommand(args: string[], db: DatabaseService): Promise<void> {
  listLearnings(args, db)
}
