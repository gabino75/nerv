import { exec } from 'child_process'
import { promisify } from 'util'
import { existsSync, mkdirSync, rmSync } from 'fs'
import { join, dirname, basename } from 'path'
import { ipcMain } from 'electron'
import { broadcastToRenderers } from './utils'
import { databaseService } from './database'

const execAsync = promisify(exec)

// Worktree info returned from git
interface WorktreeInfo {
  path: string
  branch: string
  commit: string
  isMain: boolean
}

// Task worktree result
interface TaskWorktreeResult {
  worktreePath: string
  branchName: string
  repoId: string
  repoPath: string
}

// Get the worktrees directory for a repo
function getWorktreesDir(repoPath: string): string {
  const repoName = basename(repoPath)
  return join(dirname(repoPath), `${repoName}-worktrees`)
}

// Fetch latest from remote (PRD Section 25)
async function fetchRepository(repoPath: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!await isGitRepo(repoPath)) {
      return { success: false, error: 'Not a git repository' }
    }
    console.log(`[Worktree] Fetching latest from remote for ${repoPath}`)
    await execAsync('git fetch --all --prune', { cwd: repoPath })
    return { success: true }
  } catch (error) {
    const err = error as Error
    console.error(`[Worktree] Failed to fetch ${repoPath}:`, err.message)
    // Don't fail - just log warning, fetch is best-effort
    return { success: false, error: err.message }
  }
}

// Auto-fetch repos on project open (PRD Section 25)
async function autoFetchProjectRepos(projectId: string): Promise<{ fetched: string[]; errors: string[] }> {
  const repos = databaseService.getReposForProject(projectId)
  const fetched: string[] = []
  const errors: string[] = []

  for (const repo of repos) {
    if (repo.auto_fetch_on_open) {
      const result = await fetchRepository(repo.path)
      if (result.success) {
        fetched.push(repo.name)
      } else if (result.error) {
        errors.push(`${repo.name}: ${result.error}`)
      }
    }
  }

  return { fetched, errors }
}

// Check if a path is a git repository
async function isGitRepo(path: string): Promise<boolean> {
  try {
    await execAsync('git rev-parse --git-dir', { cwd: path })
    return true
  } catch {
    return false
  }
}

