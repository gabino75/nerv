/**
 * Unit tests for daily and monthly budget alerts (PRD Section 14 & 20)
 *
 * Tests MetricsOperations.checkBudgetAlerts() with daily budget support
 * and getDailyTotalCost() method.
 *
 * Uses a mock database since better-sqlite3 native module is not available
 * in the unit test environment.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MetricsOperations } from '../../src/main/database/metrics'

// Create a mock database that returns configurable results
function createMockDb(options: {
  monthlyTotalCost?: number
  monthlyTaskCount?: number
  dailyTotalCost?: number
  dailyTaskCount?: number
}) {
  const {
    monthlyTotalCost = 0,
    monthlyTaskCount = 0,
    dailyTotalCost = 0,
    dailyTaskCount = 0
  } = options

  return {
    prepare: vi.fn((sql: string) => {
      // Match the monthly cost query
      if (sql.includes('SUM(cost_usd)') && sql.includes('updated_at >= ?') && !sql.includes('date(updated_at)')) {
        return {
          get: vi.fn(() => ({ total_cost: monthlyTotalCost, task_count: monthlyTaskCount }))
        }
      }
      // Match the daily cost query
      if (sql.includes('SUM(cost_usd)') && sql.includes('date(updated_at) = ?')) {
        return {
          get: vi.fn(() => ({ total_cost: dailyTotalCost, task_count: dailyTaskCount }))
        }
      }
      return { get: vi.fn(() => null), all: vi.fn(() => []) }
    })
  }
}

describe('Budget Alerts', () => {
  describe('checkBudgetAlerts - monthly', () => {
    it('should return no alerts when no budget set', () => {
      const db = createMockDb({ monthlyTotalCost: 100 })
      const metrics = new MetricsOperations(() => db as never)
      const alerts = metrics.checkBudgetAlerts(0)
      expect(alerts).toHaveLength(0)
    })

    it('should return no alerts when under warning threshold', () => {
      const db = createMockDb({ monthlyTotalCost: 10 })
      const metrics = new MetricsOperations(() => db as never)
      const alerts = metrics.checkBudgetAlerts(50, 0.8, 0.95)
      expect(alerts).toHaveLength(0)
    })

    it('should return warning when monthly threshold crossed', () => {
      const db = createMockDb({ monthlyTotalCost: 42 })
      const metrics = new MetricsOperations(() => db as never)
      const alerts = metrics.checkBudgetAlerts(50, 0.8, 0.95)
      expect(alerts).toHaveLength(1)
      expect(alerts[0].type).toBe('warning')
      expect(alerts[0].scope).toBe('monthly')
      expect(alerts[0].currentSpend).toBe(42)
      expect(alerts[0].budgetLimit).toBe(50)
    })

    it('should return critical when critical threshold crossed', () => {
      const db = createMockDb({ monthlyTotalCost: 48 })
      const metrics = new MetricsOperations(() => db as never)
      const alerts = metrics.checkBudgetAlerts(50, 0.8, 0.95)
      expect(alerts).toHaveLength(1)
      expect(alerts[0].type).toBe('critical')
      expect(alerts[0].scope).toBe('monthly')
    })

    it('should include daysUntilExceeded in monthly alert', () => {
      const db = createMockDb({ monthlyTotalCost: 42 })
      const metrics = new MetricsOperations(() => db as never)
      const alerts = metrics.checkBudgetAlerts(50, 0.8, 0.95)
      expect(alerts).toHaveLength(1)
      if (alerts[0].daysUntilExceeded !== null) {
        expect(alerts[0].daysUntilExceeded).toBeGreaterThan(0)
      }
    })

    it('should include formatted message with budget amounts', () => {
      const db = createMockDb({ monthlyTotalCost: 42 })
      const metrics = new MetricsOperations(() => db as never)
      const alerts = metrics.checkBudgetAlerts(50, 0.8, 0.95)
      expect(alerts[0].message).toContain('$42.00')
      expect(alerts[0].message).toContain('$50.00')
    })
  })

  describe('checkBudgetAlerts - daily', () => {
    it('should skip daily alerts when dailyBudget is 0', () => {
      const db = createMockDb({ monthlyTotalCost: 10, dailyTotalCost: 100 })
      const metrics = new MetricsOperations(() => db as never)
      const alerts = metrics.checkBudgetAlerts(1000, 0.8, 0.95, 0)
      const dailyAlerts = alerts.filter(a => a.scope === 'daily')
      expect(dailyAlerts).toHaveLength(0)
    })

    it('should return daily warning when daily threshold crossed', () => {
      const db = createMockDb({ monthlyTotalCost: 10, dailyTotalCost: 9 })
      const metrics = new MetricsOperations(() => db as never)
      // Monthly: 10/1000 = 1% (ok), Daily: 9/10 = 90% (warning at 80%)
      const alerts = metrics.checkBudgetAlerts(1000, 0.8, 0.95, 10)
      const dailyAlerts = alerts.filter(a => a.scope === 'daily')
      expect(dailyAlerts).toHaveLength(1)
      expect(dailyAlerts[0].type).toBe('warning')
      expect(dailyAlerts[0].scope).toBe('daily')
      expect(dailyAlerts[0].currentSpend).toBe(9)
      expect(dailyAlerts[0].budgetLimit).toBe(10)
      expect(dailyAlerts[0].daysUntilExceeded).toBeNull()
    })

    it('should return daily critical when daily critical threshold crossed', () => {
      const db = createMockDb({ monthlyTotalCost: 10, dailyTotalCost: 9.6 })
      const metrics = new MetricsOperations(() => db as never)
      const alerts = metrics.checkBudgetAlerts(1000, 0.8, 0.95, 10)
      const dailyAlerts = alerts.filter(a => a.scope === 'daily')
      expect(dailyAlerts).toHaveLength(1)
      expect(dailyAlerts[0].type).toBe('critical')
      expect(dailyAlerts[0].scope).toBe('daily')
    })

    it('should return no daily alerts when under threshold', () => {
      const db = createMockDb({ monthlyTotalCost: 5, dailyTotalCost: 5 })
      const metrics = new MetricsOperations(() => db as never)
      const alerts = metrics.checkBudgetAlerts(1000, 0.8, 0.95, 10)
      const dailyAlerts = alerts.filter(a => a.scope === 'daily')
      expect(dailyAlerts).toHaveLength(0)
    })

    it('should return both monthly and daily alerts when both exceeded', () => {
      const db = createMockDb({ monthlyTotalCost: 45, dailyTotalCost: 45 })
      const metrics = new MetricsOperations(() => db as never)
      // Monthly: 45/50=90% (warning), Daily: 45/10=450% (critical)
      const alerts = metrics.checkBudgetAlerts(50, 0.8, 0.95, 10)
      const monthlyAlerts = alerts.filter(a => a.scope === 'monthly')
      const dailyAlerts = alerts.filter(a => a.scope === 'daily')
      expect(monthlyAlerts).toHaveLength(1)
      expect(dailyAlerts).toHaveLength(1)
    })

    it('should include formatted message with daily budget amounts', () => {
      const db = createMockDb({ monthlyTotalCost: 10, dailyTotalCost: 9 })
      const metrics = new MetricsOperations(() => db as never)
      const alerts = metrics.checkBudgetAlerts(1000, 0.8, 0.95, 10)
      const dailyAlerts = alerts.filter(a => a.scope === 'daily')
      expect(dailyAlerts[0].message).toContain('$9.00')
      expect(dailyAlerts[0].message).toContain('$10.00')
      expect(dailyAlerts[0].message).toContain('daily')
    })
  })

  describe('getDailyTotalCost', () => {
    it('should return zero when no metrics exist', () => {
      const db = createMockDb({ dailyTotalCost: 0, dailyTaskCount: 0 })
      const metrics = new MetricsOperations(() => db as never)
      const daily = metrics.getDailyTotalCost()
      expect(daily.totalCost).toBe(0)
      expect(daily.taskCount).toBe(0)
      expect(daily.date).toBe(new Date().toISOString().slice(0, 10))
    })

    it('should return todays spending', () => {
      const db = createMockDb({ dailyTotalCost: 5.5, dailyTaskCount: 1 })
      const metrics = new MetricsOperations(() => db as never)
      const daily = metrics.getDailyTotalCost()
      expect(daily.totalCost).toBe(5.5)
      expect(daily.taskCount).toBe(1)
    })

    it('should return correct date as YYYY-MM-DD', () => {
      const db = createMockDb({ dailyTotalCost: 0, dailyTaskCount: 0 })
      const metrics = new MetricsOperations(() => db as never)
      const daily = metrics.getDailyTotalCost()
      expect(daily.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })
  })
})
