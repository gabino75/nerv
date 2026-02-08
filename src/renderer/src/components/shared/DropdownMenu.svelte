<script lang="ts">
  /**
   * DropdownMenu - Reusable header dropdown component
   *
   * Usage:
   * <DropdownMenu label="Settings" testId="settings-dropdown">
   *   {#snippet items()}
   *     <button class="dropdown-item" onclick={handleClick}>Item</button>
   *   {/snippet}
   * </DropdownMenu>
   */

  interface Props {
    label: string
    testId?: string
    disabled?: boolean
    items: import('svelte').Snippet
  }

  let { label, testId, disabled = false, items }: Props = $props()
  let isOpen = $state(false)

  function toggle() {
    if (!disabled) {
      isOpen = !isOpen
    }
  }

  function close() {
    isOpen = false
  }
</script>

<div class="dropdown-wrapper">
  <button
    class="btn-header dropdown-trigger"
    class:active={isOpen}
    data-testid={testId}
    onclick={toggle}
    {disabled}
  >
    {label}
    <span class="dropdown-arrow">{isOpen ? '\u25B4' : '\u25BE'}</span>
  </button>
  {#if isOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="dropdown-backdrop" onclick={close}></div>
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="dropdown-menu" data-testid={testId ? `${testId}-menu` : undefined} onclick={close}>
      {@render items()}
    </div>
  {/if}
</div>

<style>
  .dropdown-wrapper {
    position: relative;
  }

  .btn-header {
    padding: 6px 14px;
    font-size: 12px;
    background: #12121a;
    border: 1px solid #2a2a3a;
    border-radius: 4px;
    color: #888;
    cursor: pointer;
    transition: all 0.15s;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .btn-header:hover:not(:disabled) {
    background: #1a1a24;
    border-color: #ff6b35;
    color: #ff6b35;
  }

  .btn-header:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .btn-header.active {
    background: #1a1a24;
    border-color: #ff6b35;
    color: #ff6b35;
  }

  .dropdown-arrow {
    font-size: 9px;
    line-height: 1;
  }

  .dropdown-backdrop {
    position: fixed;
    inset: 0;
    z-index: 99;
  }

  .dropdown-menu {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 4px;
    background: #1a1a24;
    border: 1px solid #2a2a3a;
    border-radius: 6px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
    z-index: 100;
    min-width: 180px;
    overflow: hidden;
  }

  .dropdown-menu :global(.dropdown-item) {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 9px 14px;
    background: transparent;
    border: none;
    color: #e0e0e0;
    font-size: 13px;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s ease;
  }

  .dropdown-menu :global(.dropdown-item:hover:not(:disabled)) {
    background: #2a2a3a;
  }

  .dropdown-menu :global(.dropdown-item:disabled) {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .dropdown-menu :global(.dropdown-item:not(:last-child)) {
    border-bottom: 1px solid #1f1f2a;
  }

  .dropdown-menu :global(.dropdown-item .item-icon) {
    width: 16px;
    text-align: center;
    flex-shrink: 0;
    font-size: 11px;
  }
</style>
