/**
 * Unit tests for src/core/org-config.ts
 *
 * Tests for PRD Section 20: Organization Configuration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { ORG_CONFIG, DEFAULT_SETTINGS } from '../../src/shared/constants'

// Mock fs module
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn()
}))

// Mock child_process module
vi.mock('child_process', () => ({
  execSync: vi.fn(),
  spawnSync: vi.fn()
}))

// Mock settings service
vi.mock('../../src/core/settings', () => ({
  getSettingsService: vi.fn(() => ({
    get: vi.fn((key: string) => {
      const mockSettings: Record<string, unknown> = {
        org_name: null,
        org_config_source_type: null,
        org_config_url: null,
        org_config_branch: null,
        org_config_auth_method: null,
        org_auto_sync_enabled: false,
        org_auto_sync_interval_minutes: 60,
        org_auto_sync_on_app_start: true,
        org_auto_sync_on_project_open: true,
        org_cache_path: null
      }
      return mockSettings[key]
    })
  }))
}))

describe('org-config constants', () => {
  describe('ORG_CONFIG', () => {
    it('has default cache directory', () => {
      expect(ORG_CONFIG.defaultCacheDir).toBe('org-config')
    })

    it('has settings file name', () => {
      expect(ORG_CONFIG.settingsFile).toBe('settings.json')
    })

    it('has permissions file name', () => {
      expect(ORG_CONFIG.permissionsFile).toBe('permissions.json')
    })

    it('has all required directories', () => {
      expect(ORG_CONFIG.directories).toHaveProperty('agents')
      expect(ORG_CONFIG.directories).toHaveProperty('skills')
      expect(ORG_CONFIG.directories).toHaveProperty('workflows')
      expect(ORG_CONFIG.directories).toHaveProperty('templates')
      expect(ORG_CONFIG.directories).toHaveProperty('hooks')
      expect(ORG_CONFIG.directories).toHaveProperty('terminalProfiles')
    })

    it('has terminalProfiles directory defined', () => {
      expect(ORG_CONFIG.directories.terminalProfiles).toBe('terminal-profiles')
    })

    it('has default sync interval', () => {
      expect(ORG_CONFIG.defaultSyncIntervalMinutes).toBe(60)
    })

    it('has sync status file name', () => {
      expect(ORG_CONFIG.syncStatusFile).toBe('sync-status.json')
    })
  })
})

describe('DEFAULT_SETTINGS org fields', () => {
  it('has org_name default as null', () => {
    expect(DEFAULT_SETTINGS.org_name).toBeNull()
  })

  it('has org_config_source_type default as null', () => {
    expect(DEFAULT_SETTINGS.org_config_source_type).toBeNull()
  })

  it('has org_config_url default as null', () => {
    expect(DEFAULT_SETTINGS.org_config_url).toBeNull()
  })

  it('has org_config_branch default as null', () => {
    expect(DEFAULT_SETTINGS.org_config_branch).toBeNull()
  })

  it('has org_config_auth_method default as null', () => {
    expect(DEFAULT_SETTINGS.org_config_auth_method).toBeNull()
  })

  it('has org_auto_sync_enabled default as false', () => {
    expect(DEFAULT_SETTINGS.org_auto_sync_enabled).toBe(false)
  })

  it('has org_auto_sync_interval_minutes default as 60', () => {
    expect(DEFAULT_SETTINGS.org_auto_sync_interval_minutes).toBe(60)
  })

  it('has org_auto_sync_on_app_start default as true', () => {
    expect(DEFAULT_SETTINGS.org_auto_sync_on_app_start).toBe(true)
  })

  it('has org_auto_sync_on_project_open default as true', () => {
    expect(DEFAULT_SETTINGS.org_auto_sync_on_project_open).toBe(true)
  })

  it('has org_cache_path default as null', () => {
    expect(DEFAULT_SETTINGS.org_cache_path).toBeNull()
  })
})
