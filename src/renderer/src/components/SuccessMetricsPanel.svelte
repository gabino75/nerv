<script lang="ts">
  /**
   * Success Metrics Panel (PRD Section 31: Success Metrics)
   * Shows key performance indicators with targets and current values
   */
  import { onMount } from 'svelte'
  import { selectedProject } from '../stores/appState'
  import type { Project } from '../stores/appState'
  import type { SuccessMetricType } from '../../../shared/types'

  interface Props {
    isOpen: boolean
    onClose: () => void
  }

  let { isOpen, onClose }: Props = $props()

  let currentProject = $state<Project | null>(null)
  let loading = $state(false)
  let summary = $state<{
    metrics: Array<{
      type: SuccessMetricType
      target: number
      current: number
      passed: boolean
      sampleCount: number
      description: string
    }>
    overallPassRate: number
    totalMetrics: number
    passingMetrics: number
  } | null>(null)

  // Calculated rates from actual data
  let dangerousCommandRate = $state<{ total: number; caught: number; percentage: number } | null>(null)
  let recoveryRate = $state<{ total: number; recovered: number; percentage: number } | null>(null)

  $effect(() => {
    const unsub = selectedProject.subscribe(p => { currentProject = p })
    return () => unsub()
  })

  async function loadMetrics() {
    loading = true
    try {
      const projectId = currentProject?.id
      summary = await window.api.successMetrics.getSummary(projectId)
      dangerousCommandRate = await window.api.successMetrics.calculateDangerousCommandRate(projectId)
      recoveryRate = await window.api.successMetrics.calculateRecoveryRate(projectId)
    } catch (err) {
      console.error('Failed to load success metrics:', err)
    } finally {
      loading = false
    }
  }

  function formatMetricValue(type: SuccessMetricType, value: number): string {
    if (type === 'time_to_first_task') {
      // Convert ms to minutes:seconds
      const seconds = Math.floor(value / 1000)
      const mins = Math.floor(seconds / 60)
      const secs = seconds % 60
      return `${mins}:${secs.toString().padStart(2, '0')}`
    }
    if (type === 'context_reexplanation') {
      return value.toString()
    }
    // Percentages
    return `${value.toFixed(1)}%`
  }

  function formatTarget(type: SuccessMetricType, target: number): string {
    if (type === 'time_to_first_task') {
      return '< 5:00'
    }
    if (type === 'context_reexplanation') {
      return '0'
    }
    return `> ${target}%`
  }

  function getMetricIcon(type: SuccessMetricType): string {
    switch (type) {
      case 'time_to_first_task': return '\u23F1' // stopwatch
      case 'context_reexplanation': return '\uD83D\uDCAC' // speech bubble
      case 'dangerous_command_catch': return '\uD83D\uDEE1' // shield
      case 'recovery_success_rate': return '\u267B' // recycle
      case 'benchmark_pass_simple': return '\u2705' // check
      case 'benchmark_pass_medium': return '\uD83C\uDFC6' // trophy
      default: return '\uD83D\uDCCA' // chart
    }
  }

  onMount(() => {
    if (isOpen) {
      loadMetrics()
    }
  })

  // Reload when panel opens or project changes
  $effect(() => {
    if (isOpen) {
      loadMetrics()
    }
  })
</script>

