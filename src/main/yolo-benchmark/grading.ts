/**
 * YOLO Benchmark grading and comparison
 */

import { databaseService } from '../database'
import type { YoloBenchmarkResult, YoloBenchmarkGrade } from '../../shared/types'
import { YOLO_BENCHMARK_DEFAULTS, YOLO_BENCHMARK_GRADE_WEIGHTS } from '../../shared/constants'

/**
 * Calculate grade for a benchmark result
 */
export function calculateBenchmarkGrade(result: YoloBenchmarkResult): YoloBenchmarkGrade {
  const totalTests = result.testsPassed + result.testsFailed

  // Spec completion (0-100)
  const specCompletion = result.specCompletionPct

  // Test pass rate (0-100)
  const testPassRate = totalTests > 0
    ? (result.testsPassed / totalTests) * 100
    : 0

  // Cost efficiency (inverse of cost, scaled)
  const costEfficiency = Math.max(0, Math.min(100,
    (1 - (result.totalCostUsd / YOLO_BENCHMARK_DEFAULTS.maxCostUsd)) * 100
  ))

  // Weighted overall score
  const overallScore =
    specCompletion * YOLO_BENCHMARK_GRADE_WEIGHTS.specCompletion +
    testPassRate * YOLO_BENCHMARK_GRADE_WEIGHTS.testPassRate +
    costEfficiency * YOLO_BENCHMARK_GRADE_WEIGHTS.costEfficiency

  return {
    specCompletion,
    testPassRate,
    costEfficiency,
    overallScore
  }
}

/**
 * Compare multiple benchmark results
 */
export function compareBenchmarks(resultIds: string[]): {
  results: YoloBenchmarkResult[]
  grades: Record<string, YoloBenchmarkGrade>
  winner: string | null
} {
  const results: YoloBenchmarkResult[] = []
  const grades: Record<string, YoloBenchmarkGrade> = {}

  for (const id of resultIds) {
    const result = databaseService.getYoloBenchmarkResult(id)
    if (result) {
      results.push(result)
      grades[id] = calculateBenchmarkGrade(result)
    }
  }

  let winner: string | null = null
  let highestScore = -1

  for (const [id, grade] of Object.entries(grades)) {
    if (grade.overallScore > highestScore) {
      highestScore = grade.overallScore
      winner = id
    }
  }

  return { results, grades, winner }
}
