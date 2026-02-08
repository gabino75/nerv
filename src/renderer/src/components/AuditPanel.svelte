<script lang="ts">
  /**
   * AuditPanel - Displays audit logs and code health metrics
   *
   * Features:
   * - View all audit events for the project
   * - Filter by event type
   * - Filter by task
   * - Display code health checks
   * - Show spec drift detection results
   * - Create tasks from audit issues
   */

  import type { AuditLogEntry, Task } from '../../../shared/types'
  import { Button } from './shared'
  import { selectedProject, appStore } from '../stores/appState'

  // Props
  interface Props {
    projectId: string | null
    isOpen: boolean
    onClose: () => void
  }

  let { projectId, isOpen, onClose }: Props = $props()

  // State
  let auditLogs = $state<AuditLogEntry[]>([])
  let tasks = $state<Task[]>([])
  let isLoading = $state(false)
  let selectedTaskId = $state<string | null>(null)
  let selectedEventType = $state<string | null>(null)
  let activeTab = $state<'logs' | 'health' | 'drift'>('health')

  // Code health metrics state
  interface CodeHealthMetrics {
    testCoverage: number
    dryViolations: number
    typeErrors: number
    deadCodeCount: number
    complexFunctions: number
    lastChecked: string | null
  }

  let codeHealth = $state<CodeHealthMetrics>({
    testCoverage: 0,
    dryViolations: 0,
    typeErrors: 0,
    deadCodeCount: 0,
    complexFunctions: 0,
    lastChecked: null
  })

  // Spec drift state
  interface SpecDriftItem {
    id: string
    type: 'missing_feature' | 'stale_task' | 'blocked_task' | 'spec_mismatch'
    description: string
    severity: 'warning' | 'error' | 'info'
    taskId?: string
    dismissed: boolean
    deferred: boolean
  }

  let specDriftItems = $state<SpecDriftItem[]>([])

  // Audit issues that can become tasks
  interface AuditIssue {
    id: string
    type: string
    title: string
    description: string
    severity: 'warning' | 'error' | 'info'
    autoFixable: boolean
    dismissed: boolean
    deferred: boolean
  }

  let auditIssues = $state<AuditIssue[]>([])

  // Emit event to open CLAUDE.md editor
  function openSpecEditor(issue: AuditIssue) {
    // Emit a custom event that App.svelte can listen to
    window.dispatchEvent(new CustomEvent('open-spec-editor', {
      detail: {
        projectId,
        issueDescription: issue.description
      }
    }))
    // Dismiss the issue after opening editor
    dismissIssue(issue.id)
  }

  // Defer an issue to be addressed later
  function deferIssue(issueId: string) {
    auditIssues = auditIssues.map(i =>
      i.id === issueId ? { ...i, deferred: true } : i
    )
  }

  // Event type categories for filtering
  const eventTypeCategories = {
    'Tasks': ['task_created', 'task_status_changed', 'task_deleted', 'task_interrupted', 'task_abandoned'],
    'Approvals': ['approval_requested', 'approval_resolved'],
    'Cycles': ['cycle_created', 'cycle_completed'],
    'Decisions': ['decision_created', 'decision_deleted'],
    'Health': ['code_health_check', 'spec_drift_check', 'audit_triggered'],
    'Recovery': ['hang_detected', 'loop_detected', 'context_compacted']
  }

  // Flatten for filter dropdown
  const allEventTypes = Object.values(eventTypeCategories).flat()

  // Load data when panel opens
  $effect(() => {
    if (projectId && isOpen) {
      loadAuditLogs()
      loadTasks()
      loadCodeHealth()
      loadSpecDrift()
    }
  })

  // Load code health metrics from audit logs
  async function loadCodeHealth() {
    if (!projectId) return
    try {
      // Get the most recent code_health_check event
      const healthLogs = auditLogs.filter(log => log.event_type === 'code_health_check')
      if (healthLogs.length > 0) {
        const latest = healthLogs[0]
        const details = parseDetails(latest.details)
        if (details) {
          codeHealth = {
            testCoverage: (details.testCoverage as number) ?? 0,
            dryViolations: (details.dryViolations as number) ?? 0,
            typeErrors: (details.typeErrors as number) ?? 0,
            deadCodeCount: (details.deadCodeCount as number) ?? 0,
            complexFunctions: (details.complexFunctions as number) ?? 0,
            lastChecked: latest.timestamp
          }

          // Generate issues from health metrics
          generateHealthIssues()
        }
      }
    } catch (error) {
      console.error('Failed to load code health:', error)
    }
  }

  // Load spec drift detection results from audit logs
  async function loadSpecDrift() {
    if (!projectId) return
    try {
      // Get spec_drift_check events
      const driftLogs = auditLogs.filter(log => log.event_type === 'spec_drift_check')
      if (driftLogs.length > 0) {
        const items: SpecDriftItem[] = []
        for (const log of driftLogs.slice(0, 10)) {
          const details = parseDetails(log.details)
          if (details) {
            items.push({
              id: log.id,
              type: (details.type as SpecDriftItem['type']) ?? 'spec_mismatch',
              description: (details.description as string) ?? 'Unknown spec drift',
              severity: (details.severity as SpecDriftItem['severity']) ?? 'warning',
              taskId: details.taskId as string | undefined,
              dismissed: false,
              deferred: false
            })
          }
        }
        specDriftItems = items
      }
    } catch (error) {
      console.error('Failed to load spec drift:', error)
    }
  }

  // Generate audit issues from health metrics
  function generateHealthIssues() {
    const issues: AuditIssue[] = []

    // Test coverage threshold: 70%
    if (codeHealth.testCoverage < 70) {
      issues.push({
        id: 'low-coverage',
        type: 'test_coverage',
        title: 'Low Test Coverage',
        description: `Test coverage is ${codeHealth.testCoverage}% (threshold: 70%)`,
        severity: codeHealth.testCoverage < 50 ? 'error' : 'warning',
        autoFixable: false,
        dismissed: false,
        deferred: false
      })
    }

    // DRY violations threshold: 5
    if (codeHealth.dryViolations > 5) {
      issues.push({
        id: 'dry-violations',
        type: 'dry_violation',
        title: 'DRY Violations Detected',
        description: `Found ${codeHealth.dryViolations} duplicate code patterns (threshold: 5)`,
        severity: codeHealth.dryViolations > 10 ? 'error' : 'warning',
        autoFixable: false,
        dismissed: false,
        deferred: false
      })
    }

    // Type errors threshold: 0
    if (codeHealth.typeErrors > 0) {
      issues.push({
        id: 'type-errors',
        type: 'type_safety',
        title: 'Type Safety Issues',
        description: `Found ${codeHealth.typeErrors} type errors or 'any' types`,
        severity: 'error',
        autoFixable: false,
        dismissed: false,
        deferred: false
      })
    }

    // Dead code threshold: 10
    if (codeHealth.deadCodeCount > 10) {
      issues.push({
        id: 'dead-code',
        type: 'dead_code',
        title: 'Dead Code Detected',
        description: `Found ${codeHealth.deadCodeCount} unused exports (threshold: 10)`,
        severity: 'warning',
        autoFixable: true,
        dismissed: false,
        deferred: false
      })
    }

    // Complex functions threshold: 0
    if (codeHealth.complexFunctions > 0) {
      issues.push({
        id: 'complex-functions',
        type: 'complexity',
        title: 'Complex Functions',
        description: `Found ${codeHealth.complexFunctions} functions over 50 lines`,
        severity: 'warning',
        autoFixable: false,
        dismissed: false,
        deferred: false
      })
    }

    auditIssues = issues
  }

  // Get active issues (not dismissed or deferred)
  function getActiveIssues(): AuditIssue[] {
    return auditIssues.filter(i => !i.dismissed && !i.deferred)
  }

  // Get deferred issues
  function getDeferredIssues(): AuditIssue[] {
    return auditIssues.filter(i => !i.dismissed && i.deferred)
  }

  // Create a task from an audit issue
  async function createTaskFromIssue(issue: AuditIssue) {
    if (!projectId) return

    const taskTitles: Record<string, string> = {
      'test_coverage': 'Add tests to improve coverage',
      'dry_violation': 'Refactor duplicate code patterns',
      'type_safety': 'Fix type safety issues',
      'dead_code': 'Clean up unused code',
      'complexity': 'Split complex functions'
    }

    try {
      const task = await window.api.db.tasks.create(
        projectId,
        taskTitles[issue.type] || issue.title,
        issue.description
      )

      // Log the task creation
      await window.api.db.audit.log(task.id, 'task_created', JSON.stringify({
        source: 'audit_issue',
        issueType: issue.type,
        issueSeverity: issue.severity
      }))

      // Refresh tasks list
      await loadTasks()

      // Mark issue as handled (dismiss it)
      auditIssues = auditIssues.map(i =>
        i.id === issue.id ? { ...i, dismissed: true } : i
      )

      // Reload the store
      await appStore.loadTasks(projectId)
    } catch (error) {
      console.error('Failed to create task from issue:', error)
    }
  }

  // Dismiss an issue
  function dismissIssue(issueId: string) {
    auditIssues = auditIssues.map(i =>
      i.id === issueId ? { ...i, dismissed: true } : i
    )
  }

  // Dismiss a spec drift item
  function dismissDriftItem(itemId: string) {
    specDriftItems = specDriftItems.map(i =>
      i.id === itemId ? { ...i, dismissed: true } : i
    )
  }

  // Defer a spec drift item
  function deferDriftItem(itemId: string) {
    specDriftItems = specDriftItems.map(i =>
      i.id === itemId ? { ...i, deferred: true } : i
    )
  }

  // Update spec for a drift item - opens CLAUDE.md editor
  function updateSpecForDrift(item: SpecDriftItem) {
    window.dispatchEvent(new CustomEvent('open-spec-editor', {
      detail: {
        projectId,
        issueDescription: item.description
      }
    }))
    dismissDriftItem(item.id)
  }

  // Get active drift items (not dismissed or deferred)
  function getActiveDriftItems(): SpecDriftItem[] {
    return specDriftItems.filter(i => !i.dismissed && !i.deferred)
  }

  // Get deferred drift items
  function getDeferredDriftItems(): SpecDriftItem[] {
    return specDriftItems.filter(i => !i.dismissed && i.deferred)
  }

  // Run a code health check (mock for now - would call actual analysis)
  async function runCodeHealthCheck() {
    if (!projectId) return
    isLoading = true
    try {
      // In a real implementation, this would run actual analysis tools
      // For now, we simulate with random values for testing
      const metrics = {
        testCoverage: Math.floor(Math.random() * 40) + 60, // 60-100%
        dryViolations: Math.floor(Math.random() * 8), // 0-7
        typeErrors: Math.floor(Math.random() * 3), // 0-2
        deadCodeCount: Math.floor(Math.random() * 15), // 0-14
        complexFunctions: Math.floor(Math.random() * 4) // 0-3
      }

      // Log the health check
      await window.api.db.audit.log(null, 'code_health_check', JSON.stringify(metrics))

      // Update state
      codeHealth = {
        ...metrics,
        lastChecked: new Date().toISOString()
      }

      // Reload audit logs to get the new entry
      await loadAuditLogs()
      generateHealthIssues()
    } catch (error) {
      console.error('Failed to run code health check:', error)
    } finally {
      isLoading = false
    }
  }

  // Run spec drift detection
  async function runSpecDriftCheck() {
    if (!projectId) return
    isLoading = true
    try {
      // Check for stale tasks (tasks not updated in a while)
      const staleTasks = tasks.filter(t => {
        if (t.status === 'done' || t.status === 'cancelled') return false
        const updatedAt = new Date(t.updatedAt || t.createdAt)
        const daysSinceUpdate = (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60 * 24)
        return daysSinceUpdate > 7 // Stale if not updated in 7 days
      })

      const items: SpecDriftItem[] = []

      for (const task of staleTasks) {
        const item: SpecDriftItem = {
          id: `stale-${task.id}`,
          type: 'stale_task',
          description: `Task "${task.title}" hasn't been updated in over 7 days`,
          severity: 'info',
          taskId: task.id,
          dismissed: false,
          deferred: false
        }
        items.push(item)

        // Log the spec drift check
        await window.api.db.audit.log(task.id, 'spec_drift_check', JSON.stringify({
          type: 'stale_task',
          description: item.description,
          severity: 'info'
        }))
      }

      specDriftItems = items
    } catch (error) {
      console.error('Failed to run spec drift check:', error)
    } finally {
      isLoading = false
    }
  }

  async function loadAuditLogs() {
    if (!projectId) return
    try {
      // Get all logs (no task filter to get project-wide logs)
      auditLogs = await window.api.db.audit.get(selectedTaskId ?? undefined, 200)
    } catch (error) {
      console.error('Failed to load audit logs:', error)
    }
  }

  async function loadTasks() {
    if (!projectId) return
    try {
      tasks = await window.api.db.tasks.getForProject(projectId)
    } catch (error) {
      console.error('Failed to load tasks:', error)
    }
  }

  // Filter logs based on selections
  let filteredLogs = $derived(() => {
    let logs = auditLogs

    if (selectedTaskId) {
      logs = logs.filter(log => log.task_id === selectedTaskId)
    }

    if (selectedEventType) {
      logs = logs.filter(log => log.event_type === selectedEventType)
    }

    return logs
  })

  // Get display name for event type
  function getEventTypeLabel(eventType: string): string {
    const labels: Record<string, string> = {
      'task_created': 'Task Created',
      'task_status_changed': 'Status Changed',
      'task_deleted': 'Task Deleted',
      'task_interrupted': 'Task Interrupted',
      'task_abandoned': 'Task Abandoned',
      'approval_requested': 'Approval Requested',
      'approval_resolved': 'Approval Resolved',
      'cycle_created': 'Cycle Created',
      'cycle_completed': 'Cycle Completed',
      'decision_created': 'Decision Created',
      'decision_deleted': 'Decision Deleted',
      'code_health_check': 'Code Health Check',
      'spec_drift_check': 'Spec Drift Check',
      'audit_triggered': 'Audit Triggered',
      'hang_detected': 'Hang Detected',
      'loop_detected': 'Loop Detected',
      'context_compacted': 'Context Compacted'
    }
    return labels[eventType] || eventType.replace(/_/g, ' ')
  }

  // Get icon for event type
  function getEventTypeIcon(eventType: string): string {
    const icons: Record<string, string> = {
      'task_created': '+',
      'task_status_changed': '~',
      'task_deleted': '-',
      'task_interrupted': '!',
      'task_abandoned': 'x',
      'approval_requested': '?',
      'approval_resolved': 'v',
      'cycle_created': 'C',
      'cycle_completed': 'C',
      'decision_created': 'D',
      'decision_deleted': 'D',
      'code_health_check': 'H',
      'spec_drift_check': 'S',
      'audit_triggered': 'A',
      'hang_detected': '!',
      'loop_detected': 'L',
      'context_compacted': 'Z'
    }
    return icons[eventType] || '*'
  }

  // Get color class for event type
  function getEventTypeColor(eventType: string): string {
    if (eventType.includes('error') || eventType.includes('hang') || eventType.includes('loop')) {
      return 'event-warning'
    }
    if (eventType.includes('completed') || eventType.includes('resolved')) {
      return 'event-success'
    }
    if (eventType.includes('created')) {
      return 'event-info'
    }
    return 'event-default'
  }

  // Format timestamp for display
  function formatTime(timestamp: string): string {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`

    return date.toLocaleDateString()
  }

  // Parse and display details
  function parseDetails(details: string | null): Record<string, unknown> | null {
    if (!details) return null
    try {
      return JSON.parse(details)
    } catch {
      return { message: details }
    }
  }

  // Get task title by ID
  function getTaskTitle(taskId: string | null): string {
    if (!taskId) return 'Project-level'
    const task = tasks.find(t => t.id === taskId)
    return task?.title || taskId.substring(0, 8)
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
  <div class="panel-overlay" onclick={onClose} data-testid="audit-panel-overlay" role="dialog" aria-modal="true" tabindex="-1">
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="panel" onclick={(e) => e.stopPropagation()} data-testid="audit-panel" role="presentation">
      <div class="panel-header">
        <h2>Audit</h2>
        <div class="tab-buttons">
          <button
            class="tab-btn"
            class:active={activeTab === 'health'}
            onclick={() => activeTab = 'health'}
            data-testid="audit-tab-health"
          >
            Health
          </button>
          <button
            class="tab-btn"
            class:active={activeTab === 'drift'}
            onclick={() => activeTab = 'drift'}
            data-testid="audit-tab-drift"
          >
            Spec Drift
          </button>
          <button
            class="tab-btn"
            class:active={activeTab === 'logs'}
            onclick={() => activeTab = 'logs'}
            data-testid="audit-tab-logs"
          >
            Logs
          </button>
        </div>
        <button class="close-btn" onclick={onClose}>&times;</button>
      </div>

      <!-- Code Health Tab -->
      {#if activeTab === 'health'}
        <div class="panel-content" data-testid="audit-health-content">
          <div class="health-header">
            <h3>Code Health Metrics</h3>
            <Button
              variant="secondary"
              size="small"
              onclick={runCodeHealthCheck}
              disabled={isLoading}
              testId="run-health-check-btn"
            >
              {isLoading ? 'Checking...' : 'Run Check'}
            </Button>
          </div>

          {#if codeHealth.lastChecked}
            <div class="health-grid" data-testid="health-metrics">
              <div class="health-metric" data-testid="metric-coverage">
                <span class="metric-icon" class:healthy={codeHealth.testCoverage >= 70} class:unhealthy={codeHealth.testCoverage < 70}>
                  {codeHealth.testCoverage >= 70 ? '✓' : '⚠'}
                </span>
                <div class="metric-content">
                  <span class="metric-label">Test Coverage</span>
                  <span class="metric-value">{codeHealth.testCoverage}%</span>
                  <span class="metric-threshold">(threshold: 70%)</span>
                </div>
              </div>

              <div class="health-metric" data-testid="metric-dry">
                <span class="metric-icon" class:healthy={codeHealth.dryViolations <= 5} class:unhealthy={codeHealth.dryViolations > 5}>
                  {codeHealth.dryViolations <= 5 ? '✓' : '⚠'}
                </span>
                <div class="metric-content">
                  <span class="metric-label">DRY Violations</span>
                  <span class="metric-value">{codeHealth.dryViolations}</span>
                  <span class="metric-threshold">(threshold: 5)</span>
                </div>
              </div>

              <div class="health-metric" data-testid="metric-types">
                <span class="metric-icon" class:healthy={codeHealth.typeErrors === 0} class:unhealthy={codeHealth.typeErrors > 0}>
                  {codeHealth.typeErrors === 0 ? '✓' : '✗'}
                </span>
                <div class="metric-content">
                  <span class="metric-label">Type Errors</span>
                  <span class="metric-value">{codeHealth.typeErrors}</span>
                  <span class="metric-threshold">(threshold: 0)</span>
                </div>
              </div>

              <div class="health-metric" data-testid="metric-dead-code">
                <span class="metric-icon" class:healthy={codeHealth.deadCodeCount <= 10} class:unhealthy={codeHealth.deadCodeCount > 10}>
                  {codeHealth.deadCodeCount <= 10 ? '✓' : '⚠'}
                </span>
                <div class="metric-content">
                  <span class="metric-label">Dead Code</span>
                  <span class="metric-value">{codeHealth.deadCodeCount} unused</span>
                  <span class="metric-threshold">(threshold: 10)</span>
                </div>
              </div>

              <div class="health-metric" data-testid="metric-complexity">
                <span class="metric-icon" class:healthy={codeHealth.complexFunctions === 0} class:unhealthy={codeHealth.complexFunctions > 0}>
                  {codeHealth.complexFunctions === 0 ? '✓' : '⚠'}
                </span>
                <div class="metric-content">
                  <span class="metric-label">Complex Functions</span>
                  <span class="metric-value">{codeHealth.complexFunctions}</span>
                  <span class="metric-threshold">(over 50 lines)</span>
                </div>
              </div>
            </div>

            <p class="last-checked">Last checked: {formatTime(codeHealth.lastChecked)}</p>
          {:else}
            <div class="empty-state">
              <p>No health check data available</p>
              <p class="hint">Click "Run Check" to analyze code health</p>
            </div>
          {/if}

          <!-- Issues Section (PRD: [Update Spec] [Create Cleanup Task] [Dismiss] [Defer]) -->
          {#if getActiveIssues().length > 0}
            <div class="issues-section" data-testid="audit-issues">
              <h4>Action Required</h4>
              {#each getActiveIssues() as issue}
                <div class="issue-item {issue.severity}" data-testid="audit-issue" data-issue-id={issue.id}>
                  <div class="issue-content">
                    <span class="issue-title">{issue.title}</span>
                    <span class="issue-description">{issue.description}</span>
                  </div>
                  <div class="issue-actions">
                    <Button
                      variant="secondary"
                      size="small"
                      onclick={() => openSpecEditor(issue)}
                      testId="update-spec-btn"
                    >
                      Update Spec
                    </Button>
                    <Button
                      variant="primary"
                      size="small"
                      onclick={() => createTaskFromIssue(issue)}
                      testId="create-task-from-issue-btn"
                    >
                      Create Cleanup Task
                    </Button>
                    <Button
                      variant="secondary"
                      size="small"
                      onclick={() => dismissIssue(issue.id)}
                      testId="dismiss-issue-btn"
                    >
                      Dismiss
                    </Button>
                    <Button
                      variant="secondary"
                      size="small"
                      onclick={() => deferIssue(issue.id)}
                      testId="defer-issue-btn"
                    >
                      Defer
                    </Button>
                  </div>
                </div>
              {/each}
            </div>
          {/if}

          <!-- Deferred Issues Section -->
          {#if getDeferredIssues().length > 0}
            <div class="issues-section deferred-section" data-testid="deferred-issues">
              <h4>Deferred</h4>
              {#each getDeferredIssues() as issue}
                <div class="issue-item deferred {issue.severity}" data-testid="deferred-issue" data-issue-id={issue.id}>
                  <div class="issue-content">
                    <span class="issue-title">{issue.title}</span>
                    <span class="issue-description">{issue.description}</span>
                  </div>
                  <div class="issue-actions">
                    <Button
                      variant="secondary"
                      size="small"
                      onclick={() => { issue.deferred = false; auditIssues = [...auditIssues] }}
                      testId="restore-issue-btn"
                    >
                      Restore
                    </Button>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}

      <!-- Spec Drift Tab -->
      {#if activeTab === 'drift'}
        <div class="panel-content" data-testid="audit-drift-content">
          <div class="health-header">
            <h3>Spec Drift Detection</h3>
            <Button
              variant="secondary"
              size="small"
              onclick={runSpecDriftCheck}
              disabled={isLoading}
              testId="run-drift-check-btn"
            >
              {isLoading ? 'Checking...' : 'Run Check'}
            </Button>
          </div>

          {#if getActiveDriftItems().length > 0}
            <div class="drift-list" data-testid="spec-drift-items">
              {#each getActiveDriftItems() as item}
                <div class="drift-item {item.severity}" data-testid="spec-drift-item" data-drift-type={item.type}>
                  <div class="drift-icon">
                    {#if item.type === 'stale_task'}📋{:else if item.type === 'missing_feature'}❓{:else if item.type === 'blocked_task'}🚫{:else}⚠{/if}
                  </div>
                  <div class="drift-content">
                    <span class="drift-type">{item.type.replace(/_/g, ' ')}</span>
                    <span class="drift-description">{item.description}</span>
                  </div>
                  <div class="drift-actions">
                    <Button
                      variant="secondary"
                      size="small"
                      onclick={() => updateSpecForDrift(item)}
                      testId="update-spec-drift-btn"
                    >
                      Update Spec
                    </Button>
                    <Button
                      variant="secondary"
                      size="small"
                      onclick={() => dismissDriftItem(item.id)}
                      testId="dismiss-drift-btn"
                    >
                      Dismiss
                    </Button>
                    <Button
                      variant="secondary"
                      size="small"
                      onclick={() => deferDriftItem(item.id)}
                      testId="defer-drift-btn"
                    >
                      Defer
                    </Button>
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            <div class="empty-state">
              <p>No spec drift detected</p>
              <p class="hint">Click "Run Check" to analyze for stale tasks and spec mismatches</p>
            </div>
          {/if}

          <!-- Deferred Drift Items Section -->
          {#if getDeferredDriftItems().length > 0}
            <div class="drift-list deferred-section" data-testid="deferred-drift-items">
              <h4>Deferred</h4>
              {#each getDeferredDriftItems() as item}
                <div class="drift-item deferred {item.severity}" data-testid="deferred-drift-item" data-drift-type={item.type}>
                  <div class="drift-icon">
                    {#if item.type === 'stale_task'}📋{:else if item.type === 'missing_feature'}❓{:else if item.type === 'blocked_task'}🚫{:else}⚠{/if}
                  </div>
                  <div class="drift-content">
                    <span class="drift-type">{item.type.replace(/_/g, ' ')}</span>
                    <span class="drift-description">{item.description}</span>
                  </div>
                  <div class="drift-actions">
                    <Button
                      variant="secondary"
                      size="small"
                      onclick={() => { item.deferred = false; specDriftItems = [...specDriftItems] }}
                      testId="restore-drift-btn"
                    >
                      Restore
                    </Button>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}

      <!-- Logs Tab -->
      {#if activeTab === 'logs'}
        <div class="panel-filters">
          <div class="filter-group">
            <label for="task-filter">Task:</label>
            <select
              id="task-filter"
              bind:value={selectedTaskId}
              onchange={loadAuditLogs}
              data-testid="audit-task-filter"
            >
              <option value={null}>All Tasks</option>
              {#each tasks as task}
                <option value={task.id}>{task.title}</option>
              {/each}
            </select>
          </div>

          <div class="filter-group">
            <label for="event-filter">Event Type:</label>
            <select
              id="event-filter"
              bind:value={selectedEventType}
              data-testid="audit-event-filter"
            >
              <option value={null}>All Events</option>
              {#each Object.entries(eventTypeCategories) as [category, types]}
                <optgroup label={category}>
                  {#each types as type}
                    <option value={type}>{getEventTypeLabel(type)}</option>
                  {/each}
                </optgroup>
              {/each}
            </select>
          </div>

          <Button
            variant="secondary"
            size="small"
            onclick={loadAuditLogs}
            disabled={isLoading}
          >
            Refresh
          </Button>
        </div>

        <div class="panel-content">
          {#if isLoading}
            <div class="loading">Loading audit logs...</div>
          {:else if filteredLogs().length === 0}
            <div class="empty-state">
              <p>No audit events found</p>
              <p class="hint">Events are logged as you work with tasks, cycles, and approvals.</p>
            </div>
          {:else}
            <div class="audit-list">
              {#each filteredLogs() as log}
                <div class="audit-entry {getEventTypeColor(log.event_type)}" data-testid="audit-entry">
                  <div class="entry-icon">{getEventTypeIcon(log.event_type)}</div>
                  <div class="entry-content">
                    <div class="entry-header">
                      <span class="event-type">{getEventTypeLabel(log.event_type)}</span>
                      <span class="task-ref">{getTaskTitle(log.task_id)}</span>
                      <span class="timestamp">{formatTime(log.timestamp)}</span>
                    </div>
                    {#if log.details}
                      {@const parsed = parseDetails(log.details)}
                      {#if parsed}
                        <div class="entry-details">
                          {#each Object.entries(parsed) as [key, value]}
                            <span class="detail-item">
                              <strong>{key}:</strong> {JSON.stringify(value)}
                            </span>
                          {/each}
                        </div>
                      {/if}
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}

      <div class="panel-footer">
        {#if activeTab === 'logs'}
          <span class="log-count">{filteredLogs().length} events</span>
        {:else if activeTab === 'health'}
          <span class="log-count">
            {getActiveIssues().length} active issues
            {#if getDeferredIssues().length > 0}
              , {getDeferredIssues().length} deferred
            {/if}
          </span>
        {:else}
          <span class="log-count">
            {getActiveDriftItems().length} active drift items
            {#if getDeferredDriftItems().length > 0}
              , {getDeferredDriftItems().length} deferred
            {/if}
          </span>
        {/if}
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
    max-width: 800px;
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

  .panel-filters {
    display: flex;
    gap: 16px;
    padding: 12px 20px;
    border-bottom: 1px solid var(--color-nerv-border, #333);
    background: rgba(0, 0, 0, 0.2);
    align-items: center;
    flex-wrap: wrap;
  }

  .filter-group {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .filter-group label {
    color: var(--color-nerv-text-secondary, #888);
    font-size: 0.875rem;
  }

  .filter-group select {
    background: var(--color-nerv-bg, #1a1a2e);
    border: 1px solid var(--color-nerv-border, #333);
    border-radius: 4px;
    color: var(--color-nerv-text, #fff);
    padding: 6px 10px;
    font-size: 0.875rem;
  }

  .panel-content {
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
  }

  .loading, .empty-state {
    text-align: center;
    padding: 40px 20px;
    color: var(--color-nerv-text-secondary, #888);
  }

  .empty-state .hint {
    font-size: 0.875rem;
    margin-top: 8px;
    opacity: 0.7;
  }

  .audit-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .audit-entry {
    display: flex;
    gap: 12px;
    padding: 12px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.03);
    border-left: 3px solid var(--color-nerv-border, #333);
  }

  .audit-entry.event-success {
    border-left-color: #4ade80;
    background: rgba(74, 222, 128, 0.05);
  }

  .audit-entry.event-warning {
    border-left-color: #f59e0b;
    background: rgba(245, 158, 11, 0.05);
  }

  .audit-entry.event-info {
    border-left-color: var(--color-nerv-primary, #00ff9f);
    background: rgba(0, 255, 159, 0.05);
  }

  .entry-icon {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    font-weight: bold;
    font-size: 0.75rem;
    color: var(--color-nerv-text, #fff);
    flex-shrink: 0;
  }

  .entry-content {
    flex: 1;
    min-width: 0;
  }

  .entry-header {
    display: flex;
    gap: 12px;
    align-items: center;
    margin-bottom: 4px;
    flex-wrap: wrap;
  }

  .event-type {
    font-weight: 500;
    color: var(--color-nerv-text, #fff);
  }

  .task-ref {
    font-size: 0.75rem;
    color: var(--color-nerv-text-secondary, #888);
    background: rgba(255, 255, 255, 0.1);
    padding: 2px 6px;
    border-radius: 3px;
  }

  .timestamp {
    font-size: 0.75rem;
    color: var(--color-nerv-text-secondary, #888);
    margin-left: auto;
  }

  .entry-details {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    font-size: 0.8rem;
    color: var(--color-nerv-text-secondary, #888);
    margin-top: 4px;
  }

  .detail-item {
    background: rgba(0, 0, 0, 0.3);
    padding: 2px 6px;
    border-radius: 3px;
  }

  .detail-item strong {
    color: var(--color-nerv-text, #fff);
  }

  .panel-footer {
    padding: 12px 20px;
    border-top: 1px solid var(--color-nerv-border, #333);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .log-count {
    color: var(--color-nerv-text-secondary, #888);
    font-size: 0.875rem;
  }

  /* Tab Buttons */
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

  /* Health Metrics */
  .health-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }

  .health-header h3 {
    margin: 0;
    color: var(--color-nerv-text, #fff);
    font-size: 1rem;
  }

  .health-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 12px;
    margin-bottom: 16px;
  }

  .health-metric {
    display: flex;
    gap: 12px;
    padding: 12px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 6px;
    border: 1px solid var(--color-nerv-border, #333);
  }

  .metric-icon {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    font-weight: bold;
    flex-shrink: 0;
  }

  .metric-icon.healthy {
    background: rgba(74, 222, 128, 0.2);
    color: #4ade80;
  }

  .metric-icon.unhealthy {
    background: rgba(245, 158, 11, 0.2);
    color: #f59e0b;
  }

  .metric-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .metric-label {
    font-size: 0.75rem;
    color: var(--color-nerv-text-secondary, #888);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .metric-value {
    font-size: 1.125rem;
    font-weight: 500;
    color: var(--color-nerv-text, #fff);
  }

  .metric-threshold {
    font-size: 0.7rem;
    color: var(--color-nerv-text-secondary, #888);
  }

  .last-checked {
    font-size: 0.75rem;
    color: var(--color-nerv-text-secondary, #888);
    text-align: right;
    margin-top: 8px;
  }

  /* Issues Section */
  .issues-section {
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid var(--color-nerv-border, #333);
  }

  .issues-section h4 {
    margin: 0 0 12px 0;
    color: var(--color-nerv-text, #fff);
    font-size: 0.875rem;
  }

  .issue-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 12px;
    margin-bottom: 8px;
    border-radius: 6px;
    border-left: 3px solid;
  }

  .issue-item.warning {
    background: rgba(245, 158, 11, 0.1);
    border-left-color: #f59e0b;
  }

  .issue-item.error {
    background: rgba(239, 68, 68, 0.1);
    border-left-color: #ef4444;
  }

  .issue-item.info {
    background: rgba(59, 130, 246, 0.1);
    border-left-color: #3b82f6;
  }

  .issue-content {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
  }

  .issue-title {
    font-weight: 500;
    color: var(--color-nerv-text, #fff);
  }

  .issue-description {
    font-size: 0.8rem;
    color: var(--color-nerv-text-secondary, #888);
  }

  .issue-actions {
    display: flex;
    gap: 8px;
    flex-shrink: 0;
    flex-wrap: wrap;
  }

  /* Spec Drift */
  .drift-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .drift-item {
    display: flex;
    gap: 12px;
    padding: 12px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.03);
    border-left: 3px solid;
  }

  .drift-item.warning {
    border-left-color: #f59e0b;
  }

  .drift-item.error {
    border-left-color: #ef4444;
  }

  .drift-item.info {
    border-left-color: #3b82f6;
  }

  .drift-icon {
    font-size: 1.25rem;
    flex-shrink: 0;
  }

  .drift-content {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
  }

  .drift-type {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-nerv-primary, #00ff9f);
  }

  .drift-description {
    color: var(--color-nerv-text, #fff);
  }

  .drift-actions {
    display: flex;
    gap: 8px;
    flex-shrink: 0;
    align-items: center;
    flex-wrap: wrap;
  }

  /* Deferred sections styling */
  .deferred-section {
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px dashed var(--color-nerv-border, #333);
  }

  .deferred-section h4 {
    margin: 0 0 12px 0;
    color: var(--color-nerv-text-secondary, #888);
    font-size: 0.8rem;
  }

  .issue-item.deferred,
  .drift-item.deferred {
    opacity: 0.6;
    border-left-color: var(--color-nerv-border, #333) !important;
    background: rgba(255, 255, 255, 0.01);
  }

  .issue-item.deferred:hover,
  .drift-item.deferred:hover {
    opacity: 0.8;
  }
</style>
