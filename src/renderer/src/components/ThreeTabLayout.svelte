<script lang="ts">
  // ThreeTabLayout - Primary 3-tab navigation (Spec / Kanban / CLIs)
  // Replaces the old dashboard grid + terminal layout with coherent tabs

  import type { Snippet } from 'svelte'

  type TabId = 'spec' | 'kanban' | 'clis'

  interface Props {
    activeTab?: TabId
    specTab: Snippet
    kanbanTab: Snippet
    clisTab: Snippet
    header: Snippet
    onTabChange?: (tab: TabId) => void
  }

  let { activeTab = 'kanban', specTab, kanbanTab, clisTab, header, onTabChange }: Props = $props()

  let currentTab = $state<TabId>(activeTab)

  function switchTab(tab: TabId) {
    currentTab = tab
    onTabChange?.(tab)
  }

  const TABS: { id: TabId; label: string; shortcut: string }[] = [
    { id: 'spec', label: 'Spec', shortcut: '1' },
    { id: 'kanban', label: 'Kanban', shortcut: '2' },
    { id: 'clis', label: 'CLIs', shortcut: '3' },
  ]
</script>

<div class="three-tab-layout" data-testid="three-tab-layout">
  <div class="layout-header">
    {@render header()}
    <nav class="tab-bar" data-testid="tab-bar">
      {#each TABS as tab}
        <button
          class="tab-btn"
          class:active={currentTab === tab.id}
          data-testid="tab-{tab.id}"
          onclick={() => switchTab(tab.id)}
          title="Switch to {tab.label} (Alt+{tab.shortcut})"
        >
          {tab.label}
        </button>
      {/each}
    </nav>
  </div>

  <div class="tab-content" data-testid="tab-content">
    <div class="tab-pane" class:visible={currentTab === 'spec'} data-testid="tab-pane-spec">
      {#if currentTab === 'spec'}
        {@render specTab()}
      {/if}
    </div>
    <div class="tab-pane" class:visible={currentTab === 'kanban'} data-testid="tab-pane-kanban">
      {@render kanbanTab()}
    </div>
    <div class="tab-pane" class:visible={currentTab === 'clis'} data-testid="tab-pane-clis">
      {#if currentTab === 'clis'}
        {@render clisTab()}
      {/if}
    </div>
  </div>
</div>

<svelte:window on:keydown={(e) => {
  if (e.altKey && !e.ctrlKey && !e.metaKey) {
    if (e.key === '1') { switchTab('spec'); e.preventDefault() }
    else if (e.key === '2') { switchTab('kanban'); e.preventDefault() }
    else if (e.key === '3') { switchTab('clis'); e.preventDefault() }
  }
}} />

<style>
  .three-tab-layout {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .layout-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
    gap: 12px;
    flex-wrap: wrap;
  }

  .tab-bar {
    display: flex;
    gap: 2px;
    background: var(--color-nerv-bg-dark, #050508);
    border-radius: var(--radius-nerv-md, 6px);
    padding: 3px;
    flex-shrink: 0;
  }

  .tab-btn {
    padding: 6px 20px;
    font-size: 13px;
    font-weight: 500;
    background: transparent;
    border: none;
    border-radius: var(--radius-nerv-sm, 4px);
    color: var(--color-nerv-text-muted, #888);
    cursor: pointer;
    transition: all var(--transition-nerv-fast, 0.15s ease);
    letter-spacing: 0.5px;
  }

  .tab-btn:hover:not(.active) {
    color: var(--color-nerv-text, #e0e0e0);
    background: var(--color-nerv-panel, #12121a);
  }

  .tab-btn.active {
    color: var(--color-nerv-primary, #ff6b35);
    background: var(--color-nerv-panel, #12121a);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  }

  .tab-content {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    position: relative;
  }

  .tab-pane {
    display: none;
    height: 100%;
    overflow: auto;
  }

  .tab-pane.visible {
    display: flex;
    flex-direction: column;
  }
</style>
