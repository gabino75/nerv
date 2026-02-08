<script lang="ts">
  import { appStore, selectedModel, AVAILABLE_MODELS, MODEL_INFO } from '../stores/appState'
  import type { ModelName } from '../stores/appState'

  let currentModel = $state<ModelName>('sonnet')
  let isOpen = $state(false)
  let isRunning = $state(false)

  selectedModel.subscribe(m => { currentModel = m })
  appStore.subscribe(state => { isRunning = state.isTaskRunning })

  function selectModel(model: ModelName) {
    appStore.setModel(model)
    isOpen = false
  }

  function toggleDropdown() {
    if (!isRunning) {
      isOpen = !isOpen
    }
  }

  function closeDropdown() {
    isOpen = false
  }

  // Close dropdown when clicking outside
  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement
    if (!target.closest('.model-selector')) {
      isOpen = false
    }
  }
</script>

<svelte:window onclick={handleClickOutside} />

<div class="model-selector" class:disabled={isRunning} data-testid="model-selector">
  <button
    class="model-button"
    onclick={toggleDropdown}
    disabled={isRunning}
    title={isRunning ? 'Cannot change model while task is running' : 'Select model'}
    style="--model-color: {MODEL_INFO[currentModel].color}"
    data-testid="model-selector-button"
    data-current-model={currentModel}
  >
    <span class="model-name">{MODEL_INFO[currentModel].name}</span>
    <span class="dropdown-arrow" class:open={isOpen}>v</span>
  </button>

  {#if isOpen}
    <div class="dropdown-menu" data-testid="model-selector-dropdown">
      {#each AVAILABLE_MODELS as model}
        <button
          class="dropdown-item"
          class:selected={model === currentModel}
          onclick={() => selectModel(model)}
          style="--model-color: {MODEL_INFO[model].color}"
          data-testid="model-option-{model}"
        >
          <span class="item-indicator"></span>
          <div class="item-content">
            <span class="item-name">{MODEL_INFO[model].name}</span>
            <span class="item-description">{MODEL_INFO[model].description}</span>
          </div>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .model-selector {
    position: relative;
    display: inline-block;
  }

  .model-selector.disabled {
    opacity: 0.6;
  }

  .model-button {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    background: #12121a;
    border: 1px solid #2a2a3a;
    border-radius: 6px;
    color: var(--model-color, #ff6b35);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }

  .model-button:hover:not(:disabled) {
    background: #1a1a24;
    border-color: var(--model-color, #ff6b35);
  }

  .model-button:disabled {
    cursor: not-allowed;
  }

  .model-name {
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .dropdown-arrow {
    font-size: 10px;
    transition: transform 0.15s;
    color: #666;
  }

  .dropdown-arrow.open {
    transform: rotate(180deg);
  }

  .dropdown-menu {
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: 4px;
    min-width: 200px;
    background: #12121a;
    border: 1px solid #2a2a3a;
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    z-index: 100;
    overflow: hidden;
  }

  .dropdown-item {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    width: 100%;
    padding: 10px 14px;
    background: none;
    border: none;
    color: #e0e0e0;
    font-size: 13px;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s;
  }

  .dropdown-item:hover {
    background: #1a1a24;
  }

  .dropdown-item.selected {
    background: #1a1a28;
  }

  .item-indicator {
    width: 8px;
    height: 8px;
    margin-top: 4px;
    border-radius: 50%;
    background: var(--model-color, #666);
    opacity: 0.3;
  }

  .dropdown-item.selected .item-indicator {
    opacity: 1;
  }

  .item-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .item-name {
    font-weight: 600;
    color: var(--model-color, #e0e0e0);
  }

  .item-description {
    font-size: 11px;
    color: #666;
  }
</style>
