/**
 * YOLO Benchmark IPC handlers
 */

import { ipcMain } from 'electron'
import { databaseService } from '../database'
import {
  startYoloBenchmark,
  stopYoloBenchmark,
  pauseYoloBenchmark,
  resumeYoloBenchmark,
  getActiveBenchmarkStatus
} from './lifecycle'
import { calculateBenchmarkGrade, compareBenchmarks } from './grading'
import type { YoloBenchmarkConfig } from '../../shared/types'

export function registerYoloBenchmarkIpcHandlers(): void {
  // Config CRUD
  ipcMain.handle('yolo:createConfig', (_event, config: YoloBenchmarkConfig) => {
    return databaseService.createYoloBenchmarkConfig(config)
  })

  ipcMain.handle('yolo:getConfig', (_event, id: string) => {
    return databaseService.getYoloBenchmarkConfig(id)
  })

  ipcMain.handle('yolo:getConfigsForProject', (_event, projectId: string) => {
    return databaseService.getYoloBenchmarkConfigsForProject(projectId)
  })

  ipcMain.handle('yolo:updateConfig', (_event, id: string, updates: Partial<Omit<YoloBenchmarkConfig, 'projectId'>>) => {
    return databaseService.updateYoloBenchmarkConfig(id, updates)
  })

  ipcMain.handle('yolo:deleteConfig', (_event, id: string) => {
    databaseService.deleteYoloBenchmarkConfig(id)
  })

  // Benchmark execution
  ipcMain.handle('yolo:start', (_event, configId: string) => {
    return startYoloBenchmark(configId)
  })

  ipcMain.handle('yolo:stop', (_event, resultId: string, reason?: string) => {
    return stopYoloBenchmark(resultId, reason)
  })

  ipcMain.handle('yolo:pause', (_event, resultId: string) => {
    return pauseYoloBenchmark(resultId)
  })

  ipcMain.handle('yolo:resume', (_event, resultId: string) => {
    return resumeYoloBenchmark(resultId)
  })

  ipcMain.handle('yolo:getStatus', (_event, resultId: string) => {
    return getActiveBenchmarkStatus(resultId)
  })

  // Results
  ipcMain.handle('yolo:getResult', (_event, id: string) => {
    return databaseService.getYoloBenchmarkResult(id)
  })

  ipcMain.handle('yolo:getResultsForConfig', (_event, configId: string) => {
    return databaseService.getYoloBenchmarkResultsForConfig(configId)
  })

  ipcMain.handle('yolo:getRunning', () => {
    return databaseService.getRunningYoloBenchmarks()
  })

  ipcMain.handle('yolo:getGrade', (_event, resultId: string) => {
    const result = databaseService.getYoloBenchmarkResult(resultId)
    if (!result) return null
    return calculateBenchmarkGrade(result)
  })

  ipcMain.handle('yolo:compare', (_event, resultIds: string[]) => {
    return compareBenchmarks(resultIds)
  })
}
