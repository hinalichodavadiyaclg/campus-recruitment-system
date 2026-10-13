# VVWU Campus Recruitment Portal

Enterprise Recruitment Management System & Campus Placement Portal built on a professionally structured **MERN stack monorepo** architecture.

---

## 1. Project Architecture

The repository is physically separated into independent `frontend` and `backend` workspaces, with centralized monorepo orchestration and comprehensive architectural documentation.

```
campus-recruitment-system/
├── backend/                       # Node.js + Express + MongoDB/Mongoose API
│   ├── src/
│   │   ├── config/                # Database connection & environment validation
│   │   ├── controllers/           # Thin HTTP controllers
│   │   ├── middleware/            # Authentication, RBAC authorization, error handler
│   │   ├── models/                # Mongoose schemas (users, roles, permissions, sessions, students, companies)
│   │   ├── routes/                # REST API routes (/api/auth, /api/users, /api/roles, etc.)
│   │   ├── seeders/               # Database seeder scripts
│   │   ├── services/              # Modular business logic & data operations
│   │   ├── utils/                 # Password hashing, token security, logging, constants
│   │   ├── validators/            # Zod validation schemas
│   │   ├── app.js                 # Express application factory
│   │   └── server.js              # Server bootstrapper & graceful shutdown
│   ├── tests/                     # Integration tests (15 test suites)
│   ├── .env                       # Backend secrets & configuration
│   ├── .env.example
│   └── package.json
│
├── frontend/                      # React 18 + Vite + Tailwind CSS Single-Page Application
│   ├── public/                    # Static assets
│   ├── src/
│   │   ├── components/            # Reusable UI components
│   │   │   ├── common/            # Badge, Modal, ConfirmModal, Loading
│   │   │   ├── layout/            # AuthLayout (split-hero), PortalLayout (sidebar/topbar)
│   │   │   └── users/             # Default Passwords, Create User, Edit User modals
│   │   ├── context/               # AuthContext (state & RBAC check) & ToastContext
│   │   ├── pages/                 # Role & domain screens
│   │   │   ├── auth/              # Login, Forgot Password, OTP Verify, Reset Password
│   │   │   ├── dashboard/         # Permission-driven Dashboard
│   │   │   ├── profile/           # My Account & Change Password
│   │   │   ├── users/             # User Management, Details, Role Assignment
│   │   │   ├── roles/             # Role Management, Create/Edit, Permission Checklist
│   │   │   ├── permissions/       # Canonical Permission Management
│   │   │   ├── sessions/          # Login & Session Audit Log
│   │   │   └── imports/           # Excel Bulk Import (Students, Companies, Placement Staff)
│   │   ├── routes/                # Hash router with strict RBAC guards
│   │   ├── services/              # Centralized API service layer (auth, user, role, etc.)
│   │   ├── App.jsx                # Application root with context providers
│   │   ├── main.jsx               # React DOM initialization
│   │   └── index.css              # Tailwind CSS & design tokens
│   ├── index.html                 # Single page application entry point
│   ├── vite.config.js             # Vite 5 configuration with API reverse proxy
│   ├── tailwind.config.js         # Curated color tokens (Navy, Teal, Canvas, Ink)
│   ├── .env                       # Frontend environment variables
│   ├── .env.example
│   └── package.json
│
├── docs/                          # Architecture guides & functionality inventories
│   └── architecture/
│       ├── system-audit-inventory.md
│       └── monorepo-architecture.md
│
├── package.json                   # Root workspace orchestration scripts
└── README.md
```

---

## 2. Technology Stack

- **Frontend**: React 18, Vite 5, Tailwind CSS, Vanilla CSS Design System, Inter Typography
- **Backend**: Node.js (`>=20`), Express 4 (ES Modules), Zod, Multer, XLSX, Helmet, CORS
- **Database**: MongoDB with Mongoose 8
- **Security**: Bcrypt password hashing (12 rounds), SHA-256 peppered session tokens, account lockout protection, HTTP rate limiting

---

## 3. Getting Started

### Prerequisites

- Node.js `>= 20.0.0`
- MongoDB running locally on `mongodb://127.0.0.1:27017` or a MongoDB Atlas URI

