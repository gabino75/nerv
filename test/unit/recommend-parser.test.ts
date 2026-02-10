/**
 * Unit tests for recommendation parser
 *
 * Tests parseRecommendations() against real-world Claude output patterns:
 * clean JSON, markdown fences, surrounding text, malformed responses.
 */

import { describe, it, expect } from 'vitest'
import { parseRecommendations, parseRecommendation } from '../../src/shared/prompts/recommend'

const VALID_REC = {
  phase: 'mvp' as const,
  action: 'create_cycle' as const,
  title: 'Create first development cycle',
  description: 'Start building the MVP with a focused cycle.',
  details: 'Create a cycle targeting core functionality.',
  params: { cycleGoal: 'MVP implementation' },
}

const VALID_REC_2 = {
  phase: 'mvp' as const,
  action: 'explore_codebase' as const,
  title: 'Explore the codebase',
  description: 'Understand existing code patterns.',
  details: 'Look at directory structure and key files.',
}

describe('parseRecommendations()', () => {
  describe('clean JSON responses', () => {
    it('parses a valid JSON array', () => {
      const raw = JSON.stringify([VALID_REC, VALID_REC_2])
      const result = parseRecommendations(raw)
      expect(result).toHaveLength(2)
      expect(result[0].action).toBe('create_cycle')
      expect(result[1].action).toBe('explore_codebase')
    })

    it('parses a single JSON object', () => {
      const raw = JSON.stringify(VALID_REC)
      const result = parseRecommendations(raw)
      expect(result).toHaveLength(1)
      expect(result[0].action).toBe('create_cycle')
    })

    it('preserves params', () => {
      const raw = JSON.stringify([VALID_REC])
      const result = parseRecommendations(raw)
      expect(result[0].params?.cycleGoal).toBe('MVP implementation')
    })
  })

  describe('markdown code fences', () => {
    it('handles ```json ... ``` fences', () => {
      const raw = '```json\n' + JSON.stringify([VALID_REC]) + '\n```'
      const result = parseRecommendations(raw)
      expect(result).toHaveLength(1)
      expect(result[0].action).toBe('create_cycle')
    })

    it('handles ``` ... ``` fences without language tag', () => {
      const raw = '```\n' + JSON.stringify([VALID_REC]) + '\n```'
      const result = parseRecommendations(raw)
      expect(result).toHaveLength(1)
    })
  })

  describe('surrounding text (real Claude patterns)', () => {
    it('handles text before JSON array', () => {
      const raw = 'Here are my recommendations:\n\n' + JSON.stringify([VALID_REC, VALID_REC_2])
      const result = parseRecommendations(raw)
      expect(result).toHaveLength(2)
      expect(result[0].action).toBe('create_cycle')
    })

    it('handles text after JSON array', () => {
      const raw = JSON.stringify([VALID_REC]) + '\n\nI recommend starting with cycle creation.'
      const result = parseRecommendations(raw)
      expect(result).toHaveLength(1)
      expect(result[0].action).toBe('create_cycle')
    })

    it('handles text before AND after JSON array', () => {
      const raw = 'Based on your project state:\n\n' +
        JSON.stringify([VALID_REC, VALID_REC_2]) +
        '\n\nThese recommendations prioritize MVP development.'
      const result = parseRecommendations(raw)
      expect(result).toHaveLength(2)
    })

    it('handles text before single JSON object', () => {
      const raw = 'My recommendation:\n' + JSON.stringify(VALID_REC)
      const result = parseRecommendations(raw)
      expect(result).toHaveLength(1)
    })

    it('handles code fences with surrounding text', () => {
      const raw = 'Here are my suggestions:\n\n```json\n' +
        JSON.stringify([VALID_REC]) +
        '\n```\n\nLet me know if you need more details.'
      const result = parseRecommendations(raw)
      expect(result).toHaveLength(1)
    })
  })

  describe('filtering invalid recommendations', () => {
    it('filters out items missing phase', () => {
      const raw = JSON.stringify([
        { action: 'create_cycle', title: 'Test', description: 'Desc', details: 'Det' },
        VALID_REC,
      ])
      const result = parseRecommendations(raw)
      expect(result).toHaveLength(1)
      expect(result[0].action).toBe('create_cycle')
    })

    it('filters out items missing action', () => {
      const raw = JSON.stringify([
        { phase: 'mvp', title: 'Test', description: 'Desc', details: 'Det' },
      ])
      const result = parseRecommendations(raw)
      expect(result).toHaveLength(0)
    })

    it('filters out items missing title', () => {
      const raw = JSON.stringify([
        { phase: 'mvp', action: 'create_cycle', description: 'Desc', details: 'Det' },
      ])
      const result = parseRecommendations(raw)
      expect(result).toHaveLength(0)
    })

    it('filters out items missing description', () => {
      const raw = JSON.stringify([
        { phase: 'mvp', action: 'create_cycle', title: 'Test', details: 'Det' },
      ])
      const result = parseRecommendations(raw)
      expect(result).toHaveLength(0)
    })

    it('returns empty array for all invalid items', () => {
      const raw = JSON.stringify([{ foo: 'bar' }, { baz: 123 }])
      const result = parseRecommendations(raw)
      expect(result).toHaveLength(0)
    })
  })

  describe('malformed responses', () => {
    it('returns empty array for empty string', () => {
      expect(parseRecommendations('')).toHaveLength(0)
    })

    it('returns empty array for plain text with no JSON', () => {
      expect(parseRecommendations('I cannot provide recommendations right now.')).toHaveLength(0)
    })

    it('returns empty array for null-like values', () => {
      expect(parseRecommendations('null')).toHaveLength(0)
    })

    it('returns empty array for number', () => {
      expect(parseRecommendations('42')).toHaveLength(0)
    })

    it('returns empty array for incomplete JSON', () => {
      expect(parseRecommendations('[{"phase":"mvp"')).toHaveLength(0)
    })
  })

  describe('edge cases', () => {
    it('handles pretty-printed JSON', () => {
      const raw = JSON.stringify([VALID_REC], null, 2)
      const result = parseRecommendations(raw)
      expect(result).toHaveLength(1)
    })

    it('handles array with 3 recommendations', () => {
      const rec3 = { ...VALID_REC, action: 'run_audit' as const, title: 'Run audit' }
      const raw = JSON.stringify([VALID_REC, VALID_REC_2, rec3])
      const result = parseRecommendations(raw)
      expect(result).toHaveLength(3)
    })

    it('handles nested JSON in params without confusing bracket matching', () => {
      const rec = {
        ...VALID_REC,
        params: { cycleGoal: 'Build {core} features', taskTitle: 'Task [1]' },
      }
      const raw = JSON.stringify([rec])
      const result = parseRecommendations(raw)
      expect(result).toHaveLength(1)
      expect(result[0].params?.cycleGoal).toBe('Build {core} features')
    })

    it('handles whitespace around JSON', () => {
      const raw = '   \n\n  ' + JSON.stringify([VALID_REC]) + '   \n\n  '
      const result = parseRecommendations(raw)
      expect(result).toHaveLength(1)
    })
  })
})

describe('parseRecommendation()', () => {
  it('returns first recommendation from array', () => {
    const raw = JSON.stringify([VALID_REC, VALID_REC_2])
    const result = parseRecommendation(raw)
    expect(result).not.toBeNull()
    expect(result!.action).toBe('create_cycle')
  })

  it('returns null for empty response', () => {
    expect(parseRecommendation('')).toBeNull()
  })

  it('returns null for invalid JSON', () => {
    expect(parseRecommendation('not json')).toBeNull()
  })
})
