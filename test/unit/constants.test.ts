/**
 * Unit tests for src/shared/constants.ts
 */

import { describe, it, expect } from 'vitest'
import {
  MODEL_CONTEXT_SIZES,
  DEFAULT_MODEL,
  DEFAULT_MAX_TURNS,
  TERMINAL_DEFAULTS,
  PTY_DEFAULTS,
  WINDOW_DEFAULTS,
  COMPACTION_THRESHOLD,
  ID_RANDOM_LENGTH,
  generateId,
  THEME,
  TASK_STATUS_CONFIG,
  TASK_TYPE_LABELS,
  IPC_CHANNELS,
  NERV_DIR_NAME,
  NERV_MD_FILENAME,
  CLAUDE_MD_FILENAME,
} from '../../src/shared/constants'

describe('constants', () => {
  describe('MODEL_CONTEXT_SIZES', () => {
    it('contains all expected model keys', () => {
      expect(MODEL_CONTEXT_SIZES).toHaveProperty('claude-sonnet-4-20250514')
      expect(MODEL_CONTEXT_SIZES).toHaveProperty('claude-opus-4-20250514')
      expect(MODEL_CONTEXT_SIZES).toHaveProperty('claude-haiku-3-5-20241022')
      expect(MODEL_CONTEXT_SIZES).toHaveProperty('sonnet')
      expect(MODEL_CONTEXT_SIZES).toHaveProperty('opus')
      expect(MODEL_CONTEXT_SIZES).toHaveProperty('haiku')
    })

    it('all context sizes are 200,000', () => {
      for (const [model, size] of Object.entries(MODEL_CONTEXT_SIZES)) {
        expect(size).toBe(200_000)
      }
    })
  })

  describe('DEFAULT_MODEL', () => {
    it('is sonnet', () => {
      expect(DEFAULT_MODEL).toBe('sonnet')
    })
  })

  describe('DEFAULT_MAX_TURNS', () => {
    it('is 100', () => {
      expect(DEFAULT_MAX_TURNS).toBe(100)
    })
  })

  describe('TERMINAL_DEFAULTS', () => {
    it('has cols and rows', () => {
      expect(TERMINAL_DEFAULTS.cols).toBe(120)
      expect(TERMINAL_DEFAULTS.rows).toBe(30)
    })
  })

  describe('PTY_DEFAULTS', () => {
    it('has cols and rows', () => {
      expect(PTY_DEFAULTS.cols).toBe(80)
      expect(PTY_DEFAULTS.rows).toBe(24)
    })
  })

  describe('WINDOW_DEFAULTS', () => {
    it('has dimensions', () => {
      expect(WINDOW_DEFAULTS.width).toBe(1400)
      expect(WINDOW_DEFAULTS.height).toBe(900)
      expect(WINDOW_DEFAULTS.minWidth).toBe(800)
      expect(WINDOW_DEFAULTS.minHeight).toBe(600)
    })
  })

  describe('COMPACTION_THRESHOLD', () => {
    it('is 0.5 (50%)', () => {
      expect(COMPACTION_THRESHOLD).toBe(0.5)
    })
  })

  describe('generateId', () => {
    it('generates unique IDs', () => {
      const id1 = generateId()
      const id2 = generateId()
      expect(id1).not.toBe(id2)
    })

    it('generates ID without prefix', () => {
      const id = generateId()
      // Format: {timestamp}-{random}
      expect(id).toMatch(/^\d+-[a-z0-9]+$/)
    })

    it('generates ID with prefix', () => {
      const id = generateId('task')
      // Format: {prefix}-{timestamp}-{random}
      expect(id).toMatch(/^task-\d+-[a-z0-9]+$/)
    })

    it('random part has correct length', () => {
      const id = generateId('test')
      const parts = id.split('-')
      // parts: ['test', timestamp, random]
      expect(parts.length).toBe(3)
      expect(parts[2].length).toBe(ID_RANDOM_LENGTH)
    })

    it('timestamp part is a valid timestamp', () => {
      const before = Date.now()
      const id = generateId('test')
      const after = Date.now()

      const parts = id.split('-')
      const timestamp = parseInt(parts[1], 10)

      expect(timestamp).toBeGreaterThanOrEqual(before)
      expect(timestamp).toBeLessThanOrEqual(after)
    })
  })

  describe('THEME', () => {
    it('has colors object', () => {
      expect(THEME.colors).toBeDefined()
      expect(THEME.colors.primary).toBe('#ff6b35')
      expect(THEME.colors.background).toBe('#0a0a0f')
      expect(THEME.colors.success).toBe('#4ade80')
      expect(THEME.colors.error).toBe('#ef4444')
    })

    it('has zIndex object', () => {
      expect(THEME.zIndex).toBeDefined()
      expect(THEME.zIndex.dropdown).toBe(100)
      expect(THEME.zIndex.modal).toBe(1000)
      expect(THEME.zIndex.notification).toBe(2000)
    })

    it('zIndex values are in correct order', () => {
      expect(THEME.zIndex.dropdown).toBeLessThan(THEME.zIndex.modal)
      expect(THEME.zIndex.modal).toBeLessThan(THEME.zIndex.tooltip)
      expect(THEME.zIndex.tooltip).toBeLessThan(THEME.zIndex.notification)
    })
  })

  describe('TASK_STATUS_CONFIG', () => {
    it('has all task statuses', () => {
      expect(TASK_STATUS_CONFIG).toHaveProperty('todo')
      expect(TASK_STATUS_CONFIG).toHaveProperty('in_progress')
      expect(TASK_STATUS_CONFIG).toHaveProperty('interrupted')
      expect(TASK_STATUS_CONFIG).toHaveProperty('review')
      expect(TASK_STATUS_CONFIG).toHaveProperty('done')
    })

    it('each status has icon, color, and label', () => {
      for (const status of Object.values(TASK_STATUS_CONFIG)) {
        expect(status).toHaveProperty('icon')
        expect(status).toHaveProperty('color')
        expect(status).toHaveProperty('label')
        expect(typeof status.icon).toBe('string')
        expect(typeof status.color).toBe('string')
        expect(typeof status.label).toBe('string')
      }
    })
  })

  describe('TASK_TYPE_LABELS', () => {
    it('has implementation and research types', () => {
      expect(TASK_TYPE_LABELS.implementation).toBe('Impl')
      expect(TASK_TYPE_LABELS.research).toBe('Research')
    })
  })

  describe('IPC_CHANNELS', () => {
    it('has terminal channels', () => {
      expect(IPC_CHANNELS.TERMINAL_DATA).toBe('terminal:data')
      expect(IPC_CHANNELS.TERMINAL_EXIT).toBe('terminal:exit')
    })

    it('has claude channels', () => {
      expect(IPC_CHANNELS.CLAUDE_DATA).toBe('claude:data')
      expect(IPC_CHANNELS.CLAUDE_SESSION_ID).toBe('claude:sessionId')
      expect(IPC_CHANNELS.CLAUDE_TOKEN_USAGE).toBe('claude:tokenUsage')
    })
  })

  describe('File paths', () => {
    it('has correct file names', () => {
      expect(NERV_DIR_NAME).toBe('.nerv')
      expect(NERV_MD_FILENAME).toBe('NERV.md')
      expect(CLAUDE_MD_FILENAME).toBe('CLAUDE.md')
    })
  })
})
