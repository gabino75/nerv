<script lang="ts">
  import { onMount, onDestroy } from 'svelte'

  type NotificationType = 'hang' | 'loop' | 'compaction' | 'audit' | 'approval' | 'approval_waiting' | 'task_complete' | 'file_conflict'

  // Active notifications
  let notifications = $state<Array<{
    id: string
    type: NotificationType
    title: string
    message: string
    sessionId: string
    taskId: string
    timestamp: number
    actions?: Array<{ label: string; callback: () => void }>
  }>>([])

  // Notification ID counter
  let notificationId = 0

  // Audio context for notification sounds (PRD Section 30)
  let audioContext: AudioContext | null = null

  /**
   * Play an alert sound for high-priority notifications
   * Uses Web Audio API to generate a system beep sound
   * Called for 'hang' and 'loop' notifications per PRD Section 30
   */
  function playAlertSound(): void {
    try {
      // Initialize audio context on first use (must be after user interaction)
      if (!audioContext) {
        audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      }

      // Create oscillator for alert tone
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)

      // Configure alert sound: two-tone beep (attention-grabbing but not jarring)
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(880, audioContext.currentTime) // A5
      oscillator.frequency.setValueAtTime(660, audioContext.currentTime + 0.15) // E5

      // Fade in/out to avoid clicks
      gainNode.gain.setValueAtTime(0, audioContext.currentTime)
      gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.02)
      gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.25)
      gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.3)

      oscillator.start(audioContext.currentTime)
      oscillator.stop(audioContext.currentTime + 0.3)
    } catch (error) {
      // Audio playback failed (user may not have interacted with page yet)
      console.debug('[NERV] Alert sound playback failed:', error)
    }
  }

  // Add a notification
  function addNotification(
    type: NotificationType,
    title: string,
    message: string,
    sessionId: string,
    taskId: string,
    actions?: Array<{ label: string; callback: () => void }>
  ) {
    const id = `notification-${++notificationId}`
    notifications = [...notifications, {
      id,
      type,
      title,
      message,
      sessionId,
      taskId,
      timestamp: Date.now(),
      actions
    }]

    // Play alert sound for high-priority notifications (PRD Section 30)
    // Loop detected, Claude stuck, and approval waiting require sound alerts
    if (type === 'hang' || type === 'loop' || type === 'approval_waiting') {
      playAlertSound()
    }

    // Auto-dismiss info notifications after 10 seconds (except those with actions)
    if (type === 'audit' || type === 'task_complete') {
      setTimeout(() => {
        dismissNotification(id)
      }, 10000)
    }
    // Compaction notifications have actions, give 30 seconds like approvals
    if (type === 'compaction') {
      setTimeout(() => {
        dismissNotification(id)
      }, 30000)
    }
    // Auto-dismiss approval notifications after 30 seconds (longer since they require action)
    if (type === 'approval') {
      setTimeout(() => {
        dismissNotification(id)
      }, 30000)
    }
  }

  // Dismiss a notification
  function dismissNotification(id: string) {
    notifications = notifications.filter(n => n.id !== id)
  }

  // Event handlers
  // PRD Section 21 specifies actions: ['Kill', 'Keep Waiting', 'Branch']
  function handleHangDetected(sessionId: string, taskId: string, silentDuration: number) {
    const minutes = Math.round(silentDuration / 1000 / 60)
    addNotification(
      'hang',
      'Claude may be stuck',
      `No output for ${minutes}+ minutes. The session may need attention.`,
      sessionId,
      taskId,
      [
        { label: 'Kill', callback: () => window.api.claude.kill(sessionId) },
        { label: 'Keep Waiting', callback: () => {} },
        { label: 'Branch', callback: () => window.dispatchEvent(new CustomEvent('open-branching-dialog')) }
      ]
    )
  }

  function handleLoopDetected(sessionId: string, taskId: string, loopResult: LoopResult) {
    const message = loopResult.type === 'repetition'
      ? `Claude has attempted similar actions ${loopResult.count} times in the last 10 actions. This may indicate the approach isn't working or context needs human guidance.`
      : 'Claude appears to be oscillating between two actions. This may indicate the approach isn\'t working or context is missing key information.'

    addNotification(
      'loop',
      'Possible Loop Detected',
      message,
      sessionId,
      taskId,
      [
        { label: 'Branch Session', callback: () => window.dispatchEvent(new CustomEvent('open-branching-dialog')) },
        { label: 'Clear with Summary', callback: () => window.dispatchEvent(new CustomEvent('open-clear-with-summary-dialog')) },
        { label: 'Continue', callback: () => {} },
        { label: 'Stop Task', callback: () => window.api.claude.kill(sessionId) }
      ]
    )
  }

  // PRD Section 6: Show both session total and since-clear counts in compaction notification
  function handleCompactionNotice(sessionId: string, taskId: string, count: number, sinceClear: number) {
    addNotification(
      'compaction',
      'Context Compacted',
      `Claude Code automatically compacted the context window. This is normal for long sessions.\n\nCompactions this session: ${count}\nSince last /clear: ${sinceClear}\n\nIf Claude seems to be forgetting things or repeating itself, consider branching or clearing with a summary.`,
      sessionId,
      taskId,
      [
        { label: 'Continue', callback: () => {} },
        { label: 'Branch Session', callback: () => window.dispatchEvent(new CustomEvent('open-branching-dialog')) },
        { label: 'Clear with Summary', callback: () => window.dispatchEvent(new CustomEvent('open-clear-with-summary-dialog')) }
      ]
    )
  }

  function handleAuditTrigger(cycleNumber: number, projectId: string) {
    addNotification(
      'audit',
      'Audit Triggered',
      `Cycle ${cycleNumber} completed. It's time for a code health and spec drift check.`,
      '', // no session
      '', // no task
      [
        { label: 'Open Audit', callback: () => window.dispatchEvent(new CustomEvent('open-audit-panel', { detail: { projectId } })) },
        { label: 'Dismiss', callback: () => {} }
      ]
    )
  }

  function handleApprovalNeeded(data: { approvalId: number; taskId: string; toolName: string; toolInput?: string }) {
    // PRD Section 30: "Approval required for `rm -rf ./build`" - show command details
    let message = `Approval required for \`${data.toolName}\``
    if (data.toolInput) {
      // Truncate long inputs to keep notification readable
      const input = data.toolInput.length > 60 ? data.toolInput.substring(0, 57) + '...' : data.toolInput
      message = `Approval required for \`${data.toolName}\`: ${input}`
    }
    addNotification(
      'approval',
      'Permission Required',
      message,
      '', // no session
      data.taskId,
      [
        { label: 'Review', callback: () => window.dispatchEvent(new CustomEvent('focus-approval-queue')) }
      ]
    )
  }

  // PRD Section 30: Notify if approval pending for 5+ minutes
  function handleApprovalWaiting(approvalId: number, taskId: string, toolName: string, waitingDuration: number) {
    const minutes = Math.round(waitingDuration / 1000 / 60)
    addNotification(
      'approval_waiting',
      'Claude is still waiting',
      `Approval pending for "${toolName}" (${minutes}+ min). Claude cannot proceed until you respond.`,
      '', // no session
      taskId,
      [
        { label: 'Review Now', callback: () => window.dispatchEvent(new CustomEvent('focus-approval-queue')) }
      ]
    )
  }

  // PRD Section 30: "Task complete" notification with "Task T001 ready for review" message
  function handleTaskCompleted(data: { taskId: string; taskTitle: string; projectId: string }) {
    addNotification(
      'task_complete',
      'Task Ready for Review',
      `"${data.taskTitle}" is ready for review.`,
      '', // no session
      data.taskId
    )
  }

  /**
   * Handle file conflict detection (PRD Section 10)
   * When multiple sessions modify the same file, show a warning
   */
  function handleFileConflict(conflict: {
    sessionId: string
    filePath: string
    conflictingSessionId: string
    accessType: string
  }) {
    addNotification(
      'file_conflict',
      'File Conflict Detected',
      `Another session is modifying: ${conflict.filePath.split(/[\\/]/).pop()}`,
      conflict.sessionId,
      '', // no task
      [
        {
          label: 'Pause Other Session',
          callback: () => window.api.claude.pause(conflict.conflictingSessionId)
        },
        {
          label: 'Continue Anyway',
          callback: () => {}
        },
        {
          label: 'View Diff',
          callback: () => window.dispatchEvent(new CustomEvent('view-file-diff', { detail: { filePath: conflict.filePath } }))
        }
      ]
    )
  }

  // Set up event listeners
  onMount(() => {
    window.api.recovery.onHangDetected(handleHangDetected)
    window.api.recovery.onLoopDetected(handleLoopDetected)
    window.api.recovery.onCompactionNotice(handleCompactionNotice)
    window.api.recovery.onApprovalWaiting(handleApprovalWaiting)
    window.api.notifications.onApprovalNeeded(handleApprovalNeeded)
    window.api.notifications.onTaskCompleted(handleTaskCompleted)
    window.api.claude.onFileConflict(handleFileConflict)

    // Listen for audit trigger events from CyclePanel
    const auditHandler = (e: CustomEvent<{ cycleNumber: number; projectId: string }>) => {
      handleAuditTrigger(e.detail.cycleNumber, e.detail.projectId)
    }
    window.addEventListener('audit-trigger', auditHandler as EventListener)

    // Store cleanup function
    return () => {
      window.removeEventListener('audit-trigger', auditHandler as EventListener)
    }
  })

  // Clean up event listeners
  onDestroy(() => {
    window.api.recovery.removeAllListeners()
    window.api.notifications.removeAllListeners()
  })

  // Get icon for notification type
  function getIcon(type: NotificationType): string {
    switch (type) {
      case 'hang': return '⏳'
      case 'loop': return '🔄'
      case 'compaction': return '📦'
      case 'audit': return '📋'
      case 'approval': return '🔐'
      case 'approval_waiting': return '⏰'
      case 'task_complete': return '✓'
      case 'file_conflict': return '⚠️'
    }
  }

  // Get color class for notification type
  function getColorClass(type: NotificationType): string {
    switch (type) {
      case 'hang': return 'alert-hang'
      case 'loop': return 'alert-loop'
      case 'compaction': return 'alert-compaction'
      case 'audit': return 'alert-audit'
      case 'approval': return 'alert-approval'
      case 'approval_waiting': return 'alert-approval-waiting'
      case 'task_complete': return 'alert-task-complete'
      case 'file_conflict': return 'alert-file-conflict'
    }
  }
