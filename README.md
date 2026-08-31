# University Campus Recruitment Portal — Module 1

This repository contains only Module 1: Authentication, Roles, Permissions, and Session Management. It is a Node.js, Express, JavaScript (ES Modules), MongoDB, and Mongoose backend. Modules 2–11 and the `companies` collection are intentionally not implemented.

## Collections

The application creates only these Module 1 collections:

- `users` — user identity, account status, role assignment, and login state.
- `roles` — string-keyed roles and their permission IDs.
- `permissions` — string-keyed permissions.
- `user_sessions` — hashed opaque session tokens and activity/expiry information.

`users.companyId` is an ObjectId reference to `Company`; the actual companies model and collection remain deferred to Module 3.

## Setup

1. Copy `.env.example` to `.env`.
2. Set `MONGODB_URI` to a running MongoDB instance.
3. Replace `SESSION_TOKEN_PEPPER` and `PASSWORD_RESET_SECRET` with distinct random values. They are mandatory and must each contain at least 32 characters in production.
4. Set all three `SUPER_ADMIN_*` variables when provisioning the first administrator. The password must contain at least 12 characters, including uppercase, lowercase, number, and symbol.
5. Install packages:

   ```bash
   npm install
   ```

6. Start the API. Startup automatically creates Module 1 indexes, roles, permissions, and (when configured) the first Super Admin:

   ```bash
   npm run dev
   # or
   npm start
   ```

   You can also run the seed command independently; it is safe to run more than once:

   ```bash
   npm run seed
   ```

The default API address is `http://localhost:3000`.

## Security model

- Passwords are bcrypt hashes only; `passwordHash` is excluded from JSON and never logged.
- Login returns a cryptographically random opaque bearer token. MongoDB stores only its SHA-256 digest combined with `SESSION_TOKEN_PEPPER`.
- Session expiry is enforced during every authenticated request and backed by MongoDB TTL removal.
- Failed login attempts lock accounts after `MAX_FAILED_LOGIN_ATTEMPTS`; the configured lock duration is `ACCOUNT_LOCK_MINUTES`.
- Password changes invalidate other active sessions. Password resets invalidate every active session.
- Reset tokens are short-lived signed tokens tied to the current password hash, so changing a password makes issued reset tokens unusable. No reset-token collection or extra user field is needed.
- `POST /api/auth/forgot-password` has a non-enumerating response. In development/test only, it returns `resetToken` to enable local integration testing. A production deployment must deliver that value through a trusted mail service; it is never logged or returned in production.
- Authentication routes have IP rate limits. All administration routes require an authenticated session and active permissions.
- The last active Super Admin cannot be deactivated, locked, or moved to another role.

## API

All responses use either `{ "success": true, "data": ... }` or `{ "success": false, "error": { "code", "message" } }`.

| Method | Route | Access |
| --- | --- | --- |
| POST | `/api/auth/login` | Public |
| POST | `/api/auth/logout` | Authenticated |
| POST | `/api/auth/change-password` | Authenticated |
| POST | `/api/auth/forgot-password` | Public |
| POST | `/api/auth/reset-password` | Public with reset token |
| GET | `/api/auth/me` | Authenticated |
| GET/POST | `/api/roles` | Role read/create permission |
| GET/PUT/PATCH | `/api/roles/:id`, `/api/roles/:id/status` | Role management permissions |
| GET/POST | `/api/permissions` | Permission read/create permission |
| GET/PUT/PATCH | `/api/permissions/:id`, `/api/permissions/:id/status` | Permission management permissions |
| GET | `/api/users`, `/api/users/:id` | User read permission |
| PATCH | `/api/users/:id/status`, `/lock`, `/unlock`, `/role` | Corresponding user-management permission |

Send session credentials as:

```http
Authorization: Bearer <sessionToken>
```

The seeded `ROLE_SUPER_ADMIN` owns all initial Module 1 permissions. Other initial roles receive only self-account access until a Super Admin assigns more permissions.

## Tests

Run the integration suite with:

```bash
npm test
```

Tests use an isolated in-memory MongoDB instance and cover login, invalid credentials, inactive and locked accounts, password change/reset, logout, expiry enforcement, role and permission authorization, role/permission assignment, and account lock/unlock.
