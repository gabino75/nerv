---
name: pr-review
description: Review a pull request for code quality, security, and standards
allowed-tools: [Read, Grep, Glob, Bash, WebFetch]
---

# PR Review Workflow

## Acceptance Criteria
- [ ] All changed files reviewed
- [ ] Security vulnerabilities checked (OWASP top 10)
- [ ] Test coverage verified for new code
- [ ] Code style matches project conventions (CLAUDE.md)
- [ ] No breaking changes without migration path
- [ ] Documentation updated if API changed

## Steps
1. Get PR information: `gh pr view --json files,additions,deletions`
2. Get PR diff: `gh pr diff`
3. Read all changed files in full
4. Check for security issues (SQL injection, XSS, etc.)
5. Verify tests exist for new code paths
6. Check code style against project CLAUDE.md
7. Generate review summary with:
   - Overall assessment (approve/request-changes)
   - Specific feedback per file
   - Security concerns if any
   - Suggested improvements
