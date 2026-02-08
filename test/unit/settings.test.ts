/**
 * Unit tests for src/core/settings.ts
 *
 * Tests for PRD Section 12: Settings Hierarchy
 * with PRD Section 20: Organization Configuration merge
 *
 * Resolution priority (highest to lowest):
 * 1. Environment variables (NERV_*)
 * 2. Project config (.nerv/config.json or nerv.config.json)
 * 3. Organization config (org-config/settings.json)
 * 4. Global config (~/.nerv/config.json)
 * 5. Default values
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { DEFAULT_SETTINGS } from '../../src/shared/constants'
import type { OrganizationSettings } from '../../src/shared/types/settings'

// Mock fs module
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn()
}))

// Mock org-config module to return null (we'll use setOrgSettings for testing)
vi.mock('../../src/core/org-config.js', () => ({
  loadOrgSettings: vi.fn(() => null)
}))

// Import after mocks
import { createSettingsService, resetSettingsService } from '../../src/core/settings'

describe('settings', () => {
  const mockExistsSync = existsSync as unknown as ReturnType<typeof vi.fn>
  const mockReadFileSync = readFileSync as unknown as ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.resetAllMocks()
    resetSettingsService()

    // Default: no config files exist
    mockExistsSync.mockReturnValue(false)
  })

  afterEach(() => {
    // Clean up env vars
    delete process.env.NERV_DEFAULT_MODEL
    delete process.env.NERV_MONTHLY_BUDGET
    resetSettingsService()
  })

  describe('default values', () => {
    it('returns default values when no config exists', () => {
      const service = createSettingsService()

      expect(service.get('default_model')).toBe(DEFAULT_SETTINGS.default_model)
      expect(service.get('monthly_budget_usd')).toBe(DEFAULT_SETTINGS.monthly_budget_usd)
      expect(service.get('audit_cycle_frequency')).toBe(DEFAULT_SETTINGS.audit_cycle_frequency)
    })

    it('reports source as default', () => {
      const service = createSettingsService()

      const result = service.getWithSource('default_model')
      expect(result.source).toBe('default')
    })
  })

  describe('global config', () => {
    it('loads settings from global config', () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path.includes('.nerv') && path.endsWith('config.json')
      })
      mockReadFileSync.mockImplementation((path: string) => {
        if (path.includes('.nerv') && path.endsWith('config.json')) {
          return JSON.stringify({
            config_version: 1,
            default_model: 'opus',
            monthly_budget_usd: 200
          })
        }
        throw new Error('File not found')
      })

      const service = createSettingsService()

      expect(service.get('default_model')).toBe('opus')
      expect(service.get('monthly_budget_usd')).toBe(200)
    })

    it('reports source as global', () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path.includes('.nerv') && path.endsWith('config.json')
      })
      mockReadFileSync.mockImplementation((path: string) => {
        if (path.includes('.nerv') && path.endsWith('config.json')) {
          return JSON.stringify({ default_model: 'haiku' })
        }
        throw new Error('File not found')
      })

      const service = createSettingsService()

      const result = service.getWithSource('default_model')
      expect(result.value).toBe('haiku')
      expect(result.source).toBe('global')
    })
  })

  describe('organization config merge', () => {
    it('loads org settings between global and project', () => {
      const service = createSettingsService()

      // Inject org settings using setOrgSettings
      const orgSettings: OrganizationSettings = {
        name: 'TestOrg',
        defaults: {
          model: 'opus',
          auditFrequency: 10
        }
      }
      service.setOrgSettings(orgSettings)

      // Should get org settings since no project config
      expect(service.get('default_model')).toBe('opus')
      expect(service.get('audit_cycle_frequency')).toBe(10)
    })

    it('reports source as organization', () => {
      const service = createSettingsService()

      const orgSettings: OrganizationSettings = {
        name: 'TestOrg',
        defaults: {
          model: 'haiku'
        }
      }
      service.setOrgSettings(orgSettings)

      const result = service.getWithSource('default_model')
      expect(result.value).toBe('haiku')
      expect(result.source).toBe('organization')
    })

    it('org settings override global settings', () => {
      // Global config has sonnet
      mockExistsSync.mockImplementation((path: string) => {
        return path.includes('.nerv') && path.endsWith('config.json')
      })
      mockReadFileSync.mockImplementation((path: string) => {
        if (path.includes('.nerv') && path.endsWith('config.json')) {
          return JSON.stringify({ default_model: 'sonnet' })
        }
        throw new Error('File not found')
      })

      const service = createSettingsService()

      // Inject org config with opus
      const orgSettings: OrganizationSettings = {
        name: 'TestOrg',
        defaults: {
          model: 'opus'
        }
      }
      service.setOrgSettings(orgSettings)

      // Org should win over global
      expect(service.get('default_model')).toBe('opus')
      expect(service.getWithSource('default_model').source).toBe('organization')
    })

    it('project settings override org settings', () => {
      const projectPath = '/test/project'

      // Project config file
      mockExistsSync.mockImplementation((path: string) => {
        if (path === join(projectPath, '.nerv', 'config.json')) return true
        return false
      })
      mockReadFileSync.mockImplementation((path: string) => {
        if (path === join(projectPath, '.nerv', 'config.json')) {
          return JSON.stringify({ default_model: 'haiku' })
        }
        throw new Error('File not found')
      })

      const service = createSettingsService(projectPath)

      // Inject org config with opus
      const orgSettings: OrganizationSettings = {
        name: 'TestOrg',
        defaults: {
          model: 'opus'
        }
      }
      service.setOrgSettings(orgSettings)

      // Project should win over org
      expect(service.get('default_model')).toBe('haiku')
      expect(service.getWithSource('default_model').source).toBe('project')
    })

    it('maps org cost limits to budget settings', () => {
      const service = createSettingsService()

      const orgSettings: OrganizationSettings = {
        name: 'TestOrg',
        costLimits: {
          perMonthMax: 500,
          alertThreshold: 0.75
        }
      }
      service.setOrgSettings(orgSettings)

      expect(service.get('monthly_budget_usd')).toBe(500)
      expect(service.get('budget_warning_threshold')).toBe(0.75)
    })

    it('returns null org settings when not configured', () => {
      const service = createSettingsService()

      expect(service.getOrgSettings()).toBeNull()
    })

    it('returns org settings when configured', () => {
      const service = createSettingsService()

      const orgSettings: OrganizationSettings = {
        name: 'TestOrg',
        defaults: { model: 'opus' }
      }
      service.setOrgSettings(orgSettings)

      const retrieved = service.getOrgSettings()
      expect(retrieved).not.toBeNull()
      expect(retrieved?.name).toBe('TestOrg')
    })
  })

  describe('environment variables', () => {
    it('environment overrides all other sources', () => {
      // Set up global config
      mockExistsSync.mockImplementation((path: string) => {
        return path.includes('.nerv') && path.endsWith('config.json')
      })
      mockReadFileSync.mockImplementation((path: string) => {
        if (path.includes('.nerv') && path.endsWith('config.json')) {
          return JSON.stringify({ default_model: 'sonnet' })
        }
        throw new Error('File not found')
      })

      const service = createSettingsService()

      // Set org settings
      const orgSettings: OrganizationSettings = {
        name: 'TestOrg',
        defaults: { model: 'opus' }
      }
      service.setOrgSettings(orgSettings)

      // Environment variable should win
      process.env.NERV_DEFAULT_MODEL = 'haiku'
      // Need to reload to pick up env vars properly
      service.reload()
      service.setOrgSettings(orgSettings) // Re-apply org settings after reload

      expect(service.get('default_model')).toBe('haiku')
      expect(service.getWithSource('default_model').source).toBe('environment')
    })
  })

  describe('getAllWithSources', () => {
    it('returns all settings with their sources', () => {
      const service = createSettingsService()

      const orgSettings: OrganizationSettings = {
        name: 'TestOrg',
        defaults: { model: 'opus' }
      }
      service.setOrgSettings(orgSettings)

      const allSettings = service.getAllWithSources()

      expect(allSettings.default_model.value).toBe('opus')
      expect(allSettings.default_model.source).toBe('organization')

      // Non-org settings should be defaults
      expect(allSettings.terminal_cols.source).toBe('default')
    })
  })
})
