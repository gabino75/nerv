<script lang="ts">
  import type { NervSettings, ResolvedSetting, SettingsSource, OrgSyncStatus } from '../../../shared/types/settings'

  interface Props {
    isOpen: boolean
    onClose: () => void
  }

  let { isOpen, onClose }: Props = $props()

  type SettingsWithSources = Record<keyof NervSettings, ResolvedSetting<NervSettings[keyof NervSettings]>>

  // PRD Section 12.3: Scope-based tabs
  type SettingsScope = 'global' | 'organization' | 'project' | 'repo'
  let activeScope = $state<SettingsScope>('global')

  let settings = $state<NervSettings | null>(null)
  let settingsWithSources = $state<SettingsWithSources | null>(null)
  let isLoading = $state(true)
  let error = $state<string | null>(null)
  let saveStatus = $state<string | null>(null)
  let activeCategory = $state<string>('model')

  // Organization info (PRD Section 20)
  let orgSyncStatus = $state<OrgSyncStatus | null>(null)
  let orgAgents = $state<string[]>([])
  let orgSkills = $state<string[]>([])
  let orgIsConfigured = $state(false)
  let isSyncing = $state(false)

  const scopeTabs: { id: SettingsScope; label: string; description: string }[] = [
    { id: 'global', label: 'Global', description: 'User-wide defaults (~/.nerv/config.json)' },
    { id: 'organization', label: 'Org', description: 'Organization policy (read-only, set by org admin)' },
    { id: 'project', label: 'Project', description: 'Project-level overrides (.nerv/config.json)' },
    { id: 'repo', label: 'Repo', description: 'Repository-specific settings' }
  ]

  const categories: { id: string; label: string; keys: (keyof NervSettings)[]; scopes: SettingsScope[] }[] = [
    {
      id: 'model',
      label: 'Model',
      keys: ['default_model', 'default_max_tokens', 'max_turns'],
      scopes: ['global', 'organization', 'project']
    },
    {
      id: 'budget',
      label: 'Budget',
      keys: ['monthly_budget_usd', 'budget_warning_threshold', 'budget_critical_threshold', 'per_task_budget_default'],
      scopes: ['global', 'organization', 'project']
    },
    {
      id: 'audit',
      label: 'Audit',
      keys: ['audit_cycle_frequency', 'audit_test_coverage_threshold', 'audit_dry_violation_limit', 'audit_type_error_limit', 'audit_dead_code_limit', 'audit_complexity_threshold', 'audit_enable_code_health', 'audit_enable_plan_health'],
      scopes: ['global', 'organization', 'project']
    },
    {
      id: 'yolo',
      label: 'YOLO',
      keys: ['yolo_max_cycles', 'yolo_max_cost_usd', 'yolo_max_duration_ms', 'yolo_auto_approve_review', 'yolo_auto_approve_dangerous_tools'],
      scopes: ['global', 'organization', 'project']
    },
    {
      id: 'terminal',
      label: 'Terminal',
      keys: ['terminal_cols', 'terminal_rows', 'terminal_font_size'],
      scopes: ['global', 'project']
    },
    {
      id: 'ui',
      label: 'UI',
      keys: ['theme', 'show_token_usage', 'max_concurrent_sessions', 'auto_save_interval'],
      scopes: ['global']
    },
    {
      id: 'logging',
      label: 'Logging',
      keys: ['log_level', 'output_format'],
      scopes: ['global', 'project']
    },
    {
      id: 'updates',
      label: 'Updates',
      keys: ['updates_auto_check', 'updates_auto_download', 'updates_auto_install', 'updates_check_interval', 'updates_channel', 'updates_allow_downgrade'],
      scopes: ['global', 'organization']
    }
  ]

  // Filter categories visible for the active scope
  let visibleCategories = $derived(categories.filter(c => c.scopes.includes(activeScope)))

  const settingLabels: Partial<Record<keyof NervSettings, string>> = {
    default_model: 'Default Model',
    default_max_tokens: 'Max Tokens (Context Window)',
    max_turns: 'Max Turns per Session',
    monthly_budget_usd: 'Monthly Budget (USD)',
    budget_warning_threshold: 'Warning Threshold (%)',
    budget_critical_threshold: 'Critical Threshold (%)',
    per_task_budget_default: 'Per-Task Budget Default (USD)',
    audit_cycle_frequency: 'Audit Cycle Frequency',
    audit_test_coverage_threshold: 'Test Coverage Threshold (%)',
    audit_dry_violation_limit: 'DRY Violation Limit',
    audit_type_error_limit: 'Type Error Limit',
    audit_dead_code_limit: 'Dead Code Limit',
    audit_complexity_threshold: 'Complexity Threshold',
    audit_enable_code_health: 'Enable Code Health Checks',
    audit_enable_plan_health: 'Enable Plan Health Checks',
    yolo_max_cycles: 'Max Cycles',
    yolo_max_cost_usd: 'Max Cost (USD)',
    yolo_max_duration_ms: 'Max Duration (ms)',
    yolo_auto_approve_review: 'Auto-approve Review',
    yolo_auto_approve_dangerous_tools: 'Auto-approve Dangerous Tools',
    terminal_cols: 'Columns',
    terminal_rows: 'Rows',
    terminal_font_size: 'Font Size',
    theme: 'Theme',
    show_token_usage: 'Show Token Usage',
    max_concurrent_sessions: 'Max Concurrent Sessions',
    auto_save_interval: 'Auto-save Interval (ms)',
    log_level: 'Log Level',
    output_format: 'Output Format',
    updates_auto_check: 'Auto-check for Updates',
    updates_auto_download: 'Auto-download Updates',
    updates_auto_install: 'Auto-install Updates',
    updates_check_interval: 'Check Interval (ms)',
    updates_channel: 'Update Channel',
    updates_allow_downgrade: 'Allow Downgrade'
  }

  async function loadSettings() {
    isLoading = true
    error = null
    try {
      const [allSettings, allWithSources] = await Promise.all([
        window.api.settingsHierarchy.getAll(),
        window.api.settingsHierarchy.getAllWithSources()
      ])
      settings = allSettings
      settingsWithSources = allWithSources

      // Load org info in parallel
      loadOrgInfo()
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load settings'
    } finally {
      isLoading = false
    }
  }

  async function loadOrgInfo() {
    try {
      const [configured, syncStatus, agents, skills] = await Promise.all([
        window.api.org.isConfigured(),
        window.api.org.getSyncStatus(),
        window.api.org.listAgents().catch(() => []),
        window.api.org.listSkills().catch(() => [])
      ])
      orgIsConfigured = configured
      orgSyncStatus = syncStatus
      orgAgents = agents
      orgSkills = skills
    } catch {
      // Org may not be configured
    }
  }

  async function handleOrgSync() {
    isSyncing = true
    try {
      const result = await window.api.org.sync()
      if (result.success) {
        saveStatus = 'Organization config synced'
        await loadOrgInfo()
      } else {
        error = result.error ?? 'Sync failed'
      }
      setTimeout(() => { saveStatus = null }, 2000)
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to sync org config'
    } finally {
      isSyncing = false
    }
  }

  function formatSyncTime(dateStr: string | null): string {
    if (!dateStr) return 'Never'
    const d = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours > 24) return d.toLocaleDateString()
    if (diffHours > 0) return `${diffHours}h ago`
    if (diffMins > 0) return `${diffMins}m ago`
    return 'Just now'
  }

  // Check if any settings come from organization
  let hasOrgOverrides = $derived(
    settingsWithSources
      ? Object.values(settingsWithSources).some(s => s.source === 'organization')
      : false
  )

  function getSaveScope(): 'global' | 'project' {
    // Org and repo scopes are read-only in the UI; save targets the active editable scope
    if (activeScope === 'project') return 'project'
    return 'global'
  }

  async function handleSave(key: keyof NervSettings, value: unknown) {
    saveStatus = null
    const scope = getSaveScope()
    try {
      if (scope === 'global') {
        await window.api.settingsHierarchy.setGlobal(key, value as NervSettings[typeof key])
      } else {
        await window.api.settingsHierarchy.setProject(key, value as NervSettings[typeof key])
      }
      saveStatus = `Saved ${String(key)} (${scope})`
      await loadSettings()
      setTimeout(() => { saveStatus = null }, 2000)
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to save setting'
    }
  }

  async function handleReset(key: keyof NervSettings, source: SettingsSource) {
    try {
      if (source === 'project' || activeScope === 'project') {
        await window.api.settingsHierarchy.unsetProject(key)
      } else {
        await window.api.settingsHierarchy.unsetGlobal(key)
      }
      saveStatus = `Reset ${String(key)}`
      await loadSettings()
      setTimeout(() => { saveStatus = null }, 2000)
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to reset setting'
    }
  }

  function getSourceColor(source: SettingsSource): string {
    switch (source) {
      case 'default': return 'var(--color-nerv-text-dim)'
      case 'global': return 'var(--color-nerv-info)'
      case 'organization': return '#c77dff'
      case 'project': return 'var(--color-nerv-success)'
      case 'environment': return 'var(--color-nerv-warning)'
      case 'task': return 'var(--color-nerv-primary)'
      default: return 'var(--color-nerv-text-muted)'
    }
  }

  function getScopeColor(scope: SettingsScope): string {
    switch (scope) {
      case 'global': return 'var(--color-nerv-info)'
      case 'organization': return '#c77dff'
      case 'project': return 'var(--color-nerv-success)'
      case 'repo': return 'var(--color-nerv-warning)'
    }
  }

  // Check if a setting is overridden at a higher priority scope than current
  function isOverridden(source: SettingsSource): boolean {
    const priority: SettingsSource[] = ['default', 'global', 'organization', 'project', 'repo', 'environment', 'task']
    const scopeIndex = priority.indexOf(activeScope)
    const sourceIndex = priority.indexOf(source)
    return sourceIndex > scopeIndex
  }

  // Check if the current scope is read-only
  let isReadOnly = $derived(activeScope === 'organization' || activeScope === 'repo')

  function getSettingType(key: keyof NervSettings): 'boolean' | 'number' | 'select' | 'string' {
    if (typeof settings?.[key] === 'boolean') return 'boolean'
    if (typeof settings?.[key] === 'number') return 'number'
    if (key === 'default_model' || key === 'theme' || key === 'log_level' || key === 'output_format' || key === 'updates_channel') return 'select'
    return 'string'
  }

  function getSelectOptions(key: keyof NervSettings): string[] {
    switch (key) {
      case 'default_model': return ['sonnet', 'opus', 'haiku']
      case 'theme': return ['light', 'dark', 'system']
      case 'log_level': return ['debug', 'info', 'warn', 'error']
      case 'output_format': return ['text', 'json']
      case 'updates_channel': return ['stable', 'beta', 'alpha']
      default: return []
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && isOpen) {
      onClose()
    }
  }

  function handleBackdropClick(event: MouseEvent) {
    if ((event.target as HTMLElement).classList.contains('modal-backdrop')) {
      onClose()
    }
  }

  // Reset active category when scope changes if it's not available
  $effect(() => {
    if (visibleCategories.length > 0 && !visibleCategories.find(c => c.id === activeCategory)) {
      activeCategory = visibleCategories[0].id
    }
  })

  $effect(() => {
    if (isOpen) {
      loadSettings()
    }
  })
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="modal-backdrop" onclick={handleBackdropClick} role="presentation">
    <div class="modal" data-testid="settings-panel">
      <header class="modal-header">
        <h2>Settings</h2>
        <div class="header-actions">
          {#if saveStatus}
            <span class="save-status">{saveStatus}</span>
          {/if}
          <button class="close-btn" onclick={onClose} title="Close">&times;</button>
        </div>
      </header>

      <!-- PRD Section 12.3: Scope tabs -->
      <div class="scope-tabs" data-testid="scope-tabs">
        {#each scopeTabs as tab (tab.id)}
          <button
            class="scope-tab"
            class:active={activeScope === tab.id}
            onclick={() => activeScope = tab.id}
            title={tab.description}
            data-testid={`scope-tab-${tab.id}`}
            style="--scope-color: {getScopeColor(tab.id)}"
          >
            {tab.label}
          </button>
        {/each}
      </div>

      <!-- Scope description -->
      <div class="scope-description">
        {scopeTabs.find(t => t.id === activeScope)?.description}
        {#if isReadOnly}
          <span class="read-only-badge">Read-only</span>
        {/if}
      </div>

      <!-- PRD Section 20: Org managed warning -->
      {#if hasOrgOverrides && activeScope !== 'organization'}
        <div class="org-warning" data-testid="org-managed-warning">
          <span class="org-warning-icon">!</span>
          <span class="org-warning-text">Some settings are managed by your organization</span>
        </div>
      {/if}

      <!-- PRD Section 20: Organization info panel (shown in org scope) -->
      {#if activeScope === 'organization' && orgIsConfigured && orgSyncStatus}
        <div class="org-info-panel" data-testid="org-info-panel">
          <div class="org-info-grid">
            <div class="org-info-item">
              <span class="org-info-label">Source</span>
              <span class="org-info-value">
                {orgSyncStatus.configSource?.type === 'git'
                  ? orgSyncStatus.configSource.url ?? 'Git repo'
                  : orgSyncStatus.configSource?.path ?? 'Local'}
              </span>
            </div>
            <div class="org-info-item">
              <span class="org-info-label">Last Sync</span>
              <span class="org-info-value">{formatSyncTime(orgSyncStatus.lastSyncTime)}</span>
            </div>
            <div class="org-info-item">
              <span class="org-info-label">Status</span>
              <span class="org-info-value" class:sync-ok={orgSyncStatus.lastSyncSuccess} class:sync-error={!orgSyncStatus.lastSyncSuccess && orgSyncStatus.lastSyncTime !== null}>
                {orgSyncStatus.lastSyncSuccess ? 'Synced' : orgSyncStatus.lastSyncTime ? 'Error' : 'Not synced'}
              </span>
            </div>
            <div class="org-info-item">
              <span class="org-info-label">Agents</span>
              <span class="org-info-value">{orgAgents.length > 0 ? orgAgents.join(', ') : 'None'}</span>
            </div>
            <div class="org-info-item">
              <span class="org-info-label">Skills</span>
              <span class="org-info-value">{orgSkills.length > 0 ? orgSkills.join(', ') : 'None'}</span>
            </div>
          </div>
          <button
            class="sync-btn"
            onclick={handleOrgSync}
            disabled={isSyncing}
            data-testid="org-sync-btn"
          >
            {isSyncing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
      {/if}

      <div class="modal-body">
        <nav class="category-nav">
          {#each visibleCategories as cat}
            <button
              class="category-btn"
              class:active={activeCategory === cat.id}
              onclick={() => activeCategory = cat.id}
            >
              {cat.label}
            </button>
          {/each}
        </nav>

        <div class="settings-content">
          {#if isLoading}
            <div class="loading">Loading settings...</div>
          {:else if error}
            <div class="error-msg">{error}</div>
          {:else if settings && settingsWithSources}
            {#each visibleCategories as cat}
              {#if activeCategory === cat.id}
                <div class="settings-group">
                  {#each cat.keys as key}
                    {@const resolved = settingsWithSources[key]}
                    {@const settingType = getSettingType(key)}
                    {@const overridden = isOverridden(resolved.source)}
                    <div class="setting-row" class:overridden>
                      <div class="setting-info">
                        <label class="setting-label">{settingLabels[key] || String(key)}</label>
                        <div class="setting-meta">
                          <span class="setting-source" style="color: {getSourceColor(resolved.source)}">
                            {resolved.source}
                          </span>
                          {#if overridden}
                            <span class="override-indicator" title="This value is overridden by a higher-priority scope">
                              overridden by {resolved.source}
                            </span>
                          {/if}
                        </div>
                      </div>
                      <div class="setting-control">
                        {#if isReadOnly}
                          <span class="setting-value-readonly">
                            {String(settings[key] ?? '--')}
                          </span>
                        {:else if settingType === 'boolean'}
                          <label class="toggle">
                            <input
                              type="checkbox"
                              checked={Boolean(settings[key])}
                              onchange={(e) => handleSave(key, (e.target as HTMLInputElement).checked)}
                            />
                            <span class="toggle-slider"></span>
                          </label>
                        {:else if settingType === 'select'}
                          <select
                            class="setting-select"
                            value={String(settings[key])}
                            onchange={(e) => handleSave(key, (e.target as HTMLSelectElement).value)}
                          >
                            {#each getSelectOptions(key) as opt}
                              <option value={opt}>{opt}</option>
                            {/each}
                          </select>
                        {:else if settingType === 'number'}
                          <input
                            type="number"
                            class="setting-input"
                            value={Number(settings[key])}
                            onchange={(e) => handleSave(key, Number((e.target as HTMLInputElement).value))}
                          />
                        {:else}
                          <input
                            type="text"
                            class="setting-input"
                            value={String(settings[key] ?? '')}
                            onchange={(e) => handleSave(key, (e.target as HTMLInputElement).value)}
                          />
                        {/if}
                        {#if !isReadOnly && resolved.source !== 'default'}
                          <button
                            class="reset-btn"
                            title="Reset to default"
                            onclick={() => handleReset(key, resolved.source)}
                          >
                            &times;
                          </button>
                        {/if}
                      </div>
                    </div>
                  {/each}
                </div>
              {/if}
            {/each}
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--z-nerv-modal-overlay);
  }

  .modal {
    background: var(--color-nerv-panel);
    border: 1px solid var(--color-nerv-border);
    border-radius: var(--radius-nerv-xl);
    width: 90%;
    max-width: 750px;
    max-height: 85vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--color-nerv-border);
  }

  .modal-header h2 {
    font-size: 16px;
    font-weight: 600;
    color: var(--color-nerv-text);
    margin: 0;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .save-status {
    font-size: 12px;
    color: var(--color-nerv-success);
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--color-nerv-text-dim);
    font-size: 18px;
    cursor: pointer;
    padding: 4px 8px;
    line-height: 1;
  }

  .close-btn:hover {
    color: var(--color-nerv-text);
  }

  /* PRD Section 12.3: Scope tabs */
  .scope-tabs {
    display: flex;
    gap: 0;
    padding: 0 20px;
    background: var(--color-nerv-bg);
    border-bottom: 1px solid var(--color-nerv-border);
    flex-shrink: 0;
  }

  .scope-tab {
    padding: 10px 16px;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--color-nerv-text-muted);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--transition-nerv-fast);
  }

  .scope-tab:hover {
    color: var(--color-nerv-text);
    background: var(--color-nerv-panel-hover);
  }

  .scope-tab.active {
    color: var(--scope-color);
    border-bottom-color: var(--scope-color);
  }

  .scope-description {
    padding: 6px 20px;
    font-size: 11px;
    color: var(--color-nerv-text-dim);
    background: var(--color-nerv-bg);
    border-bottom: 1px solid var(--color-nerv-border);
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .read-only-badge {
    padding: 1px 6px;
    background: var(--color-nerv-warning-bg);
    color: var(--color-nerv-warning);
    border-radius: 3px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .modal-body {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  .category-nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 12px;
    border-right: 1px solid var(--color-nerv-border);
    min-width: 120px;
    overflow-y: auto;
  }

  .category-btn {
    background: none;
    border: none;
    color: var(--color-nerv-text-muted);
    padding: 8px 12px;
    border-radius: var(--radius-nerv-sm);
    cursor: pointer;
    text-align: left;
    font-size: 13px;
    transition: all var(--transition-nerv-fast);
  }

  .category-btn:hover {
    background: var(--color-nerv-panel-hover);
    color: var(--color-nerv-text);
  }

  .category-btn.active {
    background: var(--color-nerv-panel-hover);
    color: var(--color-nerv-primary);
    font-weight: 500;
  }

  .settings-content {
    flex: 1;
    padding: 16px 20px;
    overflow-y: auto;
  }

  .loading, .error-msg {
    text-align: center;
    padding: 40px 20px;
    color: var(--color-nerv-text-muted);
  }

  .error-msg {
    color: var(--color-nerv-error);
  }

  .settings-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-radius: var(--radius-nerv-sm);
    transition: background var(--transition-nerv-fast);
  }

  .setting-row:hover {
    background: var(--color-nerv-bg);
  }

  .setting-row.overridden {
    opacity: 0.6;
  }

  .setting-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .setting-label {
    font-size: 13px;
    color: var(--color-nerv-text);
  }

  .setting-meta {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .setting-source {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .override-indicator {
    font-size: 10px;
    color: var(--color-nerv-warning);
    font-style: italic;
  }

  .setting-control {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .setting-value-readonly {
    padding: 6px 10px;
    font-size: 13px;
    color: var(--color-nerv-text-muted);
    font-family: 'SF Mono', Monaco, 'Courier New', monospace;
  }

  .setting-input {
    width: 140px;
    padding: 6px 10px;
    background: var(--color-nerv-bg);
    border: 1px solid var(--color-nerv-border);
    border-radius: var(--radius-nerv-sm);
    color: var(--color-nerv-text);
    font-size: 13px;
  }

  .setting-input:focus {
    outline: none;
    border-color: var(--color-nerv-primary);
  }

  .setting-select {
    padding: 6px 10px;
    background: var(--color-nerv-border);
    border: 1px solid var(--color-nerv-border);
    border-radius: var(--radius-nerv-sm);
    color: var(--color-nerv-text);
    cursor: pointer;
    font-size: 13px;
  }

  .setting-select:hover {
    background: var(--color-nerv-border-hover);
  }

  .toggle {
    position: relative;
    display: inline-block;
    width: 40px;
    height: 22px;
    cursor: pointer;
  }

  .toggle input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .toggle-slider {
    position: absolute;
    inset: 0;
    background: var(--color-nerv-border);
    border-radius: 11px;
    transition: background var(--transition-nerv-fast);
  }

  .toggle-slider::before {
    content: '';
    position: absolute;
    width: 16px;
    height: 16px;
    left: 3px;
    bottom: 3px;
    background: var(--color-nerv-text);
    border-radius: 50%;
    transition: transform var(--transition-nerv-fast);
  }

  .toggle input:checked + .toggle-slider {
    background: var(--color-nerv-primary);
  }

  .toggle input:checked + .toggle-slider::before {
    transform: translateX(18px);
  }

  .reset-btn {
    background: none;
    border: none;
    color: var(--color-nerv-text-dim);
    cursor: pointer;
    font-size: 14px;
    padding: 2px 6px;
    border-radius: var(--radius-nerv-sm);
  }

  .reset-btn:hover {
    background: var(--color-nerv-error-bg);
    color: var(--color-nerv-error);
  }

  /* PRD Section 20: Organization warning banner */
  .org-warning {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 20px;
    background: rgba(199, 125, 255, 0.08);
    border-bottom: 1px solid var(--color-nerv-border);
    font-size: 12px;
    color: #c77dff;
    flex-shrink: 0;
  }

  .org-warning-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    background: rgba(199, 125, 255, 0.2);
    border-radius: 50%;
    font-size: 11px;
    font-weight: 700;
    flex-shrink: 0;
  }

  .org-warning-text {
    color: #c77dff;
  }

  /* PRD Section 20: Organization info panel */
  .org-info-panel {
    padding: 12px 20px;
    background: var(--color-nerv-bg);
    border-bottom: 1px solid var(--color-nerv-border);
    display: flex;
    align-items: flex-start;
    gap: 16px;
    flex-shrink: 0;
  }

  .org-info-grid {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px 16px;
  }

  .org-info-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .org-info-label {
    font-size: 10px;
    color: var(--color-nerv-text-dim);
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .org-info-value {
    font-size: 12px;
    color: var(--color-nerv-text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .org-info-value.sync-ok {
    color: var(--color-nerv-success);
  }

  .org-info-value.sync-error {
    color: var(--color-nerv-error);
  }

  .sync-btn {
    padding: 6px 14px;
    background: rgba(199, 125, 255, 0.15);
    border: 1px solid rgba(199, 125, 255, 0.3);
    border-radius: var(--radius-nerv-sm);
    color: #c77dff;
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
    transition: all var(--transition-nerv-fast);
    align-self: center;
  }

  .sync-btn:hover:not(:disabled) {
    background: rgba(199, 125, 255, 0.25);
  }

  .sync-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Responsive: stack layout on narrow screens */
  @media (max-width: 600px) {
    .modal {
      width: 95%;
      max-height: 90vh;
    }

    .modal-body {
      flex-direction: column;
    }

    .category-nav {
      flex-direction: row;
      border-right: none;
      border-bottom: 1px solid var(--color-nerv-border);
      min-width: 0;
      overflow-x: auto;
      padding: 8px;
      gap: 4px;
    }

    .setting-row {
      flex-direction: column;
      align-items: flex-start;
      gap: 6px;
    }

    .setting-input {
      width: 100%;
    }

    .org-info-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
