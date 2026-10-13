# VVWU Campus Recruitment Portal — Backend API

Modular-monolithic Node.js and Express backend providing REST APIs, authentication, role-based access control (RBAC), session auditing, and data import services for the VVWU Campus Recruitment Portal.

## Architecture

- **Runtime**: Node.js (ES Modules, `>=20`)
- **Web Framework**: Express 4
- **Database**: MongoDB with Mongoose 8
- **Validation**: Zod
- **Security**: Helmet, CORS, Rate Limiting, Bcrypt password hashing, SHA-256 session tokens

### Request Lifecycle
```
Route (src/routes)
  ↓
Middleware (authenticate, authorize, validation)
  ↓
Controller (src/controllers)
  ↓
Service (src/services)
  ↓
Model (src/models)
  ↓
MongoDB Database
```

## Setup & Running

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment:
   ```bash
   cp .env.example .env
   ```

3. Seed initial roles, permissions, and Super Admin:
   ```bash
   npm run seed
   ```

4. Start development server:
   ```bash
   npm run dev
   ```

5. Run test suite:
   ```bash
   npm test
   ```
