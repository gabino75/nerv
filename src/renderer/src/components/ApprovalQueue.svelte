<script lang="ts">
  /**
   * ApprovalQueue - Manages permission approval requests from Claude Code
   *
   * Features:
   * - Polls for new approval requests
   * - Approve/Deny with pattern-based rules
   * - Desktop notifications for pending approvals
   */

  import { onMount, onDestroy } from 'svelte'
  import { appStore, pendingApprovals } from '../stores/appState'
  import type { Approval } from '../stores/appState'
  import { ApprovalItem } from './approval'

  let approvals = $state<Approval[]>([])
  let expandedId: number | null = $state(null)
  let denyReason = $state('')
  let showPatternSelector = $state(false)
  let patternSuggestions = $state<string[]>([])
  let selectedPattern = $state<string | null>(null)
  let pendingAction: { id: number; type: 'allow' | 'deny' } | null = $state(null)
  let pollInterval: ReturnType<typeof setInterval> | null = null

  // Polling interval in ms (poll every 500ms for responsive approval handling)
  const POLL_INTERVAL = 500
  // Notification timing - notify if approval pending longer than 5 minutes (PRD Section 30)
  const NOTIFY_AFTER_MS = 5 * 60 * 1000 // 5 minutes

  // Track when we last notified to avoid spam
  let lastNotifiedIds = new Set<number>()

  pendingApprovals.subscribe(a => { approvals = a })

  onMount(() => {
    startPolling()

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  })

  onDestroy(() => {
    stopPolling()
  })

  function startPolling() {
    if (pollInterval) return
    pollInterval = setInterval(async () => {
      await appStore.refreshApprovals()
      checkPendingNotifications()
    }, POLL_INTERVAL)
  }

  function stopPolling() {
    if (pollInterval) {
      clearInterval(pollInterval)
      pollInterval = null
    }
  }

  function checkPendingNotifications() {
    const now = Date.now()
    for (const approval of approvals) {
      if (approval.status !== 'pending') continue

      const createdAt = new Date(approval.created_at).getTime()
      const waitTime = now - createdAt

      if (waitTime > NOTIFY_AFTER_MS && !lastNotifiedIds.has(approval.id)) {
        lastNotifiedIds.add(approval.id)
        showNotification(approval)
      }
    }
  }

  function showNotification(approval: Approval) {
    if ('Notification' in window && Notification.permission === 'granted') {
      const toolDisplay = formatToolInput(approval.tool_input || '')
      // PRD Section 30: "Permission waiting (5+ min)" notification message should be "Claude is still waiting"
      new Notification('NERV: Claude is still waiting', {
        body: `Approval needed for ${approval.tool_name}: ${toolDisplay}`,
        icon: '/icon.png',
        tag: `approval-${approval.id}`
      })
    }
  }

  function formatToolInput(input: string | null): string {
    if (!input) return '(no input)'
    try {
      const parsed = JSON.parse(input)
      if (parsed.command) return parsed.command
      if (parsed.file_path) return parsed.file_path
      return input.slice(0, 50) + (input.length > 50 ? '...' : '')
    } catch {
      return input.slice(0, 50) + (input.length > 50 ? '...' : '')
    }
  }

  function toggleExpand(id: number) {
    expandedId = expandedId === id ? null : id
    denyReason = ''
    showPatternSelector = false
    patternSuggestions = []
    selectedPattern = null
    pendingAction = null
  }

  async function handleApprove(id: number, always: boolean = false) {
    const approval = approvals.find(a => a.id === id)
    if (!approval) return

    if (always) {
      pendingAction = { id, type: 'allow' }
      await loadPatternSuggestions(approval)
      showPatternSelector = true
    } else {
      await appStore.resolveApproval(id, 'approved')
      expandedId = null
      lastNotifiedIds.delete(id)
    }
  }

  async function handleDeny(id: number, never: boolean = false) {
    const approval = approvals.find(a => a.id === id)
    if (!approval) return

    if (never) {
      pendingAction = { id, type: 'deny' }
      await loadPatternSuggestions(approval)
      showPatternSelector = true
    } else {
      await appStore.resolveApproval(id, 'denied', denyReason || undefined)
      expandedId = null
      denyReason = ''
      lastNotifiedIds.delete(id)
    }
  }

  async function loadPatternSuggestions(approval: Approval) {
    try {
      let toolInput: Record<string, unknown> = {}
      if (approval.tool_input) {
        try {
          toolInput = JSON.parse(approval.tool_input)
        } catch {
          toolInput = { command: approval.tool_input }
        }
      }

      const suggestions = await window.api.hooks.generatePatterns(approval.tool_name, toolInput)
      patternSuggestions = suggestions
      selectedPattern = suggestions.length > 0 ? suggestions[0] : null
    } catch (error) {
      console.error('Failed to generate pattern suggestions:', error)
      patternSuggestions = [approval.tool_name]
      selectedPattern = approval.tool_name
    }
  }

  async function confirmPatternSelection() {
    if (!pendingAction || !selectedPattern) return

    const { id, type } = pendingAction

    try {
      if (type === 'allow') {
        await window.api.hooks.addAllowRule(selectedPattern)
        await appStore.resolveApproval(id, 'approved')
      } else {
        await window.api.hooks.addDenyRule(selectedPattern)
        await appStore.resolveApproval(id, 'denied', denyReason || `Pattern blocked: ${selectedPattern}`)
      }
    } catch (error) {
      console.error('Failed to save permission rule:', error)
    }

    resetState(id)
  }

  function cancelPatternSelection() {
    showPatternSelector = false
    patternSuggestions = []
    selectedPattern = null
    pendingAction = null
  }

  function resetState(id: number) {
    expandedId = null
    denyReason = ''
    showPatternSelector = false
    patternSuggestions = []
    selectedPattern = null
    pendingAction = null
    lastNotifiedIds.delete(id)
  }