// Get the main branch name (main or master)
async function getMainBranch(repoPath: string): Promise<string> {
  try {
    // Try to get the default branch from remote
    const { stdout } = await execAsync('git symbolic-ref refs/remotes/origin/HEAD', {
      cwd: repoPath
    })
    const ref = stdout.trim()
    return ref.split('/').pop() || 'main'
  } catch {
    // No remote - check if main or master branch exists locally
    try {
      await execAsync('git show-ref --verify refs/heads/main', { cwd: repoPath })
      return 'main'
    } catch {
      try {
        await execAsync('git show-ref --verify refs/heads/master', { cwd: repoPath })
        return 'master'
      } catch {
        // Neither main nor master exists - get current branch
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

// List existing worktrees for a repo
async function listWorktrees(repoPath: string): Promise<WorktreeInfo[]> {
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
        // Main worktree marker or empty line
        if (current.path && !current.branch) {
          current.isMain = true
        }
      }
    }

    if (current.path) {
      worktrees.push(current as WorktreeInfo)
    }

    return worktrees
  } catch (error) {
    console.error('[Worktree] Failed to list worktrees:', error)
    return []
  }
}

// Create a worktree for a task
async function createTaskWorktree(
  repoPath: string,
  taskId: string,
  baseBranch?: string
): Promise<TaskWorktreeResult> {
  // Validate repo is a git repository
  if (!await isGitRepo(repoPath)) {
    throw new Error(`Not a git repository: ${repoPath}`)
  }

  // Get base branch if not specified
  const branch = baseBranch || await getMainBranch(repoPath)

  // Create unique branch name: nerv/T{taskId}-{timestamp}
  const timestamp = Math.floor(Date.now() / 1000)
  const branchName = `nerv/${taskId}-${timestamp}`

  // Create worktrees directory if needed
  const worktreesDir = getWorktreesDir(repoPath)
  if (!existsSync(worktreesDir)) {
    mkdirSync(worktreesDir, { recursive: true })
  }

  // Worktree path
  const worktreePath = join(worktreesDir, taskId)

  // Remove existing worktree if it exists
  if (existsSync(worktreePath)) {
    console.log(`[Worktree] Removing existing worktree at ${worktreePath}`)
    try {
      await execAsync(`git worktree remove --force "${worktreePath}"`, { cwd: repoPath })
    } catch {
      // If git worktree remove fails, try manual removal
      rmSync(worktreePath, { recursive: true, force: true })
    }
  }

  // Create new worktree with new branch based on specified branch
  console.log(`[Worktree] Creating worktree at ${worktreePath} from ${branch}`)
  try {
    await execAsync(`git worktree add -b "${branchName}" "${worktreePath}" "${branch}"`, {
      cwd: repoPath
    })
  } catch (error) {
    const err = error as Error
    throw new Error(`Failed to create worktree: ${err.message}`)
  }

  // Get repo info from database by looking up path across all projects
  const allProjects = databaseService.getAllProjects()
  let repoId = ''
  for (const project of allProjects) {
    const repos = databaseService.getReposForProject(project.id)
    const repo = repos.find(r => r.path === repoPath)
    if (repo) {
      repoId = repo.id
      break
    }
  }

  return {
    worktreePath,
    branchName,
    repoId,
    repoPath
  }
}

// Create worktrees for all repos in a task
async function createWorktreesForTask(
  taskId: string,
  projectId: string
): Promise<TaskWorktreeResult[]> {
  const repos = databaseService.getReposForProject(projectId)

  if (repos.length === 0) {
    throw new Error('No repositories configured for this project')
  }

  const results: TaskWorktreeResult[] = []

  for (const repo of repos) {
    try {
      // Fetch latest before creating worktree if configured (PRD Section 25)
      if (repo.fetch_before_worktree) {
        await fetchRepository(repo.path)
      }

      const result = await createTaskWorktree(repo.path, taskId, repo.base_branch)
      results.push({
        ...result,
        repoId: repo.id
      })
    } catch (error) {
      console.error(`[Worktree] Failed to create worktree for ${repo.path}:`, error)
      // Continue with other repos
    }
  }

  if (results.length === 0) {
    throw new Error('Failed to create worktrees for any repository')
  }

  return results
}

// Remove a worktree
async function removeWorktree(worktreePath: string): Promise<void> {
  if (!existsSync(worktreePath)) {
    console.log(`[Worktree] Worktree not found: ${worktreePath}`)
    return
  }

  // Find the parent repo by going up directories and looking for .git
  let repoPath = ''

  // Check if the worktree path is valid
  const worktreeGitFile = join(worktreePath, '.git')
  if (existsSync(worktreeGitFile)) {
    // This is a worktree, read the gitdir to find parent repo
    try {
      const { stdout } = await execAsync('git rev-parse --git-common-dir', { cwd: worktreePath })
      repoPath = dirname(stdout.trim())
    } catch (error) {
      console.error('[Worktree] Could not find parent repo:', error)
    }
  }

  if (repoPath) {
    try {
      await execAsync(`git worktree remove --force "${worktreePath}"`, { cwd: repoPath })
      console.log(`[Worktree] Removed worktree: ${worktreePath}`)
    } catch (error) {
      console.error('[Worktree] Failed to remove via git:', error)
      // Fallback: force remove directory
      rmSync(worktreePath, { recursive: true, force: true })
    }
  } else {
    // Just remove the directory
    rmSync(worktreePath, { recursive: true, force: true })
  }
}

// Merge a worktree branch back into the base branch (PRD: merge on approval)
async function mergeWorktreeBranch(
  worktreePath: string,
): Promise<{ merged: boolean; error?: string }> {
  if (!existsSync(worktreePath)) {
    return { merged: false, error: 'Worktree path does not exist' }
  }

  try {
    // Find parent repo
    const { stdout: gitCommonDir } = await execAsync('git rev-parse --git-common-dir', { cwd: worktreePath })
    const repoPath = dirname(gitCommonDir.trim())

    // Get the worktree's branch name
    const { stdout: branchOut } = await execAsync('git branch --show-current', { cwd: worktreePath })
    const branchName = branchOut.trim()
    if (!branchName) {
      return { merged: false, error: 'Could not determine worktree branch' }
    }

    // Get the base branch to merge into
    const baseBranch = await getMainBranch(repoPath)

    // Check if worktree branch has any commits beyond the base
    const { stdout: baseHead } = await execAsync(`git -C "${repoPath}" rev-parse ${baseBranch}`, { cwd: repoPath })
    const { stdout: branchHead } = await execAsync(`git -C "${repoPath}" rev-parse ${branchName}`, { cwd: repoPath })
    if (baseHead.trim() === branchHead.trim()) {
      console.log(`[Worktree] No commits to merge: ${branchName} is at same commit as ${baseBranch}`)
      return { merged: true, error: 'no-op: branch has no new commits' }
    }

    // Merge: checkout base branch first, then --no-ff to preserve branch history
    console.log(`[Worktree] Merging ${branchName} into ${baseBranch} in ${repoPath}`)
    await execAsync(`git -C "${repoPath}" checkout ${baseBranch}`, { cwd: repoPath })
    const { stdout: mergeOutput } = await execAsync(`git -C "${repoPath}" merge --no-ff "${branchName}" -m "Merge task ${branchName}"`, {
      cwd: repoPath,
    })

    console.log(`[Worktree] Merge succeeded: ${branchName} → ${baseBranch} (${mergeOutput.trim().split('\n')[0]})`)
    return { merged: true }
  } catch (error) {
    const err = error as Error
    console.error(`[Worktree] Merge failed:`, err.message)

    // Abort the failed merge
    try {
      const { stdout: gitCommonDir } = await execAsync('git rev-parse --git-common-dir', { cwd: worktreePath })
      const repoPath = dirname(gitCommonDir.trim())
      await execAsync('git merge --abort', { cwd: repoPath })
    } catch {
      // Already clean or can't abort
    }

    return { merged: false, error: err.message }
  }
}

// Cleanup worktrees for completed/abandoned tasks
async function cleanupWorktrees(repoPath: string): Promise<string[]> {
  const cleaned: string[] = []
  const worktreesDir = getWorktreesDir(repoPath)

  if (!existsSync(worktreesDir)) {
    return cleaned
  }

  // Prune stale worktrees first
  try {
    await execAsync('git worktree prune', { cwd: repoPath })
  } catch (error) {
    console.error('[Worktree] Failed to prune:', error)
  }

  // Get list of worktrees from git
  const worktrees = await listWorktrees(repoPath)

  // Get all task IDs that are still active
  const activeTasks = databaseService.getInterruptedTasks()
  const activeTaskIds = new Set(activeTasks.map(t => t.id))

  // Find worktrees for completed tasks
  for (const wt of worktrees) {
    if (wt.isMain) continue

    // Extract task ID from branch name (nerv/{taskId}-{timestamp})
    const match = wt.branch?.match(/^nerv\/([^-]+)-/)
    if (match) {
      const taskId = match[1]
      if (!activeTaskIds.has(taskId)) {
        // Task is no longer active, can clean up
        try {
          await removeWorktree(wt.path)
          cleaned.push(wt.path)
        } catch (error) {
          console.error(`[Worktree] Failed to clean ${wt.path}:`, error)
        }
      }
    }
  }

  return cleaned
}

// Get all worktrees for a project (across all repos)
async function getProjectWorktrees(projectId: string): Promise<{
  repoId: string
  repoName: string
  repoPath: string
  worktrees: WorktreeInfo[]
}[]> {
  const repos = databaseService.getReposForProject(projectId)
  const results = []

  for (const repo of repos) {
    const worktrees = await listWorktrees(repo.path)
    results.push({
      repoId: repo.id,
      repoName: repo.name,
      repoPath: repo.path,
      worktrees: worktrees.filter(wt => !wt.isMain) // Exclude main worktree
    })
  }

  return results
}

// Check worktree status (uncommitted changes, ahead/behind)
async function getWorktreeStatus(worktreePath: string): Promise<{
  hasChanges: boolean
  ahead: number
  behind: number
  files: string[]
}> {
  if (!existsSync(worktreePath)) {
    throw new Error(`Worktree not found: ${worktreePath}`)
  }

  try {
    // Check for uncommitted changes
    const { stdout: statusOut } = await execAsync('git status --porcelain', { cwd: worktreePath })
    const files = statusOut.trim().split('\n').filter(Boolean)
    const hasChanges = files.length > 0

    // Check ahead/behind
    let ahead = 0
    let behind = 0
    try {
      const { stdout: aheadBehind } = await execAsync(
        'git rev-list --left-right --count HEAD...@{upstream} 2>/dev/null || echo "0 0"',
        { cwd: worktreePath }
      )
      const parts = aheadBehind.trim().split(/\s+/)
      ahead = parseInt(parts[0]) || 0
      behind = parseInt(parts[1]) || 0
    } catch {
      // No upstream, that's fine
    }

    return { hasChanges, ahead, behind, files }
  } catch (error) {
    console.error('[Worktree] Failed to get status:', error)
    return { hasChanges: false, ahead: 0, behind: 0, files: [] }
  }
}

// Broadcast worktree changes to all windows
function broadcastWorktreeChange(event: string, data: unknown): void {
  broadcastToRenderers(`worktree:${event}`, data)
}

// Register IPC handlers for worktree operations
export function registerWorktreeIpcHandlers(): void {
  ipcMain.handle('worktree:create', async (_event, repoPath: string, taskId: string, baseBranch?: string) => {
    const result = await createTaskWorktree(repoPath, taskId, baseBranch)
    broadcastWorktreeChange('created', result)
    return result
  })

  ipcMain.handle('worktree:createForTask', async (_event, taskId: string, projectId: string) => {
    const results = await createWorktreesForTask(taskId, projectId)
    broadcastWorktreeChange('created', results)
    return results
  })

  ipcMain.handle('worktree:remove', async (_event, worktreePath: string) => {
    await removeWorktree(worktreePath)
    broadcastWorktreeChange('removed', { path: worktreePath })
  })

  ipcMain.handle('worktree:cleanup', async (_event, repoPath: string) => {
    const cleaned = await cleanupWorktrees(repoPath)
    broadcastWorktreeChange('cleaned', { repoPath, cleaned })
    return cleaned
  })

  ipcMain.handle('worktree:list', async (_event, repoPath: string) => {
    return listWorktrees(repoPath)
  })

  ipcMain.handle('worktree:listForProject', async (_event, projectId: string) => {
    return getProjectWorktrees(projectId)
  })

  // Auto-fetch repos on project open (PRD Section 25)
  ipcMain.handle('worktree:autoFetchProject', async (_event, projectId: string) => {
    return autoFetchProjectRepos(projectId)
  })

  // Fetch a single repository
  ipcMain.handle('worktree:fetch', async (_event, repoPath: string) => {
    return fetchRepository(repoPath)
  })

  ipcMain.handle('worktree:getStatus', async (_event, worktreePath: string) => {
    return getWorktreeStatus(worktreePath)
  })

  ipcMain.handle('worktree:isGitRepo', async (_event, path: string) => {
    return isGitRepo(path)
  })

  ipcMain.handle('worktree:getMainBranch', async (_event, repoPath: string) => {
    return getMainBranch(repoPath)
  })

  ipcMain.handle('worktree:merge', async (_event, worktreePath: string) => {
    const result = await mergeWorktreeBranch(worktreePath)
    if (result.merged) {
      broadcastWorktreeChange('merged', { path: worktreePath })
    }
    return result
  })
}

// Export functions for direct use
export {
  createTaskWorktree,
  createWorktreesForTask,
  removeWorktree,
  mergeWorktreeBranch,
  cleanupWorktrees,
  listWorktrees,
  getProjectWorktrees,
  getWorktreeStatus,
  isGitRepo,
  getMainBranch,
  fetchRepository,
  autoFetchProjectRepos
}
