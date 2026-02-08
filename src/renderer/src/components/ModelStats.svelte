<script lang="ts">
  import { MONTHLY_BUDGET_DEFAULTS, BUDGET_SETTINGS_KEYS, MODEL_CONTEXT_SIZES } from '../../../shared/constants'
  import { appStore } from '../stores/appState'
  import type { SessionMetrics } from '../stores/appState'

  interface ModelStat {
    model: string
    task_count: number
    total_input_tokens: number
    total_output_tokens: number
    total_cost_usd: number
    total_duration_ms: number
    avg_turns: number
  }

  interface MonthlyData {
    totalCost: number
    taskCount: number
    monthStart: string
  }

  interface ProjectCost {
    projectId: string
    projectName: string
    totalCost: number
    taskCount: number
    inputTokens: number
    outputTokens: number
  }

  // PRD Section 14: Recent Tasks table
  interface RecentTask {
    taskId: string
    taskTitle: string
    status: string
    durationMs: number
    inputTokens: number
    outputTokens: number
    costUsd: number
    completedAt: string | null
    updatedAt: string
  }

  interface Props {
    isOpen: boolean
    onClose: () => void
  }

  let { isOpen, onClose }: Props = $props()

  let stats = $state<ModelStat[]>([])
  let monthlyData = $state<MonthlyData | null>(null)
  let projectCosts = $state<ProjectCost[]>([])
  let recentTasks = $state<RecentTask[]>([])
  let monthlyBudget = $state(MONTHLY_BUDGET_DEFAULTS.budgetUsd)
  let isLoading = $state(true)
  let error = $state<string | null>(null)
  let isEditingBudget = $state(false)
  let budgetInput = $state('')
  let isExporting = $state(false)

  // PRD Section 14: "This Session" panel state
  let sessionMetrics = $state<SessionMetrics | null>(null)
  let isSessionRunning = $state(false)
  let sessionStartTime = $state<number | null>(null)
  let sessionDuration = $state(0)
  let durationInterval: ReturnType<typeof setInterval> | null = null

  // Subscribe to session metrics updates
  appStore.subscribe(state => {
    sessionMetrics = state.sessionMetrics
    const wasRunning = isSessionRunning
    isSessionRunning = state.isTaskRunning

    // Track session start time
    if (isSessionRunning && !wasRunning) {
      sessionStartTime = Date.now()
      sessionDuration = 0
    } else if (!isSessionRunning && wasRunning) {
      sessionStartTime = null
    }
  })

  // Update duration every second while session is running
  $effect(() => {
    if (isOpen && isSessionRunning && sessionStartTime) {
      durationInterval = setInterval(() => {
        sessionDuration = Date.now() - (sessionStartTime ?? Date.now())
      }, 1000)
      return () => {
        if (durationInterval) clearInterval(durationInterval)
      }
    }
  })

  // Estimate session cost based on token usage (rough estimate)
  function getSessionCostEstimate(): number {
    if (!sessionMetrics) return 0
    const model = sessionMetrics.model || 'sonnet'
    // Approximate cost per 1K tokens (input + output weighted)
    const costPer1k = model.includes('opus') ? 0.03 : model.includes('haiku') ? 0.001 : 0.006
    const totalTokens = sessionMetrics.inputTokens + sessionMetrics.outputTokens
    return (totalTokens / 1000) * costPer1k
  }

  function getSessionContextPercent(): number {
    if (!sessionMetrics) return 0
    const contextSize = MODEL_CONTEXT_SIZES[sessionMetrics.model] || 200000
    return (sessionMetrics.inputTokens / contextSize) * 100
  }

  async function loadStats() {
    isLoading = true
    error = null
    try {
      const [modelStats, monthly, projectData, recentTasksData, savedBudget] = await Promise.all([
        window.api.db.metrics.getModelStats(),
        window.api.db.metrics.getMonthlyTotal(),
        window.api.db.metrics.getCostByProject(),
        window.api.db.metrics.getRecentTasks(10),
        window.api.db.settings.get(BUDGET_SETTINGS_KEYS.monthlyBudget)
      ])
      stats = modelStats
      monthlyData = monthly
      projectCosts = projectData
      recentTasks = recentTasksData
      if (savedBudget) {
        monthlyBudget = parseFloat(savedBudget)
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load model stats'
    } finally {
      isLoading = false
    }
  }

  async function handleExport() {
    isExporting = true
    try {
      const csv = await window.api.db.metrics.exportCostsCsv()
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const now = new Date()
      const dateStr = now.toISOString().slice(0, 10)
      link.download = `nerv-costs-${dateStr}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Failed to export costs:', err)
    } finally {
      isExporting = false
    }
  }

  function getProjectCostPercentage(cost: number): number {
    if (!monthlyData || monthlyData.totalCost === 0) return 0
    return (cost / monthlyData.totalCost) * 100
  }

  $effect(() => {
    if (isOpen) {
      loadStats()
    }
  })

  function getBudgetStatus(): { level: 'normal' | 'warning' | 'critical'; percentage: number } {
    if (!monthlyData) return { level: 'normal', percentage: 0 }
    const percentage = monthlyData.totalCost / monthlyBudget
    if (percentage >= MONTHLY_BUDGET_DEFAULTS.criticalThreshold) return { level: 'critical', percentage }
    if (percentage >= MONTHLY_BUDGET_DEFAULTS.warningThreshold) return { level: 'warning', percentage }
    return { level: 'normal', percentage }
  }

  function getMonthName(): string {
    if (!monthlyData) return ''
    const date = new Date(monthlyData.monthStart)
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }

  function getDaysRemaining(): number {
    const now = new Date()
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    return lastDay.getDate() - now.getDate()
  }

  function startEditBudget() {
    budgetInput = monthlyBudget.toString()
    isEditingBudget = true
  }

  async function saveBudget() {
    const newBudget = parseFloat(budgetInput)
    if (!isNaN(newBudget) && newBudget > 0) {
      monthlyBudget = newBudget
      await window.api.db.settings.set(BUDGET_SETTINGS_KEYS.monthlyBudget, newBudget.toString())
    }
    isEditingBudget = false
  }

  function cancelEditBudget() {
    isEditingBudget = false
  }

  function handleBudgetKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') saveBudget()
    if (event.key === 'Escape') cancelEditBudget()
  }

  function formatTokens(tokens: number): string {
    if (tokens >= 1_000_000) {
      return `${(tokens / 1_000_000).toFixed(1)}M`
    }
    if (tokens >= 1_000) {
      return `${(tokens / 1_000).toFixed(1)}K`
    }
    return tokens.toString()
  }

  function formatDuration(ms: number): string {
    const seconds = ms / 1000
    if (seconds >= 3600) {
      const hours = Math.floor(seconds / 3600)
      const mins = Math.floor((seconds % 3600) / 60)
      return `${hours}h ${mins}m`
    }
    if (seconds >= 60) {
      const mins = Math.floor(seconds / 60)
      const secs = Math.floor(seconds % 60)
      return `${mins}m ${secs}s`
    }
    return `${seconds.toFixed(1)}s`
  }

  function formatCost(cost: number): string {
    if (cost === 0) return '$0.00'
    if (cost < 0.01) return `$${cost.toFixed(4)}`
    return `$${cost.toFixed(2)}`
  }

  function getModelColor(model: string): string {
    if (model.includes('opus')) return '#c77dff'
    if (model.includes('sonnet')) return '#ff6b35'
    if (model.includes('haiku')) return '#6bcb77'
    return '#888'
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && isOpen) {
      onClose()
    }
  }

  function handleBackdropClick(event: MouseEvent) {
    if ((event.target as HTMLElement).classList.contains('modal-backdrop')) {
      onClose()
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <div class="modal-backdrop" onclick={handleBackdropClick} role="presentation">
    <div class="modal">
      <header class="modal-header">
        <h2>Cost & Usage</h2>
        <div class="header-actions">
          <button class="export-btn" onclick={handleExport} disabled={isExporting || isLoading}>
            {isExporting ? 'Exporting...' : 'Export'}
          </button>
          <button class="close-btn" onclick={onClose} title="Close">x</button>
        </div>
      </header>

      <div class="modal-content">
        {#if isLoading}
          <div class="loading">Loading stats...</div>
        {:else if error}
          <div class="error">{error}</div>
        {:else}
          <!-- PRD Section 14: This Session + This Month side by side -->
          <div class="session-month-row">
            <!-- This Session Panel -->
            <div class="session-panel" class:inactive={!isSessionRunning}>
              <div class="panel-title">This Session</div>
              {#if isSessionRunning && sessionMetrics}
                <div class="session-cost">{formatCost(getSessionCostEstimate())}</div>
                <div class="session-tokens-bar">
                  <div
                    class="session-tokens-fill"
                    style="width: {Math.min(getSessionContextPercent(), 100)}%"
                  ></div>
                </div>
                <div class="session-tokens-label">{formatTokens(sessionMetrics.inputTokens)} tokens</div>
                <div class="session-duration">Duration: {formatDuration(sessionDuration)}</div>
              {:else}
                <div class="session-inactive-msg">No active session</div>
              {/if}
            </div>

            <!-- This Month Panel -->
            {#if monthlyData}
              {@const budgetStatus = getBudgetStatus()}
              <div class="month-panel" class:warning={budgetStatus.level === 'warning'} class:critical={budgetStatus.level === 'critical'}>
                <div class="panel-title">This Month</div>
                <div class="month-cost">
                  {formatCost(monthlyData.totalCost)} / {formatCost(monthlyBudget)}
                </div>
                <div class="month-bar-container">
                  <div
                    class="month-bar"
                    class:warning={budgetStatus.level === 'warning'}
                    class:critical={budgetStatus.level === 'critical'}
                    style="width: {Math.min(budgetStatus.percentage * 100, 100)}%"
                  ></div>
                </div>
                <div class="month-percent">{(budgetStatus.percentage * 100).toFixed(0)}%</div>
                <div class="month-remaining">{getDaysRemaining()} days remaining</div>
              </div>
            {/if}
          </div>

          <!-- Monthly Budget Section -->
          {#if monthlyData}
            {@const budgetStatus = getBudgetStatus()}
            <div class="budget-section" class:warning={budgetStatus.level === 'warning'} class:critical={budgetStatus.level === 'critical'}>
              <div class="budget-header">
                <span class="budget-title">Monthly Budget - {getMonthName()}</span>
                {#if budgetStatus.level !== 'normal'}
                  <span class="budget-alert">
                    {budgetStatus.level === 'critical' ? 'Budget exceeded!' : 'Approaching limit'}
                  </span>
                {/if}
              </div>

              <div class="budget-bar-container">
                <div
                  class="budget-bar"
                  class:warning={budgetStatus.level === 'warning'}
                  class:critical={budgetStatus.level === 'critical'}
                  style="width: {Math.min(budgetStatus.percentage * 100, 100)}%"
                ></div>
              </div>

              <div class="budget-details">
                <div class="budget-spent">
                  <span class="budget-label">Spent</span>
                  <span class="budget-value">{formatCost(monthlyData.totalCost)}</span>
                </div>
                <div class="budget-limit">
                  <span class="budget-label">Budget</span>
                  {#if isEditingBudget}
                    <input
                      type="number"
                      class="budget-input"
                      bind:value={budgetInput}
                      onkeydown={handleBudgetKeydown}
                      min="1"
                      step="5"
                    />
                    <button class="budget-save-btn" onclick={saveBudget}>Save</button>
                  {:else}
                    <button class="budget-value-btn" onclick={startEditBudget} title="Click to edit budget">
                      {formatCost(monthlyBudget)}
                    </button>
                  {/if}
                </div>
                <div class="budget-remaining">
                  <span class="budget-label">Remaining</span>
                  <span class="budget-value" class:negative={monthlyData.totalCost > monthlyBudget}>
                    {formatCost(Math.max(0, monthlyBudget - monthlyData.totalCost))}
                  </span>
                </div>
              </div>

              <div class="budget-tasks">
                {monthlyData.taskCount} tasks this month ({(budgetStatus.percentage * 100).toFixed(1)}% of budget used)
              </div>
            </div>
          {/if}

          <!-- Cost by Project Section -->
          {#if projectCosts.length > 0}
            <div class="project-costs-section">
              <div class="section-title">Cost by Project (This Month)</div>
              <div class="project-costs-list">
                {#each projectCosts as project}
                  {@const percentage = getProjectCostPercentage(project.totalCost)}
                  <div class="project-cost-row">
                    <div class="project-info">
                      <span class="project-name">{project.projectName}</span>
                      <span class="project-tasks">{project.taskCount} tasks</span>
                    </div>
                    <div class="project-bar-container">
                      <div class="project-bar" style="width: {percentage}%"></div>
                    </div>
                    <div class="project-cost-value">
                      {formatCost(project.totalCost)} ({percentage.toFixed(0)}%)
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          <!-- PRD Section 14: Recent Tasks Table -->
          {#if recentTasks.length > 0}
            <div class="recent-tasks-section">
              <div class="section-title">Recent Tasks</div>
              <div class="recent-tasks-table">
                <div class="table-header">
                  <span class="col-task">Task</span>
                  <span class="col-duration">Duration</span>
                  <span class="col-tokens">Tokens</span>
                  <span class="col-cost">Cost</span>
                  <span class="col-status">Status</span>
                </div>
                {#each recentTasks as task}
                  <div class="table-row">
                    <span class="col-task task-title" title={task.taskTitle}>
                      {task.taskTitle}
                    </span>
                    <span class="col-duration">{formatDuration(task.durationMs)}</span>
                    <span class="col-tokens">{formatTokens(task.inputTokens + task.outputTokens)}</span>
                    <span class="col-cost">{formatCost(task.costUsd)}</span>
                    <span class="col-status status-badge" class:done={task.status === 'done'} class:review={task.status === 'review'} class:in-progress={task.status === 'in_progress'}>
                      {task.status === 'done' ? '✓ Done' : task.status === 'review' ? '◉ Review' : task.status === 'in_progress' ? '● In Progress' : task.status}
                    </span>
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          {#if stats.length === 0}
            <div class="empty">
              <p>No model usage data yet.</p>
              <p class="hint">Complete some tasks to see model comparison stats.</p>
            </div>
          {:else}
          <div class="stats-grid">
            {#each stats as stat}
              <div class="stat-card" style="--model-color: {getModelColor(stat.model)}">
                <div class="model-name">{stat.model || 'Unknown'}</div>

                <div class="stat-row">
                  <span class="stat-label">Tasks completed</span>
                  <span class="stat-value">{stat.task_count}</span>
                </div>

                <div class="stat-row">
                  <span class="stat-label">Input tokens</span>
                  <span class="stat-value">{formatTokens(stat.total_input_tokens)}</span>
                </div>

                <div class="stat-row">
                  <span class="stat-label">Output tokens</span>
                  <span class="stat-value">{formatTokens(stat.total_output_tokens)}</span>
                </div>

                <div class="stat-row">
                  <span class="stat-label">Total cost</span>
                  <span class="stat-value">{formatCost(stat.total_cost_usd)}</span>
                </div>

                <div class="stat-row">
                  <span class="stat-label">Total time</span>
                  <span class="stat-value">{formatDuration(stat.total_duration_ms)}</span>
                </div>

                <div class="stat-row">
                  <span class="stat-label">Avg turns/task</span>
                  <span class="stat-value">{stat.avg_turns?.toFixed(1) || '0'}</span>
                </div>
              </div>
            {/each}
          </div>

          <div class="summary">
            <div class="summary-item">
              <span class="summary-label">Total tasks</span>
              <span class="summary-value">{stats.reduce((sum, s) => sum + s.task_count, 0)}</span>
            </div>
            <div class="summary-item">
              <span class="summary-label">Total tokens</span>
              <span class="summary-value">
                {formatTokens(stats.reduce((sum, s) => sum + s.total_input_tokens + s.total_output_tokens, 0))}
              </span>
            </div>
            <div class="summary-item">
              <span class="summary-label">Total cost</span>
              <span class="summary-value">
                {formatCost(stats.reduce((sum, s) => sum + s.total_cost_usd, 0))}
              </span>
            </div>
          </div>
          {/if}
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal {
    background: #12121a;
    border: 1px solid #2a2a3a;
    border-radius: 12px;
    width: 90%;
    max-width: 700px;
    max-height: 80vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid #2a2a3a;
  }

  .modal-header h2 {
    font-size: 16px;
    font-weight: 600;
    color: #e0e0e0;
    margin: 0;
  }

  .close-btn {
    background: none;
    border: none;
    color: #666;
    font-size: 18px;
    cursor: pointer;
    padding: 4px 8px;
    line-height: 1;
  }

  .close-btn:hover {
    color: #e0e0e0;
  }

  .modal-content {
    padding: 20px;
    overflow-y: auto;
  }

  .loading, .error, .empty {
    text-align: center;
    padding: 40px 20px;
    color: #888;
  }

  .error {
    color: #ef4444;
  }

  .hint {
    font-size: 12px;
    margin-top: 8px;
    color: #555;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
  }

  .stat-card {
    background: #0a0a0f;
    border: 1px solid #2a2a3a;
    border-radius: 8px;
    padding: 16px;
    border-left: 3px solid var(--model-color);
  }

  .model-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--model-color);
    margin-bottom: 12px;
    text-transform: capitalize;
  }

  .stat-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 0;
    border-bottom: 1px solid #1a1a24;
  }

  .stat-row:last-child {
    border-bottom: none;
  }

  .stat-label {
    font-size: 12px;
    color: #666;
  }

  .stat-value {
    font-size: 13px;
    font-weight: 500;
    color: #e0e0e0;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  }

  .summary {
    display: flex;
    gap: 24px;
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid #2a2a3a;
    justify-content: center;
  }

  .summary-item {
    text-align: center;
  }

  .summary-label {
    display: block;
    font-size: 11px;
    color: #666;
    margin-bottom: 4px;
  }

  .summary-value {
    font-size: 16px;
    font-weight: 600;
    color: #ff6b35;
  }

  /* Budget Section Styles */
  .budget-section {
    background: #0a0a0f;
    border: 1px solid #2a2a3a;
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 20px;
  }

  .budget-section.warning {
    border-color: #fbbf24;
    background: rgba(251, 191, 36, 0.05);
  }

  .budget-section.critical {
    border-color: #ef4444;
    background: rgba(239, 68, 68, 0.05);
  }

  .budget-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .budget-title {
    font-size: 14px;
    font-weight: 600;
    color: #e0e0e0;
  }

  .budget-alert {
    font-size: 12px;
    font-weight: 500;
    padding: 2px 8px;
    border-radius: 4px;
  }

  .budget-section.warning .budget-alert {
    background: rgba(251, 191, 36, 0.2);
    color: #fbbf24;
  }

  .budget-section.critical .budget-alert {
    background: rgba(239, 68, 68, 0.2);
    color: #ef4444;
  }

  .budget-bar-container {
    height: 8px;
    background: #1a1a24;
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 12px;
  }

  .budget-bar {
    height: 100%;
    background: #4ade80;
    border-radius: 4px;
    transition: width 0.3s ease;
  }

  .budget-bar.warning {
    background: #fbbf24;
  }

  .budget-bar.critical {
    background: #ef4444;
  }

  .budget-details {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 8px;
  }

  .budget-spent,
  .budget-limit,
  .budget-remaining {
    text-align: center;
  }

  .budget-label {
    display: block;
    font-size: 11px;
    color: #666;
    margin-bottom: 2px;
  }

  .budget-value {
    font-size: 14px;
    font-weight: 600;
    color: #e0e0e0;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  }

  .budget-value-btn {
    font-size: 14px;
    font-weight: 600;
    color: #e0e0e0;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    background: none;
    border: none;
    cursor: pointer;
    text-decoration: underline;
    text-decoration-style: dotted;
    text-underline-offset: 3px;
    padding: 0;
  }

  .budget-value-btn:hover {
    color: #ff6b35;
  }

  .budget-value.negative {
    color: #ef4444;
  }

  .budget-input {
    width: 80px;
    padding: 2px 6px;
    font-size: 13px;
    background: #1a1a24;
    border: 1px solid #2a2a3a;
    border-radius: 4px;
    color: #e0e0e0;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  }

  .budget-input:focus {
    outline: none;
    border-color: #ff6b35;
  }

  .budget-save-btn {
    padding: 2px 8px;
    font-size: 11px;
    background: #ff6b35;
    border: none;
    border-radius: 4px;
    color: white;
    cursor: pointer;
    margin-left: 4px;
  }

  .budget-save-btn:hover {
    background: #ff8c5a;
  }

  .budget-tasks {
    font-size: 11px;
    color: #666;
    text-align: center;
  }

  /* Header Actions */
  .header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .export-btn {
    background: #2a2a3a;
    border: 1px solid #3a3a4a;
    color: #e0e0e0;
    padding: 4px 12px;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    transition: background 0.2s, border-color 0.2s;
  }

  .export-btn:hover:not(:disabled) {
    background: #3a3a4a;
    border-color: #4a4a5a;
  }

  .export-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Project Costs Section */
  .project-costs-section {
    background: #0a0a0f;
    border: 1px solid #2a2a3a;
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 20px;
  }

  .section-title {
    font-size: 14px;
    font-weight: 600;
    color: #e0e0e0;
    margin-bottom: 12px;
  }

  .project-costs-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .project-cost-row {
    display: grid;
    grid-template-columns: 140px 1fr 100px;
    align-items: center;
    gap: 12px;
  }

  .project-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .project-name {
    font-size: 13px;
    color: #e0e0e0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .project-tasks {
    font-size: 10px;
    color: #666;
  }

  .project-bar-container {
    height: 16px;
    background: #1a1a24;
    border-radius: 4px;
    overflow: hidden;
  }

  .project-bar {
    height: 100%;
    background: linear-gradient(90deg, #ff6b35, #ff8c5a);
    border-radius: 4px;
    transition: width 0.3s ease;
    min-width: 2px;
  }

  .project-cost-value {
    font-size: 12px;
    font-weight: 500;
    color: #e0e0e0;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    text-align: right;
  }

  /* PRD Section 14: Recent Tasks Table Styles */
  .recent-tasks-section {
    background: #0a0a0f;
    border: 1px solid #2a2a3a;
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 20px;
  }

  .recent-tasks-table {
    font-size: 12px;
  }

  .table-header {
    display: grid;
    grid-template-columns: 1fr 80px 80px 70px 90px;
    gap: 8px;
    padding: 8px 0;
    border-bottom: 1px solid #2a2a3a;
    color: #666;
    font-weight: 500;
    text-transform: uppercase;
    font-size: 10px;
    letter-spacing: 0.5px;
  }

  .table-row {
    display: grid;
    grid-template-columns: 1fr 80px 80px 70px 90px;
    gap: 8px;
    padding: 10px 0;
    border-bottom: 1px solid #1a1a24;
    align-items: center;
  }

  .table-row:last-child {
    border-bottom: none;
  }

  .col-task {
    color: #e0e0e0;
  }

  .task-title {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .col-duration,
  .col-tokens,
  .col-cost {
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    color: #aaa;
    text-align: right;
  }

  .col-status {
    text-align: center;
  }

  .status-badge {
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 500;
  }

  .status-badge.done {
    background: rgba(107, 203, 119, 0.15);
    color: #6bcb77;
  }

  .status-badge.review {
    background: rgba(255, 217, 61, 0.15);
    color: #ffd93d;
  }

  .status-badge.in-progress {
    background: rgba(255, 107, 53, 0.15);
    color: #ff6b35;
  }

  /* PRD Section 14: This Session + This Month side-by-side layout */
  .session-month-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-bottom: 20px;
  }

  .session-panel,
  .month-panel {
    background: #0a0a0f;
    border: 1px solid #2a2a3a;
    border-radius: 8px;
    padding: 16px;
    text-align: center;
  }

  .session-panel.inactive {
    opacity: 0.6;
  }

  .month-panel.warning {
    border-color: #fbbf24;
    background: rgba(251, 191, 36, 0.05);
  }

  .month-panel.critical {
    border-color: #ef4444;
    background: rgba(239, 68, 68, 0.05);
  }

  .panel-title {
    font-size: 12px;
    font-weight: 500;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 12px;
  }

  .session-cost,
  .month-cost {
    font-size: 24px;
    font-weight: 700;
    color: #e0e0e0;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    margin-bottom: 12px;
  }

  .session-tokens-bar,
  .month-bar-container {
    height: 8px;
    background: #1a1a24;
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 8px;
  }

  .session-tokens-fill {
    height: 100%;
    background: #4ade80;
    border-radius: 4px;
    transition: width 0.3s ease;
  }

  .month-bar {
    height: 100%;
    background: #4ade80;
    border-radius: 4px;
    transition: width 0.3s ease;
  }

  .month-bar.warning {
    background: #fbbf24;
  }

  .month-bar.critical {
    background: #ef4444;
  }

  .session-tokens-label,
  .month-percent {
    font-size: 12px;
    color: #aaa;
    margin-bottom: 4px;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  }

  .session-duration,
  .month-remaining {
    font-size: 11px;
    color: #666;
  }

  .session-inactive-msg {
    font-size: 13px;
    color: #555;
    padding: 24px 0;
  }

  @media (max-width: 500px) {
    .session-month-row {
      grid-template-columns: 1fr;
    }
  }
</style>