</script>

<div class="notifications-container" data-testid="alert-notifications">
  {#each notifications as notification (notification.id)}
    <div class="notification {getColorClass(notification.type)}" data-testid="alert-notification" data-notification-type={notification.type}>
      <div class="notification-icon">{getIcon(notification.type)}</div>
      <div class="notification-content">
        <h4 class="notification-title" data-testid="alert-title">{notification.title}</h4>
        <p class="notification-message" data-testid="alert-message">{notification.message}</p>
        {#if notification.actions && notification.actions.length > 0}
          <div class="notification-actions">
            {#each notification.actions as action}
              <button
                class="notification-btn"
                data-testid="alert-action-{action.label.toLowerCase().replace(/\s+/g, '-')}"
                onclick={() => {
                  action.callback()
                  dismissNotification(notification.id)
                }}
              >
                {action.label}
              </button>
            {/each}
          </div>
        {/if}
      </div>
      <button
        class="dismiss-btn"
        data-testid="alert-dismiss"
        onclick={() => dismissNotification(notification.id)}
        aria-label="Dismiss notification"
      >
        ×
      </button>
    </div>
  {/each}
</div>

<style>
  .notifications-container {
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 2100;
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: 400px;
    pointer-events: none;
  }

  .notification {
    background: #1a1a24;
    border: 1px solid #2a2a3a;
    border-radius: 8px;
    padding: 12px 16px;
    display: flex;
    gap: 12px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
    animation: slideIn 0.2s ease-out;
    pointer-events: auto;
  }

  @keyframes slideIn {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  .notification.alert-hang {
    border-left: 3px solid #d9534f;
  }

  .notification.alert-loop {
    border-left: 3px solid #f0ad4e;
  }

  .notification.alert-compaction {
    border-left: 3px solid #5bc0de;
  }

  .notification.alert-audit {
    border-left: 3px solid #9b59b6;
  }

  .notification.alert-approval {
    border-left: 3px solid #e67e22;
  }

  .notification.alert-approval-waiting {
    border-left: 3px solid #d9534f;
  }

  .notification.alert-task-complete {
    border-left: 3px solid #27ae60;
  }

  .notification.alert-file-conflict {
    border-left: 3px solid #f39c12;
  }

  .notification-icon {
    font-size: 20px;
    flex-shrink: 0;
  }

  .notification-content {
    flex: 1;
    min-width: 0;
  }

  .notification-title {
    font-size: 13px;
    font-weight: 600;
    color: #e0e0e0;
    margin-bottom: 4px;
  }

  .notification-message {
    font-size: 12px;
    color: #888;
    line-height: 1.4;
    margin-bottom: 8px;
  }

  .notification-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .notification-btn {
    padding: 4px 10px;
    border-radius: 4px;
    border: 1px solid #3a3a4a;
    background: #2a2a3a;
    color: #ccc;
    font-size: 11px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .notification-btn:hover {
    background: #3a3a4a;
    color: #fff;
  }

  .dismiss-btn {
    background: none;
    border: none;
    color: #666;
    font-size: 18px;
    cursor: pointer;
    padding: 0;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    border-radius: 4px;
    transition: all 0.15s ease;
  }

  .dismiss-btn:hover {
    color: #aaa;
    background: rgba(255, 255, 255, 0.1);
  }
</style>
