<script lang="ts">
  /**
   * ReviewModeToggle - Toggle between Normal and YOLO review modes (PRD Review Modes section)
   *
   * Normal mode: Human reviews code changes before merge (default)
   * YOLO mode: AI reviews and auto-merges if tests pass
   */

  import type { ReviewMode } from '../../../shared/types'

  interface Props {
    projectId: string | null
    reviewMode: ReviewMode
    onModeChange: (mode: ReviewMode) => void
    disabled?: boolean
  }

  let { projectId, reviewMode, onModeChange, disabled = false }: Props = $props()

  function handleToggle() {
    if (disabled || !projectId) return
    const newMode: ReviewMode = reviewMode === 'normal' ? 'yolo' : 'normal'
    onModeChange(newMode)
  }
</script>

<div class="review-mode-toggle" data-testid="review-mode-toggle">
  <span class="toggle-label">Review Mode:</span>
  <button
    class="toggle-btn"
    class:yolo={reviewMode === 'yolo'}
    onclick={handleToggle}
    disabled={disabled || !projectId}
    title={reviewMode === 'normal'
      ? 'Normal mode: Human reviews before merge. Click to enable YOLO mode.'
      : 'YOLO mode: AI reviews and auto-merges if tests pass. Click for normal mode.'}
    data-testid="review-mode-btn"
  >
    <span class="toggle-option" class:active={reviewMode === 'normal'}>Normal</span>
    <span class="toggle-slider" class:yolo={reviewMode === 'yolo'}></span>
    <span class="toggle-option" class:active={reviewMode === 'yolo'}>YOLO</span>
  </button>
  {#if reviewMode === 'yolo'}
    <span class="yolo-indicator" title="AI will auto-review and merge if tests pass">AI Review</span>
  {/if}
</div>

<style>
  .review-mode-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
  }

  .toggle-label {
    color: var(--color-nerv-text-secondary, #888);
    font-weight: 500;
  }

  .toggle-btn {
    display: flex;
    align-items: center;
    gap: 0;
    padding: 2px 4px;
    background: var(--color-nerv-bg-light, #12121a);
    border: 1px solid var(--color-nerv-border, #333);
    border-radius: 16px;
    cursor: pointer;
    position: relative;
    transition: all 0.2s;
  }

  .toggle-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .toggle-btn:not(:disabled):hover {
    border-color: var(--color-nerv-primary, #00ff9f);
  }

  .toggle-btn.yolo {
    border-color: #f59e0b;
    background: rgba(245, 158, 11, 0.1);
  }

  .toggle-option {
    padding: 4px 10px;
    color: var(--color-nerv-text-secondary, #666);
    font-size: 11px;
    font-weight: 500;
    z-index: 1;
    transition: color 0.2s;
  }

  .toggle-option.active {
    color: var(--color-nerv-text, #fff);
  }

  .toggle-slider {
    position: absolute;
    top: 2px;
    left: 2px;
    width: calc(50% - 2px);
    height: calc(100% - 4px);
    background: var(--color-nerv-primary, #00ff9f);
    border-radius: 12px;
    transition: all 0.2s;
    opacity: 0.3;
  }

  .toggle-slider.yolo {
    left: calc(50%);
    background: #f59e0b;
  }

  .yolo-indicator {
    padding: 2px 6px;
    background: #f59e0b;
    color: #000;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
  }

  @media (max-width: 600px) {
    .review-mode-toggle {
      font-size: 10px;
      gap: 4px;
    }

    .toggle-option {
      padding: 3px 6px;
      font-size: 10px;
    }
  }
</style>
