<script lang="ts">
  /**
   * CycleHistoryItem - Single cycle history item that expands to show details
   */

  import type { Cycle, Task, Decision } from '../../../../shared/types'

  interface Props {
    cycle: Cycle
    isExpanded: boolean
    cycleData: { cycle: Cycle; tasks: Task[]; decisions: Decision[] } | null
    onToggle: () => void
  }

  let { cycle, isExpanded, cycleData, onToggle }: Props = $props()

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  function getStatusIcon(status: string): string {
    switch (status) {
      case 'done': return '[x]'
      case 'in_progress': return '[~]'
      case 'review': return '[?]'
      case 'interrupted': return '[!]'
      default: return '[ ]'
    }
  }
</script>

<li class="history-item" class:expanded={isExpanded} data-testid="cycle-history-item" data-cycle-number={cycle.cycle_number}>
  <button class="history-header" onclick={onToggle} data-testid="cycle-history-header">
    <span class="cycle-number">Cycle {cycle.cycle_number}</span>
    <span class="cycle-date">{formatDate(cycle.completed_at)}</span>
    <span class="expand-icon">{isExpanded ? 'v' : '>'}</span>
  </button>
  {#if isExpanded && cycleData}
    <div class="history-details" data-testid="cycle-history-details">
      {#if cycleData.cycle.goal}
        <p class="detail-label">Goal:</p>
        <p class="detail-text">{cycleData.cycle.goal}</p>
      {/if}
      {#if cycleData.cycle.learnings}
        <p class="detail-label">Learnings:</p>
        <p class="detail-text learnings" data-testid="cycle-history-learnings">{cycleData.cycle.learnings}</p>
      {/if}
      {#if cycleData.tasks.length > 0}
        <p class="detail-label">Tasks:</p>
        <ul class="detail-tasks">
          {#each cycleData.tasks as task}
            <li>{getStatusIcon(task.status)} {task.title}</li>
          {/each}
        </ul>
      {/if}
      {#if cycleData.decisions.length > 0}
        <p class="detail-label">Decisions:</p>
        <ul class="detail-decisions">
          {#each cycleData.decisions as decision}
            <li>
              <strong>{decision.title}</strong>
              {#if decision.rationale}
                <br/><span class="decision-rationale-small">{decision.rationale}</span>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</li>

<style>
  .history-item {
    border: 1px solid #252530;
    border-radius: 4px;
    margin-bottom: 8px;
    overflow: hidden;
  }

  .history-item.expanded {
    border-color: #3a3a4a;
  }

  .history-header {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 12px;
    background: #1a1a24;
    border: none;
    color: #ccc;
    cursor: pointer;
    font-size: 12px;
  }

  .history-header:hover {
    background: #1f1f2a;
  }

  .cycle-number {
    font-weight: 600;
    color: #e0e0e0;
  }

  .cycle-date {
    color: #666;
    font-size: 11px;
  }

  .expand-icon {
    color: #555;
    font-family: monospace;
  }

  .history-details {
    padding: 12px;
    background: #0f0f14;
    border-top: 1px solid #252530;
  }

  .detail-label {
    font-size: 11px;
    color: #666;
    text-transform: uppercase;
    margin-bottom: 4px;
    margin-top: 12px;
  }

  .detail-label:first-child {
    margin-top: 0;
  }

  .detail-text {
    font-size: 12px;
    color: #aaa;
    line-height: 1.5;
  }

  .detail-text.learnings {
    white-space: pre-wrap;
  }

  .detail-tasks, .detail-decisions {
    list-style: none;
    padding: 0;
    margin: 0;
    font-size: 12px;
    color: #888;
  }

  .detail-tasks li, .detail-decisions li {
    padding: 2px 0;
  }

  .decision-rationale-small {
    font-size: 11px;
    color: #666;
  }
</style>
