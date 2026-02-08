<script lang="ts">
  /**
   * FormGroup - Reusable form field wrapper component
   *
   * Usage:
   * <FormGroup label="Project Name" id="project-name">
   *   <input id="project-name" type="text" bind:value={name} />
   * </FormGroup>
   */

  interface Props {
    label: string
    id?: string
    children?: import('svelte').Snippet
  }

  let { label, id, children }: Props = $props()
</script>

<div class="form-group">
  <label for={id}>{label}</label>
  {#if children}
    {@render children()}
  {/if}
</div>

<style>
  .form-group {
    margin-bottom: 14px;
  }

  .form-group label {
    display: block;
    font-size: 12px;
    color: var(--color-nerv-text-muted);
    margin-bottom: 6px;
  }

  .form-group :global(input),
  .form-group :global(textarea) {
    width: 100%;
    padding: 10px;
    background: var(--color-nerv-bg);
    border: 1px solid var(--color-nerv-border);
    border-radius: var(--radius-nerv-sm);
    color: var(--color-nerv-text);
    font-size: 13px;
    font-family: inherit;
    resize: vertical;
  }

  .form-group :global(input:focus),
  .form-group :global(textarea:focus) {
    outline: none;
    border-color: var(--color-nerv-primary);
  }
</style>
