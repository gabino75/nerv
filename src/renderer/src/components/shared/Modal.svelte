<script lang="ts">
  /**
   * Modal - Reusable modal dialog component
   *
   * Usage:
   * <Modal isOpen={showModal} onClose={() => showModal = false} title="My Modal">
   *   <p>Modal content here</p>
   *   <svelte:fragment slot="actions">
   *     <button onclick={close}>Cancel</button>
   *     <button onclick={submit}>Submit</button>
   *   </svelte:fragment>
   * </Modal>
   */

  interface Props {
    isOpen: boolean
    onClose: () => void
    title: string
    children?: import('svelte').Snippet
    actions?: import('svelte').Snippet
    hint?: string
  }

  let { isOpen, onClose, title, children, actions, hint }: Props = $props()

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose()
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="modal-overlay" onclick={onClose} role="dialog" aria-modal="true" tabindex="-1">
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="modal" onclick={(e) => e.stopPropagation()} role="presentation">
      <h3>{title}</h3>

      {#if children}
        {@render children()}
      {/if}

      {#if hint}
        <p class="form-hint">{hint}</p>
      {/if}

      {#if actions}
        <div class="modal-actions">
          {@render actions()}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--z-nerv-modal);
  }

  .modal {
    background: var(--color-nerv-panel);
    border: 1px solid var(--color-nerv-border);
    border-radius: var(--radius-nerv-lg);
    padding: 20px;
    width: 450px;
    max-width: 90vw;
    max-height: 85vh;
    overflow-y: auto;
  }

  .modal h3 {
    font-size: 15px;
    color: var(--color-nerv-text);
    margin: 0 0 16px 0;
  }

  .form-hint {
    font-size: 11px;
    color: var(--color-nerv-text-dim);
    margin-bottom: 16px;
    font-style: italic;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--color-nerv-border);
  }
</style>
