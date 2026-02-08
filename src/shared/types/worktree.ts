/**
 * Worktree types
 */

export interface WorktreeInfo {
  path: string
  branch: string
  commit: string
  isMain: boolean
}

export interface TaskWorktreeResult {
  worktreePath: string
  branchName: string
  repoId: string
  repoPath: string
}

export interface WorktreeStatus {
  hasChanges: boolean
  ahead: number
  behind: number
  files: string[]
}

export interface ProjectWorktrees {
  repoId: string
  repoName: string
  repoPath: string
  worktrees: WorktreeInfo[]
}
