# VVWU Campus Recruitment Portal — Monorepo Architecture Documentation

## 1. Architectural Overview

The **VVWU Campus Recruitment Portal** has been restructured into an enterprise-grade, professionally separated MERN stack monorepo:

```
campus-recruitment-system/
├── backend/                  # Modular monolithic Express.js API
│   ├── src/
│   │   ├── config/           # Database & env config
│   │   ├── controllers/      # Thin HTTP route controllers
│   │   ├── middleware/       # Authentication, RBAC authorization, error handling
│   │   ├── models/           # Mongoose database models
│   │   ├── routes/           # REST endpoint routers
│   │   ├── seeders/          # Database seeding scripts
│   │   ├── services/         # Encapsulated business logic
│   │   ├── utils/            # Access constants, passwords, sessions, logging
│   │   ├── validators/       # Zod validation schemas and middleware
│   │   ├── app.js            # Express app factory
│   │   └── server.js         # HTTP server entry point
│   ├── tests/                # Automated integration test suite
│   ├── .env                  # Backend environment secrets
│   ├── .env.example
│   └── package.json
│
├── frontend/                 # Modern React 18 single-page app
│   ├── public/               # Static assets
│   ├── src/
│   │   ├── components/       # Reusable UI components
│   │   │   ├── common/       # Badges, Modals, Confirmations, Loading
│   │   │   ├── layout/       # AuthLayout, PortalLayout
│   │   │   └── users/        # User management modals
│   │   ├── context/          # AuthContext (RBAC) & ToastContext
│   │   ├── pages/            # Feature & role-based screens
│   │   │   ├── auth/         # Login, Forgot/Reset Password
│   │   │   ├── dashboard/    # Permission-driven dashboard
│   │   │   ├── profile/      # My Account & Change Password
│   │   │   ├── users/        # User management & role assignment
│   │   │   ├── roles/        # Role management & permission checklist
│   │   │   ├── permissions/  # Canonical permission management
│   │   │   ├── sessions/     # Login activity & audit logs
│   │   │   └── imports/      # Excel bulk data import
│   │   ├── routes/           # Hash routing & RBAC route guards
│   │   ├── services/         # Centralized API service layer
│   │   ├── App.jsx           # Root component with providers
│   │   ├── main.jsx          # React DOM entry point
│   │   └── index.css         # Tailwind CSS & design system tokens
│   ├── index.html            # HTML shell with Google Fonts Inter
│   ├── vite.config.js        # Vite 5 dev server & backend proxy
│   ├── tailwind.config.js    # Tailwind color tokens matching portal UI
│   ├── .env                  # Frontend environment configuration
│   ├── .env.example
│   └── package.json
│
├── docs/                     # Architectural documentation
│   └── architecture/
├── .gitignore
├── package.json              # Monorepo root scripts (dev, test, build)
└── README.md
```

---

## 2. Backend Design: Modular Monolith

The backend strictly follows a layered data flow:
```
HTTP Request
     ↓
Route Layer (backend/src/routes)
     ↓
Middleware Layer (authenticate, authorize, validate)
     ↓
Controller Layer (backend/src/controllers)
     ↓
Service Layer (backend/src/services)
     ↓
Model Layer (backend/src/models)
     ↓
MongoDB Database
```

- **Thin Controllers**: Controllers extract request inputs and call service layer functions.
- **Service Layer**: All business rules, transactions, and password validations are isolated in services.
- **Dynamic Authorization**: Permissions are checked dynamically against active MongoDB permissions.
- **Data Protection**: `passwordHash` is excluded from JSON queries and responses; session tokens use SHA-256 + pepper hashing.

---

## 3. Frontend Design: React + Vite + Tailwind CSS

- **Strict Visual Fidelity**: The frontend reproduces the exact layout, colors, typography, and interactive behaviors documented in the reference specification without arbitrary redesign.
- **Tokens & Colors**:
  - Navy: `#102e5f`
  - Teal Primary: `#087c91` (hover `#056879`, pale `#e7f5f6`)
  - Background Canvas: `#f4f7fb`
  - Ink Text: `#172033`
  - Muted: `#66758a`
  - Line: `#dbe4ed`
  - Status Badges: Green `#16734b`, Red `#b3262c`, Amber `#9b6512`
- **Dynamic RBAC Navigation**: Sidebar navigation links and dashboard quick actions are displayed conditionally based on permissions (`has(permission)`) returned by MongoDB on sign-in.
- **Centralized API Layer**: Every HTTP call is routed through `frontend/src/services/api.js` with Bearer session token authentication and automatic session expiry handling.
