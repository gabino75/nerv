<script lang="ts">
  /**
   * ApprovalItem - Single approval item with header and expand/collapse
   */

  import type { Approval } from '../../stores/appState'
  import ApprovalDetails from './ApprovalDetails.svelte'
  import PatternSelector from './PatternSelector.svelte'

  interface Props {
    approval: Approval
    isExpanded: boolean
    showPatternSelector: boolean
    pendingActionType: 'allow' | 'deny' | null
    patternSuggestions: string[]
    selectedPattern: string | null
    denyReason: string
    onToggle: () => void
    onDenyReasonChange: (value: string) => void
    onSelectPattern: (pattern: string) => void
    onAlwaysAllow: () => void
    onAllowOnce: () => void
    onDenyOnce: () => void
    onNeverAllow: () => void
    onConfirmPattern: () => void
    onCancelPattern: () => void
  }

  let {
    approval,
    isExpanded,
    showPatternSelector,
    pendingActionType,
    patternSuggestions,
    selectedPattern,
    denyReason,
    onToggle,
    onDenyReasonChange,
    onSelectPattern,
    onAlwaysAllow,
    onAllowOnce,
    onDenyOnce,
    onNeverAllow,
    onConfirmPattern,
    onCancelPattern
  }: Props = $props()

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

  function getToolColor(tool: string): string {
    switch (tool.toLowerCase()) {
      case 'bash': return 'var(--color-nerv-tool-bash)'
      case 'write': return 'var(--color-nerv-tool-write)'
      case 'edit': return 'var(--color-nerv-tool-edit)'
      case 'read': return 'var(--color-nerv-tool-read)'
      default: return 'var(--color-nerv-text-muted)'
    }
  }

  function getWaitTime(createdAt: string): string {
    const created = new Date(createdAt).getTime()
    const now = Date.now()
    const seconds = Math.floor((now - created) / 1000)

    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m`
    const hours = Math.floor(minutes / 60)
    return `${hours}h ${minutes % 60}m`
  }
</script>

<div class="approval-item" class:expanded={isExpanded}>
  <button class="approval-header" onclick={onToggle}>
    <span class="tool-badge" style="background: {getToolColor(approval.tool_name)}">
      {approval.tool_name}
    </span>
    <span class="approval-preview">{formatToolInput(approval.tool_input)}</span>
    <span class="wait-time">{getWaitTime(approval.created_at)}</span>
    <span class="expand-icon">{isExpanded ? '▼' : '▶'}</span>
  </button>

  {#if isExpanded}
    {#if showPatternSelector && pendingActionType}
      <div class="pattern-container">
        <PatternSelector
          type={pendingActionType}
          patterns={patternSuggestions}
          {selectedPattern}
          {onSelectPattern}
          onConfirm={onConfirmPattern}
          onCancel={onCancelPattern}
        />
      </div>
    {:else}
      <ApprovalDetails
        toolInput={approval.tool_input}
        context={approval.context}
        {denyReason}
        {onDenyReasonChange}
        {onAlwaysAllow}
        {onAllowOnce}
        {onDenyOnce}
        {onNeverAllow}
      />
    {/if}
  {/if}
</div>

<style>
  .approval-item {
    background: var(--color-nerv-panel-alt);
    border: 1px solid var(--color-nerv-border);
    border-radius: var(--radius-nerv-md);
    overflow: hidden;
  }

  .approval-item.expanded {
    border-color: var(--color-nerv-primary);
  }

  .approval-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    background: transparent;
    border: none;
    width: 100%;
    cursor: pointer;
    text-align: left;
    color: var(--color-nerv-text);
  }

  .approval-header:hover {
    background: var(--color-nerv-panel);
  }

  .tool-badge {
    font-size: 10px;
    padding: 2px 6px;
    border-radius: var(--radius-nerv-sm);
    color: white;
    font-weight: 600;
    text-transform: uppercase;
    flex-shrink: 0;
  }

  .approval-preview {
    flex: 1;
    font-size: 12px;
    font-family: 'SF Mono', Monaco, 'Courier New', monospace;
    color: var(--color-nerv-text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .wait-time {
    font-size: 10px;
    color: var(--color-nerv-text-dim);
    flex-shrink: 0;
  }

  .expand-icon {
    font-size: 10px;
    color: var(--color-nerv-text-dim);
  }

  .pattern-container {
    padding: 12px;
    border-top: 1px solid var(--color-nerv-border);
    background: var(--color-nerv-bg);
  }
</style>
