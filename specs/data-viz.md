# Data Visualization Specification

## Overview

A data visualization application that displays charts, graphs, and interactive data views. Tests complex rendering, data processing, and responsive layout with multiple chart types.

**Complexity:** Complex
**Target Score:** 6+/10 on all categories

---

## Core Features

### 1. Chart Types
- Line chart (time series data)
- Bar chart (categorical data)
- Pie/donut chart (distribution)
- Area chart (cumulative values)
- Scatter plot (correlation)

### 2. Data Processing
- Load data from JSON files
- Transform data for chart formats
- Calculate aggregations (sum, avg, min, max)
- Filter data by date range
- Group by category

### 3. Interactive Features
- Hover tooltips on data points
- Click to drill down (where applicable)
- Zoom and pan (on line/area charts)
- Legend toggle to show/hide series
- Responsive resize

### 4. Dashboard Layout
- Grid of charts
- Full-screen toggle for each chart
- Export chart as PNG button
- Date range selector (global filter)

### 5. Data Controls
- Dropdown to select dataset
- Date range picker
- Category filter checkboxes
- Refresh data button

---

## Technical Requirements

- **Language:** Modern JavaScript or TypeScript
- **Framework:** Any (React, Vue, Svelte, or vanilla JS)
- **Charts:** D3.js, Chart.js, Recharts, or similar
- **Styling:** Clean dashboard UI (Tailwind optional)
- **Build:** Must have `npm run dev` and `npm run build`
- **Data:** Use local JSON files (no external APIs)

---

## Project Structure

```
data-viz/
├── README.md
├── CLAUDE.md
├── package.json
├── src/
│   ├── index.html
│   ├── main.js (or .ts)
│   ├── data/
│   │   ├── sales.json
│   │   ├── users.json
│   │   └── metrics.json
│   ├── charts/
│   │   ├── LineChart.js
│   │   ├── BarChart.js
│   │   ├── PieChart.js
│   │   ├── AreaChart.js
│   │   └── ScatterPlot.js
│   ├── components/
│   │   ├── Dashboard.js
│   │   ├── ChartCard.js
│   │   ├── DateRangePicker.js
│   │   └── FilterPanel.js
│   ├── utils/
│   │   └── dataTransform.js
│   └── styles.css
└── test/
    └── charts.test.js
```

---

## README Must Include

1. Project description (1-2 sentences)
2. How to install: `npm install`
3. How to run: `npm run dev`
4. How to build: `npm run build`
5. Chart library used
6. Data format documentation
7. Feature list with status

---

## CLAUDE.md Must Include

```markdown
# Data Viz - Claude Code Conventions

## Commands
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm test` - Run tests

## Code Style
- Use const/let, not var
- Keep chart configs separate from logic
- Use utility functions for data transforms
- Handle empty data gracefully

## Constraints
- Use local JSON data only
- Charts must be responsive
- Support dark/light mode colors
- Keep chart animations performant
```

---

## Acceptance Criteria

- [ ] All 5 chart types render correctly
- [ ] Tooltips show on hover
- [ ] Legend toggles series visibility
- [ ] Date range filter updates charts
- [ ] Category filter updates charts
- [ ] Charts resize responsively
- [ ] Export to PNG works
- [ ] Full-screen mode works
- [ ] Loading states shown
- [ ] Empty state for no data
- [ ] Works on mobile viewport (375px)
- [ ] No console errors
- [ ] README is accurate and complete
- [ ] App starts with `npm run dev`

---

## Sample Data Format

### sales.json
```json
{
  "data": [
    { "date": "2024-01-01", "category": "Electronics", "amount": 1500, "units": 12 },
    { "date": "2024-01-02", "category": "Clothing", "amount": 800, "units": 20 },
    { "date": "2024-01-03", "category": "Electronics", "amount": 2100, "units": 15 }
  ]
}
```

### users.json
```json
{
  "data": [
    { "month": "Jan", "signups": 120, "active": 95, "churned": 10 },
    { "month": "Feb", "signups": 150, "active": 130, "churned": 15 }
  ]
}
```

---

## Scoring Criteria

### Implementation Quality (Target: 6/10)
- Charts render correctly
- Data processing is clean
- Responsive design works
- TypeScript if used, no `any` types

### Workflow Quality (Target: 6/10)
- Used worktrees for isolation
- Clean commit history
- No work on main branch directly

### Efficiency (Target: 6/10)
- Reasonable token usage for complexity
- No loops or stuck states
- Charts perform well

### User Experience (Target: 7/10)
- Charts are readable
- Interactions feel smooth
- Filters work intuitively
- Responsive layout

### Overall (Target: 6/10)
- Spec mostly implemented
- Charts are functional
- Would pass code review with minor issues
