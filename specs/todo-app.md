# TaskFlow - Full-Featured Todo Application

## Project Idea
"I want to build a serious todo app — not a tutorial project. Think Todoist meets
Notion. Users sign up, create projects, organize todos with priorities and due dates,
filter and search, get overdue notifications, and share projects with teammates.
I want it to feel professional and polished."

## User Profile
- Strong: JavaScript, React, HTML/CSS, REST APIs
- Moderate: TypeScript, Node.js, Express
- Weak: SQL databases, authentication, WebSockets, deployment
- Never used: bcrypt, JWT, better-sqlite3, Tailwind CSS

## Tech Preferences
- Frontend: React with TypeScript (used at work for 2 years)
- Wants suggestions for backend framework
- Database: something that just works without a server
- Styling: open to suggestions, wants modern and clean
- Testing: Jest for backend, React Testing Library for frontend

## Rough Milestones
- "First, prove the concept — can I get a basic todo list on screen with an API?"
- "Then build the real data model — projects, todos with priorities, due dates"
- "Add user auth so each person has their own stuff"
- "Make it look professional — good UI, search, filters"
- "Polish: notifications for overdue items, sharing, tests"

## Mid-Project Events
after_cycle_1:
  - scope_creep: "Todos need priority levels — low, medium, high, urgent. And color-code them."
  - user_says: "Can we add due dates? I keep forgetting deadlines."
after_cycle_2:
  - mind_change: "I looked at Tailwind CSS and it seems way easier. Let's switch from plain CSS to Tailwind."
  - scope_creep: "I want a search bar that filters todos by title and description."
after_cycle_3:
  - scope_creep: "Users should be able to create multiple projects and organize todos into them."
  - user_says: "The error messages are ugly. Can we add proper toast notifications?"
after_cycle_4:
  - user_says: "Almost done! Let's add comprehensive tests and fix any security issues."

## Quality Bar
- App starts with `npm run dev` (frontend) and `npm start` (backend)
- User can sign up, log in, create projects, CRUD todos
- Todos have: title, description, priority (4 levels), due date, completed status
- Search and filter works
- Responsive at mobile widths (375px)
- At least 20 meaningful tests (unit + integration)
- Passwords hashed, no SQL injection, JWT auth
- README with setup instructions and screenshots
- Clean TypeScript — no `any` types

---

## Overview

A production-grade todo application with user authentication, a REST API with SQLite persistence, real-time updates, rich UI with filtering/sorting/search, and comprehensive error handling. This is NERV's primary benchmark spec - complex enough to exercise all pipeline features (worktrees, parallel tasks, multi-cycle progression, review agents).

**Complexity:** High
**Estimated Cycles:** 4-6
**Target Score:** 7+/10 on all dimensions

---

## Technical Stack

- **Backend:** Node.js + Express + TypeScript
- **Frontend:** React 18+ with TypeScript (Vite bundler)
- **Database:** SQLite via better-sqlite3 (no external DB needed)
- **Auth:** JWT (jsonwebtoken + bcrypt)
- **Styling:** Tailwind CSS
- **Testing:** Vitest (unit) + supertest (API)
- **Build:** `npm run dev` starts both frontend and backend concurrently

---

## Cycle Breakdown

### 1. Project Setup & Authentication (Cycle 1)

**Goal:** Working auth system with signup, login, JWT tokens, and protected routes.

**API Endpoints:**

```
POST /api/auth/register   { email, password, name } → { token, user }
POST /api/auth/login      { email, password } → { token, user }
GET  /api/auth/me         → { user }  (requires Bearer token)
```

