/**
 * Unit tests for src/main/utils.ts
 *
 * Note: broadcastToRenderers and sendToWindow are not tested here
 * as they require Electron mocking. Those would be integration tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Since utils.ts imports from electron, we need to mock it
vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
    fromId: vi.fn(() => null),
  },
}))

// Now import the functions
import { debounce, safeJsonParse, formatBytes, formatNumber, truncate } from '../../src/main/utils'

describe('utils', () => {
  describe('debounce', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('delays function execution', () => {
      const fn = vi.fn()
      const debouncedFn = debounce(fn, 100)

      debouncedFn()
      expect(fn).not.toHaveBeenCalled()

      vi.advanceTimersByTime(50)
      expect(fn).not.toHaveBeenCalled()

      vi.advanceTimersByTime(50)
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('resets delay on subsequent calls', () => {
      const fn = vi.fn()
      const debouncedFn = debounce(fn, 100)

      debouncedFn()
      vi.advanceTimersByTime(50)

      debouncedFn() // Reset the timer
      vi.advanceTimersByTime(50)
      expect(fn).not.toHaveBeenCalled()

      vi.advanceTimersByTime(50)
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('passes arguments to debounced function', () => {
      const fn = vi.fn()
      const debouncedFn = debounce(fn, 100)

      debouncedFn('arg1', 'arg2')
      vi.advanceTimersByTime(100)

      expect(fn).toHaveBeenCalledWith('arg1', 'arg2')
    })

    it('uses last arguments when called multiple times', () => {
      const fn = vi.fn()
      const debouncedFn = debounce(fn, 100)

      debouncedFn('first')
      debouncedFn('second')
      debouncedFn('third')
      vi.advanceTimersByTime(100)

      expect(fn).toHaveBeenCalledTimes(1)
      expect(fn).toHaveBeenCalledWith('third')
    })
  })

  describe('safeJsonParse', () => {
    it('parses valid JSON', () => {
      const result = safeJsonParse('{"name":"test","value":123}', {})
      expect(result).toEqual({ name: 'test', value: 123 })
    })

    it('returns fallback for invalid JSON', () => {
      const fallback = { default: true }
      const result = safeJsonParse('not valid json', fallback)
      expect(result).toBe(fallback)
    })

    it('returns fallback for empty string', () => {
      const fallback = { default: true }
      const result = safeJsonParse('', fallback)
      expect(result).toBe(fallback)
    })

    it('parses arrays', () => {
      const result = safeJsonParse<number[]>('[1,2,3]', [])
      expect(result).toEqual([1, 2, 3])
    })

    it('parses primitive values', () => {
      expect(safeJsonParse('"hello"', '')).toBe('hello')
      expect(safeJsonParse('123', 0)).toBe(123)
      expect(safeJsonParse('true', false)).toBe(true)
      expect(safeJsonParse('null', 'fallback')).toBe(null)
    })

    it('handles malformed JSON gracefully', () => {
      expect(safeJsonParse('{ "unclosed": ', {})).toEqual({})
      expect(safeJsonParse("{'single': 'quotes'}", {})).toEqual({})
      expect(safeJsonParse('undefined', null)).toBe(null)
    })
  })

  describe('formatBytes', () => {
    it('formats 0 bytes', () => {
      expect(formatBytes(0)).toBe('0 B')
    })

    it('formats bytes', () => {
      expect(formatBytes(500)).toBe('500 B')
      expect(formatBytes(1023)).toBe('1023 B')
    })

    it('formats kilobytes', () => {
      expect(formatBytes(1024)).toBe('1 KB')
      expect(formatBytes(1536)).toBe('1.5 KB')
      expect(formatBytes(10240)).toBe('10 KB')
    })

    it('formats megabytes', () => {
      expect(formatBytes(1048576)).toBe('1 MB')
      expect(formatBytes(1572864)).toBe('1.5 MB')
      expect(formatBytes(10485760)).toBe('10 MB')
    })

    it('formats gigabytes', () => {
      expect(formatBytes(1073741824)).toBe('1 GB')
      expect(formatBytes(1610612736)).toBe('1.5 GB')
    })
  })

  describe('formatNumber', () => {
    it('formats small numbers', () => {
      expect(formatNumber(0)).toBe('0')
      expect(formatNumber(999)).toBe('999')
    })

    it('formats numbers with thousand separators', () => {
      // Note: toLocaleString() result depends on locale
      // In most English locales, this would use commas
      const result = formatNumber(1000)
      expect(result).toContain('1')
      expect(result.length).toBeGreaterThan(3) // Should have separator
    })

    it('formats large numbers', () => {
      const result = formatNumber(1000000)
      expect(result).toContain('1')
      expect(result).toContain('000')
    })

    it('formats negative numbers', () => {
      const result = formatNumber(-1234)
      expect(result).toContain('-')
      expect(result).toContain('1')
    })
  })

  describe('truncate', () => {
    it('returns string unchanged if shorter than maxLength', () => {
      expect(truncate('hello', 10)).toBe('hello')
      expect(truncate('hello', 5)).toBe('hello')
    })

    it('truncates string longer than maxLength', () => {
      expect(truncate('hello world', 8)).toBe('hello...')
    })

    it('handles maxLength of 3 (minimum for ellipsis)', () => {
      expect(truncate('hello', 3)).toBe('...')
    })

    it('handles exact boundary length', () => {
      expect(truncate('hello', 6)).toBe('hello')
      expect(truncate('helloo', 6)).toBe('helloo')
      expect(truncate('hellooo', 6)).toBe('hel...')
    })

    it('handles empty string', () => {
      expect(truncate('', 10)).toBe('')
    })

    it('truncates to show reasonable content', () => {
      const longText = 'This is a very long string that needs truncation'
      const result = truncate(longText, 20)
      expect(result).toBe('This is a very lo...')
      expect(result.length).toBe(20)
    })
  })
})
