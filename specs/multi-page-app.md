# Multi-Page App Specification

## Overview

A multi-page application with client-side routing, multiple views sharing state, and navigation. Tests routing, shared state management, and complex component composition.

**Complexity:** Complex
**Target Score:** 6+/10 on all categories

---

## Core Features

### 1. Pages/Routes
- Home page (landing/dashboard)
- Products listing page
- Product detail page (dynamic route)
- Shopping cart page
- About/Contact page
- 404 Not Found page

### 2. Navigation
- Header with nav links
- Active route highlighting
- Mobile hamburger menu
- Breadcrumb navigation
- Back button support (browser history)

### 3. Shared State
- Shopping cart persists across pages
- User preferences (theme, layout)
- Recently viewed products
- State survives page refresh (localStorage)

### 4. Product Features
- Product grid with images
- Filter by category
- Sort by price/name
- Search products
- Add to cart button

### 5. Cart Features
- Add/remove items
- Update quantity
- Calculate total
- Clear cart button
- Cart badge showing item count

---

## Technical Requirements

- **Language:** Modern JavaScript or TypeScript
- **Framework:** Any (React, Vue, Svelte)
- **Routing:** Framework router (React Router, Vue Router, SvelteKit, etc.)
- **State:** Context API, Vuex, Svelte stores, or similar
- **Styling:** Clean UI (Tailwind optional)
- **Build:** Must have `npm run dev` and `npm run build`
- **Data:** Use local JSON files (no external APIs)

---

## Project Structure

```
multi-page-app/
├── README.md
├── CLAUDE.md
├── package.json
├── src/
│   ├── index.html
│   ├── main.js (or .ts)
│   ├── App.js
│   ├── router/
│   │   └── index.js
│   ├── pages/
│   │   ├── Home.js
│   │   ├── Products.js
│   │   ├── ProductDetail.js
│   │   ├── Cart.js
│   │   ├── About.js
│   │   └── NotFound.js
│   ├── components/
│   │   ├── Header.js
│   │   ├── Footer.js
│   │   ├── ProductCard.js
│   │   ├── CartBadge.js
│   │   ├── Breadcrumbs.js
│   │   └── MobileMenu.js
│   ├── store/
│   │   ├── cart.js
│   │   └── preferences.js
│   ├── data/
│   │   └── products.json
│   └── styles.css
└── test/
    └── routing.test.js
```

---

## README Must Include

1. Project description (1-2 sentences)
2. How to install: `npm install`
3. How to run: `npm run dev`
4. How to build: `npm run build`
5. Routes documentation
6. State management approach
7. Feature list with status

---

## CLAUDE.md Must Include

```markdown
# Multi-Page App - Claude Code Conventions

## Commands
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm test` - Run tests

## Code Style
- Use const/let, not var
- Pages are top-level route components
- Components are reusable UI pieces
- Store handles global state

## Constraints
- Use local JSON data only
- All routes must work with direct URL access
- Cart must persist in localStorage
- No external API calls
```

---

## Routes Definition

| Route | Page | Description |
|-------|------|-------------|
| `/` | Home | Landing page with featured products |
| `/products` | Products | Product listing with filters |
| `/products/:id` | ProductDetail | Single product view |
| `/cart` | Cart | Shopping cart with totals |
| `/about` | About | About/contact info |
| `/*` | NotFound | 404 page |

---

## Sample Data Format

### products.json
```json
{
  "products": [
    {
      "id": "1",
      "name": "Wireless Headphones",
      "category": "Electronics",
      "price": 79.99,
      "image": "/images/headphones.jpg",
      "description": "High-quality wireless headphones with noise cancellation."
    },
    {
      "id": "2",
      "name": "Running Shoes",
      "category": "Sports",
      "price": 129.99,
      "image": "/images/shoes.jpg",
      "description": "Lightweight running shoes for marathon training."
    }
  ]
}
```

---

## Acceptance Criteria

- [ ] All routes load correctly
- [ ] Navigation highlights active route
- [ ] Direct URL access works (no 404 on refresh)
- [ ] Mobile hamburger menu works
- [ ] Product grid displays correctly
- [ ] Filter and sort products
- [ ] Product detail page shows full info
- [ ] Add to cart works from list and detail
- [ ] Cart badge updates with count
- [ ] Cart persists across pages
- [ ] Cart persists after page refresh
- [ ] Update quantity in cart
- [ ] Remove items from cart
- [ ] 404 page shows for unknown routes
- [ ] Works on mobile viewport (375px)
- [ ] No console errors
- [ ] README is accurate and complete
- [ ] App starts with `npm run dev`

---

## Scoring Criteria

### Implementation Quality (Target: 6/10)
- Routing works correctly
- State management is clean
- Components are reusable
- TypeScript if used, no `any` types

### Workflow Quality (Target: 6/10)
- Used worktrees for isolation
- Clean commit history
- No work on main branch directly

### Efficiency (Target: 6/10)
- Reasonable token usage for complexity
- No loops or stuck states
- Pages load quickly

### User Experience (Target: 7/10)
- Navigation is intuitive
- Cart works smoothly
- Responsive design
- Page transitions feel good

### Overall (Target: 6/10)
- Spec mostly implemented
- App is functional end-to-end
- Would pass code review with minor issues
