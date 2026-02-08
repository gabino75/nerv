# Full-Stack Task Manager Specification

## Overview

A collaborative task management application with real-time updates, user authentication, and a REST API. This spec is designed to exercise all NERV features during implementation.

**Complexity:** High (exercises all NERV capabilities)
**Estimated Cycles:** 5-8
**Target Score:** 7+/10 on all categories

---

## Why This Spec

This specification is designed to flex every NERV feature:

| NERV Feature | How This Spec Tests It |
|--------------|------------------------|
| **Worktree isolation** | Multiple parallel tasks possible (API vs UI) |
| **Cycle planning** | Natural breakdown into cycles (auth → CRUD → realtime → polish) |
| **Audit cycles** | Code health checks after each cycle |
| **YOLO review mode** | Automated review of completed tasks |
| **Permission hooks** | Database commands, npm installs, file operations |
| **Session branching** | Debug tasks when things go wrong |
| **Multi-repo support** | Could split into frontend/backend repos |
| **CLAUDE.md integration** | Project conventions must be followed |
| **Skill invocation** | Custom skills for deploy, test, db-migrate |
| **Context tracking** | Complex enough to need context management |
| **Cost tracking** | Multi-cycle project tracks cumulative cost |
| **NERV.md generation** | Task context includes learnings, decisions |

---

## Technical Stack

- **Frontend:** React 18+ with TypeScript
- **Backend:** Node.js/Express with TypeScript
- **Database:** SQLite (for simplicity, no external DB needed)
- **Auth:** JWT-based authentication
- **Styling:** Tailwind CSS
- **Testing:** Vitest (unit), Playwright (e2e)

---

## Core Features

### 1. User Authentication (Cycle 1)

**User Stories:**
- As a user, I can sign up with email and password
- As a user, I can log in and receive a JWT token
- As a user, I can log out (invalidate token)
- As a user, my session persists across page refreshes

**API Endpoints:**
```
POST /api/auth/signup    { email, password } → { token, user }
POST /api/auth/login     { email, password } → { token, user }
POST /api/auth/logout    { } → { success }
GET  /api/auth/me        → { user } (requires auth)
```

**Acceptance Criteria:**
- [ ] Signup validates email format and password strength (8+ chars)
- [ ] Passwords are hashed (bcrypt)
- [ ] JWT tokens expire after 24 hours
- [ ] Protected routes return 401 without valid token
- [ ] Login errors don't reveal if email exists

### 2. Task CRUD (Cycle 2)