### Installation

1. Install root dependencies:
   ```bash
   npm install
   ```

2. Install backend dependencies:
   ```bash
   cd backend && npm install && cd ..
   ```

3. Install frontend dependencies:
   ```bash
   cd frontend && npm install && cd ..
   ```

---

## 4. Environment Variables

### Backend (`backend/.env`)

| Variable | Description | Default / Example |
| :--- | :--- | :--- |
| `NODE_ENV` | Environment mode (`development`, `production`, `test`) | `development` |
| `PORT` | Backend HTTP port | `3000` |
| `MONGODB_URI` | MongoDB connection string | `mongodb://127.0.0.1:27017/campus_recruitment` |
| `CORS_ORIGINS` | Permitted origins | `http://localhost:3000,http://localhost:5173` |
| `SESSION_TOKEN_PEPPER` | High-entropy secret for hashing session tokens | High-entropy string (min 32 chars) |
| `PASSWORD_RESET_SECRET` | Secret key for JWT password reset tokens | High-entropy string (min 32 chars) |
| `SESSION_TTL_HOURS` | Session expiry time in hours | `24` |
| `MAX_FAILED_LOGIN_ATTEMPTS` | Attempts before locking account | `5` |
| `ACCOUNT_LOCK_MINUTES` | Lockout duration in minutes | `30` |
| `SUPER_ADMIN_EMAIL` | Initial Super Admin login email | `admin@example.edu` |
| `SUPER_ADMIN_PASSWORD` | Initial Super Admin password | `Admin@12345678` |
| `SUPER_ADMIN_EMPLOYEE_ID` | Initial Super Admin employee identifier | `ADMIN-001` |

### Frontend (`frontend/.env`)

| Variable | Description | Default / Example |
| :--- | :--- | :--- |
| `VITE_API_BASE_URL` | Base URL of the API. Leave empty for local Vite dev proxy (`/api`). | ` ` (blank for relative proxy) |

---

## 5. Database Seeding

Run the seed script to initialize indexes, all canonical permissions, system roles, and the default Super Admin:

```bash
npm run seed
```

*Note: Default accounts imported via Excel or created initially use the following default initial passwords:*
- **Student Accounts**: `Student@123456`
- **Company Recruiter Accounts**: `Company@123456`
- **Placement Cell Staff**: `Placement@123456`
- **Initial Super Admin**: `Admin@12345678`

---

## 6. Running the Application

### Option A: Run Both Frontend & Backend Concurrently (Recommended)

From the project root:
```bash
npm run dev
```
- Backend runs on `http://localhost:3000`
- Frontend runs on `http://localhost:5173`

### Option B: Run Services Individually

- **Start Backend API only**:
  ```bash
  npm run server
  # or: cd backend && npm run dev
  ```

- **Start Frontend Client only**:
  ```bash
  npm run client
  # or: cd frontend && npm run dev
  ```

### Option C: Production Build

```bash
npm run build
```
Builds the optimized production client bundle in `frontend/dist/`.

---

## 7. Automated Testing & Verification

Run the full integration test suite covering authentication, RBAC, session expiry, role assignment, user lock/unlock, and Excel imports:

```bash
npm test
```

All 15 integration tests run against an in-memory MongoDB instance with complete isolation and zero side effects.

---

## 8. Role-Based Access Control (RBAC) Specification

| Role | Access Level & Capabilities |
| :--- | :--- |
| **ROLE_STUDENT** | Student profile view (`AUTH_READ_SELF`), password change, application dashboard |
| **ROLE_COMPANY** | Recruiter company profile view, candidate management |
| **ROLE_PLACEMENT_COORDINATOR** | Student & company imports (`STUDENT_IMPORT`, `COMPANY_IMPORT`), user read |
| **ROLE_PLACEMENT_HEAD** | User management (`USER_READ`, `USER_CREATE`, `USER_UPDATE`), role read, data imports |
| **ROLE_SUPER_ADMIN** | Full system permissions (User CRUD, Role CRUD, Permission CRUD, Sessions Audit, Data Imports) |
