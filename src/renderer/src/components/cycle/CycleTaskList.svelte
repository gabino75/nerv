<script lang="ts">
  /**
   * CycleTaskList - Displays tasks within a cycle
   */

  import type { Task } from '../../../../shared/types'

  interface Props {
    tasks: Task[]
    showBadges?: boolean
  }

  let { tasks, showBadges = true }: Props = $props()

  function getStatusIcon(status: string): string {
    switch (status) {
      case 'done': return '[x]'
      case 'in_progress': return '[~]'
      case 'review': return '[?]'
      case 'interrupted': return '[!]'
      default: return '[ ]'
    }
  }

  let progress = $derived({
    done: tasks.filter(t => t.status === 'done').length,
    total: tasks.length
  })
</script>

<div class="cycle-tasks">
  <h4>Tasks ({progress.done}/{progress.total})</h4>
  {#if tasks.length === 0}
    <p class="empty-text">No tasks in this cycle yet</p>
  {:else}
    <ul class="task-list">
      {#each tasks as task}
        <li class="task-item">
          <span class="task-status">{getStatusIcon(task.status)}</span>
          <span class="task-title">{task.title}</span>
          {#if showBadges && task.task_type === 'research'}
            <span class="task-badge research">Research</span>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .cycle-tasks {
    margin-bottom: 16px;
  }

  .cycle-tasks h4 {
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

  .task-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .task-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
    font-size: 12px;
  }

  .task-status {
    font-family: monospace;
    color: #666;
  }

  .task-title {
    color: #ccc;
  }

  .task-badge {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 8px;
    background: rgba(100, 100, 255, 0.2);
    color: #8888ff;
  }
</style>