</script>

<section class="panel approval-queue" data-testid="approval-queue">
  <div class="panel-header">
    <h2>Approvals</h2>
    {#if approvals.length > 0}
      <span class="count-badge">{approvals.length}</span>
    {/if}
  </div>

  {#if approvals.length === 0}
    <div class="empty-state">
      <p>No pending approvals</p>
    </div>
  {:else}
    <div class="approval-list">
      {#each approvals as approval}
        <ApprovalItem
          {approval}
          isExpanded={expandedId === approval.id}
          {showPatternSelector}
          pendingActionType={pendingAction?.type ?? null}
          {patternSuggestions}
          {selectedPattern}
          {denyReason}
          onToggle={() => toggleExpand(approval.id)}
          onDenyReasonChange={(v) => denyReason = v}
          onSelectPattern={(p) => selectedPattern = p}
          onAlwaysAllow={() => handleApprove(approval.id, true)}
          onAllowOnce={() => handleApprove(approval.id, false)}
          onDenyOnce={() => handleDeny(approval.id, false)}
          onNeverAllow={() => handleDeny(approval.id, true)}
          onConfirmPattern={confirmPatternSelection}
          onCancelPattern={cancelPatternSelection}
        />
      {/each}
    </div>
  {/if}
</section>

<style>
  .panel {
    background: #12121a;
    border: 1px solid #2a2a3a;
    border-radius: 8px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow: hidden;
    min-height: 0;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }

  .panel-header h2 {
    font-size: 13px;
    font-weight: 600;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0;
  }

  @media (max-width: 600px) {
    .panel {
      padding: 8px;
      gap: 6px;
      border-radius: 6px;
    }
    .panel-header h2 {
      font-size: 11px;
    }
  }

  @media (max-height: 600px) {
    .panel {
      padding: 8px;
      gap: 6px;
    }
  }

  .count-badge {
    font-size: 11px;
    padding: 2px 8px;
    background: #ff6b35;
    border-radius: 10px;
    color: white;
    font-weight: 600;
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    min-height: 60px;
    color: #555;
    font-size: 12px;
  }

  @media (max-height: 600px) {
    .empty-state {
      min-height: 40px;
      font-size: 11px;
    }
  }

  .approval-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex: 1;
    overflow-y: auto;
  }
</style>
