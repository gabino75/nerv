<script lang="ts">
  /**
   * DebugFindingsPanel - Display debug task findings with suggested fixes (PRD Section 3)
   *
   * Shows structured findings organized by type: root causes, affected components,
   * suggested fixes, and prevention strategies. Supports adding new findings.
   */

  import type { DebugFinding, DebugFindingType } from '../../../../shared/types'
  import Button from '../shared/Button.svelte'

  interface Props {
    taskId: string
    editable?: boolean
  }

  let { taskId, editable = false }: Props = $props()

  let findings = $state<DebugFinding[]>([])
  let loading = $state(true)
  let expandedSections = $state<Set<DebugFindingType>>(new Set(['suggested_fix']))
  let showAddForm = $state(false)
  let newFinding = $state({
    findingType: 'suggested_fix' as DebugFindingType,
    title: '',
    content: '',
    codeSnippet: '',
    filePath: ''
  })

  // PRD Section 3 debug report format: Reproduction > Root Cause > Evidence > Suggested Fixes > Recommended > Regression Test
  const FINDING_TYPE_CONFIG: Record<DebugFindingType, { label: string; icon: string; description: string }> = {
    reproduction: { label: 'Reproduction', icon: 'R', description: 'Steps to reproduce the issue' },
    root_cause: { label: 'Root Cause', icon: '!', description: 'What is causing the issue' },
    evidence: { label: 'Evidence', icon: 'E', description: 'Logs, traces, stack traces' },
    affected_component: { label: 'Affected Components', icon: '*', description: 'Files and modules impacted' },
    suggested_fix: { label: 'Suggested Fixes', icon: '+', description: 'Options with trade-offs (no code changes made)' },
    recommended_fix: { label: 'Recommended Fix', icon: '^', description: 'Which fix to implement and why' },
    regression_test: { label: 'Regression Test', icon: 'T', description: 'What test to add to prevent recurrence' }
  }

  // Order matches PRD Section 3 report format
  const FINDING_TYPES: DebugFindingType[] = [
    'reproduction',
    'root_cause',
    'evidence',
    'affected_component',
    'suggested_fix',
    'recommended_fix',
    'regression_test'
  ]

  async function loadFindings() {
    loading = true
    try {
      findings = await window.api.findings.getForTask(taskId)
    } catch (error) {
      console.error('[DebugFindingsPanel] Failed to load findings:', error)
    } finally {
      loading = false
    }
  }

  function getFindingsByType(type: DebugFindingType): DebugFinding[] {
    return findings.filter(f => f.finding_type === type)
  }

  function toggleSection(type: DebugFindingType) {
    const newSet = new Set(expandedSections)
    if (newSet.has(type)) {
      newSet.delete(type)
    } else {
      newSet.add(type)
    }
    expandedSections = newSet
  }

  async function handleAddFinding() {
    if (!newFinding.title.trim() || !newFinding.content.trim()) return

    try {
      await window.api.findings.create({
        taskId,
        findingType: newFinding.findingType,
        title: newFinding.title,
        content: newFinding.content,
        codeSnippet: newFinding.codeSnippet || undefined,
        filePath: newFinding.filePath || undefined
      })

      // Reset form and reload
      newFinding = {
        findingType: 'suggested_fix',
        title: '',
        content: '',
        codeSnippet: '',
        filePath: ''
      }
      showAddForm = false
      await loadFindings()
    } catch (error) {
      console.error('[DebugFindingsPanel] Failed to add finding:', error)
    }
  }

  async function handleDeleteFinding(id: string) {
    try {
      await window.api.findings.delete(id)
      await loadFindings()
    } catch (error) {
      console.error('[DebugFindingsPanel] Failed to delete finding:', error)
    }
  }

  // Load findings on mount
  $effect(() => {
    loadFindings()
  })
</script>

