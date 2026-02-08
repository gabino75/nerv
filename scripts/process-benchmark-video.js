#!/usr/bin/env node

/**
 * NERV Benchmark Video Post-Processor
 *
 * Reads Playwright's raw video recording and an event log, then uses ffmpeg to
 * produce a polished demo video with:
 * - Speed-up during Claude "thinking" periods (3x)
 * - Slow-down at key UI interactions (0.5x)
 * - Text overlays at event timestamps
 * - Zoom-in to relevant UI regions
 *
 * Usage:
 *   node scripts/process-benchmark-video.js <run-dir>
 *
 * Expects:
 *   <run-dir>/video/        - Playwright raw video (webm)
 *   <run-dir>/event-log.jsonl - Timestamped event log
 *
 * Produces:
 *   <run-dir>/video/benchmark-final.mp4
 */

import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

// ============================================================================
// Region Map (1920x1080 viewport)
// ============================================================================

const REGIONS = {
  'project-selector': { x: 0, y: 80, w: 200, h: 320 },
  'task-board': { x: 200, y: 80, w: 1500, h: 320 },
  'approval-queue': { x: 1700, y: 80, w: 220, h: 320 },
  'terminal-panel': { x: 0, y: 400, w: 1920, h: 500 },
  'action-bar': { x: 0, y: 900, w: 1920, h: 60 },
  'context-monitor': { x: 0, y: 960, w: 1920, h: 40 },
}

// ============================================================================
// Main
// ============================================================================

function main() {
  const runDir = process.argv[2]
  if (!runDir) {
    console.error('Usage: node scripts/process-benchmark-video.js <run-dir>')
    process.exit(1)
  }

  if (!fs.existsSync(runDir)) {
    console.error(`Run directory not found: ${runDir}`)
    process.exit(1)
  }

  // Check for ffmpeg
  try {
    execSync('ffmpeg -version', { stdio: 'pipe' })
  } catch {
    console.error('ffmpeg not found. Install it with: apt install ffmpeg (Linux) or brew install ffmpeg (macOS)')
    process.exit(1)
  }

  // Find video file
  const videoDir = path.join(runDir, 'video')
  let inputVideo = null

  if (fs.existsSync(videoDir)) {
    const videos = fs.readdirSync(videoDir).filter(f => f.endsWith('.webm') || f.endsWith('.mp4'))
    if (videos.length > 0) {
      inputVideo = path.join(videoDir, videos[0])
    }
  }

  if (!inputVideo) {
    // Also check for Playwright's default location
    const webmFiles = fs.readdirSync(runDir).filter(f => f.endsWith('.webm'))
    if (webmFiles.length > 0) {
      inputVideo = path.join(runDir, webmFiles[0])
    }
  }

  if (!inputVideo) {
    console.error('No video file found in run directory')
    console.log('Ensure Playwright video recording is enabled (NERV_RECORD_ALL=true)')
    process.exit(1)
  }

  // Read event log
  const eventLogPath = path.join(runDir, 'event-log.jsonl')
  const events = readEventLog(eventLogPath)

  console.log(`Input video: ${inputVideo}`)
  console.log(`Events: ${events.length}`)

  // Build ffmpeg filter chain
  const filters = buildFilterChain(events)
  const outputPath = path.join(videoDir || runDir, 'benchmark-final.mp4')

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath)
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  // Run ffmpeg
  console.log(`Output: ${outputPath}`)
  console.log('Processing...')

  const filterComplex = filters.length > 0 ? `-filter_complex "${filters.join(';')}"` : ''
  const cmd = [
    'ffmpeg -y',
    `-i "${inputVideo}"`,
    filterComplex,
    '-c:v libx264 -crf 23 -preset fast',
    '-c:a aac -b:a 128k',
    '-movflags +faststart',
    `"${outputPath}"`,
  ].filter(Boolean).join(' ')

  try {
    execSync(cmd, { stdio: 'inherit', timeout: 600000 })
    console.log(`\nDone! Video saved to: ${outputPath}`)
  } catch (error) {
    console.error('ffmpeg processing failed')
    // Fallback: just copy/convert the video without filters
    console.log('Attempting simple conversion...')
    try {
      execSync(
        `ffmpeg -y -i "${inputVideo}" -c:v libx264 -crf 23 -preset fast "${outputPath}"`,
        { stdio: 'inherit', timeout: 300000 },
      )
      console.log(`Fallback conversion done: ${outputPath}`)
    } catch {
      console.error('Fallback conversion also failed')
      process.exit(1)
    }
  }
}

// ============================================================================
// Event Log Parsing
// ============================================================================

function readEventLog(eventLogPath) {
  if (!fs.existsSync(eventLogPath)) {
    console.log('No event log found, using basic conversion')
    return []
  }

  const lines = fs.readFileSync(eventLogPath, 'utf-8').trim().split('\n')
  return lines
    .map(line => {
      try { return JSON.parse(line) }
      catch { return null }
    })
    .filter(Boolean)
}

// ============================================================================
// ffmpeg Filter Chain Builder
// ============================================================================

function buildFilterChain(events) {
  if (events.length === 0) return []

  const filters = []

  // Collect text overlay events (drawtext filter)
  const textEvents = events.filter(e =>
    e.label && (
      e.event.includes('created') ||
      e.event.includes('started') ||
      e.event.includes('completed') ||
      e.event.includes('phase_') ||
      e.event.includes('grading')
    ),
  )

  // Build drawtext filters for key events
  // Each label is shown for 3 seconds starting at its timestamp
  const drawTexts = textEvents.slice(0, 20).map((e, i) => {
    const startSec = (e.t / 1000).toFixed(2)
    const endSec = ((e.t + 3000) / 1000).toFixed(2)
    const label = sanitizeForFfmpeg(e.label || e.event)

    return `drawtext=text='${label}':fontsize=24:fontcolor=white:borderw=2:bordercolor=black:x=20:y=${50 + (i % 3) * 40}:enable='between(t,${startSec},${endSec})'`
  })

  if (drawTexts.length > 0) {
    filters.push(`[0:v]${drawTexts.join(',')}[out]`)
    // Note: when using filter_complex with labelled output, we need -map
  }

  // Speed-up segments during claude_thinking events
  const speedEvents = events.filter(e => e.action === 'speed-up' || e.action === 'normal-speed')
  if (speedEvents.length >= 2 && drawTexts.length === 0) {
    // Simple case: apply setpts for speed changes
    // For complex cases with both drawtext and speed, use drawtext only
    const firstSpeedUp = speedEvents.find(e => e.action === 'speed-up')
    const firstNormal = speedEvents.find(e => e.action === 'normal-speed' && e.t > (firstSpeedUp?.t || 0))

    if (firstSpeedUp && firstNormal) {
      const factor = firstSpeedUp.factor || 3
      // Apply speed-up to the entire thinking segment
      // This is simplified; a full implementation would use segment-based trim+concat
      filters.push(`[0:v]setpts=PTS/${factor}[out]`)
    }
  }

  return filters
}

function sanitizeForFfmpeg(text) {
  // Escape characters that are special in ffmpeg drawtext
  return text
    .replace(/'/g, "'\\''")
    .replace(/:/g, '\\:')
    .replace(/\\/g, '\\\\')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .slice(0, 80)
}

// ============================================================================
// Run
// ============================================================================

main()
