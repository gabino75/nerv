<script lang="ts">
  /**
   * AcceptanceCriteriaPanel - Display and manage acceptance criteria (PRD Section 16)
   *
   * Shows acceptance criteria with verification status, supports manual verification,
   * and displays iteration history.
   */

  import type {
    AcceptanceCriterion,
    AcceptanceCriterionInput,
    TaskIteration,
    VerifierType
  } from '../../../../shared/types'
  import Button from '../shared/Button.svelte'

  interface Props {
    taskId: string
    workingDir?: string
    editable?: boolean
  }

  let { taskId, workingDir = '', editable = false }: Props = $props()

  let criteria = $state<AcceptanceCriterion[]>([])
  let iterations = $state<TaskIteration[]>([])
  let loading = $state(true)
  let verifying = $state(false)
  let showAddForm = $state(false)
  let showIterations = $state(false)
  let templates = $state<Array<{ id: string; name: string }>>([])
  let selectedTemplateId = $state('')

  let newCriterion = $state<AcceptanceCriterionInput>({
    description: '',
    verifier: 'command',
    command: '',
    expected_exit_code: 0
  })

  const VERIFIER_CONFIG: Record<VerifierType, { label: string; icon: string }> = {
    command: { label: 'Command', icon: '$' },
    file_exists: { label: 'File Exists', icon: 'F' },
    grep: { label: 'Grep Pattern', icon: '~' },
    test_pass: { label: 'Test Pass', icon: 'T' },
    manual: { label: 'Manual Check', icon: 'M' }
  }

  const STATUS_CONFIG = {
    pending: { label: 'Pending', icon: 'o', class: 'status-pending' },
    pass: { label: 'Passed', icon: '+', class: 'status-pass' },
    fail: { label: 'Failed', icon: 'x', class: 'status-fail' }
  }

  async function loadData() {
    loading = true
    try {
      const [loadedCriteria, loadedIterations, loadedTemplates] = await Promise.all([
        window.api.verification.criteria.getForTask(taskId),
        window.api.verification.iterations.getForTask(taskId),
        window.api.verification.templates.getAll()
      ])
      criteria = loadedCriteria
      iterations = loadedIterations
      templates = loadedTemplates.map(t => ({ id: t.id, name: t.name }))
    } catch (error) {
      console.error('[AcceptanceCriteriaPanel] Failed to load data:', error)
    } finally {
      loading = false
    }
  }

  async function handleVerifyAll() {
    if (!workingDir) {
      console.error('[AcceptanceCriteriaPanel] No working directory specified')
      return
    }
    verifying = true
    try {
      await window.api.verification.runTask(taskId, workingDir)
      await loadData()
    } catch (error) {
      console.error('[AcceptanceCriteriaPanel] Verification failed:', error)
    } finally {
      verifying = false
    }
  }

  async function handleMarkManual(criterionId: string, passed: boolean) {
    try {
      await window.api.verification.markManual(criterionId, passed)
      await loadData()
    } catch (error) {
      console.error('[AcceptanceCriteriaPanel] Failed to mark manual criterion:', error)
    }
  }

  async function handleAddCriterion() {
    if (!newCriterion.description.trim()) return

    try {
      await window.api.verification.criteria.create(taskId, newCriterion)
      newCriterion = {
        description: '',
        verifier: 'command',
        command: '',
        expected_exit_code: 0
      }
      showAddForm = false
      await loadData()
    } catch (error) {
      console.error('[AcceptanceCriteriaPanel] Failed to add criterion:', error)
    }
  }

  async function handleDeleteCriterion(id: string) {
    try {
      await window.api.verification.criteria.delete(id)
      await loadData()
    } catch (error) {
      console.error('[AcceptanceCriteriaPanel] Failed to delete criterion:', error)
    }
  }

  async function handleApplyTemplate() {
    if (!selectedTemplateId) return
    try {
      await window.api.verification.templates.applyToTask(taskId, selectedTemplateId)
      selectedTemplateId = ''
      await loadData()
    } catch (error) {
      console.error('[AcceptanceCriteriaPanel] Failed to apply template:', error)
    }
  }

  function getAutoCriteria(): AcceptanceCriterion[] {
    return criteria.filter(c => c.verifier !== 'manual')
  }

  function getManualCriteria(): AcceptanceCriterion[] {
    return criteria.filter(c => c.verifier === 'manual')
  }

  function getSummary(): { passed: number; failed: number; pending: number; total: number } {
    const passed = criteria.filter(c => c.status === 'pass').length
    const failed = criteria.filter(c => c.status === 'fail').length
    const pending = criteria.filter(c => c.status === 'pending').length
    return { passed, failed, pending, total: criteria.length }
  }

  // Load data on mount
  $effect(() => {
    loadData()
  })
</script>

