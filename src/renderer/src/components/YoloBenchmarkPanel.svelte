<script lang="ts">
  /**
   * YoloBenchmarkPanel - YOLO Mode autonomous benchmark execution UI
   *
   * Features:
   * - Configure and start YOLO benchmark runs
   * - View real-time progress during execution
   * - Compare benchmark results across models
   * - View grades and scores
   */

  import type {
    YoloBenchmarkConfig,
    YoloBenchmarkResult,
    YoloBenchmarkGrade,
    YoloBenchmarkStatus
  } from '../../../shared/types'
  import { YOLO_BENCHMARK_DEFAULTS } from '../../../shared/constants'
  import { Button, FormGroup } from './shared'
  import { selectedProject } from '../stores/appState'
  import { onMount, onDestroy } from 'svelte'

  // Props
  interface Props {
    projectId: string | null
    isOpen: boolean
    onClose: () => void
  }

  let { projectId, isOpen, onClose }: Props = $props()

  // State
  let configs = $state<Array<YoloBenchmarkConfig & { id: string }>>([])
  let results = $state<YoloBenchmarkResult[]>([])
  let runningResults = $state<YoloBenchmarkResult[]>([])
  let isLoadingConfigs = $state(false)
  let isSaving = $state(false)
  let activeTab = $state<'configure' | 'running' | 'results' | 'compare'>('configure')

  // Config form state
  let configForm = $state({
    model: 'sonnet',
    maxCycles: YOLO_BENCHMARK_DEFAULTS.maxCycles,
    maxCostUsd: YOLO_BENCHMARK_DEFAULTS.maxCostUsd,
    maxDurationMs: YOLO_BENCHMARK_DEFAULTS.maxDurationMs / 60000, // Store as minutes for UI
    autoApproveReview: YOLO_BENCHMARK_DEFAULTS.autoApproveReview,
    autoApproveDangerousTools: YOLO_BENCHMARK_DEFAULTS.autoApproveDangerousTools,
    testCommand: '',
    specFile: ''
  })

  // Selected config for running/editing
  let selectedConfigId = $state<string | null>(null)

  // Comparison state
  let selectedForComparison = $state<string[]>([])
  let comparisonResult = $state<{
    results: YoloBenchmarkResult[]
    grades: Record<string, YoloBenchmarkGrade>
    winner: string | null
  } | null>(null)

  // Real-time status for running benchmarks
  let runningStatus = $state<Map<string, {
    isActive: boolean
    isPaused: boolean
    elapsedMs: number
    currentCycleId: string | null
    currentTaskId: string | null
  }>>(new Map())

  // Load data when panel opens
  $effect(() => {
    if (projectId && isOpen) {
      loadConfigs()
      loadResults()
      loadRunningBenchmarks()
    }
  })

  // Set up event listeners on mount
  onMount(() => {
    window.api.yolo.onStarted(handleBenchmarkStarted)
    window.api.yolo.onPaused(handleBenchmarkPaused)
    window.api.yolo.onResumed(handleBenchmarkResumed)
    window.api.yolo.onCycleStarted(handleCycleStarted)
    window.api.yolo.onCycleCompleted(handleCycleCompleted)
    window.api.yolo.onCompleted(handleBenchmarkCompleted)
  })

  onDestroy(() => {
    window.api.yolo.removeAllListeners()
  })

  // Event handlers
  function handleBenchmarkStarted(resultId: string, _configId: string) {
    loadRunningBenchmarks()
    activeTab = 'running'
  }

  function handleBenchmarkPaused(resultId: string) {
    loadRunningBenchmarks()
  }

  function handleBenchmarkResumed(resultId: string) {
    loadRunningBenchmarks()
  }

  function handleCycleStarted(resultId: string, cycleId: string, cycleNumber: number) {
    updateRunningStatus(resultId)
  }

  function handleCycleCompleted(resultId: string, _cycleId: string) {
    updateRunningStatus(resultId)
    loadResults()
  }

  function handleBenchmarkCompleted(resultId: string, _status: YoloBenchmarkStatus, _stopReason: string | null) {
    loadRunningBenchmarks()
    loadResults()
  }

  async function updateRunningStatus(resultId: string) {
    try {
      const status = await window.api.yolo.getStatus(resultId)
      if (status) {
        runningStatus.set(resultId, status)
        runningStatus = new Map(runningStatus) // Trigger reactivity
      }
    } catch (error) {
      console.error('Failed to get running status:', error)
    }
  }

  async function loadConfigs() {
    if (!projectId) return
    isLoadingConfigs = true
    try {
      configs = await window.api.yolo.getConfigsForProject(projectId)
    } catch (error) {
      console.error('Failed to load YOLO configs:', error)
    } finally {
      isLoadingConfigs = false
    }
  }

  async function loadResults() {
    if (!projectId) return
    try {
      // Get results for all configs in this project
      const allResults: YoloBenchmarkResult[] = []
      for (const config of configs) {
        const configResults = await window.api.yolo.getResultsForConfig(config.id)
        allResults.push(...configResults)
      }
      results = allResults.sort((a, b) =>
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
      )
    } catch (error) {
      console.error('Failed to load YOLO results:', error)
    }
  }

  async function loadRunningBenchmarks() {
    try {
      runningResults = await window.api.yolo.getRunning()
      // Update status for each running benchmark
      for (const result of runningResults) {
        await updateRunningStatus(result.id)
      }
    } catch (error) {
      console.error('Failed to load running benchmarks:', error)
    }
  }

  async function saveConfig() {
    if (!projectId) return
    isSaving = true
    try {
      const config: YoloBenchmarkConfig = {
        projectId,
        model: configForm.model,
        maxCycles: configForm.maxCycles,
        maxCostUsd: configForm.maxCostUsd,
        maxDurationMs: configForm.maxDurationMs * 60000, // Convert minutes to ms
        autoApproveReview: configForm.autoApproveReview,
        autoApproveDangerousTools: configForm.autoApproveDangerousTools,
        testCommand: configForm.testCommand || null,
        specFile: configForm.specFile || null
      }

      if (selectedConfigId) {
        await window.api.yolo.updateConfig(selectedConfigId, config)
      } else {
        await window.api.yolo.createConfig(config)
      }

      await loadConfigs()
      resetForm()
    } catch (error) {
      console.error('Failed to save config:', error)
    } finally {
      isSaving = false
    }
  }

  async function deleteConfig(configId: string) {
    if (!confirm('Delete this benchmark configuration?')) return
    try {
      await window.api.yolo.deleteConfig(configId)
      await loadConfigs()
    } catch (error) {
      console.error('Failed to delete config:', error)
    }
  }

  function editConfig(config: YoloBenchmarkConfig & { id: string }) {
    selectedConfigId = config.id
    configForm = {
      model: config.model,
      maxCycles: config.maxCycles,
      maxCostUsd: config.maxCostUsd,
      maxDurationMs: config.maxDurationMs / 60000,
      autoApproveReview: config.autoApproveReview,
      autoApproveDangerousTools: config.autoApproveDangerousTools,
      testCommand: config.testCommand || '',
      specFile: config.specFile || ''
    }
  }

  function resetForm() {
    selectedConfigId = null
    configForm = {
      model: 'sonnet',
      maxCycles: YOLO_BENCHMARK_DEFAULTS.maxCycles,
      maxCostUsd: YOLO_BENCHMARK_DEFAULTS.maxCostUsd,
      maxDurationMs: YOLO_BENCHMARK_DEFAULTS.maxDurationMs / 60000,
      autoApproveReview: YOLO_BENCHMARK_DEFAULTS.autoApproveReview,
      autoApproveDangerousTools: YOLO_BENCHMARK_DEFAULTS.autoApproveDangerousTools,
      testCommand: '',
      specFile: ''
    }
  }

  async function startBenchmark(configId: string) {
    try {
      await window.api.yolo.start(configId)
      // Event handler will switch to running tab
    } catch (error) {
      console.error('Failed to start benchmark:', error)
    }
  }

  async function stopBenchmark(resultId: string) {
    try {
      await window.api.yolo.stop(resultId, 'User stopped')
    } catch (error) {
      console.error('Failed to stop benchmark:', error)
    }
  }

  async function pauseBenchmark(resultId: string) {
    try {
      await window.api.yolo.pause(resultId)
    } catch (error) {
      console.error('Failed to pause benchmark:', error)
    }
  }

  async function resumeBenchmark(resultId: string) {
    try {
      await window.api.yolo.resume(resultId)
    } catch (error) {
      console.error('Failed to resume benchmark:', error)
    }
  }

  function toggleComparison(resultId: string) {
    if (selectedForComparison.includes(resultId)) {
      selectedForComparison = selectedForComparison.filter(id => id !== resultId)
    } else {
      selectedForComparison = [...selectedForComparison, resultId]
    }
  }

  async function runComparison() {
    if (selectedForComparison.length < 2) {
      alert('Select at least 2 benchmark results to compare')
      return
    }
    try {
      comparisonResult = await window.api.yolo.compare(selectedForComparison)
    } catch (error) {
      console.error('Failed to compare benchmarks:', error)
    }
  }

  // Format helpers
  function formatStatus(status: YoloBenchmarkStatus): string {
    const labels: Record<YoloBenchmarkStatus, string> = {
      idle: 'Idle',
      running: 'Running',
      success: 'Success',
      failed: 'Failed',
      limit_reached: 'Limit Reached',
      blocked: 'Blocked'
    }
    return labels[status]
  }

  function getStatusColor(status: YoloBenchmarkStatus): string {
    const colors: Record<YoloBenchmarkStatus, string> = {
      idle: '#888',
      running: '#00ff9f',
      success: '#4ade80',
      failed: '#ef4444',
      limit_reached: '#f59e0b',
      blocked: '#ef4444'
    }
    return colors[status]
  }

  function formatDuration(ms: number): string {
    const minutes = Math.floor(ms / 60000)
    const seconds = Math.floor((ms % 60000) / 1000)
    return `${minutes}m ${seconds}s`
  }

  function formatCost(usd: number): string {
    return `$${usd.toFixed(4)}`
  }

  function formatPercent(value: number): string {
    return `${(value * 100).toFixed(1)}%`
  }

  function formatTime(timestamp: string): string {
    const date = new Date(timestamp)
    return date.toLocaleString()
  }

  // Handle close with escape key
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && isOpen) {
      onClose()
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="panel-overlay" onclick={onClose} data-testid="yolo-panel-overlay" role="dialog" aria-modal="true" tabindex="-1">
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="panel" onclick={(e) => e.stopPropagation()} data-testid="yolo-panel" role="presentation">
      <div class="panel-header">
        <h2>YOLO Benchmark</h2>
        <div class="tab-buttons">
          <button
            class="tab-btn"
            class:active={activeTab === 'configure'}
            onclick={() => activeTab = 'configure'}
            data-testid="yolo-tab-configure"
          >
            Configure
          </button>
          <button
            class="tab-btn"
            class:active={activeTab === 'running'}
            onclick={() => activeTab = 'running'}
            data-testid="yolo-tab-running"
          >
            Running {#if runningResults.length > 0}({runningResults.length}){/if}
          </button>
          <button
            class="tab-btn"
            class:active={activeTab === 'results'}
            onclick={() => activeTab = 'results'}
            data-testid="yolo-tab-results"
          >
            Results
          </button>
          <button
            class="tab-btn"
            class:active={activeTab === 'compare'}
            onclick={() => activeTab = 'compare'}
            data-testid="yolo-tab-compare"
          >
            Compare
          </button>
        </div>
        <button class="close-btn" onclick={onClose}>&times;</button>
      </div>

      <!-- Configure Tab -->
      {#if activeTab === 'configure'}
        <div class="panel-content" data-testid="yolo-configure-content">
          <div class="config-section">
            <h3>{selectedConfigId ? 'Edit Configuration' : 'New Configuration'}</h3>

            <div class="config-form">
              <FormGroup label="Model" id="yolo-model">
                <select
                  id="yolo-model"
                  bind:value={configForm.model}
                  data-testid="yolo-model-select"
                >
                  <option value="sonnet">Claude Sonnet</option>
                  <option value="opus">Claude Opus</option>
                  <option value="haiku">Claude Haiku</option>
                </select>
              </FormGroup>

              <div class="form-row">
                <FormGroup label="Max Cycles" id="yolo-max-cycles">
                  <input
                    type="number"
                    id="yolo-max-cycles"
                    bind:value={configForm.maxCycles}
                    min="1"
                    max="100"
                    data-testid="yolo-max-cycles"
                  />
                </FormGroup>

                <FormGroup label="Max Cost (USD)" id="yolo-max-cost">
                  <input
                    type="number"
                    id="yolo-max-cost"
                    bind:value={configForm.maxCostUsd}
                    min="0.01"
                    step="0.01"
                    data-testid="yolo-max-cost"
                  />
                </FormGroup>

                <FormGroup label="Max Duration (min)" id="yolo-max-duration">
                  <input
                    type="number"
                    id="yolo-max-duration"
                    bind:value={configForm.maxDurationMs}
                    min="1"
                    max="180"
                    data-testid="yolo-max-duration"
                  />
                </FormGroup>
              </div>

              <FormGroup label="Test Command (optional)" id="yolo-test-command">
                <input
                  type="text"
                  id="yolo-test-command"
                  bind:value={configForm.testCommand}
                  placeholder="e.g., npm test"
                  data-testid="yolo-test-command"
                />
              </FormGroup>

              <FormGroup label="Spec File (optional)" id="yolo-spec-file">
                <input
                  type="text"
                  id="yolo-spec-file"
                  bind:value={configForm.specFile}
                  placeholder="e.g., SPEC.md"
                  data-testid="yolo-spec-file"
                />
              </FormGroup>

              <div class="form-row checkboxes">
                <label class="checkbox-label">
                  <input
                    type="checkbox"
                    bind:checked={configForm.autoApproveReview}
                    data-testid="yolo-auto-approve-review"
                  />
                  Auto-approve reviews
                </label>

                <label class="checkbox-label">
                  <input
                    type="checkbox"
                    bind:checked={configForm.autoApproveDangerousTools}
                    data-testid="yolo-auto-approve-dangerous"
                  />
                  Auto-approve dangerous tools
                </label>
              </div>

              <div class="form-actions">
                <Button
                  variant="primary"
                  onclick={saveConfig}
                  disabled={isSaving}
                  testId="yolo-save-config-btn"
                >
                  {selectedConfigId ? 'Update' : 'Save'} Configuration
                </Button>
                {#if selectedConfigId}
                  <Button
                    variant="secondary"
                    onclick={resetForm}
                    testId="yolo-cancel-edit-btn"
                  >
                    Cancel
                  </Button>
                {/if}
              </div>
            </div>
          </div>

          <!-- Saved Configurations -->
          {#if configs.length > 0}
            <div class="config-section">
              <h3>Saved Configurations</h3>
              <div class="config-list" data-testid="yolo-config-list">
                {#each configs as config}
                  <div class="config-item" data-testid="yolo-config-item" data-config-id={config.id}>
                    <div class="config-info">
                      <span class="config-model">{config.model}</span>
                      <span class="config-limits">
                        {config.maxCycles} cycles | {formatCost(config.maxCostUsd)} | {config.maxDurationMs / 60000}min
                      </span>
                    </div>
                    <div class="config-actions">
                      <Button
                        variant="primary"
                        size="small"
                        onclick={() => startBenchmark(config.id)}
                        testId="yolo-start-btn"
                      >
                        Start YOLO
                      </Button>
                      <Button
                        variant="secondary"
                        size="small"
                        onclick={() => editConfig(config)}
                        testId="yolo-edit-config-btn"
                      >
                        Edit
                      </Button>
                      <Button
                        variant="secondary"
                        size="small"
                        onclick={() => deleteConfig(config.id)}
                        testId="yolo-delete-config-btn"
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      {/if}

      <!-- Running Tab -->
      {#if activeTab === 'running'}
        <div class="panel-content" data-testid="yolo-running-content">
          {#if runningResults.length === 0}
            <div class="empty-state">
              <p>No benchmarks currently running</p>
              <p class="hint">Go to Configure tab to start a benchmark</p>
            </div>
          {:else}
            <div class="running-list">
              {#each runningResults as result}
                {@const status = runningStatus.get(result.id)}
                <div class="running-item" data-testid="yolo-running-item" data-result-id={result.id}>
                  <div class="running-header">
                    <span class="running-status" style="color: {getStatusColor(result.status)}">
                      {formatStatus(result.status)}
                    </span>
                    {#if status?.isPaused}
                      <span class="paused-badge">PAUSED</span>
                    {/if}
                  </div>

                  <div class="running-progress">
                    <div class="progress-stat">
                      <span class="stat-label">Cycles</span>
                      <span class="stat-value">{result.cyclesCompleted}</span>
                    </div>
                    <div class="progress-stat">
                      <span class="stat-label">Tasks</span>
                      <span class="stat-value">{result.tasksCompleted}</span>
                    </div>
                    <div class="progress-stat">
                      <span class="stat-label">Cost</span>
                      <span class="stat-value">{formatCost(result.totalCostUsd)}</span>
                    </div>
                    <div class="progress-stat">
                      <span class="stat-label">Duration</span>
                      <span class="stat-value">{formatDuration(status?.elapsedMs || result.totalDurationMs)}</span>
                    </div>
                    <div class="progress-stat">
                      <span class="stat-label">Tests</span>
                      <span class="stat-value pass">{result.testsPassed}</span>
                      <span class="stat-divider">/</span>
                      <span class="stat-value fail">{result.testsFailed}</span>
                    </div>
                  </div>

                  <div class="running-actions">
                    {#if status?.isPaused}
                      <Button
                        variant="primary"
                        size="small"
                        onclick={() => resumeBenchmark(result.id)}
                        testId="yolo-resume-btn"
                      >
                        Resume
                      </Button>
                    {:else}
                      <Button
                        variant="secondary"
                        size="small"
                        onclick={() => pauseBenchmark(result.id)}
                        testId="yolo-pause-btn"
                      >
                        Pause
                      </Button>
                    {/if}
                    <Button
                      variant="secondary"
                      size="small"
                      onclick={() => stopBenchmark(result.id)}
                      testId="yolo-stop-btn"
                    >
                      Stop
                    </Button>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}

      <!-- Results Tab -->
      {#if activeTab === 'results'}
        <div class="panel-content" data-testid="yolo-results-content">
          {#if results.length === 0}
            <div class="empty-state">
              <p>No benchmark results yet</p>
              <p class="hint">Run a benchmark to see results here</p>
            </div>
          {:else}
            <div class="results-list" data-testid="yolo-results-list">
              {#each results as result}
                <div class="result-item" data-testid="yolo-result-item" data-result-id={result.id}>
                  <div class="result-header">
                    <span class="result-status" style="color: {getStatusColor(result.status)}">
                      {formatStatus(result.status)}
                    </span>
                    <span class="result-time">{formatTime(result.startedAt)}</span>
                  </div>

                  <div class="result-stats">
                    <div class="stat-group">
                      <span class="stat-label">Cycles</span>
                      <span class="stat-value">{result.cyclesCompleted}</span>
                    </div>
                    <div class="stat-group">
                      <span class="stat-label">Tasks</span>
                      <span class="stat-value">{result.tasksCompleted}</span>
                    </div>
                    <div class="stat-group">
                      <span class="stat-label">Cost</span>
                      <span class="stat-value">{formatCost(result.totalCostUsd)}</span>
                    </div>
                    <div class="stat-group">
                      <span class="stat-label">Duration</span>
                      <span class="stat-value">{formatDuration(result.totalDurationMs)}</span>
                    </div>
                    <div class="stat-group">
                      <span class="stat-label">Tests</span>
                      <span class="stat-value">
                        <span class="pass">{result.testsPassed}</span>/<span class="fail">{result.testsFailed}</span>
                      </span>
                    </div>
                    <div class="stat-group">
                      <span class="stat-label">Spec</span>
                      <span class="stat-value">{formatPercent(result.specCompletionPct / 100)}</span>
                    </div>
                  </div>

                  {#if result.stopReason}
                    <div class="stop-reason">
                      Stop reason: {result.stopReason}
                    </div>
                  {/if}

                  <div class="result-actions">
                    <label class="compare-checkbox">
                      <input
                        type="checkbox"
                        checked={selectedForComparison.includes(result.id)}
                        onchange={() => toggleComparison(result.id)}
                        data-testid="yolo-compare-checkbox"
                      />
                      Select for comparison
                    </label>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}

      <!-- Compare Tab -->
      {#if activeTab === 'compare'}
        <div class="panel-content" data-testid="yolo-compare-content">
          <div class="compare-header">
            <h3>Compare Benchmarks</h3>
            <Button
              variant="primary"
              onclick={runComparison}
              disabled={selectedForComparison.length < 2}
              testId="yolo-run-comparison-btn"
            >
              Compare ({selectedForComparison.length} selected)
            </Button>
          </div>

          {#if comparisonResult}
            <div class="comparison-results" data-testid="yolo-comparison-results">
              {#if comparisonResult.winner}
                <div class="winner-banner" data-testid="yolo-winner">
                  Winner: Result {comparisonResult.winner.slice(0, 8)}
                </div>
              {/if}

              <div class="comparison-table">
                <div class="comparison-header-row">
                  <div class="comparison-cell header">Metric</div>
                  {#each comparisonResult.results as result}
                    <div class="comparison-cell header" class:winner={result.id === comparisonResult.winner}>
                      {result.id.slice(0, 8)}
                    </div>
                  {/each}
                </div>

                <div class="comparison-row">
                  <div class="comparison-cell label">Spec Completion</div>
                  {#each comparisonResult.results as result}
                    <div class="comparison-cell">
                      {formatPercent(comparisonResult.grades[result.id]?.specCompletion || 0)}
                    </div>
                  {/each}
                </div>

                <div class="comparison-row">
                  <div class="comparison-cell label">Test Pass Rate</div>
                  {#each comparisonResult.results as result}
                    <div class="comparison-cell">
                      {formatPercent(comparisonResult.grades[result.id]?.testPassRate || 0)}
                    </div>
                  {/each}
                </div>

                <div class="comparison-row">
                  <div class="comparison-cell label">Cost Efficiency</div>
                  {#each comparisonResult.results as result}
                    <div class="comparison-cell">
                      {formatPercent(comparisonResult.grades[result.id]?.costEfficiency || 0)}
                    </div>
                  {/each}
                </div>

                <div class="comparison-row total">
                  <div class="comparison-cell label">Overall Score</div>
                  {#each comparisonResult.results as result}
                    <div class="comparison-cell" class:winner={result.id === comparisonResult.winner}>
                      {formatPercent(comparisonResult.grades[result.id]?.overallScore || 0)}
                    </div>
                  {/each}
                </div>
              </div>
            </div>
          {:else}
            <div class="empty-state">
              <p>Select benchmark results from the Results tab to compare</p>
              <p class="hint">You need at least 2 results to compare</p>
            </div>
          {/if}
        </div>
      {/if}

      <div class="panel-footer">
        <span class="footer-info">
          {configs.length} configurations | {results.length} results
        </span>
      </div>
    </div>
  </div>
{/if}

<style>
  .panel-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: var(--z-nerv-modal, 2000);
  }

  .panel {
    background: var(--color-nerv-bg, #1a1a2e);
    border: 1px solid var(--color-nerv-border, #333);
    border-radius: 8px;
    width: 90%;
    max-width: 900px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    border-bottom: 1px solid var(--color-nerv-border, #333);
  }

  .panel-header h2 {
    margin: 0;
    color: var(--color-nerv-primary, #00ff9f);
    font-size: 1.25rem;
  }

  .close-btn {
    background: transparent;
    border: none;
    color: var(--color-nerv-text-secondary, #888);
    font-size: 1.5rem;
    cursor: pointer;
    padding: 4px 8px;
    line-height: 1;
  }

  .close-btn:hover {
    color: var(--color-nerv-text, #fff);
  }

  .tab-buttons {
    display: flex;
    gap: 4px;
  }

  .tab-btn {
    background: transparent;
    border: 1px solid var(--color-nerv-border, #333);
    border-radius: 4px;
    color: var(--color-nerv-text-secondary, #888);
    padding: 6px 12px;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .tab-btn:hover {
    color: var(--color-nerv-text, #fff);
    border-color: var(--color-nerv-primary, #00ff9f);
  }

  .tab-btn.active {
    background: var(--color-nerv-primary, #00ff9f);
    color: var(--color-nerv-bg, #1a1a2e);
    border-color: var(--color-nerv-primary, #00ff9f);
    font-weight: 500;
  }

  .panel-content {
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
  }

  .empty-state {
    text-align: center;
    padding: 40px 20px;
    color: var(--color-nerv-text-secondary, #888);
  }

  .empty-state .hint {
    font-size: 0.875rem;
    margin-top: 8px;
    opacity: 0.7;
  }

  .panel-footer {
    padding: 12px 20px;
    border-top: 1px solid var(--color-nerv-border, #333);
  }

  .footer-info {
    color: var(--color-nerv-text-secondary, #888);
    font-size: 0.875rem;
  }

  /* Config Section */
  .config-section {
    margin-bottom: 24px;
  }

  .config-section h3 {
    color: var(--color-nerv-text, #fff);
    font-size: 1rem;
    margin-bottom: 16px;
  }

  .config-form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .form-row {
    display: flex;
    gap: 16px;
  }

  .form-row.checkboxes {
    margin-top: 8px;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--color-nerv-text, #fff);
    font-size: 0.875rem;
    cursor: pointer;
  }

  .checkbox-label input {
    width: 16px;
    height: 16px;
    accent-color: var(--color-nerv-primary, #00ff9f);
  }

  .form-actions {
    display: flex;
    gap: 12px;
    margin-top: 8px;
  }

  /* Config selects and inputs */
  .config-form select,
  .config-form input[type="text"],
  .config-form input[type="number"] {
    background: var(--color-nerv-bg-light, #12121a);
    border: 1px solid var(--color-nerv-border, #333);
    border-radius: 4px;
    color: var(--color-nerv-text, #fff);
    padding: 8px 12px;
    font-size: 0.875rem;
    width: 100%;
  }

  .config-form select:focus,
  .config-form input:focus {
    outline: none;
    border-color: var(--color-nerv-primary, #00ff9f);
  }

  /* Config List */
  .config-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .config-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--color-nerv-border, #333);
    border-radius: 6px;
  }

  .config-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .config-model {
    color: var(--color-nerv-text, #fff);
    font-weight: 500;
  }

  .config-limits {
    color: var(--color-nerv-text-secondary, #888);
    font-size: 0.8rem;
  }

  .config-actions {
    display: flex;
    gap: 8px;
  }

  /* Running List */
  .running-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .running-item {
    padding: 16px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--color-nerv-border, #333);
    border-radius: 8px;
  }

  .running-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
  }

  .running-status {
    font-weight: 600;
    font-size: 1.1rem;
  }

  .paused-badge {
    background: #f59e0b;
    color: #000;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .running-progress {
    display: flex;
    gap: 24px;
    flex-wrap: wrap;
    margin-bottom: 12px;
  }

  .progress-stat {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .stat-label {
    font-size: 0.7rem;
    color: var(--color-nerv-text-secondary, #888);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .stat-value {
    font-size: 1rem;
    color: var(--color-nerv-text, #fff);
    font-weight: 500;
  }

  .stat-value.pass {
    color: #4ade80;
  }

  .stat-value.fail {
    color: #ef4444;
  }

  .stat-divider {
    color: var(--color-nerv-text-secondary, #888);
    margin: 0 2px;
  }

  .running-actions {
    display: flex;
    gap: 8px;
  }

  /* Results List */
  .results-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .result-item {
    padding: 16px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--color-nerv-border, #333);
    border-radius: 8px;
  }

  .result-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .result-status {
    font-weight: 600;
  }

  .result-time {
    color: var(--color-nerv-text-secondary, #888);
    font-size: 0.8rem;
  }

  .result-stats {
    display: flex;
    gap: 20px;
    flex-wrap: wrap;
    margin-bottom: 12px;
  }

  .stat-group {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .stat-group .stat-value .pass {
    color: #4ade80;
  }

  .stat-group .stat-value .fail {
    color: #ef4444;
  }

  .stop-reason {
    font-size: 0.8rem;
    color: var(--color-nerv-text-secondary, #888);
    margin-bottom: 12px;
    font-style: italic;
  }

  .result-actions {
    display: flex;
    gap: 12px;
  }

  .compare-checkbox {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--color-nerv-text-secondary, #888);
    font-size: 0.875rem;
    cursor: pointer;
  }

  .compare-checkbox input {
    accent-color: var(--color-nerv-primary, #00ff9f);
  }

  /* Compare Tab */
  .compare-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }

  .compare-header h3 {
    margin: 0;
    color: var(--color-nerv-text, #fff);
    font-size: 1rem;
  }

  .comparison-results {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .winner-banner {
    background: linear-gradient(90deg, rgba(74, 222, 128, 0.2) 0%, transparent 100%);
    border-left: 4px solid #4ade80;
    padding: 12px 16px;
    border-radius: 4px;
    font-weight: 600;
    color: #4ade80;
  }

  .comparison-table {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--color-nerv-border, #333);
    border-radius: 8px;
    overflow: hidden;
  }

  .comparison-header-row,
  .comparison-row {
    display: flex;
  }

  .comparison-header-row {
    background: rgba(255, 255, 255, 0.05);
  }

  .comparison-row:nth-child(odd) {
    background: rgba(255, 255, 255, 0.02);
  }

  .comparison-row.total {
    background: rgba(0, 255, 159, 0.1);
    font-weight: 600;
  }

  .comparison-cell {
    flex: 1;
    padding: 12px;
    text-align: center;
    color: var(--color-nerv-text, #fff);
  }

  .comparison-cell.header {
    font-weight: 600;
    color: var(--color-nerv-primary, #00ff9f);
  }

  .comparison-cell.label {
    text-align: left;
    color: var(--color-nerv-text-secondary, #888);
  }

  .comparison-cell.winner {
    color: #4ade80;
  }
</style>
