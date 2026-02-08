---
layout: home

hero:
  name: NERV
  text: Spec-Driven AI Development
  tagline: Write a spec. Let Claude build it — MVP first, tests always, iterating cycle by cycle until it's done.
  image:
    src: /nerv-logo.png
    alt: NERV
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/gabino75/nerv

features:
  - icon: "\U0001F9ED"
    title: '"What''s Next?" Recommendations'
    details: Claude analyzes your project state and recommends 2-3 ranked next steps. Approve to execute, or give direction to steer.
  - icon: "\U0001F4DD"
    title: Spec-Driven Development
    details: Write a markdown spec defining what to build. NERV breaks it into cycles and tasks, prioritizing MVP scope and E2E tests first.
  - icon: "\U0001F9EA"
    title: Test-First by Design
    details: Every cycle starts with E2E tests and core functionality. Claude writes tests alongside implementation, not as an afterthought.
  - icon: "\U0001F512"
    title: Permission Control
    details: Approve or deny commands via hooks. Build pattern-based rules from your approval history. Stay in control while Claude works.
  - icon: "\U0001F916"
    title: YOLO Mode
    details: Go fully autonomous. NERV manages cycles, tasks, reviews, and merges — with cost limits and AI-powered code review built in.
  - icon: "\U0001F500"
    title: Multi-Repository Support
    details: Work across multiple repos with git worktrees. Each task gets an isolated branch. Your main branch is never touched directly.
---

![NERV Dashboard](/screenshots/dashboard-project.png)

## Quick Start

```bash
# Prerequisites: Claude Code CLI, Git 2.20+, Node.js 18+
git clone https://github.com/gabino75/nerv.git
cd nerv
npm install
npm run dev
```

## How It Works

1. **Create a Project** — point NERV at your repo and describe your goal
2. **Ask "What's Next?"** — Claude recommends the next step. Click **Approve** to execute it.
3. **Claude Builds** — NERV creates a worktree, spawns Claude Code, writes code and tests
4. **You Review** — approve permissions, verify changes, merge back
5. **Repeat** — ask "What's Next?" until your spec is complete

Early on, let Claude drive — click "What's Next?" and approve suggestions. Later, take the wheel with specific commands and targeted tasks.

## Key Features

### AI-Guided Recommendations

The "What's Next?" panel recommends 2-3 ranked actions based on your project's current state. Approve to execute directly, or type direction to steer the suggestions.

### Git Worktree Isolation

Each task gets its own worktree with a unique branch (`nerv/{taskId}-{timestamp}`). Your main branch is never directly modified, and you can work on multiple tasks in parallel.

### Context Management

Claude Code sessions receive context via NERV.md, which includes task description, project goal, learnings from previous cycles, and key decisions.

### Benchmarking

Run benchmarks with specification files and score the results:

```bash
nerv benchmark specs/todo-app.md --cycles 5
nerv benchmark score test-results/benchmark/
```

Scoring combines deterministic NERV operations metrics with Claude-graded code quality.
