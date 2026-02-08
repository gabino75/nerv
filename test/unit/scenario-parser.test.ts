/**
 * Unit tests for user scenario spec parser
 */
import { describe, it, expect } from 'vitest'
import { extractUserScenario, isUserScenarioFormat } from '../../src/core/spec-parser.js'

const SCENARIO_SPEC = `# TaskFlow - Full-Featured Todo Application

## Project Idea
"I want to build a serious todo app — not a tutorial project."

## User Profile
- Strong: JavaScript, React, HTML/CSS
- Moderate: TypeScript, Node.js
- Weak: SQL databases, authentication
- Never used: bcrypt, JWT, better-sqlite3

## Tech Preferences
- Frontend: React with TypeScript
- Database: something that just works

## Rough Milestones
- "First, prove the concept"
- "Then build the real data model"
- "Add user auth"

## Mid-Project Events
after_cycle_1:
  - scope_creep: "Todos need priority levels — low, medium, high, urgent."
  - user_says: "Can we add due dates?"
after_cycle_2:
  - mind_change: "Let's switch from plain CSS to Tailwind."
  - scope_creep: "I want a search bar that filters todos."

## Quality Bar
- App starts with npm run dev
- User can sign up, log in, create projects
- At least 20 meaningful tests
`

const OLD_SPEC = `# Todo App

### 1. Setup (Cycle 1)
- [ ] Create project structure
- [ ] Set up database
`

describe('isUserScenarioFormat', () => {
  it('detects user scenario format', () => {
    expect(isUserScenarioFormat(SCENARIO_SPEC)).toBe(true)
  })

  it('returns false for old format', () => {
    expect(isUserScenarioFormat(OLD_SPEC)).toBe(false)
  })
})

describe('extractUserScenario', () => {
  it('returns null for old format', () => {
    expect(extractUserScenario(OLD_SPEC)).toBeNull()
  })

  it('extracts project idea', () => {
    const scenario = extractUserScenario(SCENARIO_SPEC)
    expect(scenario).not.toBeNull()
    expect(scenario!.projectIdea).toContain('serious todo app')
  })

  it('extracts user profile', () => {
    const scenario = extractUserScenario(SCENARIO_SPEC)!
    expect(scenario.userProfile.strong).toContain('JavaScript')
    expect(scenario.userProfile.strong).toContain('React')
    expect(scenario.userProfile.moderate).toContain('TypeScript')
    expect(scenario.userProfile.weak).toContain('SQL databases')
    expect(scenario.userProfile.neverUsed).toContain('bcrypt')
  })

  it('extracts tech preferences', () => {
    const scenario = extractUserScenario(SCENARIO_SPEC)!
    expect(scenario.techPreferences.length).toBe(2)
    expect(scenario.techPreferences[0]).toContain('React')
  })

  it('extracts rough milestones', () => {
    const scenario = extractUserScenario(SCENARIO_SPEC)!
    expect(scenario.roughMilestones.length).toBe(3)
    expect(scenario.roughMilestones[0]).toContain('prove the concept')
  })

  it('extracts mid-project events', () => {
    const scenario = extractUserScenario(SCENARIO_SPEC)!
    expect(scenario.midProjectEvents.length).toBe(4)

    const cycle1Events = scenario.midProjectEvents.filter(e => e.afterCycle === 1)
    expect(cycle1Events.length).toBe(2)
    expect(cycle1Events[0].type).toBe('scope_creep')
    expect(cycle1Events[0].content).toContain('priority levels')
    expect(cycle1Events[1].type).toBe('user_says')

    const cycle2Events = scenario.midProjectEvents.filter(e => e.afterCycle === 2)
    expect(cycle2Events.length).toBe(2)
    expect(cycle2Events[0].type).toBe('mind_change')
    expect(cycle2Events[1].type).toBe('scope_creep')
  })

  it('extracts quality bar', () => {
    const scenario = extractUserScenario(SCENARIO_SPEC)!
    expect(scenario.qualityBar.length).toBe(3)
    expect(scenario.qualityBar[0]).toContain('npm run dev')
  })
})
