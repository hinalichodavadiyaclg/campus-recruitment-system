# VVWU Campus Recruitment Portal — System Audit & Functionality Inventory

## 1. Executive Summary

This document captures the audit findings (Phase 0) and the functionality inventory (Phase 1) for the **VVWU Campus Recruitment Portal / Enterprise Recruitment Management System**.

The current codebase implements Module 1 (Authentication, Roles, Permissions, Session Management, RBAC, and Excel Bulk Import for Students, Companies, and Placement Staff).

---

## 2. Inventory of Current Modules & Features

| Module / Domain | User Roles with Access | Endpoints | Frontend View / Route | Backend Controller & Service | Models Used |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Authentication** | Public & Authenticated | `POST /api/auth/login`<br>`POST /api/auth/logout`<br>`GET /api/auth/me`<br>`POST /api/auth/change-password`<br>`POST /api/auth/forgot-password`<br>`POST /api/auth/reset-password` | `#/login`<br>`#/forgot-password`<br>`#/verify-reset`<br>`#/reset-password`<br>`#/reset-success`<br>`#/change-password`<br>`#/first-login-password` | `auth.controller.js`<br>`auth.service.js` | `User`<br>`UserSession`<br>`Role`<br>`Permission` |
| **Dashboard & Account** | All authenticated (`AUTH_READ_SELF`) | `GET /api/auth/me`<br>`GET /api/users?limit=1`<br>`GET /api/roles`<br>`GET /api/permissions` | `#/dashboard`<br>`#/profile` | `auth.controller.js`<br>`user.controller.js` | `User`<br>`Role`<br>`Permission` |
| **User Management** | Super Admin, Placement Head (`USER_READ`, `USER_CREATE`, `USER_UPDATE`, etc.) | `GET /api/users`<br>`POST /api/users`<br>`GET /api/users/:id`<br>`PUT /api/users/:id`<br>`DELETE /api/users/:id`<br>`PATCH /api/users/:id/status`<br>`PATCH /api/users/:id/lock`<br>`PATCH /api/users/:id/unlock`<br>`PATCH /api/users/:id/role` | `#/users`<br>`#/users/:id`<br>`#/users/:id/role` | `user.controller.js`<br>`user.service.js` | `User`<br>`Role`<br>`UserSession` |
| **Role Management** | Super Admin (`ROLE_READ`, `ROLE_CREATE`, `ROLE_UPDATE`, `ROLE_DELETE`, `ROLE_ASSIGN_PERMISSION`, `ROLE_MANAGE_STATUS`) | `GET /api/roles`<br>`POST /api/roles`<br>`GET /api/roles/:id`<br>`PUT /api/roles/:id`<br>`DELETE /api/roles/:id`<br>`PATCH /api/roles/:id/status`<br>`PUT /api/roles/:id/permissions` | `#/roles`<br>`#/roles/new`<br>`#/roles/:id`<br>`#/roles/:id/edit`<br>`#/roles/:id/permissions` | `role.controller.js`<br>`role.service.js` | `Role`<br>`Permission`<br>`User` |
| **Permission Management** | Super Admin (`PERMISSION_READ`, `PERMISSION_CREATE`, `PERMISSION_UPDATE`, `PERMISSION_DELETE`, `PERMISSION_MANAGE_STATUS`) | `GET /api/permissions`<br>`POST /api/permissions`<br>`GET /api/permissions/:id`<br>`PUT /api/permissions/:id`<br>`DELETE /api/permissions/:id`<br>`PATCH /api/permissions/:id/status` | `#/permissions`<br>`#/permissions/new`<br>`#/permissions/:id`<br>`#/permissions/:id/edit` | `permission.controller.js`<br>`permission.service.js` | `Permission`<br>`Role` |
| **Session & Audit Logging** | Super Admin (`SESSION_READ`) | `GET /api/sessions` | `#/sessions` | `session.controller.js`<br>`session.service.js` | `UserSession`<br>`User` |
| **Department Management** | Super Admin, Placement Head, Placement Coordinator (`DEPARTMENT_READ`, `DEPARTMENT_CREATE`, `DEPARTMENT_UPDATE`, `DEPARTMENT_DELETE`, `DEPARTMENT_MANAGE`) | `GET /api/departments`<br>`GET /api/departments/:id`<br>`POST /api/departments`<br>`PATCH /api/departments/:id`<br>`PATCH /api/departments/:id/status` | `#/departments` | `department.controller.js`<br>`department.service.js` | `Department` |
| **Course Management** | Super Admin, Placement Head, Placement Coordinator (`COURSE_READ`, `COURSE_CREATE`, `COURSE_UPDATE`, `COURSE_DELETE`, `COURSE_MANAGE`) | `GET /api/courses`<br>`GET /api/courses/:id`<br>`POST /api/courses`<br>`PATCH /api/courses/:id`<br>`PATCH /api/courses/:id/status` | `#/courses` | `course.controller.js`<br>`course.service.js` | `Course`<br>`Department` |
| **Placement Officer Profiles** | Super Admin, Placement Head (`USER_READ`, `USER_CREATE`, `USER_UPDATE`, `USER_DELETE`) | `GET /api/placement-officers`<br>`GET /api/placement-officers/:id`<br>`POST /api/placement-officers`<br>`PUT /api/placement-officers/:id`<br>`DELETE /api/placement-officers/:id` | `#/placement-officers` | `placement_officer.controller.js`<br>`placement_officer.service.js` | `PlacementOfficer`<br>`User` |
| **Student Profiles** | Student (self), Staff (`STUDENT_PROFILE_READ`, `STUDENT_PROFILE_UPDATE`, `USER_READ`) | `GET /api/students/me`<br>`PUT /api/students/me`<br>`GET /api/students/:id`<br>`GET /api/students` | `#/students`<br>`#/students/:id` | `student.controller.js`<br>`student.service.js` | `Student`<br>`User` |
| **Company Profiles** | Recruiter (self), Staff (`COMPANY_READ`, `COMPANY_CREATE`, `COMPANY_UPDATE`) | `GET /api/companies/me`<br>`PUT /api/companies/me`<br>`GET /api/companies/:id`<br>`GET /api/companies` | `#/companies`<br>`#/companies/:id` | `company.controller.js`<br>`company.service.js` | `Company`<br>`User` |
| **Excel Data Import** | Placement Coordinator, Placement Head, Super Admin (`STUDENT_IMPORT`, `COMPANY_IMPORT`, `PLACEMENT_USER_IMPORT`) | `GET /api/imports/templates/:type`<br>`POST /api/imports/validate/:type`<br>`POST /api/imports/confirm/:type` | `#/import/student`<br>`#/import/company`<br>`#/import/placement` | `import.controller.js`<br>`import.service.js` | `Student`<br>`Company`<br>`User` |

