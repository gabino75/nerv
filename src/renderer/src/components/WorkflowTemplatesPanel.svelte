<script lang="ts">
  /**
   * Workflow Templates Panel (PRD Section 15: Workflow Templates / Skills Integration)
   * Displays available workflow templates with ability to view details and create tasks
   */
  import { onMount } from 'svelte'
  import type { BuiltInSkill, SkillDefinition, MarketplaceSkill } from '../../../shared/types'

  interface Props {
    isOpen: boolean
    onClose: () => void
    onCreateTask?: (skillName: string) => void
  }

  let { isOpen, onClose, onCreateTask }: Props = $props()

  let skills = $state<BuiltInSkill[]>([])
  let loading = $state(false)
  let error = $state<string | null>(null)
  let selectedSkill = $state<BuiltInSkill | null>(null)

  // Create custom skill form state (PRD Section 15)
  let showCreateForm = $state(false)
  let newSkillName = $state('')
  let newSkillDescription = $state('')
  let newSkillTools = $state('Read, Bash, Grep, Glob')
  let newSkillCriteria = $state('')
  let newSkillSteps = $state('')
  let createError = $state<string | null>(null)
  let creating = $state(false)

  // Marketplace state (PRD Section 15)
  let showMarketplace = $state(false)
  let marketplaceQuery = $state('')
  let marketplaceSkills = $state<MarketplaceSkill[]>([])
  let marketplaceLoading = $state(false)
  let marketplaceError = $state<string | null>(null)
  let selectedMarketplaceSkill = $state<MarketplaceSkill | null>(null)
  let installing = $state(false)
  let installScope = $state<'global' | 'project'>('project')

  // Categorize skills: built-in vs project/custom (PRD Section 15 mockup)
  const builtInSkillNames = ['pr-review', 'write-tests', 'refactor', 'debug', 'documentation']

  let builtInSkills = $derived(skills.filter(s => builtInSkillNames.includes(s.name)))
  let projectSkills = $derived(skills.filter(s => !builtInSkillNames.includes(s.name)))

  // Icons for built-in skills (PRD Section 15 mockup)
  const skillIcons: Record<string, string> = {
    'pr-review': '&#x1F50D;',       // magnifying glass
    'write-tests': '&#x1F9EA;',     // test tube
    'refactor': '&#x1F527;',        // wrench
    'debug': '&#x1F41B;',           // bug
    'documentation': '&#x1F4DD;'    // memo/document
  }

  function getSkillIcon(name: string): string {
    return skillIcons[name] || '&#x1F4DD;' // default: memo
  }

  async function loadSkills() {
    loading = true
    error = null
    try {
      skills = await window.api.skills.discover()
    } catch (err) {
      console.error('Failed to load skills:', err)
      error = err instanceof Error ? err.message : 'Failed to load workflow templates'
    } finally {
      loading = false
    }
  }

  function handleSelectSkill(skill: BuiltInSkill) {
    selectedSkill = selectedSkill?.name === skill.name ? null : skill
  }

  function handleUseTemplate(skill: BuiltInSkill) {
    if (onCreateTask) {
      onCreateTask(skill.name)
    }
    onClose()
  }

  // PRD Section 15: Create custom skill
  async function handleCreateSkill() {
    if (!newSkillName.trim()) {
      createError = 'Skill name is required'
      return
    }

    creating = true
    createError = null

    try {
      const skillDef: SkillDefinition = {
        name: newSkillName.trim().toLowerCase().replace(/\s+/g, '-'),
        description: newSkillDescription.trim() || `${newSkillName} workflow`,
        allowedTools: newSkillTools.split(',').map(t => t.trim()).filter(Boolean),
        acceptanceCriteria: newSkillCriteria.split('\n').map(c => c.trim()).filter(Boolean),
        steps: newSkillSteps.split('\n').map(s => s.trim()).filter(Boolean)
      }

      await window.api.skills.create(skillDef)
      await loadSkills()
      resetCreateForm()
    } catch (err) {
      console.error('Failed to create skill:', err)
      createError = err instanceof Error ? err.message : 'Failed to create skill'
    } finally {
      creating = false
    }
  }

  function resetCreateForm() {
    showCreateForm = false
    newSkillName = ''
    newSkillDescription = ''
    newSkillTools = 'Read, Bash, Grep, Glob'
    newSkillCriteria = ''
    newSkillSteps = ''
    createError = null
  }

  // PRD Section 15: Edit skill
  async function handleEditSkill(skill: BuiltInSkill) {
    try {
      await window.api.skills.edit(skill.name)
    } catch (err) {
      console.error('Failed to open skill for editing:', err)
    }
  }

  // PRD Section 15: Marketplace functions
  async function openMarketplace() {
    showMarketplace = true
    marketplaceQuery = ''
    selectedMarketplaceSkill = null
    marketplaceError = null
    await searchMarketplace('')
  }

  function closeMarketplace() {
    showMarketplace = false
    marketplaceSkills = []
    selectedMarketplaceSkill = null
    marketplaceError = null
    marketplaceQuery = ''
  }

  async function searchMarketplace(query: string) {
    marketplaceLoading = true
    marketplaceError = null
    try {
      marketplaceSkills = await window.api.skills.searchMarketplace(query)
    } catch (err) {
      console.error('Failed to search marketplace:', err)
      marketplaceError = err instanceof Error ? err.message : 'Failed to search marketplace'
    } finally {
      marketplaceLoading = false
    }
  }

  async function handleInstallSkill() {
    if (!selectedMarketplaceSkill) return

    installing = true
    marketplaceError = null
    try {
      await window.api.skills.installSkill(selectedMarketplaceSkill.id, installScope)
      await loadSkills()
      closeMarketplace()
    } catch (err) {
      console.error('Failed to install skill:', err)
      marketplaceError = err instanceof Error ? err.message : 'Failed to install skill'
    } finally {
      installing = false
    }
  }

  function handleMarketplaceSearch() {
    searchMarketplace(marketplaceQuery)
  }

  onMount(() => {
    if (isOpen) {
      loadSkills()
    }
  })

  $effect(() => {
    if (isOpen) {
      loadSkills()
      selectedSkill = null
    }
  })
