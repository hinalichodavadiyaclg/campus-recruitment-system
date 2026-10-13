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
