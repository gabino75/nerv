<script lang="ts">
  import type { OrgSyncStatus, OrganizationConfig, OrganizationSettings } from '../../../shared/types/settings'

  interface Props {
    isOpen: boolean
    onClose: () => void
  }

  let { isOpen, onClose }: Props = $props()

  let config = $state<OrganizationConfig | null>(null)
  let status = $state<OrgSyncStatus | null>(null)
  let settings = $state<OrganizationSettings | null>(null)
  let agents = $state<string[]>([])
  let skills = $state<string[]>([])
  let workflows = $state<string[]>([])
  let isLoading = $state(true)
  let isSyncing = $state(false)
  let error = $state<string | null>(null)
  let syncResult = $state<{ success: boolean; error?: string } | null>(null)

  async function loadOrgData() {
    isLoading = true
    error = null
    syncResult = null
    try {
      const [orgConfig, syncStatus, orgSettings, orgAgents, orgSkills, orgWorkflows] = await Promise.all([
        window.api.org.getConfig(),
        window.api.org.getSyncStatus(),
        window.api.org.loadSettings(),
        window.api.org.listAgents(),
        window.api.org.listSkills(),
        window.api.org.listWorkflows()
      ])
      config = orgConfig
      status = syncStatus
      settings = orgSettings
      agents = orgAgents
      skills = orgSkills
      workflows = orgWorkflows
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load organization config'
    } finally {
      isLoading = false
    }
  }

  async function handleSync() {
    isSyncing = true
    syncResult = null
    try {
      const result = await window.api.org.sync()
      syncResult = result
      // Reload data after sync
      if (result.success) {
        await loadOrgData()
      }
    } catch (err) {
      syncResult = { success: false, error: err instanceof Error ? err.message : 'Sync failed' }
    } finally {
      isSyncing = false
    }
  }

  $effect(() => {
    if (isOpen) {
      loadOrgData()
    }
  })

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return 'Never'
    const date = new Date(dateStr)
    return date.toLocaleString()
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
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <div class="modal-backdrop" onclick={handleBackdropClick} role="presentation">
    <div class="modal">
      <header class="modal-header">
        <h2>Organization Configuration</h2>
        <button class="close-btn" onclick={onClose} title="Close">x</button>
      </header>

      <div class="modal-content">
        {#if isLoading}
          <div class="loading">Loading organization config...</div>
        {:else if error}
          <div class="error">{error}</div>
        {:else if !config || !status?.configured}
          <div class="not-configured">
            <div class="status-icon">
              <span class="icon">--</span>
            </div>
            <h3>Organization Not Configured</h3>
            <p>No organization configuration found.</p>
            <p class="hint">
              Configure org settings in <code>~/.nerv/config.json</code> or via the <code>nerv org</code> CLI commands.
            </p>
            <div class="config-example">
              <p class="example-title">Example config:</p>
              <pre>{`{
  "org_name": "my-company",
  "org_config_source_type": "git",
  "org_config_url": "git@github.com:my-company/nerv-config.git",
  "org_auto_sync_enabled": true
}`}</pre>
            </div>
          </div>
        {:else}
          <!-- Organization Info -->
          <section class="section">
            <h3 class="section-title">Organization</h3>
            <div class="info-row">
              <span class="label">Name</span>
              <span class="value">{config.name}</span>
            </div>
            <div class="info-row">
              <span class="label">Source Type</span>
              <span class="value badge" class:badge-git={config.configSource.type === 'git'} class:badge-local={config.configSource.type === 'local'}>
                {config.configSource.type}
              </span>
            </div>
            {#if config.configSource.type === 'git'}
              <div class="info-row">
                <span class="label">Repository</span>
                <span class="value mono">{config.configSource.url || 'Not set'}</span>
              </div>
              {#if config.configSource.branch}
                <div class="info-row">
                  <span class="label">Branch</span>
                  <span class="value mono">{config.configSource.branch}</span>
                </div>
              {/if}
            {:else}
              <div class="info-row">
                <span class="label">Local Path</span>
                <span class="value mono">{config.configSource.path || config.configSource.url || 'Not set'}</span>
              </div>
            {/if}
          </section>

          <!-- Sync Status -->
          <section class="section">
            <h3 class="section-title">Sync Status</h3>
            <div class="sync-status" class:success={status.lastSyncSuccess} class:error={status.lastSyncTime && !status.lastSyncSuccess}>
              <div class="status-indicator">
                {#if status.lastSyncSuccess}
                  <span class="status-dot success"></span>
                  <span>Synced</span>
                {:else if status.lastSyncTime}
                  <span class="status-dot error"></span>
                  <span>Sync Failed</span>
                {:else}
                  <span class="status-dot pending"></span>
                  <span>Not Synced</span>
                {/if}
              </div>
              <div class="info-row">
                <span class="label">Last Sync</span>
                <span class="value">{formatDate(status.lastSyncTime)}</span>
              </div>
              {#if status.lastSyncError}
                <div class="sync-error">
                  <span class="label">Error</span>
                  <span class="value error-text">{status.lastSyncError}</span>
                </div>
              {/if}
            </div>

            <!-- Auto-sync settings -->
            <div class="auto-sync">
              <div class="info-row">
                <span class="label">Auto-sync</span>
                <span class="value badge" class:badge-enabled={config.autoSync.enabled} class:badge-disabled={!config.autoSync.enabled}>
                  {config.autoSync.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              {#if config.autoSync.enabled}
                <div class="auto-sync-details">
                  {#if config.autoSync.onAppStart}
                    <span class="tag">On app start</span>
                  {/if}
                  {#if config.autoSync.onProjectOpen}
                    <span class="tag">On project open</span>
                  {/if}
                  {#if config.autoSync.intervalMinutes > 0}
                    <span class="tag">Every {config.autoSync.intervalMinutes}m</span>
                  {/if}
                </div>
              {/if}
            </div>

            <!-- Sync button -->
            <button class="sync-btn" onclick={handleSync} disabled={isSyncing}>
              {isSyncing ? 'Syncing...' : 'Sync Now'}
            </button>
            {#if syncResult}
              <div class="sync-result" class:success={syncResult.success} class:error={!syncResult.success}>
                {syncResult.success ? 'Sync completed successfully' : syncResult.error || 'Sync failed'}
              </div>
            {/if}
          </section>

          <!-- Org Settings -->
          {#if settings}
            <section class="section">
              <h3 class="section-title">Org Settings</h3>
              {#if settings.defaults}
                <div class="subsection">
                  <h4>Defaults</h4>
                  {#if settings.defaults.model}
                    <div class="info-row">
                      <span class="label">Model</span>
                      <span class="value">{settings.defaults.model}</span>
                    </div>
                  {/if}
                  {#if settings.defaults.reviewMode}
                    <div class="info-row">
                      <span class="label">Review Mode</span>
                      <span class="value">{settings.defaults.reviewMode}</span>
                    </div>
                  {/if}
                  {#if settings.defaults.auditFrequency}
                    <div class="info-row">
                      <span class="label">Audit Frequency</span>
                      <span class="value">Every {settings.defaults.auditFrequency} cycles</span>
                    </div>
                  {/if}
                </div>
              {/if}
              {#if settings.costLimits}
                <div class="subsection">
                  <h4>Cost Limits</h4>
                  {#if settings.costLimits.perTaskMax}
                    <div class="info-row">
                      <span class="label">Per Task Max</span>
                      <span class="value">${settings.costLimits.perTaskMax}</span>
                    </div>
                  {/if}
                  {#if settings.costLimits.perDayMax}
                    <div class="info-row">
                      <span class="label">Per Day Max</span>
                      <span class="value">${settings.costLimits.perDayMax}</span>
                    </div>
                  {/if}
                  {#if settings.costLimits.perMonthMax}
                    <div class="info-row">
                      <span class="label">Per Month Max</span>
                      <span class="value">${settings.costLimits.perMonthMax}</span>
                    </div>
                  {/if}
                </div>
              {/if}
            </section>
          {/if}

          <!-- Available Resources -->
          {#if agents.length > 0 || skills.length > 0 || workflows.length > 0}
            <section class="section">
              <h3 class="section-title">Org Resources</h3>
              {#if agents.length > 0}
                <div class="resource-list">
                  <span class="resource-label">Agents</span>
                  <div class="resource-items">
                    {#each agents as agent}
                      <span class="resource-item">{agent}</span>
                    {/each}
                  </div>
                </div>
              {/if}
              {#if skills.length > 0}
                <div class="resource-list">
                  <span class="resource-label">Skills</span>
                  <div class="resource-items">
                    {#each skills as skill}
                      <span class="resource-item">{skill}</span>
                    {/each}
                  </div>
                </div>
              {/if}
              {#if workflows.length > 0}
                <div class="resource-list">
                  <span class="resource-label">Workflows</span>
                  <div class="resource-items">
                    {#each workflows as workflow}
                      <span class="resource-item">{workflow}</span>
                    {/each}
                  </div>
                </div>
              {/if}
            </section>
          {/if}

          <!-- Cache Path -->
          {#if status.localCachePath}
            <section class="section">
              <h3 class="section-title">Cache</h3>
              <div class="info-row">
                <span class="label">Local Cache</span>
                <span class="value mono">{status.localCachePath}</span>
              </div>
            </section>
          {/if}
        {/if}
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
    z-index: 1000;
  }

  .modal {
    background: #12121a;
    border: 1px solid #2a2a3a;
    border-radius: 12px;
    width: 90%;
    max-width: 550px;
    max-height: 80vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid #2a2a3a;
  }

  .modal-header h2 {
    font-size: 16px;
    font-weight: 600;
    color: #e0e0e0;
    margin: 0;
  }

  .close-btn {
    background: none;
    border: none;
    color: #666;
    font-size: 18px;
    cursor: pointer;
    padding: 4px 8px;
    line-height: 1;
  }

  .close-btn:hover {
    color: #e0e0e0;
  }

  .modal-content {
    padding: 20px;
    overflow-y: auto;
  }

  .loading, .error {
    text-align: center;
    padding: 40px 20px;
    color: #888;
  }

  .error {
    color: #ef4444;
  }

  .not-configured {
    text-align: center;
    padding: 20px;
  }

  .status-icon {
    margin-bottom: 16px;
  }

  .status-icon .icon {
    font-size: 32px;
    color: #555;
  }

  .not-configured h3 {
    font-size: 16px;
    color: #e0e0e0;
    margin: 0 0 8px;
  }

  .not-configured p {
    color: #888;
    font-size: 13px;
    margin: 0;
  }

  .hint {
    margin-top: 12px !important;
    color: #666 !important;
  }

  .hint code {
    background: #1a1a24;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 12px;
  }

  .config-example {
    margin-top: 20px;
    text-align: left;
    background: #0a0a0f;
    border: 1px solid #2a2a3a;
    border-radius: 8px;
    padding: 12px;
  }

  .example-title {
    font-size: 11px;
    color: #666;
    margin-bottom: 8px !important;
  }

  .config-example pre {
    font-size: 11px;
    color: #888;
    margin: 0;
    overflow-x: auto;
  }

  .section {
    margin-bottom: 20px;
    padding-bottom: 16px;
    border-bottom: 1px solid #1a1a24;
  }

  .section:last-child {
    margin-bottom: 0;
    padding-bottom: 0;
    border-bottom: none;
  }

  .section-title {
    font-size: 12px;
    font-weight: 600;
    color: #ff6b35;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0 0 12px;
  }

  .subsection {
    margin-top: 12px;
    padding-left: 12px;
    border-left: 2px solid #2a2a3a;
  }

  .subsection h4 {
    font-size: 11px;
    color: #888;
    margin: 0 0 8px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .info-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 6px 0;
  }

  .label {
    font-size: 12px;
    color: #666;
  }

  .value {
    font-size: 13px;
    color: #e0e0e0;
    text-align: right;
    word-break: break-word;
    max-width: 60%;
  }

  .value.mono {
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    font-size: 11px;
  }

  .badge {
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 500;
  }

  .badge-git {
    background: rgba(139, 92, 246, 0.2);
    color: #a78bfa;
  }

  .badge-local {
    background: rgba(59, 130, 246, 0.2);
    color: #60a5fa;
  }

  .badge-enabled {
    background: rgba(34, 197, 94, 0.2);
    color: #4ade80;
  }

  .badge-disabled {
    background: rgba(107, 114, 128, 0.2);
    color: #9ca3af;
  }

  .sync-status {
    background: #0a0a0f;
    border: 1px solid #2a2a3a;
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 12px;
  }

  .sync-status.success {
    border-color: rgba(34, 197, 94, 0.3);
  }

  .sync-status.error {
    border-color: rgba(239, 68, 68, 0.3);
  }

  .status-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    font-size: 13px;
    color: #e0e0e0;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .status-dot.success {
    background: #4ade80;
  }

  .status-dot.error {
    background: #ef4444;
  }

  .status-dot.pending {
    background: #6b7280;
  }

  .sync-error {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid #1a1a24;
  }

  .error-text {
    color: #ef4444 !important;
    font-size: 12px !important;
  }

  .auto-sync {
    margin-bottom: 12px;
  }

  .auto-sync-details {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
  }

  .tag {
    font-size: 10px;
    padding: 2px 6px;
    background: #1a1a24;
    border-radius: 4px;
    color: #888;
  }

  .sync-btn {
    width: 100%;
    padding: 10px;
    background: #ff6b35;
    border: none;
    border-radius: 6px;
    color: white;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s;
  }

  .sync-btn:hover:not(:disabled) {
    background: #ff8c5a;
  }

  .sync-btn:disabled {
    background: #4a4a5a;
    cursor: not-allowed;
  }

  .sync-result {
    margin-top: 8px;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 12px;
    text-align: center;
  }

  .sync-result.success {
    background: rgba(34, 197, 94, 0.1);
    color: #4ade80;
  }

  .sync-result.error {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
  }

  .resource-list {
    margin-bottom: 12px;
  }

  .resource-list:last-child {
    margin-bottom: 0;
  }

  .resource-label {
    font-size: 11px;
    color: #666;
    display: block;
    margin-bottom: 6px;
  }

  .resource-items {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .resource-item {
    font-size: 11px;
    padding: 4px 8px;
    background: #1a1a24;
    border: 1px solid #2a2a3a;
    border-radius: 4px;
    color: #e0e0e0;
  }
</style>
