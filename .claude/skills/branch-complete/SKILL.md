---
name: branch-complete
description: Complete a branch session and summarize findings for merging back to main
allowed-tools: [Read]
---

# Branch Complete

Summarize your findings from a branch session so they can be merged back to the main session.

## When to Use

Use this skill when you've completed experimentation in a branch session and want to:
1. Document what was tried
2. Record what worked and what didn't
3. Capture key learnings for the main session
4. Prepare findings for merge

## Workflow

1. Review what was attempted during this branch session
2. Identify successful approaches
3. Document failed approaches and why they failed
4. Extract key learnings about the system/problem
5. Summarize next steps or recommendations

## Output Format

Provide a structured summary using this format:

```markdown
## Branch Session Summary

### What was attempted
1. [Approach 1] - [Result: worked/didn't work]
2. [Approach 2] - [Result: worked/didn't work]
...

### What worked
- [Successful approach with details]
- [Key that made it work]

### What didn't work (and why)
- [Failed approach]: [Reason it failed]
- [Failed approach]: [Reason it failed]

### Key learnings
- [Important discovery about the system]
- [Insight about the problem space]
- [Technical finding to remember]

### Recommendation
[Brief recommendation for the main session on how to proceed]

### Merge decision
[Suggest: MERGE (if solution found) or DISCARD (if no solution)]
```

## Notes

- Be concise but thorough
- Focus on actionable insights
- Include specific details that will help the main session
- If a solution was found, explain clearly how to implement it