---

## 3. Database Collections Contract (Strictly Preserved)

1. **`users`** (`backend/src/models/user.model.js`):
   - `universityId` (String, unique sparse, required if `userType === 'STUDENT'`)
   - `employeeId` (String, unique sparse, required if `userType === 'PLACEMENT'`)
   - `companyId` (ObjectId ref `Company`, indexed, required if `userType === 'COMPANY'`; denotes affiliation with shared company profile)
   - `email` (String, unique, lowercase, trim, required)
   - `passwordHash` (String, required, select: false)
   - `userType` ('STUDENT', 'COMPANY', 'PLACEMENT', required)
   - `roleId` (String ref `Role`, indexed, required)
   - `accountStatus` ('ACTIVE', 'INACTIVE', 'LOCKED', default: 'ACTIVE', required)
   - `lastLoginAt` (Date)
   - `failedLoginAttempts` (Number, default: 0, min: 0)
   - `lockedUntil` (Date)
   - *Note on Legacy Value*: `isEmailVerified` existed in early seed scripts but is absent from the active Mongoose model; account activation is strictly governed by `accountStatus`.
2. **`roles`** (`backend/src/models/role.model.js`):
   - `_id` (String, e.g. `ROLE_SUPER_ADMIN`, `ROLE_PLACEMENT_HEAD`, `ROLE_PLACEMENT_COORDINATOR`, `ROLE_COMPANY`, `ROLE_STUDENT`)
   - `name` (String, unique, trim, required)
   - `description` (String, trim, required)
   - `permissionIds` ([String], default: [])
   - `isActive` (Boolean, default: true)
3. **`permissions`** (`backend/src/models/permission.model.js`):
   - `_id` (String, canonical format `RESOURCE_ACTION`, e.g. `USER_CREATE`, 44 total canonical permissions)
   - `name` (String, unique, trim, required)
   - `module` (String, trim, index: true, required)
   - `action` ('CREATE', 'READ', 'UPDATE', 'DELETE', 'MANAGE', required)
   - `description` (String, trim, required)
   - `isActive` (Boolean, default: true)
