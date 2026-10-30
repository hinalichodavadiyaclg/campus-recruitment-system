# Project Guidelines & Best Practices

All development work in this repository must adhere strictly to software engineering best practices:

## 1. Code Architecture & Clean Code
- **Separation of Concerns**: Keep routes, controllers, services, models, and validators strictly decoupled.
- **Input Validation & Sanitization**: Always validate and sanitize inputs using schema validators (e.g., Zod schemas in `backend/src/validators/schemas.js`) before hitting services or database operations.
- **Error Handling**: Use centralized error handling with explicit custom error classes and meaningful status codes. Never swallow exceptions or return generic fallback data silently.
- **Idempotency & Data Integrity**: Ensure database migrations, seeders, and import routines handle existing data gracefully (using upserts/canonical checks) without failing on duplicate constraints.

## 2. Security Best Practices
- **Authentication & Authorization**: Enforce strict session token checks and granular permission-based role authorization on all non-public API endpoints.
- **Password Security**: Enforce high-entropy password requirements and secure hashing (bcrypt with pepper).
- **Environment Variables**: Store configuration and secrets in `.env` files; never hardcode credentials or secrets in source code.

## 3. UI/UX & Frontend Standards
- **Responsive & Accessible UI**: Build modern, accessible (a11y), mobile-first component layouts with cohesive design tokens.
- **State Management & Feedback**: Provide clear loading states, actionable error messages, and success notifications for all asynchronous user interactions.

## 4. Development Workflow & Verification
- **No Production Builds During Active Development**:
  - **DO NOT run `npm run build`** or full bundle compilations after every code edit during development.
  - The local development server (`npm run dev`) is actively running with Vite Hot Module Replacement (HMR) and automatically reloads changes instantly. Full production builds are slow, unnecessary, and must NEVER be run repeatedly during iterative development unless explicitly requested by the user.
- **Testing & Verification**:
  - When validating functionality, run targeted automated backend test files (e.g. `node --test tests/<test-name>.test.js`) rather than full frontend builds.
- **Data Integrity & Zero Mock Seeding**:
  - If no data exists in the system, show clean, elegant empty states. **Never seed fake or mock data** into the database to fill UI elements.

## 5. Server Uptime & Session Preservation
- **Do not restart servers unnecessarily**: Keep the frontend and backend running while making code changes. Restart only when technically required, such as for backend changes that cannot be hot-reloaded or configuration changes requiring a process restart.
- **Preserve authentication sessions**: Never change JWT secrets, session secrets, cookie settings, token expiration, authentication middleware, or session configuration as part of unrelated tasks.
- **Never invalidate active sessions unnecessarily**: Do not clear session storage, delete session records, revoke tokens, or force logout users unless explicitly required and approved.
- **Use stable configuration**: Load secrets and environment variables from existing configuration. Never generate new secrets on every startup or modify `.env` files without explicit approval.
- **Use hot reload where available**: Make small, targeted code changes and let the existing development tooling reload affected modules. Avoid stopping and restarting all services for frontend-only changes.
- **Protect running processes**: Before starting a server, check whether the correct instance is already running. Avoid duplicate backend or frontend processes and unnecessary port termination.
- **Preserve database and session data**: Never reset databases, delete session collections, clear application data, or run destructive commands without explicit approval.
- **Verify before restarting**: If a restart appears necessary, explain why, identify which service needs it, and restart only that service. Do not restart MongoDB or unrelated services for ordinary code changes.
- **Test authentication safely**: After changes to authentication-related code, verify login, existing-session behavior, protected routes, and logout without changing production credentials or invalidating unrelated users' sessions.
