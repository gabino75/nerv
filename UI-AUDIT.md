# UI Component Audit

Target architecture: 3 tabs (Spec, Kanban, CLIs) + secondary panels behind "More" menu.
Source of truth: PRD (`basic-ralph/PRD.md`), session prompt UI Architecture Target.

---

## Classification Summary

| Category     | Count | Components |
|-------------|-------|------------|
| KEEP        | 16    | Core workflow, shared primitives, dialogs |
| RESTRUCTURE | 10    | Move into correct tab or inline |
| REMOVE      | 14    | Scope creep, redundant, or abstracted away |
| NEW         | 5     | Spec tab, 3-tab layout, Activity Log, YOLO toggle, task drill-down |

**Total existing: 58** | **Post-restructure target: ~31** (16 kept + 10 restructured + 5 new)

---

## KEEP — Core workflow components (16)

These stay largely as-is. They map directly to PRD requirements.

| Component | Lines | Why Keep | Tab/Location |
|-----------|-------|----------|-------------|
| `RecommendButton.svelte` | 150 | Primary UX — "What's Next?" panel with direction input, ranked cards, approve/execute. PRD Section: Recommendations. | Floating/Header (all tabs) |
| `ApprovalQueue.svelte` | 327 | Real-time approval polling, pattern-based rules (Always/Never Allow). PRD: Permission system. | Kanban tab (inline) |
| `approval/ApprovalItem.svelte` | 50 | Collapsible approval with tool name, expanded details. | Inside ApprovalQueue |
| `approval/ApprovalActions.svelte` | 60 | Four action buttons: Always Allow, Just Once, Deny, Never Allow. PRD: Permission learning. | Inside ApprovalItem |
| `approval/ApprovalDetails.svelte` | 60 | Command display, deny reason input. | Inside ApprovalItem |
| `approval/PatternSelector.svelte` | 60 | Pattern suggestions from tool input analysis. PRD: Permission rules. | Inside ApprovalItem |
| `AlertNotification.svelte` | 490 | Toast notifications for hang/loop/compaction/audit/approval/task-complete. | Global overlay |
| `LoopDetectedDialog.svelte` | 150 | Loop detection with Branch/Clear/Continue/Stop options. PRD: Error recovery. | Modal (global) |
| `CompactionDialog.svelte` | 150 | Context compaction alert with Continue/Branch/Clear options. PRD: Context management. | Modal (global) |
| `RecoveryDialog.svelte` | 150 | Interrupted task recovery on startup. PRD: Error recovery. | Modal (global) |
| `LockedProjectDialog.svelte` | 200 | Multi-instance project locking. PRD: One app per project. | Modal (global) |
| `ProjectSelector.svelte` | 100 | Project selector dropdown in header. PRD: Project management. | Header (all tabs) |
| `ModelSelector.svelte` | 100 | Model switching dropdown. PRD: Model & Tokens settings. | Header or Settings |
| `shared/Button.svelte` | 60 | Reusable button primitive. | Everywhere |
| `shared/Modal.svelte` | 60 | Reusable modal dialog. | Everywhere |
| `shared/FormGroup.svelte` | 57 | Reusable form label+input wrapper. | Everywhere |

---

## RESTRUCTURE — Components that belong but need rework (10)

| Component | Lines | Current | Target | Changes Needed |
|-----------|-------|---------|--------|----------------|
| `App.svelte` | — | Header + dashboard + terminal layout | 3-tab layout (Spec/Kanban/CLIs) + header with ProjectSelector, "What's Next?", "More" menu | Replace layout entirely. Tabs as primary navigation. Secondary panels via "More" dropdown. |
| `TaskBoard.svelte` | 150 | Standalone kanban board | **Kanban tab** main content | Add: active cycle header with progress inline (replace standalone CyclePanel). Add: YOLO toggle button. Add: task drill-down on click. Remove: standalone "New Task" modal (tasks created via recommend). |
| `ActionBar.svelte` | 756 | Task execution buttons + message input | Inline in **Kanban tab** task drill-down | Move Start/Stop/Resume/Approve/Reject into task drill-down panel. Message input stays for Claude communication. Remove branching/context-clear (move to "More" menu). |
| `TabContainer.svelte` | 200 | Terminal manager with splits | **CLIs tab** main content | Add: terminal type dropdown (Claude, PowerShell, Python, Bash, WSL). Claude instances: pass `--mcp-config` for nerv-context/nerv-progress/nerv-docs. Open in project directory by default. Keep split view. |
| `AuditPanel.svelte` | 1427 | Standalone 3-tab panel (Health/Spec Drift/Logs) | Split: Health+Spec Drift → **Kanban tab** audit section, Logs → **Activity Log** (secondary) | Health check and spec drift are cycle-related → show in Kanban after audit triggers. Full audit log → Activity Log panel behind "More" menu. |
| `CostDashboard.svelte` | 200 | Standalone panel | **Secondary** behind "More" menu | No structural changes needed, just move access point. |
| `SettingsPanel.svelte` | 150 | Standalone panel with scope tabs | **Secondary** behind "More" menu or gear icon | Absorb ModelStats, TerminalProfileManager settings. Keep scope tabs (Global/Org/Project/Repo). |
| `shared/DropdownMenu.svelte` | 60 | Header dropdown | Header "More" menu + other dropdowns | Reuse for "More" menu that holds secondary panels. May need variant for tab-level dropdowns. |
| `task/TaskReviewModal.svelte` | 150 | Modal for task review | Inline in **Kanban tab** task drill-down | Show diff, test results, approve/reject inline instead of modal popup. |
| `SpecProposalsPanel.svelte` | 150 | Standalone polling panel | **Spec tab** inline section | Spec update proposals belong in the Spec tab, shown inline below the spec viewer. |

