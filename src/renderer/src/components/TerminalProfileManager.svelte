<script lang="ts">
  import type { TerminalProfile } from '../../../shared/types/terminal'

  interface Props {
    isOpen: boolean
    onClose: () => void
  }

  let { isOpen, onClose }: Props = $props()

  let profiles = $state<TerminalProfile[]>([])
  let isLoading = $state(true)
  let error = $state<string | null>(null)
  let editingProfile = $state<TerminalProfile | null>(null)
  let isCreating = $state(false)

  // Form state for add/edit
  let formName = $state('')
  let formShell = $state('')
  let formArgs = $state('')
  let formEnv = $state('')
  let formCwd = $state('')
  let formIcon = $state('')

  let customProfiles = $derived(profiles.filter(p => p.source === 'custom'))
  let builtInProfiles = $derived(profiles.filter(p => p.source === 'built-in' || p.isBuiltIn))
  let orgProfiles = $derived(profiles.filter(p => p.source === 'organization'))

  async function loadProfiles() {
    isLoading = true
    error = null
    try {
      profiles = await window.api.terminal.profiles.list()
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load profiles'
      profiles = []
    } finally {
      isLoading = false
    }
  }

  function resetForm() {
    formName = ''
    formShell = ''
    formArgs = ''
    formEnv = ''
    formCwd = ''
    formIcon = ''
    editingProfile = null
    isCreating = false
  }

  function startCreate() {
    resetForm()
    isCreating = true
  }

  function startEdit(profile: TerminalProfile) {
    formName = profile.name
    formShell = profile.shell
    formArgs = profile.args?.join(' ') ?? ''
    formEnv = profile.env ? Object.entries(profile.env).map(([k, v]) => `${k}=${v}`).join('\n') : ''
    formCwd = profile.cwd ?? ''
    formIcon = profile.icon ?? ''
    editingProfile = profile
    isCreating = false
  }

  function parseEnv(envStr: string): Record<string, string> | undefined {
    if (!envStr.trim()) return undefined
    const result: Record<string, string> = {}
    for (const line of envStr.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx > 0) {
        result[trimmed.substring(0, eqIdx)] = trimmed.substring(eqIdx + 1)
      }
    }
    return Object.keys(result).length > 0 ? result : undefined
  }

  async function handleSave() {
    if (!formName.trim() || !formShell.trim()) {
      error = 'Name and shell command are required'
      return
    }

    error = null
    const profileData: TerminalProfile = {
      id: editingProfile?.id ?? `custom-${Date.now()}`,
      name: formName.trim(),
      shell: formShell.trim(),
      args: formArgs.trim() ? formArgs.trim().split(/\s+/) : undefined,
      env: parseEnv(formEnv),
      cwd: formCwd.trim() || undefined,
      icon: formIcon.trim() || undefined,
      source: 'custom'
    }

    try {
      if (editingProfile) {
        await window.api.terminal.profiles.update(profileData)
      } else {
        await window.api.terminal.profiles.add(profileData)
      }
      resetForm()
      await loadProfiles()
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to save profile'
    }
  }

  async function handleDelete(profileId: string) {
    error = null
    try {
      await window.api.terminal.profiles.remove(profileId)
      if (editingProfile?.id === profileId) {
        resetForm()
      }
      await loadProfiles()
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to delete profile'
    }
  }

  async function handleSetDefault(profileId: string) {
    error = null
    try {
      await window.api.terminal.profiles.setDefault(profileId)
      await loadProfiles()
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to set default profile'
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && isOpen) {
      if (isCreating || editingProfile) {
        resetForm()
      } else {
        onClose()
      }
    }
  }

  function handleBackdropClick(event: MouseEvent) {
    if ((event.target as HTMLElement).classList.contains('modal-backdrop')) {
      onClose()
    }
  }

  $effect(() => {
    if (isOpen) {
      loadProfiles()
      resetForm()
    }
  })
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="modal-backdrop" onclick={handleBackdropClick} role="presentation">
    <div class="modal" data-testid="profile-manager">
      <header class="modal-header">
        <h2>Terminal Profiles</h2>
        <button class="close-btn" onclick={onClose} title="Close">&times;</button>
      </header>

      <div class="modal-body">
        <!-- Profile List -->
        <div class="profile-list">
          {#if isLoading}
            <div class="loading">Loading profiles...</div>
          {:else if error && profiles.length === 0}
            <div class="error-msg">{error}</div>
          {:else}
            {#if builtInProfiles.length > 0}
              <div class="section-header">Built-in</div>
              {#each builtInProfiles as profile (profile.id)}
                <div
                  class="profile-item"
                  class:active={editingProfile?.id === profile.id}
                  data-testid={`profile-item-${profile.id}`}
                >
                  <div class="profile-info">
                    <span class="profile-name">{profile.name}</span>
                    <span class="profile-shell">{profile.shell}</span>
                  </div>
                  <div class="profile-actions">
                    {#if profile.isDefault}
                      <span class="default-badge">default</span>
                    {:else}
                      <button
                        class="action-btn"
                        onclick={() => handleSetDefault(profile.id)}
                        title="Set as default"
                      >
                        Set Default
                      </button>
                    {/if}
                  </div>
                </div>
              {/each}
            {/if}

            {#if orgProfiles.length > 0}
              <div class="section-header">Organization</div>
              {#each orgProfiles as profile (profile.id)}
                <div class="profile-item" data-testid={`profile-item-${profile.id}`}>
                  <div class="profile-info">
                    <span class="profile-name">{profile.name}</span>
                    <span class="profile-shell">{profile.shell}</span>
                  </div>
                  <div class="profile-actions">
                    {#if profile.isDefault}
                      <span class="default-badge">default</span>
                    {/if}
                  </div>
                </div>
              {/each}
            {/if}

            <div class="section-header">
              Custom
              <button
                class="add-btn"
                onclick={startCreate}
                data-testid="add-profile-btn"
                title="Add custom profile"
              >
                + Add
              </button>
            </div>
            {#if customProfiles.length === 0}
              <div class="empty-custom">No custom profiles yet</div>
            {:else}
              {#each customProfiles as profile (profile.id)}
                <div
                  class="profile-item"
                  class:active={editingProfile?.id === profile.id}
                  data-testid={`profile-item-${profile.id}`}
                >
                  <div class="profile-info">
                    <span class="profile-name">{profile.name}</span>
                    <span class="profile-shell">{profile.shell}</span>
                  </div>
                  <div class="profile-actions">
                    {#if profile.isDefault}
                      <span class="default-badge">default</span>
                    {:else}
                      <button
                        class="action-btn"
                        onclick={() => handleSetDefault(profile.id)}
                        title="Set as default"
                      >
                        Set Default
                      </button>
                    {/if}
                    <button
                      class="action-btn"
                      onclick={() => startEdit(profile)}
                      title="Edit profile"
                    >
                      Edit
                    </button>
                    <button
                      class="action-btn delete-btn"
                      onclick={() => handleDelete(profile.id)}
                      title="Delete profile"
                      data-testid={`delete-profile-${profile.id}`}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              {/each}
            {/if}
          {/if}
        </div>

        <!-- Edit/Create Form -->
        {#if isCreating || editingProfile}
          <div class="profile-form" data-testid="profile-form">
            <h3>{editingProfile ? 'Edit Profile' : 'New Profile'}</h3>

            {#if error}
              <div class="form-error">{error}</div>
            {/if}

            <div class="form-group">
              <label for="profile-name">Name</label>
              <input
                id="profile-name"
                type="text"
                class="form-input"
                bind:value={formName}
                placeholder="My Custom Shell"
                data-testid="profile-name-input"
              />
            </div>

            <div class="form-group">
              <label for="profile-shell">Shell Command</label>
              <input
                id="profile-shell"
                type="text"
                class="form-input"
                bind:value={formShell}
                placeholder="e.g., pwsh.exe, /bin/zsh, cmd.exe"
                data-testid="profile-shell-input"
              />
            </div>

            <div class="form-group">
              <label for="profile-args">Arguments (space-separated)</label>
              <input
                id="profile-args"
                type="text"
                class="form-input"
                bind:value={formArgs}
                placeholder="e.g., -NoLogo -NoProfile"
              />
            </div>

            <div class="form-group">
              <label for="profile-cwd">Working Directory (optional)</label>
              <input
                id="profile-cwd"
                type="text"
                class="form-input"
                bind:value={formCwd}
                placeholder="e.g., C:\Projects or ~/projects"
              />
            </div>

            <div class="form-group">
              <label for="profile-env">Environment Variables (KEY=VALUE, one per line)</label>
              <textarea
                id="profile-env"
                class="form-textarea"
                bind:value={formEnv}
                placeholder="NODE_ENV=development&#10;CUSTOM_VAR=value"
                rows="3"
              ></textarea>
            </div>

            <div class="form-actions">
              <button class="save-btn" onclick={handleSave} data-testid="save-profile-btn">
                {editingProfile ? 'Update' : 'Create'}
              </button>
              <button class="cancel-btn" onclick={resetForm}>
                Cancel
              </button>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
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
    max-width: 650px;
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
    border-bottom: 1px solid var(--color-nerv-border);
  }

  .modal-header h2 {
    font-size: 16px;
    font-weight: 600;
    color: var(--color-nerv-text);
    margin: 0;
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

  .modal-body {
    display: flex;
    flex: 1;
    overflow: hidden;
    gap: 1px;
    background: var(--color-nerv-border);
  }

  .profile-list {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
    background: var(--color-nerv-panel);
    min-width: 0;
  }

  .profile-form {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    background: var(--color-nerv-panel);
    min-width: 0;
  }

  .profile-form h3 {
    font-size: 14px;
    font-weight: 600;
    color: var(--color-nerv-text);
    margin: 0 0 12px;
  }

  .loading, .error-msg {
    text-align: center;
    padding: 20px;
    color: var(--color-nerv-text-muted);
    font-size: 13px;
  }

  .error-msg {
    color: var(--color-nerv-error);
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 0 4px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-nerv-text-dim);
    border-top: 1px solid var(--color-nerv-border);
    margin-top: 8px;
  }

  .section-header:first-child {
    border-top: none;
    margin-top: 0;
  }

  .profile-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px;
    border-radius: var(--radius-nerv-sm);
    transition: background var(--transition-nerv-fast);
  }

  .profile-item:hover {
    background: var(--color-nerv-bg);
  }

  .profile-item.active {
    background: var(--color-nerv-panel-hover);
    border-left: 2px solid var(--color-nerv-primary);
  }

  .profile-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .profile-name {
    font-size: 13px;
    color: var(--color-nerv-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .profile-shell {
    font-size: 11px;
    color: var(--color-nerv-text-dim);
    font-family: 'SF Mono', Monaco, 'Courier New', monospace;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .profile-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .default-badge {
    padding: 2px 6px;
    background: var(--color-nerv-border);
    border-radius: 3px;
    font-size: 10px;
    color: var(--color-nerv-text-dim);
  }

  .action-btn {
    padding: 3px 8px;
    background: none;
    border: 1px solid var(--color-nerv-border);
    border-radius: var(--radius-nerv-sm);
    color: var(--color-nerv-text-muted);
    font-size: 11px;
    cursor: pointer;
    transition: all var(--transition-nerv-fast);
  }

  .action-btn:hover {
    background: var(--color-nerv-panel-hover);
    color: var(--color-nerv-text);
    border-color: var(--color-nerv-border-hover);
  }

  .action-btn.delete-btn:hover {
    background: var(--color-nerv-error-bg);
    color: var(--color-nerv-error);
    border-color: var(--color-nerv-error);
  }

  .add-btn {
    padding: 2px 8px;
    background: none;
    border: 1px solid var(--color-nerv-primary);
    border-radius: var(--radius-nerv-sm);
    color: var(--color-nerv-primary);
    font-size: 10px;
    cursor: pointer;
    transition: all var(--transition-nerv-fast);
  }

  .add-btn:hover {
    background: var(--color-nerv-primary);
    color: white;
  }

  .empty-custom {
    padding: 12px;
    text-align: center;
    color: var(--color-nerv-text-dim);
    font-size: 12px;
    font-style: italic;
  }

  .form-group {
    margin-bottom: 12px;
  }

  .form-group label {
    display: block;
    font-size: 12px;
    color: var(--color-nerv-text-muted);
    margin-bottom: 4px;
  }

  .form-input {
    width: 100%;
    padding: 8px 10px;
    background: var(--color-nerv-bg);
    border: 1px solid var(--color-nerv-border);
    border-radius: var(--radius-nerv-sm);
    color: var(--color-nerv-text);
    font-size: 13px;
  }

  .form-input:focus {
    outline: none;
    border-color: var(--color-nerv-primary);
  }

  .form-textarea {
    width: 100%;
    padding: 8px 10px;
    background: var(--color-nerv-bg);
    border: 1px solid var(--color-nerv-border);
    border-radius: var(--radius-nerv-sm);
    color: var(--color-nerv-text);
    font-size: 13px;
    font-family: 'SF Mono', Monaco, 'Courier New', monospace;
    resize: vertical;
  }

  .form-textarea:focus {
    outline: none;
    border-color: var(--color-nerv-primary);
  }

  .form-error {
    padding: 8px 10px;
    background: var(--color-nerv-error-bg);
    border: 1px solid var(--color-nerv-error);
    border-radius: var(--radius-nerv-sm);
    color: var(--color-nerv-error);
    font-size: 12px;
    margin-bottom: 12px;
  }

  .form-actions {
    display: flex;
    gap: 8px;
    margin-top: 16px;
  }

  .save-btn {
    padding: 8px 16px;
    background: var(--color-nerv-primary);
    border: none;
    border-radius: var(--radius-nerv-sm);
    color: white;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background var(--transition-nerv-fast);
  }

  .save-btn:hover {
    background: var(--color-nerv-primary-hover);
  }

  .cancel-btn {
    padding: 8px 16px;
    background: var(--color-nerv-border);
    border: none;
    border-radius: var(--radius-nerv-sm);
    color: var(--color-nerv-text-muted);
    font-size: 13px;
    cursor: pointer;
    transition: background var(--transition-nerv-fast);
  }

  .cancel-btn:hover {
    background: var(--color-nerv-border-hover);
    color: var(--color-nerv-text);
  }
</style>
