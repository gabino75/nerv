<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { appStore } from '../stores/appState'
  import type { SessionMetrics, ActiveSubagent } from '../stores/appState'
  import { MODEL_CONTEXT_SIZES } from '../../../shared/constants'

  let metrics: SessionMetrics | null = null
  let isRunning = false
  let activeSubagents: ActiveSubagent[] = []

  let unsubStore: (() => void) | null = null
  unsubStore = appStore.subscribe(state => {
    metrics = state.sessionMetrics
    isRunning = state.isTaskRunning
    activeSubagents = state.activeSubagents
  })

  // PRD Section 6: Wire to IPC for real-time stream-json token data
  onMount(() => {
    window.api.claude.onTokenUsage((_sessionId, usage, compactionCount) => {
      if (metrics) {
        metrics = {
          ...metrics,
          inputTokens: usage.input_tokens ?? metrics.inputTokens,
          outputTokens: usage.output_tokens ?? metrics.outputTokens,
          compactionCount: compactionCount ?? metrics.compactionCount
        }
      }
    })

    window.api.recovery.onCompactionNotice((_sessionId, _taskId, count, sinceClear) => {
      if (metrics) {
        metrics = {
          ...metrics,
          compactionCount: count,
          compactionsSinceClear: sinceClear
        }
      }
    })
  })

  onDestroy(() => {
    unsubStore?.()
  })

  function getContextSize(model: string): number {
    return MODEL_CONTEXT_SIZES[model] || 200000
  }

  function getUsagePercent(input: number, model: string): number {
    return (input / getContextSize(model)) * 100
  }

  function formatTokens(tokens: number): string {
    if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(1)}K`
    }
    return tokens.toString()
  }

  function getModelShortName(model: string): string {
    if (model.includes('opus')) return 'Opus'
    if (model.includes('sonnet')) return 'Sonnet'
    if (model.includes('haiku')) return 'Haiku'
    return model
  }

  function getProgressColor(percent: number): string {
    if (percent < 50) return 'var(--color-nerv-success)'
    if (percent < 75) return 'var(--color-nerv-warning)'
    return 'var(--color-nerv-error)'
  }
</script>

<div class="context-bar context-monitor" data-testid="context-monitor" class:active={isRunning}>
  {#if metrics && isRunning}
    <div class="context-content">
      <span class="model-badge">{getModelShortName(metrics.model)}</span>

      <div class="context-usage">
        <span class="usage-label">Context:</span>
        <span class="usage-value">
          {formatTokens(metrics.inputTokens)} / {formatTokens(getContextSize(metrics.model))}
        </span>
        <span class="usage-percent">
          ({getUsagePercent(metrics.inputTokens, metrics.model).toFixed(1)}%)
        </span>
      </div>

      <div class="progress-bar">
        <div
          class="progress-fill"
          style="width: {Math.min(getUsagePercent(metrics.inputTokens, metrics.model), 100)}%; background: {getProgressColor(getUsagePercent(metrics.inputTokens, metrics.model))}"
        ></div>
      </div>

      <div class="context-stats">
        <span class="stat">
          <span class="stat-label">Out:</span>
          <span class="stat-value">{formatTokens(metrics.outputTokens)}</span>
        </span>
        <!-- PRD Section 6: Show both session total and since-clear counts -->
        <span class="stat">
          <span class="stat-label">Compacts:</span>
          <span class="stat-value" class:warning={metrics.compactionCount > 0}>
            {metrics.compactionCount}
          </span>
        </span>
        <span class="stat">
          <span class="stat-label">Since /clear:</span>
          <span class="stat-value" class:warning={(metrics.compactionsSinceClear ?? 0) > 0}>
            {metrics.compactionsSinceClear ?? 0}
          </span>
        </span>
      </div>

      <!-- PRD Section 6: Show warning when context usage exceeds 75% -->
      {#if getUsagePercent(metrics.inputTokens, metrics.model) >= 75}
        <div class="context-warning" data-testid="context-warning">
          <span class="warning-icon">⚠️</span>
          <span class="warning-text">At ~75% usage, Claude Code will auto-compact context</span>
        </div>
      {/if}

      {#if activeSubagents.length > 0}
        <div class="subagents" data-testid="active-subagents">
          <span class="subagents-label">Subagents:</span>
          <div class="subagent-list">
            {#each activeSubagents as subagent (subagent.id)}
              <span class="subagent-badge" data-testid="subagent-badge">
                <span class="subagent-spinner"></span>
                {subagent.agentType}
              </span>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {:else}
    <span class="context-inactive">
      Model: -- | Context: --/-- | 0 compacts
    </span>
  {/if}
</div>

<style>
  .context-bar {
    background: var(--color-nerv-panel);
    border: 1px solid var(--color-nerv-border);
    border-radius: var(--radius-nerv-md);
    padding: 8px 16px;
    font-size: 12px;
    color: var(--color-nerv-text-dim);
    transition: all 0.3s;
    flex-shrink: 0;
  }

  .context-bar.active {
    border-color: var(--color-nerv-border-hover);
    background: var(--color-nerv-panel-hover);
  }

  .context-content {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .model-badge {
    padding: 3px 10px;
    background: var(--color-nerv-primary);
    border-radius: var(--radius-nerv-sm);
    color: white;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .context-usage {
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: 'SF Mono', Monaco, 'Courier New', monospace;
  }

  .usage-label {
    color: var(--color-nerv-text-dim);
  }

  .usage-value {
    color: var(--color-nerv-text);
  }

  .usage-percent {
    color: var(--color-nerv-text-muted);
  }

  .progress-bar {
    width: 120px;
    height: 6px;
    background: var(--color-nerv-bg);
    border-radius: 3px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    border-radius: 3px;
    transition: width 0.3s ease;
  }

  .context-stats {
    display: flex;
    gap: 16px;
    margin-left: auto;
  }

  .stat {
    display: flex;
    gap: 4px;
    font-family: 'SF Mono', Monaco, 'Courier New', monospace;
  }

  .stat-label {
    color: var(--color-nerv-text-dim);
  }

  .stat-value {
    color: var(--color-nerv-text-muted);
  }

  .stat-value.warning {
    color: var(--color-nerv-warning);
  }

  .context-inactive {
    font-family: 'SF Mono', Monaco, 'Courier New', monospace;
    color: var(--color-nerv-text-dim);
  }

  /* PRD Section 6: Context usage warning at 75%+ */
  .context-warning {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    background: rgba(240, 173, 78, 0.15);
    border: 1px solid var(--color-nerv-warning);
    border-radius: var(--radius-nerv-sm);
    font-size: 11px;
    color: var(--color-nerv-warning);
  }

  .warning-icon {
    font-size: 12px;
  }

  .warning-text {
    white-space: nowrap;
  }

  .subagents {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-left: 16px;
    border-left: 1px solid var(--color-nerv-border);
  }

  .subagents-label {
    color: var(--color-nerv-text-dim);
    font-size: 11px;
  }

  .subagent-list {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .subagent-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    background: var(--color-nerv-bg);
    border: 1px solid var(--color-nerv-border);
    border-radius: var(--radius-nerv-sm);
    color: var(--color-nerv-text-muted);
    font-size: 10px;
    font-weight: 500;
    text-transform: capitalize;
  }

  .subagent-spinner {
    width: 8px;
    height: 8px;
    border: 1.5px solid var(--color-nerv-primary);
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