<div class="findings-panel">
  <div class="panel-header">
    <h3>Debug Findings</h3>
    {#if editable}
      <Button variant="secondary" size="sm" onclick={() => showAddForm = !showAddForm}>
        {showAddForm ? 'Cancel' : '+ Add Finding'}
      </Button>
    {/if}
  </div>

  {#if loading}
    <div class="loading">Loading findings...</div>
  {:else if findings.length === 0 && !showAddForm}
    <div class="empty-state">
      <p>No findings recorded yet.</p>
      <p class="hint">Debug tasks produce research reports with suggested fixes without modifying code.</p>
    </div>
  {:else}
    {#if showAddForm && editable}
      <div class="add-form">
        <div class="form-row">
          <label for="finding-type">Type</label>
          <select id="finding-type" bind:value={newFinding.findingType}>
            {#each FINDING_TYPES as type}
              <option value={type}>{FINDING_TYPE_CONFIG[type].label}</option>
            {/each}
          </select>
        </div>
        <div class="form-row">
          <label for="finding-title">Title</label>
          <input id="finding-title" type="text" bind:value={newFinding.title} placeholder="Brief summary..." />
        </div>
        <div class="form-row">
          <label for="finding-content">Content</label>
          <textarea id="finding-content" bind:value={newFinding.content} placeholder="Detailed explanation..." rows="3"></textarea>
        </div>
        <div class="form-row">
          <label for="finding-file">File Path (optional)</label>
          <input id="finding-file" type="text" bind:value={newFinding.filePath} placeholder="src/components/Example.ts" />
        </div>
        <div class="form-row">
          <label for="finding-code">Code Snippet (optional)</label>
          <textarea id="finding-code" bind:value={newFinding.codeSnippet} placeholder="// Suggested code fix..." rows="4" class="code-input"></textarea>
        </div>
        <div class="form-actions">
          <Button variant="primary" size="sm" onclick={handleAddFinding} disabled={!newFinding.title.trim() || !newFinding.content.trim()}>
            Add Finding
          </Button>
        </div>
      </div>
    {/if}

    {#each FINDING_TYPES as type}
      {@const typedFindings = getFindingsByType(type)}
      {@const config = FINDING_TYPE_CONFIG[type]}
      {@const isExpanded = expandedSections.has(type)}
      {#if typedFindings.length > 0}
        <div class="finding-section">
          <button class="section-header" onclick={() => toggleSection(type)} aria-expanded={isExpanded}>
            <span class="section-icon">{config.icon}</span>
            <span class="section-title">{config.label}</span>
            <span class="section-count">{typedFindings.length}</span>
            <span class="expand-icon">{isExpanded ? '-' : '+'}</span>
          </button>
          {#if isExpanded}
            <div class="section-content">
              {#each typedFindings as finding}
                <div class="finding-item">
                  <div class="finding-header">
                    <span class="finding-title">{finding.title}</span>
                    {#if editable}
                      <button class="delete-btn" onclick={() => handleDeleteFinding(finding.id)} title="Delete finding">x</button>
                    {/if}
                  </div>
                  <div class="finding-content">{finding.content}</div>
                  {#if finding.file_path}
                    <div class="finding-file">{finding.file_path}</div>
                  {/if}
                  {#if finding.code_snippet}
                    <pre class="finding-code">{finding.code_snippet}</pre>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    {/each}
  {/if}
</div>

<style>
  .findings-panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .panel-header h3 {
    font-size: 14px;
    font-weight: 600;
    color: var(--color-nerv-text);
    margin: 0;
  }

  .loading, .empty-state {
    padding: 16px;
    text-align: center;
    color: var(--color-nerv-text-dim);
    font-size: 13px;
  }

  .empty-state .hint {
    font-size: 11px;
    margin-top: 8px;
    opacity: 0.7;
  }

  .add-form {
    background: var(--color-nerv-bg);
    border: 1px solid var(--color-nerv-border);
    border-radius: var(--radius-nerv-md);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .form-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .form-row label {
    font-size: 11px;
    color: var(--color-nerv-text-dim);
    font-weight: 500;
  }

  .form-row input,
  .form-row select,
  .form-row textarea {
    padding: 8px 10px;
    background: var(--color-nerv-surface);
    border: 1px solid var(--color-nerv-border);
    border-radius: var(--radius-nerv-sm);
    color: var(--color-nerv-text);
    font-size: 12px;
    font-family: inherit;
  }

  .form-row textarea {
    resize: vertical;
    min-height: 60px;
  }

  .code-input {
    font-family: monospace;
    font-size: 11px;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
  }

  .finding-section {
    border: 1px solid var(--color-nerv-border);
    border-radius: var(--radius-nerv-md);
    overflow: hidden;
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 10px 12px;
    background: var(--color-nerv-bg);
    border: none;
    color: var(--color-nerv-text);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    text-align: left;
  }

  .section-header:hover {
    background: var(--color-nerv-surface);
  }

  .section-icon {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-nerv-primary);
    color: white;
    border-radius: 4px;
    font-size: 12px;
    font-weight: bold;
  }

  .section-title {
    flex: 1;
  }

  .section-count {
    background: var(--color-nerv-surface);
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 11px;
    color: var(--color-nerv-text-dim);
  }

  .expand-icon {
    font-size: 16px;
    opacity: 0.6;
  }

  .section-content {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    background: var(--color-nerv-surface);
  }

  .finding-item {
    background: var(--color-nerv-bg);
    border: 1px solid var(--color-nerv-border);
    border-radius: var(--radius-nerv-sm);
    padding: 10px;
  }

  .finding-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 6px;
  }

  .finding-title {
    font-weight: 600;
    font-size: 12px;
    color: var(--color-nerv-text);
  }

  .delete-btn {
    background: none;
    border: none;
    color: var(--color-nerv-text-dim);
    cursor: pointer;
    padding: 2px 6px;
    font-size: 12px;
    border-radius: 4px;
  }

  .delete-btn:hover {
    background: var(--color-nerv-danger);
    color: white;
  }

  .finding-content {
    font-size: 12px;
    color: var(--color-nerv-text);
    line-height: 1.4;
    white-space: pre-wrap;
  }

  .finding-file {
    margin-top: 8px;
    font-size: 11px;
    color: var(--color-nerv-primary);
    font-family: monospace;
  }

  .finding-code {
    margin-top: 8px;
    padding: 10px;
    background: #1a1a1a;
    border-radius: var(--radius-nerv-sm);
    font-size: 11px;
    color: #e0e0e0;
    overflow-x: auto;
    white-space: pre;
    font-family: monospace;
  }
</style>
