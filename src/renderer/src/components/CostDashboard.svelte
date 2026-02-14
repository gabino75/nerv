<script lang="ts">
  import type { CostSummary } from '../../../shared/types'
  import { appStore } from '../stores/appState'
  import type { SessionMetrics } from '../stores/appState'
  import { MONTHLY_BUDGET_DEFAULTS } from '../../../shared/constants'

  interface Props {
    isOpen: boolean
    onClose: () => void
    projectId?: string | null
  }

  let { isOpen, onClose, projectId = null }: Props = $props()

  let isLoading = $state(true)
  let error = $state<string | null>(null)
  let activeTab = $state<'overview' | 'projects' | 'tasks'>('overview')

  // Session metrics from store
  let sessionMetrics = $state<SessionMetrics | null>(null)
  $effect(() => {
    const unsub = appStore.subscribe(state => {
      sessionMetrics = state.sessionMetrics
    })
    return () => unsub()
  })

  // Budget
  let monthlyBudget = $state(MONTHLY_BUDGET_DEFAULTS.budgetUsd)

  // Data
  let monthlyTotal = $state<{ totalCost: number; taskCount: number; monthStart: string } | null>(null)
  let dailyBreakdown = $state<Array<{ date: string; cost: number; taskCount: number }>>([])
  let costByProject = $state<Array<{
    projectId: string
    projectName: string
    totalCost: number
    taskCount: number
    inputTokens: number
    outputTokens: number
  }>>([])
  let recentTasks = $state<Array<{
    taskId: string
    taskTitle: string
    status: string
    durationMs: number
    inputTokens: number
    outputTokens: number
    costUsd: number
    completedAt: string | null
    updatedAt: string
  }>>([])
  let modelStats = $state<Array<{
    model: string
    task_count: number
    total_input_tokens: number
    total_output_tokens: number
    total_cost_usd: number
    total_duration_ms: number
    avg_turns: number
  }>>([])

  async function loadData() {
    isLoading = true
    error = null
    try {
      const [monthly, daily, byProject, recent, models, settings] = await Promise.all([
        window.api.db.metrics.getMonthlyTotal(),
        window.api.db.metrics.getDailyBreakdown(),
        window.api.db.metrics.getCostByProject(),
        window.api.db.metrics.getRecentTasks(20),
        window.api.db.metrics.getModelStats(),
        window.api.settingsHierarchy.getAll()
      ])
      monthlyTotal = monthly
      dailyBreakdown = daily
      costByProject = byProject
      recentTasks = recent
      modelStats = models
      monthlyBudget = settings.monthly_budget_usd
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load cost data'
    } finally {
      isLoading = false
    }
  }

  function formatCost(usd: number): string {
    return `$${usd.toFixed(4)}`
  }

  function formatCostShort(usd: number): string {
    if (usd >= 1) return `$${usd.toFixed(2)}`
    return `$${usd.toFixed(4)}`
  }

  function formatTokens(count: number): string {
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`
    if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`
    return String(count)
  }

  function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`
    const seconds = Math.floor(ms / 1000)
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    const remainSec = seconds % 60
    return `${minutes}m ${remainSec}s`
  }

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return '--'
    const d = new Date(dateStr)
    return d.toLocaleDateString()
  }

  function totalTokens(): { input: number; output: number } {
    let input = 0
    let output = 0
    for (const stat of modelStats) {
      input += stat.total_input_tokens
      output += stat.total_output_tokens
    }
    return { input, output }
  }

  // PRD: Budget progress percentage
  let budgetPercent = $derived(
    monthlyBudget > 0 ? Math.min(((monthlyTotal?.totalCost ?? 0) / monthlyBudget) * 100, 100) : 0
  )

  function getBudgetColor(percent: number): string {
    if (percent < 50) return 'var(--color-nerv-success)'
    if (percent < 80) return 'var(--color-nerv-warning)'
    return 'var(--color-nerv-error)'
  }

  // Compute max cost for horizontal bar charts
  let maxProjectCost = $derived(
    costByProject.length > 0 ? Math.max(...costByProject.map(p => p.totalCost), 0.001) : 1
  )

  let maxModelCost = $derived(
    modelStats.length > 0 ? Math.max(...modelStats.map(m => m.total_cost_usd), 0.001) : 1
  )

  let isExporting = $state(false)

  async function handleExport() {
    isExporting = true
    try {
      const csv = await window.api.db.metrics.exportCostsCsv()
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const dateStr = new Date().toISOString().slice(0, 10)
      link.download = `nerv-costs-${dateStr}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to export CSV'
    } finally {
      isExporting = false
    }
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

  $effect(() => {
    if (isOpen) {
      loadData()
    }
  })
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <div class="modal-backdrop" onclick={handleBackdropClick} role="presentation">
    <div class="modal">
      <header class="modal-header">
        <h2>Cost &amp; Usage</h2>
        <div class="header-actions">
          <button
            class="export-btn"
            onclick={handleExport}
            disabled={isExporting || isLoading}
            title="Export costs to CSV"
            data-testid="cost-export-btn"
          >
            {isExporting ? 'Exporting...' : 'Export'}
          </button>
          <button class="close-btn" onclick={onClose} title="Close">x</button>
        </div>
      </header>

      {#if isLoading}
        <div class="loading">Loading cost data...</div>
      {:else if error}
        <div class="error-msg">{error}</div>
      {:else}
        <!-- Summary Cards -->
        <div class="summary-cards" data-testid="cost-summary">
          <div class="card">
            <div class="card-label">This Session</div>
            <div class="card-value">
              {sessionMetrics ? formatTokens(sessionMetrics.inputTokens + sessionMetrics.outputTokens) : '--'}
            </div>
            <div class="card-sub">{sessionMetrics ? `${formatTokens(sessionMetrics.inputTokens)} in / ${formatTokens(sessionMetrics.outputTokens)} out` : 'No active session'}</div>
          </div>
          <div class="card">
            <div class="card-label">This Month</div>
            <div class="card-value">{formatCostShort(monthlyTotal?.totalCost ?? 0)}</div>
            <div class="card-sub">{monthlyTotal?.taskCount ?? 0} tasks</div>
            <!-- PRD: Budget progress bar -->
            {#if monthlyBudget > 0}
              <div class="budget-progress" data-testid="budget-progress">
                <div class="budget-bar">
                  <div
                    class="budget-fill"
                    style="width: {budgetPercent}%; background: {getBudgetColor(budgetPercent)}"
                  ></div>
                </div>
                <div class="budget-text">
                  {formatCostShort(monthlyTotal?.totalCost ?? 0)} / {formatCostShort(monthlyBudget)} ({budgetPercent.toFixed(0)}%)
                </div>
              </div>
            {/if}
          </div>
          <div class="card">
            <div class="card-label">Total Tokens</div>
            <div class="card-value">{formatTokens(totalTokens().input + totalTokens().output)}</div>
            <div class="card-sub">{formatTokens(totalTokens().input)} in / {formatTokens(totalTokens().output)} out</div>
          </div>
          <div class="card">
            <div class="card-label">Models Used</div>
            <div class="card-value">{modelStats.length}</div>
          </div>
        </div>

        <!-- Tabs -->
        <div class="tabs">
          <button class="tab" class:active={activeTab === 'overview'} onclick={() => activeTab = 'overview'}>
            Overview
          </button>
          <button class="tab" class:active={activeTab === 'projects'} onclick={() => activeTab = 'projects'}>
            By Project
          </button>
          <button class="tab" class:active={activeTab === 'tasks'} onclick={() => activeTab = 'tasks'}>
            Recent Tasks
          </button>
        </div>

        <div class="tab-content">
          {#if activeTab === 'overview'}
            <!-- PRD: Cost by Model (bar chart) -->
            <section class="section">
              <h3 class="section-title">Cost by Model</h3>
              {#if modelStats.length === 0}
                <div class="empty">No usage data yet</div>
              {:else}
                <div class="bar-chart-list" data-testid="cost-by-model">
                  {#each modelStats as stat}
                    <div class="bar-chart-row">
                      <div class="bar-chart-label">
                        <span class="bar-chart-name">{stat.model}</span>
                        <span class="bar-chart-meta">{stat.task_count} tasks</span>
                      </div>
                      <div class="bar-chart-bar-container">
                        <div
                          class="bar-chart-bar"
                          style="width: {Math.max((stat.total_cost_usd / maxModelCost) * 100, 2)}%"
                        ></div>
                      </div>
                      <span class="bar-chart-value">{formatCost(stat.total_cost_usd)}</span>
                    </div>
                  {/each}
                </div>
              {/if}
            </section>

            <!-- Daily Breakdown -->
            <section class="section">
              <h3 class="section-title">Daily Breakdown</h3>
              {#if dailyBreakdown.length === 0}
                <div class="empty">No daily data</div>
              {:else}
                <div class="daily-bars">
                  {#each dailyBreakdown.slice(-14) as day}
                    {@const maxCost = Math.max(...dailyBreakdown.map(d => d.cost), 0.01)}
                    <div class="day-bar">
                      <div class="bar-fill" style="height: {Math.max((day.cost / maxCost) * 100, 2)}%"></div>
                      <div class="bar-label">{day.date.slice(-5)}</div>
                      <div class="bar-value">{formatCost(day.cost)}</div>
                    </div>
                  {/each}
                </div>
              {/if}
            </section>

          {:else if activeTab === 'projects'}
            <!-- PRD: Cost by Project (bar chart) -->
            <section class="section">
              <h3 class="section-title">Cost by Project</h3>
              {#if costByProject.length === 0}
                <div class="empty">No project cost data</div>
              {:else}
                <div class="bar-chart-list" data-testid="cost-by-project">
                  {#each costByProject as proj}
                    <div class="bar-chart-row">
                      <div class="bar-chart-label">
                        <span class="bar-chart-name">{proj.projectName}</span>
                        <span class="bar-chart-meta">{proj.taskCount} tasks | {formatTokens(proj.inputTokens + proj.outputTokens)} tokens</span>
                      </div>
                      <div class="bar-chart-bar-container">
                        <div
                          class="bar-chart-bar project-bar"
                          style="width: {Math.max((proj.totalCost / maxProjectCost) * 100, 2)}%"
                        ></div>
                      </div>
                      <span class="bar-chart-value">{formatCost(proj.totalCost)}</span>
                    </div>
                  {/each}
                </div>
              {/if}
            </section>

          {:else if activeTab === 'tasks'}
            <section class="section">
              <h3 class="section-title">Recent Tasks</h3>
              {#if recentTasks.length === 0}
                <div class="empty">No recent tasks</div>
              {:else}
                <div class="table-container">
                  <table class="data-table">
                    <thead>
                      <tr>
                        <th>Task</th>
                        <th>Status</th>
                        <th>Duration</th>
                        <th>Tokens</th>
                        <th>Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each recentTasks as task}
                        <tr>
                          <td class="task-title" title={task.taskTitle}>{task.taskTitle}</td>
                          <td>
                            <span class="status-badge" class:done={task.status === 'done'} class:in_progress={task.status === 'in_progress'} class:review={task.status === 'review'}>
                              {task.status}
                            </span>
                          </td>
                          <td>{formatDuration(task.durationMs)}</td>
                          <td>{formatTokens(task.inputTokens + task.outputTokens)}</td>
                          <td class="cost">{formatCost(task.costUsd)}</td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              {/if}
            </section>
          {/if}
        </div>
      {/if}
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
    z-index: var(--z-nerv-modal-overlay);
  }

  .modal {
    background: var(--color-nerv-panel);
    border: 1px solid var(--color-nerv-border);
    border-radius: var(--radius-nerv-xl);
    width: 90%;
    max-width: 800px;
    max-height: 85vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--color-nerv-border);
  }

  .modal-header h2 {
    font-size: 16px;
    font-weight: 600;
    color: var(--color-nerv-text);
    margin: 0;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .export-btn {
    background: var(--color-nerv-bg);
    border: 1px solid var(--color-nerv-border);
    color: var(--color-nerv-text-muted);
    font-size: 12px;
    padding: 4px 12px;
    border-radius: var(--radius-nerv-md);
    cursor: pointer;
    transition: all var(--transition-nerv-fast);
  }

  .export-btn:hover:not(:disabled) {
    color: var(--color-nerv-text);
    border-color: var(--color-nerv-primary);
  }

  .export-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--color-nerv-text-dim);
    font-size: 18px;
    cursor: pointer;
    padding: 4px 8px;
    line-height: 1;
  }

  .close-btn:hover {
    color: var(--color-nerv-text);
  }

  .loading, .error-msg {
    text-align: center;
    padding: 40px 20px;
    color: var(--color-nerv-text-muted);
  }

  .error-msg {
    color: var(--color-nerv-error);
  }

  .empty {
    color: var(--color-nerv-text-dim);
    text-align: center;
    padding: 20px;
    font-size: 13px;
    font-style: italic;
  }

  /* Summary Cards */
  .summary-cards {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    padding: 16px 20px;
    border-bottom: 1px solid var(--color-nerv-border);
  }

  .card {
    background: var(--color-nerv-bg);
    border: 1px solid var(--color-nerv-border);
    border-radius: var(--radius-nerv-md);
    padding: 12px;
    text-align: center;
  }

  .card-label {
    font-size: 10px;
    color: var(--color-nerv-text-dim);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
  }

  .card-value {
    font-size: 20px;
    font-weight: 600;
    color: var(--color-nerv-text);
  }

  .card-sub {
    font-size: 11px;
    color: var(--color-nerv-text-muted);
    margin-top: 2px;
  }

  /* Tabs */
  .tabs {
    display: flex;
    gap: 0;
    padding: 0 20px;
    border-bottom: 1px solid var(--color-nerv-border);
  }

  .tab {
    background: none;
    border: none;
    color: var(--color-nerv-text-muted);
    padding: 12px 16px;
    font-size: 13px;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: all var(--transition-nerv-fast);
  }

  .tab:hover {
    color: var(--color-nerv-text);
  }

  .tab.active {
    color: var(--color-nerv-primary);
    border-bottom-color: var(--color-nerv-primary);
  }

  .tab-content {
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
  }

  .section {
    margin-bottom: 20px;
  }

  .section-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--color-nerv-primary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0 0 12px;
  }

  /* Tables */
  .table-container {
    overflow-x: auto;
  }

  .data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  .data-table th {
    text-align: left;
    padding: 8px 12px;
    color: var(--color-nerv-text-dim);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 1px solid var(--color-nerv-border);
    font-weight: 500;
  }

  .data-table td {
    padding: 8px 12px;
    color: var(--color-nerv-text);
    border-bottom: 1px solid var(--color-nerv-bg);
  }

  .data-table tbody tr:hover {
    background: var(--color-nerv-bg);
  }

  .task-title {
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cost {
    font-family: 'SF Mono', Monaco, 'Courier New', monospace;
    color: var(--color-nerv-warning);
  }

  .status-badge {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 9999px;
    background: var(--color-nerv-border);
    color: var(--color-nerv-text-muted);
  }

  .status-badge.done {
    background: var(--color-nerv-success-bg);
    color: var(--color-nerv-success);
  }

  .status-badge.in_progress {
    background: var(--color-nerv-info-bg);
    color: var(--color-nerv-info);
  }

  .status-badge.review {
    background: var(--color-nerv-warning-bg);
    color: var(--color-nerv-warning);
  }

  /* Daily Bar Chart */
  .daily-bars {
    display: flex;
    gap: 4px;
    align-items: flex-end;
    height: 120px;
    padding: 0 4px;
  }

  .day-bar {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    height: 100%;
    position: relative;
  }

  .bar-fill {
    width: 100%;
    max-width: 30px;
    background: var(--color-nerv-primary);
    border-radius: 2px 2px 0 0;
    margin-top: auto;
    min-height: 2px;
    opacity: 0.8;
  }

  .bar-label {
    font-size: 9px;
    color: var(--color-nerv-text-dim);
    margin-top: 4px;
    white-space: nowrap;
  }

  .bar-value {
    font-size: 9px;
    color: var(--color-nerv-text-muted);
    position: absolute;
    top: -2px;
    white-space: nowrap;
    display: none;
  }

  .day-bar:hover .bar-value {
    display: block;
  }

  .day-bar:hover .bar-fill {
    opacity: 1;
  }

  /* PRD: Budget progress bar */
  .budget-progress {
    margin-top: 8px;
  }

  .budget-bar {
    width: 100%;
    height: 4px;
    background: var(--color-nerv-bg);
    border-radius: 2px;
    overflow: hidden;
  }

  .budget-fill {
    height: 100%;
    border-radius: 2px;
    transition: width 0.3s ease;
  }

  .budget-text {
    font-size: 9px;
    color: var(--color-nerv-text-dim);
    margin-top: 3px;
    font-family: 'SF Mono', Monaco, 'Courier New', monospace;
  }

  /* PRD: Horizontal bar chart for Cost by Model / Cost by Project */
  .bar-chart-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .bar-chart-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .bar-chart-label {
    min-width: 120px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .bar-chart-name {
    font-size: 13px;
    font-weight: 500;
    color: var(--color-nerv-text);
  }

  .bar-chart-meta {
    font-size: 10px;
    color: var(--color-nerv-text-dim);
  }

  .bar-chart-bar-container {
    flex: 1;
    height: 20px;
    background: var(--color-nerv-bg);
    border-radius: var(--radius-nerv-sm);
    overflow: hidden;
  }

  .bar-chart-bar {
    height: 100%;
    background: var(--color-nerv-primary);
    border-radius: var(--radius-nerv-sm);
    min-width: 2px;
    transition: width 0.3s ease;
    opacity: 0.8;
  }

  .bar-chart-bar.project-bar {
    background: var(--color-nerv-info);
  }

  .bar-chart-row:hover .bar-chart-bar {
    opacity: 1;
  }

  .bar-chart-value {
    min-width: 70px;
    text-align: right;
    font-family: 'SF Mono', Monaco, 'Courier New', monospace;
    font-size: 12px;
    color: var(--color-nerv-warning);
    flex-shrink: 0;
  }

  /* Responsive: stack summary cards on narrow screens */
  @media (max-width: 600px) {
    .summary-cards {
      grid-template-columns: repeat(2, 1fr);
      padding: 12px;
      gap: 8px;
    }

    .modal {
      width: 95%;
      max-height: 90vh;
    }

    .bar-chart-label {
      min-width: 80px;
    }

    .bar-chart-value {
      min-width: 50px;
      font-size: 11px;
    }
  }
</style>
