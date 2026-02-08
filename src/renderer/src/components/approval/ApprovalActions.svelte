<script lang="ts">
  /**
   * ApprovalActions - The four approval action buttons
   */

  interface Props {
    onAlwaysAllow: () => void
    onAllowOnce: () => void
    onDenyOnce: () => void
    onNeverAllow: () => void
  }

  let { onAlwaysAllow, onAllowOnce, onDenyOnce, onNeverAllow }: Props = $props()
</script>

<div class="approval-actions">
  <button class="action-btn allow-always" data-testid="approval-always-allow" onclick={onAlwaysAllow}>
    Always Allow
  </button>
  <button class="action-btn allow-once" data-testid="approval-allow-once" onclick={onAllowOnce}>
    Just Once
  </button>
  <button class="action-btn deny-once" data-testid="approval-deny-once" onclick={onDenyOnce}>
    Deny
  </button>
  <button class="action-btn deny-never" data-testid="approval-never-allow" onclick={onNeverAllow}>
    Never Allow
  </button>
</div>

<style>
  .approval-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    margin-top: 12px;
  }

  .action-btn {
    padding: 8px 12px;
    border: none;
    border-radius: var(--radius-nerv-sm);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--transition-nerv-fast);
  }

  .allow-always {
    background: var(--color-nerv-success-bg);
    color: var(--color-nerv-success);
  }

  .allow-always:hover {
    background: var(--color-nerv-success-bg-hover);
  }

  .allow-once {
    background: var(--color-nerv-info-bg);
    color: var(--color-nerv-info);
  }

  .allow-once:hover {
    background: var(--color-nerv-info-bg-hover);
  }

  .deny-once {
    background: var(--color-nerv-warning-bg);
    color: var(--color-nerv-warning);
  }

  .deny-once:hover {
    background: var(--color-nerv-warning-bg-hover);
  }

  .deny-never {
    background: var(--color-nerv-error-bg);
    color: var(--color-nerv-error);
  }

  .deny-never:hover {
    background: var(--color-nerv-error-bg-hover);
  }
</style>