**User Stories:**
- As a user, I can create tasks with title and description
- As a user, I can view all my tasks
- As a user, I can update task title, description, and status
- As a user, I can delete tasks
- As a user, I can only see my own tasks (not other users')

**API Endpoints:**
```
GET    /api/tasks         → { tasks: [...] }
POST   /api/tasks         { title, description } → { task }
GET    /api/tasks/:id     → { task }
PATCH  /api/tasks/:id     { title?, description?, status? } → { task }
DELETE /api/tasks/:id     → { success }
```

**Task Schema:**
```typescript
interface Task {
  id: string;
  userId: string;
  title: string;
  description: string;
  status: 'todo' | 'in_progress' | 'done';
  priority: 'low' | 'medium' | 'high';
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
}
```

**Acceptance Criteria:**
- [ ] Tasks are scoped to authenticated user
- [ ] Title is required (1-200 chars)
- [ ] Description is optional (max 2000 chars)
- [ ] Status defaults to 'todo'
- [ ] Priority defaults to 'medium'
- [ ] Timestamps auto-set on create/update

### 3. Task UI (Cycle 3)

**User Stories:**
- As a user, I see a clean dashboard with my tasks
- As a user, I can filter tasks by status
- As a user, I can sort tasks by date, priority, or title
- As a user, I can search tasks by title/description
- As a user, I can drag-and-drop to reorder tasks

**UI Components:**
```
┌─────────────────────────────────────────────────────────────────┐
│  Task Manager                              [User ▼] [Logout]    │
├─────────────────────────────────────────────────────────────────┤
│  [+ New Task]    [Search... 🔍]    Filter: [All ▼]  Sort: [Date ▼] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ☐ Implement login page                    🔴 High  Due: Today │
│  │   Add form with email/password fields...              [Edit] │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ☑ Set up database schema                  🟡 Medium        │
│  │   Create tables for users and tasks...    ✓ Completed     │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Acceptance Criteria:**
- [ ] Responsive design (works on mobile)
- [ ] Loading states for async operations
- [ ] Error messages displayed clearly
- [ ] Optimistic updates for better UX
- [ ] Keyboard accessible (tab navigation, enter to submit)
- [ ] Empty state when no tasks

### 4. Real-Time Updates (Cycle 4)

**User Stories:**
- As a user, I see task updates without refreshing
- As a user, I see when I'm connected/disconnected
- As a user, changes sync across multiple browser tabs

**Implementation:**
- Server-Sent Events (SSE) for real-time updates
- Reconnection logic with exponential backoff
- Connection status indicator in UI

**API Endpoints:**
```
GET /api/events    → SSE stream of task events
```

**Event Types:**
```typescript
type TaskEvent =
  | { type: 'task:created', task: Task }
  | { type: 'task:updated', task: Task }
  | { type: 'task:deleted', taskId: string }
  | { type: 'connected' }
  | { type: 'heartbeat' }
```

**Acceptance Criteria:**
- [ ] Updates appear within 1 second
- [ ] Reconnects automatically on disconnect
- [ ] Shows connection status indicator
- [ ] Works across multiple tabs
- [ ] No duplicate events

### 5. Due Dates & Reminders (Cycle 5)

**User Stories:**
- As a user, I can set due dates on tasks
- As a user, I see overdue tasks highlighted
- As a user, I can view tasks in a calendar view
- As a user, tasks are grouped by: Overdue, Today, This Week, Later

**UI Additions:**
- Date picker for due date selection
- Calendar view toggle
- Color coding: red (overdue), yellow (today), default (future)

**Acceptance Criteria:**
- [ ] Date picker works on all browsers
- [ ] Overdue tasks sorted first
- [ ] Calendar shows tasks on correct days
- [ ] Timezone handled correctly

### 6. Polish & Error Handling (Cycle 6)

**Focus Areas:**
- Comprehensive error handling
- Form validation with clear messages
- Loading skeletons
- 404 and error pages
- Accessibility audit (WCAG 2.1 AA)
- Performance optimization

**Acceptance Criteria:**
- [ ] All API errors have user-friendly messages
- [ ] Forms show validation errors inline
- [ ] No unhandled promise rejections
- [ ] Lighthouse accessibility score > 90
- [ ] No console errors in production

---

## Project Structure

```
task-manager/
├── README.md
├── CLAUDE.md              # LLM conventions (REQUIRED)
├── package.json
├── tsconfig.json
├── .env.example
├── src/
│   ├── server/
│   │   ├── index.ts       # Express app entry
│   │   ├── routes/
│   │   │   ├── auth.ts
│   │   │   └── tasks.ts
│   │   ├── middleware/
│   │   │   ├── auth.ts    # JWT verification
│   │   │   └── error.ts   # Error handler
│   │   ├── db/
│   │   │   ├── index.ts   # SQLite connection
│   │   │   ├── schema.sql
│   │   │   └── migrations/
│   │   └── utils/
│   │       └── jwt.ts
│   ├── client/
│   │   ├── index.html
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── TaskList.tsx
│   │   │   ├── TaskCard.tsx
│   │   │   ├── TaskForm.tsx
│   │   │   ├── AuthForm.tsx
│   │   │   └── Header.tsx
│   │   ├── hooks/
│   │   │   ├── useAuth.ts
│   │   │   ├── useTasks.ts
│   │   │   └── useSSE.ts
│   │   ├── context/
│   │   │   └── AuthContext.tsx
│   │   └── styles/
│   │       └── globals.css
│   └── shared/
│       └── types.ts       # Shared TypeScript types
├── test/
│   ├── unit/
│   │   ├── auth.test.ts
│   │   └── tasks.test.ts
│   └── e2e/
│       ├── auth.spec.ts
│       └── tasks.spec.ts
└── scripts/
    └── seed.ts            # Seed database with test data
```

---

## CLAUDE.md Requirements

The project MUST include a CLAUDE.md file with:

```markdown
# Task Manager - Claude Code Conventions

## Commands
- `npm run dev` - Start development server (frontend + backend)
- `npm run build` - Build for production
- `npm test` - Run all tests
- `npm run test:e2e` - Run Playwright tests
- `npm run db:migrate` - Run database migrations
- `npm run db:seed` - Seed with test data

## Architecture
- `/src/server` - Express backend (TypeScript)
- `/src/client` - React frontend (TypeScript)
- `/src/shared` - Shared types between frontend/backend

## Code Style
- Use TypeScript strict mode
- Prefer async/await over callbacks
- Use named exports (not default)
- Components: functional with hooks only
- API responses: { data } or { error }

## Constraints
- NEVER store passwords in plain text
- NEVER expose user IDs in URLs (use task IDs only)
- NEVER commit .env files
- ALL API routes must validate input
- ALL database queries must be parameterized (no SQL injection)

## Testing
- Unit tests for all API routes
- E2E tests for critical user flows
- Minimum 70% code coverage
```

---

## README.md Requirements

Must include:

1. **Project description** (1-2 sentences)
2. **Features list** with checkboxes
3. **Quick start** (install, setup, run)
4. **API documentation** (endpoints, request/response)
5. **Environment variables** (.env.example)
6. **Testing instructions**
7. **Tech stack**

---

## Acceptance Test Script

A human (or Claude) can verify the implementation:

```bash
# 1. Setup
git clone <repo>
cd task-manager
npm install
cp .env.example .env
npm run db:migrate

# 2. Start
npm run dev
# Should see: "Server running on http://localhost:3000"

# 3. Test Auth
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
# Should return: { token: "...", user: { id, email } }

# 4. Test Tasks (with token from above)
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"title":"My first task","description":"Test"}'
# Should return: { task: { id, title, ... } }

# 5. Open browser
# Navigate to http://localhost:3000
# - Should see login page
# - Log in with test@example.com / password123
# - Should see task dashboard with "My first task"
# - Create, edit, complete, delete tasks
# - All should work smoothly

# 6. Run tests
npm test
# Should pass with 70%+ coverage

npm run test:e2e
# Should pass all e2e tests
```

---

## Scoring Criteria

When grading this benchmark, evaluate:

### Implementation Quality (Target: 8/10)
- Clean code organization following project structure
- TypeScript used correctly (no `any`)
- Proper error handling throughout
- Security best practices (hashing, JWT, input validation)
- Tests with good coverage

### Workflow Quality (Target: 8/10)
- Used worktrees for isolation
- Clean cycle progression (auth → CRUD → UI → realtime → polish)
- Learnings recorded after each cycle
- Audits caught and fixed issues
- No work done directly on main branch

### Efficiency (Target: 7/10)
- Reasonable token usage for complexity
- No major loops or stuck states
- Appropriate use of subagents
- Minimal tool errors/retries

### User Experience (Target: 8/10)
- App works as documented
- UI is intuitive and responsive
- Error states handled gracefully
- README accurately describes the app
- Good visual design

### Overall (Target: 7.5/10)
- Spec fully implemented
- Production-ready quality
- Would pass code review