**Database Schema:**

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
```

**Requirements:**
- Passwords hashed with bcrypt (cost factor 10+)
- JWT tokens expire after 7 days
- Email format validation (reject invalid emails)
- Password minimum 8 characters
- Protected routes return 401 without valid token
- Login errors must not reveal whether email exists ("Invalid credentials")
- Register rejects duplicate emails with 409 status

**Acceptance Criteria:**
- [ ] POST /api/auth/register creates user and returns JWT
- [ ] POST /api/auth/login returns JWT for valid credentials
- [ ] GET /api/auth/me returns user profile with valid token
- [ ] Invalid token returns 401 with error message
- [ ] Duplicate email returns 409
- [ ] Weak password returns 400 with validation error
- [ ] Passwords are bcrypt hashed (not stored in plain text)

---

### 2. Todo CRUD API (Cycle 2)

**Goal:** Full REST API for todo items with validation, scoped to authenticated user.

**API Endpoints:**

```
GET    /api/todos              → { todos: [...] }  (user's todos only)
POST   /api/todos              { title, description?, priority?, dueDate? } → { todo }
GET    /api/todos/:id          → { todo }
PATCH  /api/todos/:id          { title?, description?, completed?, priority?, dueDate? } → { todo }
DELETE /api/todos/:id          → { success: true }
```

**Database Schema:**

```sql
CREATE TABLE todos (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  completed INTEGER DEFAULT 0,
  priority TEXT DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high', 'urgent')),
  due_date TEXT,
  position INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_todos_user ON todos(user_id);
```

**TypeScript Types (shared between frontend/backend):**

```typescript
interface Todo {
  id: string;
  userId: string;
  title: string;
  description: string;
  completed: boolean;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  dueDate: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
}
```

**Requirements:**
- All endpoints require authentication (Bearer token)
- Users can only access their own todos (never see other users' data)
- Title required, 1-200 characters
- Description optional, max 2000 characters
- Priority defaults to 'medium'
- Position field for manual ordering
- updatedAt auto-updates on PATCH
- DELETE returns 404 if todo doesn't exist or belongs to another user
- GET /api/todos supports query params: `?completed=true`, `?priority=high`, `?sort=dueDate`

**Acceptance Criteria:**
- [ ] POST /api/todos creates todo scoped to authenticated user
- [ ] GET /api/todos returns only the authenticated user's todos
- [ ] PATCH /api/todos/:id updates specific fields
- [ ] DELETE /api/todos/:id removes the todo
- [ ] 404 returned for non-existent or other user's todos
- [ ] Validation: title required, max lengths enforced
- [ ] Query param filtering works (completed, priority, sort)
- [ ] All SQL queries use parameterized statements (no injection)

---

### 3. Frontend UI (Cycle 3)

**Goal:** Clean, responsive React UI with auth flows, todo list, and all CRUD operations.

**Pages:**

1. **Login/Register Page** (`/auth`)
   - Toggle between login and register forms
   - Form validation with inline error messages
   - Redirect to dashboard after successful auth

2. **Dashboard** (`/`) - Protected route
   - Header with user name and logout button
   - "Add Todo" button opens a form/modal
   - Todo list with each item showing: checkbox, title, priority badge, due date
   - Click todo to expand and show description
   - Edit and delete buttons on each todo
   - Empty state: "No todos yet. Create your first one!"

3. **404 Page** - For unknown routes

**UI Layout:**

```
┌─────────────────────────────────────────────────────────────┐
│  📋 Todo App                            Welcome, {name} [Logout]  │
├─────────────────────────────────────────────────────────────┤
│  [+ Add Todo]   [Search...🔍]   Filter: [All ▼]   Sort: [Date ▼]  │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌───────────────────────────────────────────────────────┐   │
│  │ ☐ Build authentication system       🔴 Urgent  Mar 15 │   │
│  │   Set up JWT-based auth with...            [Edit][Del] │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌───────────────────────────────────────────────────────┐   │
│  │ ☑ Set up project structure          🟢 Low            │   │
│  │   Initialize TypeScript project...  ✓ Completed       │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                               │
│  Showing 2 of 12 todos  │  Active: 8  │  Completed: 4       │
└─────────────────────────────────────────────────────────────┘
```

**Requirements:**
- Responsive: works at 375px mobile width
- Loading spinners during API calls
- Optimistic updates (UI updates before server confirms)
- Keyboard accessible (Tab navigation, Enter to submit)
- Toast notifications for success/error feedback
- Auth state persisted in localStorage (token)
- Protected routes redirect to /auth if not logged in

**Acceptance Criteria:**
- [ ] Login form validates and submits correctly
- [ ] Register form creates account and redirects to dashboard
- [ ] Dashboard shows todos for logged-in user
- [ ] Can create new todo via form/modal
- [ ] Can toggle todo completion with checkbox
- [ ] Can edit todo (title, description, priority, due date)
- [ ] Can delete todo with confirmation
- [ ] Filter by: All, Active, Completed
- [ ] Sort by: Date Created, Due Date, Priority, Title
- [ ] Search filters todos by title/description
- [ ] Responsive at 375px viewport width
- [ ] Loading states shown during API calls
- [ ] Error messages displayed for failed operations

---

### 4. Polish, Testing & Documentation (Cycle 4)

**Goal:** Production-ready quality with tests, error handling, and documentation.

**Error Handling:**
- All API errors return consistent format: `{ error: { message, code } }`
- Frontend displays user-friendly error messages (not raw HTTP errors)
- Network errors show "Connection lost" with retry button
- Form validation errors shown inline next to the field
- No unhandled promise rejections in console

**Testing:**
- Unit tests for auth middleware (valid/invalid/expired tokens)
- Unit tests for todo CRUD operations
- API integration tests with supertest
- Minimum: 10 test cases covering happy paths and edge cases

**Documentation (README.md must include):**
1. Project description (what it does, 2-3 sentences)
2. Tech stack list
3. Quick start: `npm install && npm run dev`
4. Environment variables (with .env.example)
5. API documentation (all endpoints with request/response examples)
6. Testing: `npm test`
7. Project structure overview

**CLAUDE.md must include:**
```markdown
# Todo App Conventions

## Commands
- `npm run dev` - Start frontend + backend dev servers
- `npm run build` - Build for production
- `npm test` - Run all tests
- `npm run server` - Backend only
- `npm run client` - Frontend only

## Architecture
- /src/server - Express API (TypeScript)
- /src/client - React frontend (TypeScript)
- /src/shared - Shared types

## Code Style
- TypeScript strict mode
- async/await over callbacks
- Named exports only
- Functional React components with hooks

## Constraints
- NEVER store passwords in plain text
- ALL queries must be parameterized
- ALL API routes must validate input
- NEVER commit .env files
```

**Acceptance Criteria:**
- [ ] All API errors return { error: { message, code } } format
- [ ] Frontend shows user-friendly error messages
- [ ] No console errors in normal operation
- [ ] At least 10 test cases passing
- [ ] README is accurate and complete with API docs
- [ ] CLAUDE.md follows the template above
- [ ] `npm run dev` starts the full application
- [ ] `npm test` runs and passes
- [ ] .env.example exists with documented variables

---

## Project Structure

```
todo-app/
├── README.md
├── CLAUDE.md
├── package.json
├── tsconfig.json
├── .env.example
├── vite.config.ts
├── tailwind.config.js
├── src/
│   ├── server/
│   │   ├── index.ts          # Express app + listen
│   │   ├── db.ts             # SQLite setup + migrations
│   │   ├── routes/
│   │   │   ├── auth.ts       # Auth endpoints
│   │   │   └── todos.ts      # Todo CRUD endpoints
│   │   ├── middleware/
│   │   │   ├── auth.ts       # JWT verification middleware
│   │   │   └── validate.ts   # Request validation
│   │   └── utils/
│   │       └── jwt.ts        # Token sign/verify helpers
│   ├── client/
│   │   ├── index.html
│   │   ├── main.tsx          # React entry
│   │   ├── App.tsx           # Router + auth context
│   │   ├── pages/
│   │   │   ├── AuthPage.tsx
│   │   │   └── Dashboard.tsx
│   │   ├── components/
│   │   │   ├── TodoList.tsx
│   │   │   ├── TodoItem.tsx
│   │   │   ├── TodoForm.tsx
│   │   │   ├── Header.tsx
│   │   │   ├── SearchBar.tsx
│   │   │   └── FilterSort.tsx
│   │   ├── hooks/
│   │   │   ├── useAuth.ts
│   │   │   └── useTodos.ts
│   │   ├── context/
│   │   │   └── AuthContext.tsx
│   │   └── api/
│   │       └── client.ts     # Fetch wrapper with auth headers
│   └── shared/
│       └── types.ts          # Shared TypeScript interfaces
├── test/
│   ├── auth.test.ts
│   ├── todos.test.ts
│   └── setup.ts
└── scripts/
    └── seed.ts               # Optional: seed demo data
```

---

## Acceptance Test Script

```bash
# 1. Setup
cd todo-app && npm install
cp .env.example .env
npm run dev
# Server should be running on http://localhost:3000

# 2. Register
curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"password123","name":"Test User"}'
# → { "token": "eyJ...", "user": { "id": "...", "email": "test@test.com", "name": "Test User" } }

# 3. Login
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"password123"}' | jq -r .token)

