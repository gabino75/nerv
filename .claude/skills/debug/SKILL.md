---
name: debug
description: Investigate a bug and produce a research report (no code changes)
allowed-tools: [Read, Bash, Grep, Glob, WebSearch]
---

# Debug & Research Workflow (PRD Section 3)

Debug tasks produce research reports, NOT code changes. The fix is a separate task.

## Acceptance Criteria
- [ ] Issue reproduced with clear steps
- [ ] Root cause identified with evidence
- [ ] Affected components documented
- [ ] Suggested fixes provided with trade-offs
- [ ] Recommended fix selected with reasoning
- [ ] Regression test specification provided

## Output Format

Produce a research report with these sections:

### Reproduction
- Steps to reproduce the issue
- Actual vs expected behavior
- Environment/conditions where it occurs

### Root Cause
- What is causing the issue
- Code paths involved
- Why this bug exists

### Evidence
- Log snippets, stack traces
- File paths and line numbers
- Test output if applicable

### Affected Components
- List all files/modules affected
- Impact assessment

### Suggested Fixes
For each option:
1. **Description**: What the fix does
2. **Effort**: Low / Medium / High
3. **Risk**: What could go wrong
4. **Trade-offs**: Pros and cons

### Recommended Fix
- Which option to implement and why
- Regression test specification

## Steps
1. Reproduce the issue (run commands, check logs)
2. Read relevant code and error messages
3. Form hypothesis about root cause
4. Gather evidence (logs, traces, test output)
5. Identify all affected components
6. Research potential fixes (do NOT implement)
7. Document findings in the format above

## Important
- Do NOT modify source code files
- Do NOT implement fixes
- Only READ and ANALYZE
- A separate implementation task will be created after review
