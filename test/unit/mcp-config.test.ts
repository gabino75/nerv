/**
 * Unit tests for MCP configuration generation in src/main/mcp-config.ts
 *
 * Tests MCP server config generation, domain management, and file operations.
 * Since the module uses Electron's `app.isPackaged` and filesystem operations,
 * we mock those dependencies.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

// Mock electron app
vi.mock('electron', () => ({
  app: {
    isPackaged: false,
  },
}))

// Mock fs
vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(() => '{}'),
  unlinkSync: vi.fn(),
}))

const mockExistsSync = vi.mocked(fs.existsSync)
const mockMkdirSync = vi.mocked(fs.mkdirSync)
const mockWriteFileSync = vi.mocked(fs.writeFileSync)
const mockReadFileSync = vi.mocked(fs.readFileSync)
const mockUnlinkSync = vi.mocked(fs.unlinkSync)

import {
  generateMCPConfig,
  getMCPConfigPath,
  deleteMCPConfig,
  readMCPConfig,
  updateMCPConfigDomains,
} from '../../src/main/mcp-config'

// Helper to get expected project dir
const expectedProjectsDir = path.join(os.homedir(), '.nerv', 'projects')

describe('MCP Config', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('generateMCPConfig', () => {
    it('should generate config with all three MCP servers', () => {
      mockExistsSync.mockReturnValue(false) // project dir does not exist

      const configPath = generateMCPConfig('proj-1', ['docs.example.com'])

      expect(configPath).toContain('proj-1')
      expect(configPath).toContain('mcp-config.json')

      // Should create directory
      expect(mockMkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('proj-1'),
        { recursive: true }
      )

      // Should write config file
      expect(mockWriteFileSync).toHaveBeenCalledTimes(1)
      const writtenContent = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string)

      expect(writtenContent.mcpServers).toHaveProperty('nerv-context')
      expect(writtenContent.mcpServers).toHaveProperty('nerv-progress')
      expect(writtenContent.mcpServers).toHaveProperty('nerv-docs')
    })

    it('should set NERV_PROJECT_ID in all server environments', () => {
      mockExistsSync.mockReturnValue(true) // dir already exists

      generateMCPConfig('proj-abc', [])

      const writtenContent = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string)

      expect(writtenContent.mcpServers['nerv-context'].env.NERV_PROJECT_ID).toBe('proj-abc')
      expect(writtenContent.mcpServers['nerv-progress'].env.NERV_PROJECT_ID).toBe('proj-abc')
      expect(writtenContent.mcpServers['nerv-docs'].env.NERV_PROJECT_ID).toBe('proj-abc')
    })

    it('should include task ID when provided', () => {
      mockExistsSync.mockReturnValue(true)

      generateMCPConfig('proj-1', [], 'task-42')

      const writtenContent = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string)

      expect(writtenContent.mcpServers['nerv-context'].env.NERV_TASK_ID).toBe('task-42')
      expect(writtenContent.mcpServers['nerv-progress'].env.NERV_TASK_ID).toBe('task-42')
      // nerv-docs does not get task ID
      expect(writtenContent.mcpServers['nerv-docs'].env.NERV_TASK_ID).toBeUndefined()
    })

    it('should not include task ID when not provided', () => {
      mockExistsSync.mockReturnValue(true)

      generateMCPConfig('proj-1', [])

      const writtenContent = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string)

      expect(writtenContent.mcpServers['nerv-context'].env.NERV_TASK_ID).toBeUndefined()
      expect(writtenContent.mcpServers['nerv-progress'].env.NERV_TASK_ID).toBeUndefined()
    })

    it('should set allowed domains as comma-separated string', () => {
      mockExistsSync.mockReturnValue(true)

      generateMCPConfig('proj-1', ['docs.svelte.dev', 'tailwindcss.com', 'vitejs.dev'])

      const writtenContent = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string)

      expect(writtenContent.mcpServers['nerv-docs'].env.NERV_ALLOWED_DOMAINS).toBe(
        'docs.svelte.dev,tailwindcss.com,vitejs.dev'
      )
    })

    it('should handle empty allowed domains', () => {
      mockExistsSync.mockReturnValue(true)

      generateMCPConfig('proj-1', [])

      const writtenContent = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string)

      expect(writtenContent.mcpServers['nerv-docs'].env.NERV_ALLOWED_DOMAINS).toBe('')
    })

    it('should use node as the command for all servers', () => {
      mockExistsSync.mockReturnValue(true)

      generateMCPConfig('proj-1', [])

      const writtenContent = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string)

      expect(writtenContent.mcpServers['nerv-context'].command).toBe('node')
      expect(writtenContent.mcpServers['nerv-progress'].command).toBe('node')
      expect(writtenContent.mcpServers['nerv-docs'].command).toBe('node')
    })

    it('should not create directory if it already exists', () => {
      mockExistsSync.mockReturnValue(true)

      generateMCPConfig('proj-1', [])

      expect(mockMkdirSync).not.toHaveBeenCalled()
    })

    it('should return the config file path', () => {
      mockExistsSync.mockReturnValue(true)

      const result = generateMCPConfig('proj-1', [])

      expect(result).toBe(
        path.join(expectedProjectsDir, 'proj-1', 'mcp-config.json')
      )
    })
  })

  describe('getMCPConfigPath', () => {
    it('should return config path when file exists', () => {
      mockExistsSync.mockReturnValue(true)

      const result = getMCPConfigPath('proj-1')

      expect(result).toBe(
        path.join(expectedProjectsDir, 'proj-1', 'mcp-config.json')
      )
    })

    it('should return null when file does not exist', () => {
      mockExistsSync.mockReturnValue(false)

      const result = getMCPConfigPath('proj-missing')

      expect(result).toBeNull()
    })
  })

  describe('deleteMCPConfig', () => {
    it('should delete config file when it exists', () => {
      mockExistsSync.mockReturnValue(true)

      deleteMCPConfig('proj-1')

      expect(mockUnlinkSync).toHaveBeenCalledWith(
        path.join(expectedProjectsDir, 'proj-1', 'mcp-config.json')
      )
    })

    it('should do nothing when config file does not exist', () => {
      mockExistsSync.mockReturnValue(false)

      deleteMCPConfig('proj-missing')

      expect(mockUnlinkSync).not.toHaveBeenCalled()
    })
  })

  describe('readMCPConfig', () => {
    it('should return parsed config when file exists', () => {
      const configData = {
        mcpServers: {
          'nerv-context': { command: 'node', args: ['/path/to/server'] },
        },
      }
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(JSON.stringify(configData))

      const result = readMCPConfig('proj-1')

      expect(result).toEqual(configData)
    })

    it('should return null when file does not exist', () => {
      mockExistsSync.mockReturnValue(false)

      const result = readMCPConfig('proj-missing')

      expect(result).toBeNull()
    })

    it('should return null on parse error', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue('invalid json {{{')

      const result = readMCPConfig('proj-corrupt')

      expect(result).toBeNull()
    })

    it('should return null when readFileSync throws', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockImplementation(() => {
        throw new Error('Permission denied')
      })

      const result = readMCPConfig('proj-denied')

      expect(result).toBeNull()
    })
  })

  describe('updateMCPConfigDomains', () => {
    it('should update domains in existing config', () => {
      const existingConfig = {
        mcpServers: {
          'nerv-context': { command: 'node', args: ['/path'], env: { NERV_PROJECT_ID: 'proj-1' } },
          'nerv-progress': { command: 'node', args: ['/path'], env: { NERV_PROJECT_ID: 'proj-1' } },
          'nerv-docs': { command: 'node', args: ['/path'], env: { NERV_PROJECT_ID: 'proj-1', NERV_ALLOWED_DOMAINS: 'old.com' } },
        },
      }
      // First call: getMCPConfigPath checks existence
      // Second call: readMCPConfig checks existence
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(JSON.stringify(existingConfig))

      const result = updateMCPConfigDomains('proj-1', ['new.dev', 'updated.io'])

      expect(result).not.toBeNull()
      expect(mockWriteFileSync).toHaveBeenCalled()

      const writtenContent = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string)
      expect(writtenContent.mcpServers['nerv-docs'].env.NERV_ALLOWED_DOMAINS).toBe(
        'new.dev,updated.io'
      )
    })

    it('should create new config when none exists', () => {
      mockExistsSync.mockReturnValue(false) // No existing config

      const result = updateMCPConfigDomains('proj-new', ['example.com'])

      // Should fall through to generateMCPConfig which creates the dir and writes
      expect(result).not.toBeNull()
      expect(mockWriteFileSync).toHaveBeenCalled()
    })
  })
})
