---
layout: home

hero:
  name: NERV
  text: AI-Orchestrated Multi-Repository Development
  tagline: An Electron dashboard that orchestrates Claude Code for multi-repository feature development
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
  - icon: 🚀
    title: Single App Experience
    details: One dashboard to manage all your Claude Code sessions, tasks, and permissions across multiple repositories.
  - icon: 📋
    title: Kanban Task Board
    details: Visual task management with 5 statuses (todo, in_progress, interrupted, review, done) and cycle-based development.
  - icon: 🔒
    title: Permission Management
    details: Approve or deny dangerous commands via hooks. Build pattern-based rules from your approval history.
  - icon: 🤖
    title: YOLO Mode
    details: Autonomous benchmark mode with configurable limits. Let Claude work through tasks with AI-powered review.
  - icon: 💻
    title: CLI-First Architecture
    details: Full functionality via command line for headless operation, scripting, and CI/CD integration.
  - icon: 🔀
    title: Multi-Repository Support
    details: Work across multiple repos with git worktrees. Each task gets isolated branches automatically.
---

## Quick Start

```bash
# Install NERV
npm install -g nerv

# Initialize in your project
nerv init

# Create a project and start working
nerv project create "My Feature"
nerv task create "Implement login endpoint"
nerv start
```

## How It Works

1. **Open NERV** - Launch the dashboard or use the CLI
2. **Create a Project** - Select your repository folder(s) and describe your goal
3. **Start a Task** - NERV creates a worktree and spawns Claude Code
4. **Approve Permissions** - Review and approve dangerous commands as needed
5. **Review & Merge** - When complete, review the changes and merge

## Key Features

### Multi-Tab Sessions

Run multiple concurrent Claude sessions with a tabbed interface. Task-linked tabs show the task name, standalone tabs are for exploration.

### Git Worktree Isolation

Each task gets its own worktree with a unique branch. Your main branch is never directly modified, and you can work on multiple tasks in parallel.

### Context Management

Claude Code sessions receive context via NERV.md, which includes task description, project goal, learnings from previous cycles, and key decisions.

### Benchmarking

Run benchmarks with specification files and score the results. Track history and compare performance over time.

```bash
nerv benchmark specs/todo-app.md --cycles 5
nerv benchmark score test-results/benchmark/
```
