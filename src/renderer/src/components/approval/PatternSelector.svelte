<script lang="ts">
  /**
   * PatternSelector - Pattern selection for Always Allow/Never Allow
   * PRD Section 8: User can edit or select from suggestions
   */

  interface Props {
    type: 'allow' | 'deny'
    patterns: string[]
    selectedPattern: string | null
    onSelectPattern: (pattern: string) => void
    onConfirm: () => void
    onCancel: () => void
  }

  let { type, patterns, selectedPattern, onSelectPattern, onConfirm, onCancel }: Props = $props()

  let isAllow = $derived(type === 'allow')
  let useCustomPattern = $state(false)
  let customPattern = $state('')

  function handleCustomToggle() {
    useCustomPattern = !useCustomPattern
    if (useCustomPattern && customPattern) {
      onSelectPattern(customPattern)
    } else if (!useCustomPattern && patterns.length > 0) {
      onSelectPattern(patterns[0])
    }
  }

  function handleCustomInput(e: Event) {
    const value = (e.target as HTMLInputElement).value
    customPattern = value
    if (useCustomPattern && value) {
      onSelectPattern(value)
    }
  }
</script>

<div class="pattern-selector">
  <div class="pattern-header">
    <span class="pattern-icon" class:allow={isAllow} class:deny={!isAllow}>
      {isAllow ? '✓' : '✕'}
    </span>
    <span class="pattern-title">
      {isAllow ? 'Select Allow Pattern' : 'Select Deny Pattern'}
    </span>
  </div>

  <p class="pattern-description">
    {isAllow
      ? 'This pattern will be automatically allowed in the future:'
      : 'This pattern will be automatically blocked in the future:'}
  </p>

  <div class="pattern-options">
    {#each patterns as pattern, index}
      <label class="pattern-option" class:selected={selectedPattern === pattern && !useCustomPattern}>
        <input
          type="radio"
          name="pattern"
          value={pattern}
          checked={selectedPattern === pattern && !useCustomPattern}
          onchange={() => { useCustomPattern = false; onSelectPattern(pattern); }}
        />
        <span class="pattern-text">
          {pattern}
          {#if index === 0}
            <span class="pattern-hint">(exact match)</span>
          {:else if pattern.endsWith(':*)')}
            <span class="pattern-hint">(wildcard)</span>
          {/if}
        </span>
      </label>
    {/each}

    <!-- Custom pattern option per PRD Section 8 -->
    <label class="pattern-option custom-option" class:selected={useCustomPattern}>
      <input
        type="radio"
        name="pattern"
        checked={useCustomPattern}
        onchange={handleCustomToggle}
      />
      <span class="pattern-text">
        Custom pattern
        <span class="pattern-hint">(edit manually)</span>
      </span>
    </label>

    {#if useCustomPattern}
      <div class="custom-input-wrapper">
        <input
          type="text"
          class="custom-pattern-input"
          value={customPattern}
          oninput={handleCustomInput}
          placeholder="e.g., Bash(npm:*)"
          data-testid="custom-pattern-input"
        />
        <p class="custom-hint">
          Use * as wildcard. Example: Bash(npm:*) matches any npm command.
        </p>
      </div>
    {/if}
  </div>

  <div class="pattern-actions">
    <button class="action-btn pattern-confirm" onclick={onConfirm}>
      {isAllow ? 'Allow Pattern' : 'Block Pattern'}
    </button>
    <button class="action-btn pattern-cancel" onclick={onCancel}>
      Cancel
    </button>
  </div>
</div>

<style>
  .pattern-selector {
    padding: 4px;
  }

  .pattern-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
  }

  .pattern-icon {
    font-size: 16px;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
  }

  .pattern-icon.allow {
    background: var(--color-nerv-success-bg);
    color: var(--color-nerv-success);
  }

  .pattern-icon.deny {
    background: var(--color-nerv-error-bg);
    color: var(--color-nerv-error);
  }

  .pattern-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--color-nerv-text);
  }

  .pattern-description {
    font-size: 12px;
    color: var(--color-nerv-text-muted);
    margin: 0 0 12px 0;
  }

  .pattern-options {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 16px;
  }

  .pattern-option {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    background: var(--color-nerv-panel);
    border: 1px solid var(--color-nerv-border);
    border-radius: var(--radius-nerv-sm);
    cursor: pointer;
    transition: all var(--transition-nerv-fast);
  }

  .pattern-option:hover {
    border-color: var(--color-nerv-border-hover);
  }

  .pattern-option.selected {
    border-color: var(--color-nerv-primary);
    background: var(--color-nerv-panel-hover);
  }

  .pattern-option input[type="radio"] {
    accent-color: var(--color-nerv-primary);
  }

  .pattern-text {
    font-family: 'SF Mono', Monaco, 'Courier New', monospace;
    font-size: 12px;
    color: var(--color-nerv-text);
    flex: 1;
  }

  .pattern-hint {
    font-family: system-ui, sans-serif;
    font-size: 10px;
    color: var(--color-nerv-text-dim);
    margin-left: 8px;
  }

  .pattern-actions {
    display: flex;
    gap: 8px;
  }

  .action-btn {
    flex: 1;
    padding: 8px 12px;
    border: none;
    border-radius: var(--radius-nerv-sm);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--transition-nerv-fast);
  }

  .pattern-confirm {
    background: var(--color-nerv-primary);
    color: white;
  }

  .pattern-confirm:hover {
    background: var(--color-nerv-primary-hover);
  }

  .pattern-cancel {
    background: var(--color-nerv-border);
    color: var(--color-nerv-text-muted);
  }

  .pattern-cancel:hover {
    background: var(--color-nerv-border-hover);
    color: var(--color-nerv-text);
  }

  .custom-option {
    border-style: dashed;
  }

  .custom-input-wrapper {
    margin-left: 32px;
    margin-top: -4px;
  }

  .custom-pattern-input {
    width: 100%;
    padding: 8px 12px;
    font-family: 'SF Mono', Monaco, 'Courier New', monospace;
    font-size: 12px;
    background: var(--color-nerv-bg);
    border: 1px solid var(--color-nerv-border);
    border-radius: var(--radius-nerv-sm);
    color: var(--color-nerv-text);
  }

  .custom-pattern-input:focus {
    outline: none;
    border-color: var(--color-nerv-primary);
  }

  .custom-pattern-input::placeholder {
    color: var(--color-nerv-text-dim);
  }

  .custom-hint {
    font-size: 10px;
    color: var(--color-nerv-text-dim);
    margin: 4px 0 0 0;
  }
</style>
