<script lang="ts">
  /**
   * Repository Context Panel (PRD Section 25: Repository Management)
   * Displays context files discovered from repository scanning (CLAUDE.md, skills, etc.)
   * Shows last scanned time, counts, and provides rescan/view functionality.
   */
  import { onMount } from 'svelte'
  import type { Repo } from '../../../shared/types'

  interface RepoContext {
    id: string
    repo_id: string
    context_type: string
    file_path: string
    content: string
    parsed_sections: string | null
    last_scanned_at: number
    file_hash: string
  }

  interface RepoSkill {
    id: string
    repo_id: string
    skill_name: string
    skill_path: string
    description: string | null
    trigger_pattern: string | null
    content: string
  }

  interface Props {
    repo: Repo
    isOpen: boolean
    onClose: () => void
  }

  let { repo, isOpen, onClose }: Props = $props()

  let contexts = $state<RepoContext[]>([])
  let skills = $state<RepoSkill[]>([])
  let loading = $state(false)
  let rescanning = $state(false)
  let error = $state<string | null>(null)
  let showContextDetail = $state<RepoContext | null>(null)

  // Get the CLAUDE.md context if present
  let claudeMdContext = $derived(contexts.find(c => c.context_type === 'claude_md'))
  let otherContexts = $derived(contexts.filter(c => c.context_type !== 'claude_md'))

  // Parse counts from CLAUDE.md parsed_sections
  let parsedCounts = $derived(() => {
    if (!claudeMdContext?.parsed_sections) return { commands: 0, constraints: 0, architecture: 0 }
    try {
      const parsed = JSON.parse(claudeMdContext.parsed_sections)
      return {
        commands: parsed.commands?.length || 0,
        constraints: parsed.constraints?.length || 0,
        architecture: parsed.architecture?.length || 0
      }
    } catch {
      return { commands: 0, constraints: 0, architecture: 0 }
    }
  })

  // Format time ago
  function formatTimeAgo(timestamp: number): string {
    const seconds = Math.floor((Date.now() - timestamp) / 1000)
    if (seconds < 60) return 'Just now'
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`
    const days = Math.floor(hours / 24)
    return `${days} day${days !== 1 ? 's' : ''} ago`
  }

  // Load repository context
  async function loadContext() {
    if (!repo?.id) return
    loading = true
    error = null
    try {
      const [contextResult, skillsResult] = await Promise.all([
        window.api.db.repos.getContext(repo.id),
        window.api.db.repos.getSkills(repo.id)
      ])
      contexts = contextResult
      skills = skillsResult
    } catch (err) {
      console.error('Failed to load repository context:', err)
      error = err instanceof Error ? err.message : 'Failed to load repository context'
    } finally {
      loading = false
    }
  }

  // Rescan repository (PRD Section 25: Re-scanning)
  async function handleRescan() {
    if (!repo?.id) return
    rescanning = true
    error = null
    try {
      const result = await window.api.db.repos.rescan(repo.id)
      if (!result.success) {
        error = result.error || 'Failed to rescan repository'
        return
      }
      // Reload context after rescan
      await loadContext()
    } catch (err) {
      console.error('Failed to rescan repository:', err)
      error = err instanceof Error ? err.message : 'Failed to rescan repository'
    } finally {
      rescanning = false
    }
  }

  // Get icon for context type
  function getContextIcon(type: string): string {
    switch (type) {
      case 'claude_md': return '&#x1F4D6;' // open book
      case 'skill': return '&#x1F527;' // wrench
      case 'mcp_config': return '&#x2699;' // gear
      case 'readme': return '&#x1F4C4;' // document
      case 'contributing': return '&#x1F91D;' // handshake
      case 'architecture': return '&#x1F3D7;' // building
      case 'package_config': return '&#x1F4E6;' // package
      default: return '&#x1F4C1;' // folder
    }
  }

  // Get display name for context type
  function getContextTypeName(type: string): string {
    switch (type) {
      case 'claude_md': return 'CLAUDE.md'
      case 'mcp_config': return 'MCP Config'
      case 'readme': return 'README'
      case 'contributing': return 'Contributing'
      case 'architecture': return 'Architecture'
      case 'package_config': return 'Package Config'
      default: return type
    }
  }

  $effect(() => {
    if (isOpen && repo) {
      loadContext()
    }
  })
</script>

{#if isOpen}
  <div class="panel-overlay" onclick={onClose} role="button" tabindex="-1" onkeydown={(e) => e.key === 'Escape' && onClose()}>
    <div class="panel-container" onclick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="panel-title">
      <!-- Header -->
      <div class="panel-header">
        <h2 id="panel-title">Repository: {repo.name}</h2>
        <button class="close-btn" onclick={onClose} aria-label="Close panel">&times;</button>
      </div>

      <!-- Content -->
      <div class="panel-body">
        {#if loading}
          <div class="loading">Loading repository context...</div>
        {:else if error}
          <div class="error">
            <span class="error-icon">&#x26A0;</span>
            {error}
          </div>
        {:else}
          <div class="context-section">
            <h3>Context Files Discovered:</h3>

            <!-- CLAUDE.md (primary context) -->
            {#if claudeMdContext}
              <div class="context-card primary">
                <div class="context-card-header">
                  <span class="icon">{@html getContextIcon('claude_md')}</span>
                  <span class="name">CLAUDE.md</span>
                  <span class="checkmark">&#x2713;</span>
                </div>
                <div class="context-card-meta">
                  Last scanned: {formatTimeAgo(claudeMdContext.last_scanned_at)}
                </div>
                <div class="context-card-stats">
                  Commands: {parsedCounts().commands}, Constraints: {parsedCounts().constraints}, Architecture: {parsedCounts().architecture}
                </div>
                <button class="view-btn" onclick={() => showContextDetail = claudeMdContext}>
                  View Parsed Context
                </button>
              </div>
            {:else}
              <div class="context-card empty">
                <span class="icon">{@html getContextIcon('claude_md')}</span>
                <span class="name">No CLAUDE.md found</span>
              </div>
            {/if}

            <!-- Skills -->
            {#if skills.length > 0}
              <div class="context-card">
                <div class="context-card-header">
                  <span class="icon">{@html getContextIcon('skill')}</span>
                  <span class="name">.claude/skills/ ({skills.length} skill{skills.length !== 1 ? 's' : ''})</span>
                  <span class="checkmark">&#x2713;</span>
                </div>
                <div class="context-card-meta">
                  Last scanned: {formatTimeAgo(Math.max(...skills.map(() => claudeMdContext?.last_scanned_at || Date.now())))}
                </div>
                <div class="skills-list">
                  {#each skills as skill}
                    <span class="skill-tag" title={skill.description || ''}>/{skill.skill_name}</span>
                  {/each}
                </div>
              </div>
            {/if}

            <!-- Other context files -->
            {#each otherContexts as ctx}
              <div class="context-card">
                <div class="context-card-header">
                  <span class="icon">{@html getContextIcon(ctx.context_type)}</span>
                  <span class="name">{getContextTypeName(ctx.context_type)}</span>
                  <span class="checkmark">&#x2713;</span>
                </div>
                <div class="context-card-meta">
                  {ctx.file_path} &bull; Last scanned: {formatTimeAgo(ctx.last_scanned_at)}
                </div>
                <button class="view-btn" onclick={() => showContextDetail = ctx}>
                  View Content
                </button>
              </div>
            {/each}

            {#if contexts.length === 0 && skills.length === 0}
              <div class="no-context">
                No context files discovered in this repository.
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <!-- Footer with action buttons (PRD Section 25 UI) -->
      <div class="panel-footer">
        <button
          class="action-btn rescan"
          onclick={handleRescan}
          disabled={rescanning}
        >
          {#if rescanning}
            Rescanning...
          {:else}
            Rescan Repository
          {/if}
        </button>
        <button class="action-btn secondary" onclick={onClose}>Close</button>
      </div>
    </div>
  </div>
{/if}

<!-- Context Detail Modal -->
{#if showContextDetail}
  <div class="modal-overlay" onclick={() => showContextDetail = null} role="button" tabindex="-1" onkeydown={(e) => e.key === 'Escape' && (showContextDetail = null)}>
    <div class="modal-container" onclick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="detail-title">
      <div class="modal-header">
        <h3 id="detail-title">{getContextTypeName(showContextDetail.context_type)}: {showContextDetail.file_path}</h3>
        <button class="close-btn" onclick={() => showContextDetail = null}>&times;</button>
      </div>
      <div class="modal-body">
        {#if showContextDetail.parsed_sections}
          <div class="parsed-sections">
            <h4>Parsed Sections</h4>
            <pre>{JSON.stringify(JSON.parse(showContextDetail.parsed_sections), null, 2)}</pre>
          </div>
        {/if}
        <h4>Raw Content</h4>
        <pre class="content-preview">{showContextDetail.content}</pre>
      </div>
      <div class="modal-footer">
        <button class="action-btn secondary" onclick={() => showContextDetail = null}>Close</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .panel-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--z-nerv-modal, 1000);
  }

  .panel-container {
    background: var(--color-nerv-bg, #1a1a1a);
    border: 1px solid var(--color-nerv-border, #333);
    border-radius: 8px;
    width: 90%;
    max-width: 600px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--spacing-nerv-md, 16px);
    border-bottom: 1px solid var(--color-nerv-border, #333);
  }

  .panel-header h2 {
    margin: 0;
    font-size: 1.1rem;
    color: var(--color-nerv-text, #f0f0f0);
  }

  .close-btn {
    background: transparent;
    border: none;
    color: var(--color-nerv-text-dim, #888);
    font-size: 1.5rem;
    cursor: pointer;
    padding: 0;
    line-height: 1;
  }

  .close-btn:hover {
    color: var(--color-nerv-text, #f0f0f0);
  }

  .panel-body {
    flex: 1;
    overflow-y: auto;
    padding: var(--spacing-nerv-md, 16px);
  }

  .panel-footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--spacing-nerv-sm, 8px);
    padding: var(--spacing-nerv-md, 16px);
    border-top: 1px solid var(--color-nerv-border, #333);
  }

  .loading, .error, .no-context {
    padding: var(--spacing-nerv-lg, 24px);
    text-align: center;
    color: var(--color-nerv-text-dim, #888);
  }

  .error {
    color: var(--color-nerv-error, #f44336);
  }

  .error-icon {
    margin-right: var(--spacing-nerv-xs, 4px);
  }

  .context-section h3 {
    margin: 0 0 var(--spacing-nerv-md, 16px) 0;
    font-size: 0.9rem;
    color: var(--color-nerv-text-dim, #888);
    font-weight: normal;
  }

  .context-card {
    background: var(--color-nerv-bg-secondary, #252525);
    border: 1px solid var(--color-nerv-border, #333);
    border-radius: 6px;
    padding: var(--spacing-nerv-sm, 8px) var(--spacing-nerv-md, 16px);
    margin-bottom: var(--spacing-nerv-sm, 8px);
  }

  .context-card.primary {
    border-color: var(--color-nerv-primary, #4fc3f7);
  }

  .context-card.empty {
    opacity: 0.6;
    display: flex;
    align-items: center;
    gap: var(--spacing-nerv-sm, 8px);
  }

  .context-card-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-nerv-sm, 8px);
  }

  .context-card-header .icon {
    font-size: 1.1rem;
  }

  .context-card-header .name {
    flex: 1;
    font-weight: 500;
    color: var(--color-nerv-text, #f0f0f0);
  }

  .context-card-header .checkmark {
    color: var(--color-nerv-success, #4caf50);
  }

  .context-card-meta {
    font-size: 0.8rem;
    color: var(--color-nerv-text-dim, #888);
    margin-top: var(--spacing-nerv-xs, 4px);
  }

  .context-card-stats {
    font-size: 0.85rem;
    color: var(--color-nerv-text, #f0f0f0);
    margin-top: var(--spacing-nerv-xs, 4px);
  }

  .skills-list {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-nerv-xs, 4px);
    margin-top: var(--spacing-nerv-sm, 8px);
  }

  .skill-tag {
    background: var(--color-nerv-primary-dim, #1a3a4a);
    color: var(--color-nerv-primary, #4fc3f7);
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.8rem;
    font-family: monospace;
  }

  .view-btn {
    background: transparent;
    border: 1px solid var(--color-nerv-primary, #4fc3f7);
    color: var(--color-nerv-primary, #4fc3f7);
    padding: 4px 12px;
    border-radius: 4px;
    font-size: 0.8rem;
    cursor: pointer;
    margin-top: var(--spacing-nerv-sm, 8px);
  }

  .view-btn:hover {
    background: var(--color-nerv-primary-dim, #1a3a4a);
  }

  .action-btn {
    padding: 8px 16px;
    border-radius: 4px;
    font-size: 0.9rem;
    cursor: pointer;
    border: none;
  }

  .action-btn.rescan {
    background: var(--color-nerv-primary, #4fc3f7);
    color: var(--color-nerv-bg, #1a1a1a);
  }

  .action-btn.rescan:hover:not(:disabled) {
    background: var(--color-nerv-primary-hover, #7fd3f9);
  }

  .action-btn.rescan:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .action-btn.secondary {
    background: var(--color-nerv-bg-secondary, #252525);
    border: 1px solid var(--color-nerv-border, #333);
    color: var(--color-nerv-text, #f0f0f0);
  }

  .action-btn.secondary:hover {
    background: var(--color-nerv-border, #333);
  }

  /* Modal styles */
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
    z-index: calc(var(--z-nerv-modal, 1000) + 1);
  }

  .modal-container {
    background: var(--color-nerv-bg, #1a1a1a);
    border: 1px solid var(--color-nerv-border, #333);
    border-radius: 8px;
    width: 90%;
    max-width: 800px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--spacing-nerv-md, 16px);
    border-bottom: 1px solid var(--color-nerv-border, #333);
  }

  .modal-header h3 {
    margin: 0;
    font-size: 1rem;
    color: var(--color-nerv-text, #f0f0f0);
  }

  .modal-body {
    flex: 1;
    overflow-y: auto;
    padding: var(--spacing-nerv-md, 16px);
  }

  .modal-body h4 {
    margin: 0 0 var(--spacing-nerv-sm, 8px) 0;
    font-size: 0.9rem;
    color: var(--color-nerv-text-dim, #888);
    font-weight: normal;
  }

  .modal-body pre {
    background: var(--color-nerv-bg-secondary, #252525);
    padding: var(--spacing-nerv-md, 16px);
    border-radius: 4px;
    font-size: 0.8rem;
    overflow-x: auto;
    white-space: pre-wrap;
    word-wrap: break-word;
    max-height: 400px;
    overflow-y: auto;
  }

  .parsed-sections {
    margin-bottom: var(--spacing-nerv-md, 16px);
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    padding: var(--spacing-nerv-md, 16px);
    border-top: 1px solid var(--color-nerv-border, #333);
  }
</style>