<div class="criteria-panel">
  <div class="panel-header">
    <h3>Acceptance Criteria</h3>
    <div class="header-actions">
      {#if workingDir && criteria.length > 0}
        <Button variant="primary" size="sm" onclick={handleVerifyAll} disabled={verifying}>
          {verifying ? 'Verifying...' : 'Run Verification'}
        </Button>
      {/if}
      {#if editable}
        <Button variant="secondary" size="sm" onclick={() => showAddForm = !showAddForm}>
          {showAddForm ? 'Cancel' : '+ Add Criterion'}
        </Button>
      {/if}
    </div>
  </div>

  {#if loading}
    <div class="loading">Loading criteria...</div>
  {:else if criteria.length === 0 && !showAddForm}
    <div class="empty-state">
      <p>No acceptance criteria defined.</p>
      {#if templates.length > 0 && editable}
        <div class="template-apply">
          <select bind:value={selectedTemplateId}>
            <option value="">Apply a template...</option>
            {#each templates as template}
              <option value={template.id}>{template.name}</option>
            {/each}
          </select>
          <Button variant="secondary" size="sm" onclick={handleApplyTemplate} disabled={!selectedTemplateId}>
            Apply
          </Button>
        </div>
      {/if}
    </div>
  {:else}
    <!-- Summary bar -->
    {@const summary = getSummary()}
    <div class="summary-bar">
      <span class="summary-item status-pass">+ {summary.passed} passed</span>
      <span class="summary-item status-fail">x {summary.failed} failed</span>
      <span class="summary-item status-pending">o {summary.pending} pending</span>
      <span class="summary-total">{summary.total} total</span>
    </div>

    {#if showAddForm && editable}
      <div class="add-form">
        <div class="form-row">
          <label for="criterion-desc">Description</label>
          <input
            id="criterion-desc"
            type="text"
            bind:value={newCriterion.description}
            placeholder="e.g., Build passes without errors"
          />
        </div>
        <div class="form-row">
          <label for="criterion-verifier">Verifier Type</label>
          <select id="criterion-verifier" bind:value={newCriterion.verifier}>
            {#each Object.entries(VERIFIER_CONFIG) as [key, config]}
              <option value={key}>{config.label}</option>
            {/each}
          </select>
        </div>

        {#if newCriterion.verifier === 'command' || newCriterion.verifier === 'test_pass'}
          <div class="form-row">
            <label for="criterion-command">Command</label>
            <input
              id="criterion-command"
              type="text"
              bind:value={newCriterion.command}
              placeholder="npm run build"
            />
          </div>
          <div class="form-row">
            <label for="criterion-exit">Expected Exit Code</label>
            <input
              id="criterion-exit"
              type="number"
              bind:value={newCriterion.expected_exit_code}
            />
          </div>
        {/if}

        {#if newCriterion.verifier === 'file_exists'}
          <div class="form-row">
            <label for="criterion-filepath">File Path</label>
            <input
              id="criterion-filepath"
              type="text"
              bind:value={newCriterion.file_path}
              placeholder="src/components/NewFeature.tsx"
            />
          </div>
        {/if}

        {#if newCriterion.verifier === 'grep'}
          <div class="form-row">
            <label for="criterion-grepfile">File to Search</label>
            <input
              id="criterion-grepfile"
              type="text"
              bind:value={newCriterion.grep_file}
              placeholder="src/components/Login.tsx"
            />
          </div>
          <div class="form-row">
            <label for="criterion-pattern">Pattern (regex)</label>
            <input
              id="criterion-pattern"
              type="text"
              bind:value={newCriterion.grep_pattern}
              placeholder="console\\.error"
            />
          </div>
          <div class="form-row checkbox-row">
            <label>
              <input type="checkbox" bind:checked={newCriterion.should_match} />
              Should match (unchecked = must NOT match)
            </label>
          </div>
        {/if}

        {#if newCriterion.verifier === 'manual'}
          <div class="form-row">
            <label for="criterion-checklist">Checklist Item</label>
            <input
              id="criterion-checklist"
              type="text"
              bind:value={newCriterion.checklist_item}
              placeholder="Tested on mobile Safari"
            />
          </div>
        {/if}

        <div class="form-actions">
          <Button variant="primary" size="sm" onclick={handleAddCriterion} disabled={!newCriterion.description.trim()}>
            Add Criterion
          </Button>
        </div>
      </div>
    {/if}

    <!-- Auto Criteria -->
    {@const autoCriteria = getAutoCriteria()}
    {#if autoCriteria.length > 0}
      <div class="criteria-section">
        <div class="section-header">
          <span>Automated Checks</span>
        </div>
        <div class="criteria-list">
          {#each autoCriteria as criterion}
            {@const status = STATUS_CONFIG[criterion.status]}
            {@const verifier = VERIFIER_CONFIG[criterion.verifier]}
            <div class="criterion-item {status.class}">
              <span class="criterion-status" title={status.label}>{status.icon}</span>
              <span class="criterion-verifier" title={verifier.label}>{verifier.icon}</span>
              <span class="criterion-description">{criterion.description}</span>
              {#if criterion.command}
                <code class="criterion-command">{criterion.command}</code>
              {/if}
              {#if editable}
                <button class="delete-btn" onclick={() => handleDeleteCriterion(criterion.id)} title="Delete">x</button>
              {/if}
            </div>
            {#if criterion.last_check_output && criterion.status === 'fail'}
              <div class="criterion-output">
                <pre>{criterion.last_check_output}</pre>
              </div>
            {/if}
          {/each}
        </div>
      </div>
    {/if}

    <!-- Manual Criteria -->
    {@const manualCriteria = getManualCriteria()}
    {#if manualCriteria.length > 0}
      <div class="criteria-section">
        <div class="section-header">
          <span>Manual Verification Required</span>
        </div>
        <div class="criteria-list">
          {#each manualCriteria as criterion}
            {@const status = STATUS_CONFIG[criterion.status]}
            <div class="criterion-item {status.class} manual-criterion">
              <span class="criterion-status" title={status.label}>{status.icon}</span>
              <span class="criterion-verifier" title="Manual Check">M</span>
              <span class="criterion-description">{criterion.checklist_item || criterion.description}</span>
              {#if criterion.status === 'pending'}
                <div class="manual-actions">
                  <Button variant="success" size="xs" onclick={() => handleMarkManual(criterion.id, true)}>
                    Mark Complete
                  </Button>
                  <Button variant="danger" size="xs" onclick={() => handleMarkManual(criterion.id, false)}>
                    Mark Failed
                  </Button>
                </div>
              {/if}
              {#if editable}
                <button class="delete-btn" onclick={() => handleDeleteCriterion(criterion.id)} title="Delete">x</button>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Iteration History -->
    {#if iterations.length > 0}
      <div class="iterations-section">
        <button class="iterations-toggle" onclick={() => showIterations = !showIterations}>
          <span>Iteration History ({iterations.length})</span>
          <span class="toggle-icon">{showIterations ? '-' : '+'}</span>
        </button>
        {#if showIterations}
          <div class="iterations-list">
            {#each iterations.slice().reverse() as iteration}
              <div class="iteration-item {iteration.status}">
                <div class="iteration-header">
                  <span class="iteration-number">Iteration {iteration.iteration_number}</span>
                  <span class="iteration-status">{iteration.status === 'completed' ? 'Passed' : iteration.status === 'failed' ? 'Failed' : 'Running'}</span>
                  {#if iteration.duration_ms}
                    <span class="iteration-duration">{(iteration.duration_ms / 1000).toFixed(1)}s</span>
                  {/if}
                </div>
                {#if iteration.files_changed && iteration.files_changed.length > 0}
                  <div class="iteration-files">
                    {#each iteration.files_changed as file}
                      <span class="file-change">
                        {file.file_path} (+{file.lines_added}, -{file.lines_removed})
                      </span>
                    {/each}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  {/if}
</div>

<style>
  .criteria-panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }

  .panel-header h3 {
    font-size: 14px;
    font-weight: 600;
    color: var(--color-nerv-text);
    margin: 0;
  }

  .header-actions {
    display: flex;
    gap: 8px;
  }

  .loading, .empty-state {
    padding: 16px;
    text-align: center;
    color: var(--color-nerv-text-dim);
    font-size: 13px;
  }

  .template-apply {
    display: flex;
    gap: 8px;
    justify-content: center;
    margin-top: 12px;
  }

  .template-apply select {
    padding: 6px 10px;
    background: var(--color-nerv-surface);
    border: 1px solid var(--color-nerv-border);
    border-radius: var(--radius-nerv-sm);
    color: var(--color-nerv-text);
    font-size: 12px;
  }

  .summary-bar {
    display: flex;
    gap: 12px;
    padding: 8px 12px;
    background: var(--color-nerv-bg);
    border: 1px solid var(--color-nerv-border);
    border-radius: var(--radius-nerv-sm);
    font-size: 12px;
  }

  .summary-item {
    font-weight: 500;
  }

  .summary-item.status-pass { color: var(--color-nerv-success); }
  .summary-item.status-fail { color: var(--color-nerv-danger); }
  .summary-item.status-pending { color: var(--color-nerv-text-dim); }

  .summary-total {
    margin-left: auto;
    color: var(--color-nerv-text-dim);
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
  .form-row select {
    padding: 8px 10px;
    background: var(--color-nerv-surface);
    border: 1px solid var(--color-nerv-border);
    border-radius: var(--radius-nerv-sm);
    color: var(--color-nerv-text);
    font-size: 12px;
    font-family: inherit;
  }

  .checkbox-row {
    flex-direction: row;
    align-items: center;
  }

  .checkbox-row label {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
  }

  .criteria-section {
    border: 1px solid var(--color-nerv-border);
    border-radius: var(--radius-nerv-md);
    overflow: hidden;
  }

  .section-header {
    padding: 10px 12px;
    background: var(--color-nerv-bg);
    font-size: 12px;
    font-weight: 600;
    color: var(--color-nerv-text);
    border-bottom: 1px solid var(--color-nerv-border);
  }

  .criteria-list {
    display: flex;
    flex-direction: column;
  }

  .criterion-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--color-nerv-border);
    font-size: 12px;
  }

  .criterion-item:last-child {
    border-bottom: none;
  }

  .criterion-item.status-pass {
    background: rgba(34, 197, 94, 0.05);
  }

  .criterion-item.status-fail {
    background: rgba(239, 68, 68, 0.05);
  }

  .criterion-status {
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    font-size: 12px;
    font-weight: bold;
  }

  .status-pass .criterion-status {
    background: var(--color-nerv-success);
    color: white;
  }

  .status-fail .criterion-status {
    background: var(--color-nerv-danger);
    color: white;
  }

  .status-pending .criterion-status {
    background: var(--color-nerv-border);
    color: var(--color-nerv-text-dim);
  }

  .criterion-verifier {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-nerv-surface);
    border-radius: 4px;
    font-size: 11px;
    font-weight: bold;
    color: var(--color-nerv-text-dim);
  }

  .criterion-description {
    flex: 1;
    color: var(--color-nerv-text);
  }

  .criterion-command {
    font-size: 10px;
    padding: 2px 6px;
    background: var(--color-nerv-surface);
    border-radius: 3px;
    color: var(--color-nerv-text-dim);
  }

  .delete-btn {
    background: none;
    border: none;
    color: var(--color-nerv-text-dim);
    cursor: pointer;
    padding: 2px 6px;
    font-size: 12px;
    border-radius: 4px;
    opacity: 0.5;
  }

  .delete-btn:hover {
    background: var(--color-nerv-danger);
    color: white;
    opacity: 1;
  }

  .criterion-output {
    padding: 8px 12px 8px 48px;
    background: #1a1a1a;
    border-bottom: 1px solid var(--color-nerv-border);
  }

  .criterion-output pre {
    font-size: 10px;
    color: #e0e0e0;
    margin: 0;
    white-space: pre-wrap;
    max-height: 100px;
    overflow-y: auto;
  }

  .manual-criterion {
    flex-wrap: wrap;
  }

  .manual-actions {
    display: flex;
    gap: 6px;
    margin-left: auto;
  }

  .iterations-section {
    border: 1px solid var(--color-nerv-border);
    border-radius: var(--radius-nerv-md);
    overflow: hidden;
  }

  .iterations-toggle {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    padding: 10px 12px;
    background: var(--color-nerv-bg);
    border: none;
    color: var(--color-nerv-text);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
  }

  .iterations-toggle:hover {
    background: var(--color-nerv-surface);
  }

  .toggle-icon {
    font-size: 16px;
    opacity: 0.6;
  }

  .iterations-list {
    display: flex;
    flex-direction: column;
    background: var(--color-nerv-surface);
  }

  .iteration-item {
    padding: 10px 12px;
    border-bottom: 1px solid var(--color-nerv-border);
  }

  .iteration-item:last-child {
    border-bottom: none;
  }

  .iteration-item.completed {
    border-left: 3px solid var(--color-nerv-success);
  }

  .iteration-item.failed {
    border-left: 3px solid var(--color-nerv-danger);
  }

  .iteration-item.running {
    border-left: 3px solid var(--color-nerv-primary);
  }

  .iteration-header {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 12px;
  }

  .iteration-number {
    font-weight: 600;
    color: var(--color-nerv-text);
  }

  .iteration-status {
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 10px;
    font-weight: 500;
  }

  .iteration-item.completed .iteration-status {
    background: rgba(34, 197, 94, 0.2);
    color: var(--color-nerv-success);
  }

  .iteration-item.failed .iteration-status {
    background: rgba(239, 68, 68, 0.2);
    color: var(--color-nerv-danger);
  }

  .iteration-item.running .iteration-status {
    background: rgba(59, 130, 246, 0.2);
    color: var(--color-nerv-primary);
  }

  .iteration-duration {
    color: var(--color-nerv-text-dim);
    font-size: 11px;
  }

  .iteration-files {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
  }

  .file-change {
    font-size: 10px;
    padding: 2px 6px;
    background: var(--color-nerv-bg);
    border-radius: 3px;
    color: var(--color-nerv-text-dim);
    font-family: monospace;
  }
</style>
