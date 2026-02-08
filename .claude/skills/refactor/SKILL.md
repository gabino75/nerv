---
name: refactor
description: Refactor code while maintaining behavior
allowed-tools: [Read, Write, Edit, Bash, Grep, Glob]
---

# Refactoring Workflow

## Acceptance Criteria
- [ ] All existing tests still pass
- [ ] No change in external behavior
- [ ] Code is cleaner/more maintainable
- [ ] No new linting errors

## Steps
1. Run existing tests to establish baseline
2. Identify refactoring opportunities
3. Make incremental changes
4. Run tests after each change
5. If tests fail, revert and try different approach
6. Document what was refactored and why
