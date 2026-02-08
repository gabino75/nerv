<script lang="ts">
  import ClaudeMdEditor from './ClaudeMdEditor.svelte'
  import DocumentationSources from './DocumentationSources.svelte'
  import CustomAgentsEditor from './CustomAgentsEditor.svelte'

  // Props
  interface Props {
    projectId: string | null
    isOpen: boolean
    onClose: () => void
  }
  let { projectId, isOpen, onClose }: Props = $props()

  // State
  let activeTab = $state<'claude-md' | 'docs' | 'agents'>('claude-md')
</script>

{#if isOpen && projectId}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="overlay" onclick={onClose} role="dialog" aria-modal="true" tabindex="-1">
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="panel" onclick={(e) => e.stopPropagation()} role="presentation">
      <div class="panel-header">
        <h2>Knowledge Management</h2>
        <button class="btn-close" onclick={onClose} aria-label="Close panel">x</button>
      </div>

      <div class="tabs">
        <button
          class="tab"
          class:active={activeTab === 'claude-md'}
          onclick={() => activeTab = 'claude-md'}
        >
          CLAUDE.md
        </button>
        <button
          class="tab"
          class:active={activeTab === 'docs'}
          onclick={() => activeTab = 'docs'}
        >
          Documentation
        </button>
        <button
          class="tab"
          class:active={activeTab === 'agents'}
          onclick={() => activeTab = 'agents'}
          data-testid="agents-tab"
        >
          Agents
        </button>
      </div>

      <div class="panel-content">
        {#if activeTab === 'claude-md'}
          <ClaudeMdEditor {projectId} />
        {:else if activeTab === 'docs'}
          <DocumentationSources {projectId} />
        {:else if activeTab === 'agents'}
          <CustomAgentsEditor {projectId} />
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.75);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .panel {
    background: var(--color-surface, #12121a);
    border: 1px solid var(--color-border, #2a2a3a);
    border-radius: 8px;
    width: 95%;
    max-width: 800px;
    height: 85vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    border-bottom: 1px solid var(--color-border, #2a2a3a);
    background: var(--color-bg, #0a0a0f);
  }

  .panel-header h2 {
    margin: 0;
    font-size: 1.1rem;
    color: var(--color-primary, #ff6b35);
  }

  .btn-close {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1rem;
    border: 1px solid var(--color-border, #2a2a3a);
    border-radius: 4px;
    background: transparent;
    color: var(--color-muted, #666);
    cursor: pointer;
  }

  .btn-close:hover {
    color: var(--color-text, #e0e0e0);
    background: var(--color-surface, #12121a);
  }

  .tabs {
    display: flex;
    gap: 0;
    background: var(--color-bg, #0a0a0f);
    border-bottom: 1px solid var(--color-border, #2a2a3a);
  }

  .tab {
    flex: 1;
    padding: 0.75rem 1rem;
    font-size: 0.85rem;
    border: none;
    background: transparent;
    color: var(--color-muted, #666);
    cursor: pointer;
    transition: all 0.15s;
    border-bottom: 2px solid transparent;
  }

  .tab:hover {
    color: var(--color-text, #e0e0e0);
    background: var(--color-surface, #12121a);
  }

  .tab.active {
    color: var(--color-primary, #ff6b35);
    border-bottom-color: var(--color-primary, #ff6b35);
  }

  .panel-content {
    flex: 1;
    overflow: hidden;
  }
</style>
