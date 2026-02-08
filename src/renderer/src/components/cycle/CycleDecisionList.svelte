<script lang="ts">
  /**
   * CycleDecisionList - Displays decisions/ADRs within a cycle
   */

  import type { Decision } from '../../../../shared/types'
  import { Button } from '../shared'

  interface Props {
    decisions: Decision[]
    showAddButton?: boolean
    onAddClick?: () => void
    onDeleteDecision?: (decisionId: string) => void
  }

  let { decisions, showAddButton = false, onAddClick, onDeleteDecision }: Props = $props()
</script>

<div class="cycle-decisions">
  <h4>
    Decisions (ADRs)
    {#if showAddButton && onAddClick}
      <Button variant="small" onclick={onAddClick} testId="add-decision-btn">+ Add</Button>
    {/if}
  </h4>
  {#if decisions.length === 0}
    <p class="empty-text">No decisions recorded yet</p>
  {:else}
    <ul class="decision-list">
      {#each decisions as decision}
        <li class="decision-item">
          <div class="decision-header">
            <span class="decision-title">{decision.title}</span>
            {#if onDeleteDecision}
              <Button variant="delete" onclick={() => onDeleteDecision(decision.id)}>x</Button>
            {/if}
          </div>
          {#if decision.rationale}
            <p class="decision-rationale">{decision.rationale}</p>
          {/if}
          {#if decision.alternatives}
            <p class="decision-alternatives">Alternatives: {decision.alternatives}</p>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .cycle-decisions {
    margin-bottom: 16px;
  }

  .cycle-decisions h4 {
    font-size: 12px;
    color: #666;
    margin-bottom: 8px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .empty-text {
    font-size: 12px;
    color: #555;
    font-style: italic;
  }

  .decision-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .decision-item {
    background: #0f0f14;
    border: 1px solid #252530;
    border-radius: 4px;
    padding: 10px;
    margin-bottom: 8px;
  }

  .decision-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }

  .decision-title {
    font-size: 12px;
    font-weight: 500;
    color: #e0e0e0;
  }

  .decision-rationale {
    font-size: 11px;
    color: #888;
    margin-top: 6px;
    line-height: 1.4;
  }

  .decision-alternatives {
    font-size: 11px;
    color: #666;
    margin-top: 4px;
    font-style: italic;
  }
</style>
