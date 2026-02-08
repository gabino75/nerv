<script lang="ts">
  /**
   * TabContainer - Multi-tab terminal interface (PRD Section 10)
   *
   * Manages multiple Claude terminal sessions in tabs:
   * - Each tab has its own terminal instance and Claude session
   * - Supports task-linked and standalone sessions
   * - Tab switching, creation, and closure
   */

  import { onMount, onDestroy } from 'svelte'
  import { Terminal } from '@xterm/xterm'
  import { FitAddon } from '@xterm/addon-fit'
  import { appStore, currentTask, selectedModel, selectedProject } from '../stores/appState'
  import type { Task, ModelName, Project } from '../stores/appState'
  import type { ClaudeTab, CustomAgentsConfig, TabType, LayoutMode, SplitLayout, TerminalProfile } from '../../../shared/types'
  import { DEFAULT_ALLOWED_TOOLS, DEFAULT_DISALLOWED_TOOLS } from '../../../shared/constants'
  import '@xterm/xterm/css/xterm.css'
  import TerminalProfileManager from './TerminalProfileManager.svelte'

  // Profile manager dialog state
  let showProfileManager = $state(false)

  // Tab state
  let tabs = $state<ClaudeTab[]>([])
  let activeTabId = $state<string | null>(null)
  let showNewTabMenu = $state(false)
  let showProfileMenu = $state(false)
  let availableProfiles = $state<TerminalProfile[]>([])

  // Split view state
  let layoutMode = $state<LayoutMode>('tabs')
  let splitRatio = $state(0.5) // 50/50 split by default
  let gridRatios = $state({ horizontal: 0.5, vertical: 0.5 }) // PRD Section 10: 2x2 grid ratios
  let focusedPaneIndex = $state(0) // 0-1 for split, 0-3 for grid
  let isDraggingSplit = $state(false)
  let draggingHandle = $state<'horizontal' | 'vertical' | 'main' | null>(null) // Which handle is being dragged
  let showSplitMenu = $state(false)

  // Terminal instances per tab (not reactive, managed manually)
  const terminals: Map<string, { terminal: Terminal; fitAddon: FitAddon }> = new Map()
  const tabContainers: Map<string, HTMLDivElement> = new Map()

  // Queue for input received before session is ready (fixes race condition)
  const pendingInput: Map<string, string[]> = new Map()

  // Store subscriptions
  let activeTask = $state<Task | null>(null)
  let isRunning = $state(false)
  let currentModel = $state<ModelName>('sonnet')
  let currentProject = $state<Project | null>(null)

  currentTask.subscribe(t => { activeTask = t })
  appStore.subscribe(state => { isRunning = state.isTaskRunning })
  selectedModel.subscribe(m => { currentModel = m })
  selectedProject.subscribe(p => { currentProject = p })

  // Terminal theme configuration
  const terminalTheme = {
    background: '#0d0d12',
    foreground: '#e0e0e0',
    cursor: '#ff6b35',
    cursorAccent: '#0d0d12',
    selectionBackground: '#3a3a5a',
    black: '#0d0d12',
    red: '#ff6b6b',
    green: '#6bcb77',
    yellow: '#ffd93d',
    blue: '#4d96ff',
    magenta: '#c77dff',
    cyan: '#6ee7b7',
    white: '#e0e0e0',
    brightBlack: '#555555',
    brightRed: '#ff8888',
    brightGreen: '#8ed998',
    brightYellow: '#ffe066',
    brightBlue: '#77b3ff',
    brightMagenta: '#d9a7ff',
    brightCyan: '#8ef5cc',
    brightWhite: '#ffffff'
  }

  function generateTabId(): string {
    return `tab-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
  }

  function initTerminalForTab(tabId: string, container: HTMLDivElement) {
    if (terminals.has(tabId)) return

    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: "'SF Mono', Monaco, 'Courier New', monospace",
      fontSize: 13,
      lineHeight: 1.4,
      theme: terminalTheme
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(container)

    // Initial fit
    setTimeout(() => fitAddon.fit(), 0)

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit()
      const tab = tabs.find(t => t.id === tabId)
      if (tab?.type === 'shell' && tab.terminalId) {
        window.api.terminal.resize(tab.terminalId, terminal.cols, terminal.rows)
      } else if (tab?.sessionId) {
        window.api.claude.resize(tab.sessionId, terminal.cols, terminal.rows)
      }
    })
    resizeObserver.observe(container)

    // Handle user input - route to correct backend based on tab type
    terminal.onData((data: string) => {
      const tab = tabs.find(t => t.id === tabId)
      if (!tab) return

      if (tab.type === 'shell') {
        // Shell tab - send to PTY terminal
        if (tab.terminalId) {
          window.api.terminal.write(tab.terminalId, data)
        }
      } else {
        // Claude tab - queue if session not ready yet (fixes race condition)
        if (tab.sessionId) {
          window.api.claude.write(tab.sessionId, data)
        } else {
          const queue = pendingInput.get(tabId) || []
          queue.push(data)
          pendingInput.set(tabId, queue)
        }
      }
    })

    terminals.set(tabId, { terminal, fitAddon })
    tabContainers.set(tabId, container)
  }

  function destroyTerminalForTab(tabId: string) {
    const entry = terminals.get(tabId)
    if (entry) {
      entry.terminal.dispose()
      terminals.delete(tabId)
    }
    tabContainers.delete(tabId)
    pendingInput.delete(tabId)
  }

  // Flush any queued input to the now-ready session
  function flushPendingInput(tabId: string, sessionId: string) {
    const queue = pendingInput.get(tabId)
    if (queue && queue.length > 0) {
      for (const data of queue) {
        window.api.claude.write(sessionId, data)
      }
      pendingInput.delete(tabId)
    }
  }

  // Create a new tab for a task (always Claude type)
  export function createTabForTask(task: Task, projectId: string): ClaudeTab {
    const tab: ClaudeTab = {
      id: generateTabId(),
      title: task.title.length > 20 ? task.title.substring(0, 20) + '...' : task.title,
      type: 'claude',
      taskId: task.id,
      projectId,
      sessionId: null,
      terminalId: null,
      isRunning: false,
      createdAt: new Date().toISOString()
    }
    tabs = [...tabs, tab]
    activeTabId = tab.id
    return tab
  }

  // Create a standalone tab (generic Claude session)
  export function createStandaloneTab(projectId: string, title?: string): ClaudeTab {
    const tab: ClaudeTab = {
      id: generateTabId(),
      title: title || `Claude ${tabs.filter(t => t.type === 'claude').length + 1}`,
      type: 'claude',
      taskId: null,
      projectId,
      sessionId: null,
      terminalId: null,
      isRunning: false,
      createdAt: new Date().toISOString()
    }
    tabs = [...tabs, tab]
    activeTabId = tab.id
    return tab
  }

  // Create a shell terminal tab
  export function createShellTab(projectId: string, title?: string): ClaudeTab {
    const tab: ClaudeTab = {
      id: generateTabId(),
      title: title || `Shell ${tabs.filter(t => t.type === 'shell').length + 1}`,
      type: 'shell',
      taskId: null,
      projectId,
      sessionId: null,
      terminalId: null,
      isRunning: false,
      createdAt: new Date().toISOString()
    }
    tabs = [...tabs, tab]
    activeTabId = tab.id
    return tab
  }

  // Start a standalone Claude session (not linked to a task)
  export async function startStandaloneSession(
    projectId: string,
    initialPrompt?: string
  ): Promise<string | null> {
    // Find or create standalone tab
    let tab = tabs.find(t => t.id === activeTabId && !t.taskId)
    if (!tab) {
      tab = createStandaloneTab(projectId)
    }
    activeTabId = tab.id

    // Wait for terminal to be initialized
    await new Promise(resolve => setTimeout(resolve, 100))

    const entry = terminals.get(tab.id)
    if (!entry) return null

    const { terminal, fitAddon } = entry

    // Kill existing session if any
    if (tab.sessionId) {
      await window.api.recovery.stopMonitor(tab.sessionId)
      await window.api.claude.kill(tab.sessionId)
    }

    // Clear terminal
    terminal.clear()
    terminal.write('\x1b[2J\x1b[H')
    terminal.writeln('\x1b[36m[Starting Claude Code session...]\x1b[0m\r\n')

    // Get project info for working directory
    const project = await window.api.db.projects.get(projectId)
    const repos = await window.api.db.repos.getForProject(projectId)
    const primaryRepo = repos.length > 0 ? repos[0] : null
    const cwd = primaryRepo?.path || '.'

    terminal.writeln(`\x1b[90m[Working directory: ${cwd}]\x1b[0m\r\n`)

    // Generate MCP config from documentation sources (PRD Section 5: Claude ↔ NERV Integration)
    // This ensures nerv-context, nerv-progress, and nerv-docs MCP servers are available
    const mcpConfigPath = await window.api.mcp.generateFromDocSources(projectId)

    // Get custom agents
    let customAgents: CustomAgentsConfig | undefined
    if (project?.custom_agents) {
      try {
        customAgents = JSON.parse(project.custom_agents) as CustomAgentsConfig
      } catch {
        // Invalid JSON, ignore
      }
    }

    // Spawn Claude Code without a task
    // JSON roundtrip ensures plain object (strips Svelte 5 proxies)
    const spawnConfig = JSON.parse(JSON.stringify({
      projectId,
      cwd,
      prompt: initialPrompt || 'Hello! How can I help you today?',
      model: currentModel,
      maxTurns: 50,
      allowedTools: [...DEFAULT_ALLOWED_TOOLS],
      disallowedTools: [...DEFAULT_DISALLOWED_TOOLS],
      mcpConfigPath: mcpConfigPath || undefined,
      customAgents,
    }))
    const result = await window.api.claude.spawn(spawnConfig)
    const sessionId = result?.sessionId || null

    // Update tab state
    tabs = tabs.map(t => t.id === tab!.id ? { ...t, sessionId, isRunning: true } : t)

    // Send initial resize
    fitAddon.fit()
    if (sessionId) {
      await window.api.claude.resize(sessionId, terminal.cols, terminal.rows)
      // Flush any input that was queued while session was starting
      flushPendingInput(tab.id, sessionId)
    }

    return sessionId
  }

  // Start a shell terminal session (not Claude) - with optional profile
  export async function startShellSession(projectId: string, profileId?: string): Promise<string | null> {
    // Find or create shell tab
    let tab = tabs.find(t => t.id === activeTabId && t.type === 'shell')
    if (!tab) {
      tab = createShellTab(projectId)
    }
    activeTabId = tab.id

    // Wait for terminal to be initialized
    await new Promise(resolve => setTimeout(resolve, 100))

    const entry = terminals.get(tab.id)
    if (!entry) return null

    const { terminal, fitAddon } = entry

    // Kill existing shell if any
    if (tab.terminalId) {
      await window.api.terminal.kill(tab.terminalId)
    }

    // Clear terminal
    terminal.clear()
    terminal.write('\x1b[2J\x1b[H')

    // Get project info for working directory
    const repos = await window.api.db.repos.getForProject(projectId)
    const primaryRepo = repos.length > 0 ? repos[0] : null
    const cwd = primaryRepo?.path || undefined

    // Create PTY terminal with profile
    const result = await window.api.terminal.create(cwd, profileId)
    const terminalId = result.terminalId

    // Update tab state with profile info in title
    const profile = availableProfiles.find(p => p.id === result.profileId)
    const profileName = profile?.name || 'Shell'
    const shellCount = tabs.filter(t => t.type === 'shell').length
    tabs = tabs.map(t => t.id === tab!.id ? {
      ...t,
      terminalId,
      isRunning: true,
      title: `${profileName} ${shellCount}`
    } : t)

    // Send initial resize
    fitAddon.fit()
    if (terminalId) {
      await window.api.terminal.resize(terminalId, terminal.cols, terminal.rows)
    }

    return terminalId
  }

  // Start Claude session in a specific tab
  export async function startClaudeSession(
    task: Task,
    projectId: string,
    systemPrompt?: string,
    additionalDirs?: string[]
  ): Promise<string | null> {
    // Find or create tab for this task
    let tab = tabs.find(t => t.taskId === task.id)
    if (!tab) {
      tab = createTabForTask(task, projectId)
    }
    activeTabId = tab.id

    // Wait for terminal to be initialized
    await new Promise(resolve => setTimeout(resolve, 100))

    const entry = terminals.get(tab.id)
    if (!entry) return null

    const { terminal, fitAddon } = entry

    // Kill existing session if any
    if (tab.sessionId) {
      await window.api.recovery.stopMonitor(tab.sessionId)
      await window.api.claude.kill(tab.sessionId)
    }

    // Clear terminal
    terminal.clear()
    terminal.write('\x1b[2J\x1b[H')
    terminal.writeln('\x1b[36m[Starting Claude Code session...]\x1b[0m\r\n')

    const cwd = task.worktree_path || '.'

    if (task.worktree_path) {
      terminal.writeln(`\x1b[90m[Working directory: ${task.worktree_path}]\x1b[0m`)
    }
    if (additionalDirs && additionalDirs.length > 0) {
      terminal.writeln(`\x1b[90m[Additional repos: ${additionalDirs.length}]\x1b[0m`)
    }
    terminal.writeln('')

    const prompt = task.description || task.title

    // Generate MCP config with task ID (PRD Section 5: Claude ↔ NERV Integration)
    // This ensures nerv-context, nerv-progress, and nerv-docs MCP servers are available
    // Task ID is included so nerv-progress can update the correct task
    const mcpConfigPath = await window.api.mcp.generateFromDocSources(projectId, task.id)

    // Get custom agents
    const project = await window.api.db.projects.get(projectId)
    let customAgents: CustomAgentsConfig | undefined
    if (project?.custom_agents) {
      try {
        customAgents = JSON.parse(project.custom_agents) as CustomAgentsConfig
      } catch {
        // Invalid JSON, ignore
      }
    }

    // Spawn Claude Code
    // JSON roundtrip ensures plain object (strips Svelte 5 proxies, class instances)
    // that can pass through Electron's structured clone in contextBridge
    const spawnConfig = JSON.parse(JSON.stringify({
      taskId: task.id,
      projectId,
      cwd,
      prompt,
      systemPrompt,
      additionalDirs: additionalDirs || [],
      model: currentModel,
      maxTurns: 50,
      allowedTools: [...DEFAULT_ALLOWED_TOOLS],
      disallowedTools: [...DEFAULT_DISALLOWED_TOOLS],
      mcpConfigPath: mcpConfigPath || undefined,
      customAgents,
    }))
    const result = await window.api.claude.spawn(spawnConfig)
    const sessionId = result?.sessionId || null

    // Update tab state
    tabs = tabs.map(t => t.id === tab!.id ? { ...t, sessionId, isRunning: true } : t)

    // Start monitoring
    if (sessionId) {
      await window.api.recovery.startMonitor(sessionId, task.id)
    }

    // Send initial resize
    fitAddon.fit()
    if (sessionId) {
      await window.api.claude.resize(sessionId, terminal.cols, terminal.rows)
      // Flush any input that was queued while session was starting
      flushPendingInput(tab.id, sessionId)
    }

    return sessionId
  }

  // Stop Claude session for current tab
  export async function stopClaudeSession() {
    const tab = tabs.find(t => t.id === activeTabId)
    if (tab?.sessionId) {
      await window.api.recovery.stopMonitor(tab.sessionId)
      await window.api.claude.kill(tab.sessionId)

      const entry = terminals.get(tab.id)
      if (entry) {
        entry.terminal.writeln('\r\n\x1b[31m[Session stopped by user]\x1b[0m')
      }

      tabs = tabs.map(t => t.id === tab.id ? { ...t, sessionId: null, isRunning: false } : t)
    }
  }

  // Resume interrupted session
  export async function resumeClaudeSession(task: Task, projectId: string): Promise<string | null> {
    if (!task.session_id) return null

    // Find or create tab for this task
    let tab = tabs.find(t => t.taskId === task.id)
    if (!tab) {
      tab = createTabForTask(task, projectId)
    }
    activeTabId = tab.id

    await new Promise(resolve => setTimeout(resolve, 100))

    const entry = terminals.get(tab.id)
    if (!entry) return null

    const { terminal, fitAddon } = entry

    // Kill existing session if any
    if (tab.sessionId) {
      await window.api.recovery.stopMonitor(tab.sessionId)
      await window.api.claude.kill(tab.sessionId)
    }

    terminal.clear()
    terminal.write('\x1b[2J\x1b[H')
    terminal.writeln('\x1b[36m[Resuming Claude Code session...]\x1b[0m')
    terminal.writeln(`\x1b[90m[Resuming from session: ${task.session_id}]\x1b[0m\r\n`)

    const cwd = task.worktree_path || '.'

    if (task.worktree_path) {
      terminal.writeln(`\x1b[90m[Working directory: ${task.worktree_path}]\x1b[0m\r\n`)
    }

    const resumeResult = await window.api.claude.resume(JSON.parse(JSON.stringify({
      taskId: task.id,
      projectId,
      cwd,
      model: currentModel
    })), task.session_id)
    const sessionId = resumeResult?.sessionId || null

    tabs = tabs.map(t => t.id === tab!.id ? { ...t, sessionId, isRunning: true } : t)

    if (sessionId) {
      await window.api.recovery.startMonitor(sessionId, task.id)
    }

    fitAddon.fit()
    if (sessionId) {
      await window.api.claude.resize(sessionId, terminal.cols, terminal.rows)
      // Flush any input that was queued while session was starting
      flushPendingInput(tab.id, sessionId)
    }

    return sessionId
  }

  export function isSessionRunning(): boolean {
    const tab = tabs.find(t => t.id === activeTabId)
    return tab?.isRunning ?? false
  }

  export function getSessionId(): string | null {
    const tab = tabs.find(t => t.id === activeTabId)
    return tab?.sessionId ?? null
  }

  function switchTab(tabId: string) {
    activeTabId = tabId
    // Refit the terminal when switching
    setTimeout(() => {
      const entry = terminals.get(tabId)
      if (entry) {
        entry.fitAddon.fit()
      }
    }, 0)
  }

  function closeTab(tabId: string) {
    const tab = tabs.find(t => t.id === tabId)
    if (tab) {
      if (tab.type === 'shell' && tab.terminalId) {
        // Kill shell PTY
        window.api.terminal.kill(tab.terminalId)
      } else if (tab.sessionId) {
        // Kill Claude session
        window.api.recovery.stopMonitor(tab.sessionId)
        window.api.claude.kill(tab.sessionId)
      }
    }
    destroyTerminalForTab(tabId)
    tabs = tabs.filter(t => t.id !== tabId)

    // Switch to another tab if we closed the active one
    if (activeTabId === tabId) {
      activeTabId = tabs.length > 0 ? tabs[tabs.length - 1].id : null
    }
  }

  function toggleNewTabMenu() {
    showNewTabMenu = !showNewTabMenu
  }

  function closeNewTabMenu() {
    showNewTabMenu = false
    showProfileMenu = false
  }

  function toggleProfileMenu() {
    showProfileMenu = !showProfileMenu
  }

  function toggleSplitMenu() {
    showSplitMenu = !showSplitMenu
  }

  function closeSplitMenu() {
    showSplitMenu = false
  }

  // Split view functions
  function splitHorizontal() {
    closeSplitMenu()
    if (tabs.length < 2) return
    layoutMode = 'split-horizontal'
    splitRatio = 0.5
    // Assign first tab to pane 0, second to pane 1
    tabs = tabs.map((t, i) => ({ ...t, paneId: i === 0 ? 'pane-0' : 'pane-1' }))
    // Refit all terminals after layout change
    setTimeout(() => refitAllTerminals(), 50)
  }

  function splitVertical() {
    closeSplitMenu()
    if (tabs.length < 2) return
    layoutMode = 'split-vertical'
    splitRatio = 0.5
    // Assign first tab to pane 0, second to pane 1
    tabs = tabs.map((t, i) => ({ ...t, paneId: i === 0 ? 'pane-0' : 'pane-1' }))
    // Refit all terminals after layout change
    setTimeout(() => refitAllTerminals(), 50)
  }

  // PRD Section 10: 2x2 grid layout
  function splitGrid() {
    closeSplitMenu()
    if (tabs.length < 4) return
    layoutMode = 'grid'
    gridRatios = { horizontal: 0.5, vertical: 0.5 }
    // Assign tabs to 4 panes: pane-0 (top-left), pane-1 (top-right), pane-2 (bottom-left), pane-3 (bottom-right)
    tabs = tabs.map((t, i) => ({ ...t, paneId: `pane-${Math.min(i, 3)}` }))
    // Refit all terminals after layout change
    setTimeout(() => refitAllTerminals(), 50)
  }

  function unsplit() {
    closeSplitMenu()
    layoutMode = 'tabs'
    // Remove pane assignments
    tabs = tabs.map(t => ({ ...t, paneId: undefined }))
    // Refit all terminals after layout change
    setTimeout(() => refitAllTerminals(), 50)
  }

  function refitAllTerminals() {
    for (const [tabId, entry] of terminals) {
      entry.fitAddon.fit()
      const tab = tabs.find(t => t.id === tabId)
      if (tab?.type === 'shell' && tab.terminalId) {
        window.api.terminal.resize(tab.terminalId, entry.terminal.cols, entry.terminal.rows)
      } else if (tab?.sessionId) {
        window.api.claude.resize(tab.sessionId, entry.terminal.cols, entry.terminal.rows)
      }
    }
  }

  // Handle split drag
  function handleSplitDragStart(e: MouseEvent, handle: 'horizontal' | 'vertical' | 'main' = 'main') {
    e.preventDefault()
    isDraggingSplit = true
    draggingHandle = handle
  }

  function handleSplitDrag(e: MouseEvent) {
    if (!isDraggingSplit) return
    const container = (e.currentTarget as HTMLElement).closest('.split-container, .grid-container') as HTMLElement
    if (!container) return

    const rect = container.getBoundingClientRect()
    if (layoutMode === 'split-horizontal') {
      // Horizontal split: left-right, calculate based on X
      const newRatio = (e.clientX - rect.left) / rect.width
      splitRatio = Math.max(0.2, Math.min(0.8, newRatio))
    } else if (layoutMode === 'split-vertical') {
      // Vertical split: top-bottom, calculate based on Y
      const newRatio = (e.clientY - rect.top) / rect.height
      splitRatio = Math.max(0.2, Math.min(0.8, newRatio))
    } else if (layoutMode === 'grid') {
      // Grid mode: handle both horizontal and vertical dividers
      if (draggingHandle === 'horizontal') {
        const newRatio = (e.clientY - rect.top) / rect.height
        gridRatios = { ...gridRatios, horizontal: Math.max(0.2, Math.min(0.8, newRatio)) }
      } else if (draggingHandle === 'vertical') {
        const newRatio = (e.clientX - rect.left) / rect.width
        gridRatios = { ...gridRatios, vertical: Math.max(0.2, Math.min(0.8, newRatio)) }
      }
    }
  }

  function handleSplitDragEnd() {
    if (isDraggingSplit) {
      isDraggingSplit = false
      draggingHandle = null
      // Refit terminals after resize
      setTimeout(() => refitAllTerminals(), 50)
    }
  }

  // Get tabs for a specific pane
  function getTabsForPane(paneId: string): ClaudeTab[] {
    return tabs.filter(t => t.paneId === paneId)
  }

  // Get active tab for a pane
  function getActiveTabForPane(paneId: string): ClaudeTab | undefined {
    const paneTabs = getTabsForPane(paneId)
    // Return active tab if it's in this pane, otherwise first tab
    const active = paneTabs.find(t => t.id === activeTabId)
    return active || paneTabs[0]
  }

  // Switch focus between panes
  function focusPane(paneIndex: number) {
    focusedPaneIndex = paneIndex
    const paneId = `pane-${paneIndex}`
    const paneTab = getActiveTabForPane(paneId)
    if (paneTab) {
      activeTabId = paneTab.id
    }
  }

  // Move tab to other pane
  function moveTabToPane(tabId: string, targetPaneId: string) {
    tabs = tabs.map(t => t.id === tabId ? { ...t, paneId: targetPaneId } : t)
    setTimeout(() => refitAllTerminals(), 50)
  }

  // Cycle to next tab (PRD Section 10: Ctrl+Tab)
  function cycleToNextTab() {
    if (tabs.length === 0) return
    const currentIndex = tabs.findIndex(t => t.id === activeTabId)
    const nextIndex = (currentIndex + 1) % tabs.length
    switchTab(tabs[nextIndex].id)
  }

  // Toggle split direction (PRD Section 10: Ctrl+\)
  function toggleSplitDirection() {
    if (layoutMode === 'tabs') {
      // If not split, start with horizontal
      if (tabs.length >= 2) {
        splitHorizontal()
      }
    } else if (layoutMode === 'split-horizontal') {
      // Switch to vertical
      layoutMode = 'split-vertical'
      setTimeout(() => refitAllTerminals(), 50)
    } else if (layoutMode === 'split-vertical') {
      // Switch to grid if we have 4+ tabs, otherwise back to horizontal
      if (tabs.length >= 4) {
        splitGrid()
      } else {
        layoutMode = 'split-horizontal'
        setTimeout(() => refitAllTerminals(), 50)
      }
    } else if (layoutMode === 'grid') {
      // Switch back to horizontal
      layoutMode = 'split-horizontal'
      // Reassign tabs for 2-pane split
      tabs = tabs.map((t, i) => ({ ...t, paneId: i === 0 ? 'pane-0' : 'pane-1' }))
      setTimeout(() => refitAllTerminals(), 50)
    }
  }

  // Focus specific tab by number (PRD Section 10: Ctrl+1/2/3/4)
  function focusTabByNumber(num: number) {
    const index = num - 1 // Convert 1-based to 0-based
    if (index >= 0 && index < tabs.length) {
      switchTab(tabs[index].id)
      // If in split mode, also focus the pane containing this tab
      if (layoutMode !== 'tabs') {
        const tab = tabs[index]
        if (tab.paneId === 'pane-0') {
          focusedPaneIndex = 0
        } else if (tab.paneId === 'pane-1') {
          focusedPaneIndex = 1
        }
      }
    }
  }

  // Keyboard shortcut handler (PRD Section 10)
  function handleKeyboardShortcuts(e: KeyboardEvent) {
    // Only handle when Ctrl is pressed
    if (!e.ctrlKey) return

    // Ctrl+\ - Toggle split direction
    if (e.key === '\\' && !e.shiftKey) {
      e.preventDefault()
      toggleSplitDirection()
      return
    }

    // Ctrl+Shift+\ - Close split (unsplit)
    if (e.key === '\\' && e.shiftKey) {
      e.preventDefault()
      unsplit()
      return
    }

    // Ctrl+Tab - Cycle through terminals
    if (e.key === 'Tab') {
      e.preventDefault()
      cycleToNextTab()
      return
    }

    // Ctrl+1/2/3/4 - Focus specific terminal
    if (e.key >= '1' && e.key <= '4') {
      e.preventDefault()
      focusTabByNumber(parseInt(e.key))
      return
    }
  }

  async function addNewClaudeTab() {
    closeNewTabMenu()
    if (currentProject) {
      createStandaloneTab(currentProject.id)
      await startStandaloneSession(currentProject.id)
    }
  }

  async function addNewShellTab(profileId?: string) {
    closeNewTabMenu()
    if (currentProject) {
      createShellTab(currentProject.id)
      await startShellSession(currentProject.id, profileId)
    }
  }

  // PRD Section 10: Group profiles by source for dropdown UI
  let builtInProfiles = $derived(availableProfiles.filter(p => p.source === 'built-in' || p.isBuiltIn))
  let customProfiles = $derived(availableProfiles.filter(p => p.source === 'custom'))
  let orgProfiles = $derived(availableProfiles.filter(p => p.source === 'organization'))

  // Open manage profiles dialog (PRD Section 10)
  function openManageProfiles() {
    closeNewTabMenu()
    showProfileManager = true
  }

  // Reload profiles after profile manager closes (in case profiles were added/removed)
  async function handleProfileManagerClose() {
    showProfileManager = false
    try {
      availableProfiles = await window.api.terminal.profiles.list()
    } catch {
      // Fallback if profiles API not available
    }
  }

  // Start Claude in the active standalone tab (for empty state button)
  async function startClaudeInActiveTab() {
    if (currentProject && activeTab && !activeTab.taskId && !activeTab.isRunning) {
      await startStandaloneSession(currentProject.id)
    }
  }

  // Set up global event listeners for Claude and shell terminals
  onMount(async () => {
    // Load available terminal profiles
    try {
      availableProfiles = await window.api.terminal.profiles.list()
    } catch {
      // Fallback if profiles API not available
      availableProfiles = []
    }

    // Listen for Claude output
    window.api.claude.onData((id: string, data: string) => {
      const tab = tabs.find(t => t.sessionId === id)
      if (tab) {
        const entry = terminals.get(tab.id)
        if (entry) {
          entry.terminal.write(data)
          window.api.recovery.recordOutput(id)
        }
      }
    })

    // Listen for shell terminal output
    window.api.terminal.onData((terminalId: string, data: string) => {
      const tab = tabs.find(t => t.terminalId === terminalId)
      if (tab) {
        const entry = terminals.get(tab.id)
        if (entry) {
          entry.terminal.write(data)
        }
      }
    })

    // Listen for shell terminal exit
    window.api.terminal.onExit((terminalId: string, exitCode: number) => {
      const tab = tabs.find(t => t.terminalId === terminalId)
      if (tab) {
        const entry = terminals.get(tab.id)
        if (entry) {
          entry.terminal.writeln(`\r\n\x1b[90m[Shell exited with code ${exitCode}]\x1b[0m`)
        }
        tabs = tabs.map(t => t.id === tab.id ? { ...t, terminalId: null, isRunning: false } : t)
      }
    })

    // Listen for Claude session ID capture
    window.api.claude.onSessionId((id: string, realSessionId: string) => {
      const tab = tabs.find(t => t.sessionId === id)
      if (tab?.taskId) {
        window.api.db.tasks.updateSession(tab.taskId, realSessionId)
      }
    })

    // Listen for token usage updates (PRD Section 6: includes compactionsSinceClear)
    window.api.claude.onTokenUsage((id: string, usage, compactionCount, compactionsSinceClear) => {
      const tab = tabs.find(t => t.sessionId === id)
      if (tab?.taskId) {
        appStore.updateSessionMetrics(tab.taskId, {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          compactionCount,
          compactionsSinceClear
        })
      }
    })

    // Listen for compaction notifications
    window.api.claude.onCompaction((id: string, count: number) => {
      const tab = tabs.find(t => t.sessionId === id)
      if (tab) {
        const entry = terminals.get(tab.id)
        if (entry) {
          entry.terminal.writeln(`\r\n\x1b[33m[Context compacted - ${count} time(s) this session]\x1b[0m\r\n`)
        }
      }
    })

    // Listen for Claude result (cost/duration/turns)
    window.api.claude.onResult((id: string, result: { cost_usd?: number; duration_ms?: number; num_turns?: number }) => {
      const tab = tabs.find(t => t.sessionId === id)
      if (tab?.taskId) {
        appStore.updateSessionMetrics(tab.taskId, {
          costUsd: result.cost_usd,
          durationMs: result.duration_ms,
          numTurns: result.num_turns
        })
      }
    })

    // Listen for Claude exit
    window.api.claude.onExit((id: string, exitCode: number) => {
      const tab = tabs.find(t => t.sessionId === id)
      if (tab) {
        const entry = terminals.get(tab.id)
        if (entry) {
          entry.terminal.writeln(`\r\n\x1b[90m[Claude Code exited with code ${exitCode}]\x1b[0m`)
        }
        window.api.recovery.stopMonitor(id)
        tabs = tabs.map(t => t.id === tab.id ? { ...t, sessionId: null, isRunning: false } : t)

        // Mark task as review when Claude finishes
        if (tab.taskId && exitCode === 0) {
          appStore.updateTaskStatus(tab.taskId, 'review')
        }
      }
    })

    // Listen for send input from ActionBar (PRD Section 1 mockup "Send:" field)
    const handleSendInput = (event: Event) => {
      const customEvent = event as CustomEvent<string>
      const message = customEvent.detail
      const activeTabRef = tabs.find(t => t.id === activeTabId)
      if (activeTabRef) {
        if (activeTabRef.type === 'shell' && activeTabRef.terminalId) {
          window.api.terminal.write(activeTabRef.terminalId, message)
        } else if (activeTabRef.sessionId) {
          window.api.claude.write(activeTabRef.sessionId, message)
        }
        // Also echo to terminal for visual feedback
        const entry = terminals.get(activeTabRef.id)
        if (entry) {
          entry.terminal.write(`\x1b[90m${message}\x1b[0m`)
        }
      }
    }
    window.addEventListener('nerv-send-input', handleSendInput)

    // Add keyboard shortcut listener (PRD Section 10: split shortcuts)
    window.addEventListener('keydown', handleKeyboardShortcuts)

    // Clean up event listeners on unmount
    return () => {
      window.removeEventListener('nerv-send-input', handleSendInput)
      window.removeEventListener('keydown', handleKeyboardShortcuts)
    }
  })

  onDestroy(() => {
    window.api.claude.removeAllListeners()
    window.api.terminal.removeAllListeners()
    for (const tab of tabs) {
      if (tab.type === 'shell' && tab.terminalId) {
        window.api.terminal.kill(tab.terminalId)
      } else if (tab.sessionId) {
        window.api.recovery.stopMonitor(tab.sessionId)
        window.api.claude.kill(tab.sessionId)
      }
      destroyTerminalForTab(tab.id)
    }
  })

  // Svelte action to initialize terminal when container is mounted
  function initTerminalAction(container: HTMLDivElement, tabId: string) {
    initTerminalForTab(tabId, container)
    return {
      destroy() {
        // Cleanup handled by closeTab
      }
    }
  }

  // Get active tab
  let activeTab = $derived(tabs.find(t => t.id === activeTabId))
</script>

<section class="tab-container" data-testid="terminal-panel">
  <!-- Terminal Header (static, always visible for test compatibility) -->
  <div class="terminal-header-bar" data-testid="terminal-header">
    <span class="terminal-label">Terminal</span>
    {#if activeTask}
      <span class="terminal-title-text" data-testid="terminal-title">{activeTask.title}</span>
    {:else if activeTab}
      <span class="terminal-title-text" data-testid="terminal-title">{activeTab.title}</span>
    {:else}
      <span class="terminal-title-text" data-testid="terminal-title">No session</span>
    {/if}
    {#if isRunning}
      <span class="terminal-status" data-testid="terminal-status" data-status="running">●</span>
    {/if}
  </div>

  <!-- Tab Bar -->
  <div class="tab-bar">
    {#each tabs as tab (tab.id)}
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
      <div
        class="tab"
        class:active={tab.id === activeTabId}
        class:shell={tab.type === 'shell'}
        onclick={() => switchTab(tab.id)}
        data-testid={`tab-${tab.id}`}
        role="tab"
        tabindex="0"
      >
        <span class="tab-icon">{tab.type === 'shell' ? '💻' : '🤖'}</span>
        <span class="tab-title" data-testid="tab-title">{tab.title}</span>
        {#if tab.isRunning}
          <span class="tab-status running" title="Running"></span>
        {/if}
        <button
          class="tab-close"
          onclick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
          title="Close tab"
        >
          &times;
        </button>
      </div>
    {/each}
    <div class="tab-add-wrapper">
      <button
        class="tab-add"
        onclick={toggleNewTabMenu}
        title="New terminal"
        data-testid="tab-add-btn"
      >
        +
      </button>
      {#if showNewTabMenu}
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
        <div class="tab-menu-backdrop" onclick={closeNewTabMenu}></div>
        <div class="tab-menu" data-testid="new-tab-menu">
          <button
            class="tab-menu-item"
            onclick={addNewClaudeTab}
            data-testid="new-claude-tab-btn"
          >
            <span class="tab-menu-icon">🤖</span>
            Claude Session
          </button>
          {#if availableProfiles.length > 1}
            <div class="tab-menu-item-with-submenu">
              <button
                class="tab-menu-item"
                onclick={toggleProfileMenu}
                data-testid="new-shell-tab-btn"
              >
                <span class="tab-menu-icon">💻</span>
                Shell Terminal
                <span class="submenu-arrow">▶</span>
              </button>
              {#if showProfileMenu}
                <div class="profile-submenu" data-testid="profile-submenu">
                  <!-- Built-in section (PRD Section 10) -->
                  {#if builtInProfiles.length > 0}
                    <div class="profile-section-header">Built-in</div>
                    {#each builtInProfiles as profile (profile.id)}
                      <button
                        class="tab-menu-item"
                        onclick={() => addNewShellTab(profile.id)}
                        data-testid={`profile-${profile.id}`}
                      >
                        {profile.name}
                        {#if profile.isDefault}
                          <span class="default-badge">default</span>
                        {/if}
                      </button>
                    {/each}
                  {/if}

                  <!-- Custom section (PRD Section 10) -->
                  {#if customProfiles.length > 0}
                    <div class="profile-section-header">Custom</div>
                    {#each customProfiles as profile (profile.id)}
                      <button
                        class="tab-menu-item"
                        onclick={() => addNewShellTab(profile.id)}
                        data-testid={`profile-${profile.id}`}
                      >
                        {profile.name}
                      </button>
                    {/each}
                  {/if}

                  <!-- Organization section (PRD Section 10) -->
                  {#if orgProfiles.length > 0}
                    <div class="profile-section-header">Organization</div>
                    {#each orgProfiles as profile (profile.id)}
                      <button
                        class="tab-menu-item"
                        onclick={() => addNewShellTab(profile.id)}
                        data-testid={`profile-${profile.id}`}
                      >
                        {profile.name}
                      </button>
                    {/each}
                  {/if}

                  <!-- Manage Profiles button (PRD Section 10) -->
                  <div class="profile-section-divider"></div>
                  <button
                    class="tab-menu-item manage-profiles-btn"
                    onclick={openManageProfiles}
                    data-testid="manage-profiles-btn"
                  >
                    Manage Profiles...
                  </button>
                </div>
              {/if}
            </div>
          {:else}
            <button
              class="tab-menu-item"
              onclick={() => addNewShellTab()}
              data-testid="new-shell-tab-btn"
            >
              <span class="tab-menu-icon">💻</span>
              Shell Terminal
            </button>
          {/if}
        </div>
      {/if}
    </div>
    <!-- Split View Controls -->
    <div class="split-controls">
      <button
        class="split-btn"
        onclick={toggleSplitMenu}
        title="Split view"
        data-testid="split-view-btn"
        disabled={tabs.length < 2 && layoutMode === 'tabs'}
      >
        ⊞
      </button>
      {#if showSplitMenu}
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
        <div class="split-menu-backdrop" onclick={closeSplitMenu}></div>
        <div class="split-menu" data-testid="split-menu">
          {#if layoutMode === 'tabs'}
            <button
              class="split-menu-item"
              onclick={splitHorizontal}
              disabled={tabs.length < 2}
              data-testid="split-horizontal-btn"
            >
              <span class="split-menu-icon">⬜⬜</span>
              Split Horizontal
            </button>
            <button
              class="split-menu-item"
              onclick={splitVertical}
              disabled={tabs.length < 2}
              data-testid="split-vertical-btn"
            >
              <span class="split-menu-icon">⬛<br>⬛</span>
              Split Vertical
            </button>
            <button
              class="split-menu-item"
              onclick={splitGrid}
              disabled={tabs.length < 4}
              data-testid="split-grid-btn"
            >
              <span class="split-menu-icon">⊞</span>
              Grid (2x2)
            </button>
          {:else}
            <button
              class="split-menu-item"
              onclick={unsplit}
              data-testid="unsplit-btn"
            >
              <span class="split-menu-icon">⬜</span>
              Unsplit (Tabs Only)
            </button>
          {/if}
        </div>
      {/if}
    </div>
  </div>

  <!-- Terminal Content -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="terminal-content"
    class:split-horizontal={layoutMode === 'split-horizontal'}
    class:split-vertical={layoutMode === 'split-vertical'}
    class:grid-layout={layoutMode === 'grid'}
    data-testid="terminal-container"
    onmousemove={handleSplitDrag}
    onmouseup={handleSplitDragEnd}
    onmouseleave={handleSplitDragEnd}
  >
    {#if tabs.length === 0}
      <div class="empty-state" data-testid="no-tabs-message">
        <p>No terminal sessions open</p>
        <p class="hint">Start a task or click + to open a new session</p>
        {#if currentProject}
          <div class="empty-state-buttons">
            <button class="start-claude-btn" onclick={addNewClaudeTab}>
              Start Claude Session
            </button>
            <button class="start-shell-btn" onclick={addNewShellTab}>
              Open Shell Terminal
            </button>
          </div>
        {/if}
      </div>
    {:else if layoutMode === 'tabs'}
      <!-- Standard tab view -->
      {#each tabs as tab (tab.id)}
        <div
          class="terminal-tab-content"
          class:hidden={tab.id !== activeTabId}
          data-testid={`terminal-content-${tab.id}`}
        >
          <div
            class="terminal-wrapper"
            use:initTerminalAction={tab.id}
          ></div>
        </div>
      {/each}
    {:else if layoutMode === 'split-horizontal' || layoutMode === 'split-vertical'}
      <!-- Split view (2 panes) -->
      <div
        class="split-container"
        class:horizontal={layoutMode === 'split-horizontal'}
        class:vertical={layoutMode === 'split-vertical'}
        class:dragging={isDraggingSplit}
      >
        <!-- Pane 0 (left/top) -->
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
        <div
          class="split-pane"
          class:focused={focusedPaneIndex === 0}
          style={layoutMode === 'split-horizontal'
            ? `width: ${splitRatio * 100}%`
            : `height: ${splitRatio * 100}%`}
          onclick={() => focusPane(0)}
          data-testid="split-pane-0"
        >
          <div class="pane-tabs">
            {#each getTabsForPane('pane-0') as tab (tab.id)}
              <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
              <div
                class="pane-tab"
                class:active={tab.id === getActiveTabForPane('pane-0')?.id}
                onclick={(e) => { e.stopPropagation(); switchTab(tab.id); focusPane(0); }}
              >
                <span class="pane-tab-icon">{tab.type === 'shell' ? '💻' : '🤖'}</span>
                <span class="pane-tab-title">{tab.title}</span>
              </div>
            {/each}
          </div>
          <div class="pane-content">
            {#each getTabsForPane('pane-0') as tab (tab.id)}
              <div
                class="terminal-tab-content"
                class:hidden={tab.id !== getActiveTabForPane('pane-0')?.id}
              >
                <div
                  class="terminal-wrapper"
                  use:initTerminalAction={tab.id}
                ></div>
              </div>
            {/each}
          </div>
        </div>

        <!-- Split Handle -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="split-handle"
          class:horizontal={layoutMode === 'split-horizontal'}
          class:vertical={layoutMode === 'split-vertical'}
          onmousedown={handleSplitDragStart}
          data-testid="split-handle"
        ></div>

        <!-- Pane 1 (right/bottom) -->
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
        <div
          class="split-pane"
          class:focused={focusedPaneIndex === 1}
          style={layoutMode === 'split-horizontal'
            ? `width: ${(1 - splitRatio) * 100}%`
            : `height: ${(1 - splitRatio) * 100}%`}
          onclick={() => focusPane(1)}
          data-testid="split-pane-1"
        >
          <div class="pane-tabs">
            {#each getTabsForPane('pane-1') as tab (tab.id)}
              <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
              <div
                class="pane-tab"
                class:active={tab.id === getActiveTabForPane('pane-1')?.id}
                onclick={(e) => { e.stopPropagation(); switchTab(tab.id); focusPane(1); }}
              >
                <span class="pane-tab-icon">{tab.type === 'shell' ? '💻' : '🤖'}</span>
                <span class="pane-tab-title">{tab.title}</span>
              </div>
            {/each}
          </div>
          <div class="pane-content">
            {#each getTabsForPane('pane-1') as tab (tab.id)}
              <div
                class="terminal-tab-content"
                class:hidden={tab.id !== getActiveTabForPane('pane-1')?.id}
              >
                <div
                  class="terminal-wrapper"
                  use:initTerminalAction={tab.id}
                ></div>
              </div>
            {/each}
          </div>
        </div>
      </div>
    {:else if layoutMode === 'grid'}
      <!-- PRD Section 10: 2x2 Grid view (4 panes) -->
      <div
        class="grid-container"
        class:dragging={isDraggingSplit}
        data-testid="grid-container"
      >
        <!-- Top Row -->
        <div class="grid-row" style="height: {gridRatios.horizontal * 100}%">
          <!-- Pane 0 (top-left) -->
          <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
          <div
            class="grid-pane"
            class:focused={focusedPaneIndex === 0}
            style="width: {gridRatios.vertical * 100}%"
            onclick={() => focusPane(0)}
            data-testid="grid-pane-0"
          >
            <div class="pane-tabs">
              {#each getTabsForPane('pane-0') as tab (tab.id)}
                <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
                <div
                  class="pane-tab"
                  class:active={tab.id === getActiveTabForPane('pane-0')?.id}
                  onclick={(e) => { e.stopPropagation(); switchTab(tab.id); focusPane(0); }}
                >
                  <span class="pane-tab-icon">{tab.type === 'shell' ? '💻' : '🤖'}</span>
                  <span class="pane-tab-title">{tab.title}</span>
                </div>
              {/each}
            </div>
            <div class="pane-content">
              {#each getTabsForPane('pane-0') as tab (tab.id)}
                <div
                  class="terminal-tab-content"
                  class:hidden={tab.id !== getActiveTabForPane('pane-0')?.id}
                >
                  <div class="terminal-wrapper" use:initTerminalAction={tab.id}></div>
                </div>
              {/each}
            </div>
          </div>

          <!-- Vertical Handle (between top panes) -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="grid-handle vertical"
            onmousedown={(e) => handleSplitDragStart(e, 'vertical')}
            data-testid="grid-handle-vertical-top"
          ></div>

          <!-- Pane 1 (top-right) -->
          <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
          <div
            class="grid-pane"
            class:focused={focusedPaneIndex === 1}
            style="width: {(1 - gridRatios.vertical) * 100}%"
            onclick={() => focusPane(1)}
            data-testid="grid-pane-1"
          >
            <div class="pane-tabs">
              {#each getTabsForPane('pane-1') as tab (tab.id)}
                <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
                <div
                  class="pane-tab"
                  class:active={tab.id === getActiveTabForPane('pane-1')?.id}
                  onclick={(e) => { e.stopPropagation(); switchTab(tab.id); focusPane(1); }}
                >
                  <span class="pane-tab-icon">{tab.type === 'shell' ? '💻' : '🤖'}</span>
                  <span class="pane-tab-title">{tab.title}</span>
                </div>
              {/each}
            </div>
            <div class="pane-content">
              {#each getTabsForPane('pane-1') as tab (tab.id)}
                <div
                  class="terminal-tab-content"
                  class:hidden={tab.id !== getActiveTabForPane('pane-1')?.id}
                >
                  <div class="terminal-wrapper" use:initTerminalAction={tab.id}></div>
                </div>
              {/each}
            </div>
          </div>
        </div>

        <!-- Horizontal Handle (between rows) -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="grid-handle horizontal"
          onmousedown={(e) => handleSplitDragStart(e, 'horizontal')}
          data-testid="grid-handle-horizontal"
        ></div>

        <!-- Bottom Row -->
        <div class="grid-row" style="height: {(1 - gridRatios.horizontal) * 100}%">
          <!-- Pane 2 (bottom-left) -->
          <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
          <div
            class="grid-pane"
            class:focused={focusedPaneIndex === 2}
            style="width: {gridRatios.vertical * 100}%"
            onclick={() => focusPane(2)}
            data-testid="grid-pane-2"
          >
            <div class="pane-tabs">
              {#each getTabsForPane('pane-2') as tab (tab.id)}
                <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
                <div
                  class="pane-tab"
                  class:active={tab.id === getActiveTabForPane('pane-2')?.id}
                  onclick={(e) => { e.stopPropagation(); switchTab(tab.id); focusPane(2); }}
                >
                  <span class="pane-tab-icon">{tab.type === 'shell' ? '💻' : '🤖'}</span>
                  <span class="pane-tab-title">{tab.title}</span>
                </div>
              {/each}
            </div>
            <div class="pane-content">
              {#each getTabsForPane('pane-2') as tab (tab.id)}
                <div
                  class="terminal-tab-content"
                  class:hidden={tab.id !== getActiveTabForPane('pane-2')?.id}
                >
                  <div class="terminal-wrapper" use:initTerminalAction={tab.id}></div>
                </div>
              {/each}
            </div>
          </div>

          <!-- Vertical Handle (between bottom panes) -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="grid-handle vertical"
            onmousedown={(e) => handleSplitDragStart(e, 'vertical')}
            data-testid="grid-handle-vertical-bottom"
          ></div>

          <!-- Pane 3 (bottom-right) -->
          <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
          <div
            class="grid-pane"
            class:focused={focusedPaneIndex === 3}
            style="width: {(1 - gridRatios.vertical) * 100}%"
            onclick={() => focusPane(3)}
            data-testid="grid-pane-3"
          >
            <div class="pane-tabs">
              {#each getTabsForPane('pane-3') as tab (tab.id)}
                <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
                <div
                  class="pane-tab"
                  class:active={tab.id === getActiveTabForPane('pane-3')?.id}
                  onclick={(e) => { e.stopPropagation(); switchTab(tab.id); focusPane(3); }}
                >
                  <span class="pane-tab-icon">{tab.type === 'shell' ? '💻' : '🤖'}</span>
                  <span class="pane-tab-title">{tab.title}</span>
                </div>
              {/each}
            </div>
            <div class="pane-content">
              {#each getTabsForPane('pane-3') as tab (tab.id)}
                <div
                  class="terminal-tab-content"
                  class:hidden={tab.id !== getActiveTabForPane('pane-3')?.id}
                >
                  <div class="terminal-wrapper" use:initTerminalAction={tab.id}></div>
                </div>
              {/each}
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>

  <TerminalProfileManager
    isOpen={showProfileManager}
    onClose={handleProfileManagerClose}
  />
</section>

<style>
  .tab-container {
    flex: 1;
    background: #0d0d12;
    border: 1px solid #2a2a3a;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    min-height: 150px;
    overflow: hidden;
    position: relative;
    z-index: 1; /* Below dashboard but establishes stacking context */
    isolation: isolate; /* Create stacking context for internal absolute positioning */
  }

  @media (max-height: 500px) {
    .tab-container {
      min-height: 120px;
    }
  }

  @media (max-width: 600px) {
    .tab-container {
      border-radius: 6px;
    }
  }

  .terminal-header-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    background: #12121a;
    border-bottom: 1px solid #2a2a3a;
    font-size: 12px;
    flex-shrink: 0;
  }

  .terminal-label {
    color: #888;
    font-weight: 500;
  }

  .terminal-title-text {
    color: #e0e0e0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }

  .terminal-status {
    color: #6bcb77;
    animation: pulse 1.5s ease-in-out infinite;
  }

  .tab-bar {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 6px 8px 0;
    background: #12121a;
    border-bottom: 1px solid #2a2a3a;
    overflow-x: auto;
    flex-shrink: 0;
  }

  .tab {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 5px 8px;
    background: #1a1a24;
    border: 1px solid #2a2a3a;
    border-bottom: none;
    border-radius: 6px 6px 0 0;
    color: #888;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s ease;
    max-width: 160px;
    min-width: 0;
  }

  @media (max-width: 600px) {
    .tab {
      padding: 4px 6px;
      font-size: 11px;
      max-width: 120px;
      gap: 3px;
    }
  }

  .tab:hover {
    background: #222230;
    color: #aaa;
  }

  .tab.active {
    background: #0d0d12;
    color: #e0e0e0;
    border-color: #3a3a5a;
  }

  .tab-icon {
    font-size: 11px;
    flex-shrink: 0;
  }

  .tab-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tab.shell {
    border-color: #4d96ff40;
  }

  .tab.shell.active {
    border-color: #4d96ff;
  }

  .tab-status {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .tab-status.running {
    background: #6bcb77;
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .tab-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 3px;
    color: #666;
    font-size: 14px;
    cursor: pointer;
    flex-shrink: 0;
  }

  .tab-close:hover {
    background: #3a3a4a;
    color: #ff6b6b;
  }

  .tab-add {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
    color: #666;
    font-size: 16px;
    cursor: pointer;
    margin-left: 4px;
  }

  .tab-add:hover {
    background: #1a1a24;
    border-color: #2a2a3a;
    color: #aaa;
  }

  .terminal-content {
    flex: 1;
    position: relative;
    overflow: hidden;
  }

  .terminal-tab-content {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
  }

  .terminal-tab-content.hidden {
    visibility: hidden;
    pointer-events: none;
  }

  .terminal-wrapper {
    flex: 1;
    padding: 8px;
    overflow: hidden;
  }

  @media (max-width: 600px) {
    .terminal-wrapper {
      padding: 4px;
    }
  }

  .terminal-wrapper :global(.xterm) {
    height: 100%;
  }

  .terminal-wrapper :global(.xterm-viewport) {
    overflow-y: auto !important;
  }

  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: #555;
    font-size: 14px;
  }

  .empty-state p {
    margin: 4px 0;
  }

  .empty-state .hint {
    font-size: 12px;
    color: #444;
  }

  .empty-state-buttons {
    display: flex;
    gap: 12px;
    margin-top: 16px;
  }

  .start-claude-btn,
  .start-shell-btn {
    padding: 10px 20px;
    border: none;
    border-radius: 6px;
    color: white;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s ease;
  }

  .start-claude-btn {
    background: var(--color-nerv-primary, #ff6b35);
  }

  .start-claude-btn:hover {
    background: #ff8855;
  }

  .start-shell-btn {
    background: #4d96ff;
  }

  .start-shell-btn:hover {
    background: #77b3ff;
  }

  /* Tab add dropdown menu */
  .tab-add-wrapper {
    position: relative;
  }

  .tab-menu-backdrop {
    position: fixed;
    inset: 0;
    z-index: 99;
  }

  .tab-menu {
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: 4px;
    background: #1a1a24;
    border: 1px solid #2a2a3a;
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    z-index: 100;
    min-width: 160px;
    overflow: hidden;
  }

  .tab-menu-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 10px 12px;
    background: transparent;
    border: none;
    color: #e0e0e0;
    font-size: 13px;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s ease;
  }

  .tab-menu-item:hover {
    background: #2a2a3a;
  }

  .tab-menu-item:first-child {
    border-bottom: 1px solid #2a2a3a;
  }

  .tab-menu-icon {
    font-size: 14px;
  }

  /* Split View Controls */
  .split-controls {
    position: relative;
    margin-left: auto;
    padding-left: 8px;
  }

  .split-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
    color: #666;
    font-size: 14px;
    cursor: pointer;
  }

  .split-btn:hover:not(:disabled) {
    background: #1a1a24;
    border-color: #2a2a3a;
    color: #aaa;
  }

  .split-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .split-menu-backdrop {
    position: fixed;
    inset: 0;
    z-index: 99;
  }

  .split-menu {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 4px;
    background: #1a1a24;
    border: 1px solid #2a2a3a;
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    z-index: 100;
    min-width: 160px;
    overflow: hidden;
  }

  .split-menu-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 10px 12px;
    background: transparent;
    border: none;
    color: #e0e0e0;
    font-size: 13px;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s ease;
  }

  .split-menu-item:hover:not(:disabled) {
    background: #2a2a3a;
  }

  .split-menu-item:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .split-menu-item:not(:last-child) {
    border-bottom: 1px solid #2a2a3a;
  }

  .split-menu-icon {
    font-size: 12px;
    line-height: 1;
    min-width: 20px;
    text-align: center;
  }

  /* Split Container */
  .split-container {
    position: absolute;
    inset: 0;
    display: flex;
  }

  .split-container.horizontal {
    flex-direction: row;
  }

  .split-container.vertical {
    flex-direction: column;
  }

  .split-container.dragging {
    cursor: col-resize;
    user-select: none;
  }

  .split-container.vertical.dragging {
    cursor: row-resize;
  }

  /* Split Pane */
  .split-pane {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 100px;
    min-height: 100px;
    border: 2px solid transparent;
    transition: border-color 0.15s ease;
  }

  .split-pane.focused {
    border-color: var(--color-nerv-primary, #ff6b35);
  }

  .pane-tabs {
    display: flex;
    gap: 2px;
    padding: 4px 4px 0;
    background: #12121a;
    border-bottom: 1px solid #2a2a3a;
    overflow-x: auto;
    flex-shrink: 0;
  }

  .pane-tab {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    background: #1a1a24;
    border: 1px solid #2a2a3a;
    border-bottom: none;
    border-radius: 4px 4px 0 0;
    color: #888;
    font-size: 11px;
    cursor: pointer;
    transition: all 0.15s ease;
    max-width: 120px;
  }

  .pane-tab:hover {
    background: #222230;
    color: #aaa;
  }

  .pane-tab.active {
    background: #0d0d12;
    color: #e0e0e0;
    border-color: #3a3a5a;
  }

  .pane-tab-icon {
    font-size: 10px;
    flex-shrink: 0;
  }

  .pane-tab-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pane-content {
    flex: 1;
    position: relative;
    overflow: hidden;
    background: #0d0d12;
  }

  /* Split Handle */
  .split-handle {
    flex-shrink: 0;
    background: #2a2a3a;
    transition: background 0.15s ease;
  }

  .split-handle.horizontal {
    width: 4px;
    cursor: col-resize;
  }

  .split-handle.vertical {
    height: 4px;
    cursor: row-resize;
  }

  .split-handle:hover {
    background: var(--color-nerv-primary, #ff6b35);
  }

  /* PRD Section 10: Grid Layout (2x2) */
  .grid-container {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
  }

  .grid-container.dragging {
    user-select: none;
  }

  .grid-row {
    display: flex;
    flex-direction: row;
    flex-shrink: 0;
    overflow: hidden;
  }

  .grid-pane {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 80px;
    min-height: 80px;
    border: 2px solid transparent;
    transition: border-color 0.15s ease;
  }

  .grid-pane.focused {
    border-color: var(--color-nerv-primary, #ff6b35);
  }

  .grid-handle {
    flex-shrink: 0;
    background: #2a2a3a;
    transition: background 0.15s ease;
  }

  .grid-handle.horizontal {
    height: 4px;
    width: 100%;
    cursor: row-resize;
  }

  .grid-handle.vertical {
    width: 4px;
    cursor: col-resize;
  }

  .grid-handle:hover {
    background: var(--color-nerv-primary, #ff6b35);
  }

  /* Terminal Profile Submenu (PRD Section 21) */
  .tab-menu-item-with-submenu {
    position: relative;
  }

  .submenu-arrow {
    margin-left: auto;
    font-size: 10px;
    color: #666;
  }

  .profile-submenu {
    position: absolute;
    left: 100%;
    top: 0;
    margin-left: 2px;
    background: #1a1a24;
    border: 1px solid #2a2a3a;
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    min-width: 160px;
    overflow: hidden;
    z-index: 101;
  }

  .profile-submenu .tab-menu-item {
    border-bottom: none;
  }

  .profile-submenu .tab-menu-item:not(:last-child) {
    border-bottom: 1px solid #2a2a3a;
  }

  .default-badge {
    margin-left: auto;
    padding: 2px 6px;
    background: #3a3a5a;
    border-radius: 3px;
    font-size: 10px;
    color: #888;
  }

  /* PRD Section 10: Profile section headers for dropdown */
  .profile-section-header {
    padding: 6px 12px 4px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #666;
    border-top: 1px solid #2a2a3a;
  }

  .profile-section-header:first-child {
    border-top: none;
  }

  .profile-section-divider {
    height: 1px;
    background: #2a2a3a;
    margin: 4px 0;
  }

  .manage-profiles-btn {
    color: #4d96ff !important;
    font-style: italic;
  }

  .manage-profiles-btn:hover {
    background: #2a2a4a !important;
  }
</style>
