# Feature Demos

Step-by-step visual guides for NERV's key features. Each guide walks through a workflow with annotated screenshots.

## Getting Started

### [Quick Start Guide](./demos/quick-start)
Create a project, get AI-powered recommendations, and run your first Claude session.

---

## Core Features

### [Code Review](./demos/code-review)
Human-in-the-loop review for AI-generated code. Review diffs, provide feedback, and approve changes.

### [YOLO Mode](./demos/yolo-mode)
Fully autonomous development from a spec file. Configure, launch, and track results.

### [Multi-Repo](./demos/multi-repo)
Manage multiple repositories with shared context, knowledge bases, and isolated worktrees.

---

## Monitoring

### [Audit & Health](./demos/audit-health)
Continuous code quality monitoring with health checks, spec drift detection, and audit logs.

### [Cost & Context](./demos/cost-context)
Track token usage, session costs, and budget across all projects and models.

---

## Regenerating Screenshots

Screenshots are captured using Playwright with the Electron app:

```bash
npx playwright test test/e2e/screenshot-demos.spec.ts
```

Screenshots are saved to `docs-site/public/screenshots/demos/` organized by feature.
