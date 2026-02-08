<script lang="ts">
  /**
   * LockedProjectDialog (PRD Section 11 - Multi-Instance Support)
   *
   * Shows when attempting to open a project that's already locked by another instance.
   * Provides options to: open read-only, focus other instance, force open, or cancel.
   */
  import type { InstanceInfo, LockedProjectAction } from '../../../shared/types'

  // Props
  interface Props {
    isOpen: boolean
    projectId: string
    projectName: string
    lockedBy: InstanceInfo | null
    isStale: boolean
    onAction: (action: LockedProjectAction) => void
  }

  let { isOpen, projectId, projectName, lockedBy, isStale, onAction }: Props = $props()

  // Loading state for force open
  let isForcing = $state(false)

  function handleAction(action: LockedProjectAction) {
    if (action === 'force-open') {
      isForcing = true
    }
    onAction(action)
  }

  function formatTime(dateStr: string): string {
    const date = new Date(dateStr)
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  }
</script>

{#if isOpen && lockedBy}
  <div class="overlay" role="dialog" aria-modal="true" aria-labelledby="locked-title" data-testid="locked-project-dialog">
    <div class="dialog">
      <header class="dialog-header">
        <span class="warning-icon">⚠️</span>
        <h2 id="locked-title">Project Already Open</h2>
      </header>

      <div class="dialog-body">
        <p class="project-name">"{projectName}"</p>
        <p class="description">
          {#if isStale}
            This project was opened by another NERV instance that is no longer responding.
            The lock may be stale.
          {:else}
            This project is currently open in another NERV instance.
          {/if}
        </p>

        <div class="instance-info">
          <div class="info-row">
            <span class="label">Instance:</span>
            <span class="value">{lockedBy.instanceId.substring(0, 8)}...</span>
          </div>
          <div class="info-row">
            <span class="label">Process ID:</span>
            <span class="value">{lockedBy.processId}</span>
          </div>
          <div class="info-row">
            <span class="label">Started:</span>
            <span class="value">{formatTime(lockedBy.startedAt)}</span>
          </div>
          <div class="info-row">
            <span class="label">Last Heartbeat:</span>
            <span class="value" class:stale={isStale}>
              {formatTime(lockedBy.lastHeartbeat)}
              {#if isStale}
                <span class="stale-badge">STALE</span>
              {/if}
            </span>
          </div>
        </div>
      </div>

      <div class="dialog-actions">
        <button
          class="action-btn cancel"
          onclick={() => handleAction('cancel')}
          data-testid="locked-cancel-btn"
        >
          Cancel
        </button>
        <button
          class="action-btn readonly"
          onclick={() => handleAction('open-readonly')}
          data-testid="locked-readonly-btn"
        >
          Open Read-Only
        </button>
        <button
          class="action-btn focus"
          onclick={() => handleAction('focus-other')}
          data-testid="locked-focus-btn"
        >
          Focus Other Instance
        </button>
        <button
          class="action-btn force"
          class:loading={isForcing}
          onclick={() => handleAction('force-open')}
          disabled={isForcing}
          data-testid="locked-force-btn"
        >
          {isForcing ? 'Forcing...' : 'Force Open'}
          <span class="risky-badge">Risky</span>
        </button>
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
    background: rgba(0, 0, 0, 0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
    backdrop-filter: blur(4px);
  }

  .dialog {
    background: #1a1a24;
    border: 1px solid #2a2a3a;
    border-radius: 12px;
    width: 90%;
    max-width: 480px;
    overflow: hidden;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  }

  .dialog-header {
    padding: 20px 24px;
    border-bottom: 1px solid #2a2a3a;
    background: linear-gradient(135deg, #1a1a24 0%, #252535 100%);
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .warning-icon {
    font-size: 24px;
  }

  .dialog-header h2 {
    font-size: 18px;
    font-weight: 600;
    color: #f0ad4e;
    margin: 0;
  }

  .dialog-body {
    padding: 20px 24px;
  }

  .project-name {
    font-size: 16px;
    font-weight: 500;
    color: #e0e0e0;
    margin: 0 0 12px 0;
  }

  .description {
    font-size: 13px;
    color: #888;
    margin: 0 0 20px 0;
    line-height: 1.5;
  }

  .instance-info {
    background: #0a0a0f;
    border: 1px solid #2a2a3a;
    border-radius: 8px;
    padding: 12px 16px;
  }

  .info-row {
    display: flex;
    justify-content: space-between;
    padding: 6px 0;
    font-size: 12px;
  }

  .info-row:not(:last-child) {
    border-bottom: 1px solid #1a1a24;
  }

  .label {
    color: #666;
  }

  .value {
    color: #aaa;
    font-family: monospace;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .value.stale {
    color: #f0ad4e;
  }

  .stale-badge {
    background: rgba(240, 173, 78, 0.2);
    color: #f0ad4e;
    font-size: 9px;
    padding: 2px 6px;
    border-radius: 4px;
    font-weight: 600;
  }

  .dialog-actions {
    padding: 16px 24px;
    border-top: 1px solid #2a2a3a;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .action-btn {
    padding: 10px 16px;
    border-radius: 6px;
    border: none;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .action-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .action-btn.cancel {
    background: transparent;
    color: #888;
    border: 1px solid #3a3a4a;
  }

  .action-btn.cancel:hover {
    background: rgba(255, 255, 255, 0.05);
    color: #aaa;
  }

  .action-btn.readonly {
    background: #2a2a3a;
    color: #e0e0e0;
  }

  .action-btn.readonly:hover {
    background: #3a3a4a;
  }

  .action-btn.focus {
    background: #2563eb;
    color: #e0e0e0;
  }

  .action-btn.focus:hover {
    background: #3b82f6;
  }

  .action-btn.force {
    background: transparent;
    color: #d9534f;
    border: 1px solid #d9534f;
  }

  .action-btn.force:hover:not(:disabled) {
    background: rgba(217, 83, 79, 0.1);
  }

  .action-btn.force.loading {
    border-color: #888;
    color: #888;
  }

  .risky-badge {
    background: rgba(217, 83, 79, 0.2);
    color: #d9534f;
    font-size: 9px;
    padding: 2px 6px;
    border-radius: 4px;
    font-weight: 600;
  }
</style>
