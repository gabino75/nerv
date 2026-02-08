<script lang="ts">
  /**
   * ApprovalDetails - Expanded approval details with command, context, and deny reason
   */

  interface Props {
    toolInput: string | null
    context: string | null
    denyReason: string
    onDenyReasonChange: (value: string) => void
    onAlwaysAllow: () => void
    onAllowOnce: () => void
    onDenyOnce: () => void
    onNeverAllow: () => void
  }

  let {
    toolInput,
    context,
    denyReason,
    onDenyReasonChange,
    onAlwaysAllow,
    onAllowOnce,
    onDenyOnce,
    onNeverAllow
  }: Props = $props()

  import ApprovalActions from './ApprovalActions.svelte'
</script>

<div class="approval-details">
  <div class="detail-section">
    <!-- svelte-ignore a11y_label_has_associated_control -->
    <label>Command</label>
    <code class="command-display">{toolInput}</code>
  </div>

  {#if context}
    <div class="detail-section">
      <!-- svelte-ignore a11y_label_has_associated_control -->
      <label>Context</label>
      <p class="context-text">{context}</p>
    </div>
  {/if}

  <div class="detail-section">
    <label for="deny-reason">Deny reason (optional)</label>
    <input
      id="deny-reason"
      type="text"
      value={denyReason}
      oninput={(e) => onDenyReasonChange(e.currentTarget.value)}
      placeholder="Explain why this should be denied..."
    />
  </div>

  <ApprovalActions
    {onAlwaysAllow}
    {onAllowOnce}
    {onDenyOnce}
    {onNeverAllow}
  />
</div>

<style>
  .approval-details {
    padding: 12px;
    border-top: 1px solid var(--color-nerv-border);
    background: var(--color-nerv-bg);
  }

  .detail-section {
    margin-bottom: 12px;
  }

  .detail-section label {
    display: block;
    font-size: 11px;
    color: var(--color-nerv-text-dim);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
  }

  .command-display {
    display: block;
    padding: 8px 10px;
    background: var(--color-nerv-panel);
    border-radius: var(--radius-nerv-sm);
    font-size: 12px;
    font-family: 'SF Mono', Monaco, 'Courier New', monospace;
    color: var(--color-nerv-text);
    word-break: break-all;
    white-space: pre-wrap;
  }

  .context-text {
    font-size: 12px;
    color: var(--color-nerv-text-muted);
    line-height: 1.4;
    margin: 0;
  }

  .detail-section input {
    width: 100%;
    padding: 8px 10px;
    background: var(--color-nerv-panel);
    border: 1px solid var(--color-nerv-border);
    border-radius: var(--radius-nerv-sm);
    color: var(--color-nerv-text);
    font-size: 12px;
  }

  .detail-section input:focus {
    outline: none;
    border-color: var(--color-nerv-primary);
  }
</style>
