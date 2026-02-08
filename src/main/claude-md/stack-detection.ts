/**
 * CLAUDE.md Management - Stack detection
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import type { StackDetection, PackageJson } from './types'

/**
 * Stack detection configurations for various frameworks and tools
 */
export const STACK_DETECTIONS: StackDetection[] = [
  {
    name: 'React',
    indicators: {
      packageDeps: ['react', 'react-dom'],
    },
    suggestions: {
      commands: {
        'npm start': 'Start development server',
        'npm run build': 'Build for production',
        'npm test': 'Run tests'
      },
      architecture: ['/src/components - React components', '/src/hooks - Custom hooks'],
      codeStyle: ['Functional components only', 'Use hooks for state']
    }
  },
  {
    name: 'Next.js',
    indicators: {
      packageDeps: ['next'],
      files: ['next.config.js', 'next.config.mjs', 'next.config.ts']
    },
    suggestions: {
      commands: {
        'npm run dev': 'Start development server',
        'npm run build': 'Build for production',
        'npm start': 'Start production server'
      },
      architecture: ['/app - App Router pages', '/components - Shared components', '/lib - Utilities'],
      codeStyle: ['Use App Router conventions', 'Server components by default']
    }
  },
  {
    name: 'Svelte',
    indicators: {
      packageDeps: ['svelte'],
      files: ['svelte.config.js']
    },
    suggestions: {
      commands: {
        'npm run dev': 'Start development server',
        'npm run build': 'Build for production'
      },
      architecture: ['/src/lib - Shared library', '/src/routes - SvelteKit routes'],
      codeStyle: ['Use Svelte 5 runes ($state, $derived)', 'Prefer $props() for component props']
    }
  },
  {
    name: 'Vue',
    indicators: {
      packageDeps: ['vue'],
      files: ['vue.config.js', 'vite.config.ts']
    },
    suggestions: {
      commands: {
        'npm run dev': 'Start development server',
        'npm run build': 'Build for production'
      },
      architecture: ['/src/components - Vue components', '/src/composables - Composable functions'],
      codeStyle: ['Use Composition API', 'Use <script setup> syntax']
    }
  },
  {
    name: 'Python/FastAPI',
    indicators: {
      files: ['requirements.txt', 'pyproject.toml', 'setup.py'],
      packageDeps: ['fastapi']
    },
    suggestions: {
      commands: {
        'pip install -r requirements.txt': 'Install dependencies',
        'uvicorn main:app --reload': 'Start development server',
        'pytest': 'Run tests'
      },
      environment: ['Python 3.10+', 'Use virtual environment'],
      architecture: ['/app - Application code', '/tests - Test files'],
      codeStyle: ['Use type hints', 'Use Pydantic for validation']
    }
  },
  {
    name: 'Python/Django',
    indicators: {
      files: ['manage.py'],
      packageDeps: ['django']
    },
    suggestions: {
      commands: {
        'pip install -r requirements.txt': 'Install dependencies',
        'python manage.py runserver': 'Start development server',
        'python manage.py test': 'Run tests',
        'python manage.py migrate': 'Run migrations'
      },
      environment: ['Python 3.10+', 'Use virtual environment'],
      constraints: ['Never modify migrations directly', 'Use Django ORM for database access']
    }
  },
  {
    name: 'TypeScript',
    indicators: {
      files: ['tsconfig.json'],
      devDeps: ['typescript']
    },
    suggestions: {
      commands: {
        'npx tsc --noEmit': 'Type check without emitting',
        'npm run build': 'Build project'
      },
      codeStyle: ['Use strict mode', 'Prefer interfaces over type aliases for objects']
    }
  },
  {
    name: 'Go',
    indicators: {
      files: ['go.mod', 'go.sum']
    },
    suggestions: {
      commands: {
        'go run .': 'Run application',
        'go test ./...': 'Run all tests',
        'go build': 'Build binary'
      },
      codeStyle: ['Follow effective Go guidelines', 'Use gofmt for formatting']
    }
  },
  {
    name: 'Rust',
    indicators: {
      files: ['Cargo.toml', 'Cargo.lock']
    },
    suggestions: {
      commands: {
        'cargo run': 'Run application',
        'cargo test': 'Run tests',
        'cargo build --release': 'Build release binary'
      },
      codeStyle: ['Follow Rust naming conventions', 'Use clippy for linting']
    }
  },
  {
    name: 'Electron',
    indicators: {
      packageDeps: ['electron'],
      devDeps: ['electron']
    },
    suggestions: {
      commands: {
        'npm run dev': 'Start development with hot reload',
        'npm run build': 'Build distributable'
      },
      architecture: ['/src/main - Main process', '/src/renderer - Renderer process', '/src/preload - Preload scripts'],
      constraints: ['Use contextBridge for IPC', 'Never use nodeIntegration: true']
    }
  }
]

/**
 * Read and parse package.json from a repo path
 */
export function readPackageJson(repoPath: string): PackageJson | null {
  const pkgPath = join(repoPath, 'package.json')
  if (!existsSync(pkgPath)) return null
  try {
    return JSON.parse(readFileSync(pkgPath, 'utf-8'))
  } catch {
    return null
  }
}

/**
 * Get list of root files in a directory
 */
export function getRootFiles(repoPath: string): string[] {
  try {
    return readdirSync(repoPath).filter(f => {
      try {
        return statSync(join(repoPath, f)).isFile()
      } catch {
        return false
      }
    })
  } catch {
    return []
  }
}

/**
 * Check if stack indicators match for a repository
 */
export function matchesIndicators(
  stack: StackDetection,
  rootFiles: string[],
  repoPath: string,
  pkg: PackageJson | null
): boolean {
  // Check file indicators
  if (stack.indicators.files?.some(f => rootFiles.includes(f) || existsSync(join(repoPath, f)))) {
    return true
  }
  // Check package.json dependencies
  if (pkg && stack.indicators.packageDeps?.some(dep => pkg.dependencies?.[dep] || pkg.devDependencies?.[dep])) {
    return true
  }
  // Check devDependencies
  if (pkg && stack.indicators.devDeps?.some(dep => pkg.devDependencies?.[dep])) {
    return true
  }
  return false
}

/**
 * Detect stacks/frameworks used in a repository path
 */
export function detectStack(repoPath: string): StackDetection[] {
  if (!existsSync(repoPath)) return []

  const pkg = readPackageJson(repoPath)
  const rootFiles = getRootFiles(repoPath)

  return STACK_DETECTIONS.filter(stack => matchesIndicators(stack, rootFiles, repoPath, pkg))
}

/**
 * Collect unique items from multiple stacks for a given suggestion key
 */
export function collectFromStacks<K extends keyof StackDetection['suggestions']>(
  stacks: StackDetection[],
  key: K
): StackDetection['suggestions'][K] extends (infer T)[] ? T[] : Record<string, string> {
  const result: string[] = []
  const records: Record<string, string> = {}

  for (const stack of stacks) {
    const val = stack.suggestions[key]
    if (Array.isArray(val)) {
      result.push(...val)
    } else if (val) {
      Object.assign(records, val)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (result.length > 0 ? [...new Set(result)] : records) as any
}
