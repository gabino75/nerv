# API Dashboard Specification

## Overview

A dashboard application that fetches data from REST APIs, displays it with charts and tables, and handles loading/error states gracefully.

**Complexity:** Medium
**Target Score:** 7+/10 on all categories

---

## Core Features

### 1. Dashboard Layout
- Header with title and refresh button
- Grid of metric cards
- Main content area with charts/tables
- Responsive sidebar navigation

### 2. API Data Fetching
- Fetch data from mock API endpoints
- Show loading spinners during fetch
- Handle network errors with retry button
- Cache responses for 60 seconds

### 3. Metric Cards
- Display 4-6 key metrics (e.g., users, revenue, orders)
- Show trend indicators (up/down arrows)
- Color coding for positive/negative trends
- Click to see detailed view

### 4. Data Tables
- Sortable columns
- Pagination (10/25/50 rows per page)
- Search/filter functionality
- Export to CSV button

### 5. Error Handling
- Network error with retry option
- Empty state when no data
- Partial failure (some widgets fail, others work)
- Toast notifications for actions

---

## Technical Requirements

- **Language:** Modern JavaScript or TypeScript
- **Framework:** Any (React, Vue, Svelte, or vanilla JS)
- **Styling:** Clean dashboard UI (Tailwind optional)
- **Build:** Must have `npm run dev` and `npm run build`
- **Mock API:** Use JSON files or mock server (no external APIs)

---

## Project Structure

```
api-dashboard/
├── README.md
├── CLAUDE.md
├── package.json
├── src/
│   ├── index.html
│   ├── main.js (or .ts)
│   ├── api/
│   │   └── mock-data.json
│   ├── components/
│   │   ├── MetricCard.js
│   │   ├── DataTable.js
│   │   └── ErrorBoundary.js
│   └── styles.css
└── test/
    └── dashboard.test.js
```

---

## README Must Include

1. Project description (1-2 sentences)
2. How to install: `npm install`
3. How to run: `npm run dev`
4. How to build: `npm run build`
5. API endpoints documentation
6. Feature list with status

---

## CLAUDE.md Must Include

```markdown
# API Dashboard - Claude Code Conventions

## Commands
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm test` - Run tests

## Code Style
- Use const/let, not var
- Use async/await for API calls
- Handle all promise rejections
- Extract reusable components

## Constraints
- Use mock data only (no real API calls)
- Must work offline after initial load
- Keep bundle size under 500KB
```

---

## Acceptance Criteria

- [ ] Dashboard loads with metric cards
- [ ] Data table displays with sorting
- [ ] Pagination works correctly
- [ ] Loading states shown during fetches
- [ ] Error states display with retry option
- [ ] Search/filter works on tables
- [ ] Export to CSV downloads file
- [ ] Works on mobile viewport (375px)
- [ ] No console errors
- [ ] README is accurate and complete
- [ ] App starts with `npm run dev`

---

## Scoring Criteria

### Implementation Quality (Target: 7/10)
- Clean, readable code
- Proper error handling
- Reusable components
- TypeScript if used, no `any` types

### Workflow Quality (Target: 7/10)
- Used worktrees for isolation
- Clean commit history
- No work on main branch directly

### Efficiency (Target: 7/10)
- Reasonable token usage
- No loops or stuck states
- Completed in reasonable time

### User Experience (Target: 8/10)
- App works as documented
- Loading states are clear
- Error messages are helpful
- Responsive design

### Overall (Target: 7/10)
- Spec fully implemented
- Would pass code review
- Production-ready quality
