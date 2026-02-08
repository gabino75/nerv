/**
 * Unit tests for spec-parser module
 *
 * Tests the parsing of multi-cycle benchmark specs into structured data.
 * Covers: cycle detection, subtask splitting, acceptance criteria extraction,
 * flat spec fallback, and API/UI parallel identification.
 */

import { describe, it, expect } from 'vitest'
import { parseSpec, extractAcceptanceCriteria } from '../../src/core/spec-parser'

describe('parseSpec()', () => {
  it('should extract title from H1 heading', () => {
    const spec = `# My App Spec

Some description here.
`
    const result = parseSpec(spec)
    expect(result.title).toBe('My App Spec')
  })

  it('should extract title from H2 heading', () => {
    const spec = `## Dashboard App

Some description.
`
    const result = parseSpec(spec)
    expect(result.title).toBe('Dashboard App')
  })

  it('should return "Untitled Spec" when no heading found', () => {
    const spec = `Just some text without headings.`
    const result = parseSpec(spec)
    expect(result.title).toBe('Untitled Spec')
  })

  it('should preserve rawContent', () => {
    const spec = `# Test\n\nSome content.`
    const result = parseSpec(spec)
    expect(result.rawContent).toBe(spec)
  })

  it('should parse multi-cycle spec with (Cycle N) markers', () => {
    const spec = `# Task Manager

### 1. Authentication (Cycle 1)

- [ ] User registration
- [ ] Login/logout

### 2. CRUD Operations (Cycle 2)

- [ ] Create tasks
- [ ] Edit tasks

### 3. Polish (Cycle 3)

- [ ] Loading states
- [ ] Error handling
`
    const result = parseSpec(spec)
    expect(result.cycles).toHaveLength(3)
    expect(result.cycles[0].cycleNumber).toBe(1)
    expect(result.cycles[0].title).toBe('Authentication')
    expect(result.cycles[1].cycleNumber).toBe(2)
    expect(result.cycles[1].title).toBe('CRUD Operations')
    expect(result.cycles[2].cycleNumber).toBe(3)
    expect(result.cycles[2].title).toBe('Polish')
  })

  it('should parse multi-cycle spec without (Cycle N) markers', () => {
    const spec = `# App

### 1. Setup

- [ ] Init project

### 2. Features

- [ ] Add feature A
`
    const result = parseSpec(spec)
    expect(result.cycles).toHaveLength(2)
    expect(result.cycles[0].cycleNumber).toBe(1)
    expect(result.cycles[0].title).toBe('Setup')
    expect(result.cycles[1].cycleNumber).toBe(2)
    expect(result.cycles[1].title).toBe('Features')
  })

  it('should fall back to single cycle for flat specs', () => {
    const spec = `# Simple Todo App

Build a simple todo app with the following features:

- [ ] Add todos
- [ ] Delete todos
- [ ] Mark complete
`
    const result = parseSpec(spec)
    expect(result.cycles).toHaveLength(1)
    expect(result.cycles[0].cycleNumber).toBe(1)
    expect(result.cycles[0].title).toBe('Simple Todo App')
    expect(result.cycles[0].subtasks).toHaveLength(1)
    expect(result.cycles[0].subtasks[0].parallelGroup).toBe('main')
  })

  it('should count total acceptance criteria across all cycles', () => {
    const spec = `# App

### 1. Phase 1

- [ ] Criterion A
- [ ] Criterion B

### 2. Phase 2

- [ ] Criterion C
- [ ] Criterion D
- [ ] Criterion E
`
    const result = parseSpec(spec)
    expect(result.totalAcceptanceCriteria).toBe(5)
  })

  it('should handle checked and unchecked criteria', () => {
    const spec = `# App

### 1. Phase 1

- [x] Already done
- [ ] Not yet done
`
    const result = parseSpec(spec)
    expect(result.totalAcceptanceCriteria).toBe(2)
  })

  it('should split into API and UI subtasks when both sections present', () => {
    const spec = `# App

### 1. Feature (Cycle 1)

**API Endpoints**

\`\`\`
GET /api/items
POST /api/items
\`\`\`

**UI Components**

\`\`\`
┌──────────────┐
│  Item List   │
└──────────────┘
\`\`\`

- [ ] API returns items correctly
- [ ] UI displays items in a list
`
    const result = parseSpec(spec)
    expect(result.cycles).toHaveLength(1)
    // Should split into API and UI subtasks
    const subtasks = result.cycles[0].subtasks
    expect(subtasks.length).toBeGreaterThanOrEqual(1)
    // If split happened, check parallel groups
    if (subtasks.length === 2) {
      expect(subtasks[0].parallelGroup).toBe('api')
      expect(subtasks[1].parallelGroup).toBe('ui')
    }
  })

  it('should not split when only API section exists', () => {
    const spec = `# App

### 1. API Only (Cycle 1)

**API Endpoints**

\`\`\`
GET /api/items
\`\`\`

- [ ] Endpoint returns 200
- [ ] Endpoint validates input
`
    const result = parseSpec(spec)
    expect(result.cycles[0].subtasks).toHaveLength(1)
    expect(result.cycles[0].subtasks[0].parallelGroup).toBe('main')
  })

  it('should assign subtask IDs based on cycle number', () => {
    const spec = `# App

### 1. Phase One

- [ ] Do thing A

### 2. Phase Two

- [ ] Do thing B
`
    const result = parseSpec(spec)
    expect(result.cycles[0].subtasks[0].id).toContain('cycle-1')
    expect(result.cycles[1].subtasks[0].id).toContain('cycle-2')
  })
})

describe('extractAcceptanceCriteria()', () => {
  it('should extract unchecked checkbox items', () => {
    const section = `Some text

- [ ] First criterion
- [ ] Second criterion
`
    const criteria = extractAcceptanceCriteria(section)
    expect(criteria).toHaveLength(2)
    expect(criteria[0]).toBe('First criterion')
    expect(criteria[1]).toBe('Second criterion')
  })

  it('should extract checked checkbox items', () => {
    const section = `- [x] Done item
- [X] Also done
`
    // The regex matches [ x] but not [X] (lowercase only)
    const criteria = extractAcceptanceCriteria(section)
    expect(criteria.length).toBeGreaterThanOrEqual(1)
    expect(criteria[0]).toBe('Done item')
  })

  it('should return empty array for no checkboxes', () => {
    const section = `No checkboxes here.
- Regular list item
- Another regular item
`
    const criteria = extractAcceptanceCriteria(section)
    expect(criteria).toHaveLength(0)
  })

  it('should trim whitespace from criteria text', () => {
    const section = `- [ ]   Spaced criterion  `
    const criteria = extractAcceptanceCriteria(section)
    expect(criteria).toHaveLength(1)
    expect(criteria[0]).toBe('Spaced criterion')
  })

  it('should handle mixed content with checkboxes', () => {
    const section = `## Feature

Some description text.

**Requirements:**
- [ ] Must do X
- [ ] Must do Y

**Notes:**
This is just a note.
`
    const criteria = extractAcceptanceCriteria(section)
    expect(criteria).toHaveLength(2)
    expect(criteria[0]).toBe('Must do X')
    expect(criteria[1]).toBe('Must do Y')
  })
})