# 4. Create todo
curl -s -X POST http://localhost:3000/api/todos \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"title":"My first todo","description":"Testing the API","priority":"high"}'
# → { "todo": { "id": "...", "title": "My first todo", ... } }

# 5. List todos
curl -s http://localhost:3000/api/todos \
  -H "Authorization: Bearer $TOKEN"
# → { "todos": [{ "id": "...", "title": "My first todo", ... }] }

# 6. Update todo
curl -s -X PATCH http://localhost:3000/api/todos/<id> \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"completed":true}'
# → { "todo": { ..., "completed": true } }

# 7. Delete todo
curl -s -X DELETE http://localhost:3000/api/todos/<id> \
  -H "Authorization: Bearer $TOKEN"
# → { "success": true }

# 8. Run tests
npm test
# → All tests passing

# 9. Open browser at http://localhost:3000
# → Login page shown
# → After login: dashboard with todos
# → All CRUD operations work in UI
```

---

## Scoring Guide

### NERV Ops (How NERV builds it)
- Uses git worktrees for task isolation (one per cycle minimum)
- Runs tasks in parallel where possible (e.g., API + UI work)
- Progresses through cycles sequentially (auth → CRUD → UI → polish)
- Review agent checks each completed task
- No stuck loops or repeated errors

### Code Quality (What NERV builds)
- **Implementation (35%):** Clean TypeScript, proper error handling, security (bcrypt, JWT, parameterized SQL), good file organization
- **Functionality (35%):** All API endpoints work, auth flow complete, CRUD operations correct, filtering/sorting works
- **UX (30%):** Responsive design, loading states, error messages, accessible, polished UI