---

## REMOVE — Scope creep, redundant, or abstracted away (14)

| Component | Lines | Why Remove |
|-----------|-------|------------|
| `WorkflowTemplatesPanel.svelte` | 150 | Scope creep. Skills/workflows are CLI infrastructure, not user-facing UI. PRD doesn't describe a template marketplace in the dashboard. |
| `OrgConfigPanel.svelte` | 100 | Scope creep. Org config sync is automatic background process. No PRD requirement for manual org config UI. |
| `TerminalProfileManager.svelte` | 150 | Move to Settings. Terminal profile CRUD doesn't need its own panel — it's a settings subsection. Merge into SettingsPanel. |
| `ModelStats.svelte` | 150 | Merge into Settings or CostDashboard. Per-model stats are a settings/cost concern, not a standalone panel. |
| `BranchingDialog.svelte` | 467 | Abstracted away. Worktree/branch management is automatic in NERV. Users don't manually create branches. PRD: "worktrees provide isolation" automatically. |
| `MergeBranchDialog.svelte` | 150 | Abstracted away. Merge is automatic on task approval. No manual merge UI needed. |
| `WorktreePanel.svelte` | 150 | Abstracted away. Worktree lifecycle is fully automatic (create on task start, merge on approve, clean on complete). PRD: no manual worktree management. |
| `CyclePanel.svelte` | 200 | Inline into Kanban. Cycle info (goal, progress, tasks) belongs inline in Kanban tab header, not a separate overlay panel. |
| `cycle/CycleDecisionList.svelte` | 60 | Inline into Kanban. ADR decisions per cycle → show in task drill-down or cycle summary inline. |
| `cycle/DecisionModal.svelte` | 50 | Inline into Kanban. Decision creation → part of task workflow, not a standalone modal. |
| `ClearWithSummary.svelte` | 200 | Niche. Context clearing with summary capture — useful but not primary workflow. Move logic to CLI or collapse into CompactionDialog options. |
| `ActiveSessionsPanel.svelte` | 434 | Redundant with CLIs tab. Active Claude sessions are visible as terminal tabs. Token/context usage can be shown per-tab in CLIs. |
| `UpdateNotification.svelte` | 150 | Infrastructure. Auto-update UI is Electron boilerplate, not NERV workflow. Keep the code but it's not part of the 3-tab restructure. |
| `BudgetAlertDialog.svelte` | 277 | Merge into CostDashboard. Budget alerts can be toast notifications (AlertNotification) + CostDashboard settings. Doesn't need its own modal. |

---

## KEEP BUT RELOCATE — Components that stay but move (8)

These aren't removed but their access point changes.

| Component | Lines | Current Access | New Access |
|-----------|-------|---------------|------------|
| `ExportImport.svelte` | 100 | Standalone panel | "More" menu → Export/Import |
| `AddRepoDialog.svelte` | 327 | Standalone dialog | "More" menu → Settings → Repos, or Kanban tab project setup |
| `ReposPanel.svelte` | 150 | Standalone panel | "More" menu → Settings → Repos |
| `RepoContextPanel.svelte` | 150 | Inside ReposPanel | Inside Settings → Repos |
| `KnowledgePanel.svelte` | 100 | Standalone panel | "More" menu → Settings → Knowledge |
| `ClaudeMdEditor.svelte` | 100 | Inside KnowledgePanel | Settings → Knowledge → CLAUDE.md |
| `DocumentationSources.svelte` | 100 | Inside KnowledgePanel | Settings → Knowledge → Docs |
| `CustomAgentsEditor.svelte` | 150 | Inside KnowledgePanel | Settings → Knowledge → Agents |

---

## NEW — Components to build (5)

