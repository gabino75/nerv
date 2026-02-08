<script lang="ts">
  // NERV - Neural Evolution & Repository Vectoring
  // Main Dashboard Application

  import { onMount } from 'svelte'
  import { appStore, isLoading, appError } from './stores/appState'
  import ModelSelector from './components/ModelSelector.svelte'
  import ProjectSelector from './components/ProjectSelector.svelte'
  import TaskBoard from './components/TaskBoard.svelte'
  import ApprovalQueue from './components/ApprovalQueue.svelte'
  import ContextMonitor from './components/ContextMonitor.svelte'
  import TabContainer from './components/TabContainer.svelte'
  import ActionBar from './components/ActionBar.svelte'
  import RecoveryDialog from './components/RecoveryDialog.svelte'
  import AlertNotification from './components/AlertNotification.svelte'
  import BranchingDialog from './components/BranchingDialog.svelte'
  import MergeBranchDialog from './components/MergeBranchDialog.svelte'
  import ClearWithSummary from './components/ClearWithSummary.svelte'
  import KnowledgePanel from './components/KnowledgePanel.svelte'
  import LearningCapture from './components/LearningCapture.svelte'
  import CyclePanel from './components/CyclePanel.svelte'
  import WorktreePanel from './components/WorktreePanel.svelte'
  import ModelStats from './components/ModelStats.svelte'
  import ExportImport from './components/ExportImport.svelte'
  import AuditPanel from './components/AuditPanel.svelte'
  import YoloBenchmarkPanel from './components/YoloBenchmarkPanel.svelte'
  import OrgConfigPanel from './components/OrgConfigPanel.svelte'
  import ActiveSessionsPanel from './components/ActiveSessionsPanel.svelte'
  import WorkflowTemplatesPanel from './components/WorkflowTemplatesPanel.svelte'
  import ReposPanel from './components/ReposPanel.svelte'
  import UpdateNotification from './components/UpdateNotification.svelte'
  import BudgetAlertDialog from './components/BudgetAlertDialog.svelte'
  import LoopDetectedDialog from './components/LoopDetectedDialog.svelte'
  import CompactionDialog from './components/CompactionDialog.svelte'
  import CostDashboard from './components/CostDashboard.svelte'
  import SettingsPanel from './components/SettingsPanel.svelte'
  import DropdownMenu from './components/shared/DropdownMenu.svelte'
  import { selectedProject, currentTask } from './stores/appState'
  import { MONTHLY_BUDGET_DEFAULTS, BUDGET_SETTINGS_KEYS } from '../../shared/constants'
  import type { BudgetAlert, Task } from '../../shared/types'

  // Type definitions for component references
  type TabContainerRef = {
    startClaudeSession: (task: Task, projectId: string, systemPrompt?: string, additionalDirs?: string[]) => Promise<string | null>
    stopClaudeSession: () => Promise<void>
    resumeClaudeSession: (task: Task, projectId: string) => Promise<string | null>
    isSessionRunning: () => boolean
    createStandaloneTab: (projectId: string, title?: string) => import('../../shared/types').ClaudeTab
  }

  type BranchingDialogRef = {
    open: () => void
  }

  type ClearWithSummaryDialogRef = {
    open: () => void
  }

  type MergeBranchDialogRef = {
    open: (branch: import('../../shared/types').Branch) => void
  }

  type ActionBarRef = {
    handleBranchCreated: (branchId: string, branchContext: string) => Promise<void>
    handleClearComplete: (clearContext: string) => Promise<void>
  }

  // Component references (using $state for Svelte 5 compatibility)
  let tabContainer = $state<TabContainerRef | undefined>(undefined)
  let branchingDialog = $state<BranchingDialogRef | undefined>(undefined)
  let clearWithSummaryDialog = $state<ClearWithSummaryDialogRef | undefined>(undefined)
  let mergeBranchDialog = $state<MergeBranchDialogRef | undefined>(undefined)
  let actionBar = $state<ActionBarRef | undefined>(undefined)

  // Initialize the store from database on mount
  onMount(() => {
    appStore.init()

    // Expose appStore for E2E testing (when NERV_TEST_MODE is set)
    if (typeof window !== 'undefined') {
      (window as unknown as { __nervStore?: typeof appStore }).__nervStore = appStore
    }

    // Listen for open-audit-panel events (from audit notifications)
    const openAuditHandler = () => {
      showAuditPanel = true
    }
    window.addEventListener('open-audit-panel', openAuditHandler)

    // Listen for open-branching-dialog events (from loop detection)
    const openBranchingHandler = () => {
      branchingDialog?.open()
    }
    window.addEventListener('open-branching-dialog', openBranchingHandler)

    // Listen for open-clear-with-summary-dialog events (from loop detection)
    const openClearSummaryHandler = () => {
      clearWithSummaryDialog?.open()
    }
    window.addEventListener('open-clear-with-summary-dialog', openClearSummaryHandler)

    // Listen for open-spec-editor events (from audit panel Update Spec button)
    const openSpecEditorHandler = () => {
      showKnowledgePanel = true
    }
    window.addEventListener('open-spec-editor', openSpecEditorHandler)

    // Listen for subagent spawn/complete events
    window.api.claude.onSubagentSpawn((_sessionId, subagent) => {
      const sub = subagent as { id: string; agentType: string }
      appStore.addSubagent(sub.id, sub.agentType)
    })

    window.api.claude.onSubagentComplete((_sessionId, subagent) => {
      const sub = subagent as { id: string }
      appStore.removeSubagent(sub.id)
    })

    // Clear subagents when Claude session ends
    window.api.claude.onExit(() => {
      appStore.clearSubagents()
    })

    return () => {
      window.removeEventListener('open-audit-panel', openAuditHandler)
      window.removeEventListener('open-branching-dialog', openBranchingHandler)
      window.removeEventListener('open-clear-with-summary-dialog', openClearSummaryHandler)
      window.removeEventListener('open-spec-editor', openSpecEditorHandler)
    }
  })

  // Subscribe to loading and error states
  let loading = $state(false)
  let error = $state<string | null>(null)
  let projectId = $state<string | null>(null)
  let activeTask = $state<Task | null>(null)
  let showKnowledgePanel = $state(false)
  let showCyclePanel = $state(false)
  let showWorktreePanel = $state(false)
  let showModelStats = $state(false)
  let showExportImport = $state(false)
  let showAuditPanel = $state(false)
  let showYoloBenchmarkPanel = $state(false)
  let showOrgConfigPanel = $state(false)
  let showActiveSessionsPanel = $state(false)
  let showWorkflowTemplatesPanel = $state(false)
  let showReposPanel = $state(false)
  let showCostDashboard = $state(false)
  let showSettingsPanel = $state(false)
  let budgetAlert = $state<BudgetAlert | null>(null)
  let showBudgetAlert = $state(false)

  isLoading.subscribe(v => { loading = v })
  appError.subscribe(v => { error = v })
  selectedProject.subscribe(p => { projectId = p?.id ?? null })
  currentTask.subscribe(t => { activeTask = t })

  // Reference to learning capture dialog
  type LearningCaptureDialogRef = {
    open: () => void
  }
  let learningCaptureDialog = $state<LearningCaptureDialogRef | undefined>(undefined)

  // Handle branch created event
  function handleBranchCreated(branchId: string, branchContext: string) {
    if (actionBar) {
      actionBar.handleBranchCreated(branchId, branchContext)
    }
  }

  // Handle clear complete event
  function handleClearComplete(clearContext: string) {
    if (actionBar) {
      actionBar.handleClearComplete(clearContext)
    }
  }

  // Budget alert checking (PRD Section 14)
  async function checkBudgetAlerts() {
    try {
      const savedBudget = await window.api.db.settings.get(BUDGET_SETTINGS_KEYS.monthlyBudget)
      const monthlyBudget = savedBudget ? parseFloat(savedBudget) : MONTHLY_BUDGET_DEFAULTS.budgetUsd

      // PRD Section 20: daily budget from org costLimits.perDayMax
      const savedDailyBudget = await window.api.db.settings.get('daily_budget_usd')
      const dailyBudget = savedDailyBudget ? parseFloat(savedDailyBudget) : 0

      if (monthlyBudget <= 0 && dailyBudget <= 0) return

      const alerts = await window.api.db.metrics.checkBudgetAlerts(
        monthlyBudget,
        MONTHLY_BUDGET_DEFAULTS.warningThreshold,
        MONTHLY_BUDGET_DEFAULTS.criticalThreshold,
        dailyBudget
      )

      if (alerts.length > 0) {
        budgetAlert = alerts[0]  // Show most important alert
        showBudgetAlert = true
      }
    } catch (err) {
      console.error('Failed to check budget alerts:', err)
    }
  }

  function dismissBudgetAlert() {
    showBudgetAlert = false
    budgetAlert = null
  }

  function openAdjustBudget() {
    showBudgetAlert = false
    showModelStats = true
  }

  function openSwitchModel() {
    showBudgetAlert = false
    // The model selector is in the header - we'll just close the alert and let user find it
  }

  // Check budget alerts periodically (every 5 minutes) and on model stats open
  $effect(() => {
    if (showModelStats) {
      checkBudgetAlerts()
    }
  })

  // Initial budget alert check after app loads
  $effect(() => {
    if (!loading && projectId) {
      // Delay initial check to let app settle
      const timer = setTimeout(checkBudgetAlerts, 3000)
      return () => clearTimeout(timer)
    }
  })
