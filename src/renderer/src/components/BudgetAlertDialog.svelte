<script lang="ts">
  /**
   * Budget Alert Dialog (PRD Section 14)
   * Shows when budget thresholds are crossed with actionable options
   */
  import type { BudgetAlert } from '../../../shared/types'

  interface Props {
    alert: BudgetAlert
    onDismiss: () => void
    onAdjustBudget: () => void
    onSwitchModel: () => void
  }

  let { alert, onDismiss, onAdjustBudget, onSwitchModel }: Props = $props()

  function formatCost(cost: number): string {
    return `$${cost.toFixed(2)}`
  }

  function getAlertIcon(): string {
    return alert.type === 'critical' ? '🚨' : '⚠️'
  }

  function getPaceMessage(): string {
    if (alert.daysUntilExceeded === null) {
      return 'You are within budget.'
    }
    if (alert.daysUntilExceeded <= 0) {
      return 'Budget exceeded!'
    }
    return `At current pace, you'll exceed your budget in ${alert.daysUntilExceeded} days.`
  }
</script>

<div class="modal-backdrop" role="dialog" aria-labelledby="budget-alert-title">
  <div class="alert-dialog" class:critical={alert.type === 'critical'} class:warning={alert.type === 'warning'}>
    <header class="alert-header">
      <span class="alert-icon">{getAlertIcon()}</span>
      <h2 id="budget-alert-title">Budget Alert</h2>
    </header>

    <div class="alert-content">
      <p class="alert-message">{alert.message}</p>

      <p class="pace-message">{getPaceMessage()}</p>

      <div class="budget-visual">
        <div class="budget-bar-container">
          <div
            class="budget-bar"
            class:critical={alert.type === 'critical'}
            class:warning={alert.type === 'warning'}
            style="width: {Math.min((alert.currentSpend / alert.budgetLimit) * 100, 100)}%"
          ></div>
        </div>
        <div class="budget-labels">
          <span>{formatCost(alert.currentSpend)} spent</span>
          <span>{formatCost(alert.budgetLimit)} budget</span>
        </div>
      </div>

      <div class="options-section">
        <p class="options-title">Options:</p>
        <ul class="options-list">
          <li>Switch to a cheaper model (Sonnet instead of Opus)</li>
          <li>Increase monthly budget</li>
          <li>Enable cost-saving mode (smaller context windows)</li>
        </ul>
      </div>
    </div>

    <footer class="alert-actions">
      <button class="btn btn-primary" onclick={onAdjustBudget}>
        Adjust Budget
      </button>
      <button class="btn btn-secondary" onclick={onSwitchModel}>
        Switch Model
      </button>
      <button class="btn btn-ghost" onclick={onDismiss}>
        Dismiss
      </button>
    </footer>
  </div>
</div>

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
    z-index: 1100;
    animation: fadeIn 0.2s ease-out;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .alert-dialog {
    background: #12121a;
    border: 2px solid #2a2a3a;
    border-radius: 12px;
    width: 90%;
    max-width: 480px;
    overflow: hidden;
    animation: slideIn 0.2s ease-out;
  }

  @keyframes slideIn {
    from { transform: translateY(-20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }

  .alert-dialog.warning {
    border-color: #fbbf24;
  }

  .alert-dialog.critical {
    border-color: #ef4444;
  }

  .alert-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 16px 20px;
    border-bottom: 1px solid #2a2a3a;
  }

  .alert-icon {
    font-size: 24px;
  }

  .alert-header h2 {
    font-size: 18px;
    font-weight: 600;
    color: #e0e0e0;
    margin: 0;
  }

  .alert-content {
    padding: 20px;
  }

  .alert-message {
    font-size: 14px;
    color: #e0e0e0;
    margin: 0 0 12px 0;
    line-height: 1.5;
  }

  .pace-message {
    font-size: 13px;
    color: #fbbf24;
    margin: 0 0 16px 0;
    font-style: italic;
  }

  .critical .pace-message {
    color: #ef4444;
  }

  .budget-visual {
    margin-bottom: 20px;
  }

  .budget-bar-container {
    height: 12px;
    background: #1a1a24;
    border-radius: 6px;
    overflow: hidden;
    margin-bottom: 8px;
  }

  .budget-bar {
    height: 100%;
    background: #4ade80;
    border-radius: 6px;
    transition: width 0.3s ease;
  }

  .budget-bar.warning {
    background: #fbbf24;
  }

  .budget-bar.critical {
    background: #ef4444;
  }

  .budget-labels {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: #888;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  }

  .options-section {
    background: #0a0a0f;
    border-radius: 8px;
    padding: 12px;
  }

  .options-title {
    font-size: 13px;
    color: #888;
    margin: 0 0 8px 0;
  }

  .options-list {
    margin: 0;
    padding-left: 20px;
    font-size: 12px;
    color: #aaa;
    line-height: 1.6;
  }

  .options-list li {
    margin-bottom: 4px;
  }

  .alert-actions {
    display: flex;
    gap: 10px;
    padding: 16px 20px;
    border-top: 1px solid #2a2a3a;
    justify-content: flex-end;
  }

  .btn {
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
  }

  .btn-primary {
    background: #ff6b35;
    color: white;
  }

  .btn-primary:hover {
    background: #ff8c5a;
  }

  .btn-secondary {
    background: #2a2a3a;
    color: #e0e0e0;
    border: 1px solid #3a3a4a;
  }

  .btn-secondary:hover {
    background: #3a3a4a;
  }

  .btn-ghost {
    background: transparent;
    color: #888;
  }

  .btn-ghost:hover {
    color: #e0e0e0;
    background: rgba(255, 255, 255, 0.05);
  }
</style>