</script>

{#if isOpen}
  <div class="overlay" role="dialog" aria-modal="true" aria-labelledby="panel-title">
    <div class="panel" data-testid="workflow-templates-panel">
      <header class="panel-header">
        <h2 id="panel-title">Workflow Templates</h2>
        <div class="header-actions">
          <button
            class="btn-new"
            onclick={() => showCreateForm = true}
            data-testid="create-skill-btn"
          >+ New</button>
          <button class="close-btn" onclick={onClose} aria-label="Close panel">&times;</button>
        </div>
      </header>

      <div class="panel-content">
        {#if loading}
          <div class="loading">Loading workflow templates...</div>
        {:else if error}
          <div class="error">
            <p>{error}</p>
            <button class="btn-retry" onclick={loadSkills}>Retry</button>
          </div>
        {:else if skills.length === 0}
          <div class="empty-state">
            <p>No workflow templates found</p>
            <p class="hint">Add skill files to .claude/skills/ to create templates</p>
          </div>
        {:else}
          <!-- Built-in Templates -->
          {#if builtInSkills.length > 0}
            <section class="section">
              <h3 class="section-title">Built-in Templates</h3>
              <div class="skills-list">
                {#each builtInSkills as skill (skill.name)}
                  <button
                    class="skill-card"
                    class:selected={selectedSkill?.name === skill.name}
                    onclick={() => handleSelectSkill(skill)}
                    data-testid={`skill-${skill.name}`}
                  >
                    <span class="skill-icon">{@html getSkillIcon(skill.name)}</span>
                    <span class="skill-name">/{skill.name}</span>
                    <span class="skill-description">{skill.description}</span>
                  </button>
                {/each}
              </div>
            </section>
          {/if}

          <!-- Project Templates -->
          {#if projectSkills.length > 0}
            <section class="section">
              <h3 class="section-title">Project Templates</h3>
              <div class="skills-list">
                {#each projectSkills as skill (skill.name)}
                  <button
                    class="skill-card"
                    class:selected={selectedSkill?.name === skill.name}
                    onclick={() => handleSelectSkill(skill)}
                    data-testid={`skill-${skill.name}`}
                  >
                    <span class="skill-icon">{@html getSkillIcon(skill.name)}</span>
                    <span class="skill-name">/{skill.name}</span>
                    <span class="skill-description">{skill.description}</span>
                  </button>
                {/each}
              </div>
            </section>
          {/if}

          <!-- Selected Skill Details -->
          {#if selectedSkill}
            <section class="section details-section">
              <h3 class="section-title">Template Details</h3>
              <div class="skill-details">
                <div class="detail-row">
                  <span class="detail-label">Name:</span>
                  <span class="detail-value">/{selectedSkill.name}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Description:</span>
                  <span class="detail-value">{selectedSkill.description}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Allowed Tools:</span>
                  <span class="detail-value tools">
                    {#each selectedSkill.allowedTools as tool}
                      <span class="tool-tag">{tool}</span>
                    {/each}
                  </span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Path:</span>
                  <span class="detail-value path">{selectedSkill.path}</span>
                </div>
                <div class="skill-actions">
                  <button
                    class="btn-edit"
                    onclick={() => handleEditSkill(selectedSkill!)}
                  >
                    Edit
                  </button>
                  <button
                    class="btn-use"
                    onclick={() => handleUseTemplate(selectedSkill!)}
                  >
                    Use Template
                  </button>
                </div>
              </div>
            </section>
          {/if}
        {/if}
      </div>

      <footer class="panel-footer">
        <div class="footer-actions">
          <button
            class="btn-marketplace"
            onclick={openMarketplace}
            data-testid="import-marketplace-btn"
          >Import from Marketplace...</button>
          <button
            class="btn-create-custom"
            onclick={() => showCreateForm = true}
          >Create Custom...</button>
        </div>
        <p class="footer-hint">
          Skills are Claude Code workflow templates stored in .claude/skills/
        </p>
      </footer>

      <!-- Create Custom Skill Form (PRD Section 15) -->
      {#if showCreateForm}
        <div class="create-overlay" role="dialog" aria-modal="true">
          <div class="create-form" data-testid="create-skill-form">
            <h3>Create Custom Workflow</h3>

            {#if createError}
              <div class="form-error">{createError}</div>
            {/if}

            <div class="form-group">
              <label for="skill-name">Name (slug format)</label>
              <input
                id="skill-name"
                type="text"
                bind:value={newSkillName}
                placeholder="my-workflow"
              />
            </div>

            <div class="form-group">
              <label for="skill-description">Description</label>
              <input
                id="skill-description"
                type="text"
                bind:value={newSkillDescription}
                placeholder="What does this workflow do?"
              />
            </div>

            <div class="form-group">
              <label for="skill-tools">Allowed Tools (comma-separated)</label>
              <input
                id="skill-tools"
                type="text"
                bind:value={newSkillTools}
                placeholder="Read, Bash, Grep, Glob"
              />
            </div>

            <div class="form-group">
              <label for="skill-criteria">Acceptance Criteria (one per line)</label>
              <textarea
                id="skill-criteria"
                bind:value={newSkillCriteria}
                placeholder="All tests pass&#10;Code style matches project conventions"
                rows="3"
              ></textarea>
            </div>

            <div class="form-group">
              <label for="skill-steps">Steps (one per line)</label>
              <textarea
                id="skill-steps"
                bind:value={newSkillSteps}
                placeholder="Read the target files&#10;Analyze the code&#10;Make changes"
                rows="4"
              ></textarea>
            </div>

            <div class="form-actions">
              <button
                class="btn-cancel"
                onclick={resetCreateForm}
              >Cancel</button>
              <button
                class="btn-create"
                onclick={handleCreateSkill}
                disabled={creating}
              >
                {creating ? 'Creating...' : 'Create Workflow'}
              </button>
            </div>
          </div>
        </div>
      {/if}

      <!-- Skills Marketplace Dialog (PRD Section 15) -->
      {#if showMarketplace}
        <div class="create-overlay" role="dialog" aria-modal="true">
          <div class="marketplace-dialog" data-testid="marketplace-dialog">
            <div class="marketplace-header">
              <h3>Skills Marketplace</h3>
              <button class="close-btn" onclick={closeMarketplace} aria-label="Close">&times;</button>
            </div>

            <div class="marketplace-search">
              <input
                type="text"
                bind:value={marketplaceQuery}
                placeholder="Search skills..."
                onkeydown={(e) => e.key === 'Enter' && handleMarketplaceSearch()}
              />
              <button onclick={handleMarketplaceSearch}>Search</button>
            </div>

            {#if marketplaceError}
              <div class="form-error">{marketplaceError}</div>
            {/if}

            <div class="marketplace-content">
              {#if marketplaceLoading}
                <div class="loading">Searching marketplace...</div>
              {:else if marketplaceSkills.length === 0}
                <div class="empty-state">No skills found</div>
              {:else}
                <div class="marketplace-list">
                  {#each marketplaceSkills as skill (skill.id)}
                    <button
                      class="marketplace-card"
                      class:selected={selectedMarketplaceSkill?.id === skill.id}
                      onclick={() => selectedMarketplaceSkill = skill}
                      data-testid={`marketplace-skill-${skill.name}`}
                    >
                      <div class="marketplace-card-header">
                        <span class="marketplace-name">{skill.name}</span>
                        <span class="marketplace-author">by {skill.author}</span>
                      </div>
                      <p class="marketplace-description">{skill.description}</p>
                      <div class="marketplace-meta">
                        <span class="marketplace-downloads">&#x2B07; {skill.downloads}</span>
                        <span class="marketplace-rating">&#x2B50; {skill.rating}</span>
                        <span class="marketplace-version">v{skill.version}</span>
                      </div>
                      <div class="marketplace-tags">
                        {#each skill.tags as tag}
                          <span class="tag">{tag}</span>
                        {/each}
                      </div>
                    </button>
                  {/each}
                </div>
              {/if}

              {#if selectedMarketplaceSkill}
                <div class="marketplace-details">
                  <h4>Install: {selectedMarketplaceSkill.name}</h4>
                  <p>{selectedMarketplaceSkill.description}</p>
                  <div class="detail-row">
                    <span class="detail-label">Allowed Tools:</span>
                    <span class="detail-value tools">
                      {#each selectedMarketplaceSkill.allowedTools as tool}
                        <span class="tool-tag">{tool}</span>
                      {/each}
                    </span>
                  </div>
                  <div class="install-scope">
                    <label>
                      <input type="radio" bind:group={installScope} value="project" />
                      Project only
                    </label>
                    <label>
                      <input type="radio" bind:group={installScope} value="global" />
                      Global (all projects)
                    </label>
                  </div>
                </div>
              {/if}
            </div>

            <div class="marketplace-footer">
              <button class="btn-cancel" onclick={closeMarketplace}>Cancel</button>
              <button
                class="btn-install"
                onclick={handleInstallSkill}
                disabled={!selectedMarketplaceSkill || installing}
              >
                {installing ? 'Installing...' : 'Install Skill'}
              </button>
            </div>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--z-nerv-modal, 1000);
  }

  .panel {
    background: var(--color-nerv-panel, #12121a);
    border: 1px solid var(--color-nerv-border, #2a2a3a);
    border-radius: var(--radius-nerv-lg, 8px);
    width: 90%;
    max-width: 600px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px;
    border-bottom: 1px solid var(--color-nerv-border, #2a2a3a);
  }

  .panel-header h2 {
    margin: 0;
    font-size: 18px;
    color: var(--color-nerv-text, #e0e0e0);
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .btn-new {
    padding: 6px 12px;
    background: var(--color-nerv-primary, #ff6b35);
    border: none;
    border-radius: var(--radius-nerv-sm, 4px);
    color: white;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
  }

  .btn-new:hover {
    background: var(--color-nerv-primary-hover, #ff8555);
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--color-nerv-text-muted, #888);
    font-size: 24px;
    cursor: pointer;
    padding: 0 8px;
    line-height: 1;
  }

  .close-btn:hover {
    color: var(--color-nerv-text, #e0e0e0);
  }

  .panel-content {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
  }

  .loading, .empty-state, .error {
    text-align: center;
    padding: 32px;
    color: var(--color-nerv-text-dim, #666);
  }

  .empty-state .hint {
    margin-top: 8px;
    font-size: 12px;
    color: var(--color-nerv-text-muted, #888);
  }

  .error {
    color: var(--color-nerv-error, #ff6b6b);
  }

  .btn-retry {
    margin-top: 12px;
    padding: 8px 16px;
    background: var(--color-nerv-primary, #ff6b35);
    border: none;
    border-radius: var(--radius-nerv-sm, 4px);
    color: white;
    cursor: pointer;
  }

  .section {
    margin-bottom: 20px;
  }

  .section-title {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-nerv-text-muted, #888);
    margin: 0 0 12px 0;
  }

  .skills-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .skill-card {
    display: grid;
    grid-template-columns: auto 1fr;
    grid-template-rows: auto auto;
    gap: 4px 12px;
    padding: 12px;
    background: var(--color-nerv-bg, #0a0a0f);
    border: 1px solid var(--color-nerv-border, #2a2a3a);
    border-radius: var(--radius-nerv-md, 6px);
    cursor: pointer;
    text-align: left;
    transition: all 0.15s;
  }

  .skill-card:hover {
    border-color: var(--color-nerv-primary, #ff6b35);
  }

  .skill-card.selected {
    border-color: var(--color-nerv-primary, #ff6b35);
    background: rgba(255, 107, 53, 0.1);
  }

  .skill-icon {
    grid-row: span 2;
    font-size: 24px;
    display: flex;
    align-items: center;
  }

  .skill-name {
    font-weight: 500;
    color: var(--color-nerv-primary, #ff6b35);
    font-size: 14px;
  }

  .skill-description {
    color: var(--color-nerv-text-dim, #666);
    font-size: 13px;
    grid-column: 2;
  }

  .details-section {
    background: var(--color-nerv-bg, #0a0a0f);
    border: 1px solid var(--color-nerv-border, #2a2a3a);
    border-radius: var(--radius-nerv-md, 6px);
    padding: 16px;
  }

  .skill-details {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .detail-row {
    display: flex;
    gap: 12px;
  }

  .detail-label {
    min-width: 100px;
    color: var(--color-nerv-text-muted, #888);
    font-size: 13px;
  }

  .detail-value {
    flex: 1;
    color: var(--color-nerv-text, #e0e0e0);
    font-size: 13px;
  }

  .detail-value.tools {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .tool-tag {
    padding: 2px 8px;
    background: var(--color-nerv-bg-alt, #1a1a24);
    border-radius: var(--radius-nerv-sm, 4px);
    font-size: 11px;
    font-family: 'SF Mono', Monaco, 'Courier New', monospace;
    color: var(--color-nerv-text-dim, #666);
  }

  .detail-value.path {
    font-family: 'SF Mono', Monaco, 'Courier New', monospace;
    font-size: 11px;
    color: var(--color-nerv-text-dim, #666);
    word-break: break-all;
  }

  .skill-actions {
    margin-top: 8px;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .btn-edit {
    padding: 8px 16px;
    background: transparent;
    border: 1px solid var(--color-nerv-border, #2a2a3a);
    border-radius: var(--radius-nerv-sm, 4px);
    color: var(--color-nerv-text-muted, #888);
    font-size: 13px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-edit:hover {
    border-color: var(--color-nerv-text-muted, #888);
    color: var(--color-nerv-text, #e0e0e0);
  }

  .btn-use {
    padding: 8px 20px;
    background: var(--color-nerv-primary, #ff6b35);
    border: none;
    border-radius: var(--radius-nerv-sm, 4px);
    color: white;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s;
  }

  .btn-use:hover {
    background: var(--color-nerv-primary-hover, #ff8555);
  }

  .panel-footer {
    padding: 12px 16px;
    border-top: 1px solid var(--color-nerv-border, #2a2a3a);
    text-align: center;
  }

  .footer-actions {
    margin-bottom: 8px;
  }

  .btn-marketplace {
    padding: 8px 16px;
    background: transparent;
    border: 1px solid var(--color-nerv-border, #2a2a3a);
    border-radius: var(--radius-nerv-sm, 4px);
    color: var(--color-nerv-text-dim, #666);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-marketplace:hover {
    border-color: var(--color-nerv-primary, #ff6b35);
    color: var(--color-nerv-primary, #ff6b35);
  }

  .btn-create-custom {
    padding: 8px 16px;
    background: transparent;
    border: 1px dashed var(--color-nerv-border, #2a2a3a);
    border-radius: var(--radius-nerv-sm, 4px);
    color: var(--color-nerv-text-dim, #666);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-create-custom:hover {
    border-color: var(--color-nerv-primary, #ff6b35);
    color: var(--color-nerv-primary, #ff6b35);
  }

  .footer-hint {
    margin: 0;
    font-size: 11px;
    color: var(--color-nerv-text-muted, #888);
  }

  /* Create Custom Skill Form (PRD Section 15) */
  .create-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: calc(var(--z-nerv-modal, 1000) + 1);
  }

  .create-form {
    background: var(--color-nerv-panel, #12121a);
    border: 1px solid var(--color-nerv-border, #2a2a3a);
    border-radius: var(--radius-nerv-lg, 8px);
    width: 90%;
    max-width: 500px;
    padding: 20px;
  }

  .create-form h3 {
    margin: 0 0 16px 0;
    font-size: 16px;
    color: var(--color-nerv-text, #e0e0e0);
  }

  .form-error {
    padding: 8px 12px;
    margin-bottom: 16px;
    background: rgba(255, 107, 107, 0.1);
    border: 1px solid var(--color-nerv-error, #ff6b6b);
    border-radius: var(--radius-nerv-sm, 4px);
    color: var(--color-nerv-error, #ff6b6b);
    font-size: 12px;
  }

  .form-group {
    margin-bottom: 16px;
  }

  .form-group label {
    display: block;
    margin-bottom: 6px;
    font-size: 12px;
    color: var(--color-nerv-text-muted, #888);
  }

  .form-group input,
  .form-group textarea {
    width: 100%;
    padding: 8px 12px;
    background: var(--color-nerv-bg, #0a0a0f);
    border: 1px solid var(--color-nerv-border, #2a2a3a);
    border-radius: var(--radius-nerv-sm, 4px);
    color: var(--color-nerv-text, #e0e0e0);
    font-size: 13px;
    font-family: inherit;
    box-sizing: border-box;
  }

  .form-group input:focus,
  .form-group textarea:focus {
    outline: none;
    border-color: var(--color-nerv-primary, #ff6b35);
  }

  .form-group textarea {
    resize: vertical;
    min-height: 60px;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 20px;
  }

  .btn-cancel {
    padding: 8px 16px;
    background: transparent;
    border: 1px solid var(--color-nerv-border, #2a2a3a);
    border-radius: var(--radius-nerv-sm, 4px);
    color: var(--color-nerv-text-muted, #888);
    font-size: 13px;
    cursor: pointer;
  }

  .btn-cancel:hover {
    border-color: var(--color-nerv-text-muted, #888);
    color: var(--color-nerv-text, #e0e0e0);
  }

  .btn-create {
    padding: 8px 20px;
    background: var(--color-nerv-primary, #ff6b35);
    border: none;
    border-radius: var(--radius-nerv-sm, 4px);
    color: white;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
  }

  .btn-create:hover:not(:disabled) {
    background: var(--color-nerv-primary-hover, #ff8555);
  }

  .btn-create:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* Marketplace Dialog (PRD Section 15) */
  .marketplace-dialog {
    background: var(--color-nerv-panel, #12121a);
    border: 1px solid var(--color-nerv-border, #2a2a3a);
    border-radius: var(--radius-nerv-lg, 8px);
    width: 90%;
    max-width: 650px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
  }

  .marketplace-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px;
    border-bottom: 1px solid var(--color-nerv-border, #2a2a3a);
  }

  .marketplace-header h3 {
    margin: 0;
    font-size: 16px;
    color: var(--color-nerv-text, #e0e0e0);
  }

  .marketplace-search {
    display: flex;
    gap: 8px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--color-nerv-border, #2a2a3a);
  }

  .marketplace-search input {
    flex: 1;
    padding: 8px 12px;
    background: var(--color-nerv-bg, #0a0a0f);
    border: 1px solid var(--color-nerv-border, #2a2a3a);
    border-radius: var(--radius-nerv-sm, 4px);
    color: var(--color-nerv-text, #e0e0e0);
    font-size: 13px;
  }

  .marketplace-search input:focus {
    outline: none;
    border-color: var(--color-nerv-primary, #ff6b35);
  }

  .marketplace-search button {
    padding: 8px 16px;
    background: var(--color-nerv-primary, #ff6b35);
    border: none;
    border-radius: var(--radius-nerv-sm, 4px);
    color: white;
    font-size: 13px;
    cursor: pointer;
  }

  .marketplace-search button:hover {
    background: var(--color-nerv-primary-hover, #ff8555);
  }

  .marketplace-content {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
  }

  .marketplace-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .marketplace-card {
    padding: 12px;
    background: var(--color-nerv-bg, #0a0a0f);
    border: 1px solid var(--color-nerv-border, #2a2a3a);
    border-radius: var(--radius-nerv-md, 6px);
    cursor: pointer;
    text-align: left;
    transition: all 0.15s;
  }

  .marketplace-card:hover {
    border-color: var(--color-nerv-primary, #ff6b35);
  }

  .marketplace-card.selected {
    border-color: var(--color-nerv-primary, #ff6b35);
    background: rgba(255, 107, 53, 0.1);
  }

  .marketplace-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }

  .marketplace-name {
    font-weight: 500;
    color: var(--color-nerv-primary, #ff6b35);
    font-size: 14px;
  }

  .marketplace-author {
    font-size: 11px;
    color: var(--color-nerv-text-muted, #888);
  }

  .marketplace-description {
    color: var(--color-nerv-text-dim, #666);
    font-size: 12px;
    margin: 0 0 8px 0;
    line-height: 1.4;
  }

  .marketplace-meta {
    display: flex;
    gap: 12px;
    margin-bottom: 8px;
    font-size: 11px;
    color: var(--color-nerv-text-muted, #888);
  }

  .marketplace-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .marketplace-tags .tag {
    padding: 2px 6px;
    background: var(--color-nerv-bg-alt, #1a1a24);
    border-radius: 3px;
    font-size: 10px;
    color: var(--color-nerv-text-muted, #888);
  }

  .marketplace-details {
    margin-top: 16px;
    padding: 16px;
    background: var(--color-nerv-bg-alt, #1a1a24);
    border: 1px solid var(--color-nerv-border, #2a2a3a);
    border-radius: var(--radius-nerv-md, 6px);
  }

  .marketplace-details h4 {
    margin: 0 0 8px 0;
    color: var(--color-nerv-text, #e0e0e0);
    font-size: 14px;
  }

  .marketplace-details p {
    margin: 0 0 12px 0;
    color: var(--color-nerv-text-dim, #666);
    font-size: 12px;
  }

  .install-scope {
    display: flex;
    gap: 16px;
    margin-top: 12px;
  }

  .install-scope label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--color-nerv-text-dim, #666);
    cursor: pointer;
  }

  .install-scope input[type="radio"] {
    accent-color: var(--color-nerv-primary, #ff6b35);
  }

  .marketplace-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid var(--color-nerv-border, #2a2a3a);
  }

  .btn-install {
    padding: 8px 20px;
    background: var(--color-nerv-primary, #ff6b35);
    border: none;
    border-radius: var(--radius-nerv-sm, 4px);
    color: white;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
  }

  .btn-install:hover:not(:disabled) {
    background: var(--color-nerv-primary-hover, #ff8555);
  }

  .btn-install:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
