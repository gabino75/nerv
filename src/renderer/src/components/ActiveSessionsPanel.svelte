<script lang="ts">
  /**
   * Active Sessions Panel (PRD Section 10: Concurrent Sessions)
   * Shows all active Claude Code sessions with context usage and controls
   */
  import { onMount, onDestroy } from 'svelte'
  import { selectedProject, appStore } from '../stores/appState'
  import type { Project } from '../stores/appState'
  import type { ActiveClaudeSession } from '../../../shared/types'
  import { MODEL_CONTEXT_SIZES } from '../../../shared/constants'

  interface Props {
    isOpen: boolean
    onClose: () => void
    onFocusSession?: (sessionId: string) => void
  }

  let { isOpen, onClose, onFocusSession }: Props = $props()

  let currentProject = $state<Project | null>(null)
  let sessions = $state<ActiveClaudeSession[]>([])
  let loading = $state(false)
  let refreshInterval: ReturnType<typeof setInterval> | null = null
  let tasks = $state<Map<string, { title: string }>>(new Map())

  $effect(() => {
    const unsubs = [
      selectedProject.subscribe(p => { currentProject = p }),
      appStore.subscribe(state => {
        const taskMap = new Map<string, { title: string }>()
        for (const task of state.tasks) {
          taskMap.set(task.id, { title: task.title })
        }
        tasks = taskMap
      })
    ]
    return () => unsubs.forEach(fn => fn())
  })

  async function loadSessions() {
    loading = true
    try {
      sessions = await window.api.claude.getAllSessions()
    } catch (err) {
      console.error('Failed to load sessions:', err)
    } finally {
      loading = false
    }
  }

  function getContextSize(model: string): number {
    return MODEL_CONTEXT_SIZES[model] || 200000
  }

  function getUsagePercent(session: ActiveClaudeSession): number {
    const total = session.tokenUsage.inputTokens + session.tokenUsage.outputTokens
    return (total / getContextSize(session.model)) * 100
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

  function getSessionTitle(session: ActiveClaudeSession): string {
    if (session.taskId) {
      const task = tasks.get(session.taskId)
      return task?.title || `Task: ${session.taskId.slice(0, 8)}`
    }
    return 'Standalone Session'
  }

  async function handleKillSession(sessionId: string) {
    try {
      await window.api.claude.kill(sessionId)
      await loadSessions()
    } catch (err) {
      console.error('Failed to kill session:', err)
    }
  }

  function handleFocusSession(sessionId: string) {
    if (onFocusSession) {
      onFocusSession(sessionId)
    }
    onClose()
  }

  onMount(() => {
    if (isOpen) {
      loadSessions()
      // Refresh every 2 seconds while panel is open
      refreshInterval = setInterval(loadSessions, 2000)
    }
  })

  onDestroy(() => {
    if (refreshInterval) {
      clearInterval(refreshInterval)
    }
  })

  // Reload when panel opens
  $effect(() => {
    if (isOpen) {
      loadSessions()
      if (!refreshInterval) {
        refreshInterval = setInterval(loadSessions, 2000)
      }
    } else if (refreshInterval) {
      clearInterval(refreshInterval)
      refreshInterval = null
    }
  })
</script>

{#if isOpen}
  <div class="overlay" role="dialog" aria-modal="true" aria-labelledby="panel-title">
    <div class="panel" data-testid="active-sessions-panel">
      <header class="panel-header">
        <h2 id="panel-title">Active Sessions</h2>
        <button class="close-btn" onclick={onClose} aria-label="Close panel">×</button>
      </header>

      <div class="panel-content">
        {#if loading && sessions.length === 0}
          <div class="loading">Loading sessions...</div>
        {:else if sessions.length === 0}
          <div class="empty-state">
            <p>No active Claude Code sessions</p>
            <p class="hint">Start a task or create a new Claude session to see it here</p>
          </div>
        {:else}
          <div class="sessions-list">
            {#each sessions as session (session.sessionId)}
              <div class="session-card" class:running={session.isRunning}>
                <div class="session-header">
                  <span class="status-indicator" class:running={session.isRunning}>
                    {session.isRunning ? '●' : '○'}
                  </span>
                  <span class="session-title">{getSessionTitle(session)}</span>
                  <span class="model-badge">{getModelShortName(session.model)}</span>
                </div>

                <div class="session-details">
                  <div class="context-row">
                    <span class="label">Context:</span>
                    <span class="value">
                      {formatTokens(session.tokenUsage.inputTokens)} / {formatTokens(getContextSize(session.model))}
                    </span>
                    <span class="percent">({getUsagePercent(session).toFixed(1)}%)</span>
                  </div>

                  <div class="progress-bar">
                    <div
                      class="progress-fill"
                      style="width: {Math.min(getUsagePercent(session), 100)}%; background: {getProgressColor(getUsagePercent(session))}"
                    ></div>
                  </div>

                  {#if session.compactionCount > 0}
                    <div class="compaction-warning">
                      Compacted {session.compactionCount} time(s)
                    </div>
                  {/if}
                </div>

                <div class="session-actions">
                  <button
                    class="btn-focus"
                    onclick={() => handleFocusSession(session.sessionId)}
                    title="Focus this session"
                  >
                    Focus
                  </button>
                  <button
                    class="btn-stop"
                    onclick={() => handleKillSession(session.sessionId)}
                    title="Stop this session"
                    disabled={!session.isRunning}
                  >
                    Stop
                  </button>
                </div>
              </div>
            {/each}
          </div>

          <div class="sessions-summary">
            <span>{sessions.filter(s => s.isRunning).length} running</span>
            <span class="separator">|</span>
            <span>{sessions.length} total</span>
          </div>
        {/if}
      </div>
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
    max-width: 500px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px;
    border-bottom: 1px solid var(--color-nerv-border, #2a2a3a);
  }

  .panel-header h2 {
    margin: 0;
    font-size: 18px;
    color: var(--color-nerv-text, #e0e0e0);
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

  .sessions-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .session-card {
    background: var(--color-nerv-bg, #0a0a0f);
    border: 1px solid var(--color-nerv-border, #2a2a3a);
    border-radius: var(--radius-nerv-md, 6px);
    padding: 12px;
    transition: border-color 0.2s;
  }

  .session-card.running {
    border-color: var(--color-nerv-primary, #ff6b35);
  }

  .session-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  .status-indicator {
    color: var(--color-nerv-text-muted, #888);
    font-size: 12px;
  }

  .status-indicator.running {
    color: var(--color-nerv-success, #6bcb77);
  }

  .session-title {
    flex: 1;
    font-weight: 500;
    color: var(--color-nerv-text, #e0e0e0);
    font-size: 14px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .model-badge {
    padding: 2px 8px;
    background: var(--color-nerv-primary, #ff6b35);
    border-radius: var(--radius-nerv-sm, 4px);
    color: white;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
  }

  .session-details {
    margin-bottom: 12px;
  }

  .context-row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-family: 'SF Mono', Monaco, 'Courier New', monospace;
    margin-bottom: 4px;
  }

  .label {
    color: var(--color-nerv-text-dim, #666);
  }

  .value {
    color: var(--color-nerv-text, #e0e0e0);
  }

  .percent {
    color: var(--color-nerv-text-muted, #888);
  }

  .progress-bar {
    height: 4px;
    background: var(--color-nerv-bg-alt, #1a1a24);
    border-radius: 2px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    border-radius: 2px;
    transition: width 0.3s ease;
  }

  .compaction-warning {
    margin-top: 6px;
    font-size: 11px;
    color: var(--color-nerv-warning, #ffd93d);
  }

  .session-actions {
    display: flex;
    gap: 8px;
  }

  .btn-focus, .btn-stop {
    flex: 1;
    padding: 6px 12px;
    font-size: 12px;
    border-radius: var(--radius-nerv-sm, 4px);
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-focus {
    background: var(--color-nerv-primary, #ff6b35);
    border: none;
    color: white;
  }

  .btn-focus:hover {
    background: var(--color-nerv-primary-hover, #ff8555);
  }

  .btn-stop {
    background: transparent;
    border: 1px solid var(--color-nerv-border, #2a2a3a);
    color: var(--color-nerv-text-muted, #888);
  }

  .btn-stop:hover:not(:disabled) {
    border-color: var(--color-nerv-error, #ff6b6b);
    color: var(--color-nerv-error, #ff6b6b);
  }

  .btn-stop:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .sessions-summary {
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid var(--color-nerv-border, #2a2a3a);
    text-align: center;
    font-size: 12px;
    color: var(--color-nerv-text-dim, #666);
  }

  .separator {
    margin: 0 8px;
  }
</style>