| Component | Location | Description |
|-----------|----------|-------------|
| `SpecTab.svelte` | **Tab 1** | Markdown viewer/editor for project spec. Action buttons: Build Spec, Review Spec, Rewrite Spec, Add Documentation (each spawns a Claude agent). Agent status showing which agents work on spec. Spec version history/diff view. Inline SpecProposalsPanel for pending updates. |
| `ThreeTabLayout.svelte` | Root layout | Replaces current App.svelte layout. Three primary tabs (Spec/Kanban/CLIs) with header (ProjectSelector, "What's Next?", "More" menu). Tab switching, persistent state per tab. |
| `ActivityLog.svelte` | "More" menu | Unified event log: agents spawned, MCP calls, tools used, files read/written, worktrees created/merged. Sources: audit_log DB, session_metrics DB, stream parser events. Filterable by time, event type, task. |
| `YoloToggle.svelte` | Kanban tab | Simple toggle button for YOLO mode (auto-build, auto-recommend, auto-audit). Configuration: end criteria, max iterations, audit frequency. Separate from benchmark infrastructure. Replaces YoloBenchmarkPanel in the UI. |
| `TaskDrillDown.svelte` | Kanban tab | Click a task card → slide-in panel with: live agent output, git diff, review workflow (approve/reject inline), acceptance criteria, tool usage, cost/tokens. Replaces TaskReviewModal + ActionBar task controls. |

---

## Component Flow: Before vs After

### Before (current)
```
App.svelte
├── Header: ProjectSelector, ModelSelector, DropdownMenu ("More")
├── Dashboard area (varies by selection):
│   ├── TaskBoard (default)
│   ├── AuditPanel
│   ├── CostDashboard
│   ├── SettingsPanel
│   ├── WorktreePanel
│   ├── ActiveSessionsPanel
│   ├── CyclePanel (overlay)
│   ├── KnowledgePanel
│   ├── WorkflowTemplatesPanel
│   ├── OrgConfigPanel
│   ├── YoloBenchmarkPanel
│   └── ... (many more standalone panels)
├── ActionBar (task controls)
├── TabContainer (terminals, always visible at bottom)
├── RecommendButton (floating)
├── ApprovalQueue (floating)
└── Modals/Dialogs (various overlays)
```

### After (target)
```
App.svelte (ThreeTabLayout)
├── Header: ProjectSelector, "What's Next?" button, "More" menu
│   └── "More" menu: Settings, Activity Log, Cost Dashboard, Export/Import
├── Tab 1: SpecTab
│   ├── Spec markdown viewer/editor
│   ├── Action buttons (Build/Review/Rewrite/Add Docs)
│   ├── Agent status
│   ├── SpecProposalsPanel (inline)
│   └── Spec history/diff
├── Tab 2: Kanban (TaskBoard restructured)
│   ├── Cycle header (inline, replaces CyclePanel)
│   ├── YoloToggle
│   ├── Task cards (click → TaskDrillDown)
│   │   └── TaskDrillDown: agent output, diff, review, criteria
│   ├── ApprovalQueue (inline)
│   └── Audit summary (inline, post-audit)
├── Tab 3: CLIs (TabContainer restructured)
│   ├── Terminal type selector (Claude/PowerShell/Python/Bash/WSL)
│   ├── Claude instances with MCP config
│   └── Split view support
├── RecommendButton (floating, accessible from all tabs)
├── AlertNotification (global toasts)
└── Recovery/Loop/Compaction/Locked dialogs (global modals)
```

---

## Migration Order

1. **P6**: Build ThreeTabLayout + SpecTab. Replace App.svelte layout. Move "More" menu items.
2. **P7**: Restructure TaskBoard into Kanban tab. Inline cycle header, add TaskDrillDown, YoloToggle.
3. **P8**: Restructure TabContainer into CLIs tab. Add terminal types, MCP config for Claude sessions.
4. **P9**: Build ActivityLog. Remove standalone panels (WorktreePanel, ActiveSessionsPanel, etc.). Merge settings.
5. **P10**: Fix E2E tests for new structure. Update selectors, test flows.

---

## Risk Assessment

- **Highest risk**: App.svelte layout change (P6) — breaks ALL E2E tests. Must rebuild Docker + fix selectors after.
- **Medium risk**: TaskBoard restructure (P7) — ActionBar logic redistribution is complex (756 lines).
- **Low risk**: CLIs tab (P8) — TabContainer already works, mostly adding features.
- **Test strategy**: Unit tests unaffected (no component tests). E2E tests need selector updates after P6-P7. Run full E2E suite after each phase.

---

## Components by File Size (refactoring priority)

| Component | Lines | Action |
|-----------|-------|--------|
| `AuditPanel.svelte` | 1427 | RESTRUCTURE — split Health/Drift from Logs |
| `ActionBar.svelte` | 756 | RESTRUCTURE — distribute into TaskDrillDown |
| `AlertNotification.svelte` | 490 | KEEP |
| `BranchingDialog.svelte` | 467 | REMOVE |
| `ActiveSessionsPanel.svelte` | 434 | REMOVE |
| `ApprovalQueue.svelte` | 327 | KEEP |
| `AddRepoDialog.svelte` | 327 | RELOCATE to Settings |
| `BudgetAlertDialog.svelte` | 277 | REMOVE (merge into CostDashboard) |
| `ClearWithSummary.svelte` | 200 | REMOVE (collapse into CompactionDialog) |
