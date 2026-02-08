<script lang="ts">
  /**
   * Button - Reusable button component with variants
   *
   * Usage:
   * <Button variant="primary" onclick={handleClick}>Submit</Button>
   * <Button variant="secondary" disabled={loading}>Cancel</Button>
   * <Button variant="small" onclick={addItem}>+ Add</Button>
   * <Button variant="delete" onclick={remove}>x</Button>
   */

  interface Props {
    variant?: 'primary' | 'secondary' | 'small' | 'delete' | 'add'
    disabled?: boolean
    type?: 'button' | 'submit' | 'reset'
    onclick?: (e: MouseEvent) => void
    testId?: string
    children?: import('svelte').Snippet
  }

  let {
    variant = 'secondary',
    disabled = false,
    type = 'button',
    onclick,
    testId,
    children
  }: Props = $props()
</script>

<button
  class="btn btn-{variant}"
  {type}
  {disabled}
  {onclick}
  data-testid={testId}
>
  {#if children}
    {@render children()}
  {/if}
</button>

<style>
  .btn {
    cursor: pointer;
    transition: all var(--transition-nerv-fast);
    font-family: inherit;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-primary {
    padding: 8px 16px;
    background: var(--color-nerv-primary);
    border: none;
    border-radius: var(--radius-nerv-sm);
    color: white;
    font-size: 12px;
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--color-nerv-primary-hover);
  }

  .btn-secondary {
    padding: 8px 16px;
    background: transparent;
    border: 1px solid var(--color-nerv-border-hover);
    border-radius: var(--radius-nerv-sm);
    color: var(--color-nerv-text-muted);
    font-size: 12px;
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--color-nerv-panel-hover);
    border-color: var(--color-nerv-text-dim);
  }

  .btn-small {
    font-size: 11px;
    padding: 3px 8px;
    background: var(--color-nerv-panel-hover);
    border: 1px solid var(--color-nerv-border-hover);
    border-radius: var(--radius-nerv-sm);
    color: var(--color-nerv-text-muted);
  }

  .btn-small:hover:not(:disabled) {
    background: var(--color-nerv-border);
    color: var(--color-nerv-primary);
    border-color: var(--color-nerv-primary);
  }

  .btn-delete {
    background: none;
    border: none;
    color: var(--color-nerv-text-dim);
    font-size: 14px;
    padding: 0 4px;
  }

  .btn-delete:hover:not(:disabled) {
    color: var(--color-nerv-error);
  }

  .btn-add {
    padding: 6px 12px;
    background: transparent;
    border: 1px dashed var(--color-nerv-border-hover);
    border-radius: var(--radius-nerv-sm);
    color: var(--color-nerv-text-dim);
    font-size: 12px;
  }

  .btn-add:hover:not(:disabled) {
    border-color: var(--color-nerv-primary);
    color: var(--color-nerv-primary);
  }
</style>
