/**
 * PRD workflow excerpt for NERV Ops grading.
 *
 * Claude uses this as the reference standard when scoring how well
 * a benchmark run followed NERV's intended orchestration patterns.
 */

export const PRD_WORKFLOW_EXCERPT = `
## NERV Workflow Patterns (from PRD)

### Single-App Experience
NERV presents one unified dashboard. Users open NERV, create a project,
add repositories, define tasks, and let Claude Code handle implementation.
The user's role is planning, reviewing, and approving — not coding.

### Test-Driven Iterative Development
Each cycle follows: plan → implement → test → review → merge.
Tasks are scoped so Claude can complete them in one session.
"Only plan one cycle ahead — learn from results, then plan more."

### Worktree Isolation
"NERV creates git worktrees — your main repo is never modified directly."
Every task gets its own worktree branched from the base repo.
On approval, the worktree branch is merged back. On rejection, it is discarded.
This ensures the main branch always contains reviewed, approved code.

### Cycle Management
Cycles group related tasks into an iteration.
Each cycle has a goal derived from the spec.
Spec completion should increase across cycles.
Audits can run at the end of a cycle to verify progress.

### Permission System
"All dangerous commands require your explicit approval."
NERV supports two permission patterns:
1. Hook-based: NERV's hook system intercepts tool calls for interactive review.
   Always-allow rules reduce friction for repeated tool use.
2. Pre-approval: --allowedTools flags pre-approve tools at session start.
   This is the standard pattern for automated/benchmark runs where no human
   is present to approve interactively. Zero permission prompts means
   all tools were pre-approved correctly — this is clean permission management.

### Review Gates
Before merging, completed work goes through review.
The review agent (or human) checks code quality, test results,
and spec compliance. Rejected work gets feedback and iterates.
Approved work is merged into the base branch.

### Error Recovery
Loop detection monitors rapid tool use. In practice, the loop-detection
dialog often triggers as a false positive during productive coding (many
tools used in quick succession). NERV auto-dismisses these instantly.
Stuck detection identifies truly stalled sessions.
Compaction handles context window limits.
The system should recover gracefully, not crash or hang.
Evaluate error recovery by task outcomes (completed vs failed), not by
the number of loop-detection triggers.

### Cost Tracking
Token usage and cost are tracked per task and per cycle.
Efficient runs complete specs with reasonable token budgets.
Cost relative to complexity (spec items) matters more than absolute cost.
`
