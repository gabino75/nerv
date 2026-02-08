<script lang="ts">
  /**
   * Update Notification UI (PRD Section 33)
   *
   * Displays when an app update is available or downloaded.
   * Shows version info, release notes, and action buttons:
   * - Skip This Version: Don't install this specific version
   * - Later: Install on next quit
   * - Restart & Update: Quit and install immediately
   */

  import { onMount, onDestroy } from 'svelte'
  import type { AutoUpdateState } from '../../../shared/types/auto-update'

  // Update state from main process
  let updateState = $state<AutoUpdateState | null>(null)
  let isVisible = $state(false)
  let isDownloading = $state(false)

  // Cleanup function for state change listener
  let unsubscribe: (() => void) | null = null

  onMount(async () => {
    // Get initial state
    updateState = await window.api.autoUpdate.getState()

    // Subscribe to state changes
    unsubscribe = window.api.autoUpdate.onStateChange((state) => {
      updateState = state

      // Show notification when update is available or downloaded
      if (state.status === 'available' || state.status === 'downloaded') {
        isVisible = true
        isDownloading = false
      } else if (state.status === 'downloading') {
        isDownloading = true
      } else if (state.status === 'idle' || state.status === 'error') {
        isDownloading = false
      }
    })
  })

  onDestroy(() => {
    if (unsubscribe) {
      unsubscribe()
    }
  })

  // Handle "Restart & Update" (or "Download & Update")
  async function handleInstallNow() {
    if (updateState?.status === 'available') {
      // Need to download first
      isDownloading = true
      const success = await window.api.autoUpdate.download()
      if (success) {
        // Will get 'downloaded' state, then install
        await window.api.autoUpdate.handleAction('install-now')
      } else {
        isDownloading = false
      }
    } else {
      await window.api.autoUpdate.handleAction('install-now')
    }
  }

  // Handle "Later" - install on next quit
  function handleInstallLater() {
    window.api.autoUpdate.handleAction('install-later')
    isVisible = false
  }

  // Handle "Skip This Version"
  function handleSkip() {
    window.api.autoUpdate.handleAction('skip')
    isVisible = false
  }

  // Dismiss notification (same as remind later)
  function handleDismiss() {
    window.api.autoUpdate.handleAction('remind-later')
    isVisible = false
  }

  // Format release notes for display
  function formatReleaseNotes(notes: string | null | undefined): string[] {
    if (!notes) return []
    // Split by newlines and filter out empty lines
    // Try to extract bullet points
    return notes
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .slice(0, 5) // Show max 5 items
  }
</script>

{#if isVisible && updateState?.updateInfo}
  <div class="update-overlay" data-testid="update-notification">
    <div class="update-dialog">
      <button
        class="close-btn"
        onclick={handleDismiss}
        aria-label="Close notification"
        data-testid="update-close"
      >
        x
      </button>

      <div class="update-header">
        <span class="update-icon">&#128260;</span>
        <h2>Update Available</h2>
      </div>

      <p class="update-version" data-testid="update-version">
        NERV v{updateState.updateInfo.version} is ready to install
      </p>

      {#if updateState.updateInfo.releaseNotes}
        <div class="release-notes">
          <h3>What's new:</h3>
          <ul>
            {#each formatReleaseNotes(updateState.updateInfo.releaseNotes) as note}
              <li>{note}</li>
            {/each}
          </ul>
        </div>
      {/if}

      {#if updateState.isMandatory}
        <p class="mandatory-notice">
          This update is required by your organization.
        </p>
      {/if}

      {#if isDownloading}
        <div class="download-progress">
          <div class="progress-bar">
            <div
              class="progress-fill"
              style="width: {updateState.downloadProgress ?? 0}%"
            ></div>
          </div>
          <span class="progress-text">
            Downloading... {Math.round(updateState.downloadProgress ?? 0)}%
          </span>
        </div>
      {/if}

      <div class="update-actions">
        {#if !updateState.isMandatory}
          <button
            class="btn-skip"
            onclick={handleSkip}
            disabled={isDownloading}
            data-testid="update-skip"
          >
            Skip This Version
          </button>
        {/if}
        <button
          class="btn-later"
          onclick={handleInstallLater}
          disabled={isDownloading || updateState.isMandatory}
          data-testid="update-later"
        >
          Later
        </button>
        <button
          class="btn-install"
          onclick={handleInstallNow}
          disabled={isDownloading}
          data-testid="update-install"
        >
          {#if updateState.status === 'downloaded'}
            Restart & Update
          {:else if isDownloading}
            Downloading...
          {:else}
            Download & Update
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .update-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2200;
  }

  .update-dialog {
    background: #1a1a24;
    border: 1px solid #2a2a3a;
    border-radius: 12px;
    padding: 24px;
    max-width: 450px;
    width: 90%;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    position: relative;
  }

  .close-btn {
    position: absolute;
    top: 12px;
    right: 12px;
    background: none;
    border: none;
    color: #666;
    font-size: 20px;
    cursor: pointer;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: all 0.15s ease;
  }

  .close-btn:hover {
    color: #aaa;
    background: rgba(255, 255, 255, 0.1);
  }

  .update-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
  }

  .update-icon {
    font-size: 24px;
  }

  .update-header h2 {
    font-size: 18px;
    font-weight: 600;
    color: #e0e0e0;
    margin: 0;
  }

  .update-version {
    font-size: 14px;
    color: #888;
    margin-bottom: 16px;
  }

  .release-notes {
    background: #12121a;
    border-radius: 8px;
    padding: 12px 16px;
    margin-bottom: 16px;
  }

  .release-notes h3 {
    font-size: 13px;
    font-weight: 600;
    color: #aaa;
    margin: 0 0 8px 0;
  }

  .release-notes ul {
    margin: 0;
    padding-left: 20px;
  }

  .release-notes li {
    font-size: 12px;
    color: #888;
    line-height: 1.5;
  }

  .mandatory-notice {
    font-size: 12px;
    color: #e67e22;
    margin-bottom: 16px;
    padding: 8px 12px;
    background: rgba(230, 126, 34, 0.1);
    border-radius: 6px;
    border: 1px solid rgba(230, 126, 34, 0.3);
  }

  .download-progress {
    margin-bottom: 16px;
  }

  .progress-bar {
    height: 6px;
    background: #2a2a3a;
    border-radius: 3px;
    overflow: hidden;
    margin-bottom: 6px;
  }

  .progress-fill {
    height: 100%;
    background: #27ae60;
    border-radius: 3px;
    transition: width 0.3s ease;
  }

  .progress-text {
    font-size: 11px;
    color: #888;
  }

  .update-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    flex-wrap: wrap;
  }

  .update-actions button {
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-skip {
    background: transparent;
    border: 1px solid #3a3a4a;
    color: #888;
  }

  .btn-skip:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.05);
    color: #aaa;
  }

  .btn-later {
    background: #2a2a3a;
    border: 1px solid #3a3a4a;
    color: #ccc;
  }

  .btn-later:hover:not(:disabled) {
    background: #3a3a4a;
    color: #fff;
  }

  .btn-install {
    background: #27ae60;
    border: 1px solid #27ae60;
    color: #fff;
  }

  .btn-install:hover:not(:disabled) {
    background: #2ecc71;
  }

  .update-actions button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Responsive adjustments */
  @media (max-width: 500px) {
    .update-dialog {
      padding: 16px;
    }

    .update-actions {
      flex-direction: column;
    }

    .update-actions button {
      width: 100%;
    }
  }
</style>
