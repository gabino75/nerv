/**
 * Preload API - composed from domain modules
 */

import { db, tasksExtended, reviews, findings, verification, successMetrics, userStatements, settingsHierarchy, specProposals } from './database'
import { terminal } from './terminal'
import { claude } from './claude'
import { nervMd, claudeMd } from './nerv-md'
import { hooks } from './hooks'
import { recovery } from './recovery'
import { branching } from './branching'
import { worktree } from './worktree'
import { yolo } from './yolo'
import { notifications } from './notifications'
import { org } from './org'
import { autoUpdate } from './auto-update'
import { instance } from './instance'
import { versions, projectIO, dialog, mcp, subagents, skills, crashReporter, recommend } from './misc'

export const api = {
  versions,
  db,
  tasksExtended,
  reviews,
  findings,
  verification,
  settingsHierarchy,
  terminal,
  claude,
  nervMd,
  claudeMd,
  hooks,
  recovery,
  branching,
  worktree,
  projectIO,
  mcp,
  dialog,
  yolo,
  subagents,
  skills,
  notifications,
  org,
  autoUpdate,
  instance,
  successMetrics,
  crashReporter,
  userStatements,
  specProposals,
  recommend
}

export type NervAPI = typeof api
