/**
 * Unit tests for src/main/repo-scanner.ts
 *
 * Tests repository context scanning including CI/CD and testing config discovery.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { join } from 'path'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'

import {
  scanRepository,
  parseClaudeMdContent,
  scanResultToContextEntries,
  scanResultToSkillEntries
} from '../../src/main/repo-scanner'

describe('repo-scanner', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'nerv-scanner-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  describe('parseClaudeMdContent', () => {
    it('parses commands section', () => {
      const content = `## Commands\n- \`npm test\` - Run unit tests\n- \`npm run build\` - Build project`
      const result = parseClaudeMdContent(content)
      expect(result.commands).toHaveLength(2)
      expect(result.commands[0].command).toBe('npm test')
      expect(result.commands[0].description).toBe('Run unit tests')
    })

    it('parses constraints with severity', () => {
      const content = `## Constraints\n- Never use any types\n- Prefer const over let`
      const result = parseClaudeMdContent(content)
      expect(result.constraints).toHaveLength(2)
      expect(result.constraints[0].severity).toBe('error')
      expect(result.constraints[1].severity).toBe('warning')
    })

    it('parses testing section', () => {
      const content = `## Testing\nRun \`vitest\` for unit tests`
      const result = parseClaudeMdContent(content)
      expect(result.testing).toEqual({ command: 'vitest' })
    })

    it('returns empty arrays for missing sections', () => {
      const result = parseClaudeMdContent('# Just a title')
      expect(result.commands).toEqual([])
      expect(result.constraints).toEqual([])
      expect(result.codeStyle).toEqual([])
      expect(result.architecture).toEqual([])
      expect(result.environment).toEqual([])
    })
  })

  describe('scanRepository', () => {
    it('returns empty result for non-existent directory', async () => {
      const result = await scanRepository('/nonexistent/path')
      expect(result.claudeMd).toBeNull()
      expect(result.skills).toEqual([])
      expect(result.mcpConfig).toBeNull()
      expect(result.ciCd).toBeNull()
      expect(result.testingConfigs).toBeNull()
    })

    it('detects CLAUDE.md at root', async () => {
      writeFileSync(join(tempDir, 'CLAUDE.md'), '## Commands\n- `npm test` - Run tests')
      const result = await scanRepository(tempDir)
      expect(result.claudeMd).not.toBeNull()
      expect(result.claudeMd!.commands).toHaveLength(1)
    })

    it('detects README.md', async () => {
      writeFileSync(join(tempDir, 'README.md'), '# My Project\nA great project')
      const result = await scanRepository(tempDir)
      expect(result.readme).toBe('# My Project\nA great project')
    })

    it('detects package.json', async () => {
      writeFileSync(join(tempDir, 'package.json'), JSON.stringify({
        name: 'test-pkg',
        version: '1.0.0',
        scripts: { test: 'vitest' }
      }))
      const result = await scanRepository(tempDir)
      expect(result.packageInfo).not.toBeNull()
      expect(result.packageInfo!.name).toBe('test-pkg')
      expect(result.packageInfo!.scripts?.test).toBe('vitest')
    })

    it('detects skills in .claude/skills/', async () => {
      mkdirSync(join(tempDir, '.claude', 'skills'), { recursive: true })
      writeFileSync(join(tempDir, '.claude', 'skills', 'deploy.md'), [
        '---',
        'name: deploy',
        'description: Deploy to staging',
        'trigger: /deploy',
        '---',
        '# Deploy Steps',
        '1. Build',
        '2. Push'
      ].join('\n'))
      const result = await scanRepository(tempDir)
      expect(result.skills).toHaveLength(1)
      expect(result.skills[0].name).toBe('deploy')
      expect(result.skills[0].description).toBe('Deploy to staging')
      expect(result.skills[0].trigger).toBe('/deploy')
    })

    describe('CI/CD scanning', () => {
      it('detects GitHub Actions workflows', async () => {
        mkdirSync(join(tempDir, '.github', 'workflows'), { recursive: true })
        writeFileSync(join(tempDir, '.github', 'workflows', 'ci.yml'), 'name: CI\non: push')
        writeFileSync(join(tempDir, '.github', 'workflows', 'deploy.yaml'), 'name: Deploy\non: release')
        const result = await scanRepository(tempDir)
        expect(result.ciCd).not.toBeNull()
        expect(result.ciCd).toHaveLength(2)
        expect(result.ciCd!.map(c => c.path).sort()).toEqual([
          '.github/workflows/ci.yml',
          '.github/workflows/deploy.yaml'
        ])
      })

      it('detects .gitlab-ci.yml', async () => {
        writeFileSync(join(tempDir, '.gitlab-ci.yml'), 'stages:\n  - build\n  - test')
        const result = await scanRepository(tempDir)
        expect(result.ciCd).not.toBeNull()
        expect(result.ciCd).toHaveLength(1)
        expect(result.ciCd![0].path).toBe('.gitlab-ci.yml')
      })

      it('detects Jenkinsfile', async () => {
        writeFileSync(join(tempDir, 'Jenkinsfile'), 'pipeline { agent any }')
        const result = await scanRepository(tempDir)
        expect(result.ciCd).not.toBeNull()
        expect(result.ciCd![0].path).toBe('Jenkinsfile')
      })

      it('detects CircleCI config', async () => {
        mkdirSync(join(tempDir, '.circleci'), { recursive: true })
        writeFileSync(join(tempDir, '.circleci', 'config.yml'), 'version: 2.1')
        const result = await scanRepository(tempDir)
        expect(result.ciCd).not.toBeNull()
        expect(result.ciCd![0].path).toBe('.circleci/config.yml')
      })

      it('detects multiple CI/CD systems', async () => {
        mkdirSync(join(tempDir, '.github', 'workflows'), { recursive: true })
        writeFileSync(join(tempDir, '.github', 'workflows', 'ci.yml'), 'name: CI')
        writeFileSync(join(tempDir, '.travis.yml'), 'language: node_js')
        const result = await scanRepository(tempDir)
        expect(result.ciCd).not.toBeNull()
        expect(result.ciCd!.length).toBe(2)
      })

      it('returns null when no CI/CD configs exist', async () => {
        writeFileSync(join(tempDir, 'README.md'), '# Project')
        const result = await scanRepository(tempDir)
        expect(result.ciCd).toBeNull()
      })
    })

    describe('testing config scanning', () => {
      it('detects vitest.config.ts', async () => {
        writeFileSync(join(tempDir, 'vitest.config.ts'), 'export default { test: { globals: true } }')
        const result = await scanRepository(tempDir)
        expect(result.testingConfigs).not.toBeNull()
        expect(result.testingConfigs).toHaveLength(1)
        expect(result.testingConfigs![0].path).toBe('vitest.config.ts')
      })

      it('detects jest.config.js', async () => {
        writeFileSync(join(tempDir, 'jest.config.js'), 'module.exports = { testEnvironment: "node" }')
        const result = await scanRepository(tempDir)
        expect(result.testingConfigs).not.toBeNull()
        expect(result.testingConfigs![0].path).toBe('jest.config.js')
      })

      it('detects pytest.ini', async () => {
        writeFileSync(join(tempDir, 'pytest.ini'), '[pytest]\ntestpaths = tests')
        const result = await scanRepository(tempDir)
        expect(result.testingConfigs).not.toBeNull()
        expect(result.testingConfigs![0].path).toBe('pytest.ini')
      })

      it('detects multiple testing configs', async () => {
        writeFileSync(join(tempDir, 'vitest.config.ts'), 'export default {}')
        writeFileSync(join(tempDir, 'jest.config.js'), 'module.exports = {}')
        const result = await scanRepository(tempDir)
        expect(result.testingConfigs).not.toBeNull()
        expect(result.testingConfigs!.length).toBe(2)
      })

      it('returns null when no testing configs exist', async () => {
        writeFileSync(join(tempDir, 'README.md'), '# Project')
        const result = await scanRepository(tempDir)
        expect(result.testingConfigs).toBeNull()
      })
    })
  })

  describe('scanResultToContextEntries', () => {
    it('creates ci_cd entries from scan result', () => {
      const scanResult = {
        claudeMd: null,
        skills: [],
        mcpConfig: null,
        readme: null,
        contributing: null,
        architecture: null,
        packageInfo: null,
        ciCd: [
          { path: '.github/workflows/ci.yml', content: 'name: CI' },
          { path: '.gitlab-ci.yml', content: 'stages: [build]' }
        ],
        testingConfigs: null
      }

      // Create actual files so findFilePath works for existing mappings
      const entries = scanResultToContextEntries('repo-1', tempDir, scanResult)
      const ciEntries = entries.filter(e => e.context_type === 'ci_cd')
      expect(ciEntries).toHaveLength(2)
      expect(ciEntries[0].file_path).toBe('.github/workflows/ci.yml')
      expect(ciEntries[0].content).toBe('name: CI')
      expect(ciEntries[1].file_path).toBe('.gitlab-ci.yml')
    })

    it('creates testing_config entries from scan result', () => {
      const scanResult = {
        claudeMd: null,
        skills: [],
        mcpConfig: null,
        readme: null,
        contributing: null,
        architecture: null,
        packageInfo: null,
        ciCd: null,
        testingConfigs: [
          { path: 'vitest.config.ts', content: 'export default {}' }
        ]
      }

      const entries = scanResultToContextEntries('repo-1', tempDir, scanResult)
      const testEntries = entries.filter(e => e.context_type === 'testing_config')
      expect(testEntries).toHaveLength(1)
      expect(testEntries[0].file_path).toBe('vitest.config.ts')
    })

    it('includes all context types when present', () => {
      // Write actual files so the existing mapping logic finds them
      writeFileSync(join(tempDir, 'README.md'), '# Test')
      writeFileSync(join(tempDir, 'CLAUDE.md'), '## Commands\n- `test` - Test')

      const scanResult = {
        claudeMd: parseClaudeMdContent('## Commands\n- `test` - Test'),
        skills: [],
        mcpConfig: null,
        readme: '# Test',
        contributing: null,
        architecture: null,
        packageInfo: null,
        ciCd: [{ path: '.github/workflows/ci.yml', content: 'name: CI' }],
        testingConfigs: [{ path: 'vitest.config.ts', content: 'export default {}' }]
      }

      const entries = scanResultToContextEntries('repo-1', tempDir, scanResult)
      const types = entries.map(e => e.context_type)
      expect(types).toContain('claude_md')
      expect(types).toContain('readme')
      expect(types).toContain('ci_cd')
      expect(types).toContain('testing_config')
    })
  })
})
