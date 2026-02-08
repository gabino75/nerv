---
name: write-tests
description: Generate comprehensive tests for specified code
allowed-tools: [Read, Write, Edit, Bash, Grep, Glob]
---

# Test Generation Workflow

## Acceptance Criteria
- [ ] Unit tests for all public functions
- [ ] Edge cases covered (null, empty, boundary values)
- [ ] Error cases tested
- [ ] Tests follow project testing conventions
- [ ] All new tests pass

## Steps
1. Read the target file(s) to understand functionality
2. Identify all public functions/methods
3. For each function:
   - Write happy path test
   - Write edge case tests
   - Write error case tests
4. Run tests to verify they pass
5. Check coverage if tool available