{#if isOpen}
  <div class="overlay" role="dialog" aria-modal="true" aria-labelledby="panel-title">
    <div class="panel" data-testid="success-metrics-panel">
      <header class="panel-header">
        <h2 id="panel-title">Success Metrics</h2>
        <span class="subtitle">PRD Section 31 KPIs</span>
        <button class="close-btn" onclick={onClose} aria-label="Close panel">&times;</button>
      </header>

      <div class="panel-content">
        {#if loading}
          <div class="loading">Loading metrics...</div>
        {:else if !summary || summary.metrics.length === 0}
          <div class="empty-state">
            <p>No metrics recorded yet</p>
            <p class="hint">Metrics are tracked as you use NERV: starting tasks, handling permissions, running benchmarks</p>
          </div>
        {:else}
          <!-- Overall Summary -->
          <div class="overall-summary" class:passing={summary.overallPassRate >= 80}>
            <div class="summary-stat">
              <span class="stat-value">{summary.passingMetrics}/{summary.totalMetrics}</span>
              <span class="stat-label">Passing</span>
            </div>
            <div class="summary-stat">
              <span class="stat-value">{summary.overallPassRate.toFixed(0)}%</span>
              <span class="stat-label">Pass Rate</span>
            </div>
          </div>

          <!-- Metrics List -->
          <div class="metrics-list">
            {#each summary.metrics as metric (metric.type)}
              <div class="metric-card" class:passed={metric.passed} class:failed={!metric.passed}>
                <div class="metric-header">
                  <span class="metric-icon">{getMetricIcon(metric.type)}</span>
                  <span class="metric-title">{metric.description}</span>
                  <span class="metric-status" class:passed={metric.passed} class:failed={!metric.passed}>
                    {metric.passed ? '\u2713' : '\u2717'}
                  </span>
                </div>

                <div class="metric-values">
                  <div class="metric-current">
                    <span class="label">Current:</span>
                    <span class="value">{formatMetricValue(metric.type, metric.current)}</span>
                  </div>
                  <div class="metric-target">
                    <span class="label">Target:</span>
                    <span class="value">{formatTarget(metric.type, metric.target)}</span>
                  </div>
                </div>

                <div class="metric-footer">
                  <span class="sample-count">{metric.sampleCount} sample(s)</span>
                </div>
              </div>
            {/each}
          </div>

          <!-- Calculated Rates Section -->
          <div class="calculated-section">
            <h3>Live Calculated Rates</h3>
            <p class="section-hint">From approval and task records</p>

            {#if dangerousCommandRate}
              <div class="rate-card">
                <span class="rate-label">Dangerous Command Catch Rate</span>
                <span class="rate-value" class:good={dangerousCommandRate.percentage >= 90}>
                  {dangerousCommandRate.caught}/{dangerousCommandRate.total}
                  ({dangerousCommandRate.total > 0 ? dangerousCommandRate.percentage.toFixed(1) : 100}%)
                </span>
              </div>
            {/if}

            {#if recoveryRate}
              <div class="rate-card">
                <span class="rate-label">Task Recovery Rate</span>
                <span class="rate-value" class:good={recoveryRate.percentage >= 95}>
                  {recoveryRate.recovered}/{recoveryRate.total}
                  ({recoveryRate.total > 0 ? recoveryRate.percentage.toFixed(1) : 100}%)
                </span>
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <footer class="panel-footer">
        <button class="btn-refresh" onclick={loadMetrics} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--z-nerv-modal, 1000);
  }

  .panel {
    background: var(--color-nerv-panel, #12121a);
    border: 1px solid var(--color-nerv-border, #2a2a3a);
    border-radius: var(--radius-nerv-lg, 8px);
    width: 90%;
    max-width: 550px;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
  }

  .panel-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
    border-bottom: 1px solid var(--color-nerv-border, #2a2a3a);
  }

  .panel-header h2 {
    margin: 0;
    font-size: 18px;
    color: var(--color-nerv-text, #e0e0e0);
  }

  .subtitle {
    flex: 1;
    font-size: 12px;
    color: var(--color-nerv-text-dim, #666);
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--color-nerv-text-muted, #888);
    font-size: 24px;
    cursor: pointer;
    padding: 0 8px;
    line-height: 1;
  }

  .close-btn:hover {
    color: var(--color-nerv-text, #e0e0e0);
  }

  .panel-content {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
  }

  .loading, .empty-state {
    text-align: center;
    padding: 32px;
    color: var(--color-nerv-text-dim, #666);
  }

  .empty-state .hint {
    margin-top: 8px;
    font-size: 12px;
    color: var(--color-nerv-text-muted, #888);
  }

  .overall-summary {
    display: flex;
    justify-content: center;
    gap: 32px;
    padding: 20px;
    margin-bottom: 16px;
    background: var(--color-nerv-bg, #0a0a0f);
    border-radius: var(--radius-nerv-md, 6px);
    border: 1px solid var(--color-nerv-border, #2a2a3a);
  }

  .overall-summary.passing {
    border-color: var(--color-nerv-success, #6bcb77);
  }

  .summary-stat {
    text-align: center;
  }

  .stat-value {
    display: block;
    font-size: 28px;
    font-weight: 700;
    color: var(--color-nerv-text, #e0e0e0);
  }

  .stat-label {
    font-size: 12px;
    color: var(--color-nerv-text-dim, #666);
    text-transform: uppercase;
  }

  .metrics-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .metric-card {
    background: var(--color-nerv-bg, #0a0a0f);
    border: 1px solid var(--color-nerv-border, #2a2a3a);
    border-radius: var(--radius-nerv-md, 6px);
    padding: 12px;
    transition: border-color 0.2s;
  }

  .metric-card.passed {
    border-left: 3px solid var(--color-nerv-success, #6bcb77);
  }

  .metric-card.failed {
    border-left: 3px solid var(--color-nerv-error, #ff6b6b);
  }

  .metric-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  .metric-icon {
    font-size: 18px;
  }

  .metric-title {
    flex: 1;
    font-weight: 500;
    color: var(--color-nerv-text, #e0e0e0);
    font-size: 14px;
  }

  .metric-status {
    font-size: 16px;
    font-weight: bold;
  }

  .metric-status.passed {
    color: var(--color-nerv-success, #6bcb77);
  }

  .metric-status.failed {
    color: var(--color-nerv-error, #ff6b6b);
  }

  .metric-values {
    display: flex;
    gap: 24px;
    font-family: 'SF Mono', Monaco, 'Courier New', monospace;
    font-size: 13px;
    margin-bottom: 6px;
  }

  .metric-values .label {
    color: var(--color-nerv-text-dim, #666);
  }

  .metric-values .value {
    color: var(--color-nerv-text, #e0e0e0);
    font-weight: 500;
  }

  .metric-footer {
    font-size: 11px;
    color: var(--color-nerv-text-muted, #888);
  }

  .calculated-section {
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid var(--color-nerv-border, #2a2a3a);
  }

  .calculated-section h3 {
    margin: 0 0 4px 0;
    font-size: 14px;
    color: var(--color-nerv-text, #e0e0e0);
  }

  .section-hint {
    margin: 0 0 12px 0;
    font-size: 11px;
    color: var(--color-nerv-text-dim, #666);
  }

  .rate-card {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 12px;
    background: var(--color-nerv-bg, #0a0a0f);
    border-radius: var(--radius-nerv-sm, 4px);
    margin-bottom: 8px;
  }

  .rate-label {
    font-size: 13px;
    color: var(--color-nerv-text-muted, #888);
  }

  .rate-value {
    font-family: 'SF Mono', Monaco, 'Courier New', monospace;
    font-size: 13px;
    color: var(--color-nerv-text, #e0e0e0);
  }

  .rate-value.good {
    color: var(--color-nerv-success, #6bcb77);
  }

  .panel-footer {
    padding: 12px 16px;
    border-top: 1px solid var(--color-nerv-border, #2a2a3a);
    display: flex;
    justify-content: flex-end;
  }

  .btn-refresh {
    padding: 8px 16px;
    background: var(--color-nerv-primary, #ff6b35);
    border: none;
    border-radius: var(--radius-nerv-sm, 4px);
    color: white;
    font-size: 13px;
    cursor: pointer;
    transition: background 0.15s;
  }

  .btn-refresh:hover:not(:disabled) {
    background: var(--color-nerv-primary-hover, #ff8555);
  }

  .btn-refresh:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