4. **`user_sessions`** (`backend/src/models/user-session.model.js`):
   - `userId` (ObjectId ref `User`, index: true, required)
   - `sessionTokenHash` (String, 64-hex SHA-256 digest, unique, select: false, required)
   - `loginAt` (Date, required)
   - `lastActivityAt` (Date, required)
   - `expiresAt` (Date, TTL indexed `expireAfterSeconds: 0`, required)
   - `logoutAt` (Date)
   - `ipAddress` (String, trim)
   - `userAgent` (String, trim)
   - `isActive` (Boolean, default: true)
5. **`students`** (`backend/src/models/student.model.js`):
   - `universityId` (String, unique uppercase, required)
   - `firstName`, `lastName`, `email` (unique lowercase), `mobileNumber`, `address`
   - `branch` (String, legacy academic discipline; indexed with `passingYear`)
   - `department` (String, legacy department string)
   - `departmentId` (ObjectId ref `Department`, index: true, optional relational linkage)
   - `courseId` (ObjectId ref `Course`, index: true, optional relational linkage)
   - `semester` (Number 1–12), `cgpa` (Number 0–10), `backlogs` (Number >= 0), `passingYear` (Number 1990–2100)
   - `userId` (ObjectId ref `User`)
   - Portfolio metadata: `profilePhoto`, `headline`, `bio`, `careerObjective`, `skills` ([String]), `githubUrl`, `linkedinUrl`, `portfolioUrl`, `isPublicProfile` (Boolean, default: true)
   - Sub-documents: `resume`, `certificates`, `projects`, `internships`, `achievements`
6. **`companies`** (`backend/src/models/company.model.js`):
   - `companyName` (String, unique, trim, required)
   - `industryType` (String, indexed, trim, required)
   - `description`, `website`, `yearEstablished` (Number 1800–2100, required), `hrRecruiterName` (required), `designation`, `email` (unique lowercase, required), `mobileNumber`, `officeAddress`
   - `userId` (ObjectId ref `User`; designates primary recruiter; multi-recruiter support preserves this while other recruiters share `users.companyId`)
   - *Note on Legacy Value*: `verificationStatus` was documented in initial drafts but is absent from the active Mongoose model; recruiter activation is controlled via `users.accountStatus`.
7. **`placement_officers`** (`backend/src/models/placement_officer.model.js`):
   - `employeeId` (String, unique, trim, required)
   - `firstName`, `lastName`, `email` (unique lowercase, required)
   - `designation` (String, trim, required)
   - `role` (String, enum: `['ROLE_PLACEMENT_HEAD', 'ROLE_PLACEMENT_COORDINATOR']`, required; Super Admin is intentionally excluded as an institutional admin)
   - `userId` (ObjectId ref `User`)
8. **`departments`** (`backend/src/models/department.model.js`):
   - `name` (String, trim, required, indexed)
   - `code` (String, unique uppercase, trim, required)
   - `description` (String, trim, default: '')
   - `isActive` (Boolean, default: true, required, indexed)
9. **`courses`** (`backend/src/models/course.model.js`):
   - `name` (String, trim, required)
   - `code` (String, unique uppercase, trim, required)
   - `departmentId` (ObjectId ref `Department`, required, indexed)
   - `level` (String, enum: `['UNDERGRADUATE', 'POSTGRADUATE', 'DIPLOMA', 'CERTIFICATE', 'DOCTORAL']`, required, indexed)
   - `durationYears` (Number 0.5–10)
   - `description` (String, trim, default: '')
   - `isActive` (Boolean, default: true, required, indexed)

---

## 4. UI/UX Visual Specification

- **Brand Name**: Campus Recruit / VVWU Campus Recruitment Portal
- **Brand Mark**: Rounded badge with letters "CR", colored `#102e5f` with `#e2f5f5` background
- **Color Palette**:
  - Primary / Navy: `#102e5f`
  - Accent / Teal: `#087c91` (hover `#056879`, pale `#e7f5f6`)
  - Background Canvas: `#f4f7fb`
  - Text Ink: `#172033`
  - Muted: `#66758a`
  - Line / Border: `#dbe4ed`
  - Green / Success: `#16734b` (`#e8f6ef`)
  - Red / Danger: `#b3262c` (`#fff0f1`)
  - Amber / Warning: `#9b6512` (`#fff6e6`)
- **Typography**: Inter, ui-sans-serif, system-ui
- **Layouts**:
  - **Auth Shell**: 2-column split (Left: Hero with radial gradient `#102e5f` to `#075c76`; Right: Centered Auth Card)
  - **Portal Shell**: 2-column dashboard (Left: Sticky navy `#102e5f` Sidebar 250px; Right: Topbar + Page content)
- **Modals & Toast**: Fixed position modal backdrops with dark tint `#10203480`, floating bottom-right toast with 3.5s timeout.
