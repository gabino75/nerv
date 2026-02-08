/**
 * YOLO Benchmark API for autonomous benchmark execution
 */

import { ipcRenderer } from 'electron'
import type { YoloBenchmarkConfig, YoloBenchmarkResult, YoloBenchmarkStatus, YoloBenchmarkGrade } from '../../shared/types'

export const yolo = {
  // Configuration CRUD
  createConfig: (config: YoloBenchmarkConfig): Promise<YoloBenchmarkConfig & { id: string }> =>
    ipcRenderer.invoke('yolo:createConfig', config),
  getConfig: (id: string): Promise<(YoloBenchmarkConfig & { id: string }) | undefined> =>
    ipcRenderer.invoke('yolo:getConfig', id),
  getConfigsForProject: (projectId: string): Promise<Array<YoloBenchmarkConfig & { id: string }>> =>
    ipcRenderer.invoke('yolo:getConfigsForProject', projectId),
  updateConfig: (
    id: string,
    updates: Partial<Omit<YoloBenchmarkConfig, 'projectId'>>
  ): Promise<(YoloBenchmarkConfig & { id: string }) | undefined> =>
    ipcRenderer.invoke('yolo:updateConfig', id, updates),
  deleteConfig: (id: string): Promise<void> =>
    ipcRenderer.invoke('yolo:deleteConfig', id),

  // Benchmark execution
  start: (configId: string): Promise<YoloBenchmarkResult | null> =>
    ipcRenderer.invoke('yolo:start', configId),
  stop: (resultId: string, reason?: string): Promise<YoloBenchmarkResult | null> =>
    ipcRenderer.invoke('yolo:stop', resultId, reason),
  pause: (resultId: string): Promise<boolean> =>
    ipcRenderer.invoke('yolo:pause', resultId),
  resume: (resultId: string): Promise<boolean> =>
    ipcRenderer.invoke('yolo:resume', resultId),
  getStatus: (resultId: string): Promise<{
    isActive: boolean
    isPaused: boolean
    elapsedMs: number
    currentCycleId: string | null
    currentTaskId: string | null
  } | null> => ipcRenderer.invoke('yolo:getStatus', resultId),

  // Results
  getResult: (id: string): Promise<YoloBenchmarkResult | undefined> =>
    ipcRenderer.invoke('yolo:getResult', id),
  getResultsForConfig: (configId: string): Promise<YoloBenchmarkResult[]> =>
    ipcRenderer.invoke('yolo:getResultsForConfig', configId),
  getRunning: (): Promise<YoloBenchmarkResult[]> =>
    ipcRenderer.invoke('yolo:getRunning'),
  getGrade: (resultId: string): Promise<YoloBenchmarkGrade | null> =>
    ipcRenderer.invoke('yolo:getGrade', resultId),
  compare: (resultIds: string[]): Promise<{
    results: YoloBenchmarkResult[]
    grades: Record<string, YoloBenchmarkGrade>
    winner: string | null
  }> => ipcRenderer.invoke('yolo:compare', resultIds),

  // Event listeners
  onStarted: (callback: (resultId: string, configId: string) => void): void => {
    ipcRenderer.on('yolo:started', (_event, resultId, configId) => callback(resultId, configId))
  },
  onPaused: (callback: (resultId: string) => void): void => {
    ipcRenderer.on('yolo:paused', (_event, resultId) => callback(resultId))
  },
  onResumed: (callback: (resultId: string) => void): void => {
    ipcRenderer.on('yolo:resumed', (_event, resultId) => callback(resultId))
  },
  onCycleStarted: (callback: (resultId: string, cycleId: string, cycleNumber: number) => void): void => {
    ipcRenderer.on('yolo:cycleStarted', (_event, resultId, cycleId, cycleNumber) =>
      callback(resultId, cycleId, cycleNumber)
    )
  },
  onCycleCompleted: (callback: (resultId: string, cycleId: string) => void): void => {
    ipcRenderer.on('yolo:cycleCompleted', (_event, resultId, cycleId) => callback(resultId, cycleId))
  },
  onCompleted: (callback: (resultId: string, status: YoloBenchmarkStatus, stopReason: string | null) => void): void => {
    ipcRenderer.on('yolo:completed', (_event, resultId, status, stopReason) =>
      callback(resultId, status, stopReason)
    )
  },
  removeAllListeners: (): void => {
    ipcRenderer.removeAllListeners('yolo:started')
    ipcRenderer.removeAllListeners('yolo:paused')
    ipcRenderer.removeAllListeners('yolo:resumed')
    ipcRenderer.removeAllListeners('yolo:cycleStarted')
    ipcRenderer.removeAllListeners('yolo:cycleCompleted')
    ipcRenderer.removeAllListeners('yolo:completed')
  }
}
