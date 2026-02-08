/**
 * Benchmark Worktree Operations - Pure git worktree ops without Electron deps
 *
 * Extracted from src/main/worktree.ts for CLI benchmark use.
 * Takes repo path as parameter directly (no databaseService lookups).
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import { existsSync, mkdirSync, rmSync } from 'fs'
import { join, basename, dirname } from 'path'

const execAsync = promisify(exec)

export interface WorktreeInfo {
  path: string
  branch: string
  commit: string
  isMain: boolean
}

export interface WorktreeResult {
  worktreePath: string
  branchName: string
}

/**
 * Check if a path is a git repository.
 */
export async function isGitRepo(repoPath: string): Promise<boolean> {
  try {
    await execAsync('git rev-parse --git-dir', { cwd: repoPath })
    return true
  } catch {
    return false
  }
}

/**
 * Get the main branch name (main or master).
 */
export async function getMainBranch(repoPath: string): Promise<string> {
  try {
    const { stdout } = await execAsync('git symbolic-ref refs/remotes/origin/HEAD', {
      cwd: repoPath,
    })
    const ref = stdout.trim()
    return ref.split('/').pop() || 'main'
  } catch {
    try {
      await execAsync('git show-ref --verify refs/heads/main', { cwd: repoPath })
      return 'main'
    } catch {
      try {
        await execAsync('git show-ref --verify refs/heads/master', { cwd: repoPath })
        return 'master'
      } catch {
        try {
          const { stdout } = await execAsync('git branch --show-current', { cwd: repoPath })
          return stdout.trim() || 'main'
        } catch {
          return 'main'
        }
      }
    }
  }
}

/**
 * List existing worktrees for a repo.
 */
export async function listWorktrees(repoPath: string): Promise<WorktreeInfo[]> {
  try {
    const { stdout } = await execAsync('git worktree list --porcelain', { cwd: repoPath })
    const worktrees: WorktreeInfo[] = []
    let current: Partial<WorktreeInfo> = {}

    for (const line of stdout.split('\n')) {
      if (line.startsWith('worktree ')) {
        if (current.path) {
          worktrees.push(current as WorktreeInfo)
        }
        current = { path: line.substring(9), isMain: false }
      } else if (line.startsWith('HEAD ')) {
        current.commit = line.substring(5)
      } else if (line.startsWith('branch ')) {
        current.branch = line.substring(7).replace('refs/heads/', '')
      } else if (line === 'bare' || line === '') {
        if (current.path && !current.branch) {
          current.isMain = true
        }
      }
    }

    if (current.path) {
      worktrees.push(current as WorktreeInfo)
    }

    return worktrees
  } catch {
    return []
  }
}

/**
 * Create a worktree for a benchmark task.
 */
export async function createTaskWorktree(
  repoPath: string,
  taskId: string,
  baseBranch?: string,
): Promise<WorktreeResult> {
  if (!await isGitRepo(repoPath)) {
    throw new Error(`Not a git repository: ${repoPath}`)
  }

  const branch = baseBranch || await getMainBranch(repoPath)
  const timestamp = Math.floor(Date.now() / 1000)
  const branchName = `nerv/bench-${taskId}-${timestamp}`

  const repoName = basename(repoPath)
  const worktreesDir = join(dirname(repoPath), `${repoName}-worktrees`)
  if (!existsSync(worktreesDir)) {
    mkdirSync(worktreesDir, { recursive: true })
  }

  const worktreePath = join(worktreesDir, taskId)

  // Remove existing worktree if it exists
  if (existsSync(worktreePath)) {
    try {
      await execAsync(`git worktree remove --force "${worktreePath}"`, { cwd: repoPath })
    } catch {
      rmSync(worktreePath, { recursive: true, force: true })
    }
  }

  await execAsync(`git worktree add -b "${branchName}" "${worktreePath}" "${branch}"`, {
    cwd: repoPath,
  })

  return { worktreePath, branchName }
}

/**
 * Remove a worktree.
 */
export async function removeWorktree(repoPath: string, worktreePath: string): Promise<void> {
  if (!existsSync(worktreePath)) return

  try {
    await execAsync(`git worktree remove --force "${worktreePath}"`, { cwd: repoPath })
  } catch {
    rmSync(worktreePath, { recursive: true, force: true })
  }
}

/**
 * Merge a worktree branch back to the base branch.
 * Returns true if merge succeeded, false otherwise.
 */
export async function mergeWorktree(
  repoPath: string,
  branchName: string,
  baseBranch?: string,
): Promise<boolean> {
  const target = baseBranch || await getMainBranch(repoPath)

  try {
    await execAsync(`git checkout "${target}"`, { cwd: repoPath })
    await execAsync(`git merge --no-ff "${branchName}" -m "Merge benchmark task ${branchName}"`, {
      cwd: repoPath,
    })
    return true
  } catch {
    // Abort failed merge
    try {
      await execAsync('git merge --abort', { cwd: repoPath })
    } catch {
      // already clean
    }
    return false
  }
}

/**
 * Get the diff of a worktree against its base.
 */
export async function getWorktreeDiff(worktreePath: string): Promise<string> {
  try {
    const { stdout: baseBranch } = await execAsync(
      'git rev-parse --abbrev-ref HEAD@{upstream} 2>/dev/null || git rev-parse --abbrev-ref origin/HEAD 2>/dev/null || echo "HEAD~10"',
      { cwd: worktreePath, maxBuffer: 10 * 1024 * 1024 },
    )
    const base = baseBranch.trim().replace('origin/', '')

    const { stdout: diff } = await execAsync(
      `git diff ${base}...HEAD --stat && echo "---DIFF---" && git diff ${base}...HEAD`,
      { cwd: worktreePath, maxBuffer: 10 * 1024 * 1024 },
    )

    const maxDiffLength = 50000
    if (diff.length > maxDiffLength) {
      return diff.substring(0, maxDiffLength) + '\n\n[... diff truncated due to size ...]'
    }
    return diff
  } catch {
    try {
      const { stdout: diff } = await execAsync(
        'git diff HEAD~5...HEAD --stat && echo "---DIFF---" && git diff HEAD~5...HEAD',
        { cwd: worktreePath, maxBuffer: 10 * 1024 * 1024 },
      )
      return diff.length > 50000 ? diff.substring(0, 50000) + '\n\n[... truncated ...]' : diff
    } catch {
      return 'Unable to generate diff'
    }
  }
}