</script>

{#if error}
  <div class="error-banner">
    <span>{error}</span>
    <button onclick={() => appStore.clearError()}>Dismiss</button>
  </div>
{/if}

<main class="app" data-testid="app">
  {#if loading}
    <div class="loading-overlay">
      <div class="spinner"></div>
    </div>
  {/if}

  <header class="header">
    <div class="header-brand">
      <h1>NERV</h1>
      <p class="tagline">Neural Evolution & Repository Vectoring</p>
    </div>
    <div class="header-actions">
      <ModelSelector />

      <button
        class="btn-header"
        data-testid="cycles-btn"
        onclick={() => showCyclePanel = true}
        disabled={!projectId}
        title="Manage development cycles"
      >
        Cycles
      </button>

      <DropdownMenu label="Knowledge" testId="knowledge-dropdown" disabled={!projectId}>
        {#snippet items()}
          <button class="dropdown-item" data-testid="knowledge-btn" onclick={() => showKnowledgePanel = true} disabled={!projectId}>
            <span class="item-icon">K</span> Knowledge Base
          </button>
          <button class="dropdown-item" data-testid="templates-btn" onclick={() => showWorkflowTemplatesPanel = true}>
            <span class="item-icon">T</span> Templates
          </button>
          <button class="dropdown-item" data-testid="repos-btn" onclick={() => showReposPanel = true} disabled={!projectId}>
            <span class="item-icon">R</span> Repos
          </button>
        {/snippet}
      </DropdownMenu>

      <DropdownMenu label="Workflow" testId="workflow-dropdown">
        {#snippet items()}
          <button class="dropdown-item" data-testid="worktrees-btn" onclick={() => showWorktreePanel = true} disabled={!projectId}>
            <span class="item-icon">W</span> Worktrees
          </button>
          <button class="dropdown-item" data-testid="sessions-btn" onclick={() => showActiveSessionsPanel = true}>
            <span class="item-icon">S</span> Sessions
          </button>
          <button class="dropdown-item" data-testid="yolo-btn" onclick={() => showYoloBenchmarkPanel = true} disabled={!projectId}>
            <span class="item-icon">Y</span> YOLO Mode
          </button>
          <button class="dropdown-item" data-testid="audit-btn" onclick={() => showAuditPanel = true} disabled={!projectId}>
            <span class="item-icon">A</span> Audit
          </button>
          <button class="dropdown-item" data-testid="org-btn" onclick={() => showOrgConfigPanel = true}>
            <span class="item-icon">O</span> Org Config
          </button>
        {/snippet}
      </DropdownMenu>

      <DropdownMenu label="Settings" testId="settings-dropdown">
        {#snippet items()}
          <button class="dropdown-item" data-testid="settings-btn" onclick={() => showSettingsPanel = true}>
            <span class="item-icon">G</span> General Settings
          </button>
          <button class="dropdown-item" onclick={() => showModelStats = true}>
            <span class="item-icon">S</span> Model Stats
          </button>
          <button class="dropdown-item" data-testid="cost-btn" onclick={() => showCostDashboard = true}>
            <span class="item-icon">C</span> Cost Dashboard
          </button>
          <button class="dropdown-item" onclick={() => showExportImport = true}>
            <span class="item-icon">E</span> Export / Import
          </button>
        {/snippet}
      </DropdownMenu>
    </div>
  </header>

  <div class="dashboard">
    <ProjectSelector />
    <TaskBoard />
    <ApprovalQueue />
  </div>

  <ContextMonitor />

  <TabContainer bind:this={tabContainer} />

  <ActionBar
    bind:this={actionBar}
    terminalPanel={tabContainer}
    {branchingDialog}
    {clearWithSummaryDialog}
    {mergeBranchDialog}
  />
</main>

<!-- Recovery dialog for interrupted tasks (shows on startup if needed) -->
<RecoveryDialog />

<!-- Alert notifications for hang/loop/compaction -->
<AlertNotification />

<!-- Loop detected dialog for repetitive action intervention (PRD Section 9) -->
<LoopDetectedDialog />

<!-- Compaction notification dialog per PRD lines 1012-1035 -->
<CompactionDialog />

<!-- Branching dialog for creating experimental branch sessions -->
<BranchingDialog
  bind:this={branchingDialog}
  onBranchCreated={handleBranchCreated}
/>

<!-- Merge branch dialog for merging branch learnings back to main -->
<MergeBranchDialog
  bind:this={mergeBranchDialog}
/>

<!-- Clear with summary dialog for resetting context while preserving learnings -->
<ClearWithSummary
  bind:this={clearWithSummaryDialog}
  onClearComplete={handleClearComplete}
/>

<!-- Knowledge panel for CLAUDE.md and documentation sources -->
<KnowledgePanel
  {projectId}
  isOpen={showKnowledgePanel}
  onClose={() => showKnowledgePanel = false}
/>

<!-- Cycle panel for iterative development workflow -->
<CyclePanel
  {projectId}
  isOpen={showCyclePanel}
  onClose={() => showCyclePanel = false}
/>

<!-- Worktree panel for managing git worktrees -->
<WorktreePanel
  isOpen={showWorktreePanel}
  onClose={() => showWorktreePanel = false}
/>

<!-- Model stats panel for usage comparison -->
<ModelStats
  isOpen={showModelStats}
  onClose={() => showModelStats = false}
/>

<!-- Export/Import panel for project backup/restore -->
<ExportImport
  isOpen={showExportImport}
  onClose={() => showExportImport = false}
/>

<!-- Audit panel for viewing audit logs and code health -->
<AuditPanel
  {projectId}
  isOpen={showAuditPanel}
  onClose={() => showAuditPanel = false}
/>

<!-- YOLO Mode panel for autonomous execution -->
<YoloBenchmarkPanel
  {projectId}
  isOpen={showYoloBenchmarkPanel}
  onClose={() => showYoloBenchmarkPanel = false}
/>

<!-- Organization config panel for org settings status -->
<OrgConfigPanel
  isOpen={showOrgConfigPanel}
  onClose={() => showOrgConfigPanel = false}
/>

<!-- Active Sessions panel for viewing all Claude Code sessions (PRD Section 10) -->
<ActiveSessionsPanel
  isOpen={showActiveSessionsPanel}
  onClose={() => showActiveSessionsPanel = false}
/>

<!-- Workflow Templates panel for viewing skills (PRD Section 15) -->
<WorkflowTemplatesPanel
  isOpen={showWorkflowTemplatesPanel}
  onClose={() => showWorkflowTemplatesPanel = false}
/>

<!-- Repository Context panel for viewing repo scan results (PRD Section 25) -->
<ReposPanel
  {projectId}
  isOpen={showReposPanel}
  onClose={() => showReposPanel = false}
/>

<!-- Cost & Usage dashboard -->
<CostDashboard
  {projectId}
  isOpen={showCostDashboard}
  onClose={() => showCostDashboard = false}
/>

<!-- Settings panel -->
<SettingsPanel
  isOpen={showSettingsPanel}
  onClose={() => showSettingsPanel = false}
/>

<!-- Learning capture dialog for capturing task learnings -->
{#if activeTask && projectId}
  <LearningCapture
    bind:this={learningCaptureDialog}
    task={activeTask}
    {projectId}
  />
{/if}

<!-- Update notification for app updates (PRD Section 33) -->
<UpdateNotification />

<!-- Budget Alert dialog (PRD Section 14) -->
{#if showBudgetAlert && budgetAlert}
  <BudgetAlertDialog
    alert={budgetAlert}
    onDismiss={dismissBudgetAlert}
    onAdjustBudget={openAdjustBudget}
    onSwitchModel={openSwitchModel}
  />
{/if}

<style>
  :global(*) {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  :global(body) {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
    background: #0a0a0f;
    color: #e0e0e0;
    overflow: hidden;
    height: 100vh;
    width: 100vw;
  }

  :global(::-webkit-scrollbar) {
    width: 8px;
    height: 8px;
  }

  :global(::-webkit-scrollbar-track) {
    background: #0a0a0f;
  }

  :global(::-webkit-scrollbar-thumb) {
    background: #2a2a3a;
    border-radius: 4px;
  }

  :global(::-webkit-scrollbar-thumb:hover) {
    background: #3a3a4a;
  }

  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100%;
    padding: 12px;
    gap: 8px;
    overflow: hidden;
  }

  /* Reduce padding on small screens */
  @media (max-width: 600px) {
    .app {
      padding: 8px;
      gap: 6px;
    }
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
    flex-shrink: 0;
  }

  .header-brand {
    display: flex;
    align-items: baseline;
    gap: 16px;
  }

  .header h1 {
    font-size: 26px;
    font-weight: 700;
    color: #ff6b35;
    letter-spacing: 3px;
  }

  .tagline {
    font-size: 12px;
    color: #555;
    letter-spacing: 0.5px;
  }

  .header-actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  /* Small screens - compress header buttons */
  @media (max-width: 800px) {
    .header-actions {
      gap: 4px;
    }
    .btn-header {
      padding: 4px 8px;
      font-size: 11px;
    }
  }

  .btn-header {
    padding: 6px 14px;
    font-size: 12px;
    background: #12121a;
    border: 1px solid #2a2a3a;
    border-radius: 4px;
    color: #888;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-header:hover:not(:disabled) {
    background: #1a1a24;
    border-color: #ff6b35;
    color: #ff6b35;
  }

  .btn-header:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .dashboard {
    display: grid;
    grid-template-columns: 200px 1fr 220px;
    gap: 8px;
    flex: 0 0 auto;
    min-height: 120px;
    max-height: 220px;
    position: relative;
    z-index: 10; /* Stack above terminal for dropdowns */
    overflow: hidden;
  }

  @media (max-width: 1200px) {
    .dashboard {
      grid-template-columns: 160px 1fr 180px;
    }
  }

  @media (max-width: 900px) {
    .dashboard {
      grid-template-columns: 1fr 1fr;
      max-height: 180px;
    }
  }

  /* Very narrow screens - stack dashboard vertically */
  @media (max-width: 600px) {
    .dashboard {
      grid-template-columns: 1fr;
      grid-template-rows: auto auto auto;
      max-height: none;
      min-height: auto;
      gap: 4px;
    }
  }

  @media (max-height: 600px) {
    .dashboard {
      max-height: 160px;
      min-height: 100px;
    }
    .header {
      padding: 4px 0;
    }
    .header h1 {
      font-size: 20px;
    }
    .tagline {
      display: none;
    }
  }

  /* Very short screens - collapse dashboard further */
  @media (max-height: 500px) {
    .dashboard {
      max-height: 120px;
      min-height: 80px;
    }
  }

  .error-banner {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    background: #8b0000;
    color: white;
    padding: 10px 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    z-index: 2000;
    font-size: 13px;
  }

  .error-banner button {
    background: rgba(255, 255, 255, 0.2);
    border: none;
    color: white;
    padding: 4px 12px;
    border-radius: 4px;
    cursor: pointer;
  }

  .error-banner button:hover {
    background: rgba(255, 255, 255, 0.3);
  }

  .loading-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(10, 10, 15, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1500;
    pointer-events: none;
  }

  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid #2a2a3a;
    border-top-color: #ff6b35;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
