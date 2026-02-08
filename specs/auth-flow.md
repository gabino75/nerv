# Auth Flow Specification

## Overview

A complete authentication flow application with signup, login, password reset, and session management. Tests form validation, security practices, and user session handling.

**Complexity:** Medium
**Target Score:** 7+/10 on all categories

---

## Core Features

### 1. Signup Form
- Email input with validation
- Password input with strength indicator
- Confirm password field
- Terms acceptance checkbox
- Show/hide password toggle

### 2. Login Form
- Email and password inputs
- "Remember me" checkbox
- "Forgot password" link
- Error messages for invalid credentials

### 3. Password Reset Flow
- Enter email to request reset
- Success message (no email confirmation needed for demo)
- Reset form with new password fields
- Password strength requirements displayed

### 4. Session Management
- JWT or session-based auth (localStorage)
- Auto-redirect when logged in
- Protected routes redirect to login
- Logout clears session

### 5. Form Validation
- Email format validation
- Password requirements (8+ chars, mix of types)
- Real-time validation feedback
- Submit button disabled until valid
- Server-side error display

---

## Technical Requirements

- **Language:** Modern JavaScript or TypeScript
- **Framework:** Any (React, Vue, Svelte, or vanilla JS)
- **Styling:** Clean form UI (Tailwind optional)
- **Build:** Must have `npm run dev` and `npm run build`
- **Mock Auth:** Use localStorage or simple mock server (no real backend required)

---

## Project Structure

```
auth-flow/
├── README.md
├── CLAUDE.md
├── package.json
├── src/
│   ├── index.html
│   ├── main.js (or .ts)
│   ├── pages/
│   │   ├── Login.js
│   │   ├── Signup.js
│   │   ├── ForgotPassword.js
│   │   ├── ResetPassword.js
│   │   └── Dashboard.js
│   ├── components/
│   │   ├── FormInput.js
│   │   ├── PasswordStrength.js
│   │   └── AuthGuard.js
│   ├── auth/
│   │   └── session.js
│   └── styles.css
└── test/
    └── auth.test.js
```

---

## README Must Include

1. Project description (1-2 sentences)
2. How to install: `npm install`
3. How to run: `npm run dev`
4. How to build: `npm run build`
5. Default test credentials
6. Feature list with status

---

## CLAUDE.md Must Include

```markdown
# Auth Flow - Claude Code Conventions

## Commands
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm test` - Run tests

## Code Style
- Use const/let, not var
- Validate all inputs before submission
- Never store plain text passwords
- Use secure password comparison

## Constraints
- Mock auth only (no real API)
- Store session in localStorage
- Password must be 8+ characters
- Email must be valid format
```

---

## Acceptance Criteria

- [ ] Signup form validates all fields
- [ ] Password strength indicator updates in real-time
- [ ] Login stores session and redirects
- [ ] Invalid credentials show error message
- [ ] "Remember me" persists session longer
- [ ] Forgot password shows success message
- [ ] Reset password validates new password
- [ ] Logout clears session
- [ ] Protected routes redirect to login
- [ ] Works on mobile viewport (375px)
- [ ] No console errors
- [ ] README is accurate and complete
- [ ] App starts with `npm run dev`

---

## Scoring Criteria

### Implementation Quality (Target: 7/10)
- Clean, readable code
- Proper form validation
- Secure password handling (even if mock)
- Reusable form components

### Workflow Quality (Target: 7/10)
- Used worktrees for isolation
- Clean commit history
- No work on main branch directly

### Efficiency (Target: 7/10)
- Reasonable token usage
- No loops or stuck states
- Completed in reasonable time

### User Experience (Target: 8/10)
- Forms are intuitive
- Validation feedback is clear
- Error messages are helpful
- Responsive design

### Overall (Target: 7/10)
- Spec fully implemented
- Would pass code review
- Production-ready quality
