# Development Rules & Best Practices

## 1. Development Workflow
- **Do NOT run `npm run build` during active development**:
  - The development server (`npm run dev`) is already running with Vite Hot Module Replacement (HMR).
  - All frontend code changes are reflected live in the browser instantly.
  - Never execute `npm run build` or full production bundles after code changes during development unless the user explicitly asks for a production build.
- **Testing & Validation**:
  - For backend verification, run targeted automated tests (e.g. `node --test tests/<name>.test.js`).
- **Data Integrity & Zero Mock Seeding**:
  - If no data exists in the database, always display clean empty states in the UI.
  - **Never seed fake or mock data** into the database to fill UI elements.

## 2. Browser Testing & Visual Verification Policy
- **Do NOT perform manual browser testing, UI walkthroughs, screenshot capture, or screenshot-based verification**:
  - Do not launch browsers, use browser subagents, or capture screenshots unless explicitly requested by the user.
  - Run only relevant, targeted automated tests or lightweight checks when necessary.
  - For minor UI changes, skip running the full test suite.
  - Prioritize code-level implementation, terminal verification, and rapid completion.
  - **Default workflow: Implement → Perform necessary lightweight checks → Report results.**

