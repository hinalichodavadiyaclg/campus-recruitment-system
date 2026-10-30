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

## 3. UI Clarity & Text Minimization Guidelines
- **Pages Must Be Clear with Minimal Text**:
  - Keep all pages, modals, and forms uncluttered, clean, and intuitive with less text.
  - **Do NOT add descriptive text, instructional paragraphs, or unnecessary explanatory banners** (e.g. auto-publication notices, workflow explanations, role rule disclaimers) on any page or modal.
  - Rely on clean form controls, standard input labels, and clear action buttons.
  - Empty states and messages must be concise, direct, and distraction-free (e.g. "No workshops found", "No trainers added yet").

## 4. Server Uptime & Session Preservation
- **Do not restart servers unnecessarily**: Keep the frontend and backend running while making code changes. Restart only when technically required, such as for backend changes that cannot be hot-reloaded or configuration changes requiring a process restart.
- **Preserve authentication sessions**: Never change JWT secrets, session secrets, cookie settings, token expiration, authentication middleware, or session configuration as part of unrelated tasks.
- **Never invalidate active sessions unnecessarily**: Do not clear session storage, delete session records, revoke tokens, or force logout users unless explicitly required and approved.
- **Use stable configuration**: Load secrets and environment variables from existing configuration. Never generate new secrets on every startup or modify `.env` files without explicit approval.
- **Use hot reload where available**: Make small, targeted code changes and let the existing development tooling reload affected modules. Avoid stopping and restarting all services for frontend-only changes.
- **Protect running processes**: Before starting a server, check whether the correct instance is already running. Avoid duplicate backend or frontend processes and unnecessary port termination.
- **Preserve database and session data**: Never reset databases, delete session collections, clear application data, or run destructive commands without explicit approval.
- **Verify before restarting**: If a restart appears necessary, explain why, identify which service needs it, and restart only that service. Do not restart MongoDB or unrelated services for ordinary code changes.
- **Test authentication safely**: After changes to authentication-related code, verify login, existing-session behavior, protected routes, and logout without changing production credentials or invalidating unrelated users' sessions.
