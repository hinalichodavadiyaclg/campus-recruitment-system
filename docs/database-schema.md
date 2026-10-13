# Database Schema Specifications & Freeze Registry

## 1. Schema Freeze Status Summary

| Collection | Model Name | Module | Status | Approved Date |
| :--- | :--- | :--- | :---: | :--- |
| `departments` | `Department` | Department Management | **FINAL (FROZEN)** | October 10, 2026 |
| `courses` | `Course` | Course Management | **FINAL (FROZEN)** | October 10, 2026 |
| `users` | `User` | Auth & Identity | **FINAL (FROZEN)** | October 12, 2026 |
| `students` | `Student` | Student Profiles | **FINAL (FROZEN)** | October 12, 2026 |
| `companies` | `Company` | Recruiter Profiles | **FINAL (FROZEN)** | October 12, 2026 |
| `placement_officers` | `PlacementOfficer` | Placement Cell Profiles | **FINAL (FROZEN)** | October 12, 2026 |
| `roles` | `Role` | Dynamic RBAC | **FINAL (FROZEN)** | October 12, 2026 |
| `permissions` | `Permission` | Dynamic RBAC | **FINAL (FROZEN)** | October 12, 2026 |
| `user_sessions` | `UserSession` | Auth & Session Tracking | **FINAL (FROZEN)** | October 12, 2026 |

> [!NOTE]
> **Schema Freeze Governance**: For all collections marked `FINAL (FROZEN)`, strict database schema freeze is enforced. Future schema changes remain possible only through explicit review, approval, implementation, testing, and documentation updates.

---

## 2. Finalized Collection: `departments` (Model: `Department`)

**Status**: `FINAL` — **STRICT DATABASE SCHEMA FREEZE ENFORCED**  
*No fields, types, defaults, validation rules, or indexes may be modified without explicit written architectural approval, implementation, testing, and documentation updates.*

### Collection Metadata
* **MongoDB Collection Name**: `departments`
* **Mongoose Model Name**: `Department`
* **File Path**: `backend/src/models/department.model.js`
* **Timestamps**: Enabled (`createdAt`, `updatedAt` auto-managed by Mongoose)
* **Version Key**: Default (`__v`)

### Approved Field Definitions

| Field Name | Data Type | Required | Default | Trim | Case / Normalization | Validation / Constraints |
| :--- | :--- | :---: | :---: | :---: | :--- | :--- |
| `_id` | `ObjectId` | Auto | Auto | — | — | Primary Key |
| `name` | `String` | Yes | — | Yes | Preserves Case | Non-empty string, min 1, max 100 chars |
| `code` | `String` | Yes | — | Yes | `UPPERCASE` | Non-empty string, min 1, max 20 chars, unique |
| `description` | `String` | No | `""` | Yes | Preserves Case | Optional string, max 500 chars |
| `isActive` | `Boolean` | Yes | `true` | — | — | Boolean flag for deactivation (soft delete) |
| `createdAt` | `Date` | Auto | `Date.now` | — | — | System-managed timestamp |
| `updatedAt` | `Date` | Auto | `Date.now` | — | — | System-managed timestamp |

### Database Indexes
1. `{ _id: 1 }` (Primary Key)
2. `{ code: 1 }` (`unique: true`)
3. `{ name: 1 }` (Standard index)
4. `{ isActive: 1 }` (Standard index)

---

## 3. Finalized Collection: `courses` (Model: `Course`)

**Status**: `FINAL` — **STRICT DATABASE SCHEMA FREEZE ENFORCED**  
*No fields, types, defaults, validation rules, or indexes may be modified without explicit written architectural approval, implementation, testing, and documentation updates.*

### Collection Metadata
* **MongoDB Collection Name**: `courses`
* **Mongoose Model Name**: `Course`
* **File Path**: `backend/src/models/course.model.js`
* **Timestamps**: Enabled (`createdAt`, `updatedAt` auto-managed by Mongoose)
* **Version Key**: Default (`__v`)

### Approved Field Definitions

| Field Name | Data Type | Required | Default | Trim | Case / Normalization | Validation / Constraints |
| :--- | :--- | :---: | :---: | :---: | :--- | :--- |
| `_id` | `ObjectId` | Auto | Auto | — | — | Primary Key |
| `name` | `String` | Yes | — | Yes | Preserves Case | Non-empty string, min 1, max 100 chars |
| `code` | `String` | Yes | — | Yes | `UPPERCASE` | Non-empty string, min 1, max 20 chars, unique |
| `departmentId` | `ObjectId` | Yes | — | — | — | Foreign Key reference to `departments._id` |
| `level` | `String` | Yes | — | — | `Enum` | One of: `UNDERGRADUATE`, `POSTGRADUATE`, `DIPLOMA`, `CERTIFICATE`, `DOCTORAL` |
| `durationYears` | `Number` | No | — | — | — | Optional numeric duration, min 0.5, max 10 |
| `description` | `String` | No | `""` | Yes | Preserves Case | Optional string, max 500 chars |
| `isActive` | `Boolean` | Yes | `true` | — | — | Boolean flag for deactivation (soft delete) |
| `createdAt` | `Date` | Auto | `Date.now` | — | — | System-managed timestamp |
| `updatedAt` | `Date` | Auto | `Date.now` | — | — | System-managed timestamp |

### Database Indexes
1. `{ _id: 1 }` (Primary Key)
2. `{ code: 1 }` (`unique: true`)
3. `{ departmentId: 1 }` (Standard index)
4. `{ level: 1 }` (Standard index)
5. `{ isActive: 1 }` (Standard index)

---

## 4. Finalized Collection: `users` (Model: `User`)

**Status**: `FINAL` — **STRICT DATABASE SCHEMA FREEZE ENFORCED**  
*No fields, types, defaults, validation rules, or indexes may be modified without explicit written architectural approval, implementation, testing, and documentation updates.*

### Collection Metadata
* **MongoDB Collection Name**: `users`
* **Mongoose Model Name**: `User`
* **File Path**: `backend/src/models/user.model.js`
* **Timestamps**: Enabled (`createdAt`, `updatedAt` auto-managed by Mongoose)
* **JSON Serialization**: `passwordHash` deleted by default in `toJSON` transform

### Approved Field Definitions

| Field Name | Data Type | Required | Default | Validation & Enums | Notes |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `_id` | `ObjectId` | Auto | Auto | Primary Key | 24-character hexadecimal ObjectId |
| `email` | `String` | Yes | — | Lowercase, trim, unique email format | Primary authentication identity |
| `passwordHash` | `String` | Yes | — | Bcrypt hashed string (`select: false`) | Excluded by default from queries |
| `userType` | `String` | Yes | — | Enum: `['STUDENT', 'COMPANY', 'PLACEMENT']` | Account type category |
| `roleId` | `String` | Yes | — | References `Role._id` (e.g. `ROLE_SUPER_ADMIN`) | Dynamic RBAC role identifier |
| `universityId` | `String` | Conditional | — | Trimmed string; required if `userType === 'STUDENT'` | Sparse unique index |
| `employeeId` | `String` | Conditional | — | Trimmed string; required if `userType === 'PLACEMENT'` | Sparse unique index |
| `companyId` | `ObjectId` | Conditional | — | Ref `Company`; required if `userType === 'COMPANY'` | Affiliation reference to shared company |
| `accountStatus` | `String` | Yes | `'ACTIVE'` | Enum: `['ACTIVE', 'INACTIVE', 'LOCKED']` | Security and access control status |
| `lastLoginAt` | `Date` | No | — | Date timestamp | Updated upon successful session creation |
| `failedLoginAttempts` | `Number` | No | `0` | Minimum `0` | Brute force lock counter |
| `lockedUntil` | `Date` | No | — | Date timestamp | Lockout expiration time |
| `createdAt` | `Date` | Auto | `Date.now` | System-managed timestamp | Auto-generated by Mongoose `timestamps: true` |
| `updatedAt` | `Date` | Auto | `Date.now` | System-managed timestamp | Auto-generated by Mongoose `timestamps: true` |

*Note on Legacy Values*: `isEmailVerified` was present in early seed scripts but is omitted from `userSchema`; user authorization is strictly controlled via `accountStatus`.

### Database Indexes
1. `{ _id: 1 }` (Primary Key)
2. `{ email: 1 }` (`unique: true`)
3. `{ roleId: 1 }` (Standard index)
4. `{ universityId: 1 }` (`unique: true, sparse: true`)
5. `{ employeeId: 1 }` (`unique: true, sparse: true`)
6. `{ companyId: 1 }` (Standard index)

---

## 5. Finalized Collection: `students` (Model: `Student`)

**Status**: `FINAL` — **STRICT DATABASE SCHEMA FREEZE ENFORCED**  
*No fields, types, defaults, validation rules, or indexes may be modified without explicit written architectural approval, implementation, testing, and documentation updates.*

### Collection Metadata
* **MongoDB Collection Name**: `students`
* **Mongoose Model Name**: `Student`
* **File Path**: `backend/src/models/student.model.js`
* **Timestamps**: Enabled (`createdAt`, `updatedAt` auto-managed by Mongoose)

### Approved Field Definitions

| Field Name | Data Type | Required | Default | Validation & Enums | Notes |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `_id` | `ObjectId` | Auto | Auto | Primary Key | 24-character hexadecimal ObjectId |
| `universityId` | `String` | Yes | — | Unique, uppercase, trimmed | Student registration / roll number |
| `firstName` | `String` | Yes | — | Trimmed string | Given name |
| `lastName` | `String` | Yes | — | Trimmed string | Family / Surname |
| `email` | `String` | Yes | — | Unique, lowercase, trimmed email | Primary student email |
| `mobileNumber` | `String` | Yes | — | Trimmed string | Contact phone number |
| `address` | `String` | No | — | Trimmed string | Residential address |
| `branch` | `String` | Yes | — | Trimmed string | Legacy branch name (indexed with passingYear) |
| `department` | `String` | Yes | — | Trimmed string | Legacy department string (preserved for bulk import) |
| `departmentId` | `ObjectId` | No | — | Ref `Department`, indexed | Foreign Key to normalized `departments` |
| `courseId` | `ObjectId` | No | — | Ref `Course`, indexed | Foreign Key to normalized `courses` |
| `semester` | `Number` | Yes | — | Integer, min `1`, max `12` | Current semester |
| `cgpa` | `Number` | Yes | — | Number, min `0`, max `10` | Cumulative Grade Point Average |
| `backlogs` | `Number` | No | `0` | Integer, min `0` | Active backlog count |
| `passingYear` | `Number` | No | — | Integer, min `1990`, max `2100` | Graduation batch year |
| `userId` | `ObjectId` | No | — | Ref `User` | Reverse reference to auth user account |
| `profilePhoto` | `String` | No | — | Trimmed URL / path | Avatar photo URL |
| `headline` | `String` | No | — | Trimmed string | Professional headline |
| `bio` | `String` | No | — | Trimmed text | Self-summary |
| `careerObjective` | `String` | No | — | Trimmed text | Resume objective |
| `skills` | `[String]` | No | `[]` | Array of strings | Skill tags |
| `githubUrl` | `String` | No | — | Trimmed URL | GitHub profile link |
| `linkedinUrl` | `String` | No | — | Trimmed URL | LinkedIn profile link |
| `portfolioUrl` | `String` | No | — | Trimmed URL | Portfolio / Website link |
| `isPublicProfile` | `Boolean` | No | `true` | Boolean | Directory visibility toggle |
| `resume` | `Object` | No | — | Embedded `resumeSchema` (`_id: false`) | Contains `url`, `fileName`, `fileSize`, `uploadedAt` |
| `certificates` | `[Object]` | No | `[]` | Sub-document array (`timestamps: true`) | Contains `name`, `issuingOrganization`, `issueDate`, `credentialId`, `credentialUrl`, `fileUrl`, `createdAt`, `updatedAt` |
| `projects` | `[Object]` | No | `[]` | Sub-document array (`timestamps: true`) | Contains `title`, `description`, `technologies`, `projectUrl`, `githubUrl`, `startDate`, `endDate`, `createdAt`, `updatedAt` |
| `internships` | `[Object]` | No | `[]` | Sub-document array (`timestamps: true`) | Contains `organization`, `role`, `description`, `startDate`, `endDate`, `documentUrl`, `createdAt`, `updatedAt` |
| `achievements` | `[Object]` | No | `[]` | Sub-document array (`timestamps: true`) | Contains `title`, `description`, `date`, `issuingOrganization`, `documentUrl`, `createdAt`, `updatedAt` |
| `createdAt` | `Date` | Auto | `Date.now` | System-managed timestamp | Auto-generated by Mongoose `timestamps: true` |
| `updatedAt` | `Date` | Auto | `Date.now` | System-managed timestamp | Auto-generated by Mongoose `timestamps: true` |

### Nested Sub-Document Definitions

#### 1. Embedded Document: `resume` (`resumeSchema`, `_id: false`)
| Field Name | Data Type | Required | Default | Validation & Constraints | Notes |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `url` | `String` | Yes | — | Valid URL / storage path | Remote file storage or uploads URL |
| `fileName` | `String` | Yes | — | Trimmed string | Original / stored file name |
| `fileSize` | `Number` | No | — | Positive integer | File size in bytes |
| `uploadedAt` | `Date` | No | `Date.now` | System-managed timestamp | Upload date and time |

#### 2. Sub-Document Array: `certificates` (`certificateSchema`, `timestamps: true`)
| Field Name | Data Type | Required | Default | Validation & Constraints | Notes |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `_id` | `ObjectId` | Auto | Auto | Primary Key | Sub-document ObjectId |
| `name` | `String` | Yes | — | Trimmed string | Certificate or course name |
| `issuingOrganization` | `String` | Yes | — | Trimmed string | Issuing body or platform |
| `issueDate` | `String` | No | — | Trimmed string | Issue date string |
| `credentialId` | `String` | No | — | Trimmed string | Verification / credential ID |
| `credentialUrl` | `String` | No | — | Trimmed string | Verification web URL |
| `fileUrl` | `String` | No | — | Trimmed string | Uploaded certificate file URL |
| `createdAt` | `Date` | Auto | `Date.now` | System-managed timestamp | Auto-generated by Mongoose `timestamps: true` |
| `updatedAt` | `Date` | Auto | `Date.now` | System-managed timestamp | Auto-generated by Mongoose `timestamps: true` |

#### 3. Sub-Document Array: `projects` (`projectSchema`, `timestamps: true`)
| Field Name | Data Type | Required | Default | Validation & Constraints | Notes |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `_id` | `ObjectId` | Auto | Auto | Primary Key | Sub-document ObjectId |
| `title` | `String` | Yes | — | Trimmed string | Project title |
| `description` | `String` | No | — | Trimmed string | Detailed project description |
| `technologies` | `[String]` | No | `[]` | Array of strings | Technology tags / stack |
| `projectUrl` | `String` | No | — | Trimmed string | Live demo / hosted URL |
| `githubUrl` | `String` | No | — | Trimmed string | GitHub / repository URL |
| `startDate` | `String` | No | — | Trimmed string | Project start date |
| `endDate` | `String` | No | — | Trimmed string | Project completion date |
| `createdAt` | `Date` | Auto | `Date.now` | System-managed timestamp | Auto-generated by Mongoose `timestamps: true` |
| `updatedAt` | `Date` | Auto | `Date.now` | System-managed timestamp | Auto-generated by Mongoose `timestamps: true` |

#### 4. Sub-Document Array: `internships` (`internshipSchema`, `timestamps: true`)
| Field Name | Data Type | Required | Default | Validation & Constraints | Notes |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `_id` | `ObjectId` | Auto | Auto | Primary Key | Sub-document ObjectId |
| `organization` | `String` | Yes | — | Trimmed string | Employer / organization name |
| `role` | `String` | Yes | — | Trimmed string | Job / internship role |
| `description` | `String` | No | — | Trimmed string | Role responsibilities / description |
| `startDate` | `String` | No | — | Trimmed string | Start date |
| `endDate` | `String` | No | — | Trimmed string | End date |
| `documentUrl` | `String` | No | — | Trimmed string | Certificate / offer letter document URL |
| `createdAt` | `Date` | Auto | `Date.now` | System-managed timestamp | Auto-generated by Mongoose `timestamps: true` |
| `updatedAt` | `Date` | Auto | `Date.now` | System-managed timestamp | Auto-generated by Mongoose `timestamps: true` |

#### 5. Sub-Document Array: `achievements` (`achievementSchema`, `timestamps: true`)
| Field Name | Data Type | Required | Default | Validation & Constraints | Notes |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `_id` | `ObjectId` | Auto | Auto | Primary Key | Sub-document ObjectId |
| `title` | `String` | Yes | — | Trimmed string | Achievement title |
| `description` | `String` | No | — | Trimmed string | Achievement description |
| `date` | `String` | No | — | Trimmed string | Date achieved |
| `issuingOrganization` | `String` | No | — | Trimmed string | Issuing body / organizer |
| `documentUrl` | `String` | No | — | Trimmed string | Proof / certificate document URL |
| `createdAt` | `Date` | Auto | `Date.now` | System-managed timestamp | Auto-generated by Mongoose `timestamps: true` |
| `updatedAt` | `Date` | Auto | `Date.now` | System-managed timestamp | Auto-generated by Mongoose `timestamps: true` |

### Database Indexes
1. `{ _id: 1 }` (Primary Key)
2. `{ universityId: 1 }` (`unique: true`)
3. `{ email: 1 }` (`unique: true`)
4. `{ branch: 1, passingYear: 1 }` (Batch query compound index)
5. `{ departmentId: 1 }` (Relational index)
6. `{ courseId: 1 }` (Relational index)
7. `{ departmentId: 1, courseId: 1 }` (Academic query compound index)
8. `{ isPublicProfile: 1 }` (Visibility filter index)

---

## 6. Finalized Collection: `companies` (Model: `Company`)

**Status**: `FINAL` — **STRICT DATABASE SCHEMA FREEZE ENFORCED**  
*No fields, types, defaults, validation rules, or indexes may be modified without explicit written architectural approval, implementation, testing, and documentation updates.*

### Collection Metadata
* **MongoDB Collection Name**: `companies`
* **Mongoose Model Name**: `Company`
* **File Path**: `backend/src/models/company.model.js`
* **Timestamps**: Enabled (`createdAt`, `updatedAt` auto-managed by Mongoose)

### Approved Field Definitions

| Field Name | Data Type | Required | Default | Validation & Enums | Notes |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `_id` | `ObjectId` | Auto | Auto | Primary Key | 24-character hexadecimal ObjectId |
| `companyName` | `String` | Yes | — | Unique, trimmed string | Legal / display company name |
| `industryType` | `String` | Yes | — | Trimmed string, indexed | Industry category |
| `description` | `String` | No | — | Trimmed string | Company overview |
| `website` | `String` | No | — | Trimmed URL | Official website |
| `yearEstablished` | `Number` | Yes | — | Integer, min `1800`, max `2100` | Year established |
| `hrRecruiterName` | `String` | Yes | — | Trimmed string | Primary HR contact name |
| `designation` | `String` | No | — | Trimmed string | Recruiter designation |
| `email` | `String` | Yes | — | Unique, lowercase, trimmed email | Company / recruiter contact email |
| `mobileNumber` | `String` | No | — | Trimmed string | Phone number |
| `officeAddress` | `String` | No | — | Trimmed string | Physical headquarters address |
| `userId` | `ObjectId` | No | — | Ref `User` | **Primary recruiter account**. Secondary recruiters reference `company._id` via `users.companyId` |
| `createdAt` | `Date` | Auto | `Date.now` | System-managed timestamp | Auto-generated by Mongoose `timestamps: true` |
| `updatedAt` | `Date` | Auto | `Date.now` | System-managed timestamp | Auto-generated by Mongoose `timestamps: true` |

*Note on Legacy Values*: `verificationStatus` was documented in early drafts but is omitted from `companySchema`. Recruiter authorization is strictly controlled via `users.accountStatus`.

### Database Indexes
1. `{ _id: 1 }` (Primary Key)
2. `{ companyName: 1 }` (`unique: true`)
3. `{ email: 1 }` (`unique: true`)
4. `{ industryType: 1 }` (Standard index)

---

## 7. Finalized Collection: `placement_officers` (Model: `PlacementOfficer`)

**Status**: `FINAL` — **STRICT DATABASE SCHEMA FREEZE ENFORCED**  
*No fields, types, defaults, validation rules, or indexes may be modified without explicit written architectural approval, implementation, testing, and documentation updates.*

### Collection Metadata
* **MongoDB Collection Name**: `placement_officers`
* **Mongoose Model Name**: `PlacementOfficer`
* **File Path**: `backend/src/models/placement_officer.model.js`
* **Timestamps**: Enabled (`createdAt`, `updatedAt` auto-managed by Mongoose)

### Approved Field Definitions

| Field Name | Data Type | Required | Default | Validation & Enums | Notes |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `_id` | `ObjectId` | Auto | Auto | Primary Key | 24-character hexadecimal ObjectId |
| `employeeId` | `String` | Yes | — | Unique, trimmed string | Staff ID |
| `firstName` | `String` | Yes | — | Trimmed string | Given name |
| `lastName` | `String` | Yes | — | Trimmed string | Surname |
| `email` | `String` | Yes | — | Unique, lowercase, trimmed email | Institutional email |
| `designation` | `String` | Yes | — | Trimmed string | Placement Cell role / title |
| `role` | `String` | No | `'ROLE_PLACEMENT_COORDINATOR'` (API validator) | Enum: `['ROLE_PLACEMENT_HEAD', 'ROLE_PLACEMENT_COORDINATOR']` | Placement Cell permissions role. Optional in Mongoose model schema; defaulted to `ROLE_PLACEMENT_COORDINATOR` by API creation validator. Super Admin (`ROLE_SUPER_ADMIN`) is strictly an administrative `User` without a `PlacementOfficer` profile document |
| `userId` | `ObjectId` | No | — | Ref `User` | Reverse reference to auth user account |
| `createdAt` | `Date` | Auto | `Date.now` | System-managed timestamp | Auto-generated by Mongoose `timestamps: true` |
| `updatedAt` | `Date` | Auto | `Date.now` | System-managed timestamp | Auto-generated by Mongoose `timestamps: true` |

### Database Indexes
1. `{ _id: 1 }` (Primary Key)
2. `{ employeeId: 1 }` (`unique: true`)
3. `{ email: 1 }` (`unique: true`)

---

## 8. Finalized Collection: `roles` (Model: `Role`)

**Status**: `FINAL` — **STRICT DATABASE SCHEMA FREEZE ENFORCED**  
*No fields, types, defaults, validation rules, or indexes may be modified without explicit written architectural approval, implementation, testing, and documentation updates.*

### Collection Metadata
* **MongoDB Collection Name**: `roles`
* **Mongoose Model Name**: `Role`
* **File Path**: `backend/src/models/role.model.js`
* **Timestamps**: Enabled (`createdAt`, `updatedAt` auto-managed by Mongoose)

### Approved Field Definitions

| Field Name | Data Type | Required | Default | Validation & Enums | Notes |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `_id` | `String` | Yes | — | Canonical role code | Primary Key (e.g. `ROLE_SUPER_ADMIN`) |
| `name` | `String` | Yes | — | Unique, trimmed string | Display role name |
| `description` | `String` | Yes | — | Trimmed string | Functional role description |
| `permissionIds` | `[String]` | No | `[]` | Array of strings | Assigned canonical permission IDs |
| `isActive` | `Boolean` | No | `true` | Boolean | Role status toggle |
| `createdAt` | `Date` | Auto | `Date.now` | System-managed timestamp | Auto-generated by Mongoose `timestamps: true` |
| `updatedAt` | `Date` | Auto | `Date.now` | System-managed timestamp | Auto-generated by Mongoose `timestamps: true` |

### Database Indexes
1. `{ _id: 1 }` (Primary Key)
2. `{ name: 1 }` (`unique: true`)

---

## 9. Finalized Collection: `permissions` (Model: `Permission`)

**Status**: `FINAL` — **STRICT DATABASE SCHEMA FREEZE ENFORCED**  
*No fields, types, defaults, validation rules, or indexes may be modified without explicit written architectural approval, implementation, testing, and documentation updates.*

### Collection Metadata
* **MongoDB Collection Name**: `permissions`
* **Mongoose Model Name**: `Permission`
* **File Path**: `backend/src/models/permission.model.js`
* **Timestamps**: Enabled (`createdAt`, `updatedAt` auto-managed by Mongoose)

### Approved Field Definitions

| Field Name | Data Type | Required | Default | Validation & Enums | Notes |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `_id` | `String` | Yes | — | Canonical format `RESOURCE_ACTION` | Primary Key (e.g. `USER_CREATE`, 44 total) |
| `name` | `String` | Yes | — | Unique, trimmed string | Display permission name |
| `module` | `String` | Yes | — | Trimmed string, indexed | Functional module grouping |
| `action` | `String` | Yes | — | Enum: `['CREATE', 'READ', 'UPDATE', 'DELETE', 'MANAGE']` | Action verb |
| `description` | `String` | Yes | — | Trimmed string | Permission purpose description |
| `isActive` | `Boolean` | No | `true` | Boolean | Active status flag |
| `createdAt` | `Date` | Auto | `Date.now` | System-managed timestamp | Auto-generated by Mongoose `timestamps: true` |
| `updatedAt` | `Date` | Auto | `Date.now` | System-managed timestamp | Auto-generated by Mongoose `timestamps: true` |

### Database Indexes
1. `{ _id: 1 }` (Primary Key)
2. `{ name: 1 }` (`unique: true`)
3. `{ module: 1 }` (Standard index)

---

## 10. Finalized Collection: `user_sessions` (Model: `UserSession`)

**Status**: `FINAL` — **STRICT DATABASE SCHEMA FREEZE ENFORCED**  
*No fields, types, defaults, validation rules, or indexes may be modified without explicit written architectural approval, implementation, testing, and documentation updates.*

### Collection Metadata
* **MongoDB Collection Name**: `user_sessions`
* **Mongoose Model Name**: `UserSession`
* **File Path**: `backend/src/models/user-session.model.js`
* **Version Key**: Explicitly disabled (`versionKey: false`)

### Approved Field Definitions

| Field Name | Data Type | Required | Default | Validation & Enums | Notes |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `_id` | `ObjectId` | Auto | Auto | Primary Key | 24-character hexadecimal ObjectId |
| `userId` | `ObjectId` | Yes | — | Ref `User`, indexed | Linked user account |
| `sessionTokenHash` | `String` | Yes | — | 64-hex lowercase SHA-256 digest (`select: false`) | Hashed bearer session token |
| `loginAt` | `Date` | Yes | — | Date timestamp | Session creation timestamp |
| `lastActivityAt` | `Date` | Yes | — | Date timestamp | Updated upon session access |
| `expiresAt` | `Date` | Yes | — | Must be greater than `loginAt` | TTL indexed field for automatic expiry |
| `logoutAt` | `Date` | No | — | Date timestamp | Explicit logout timestamp |
| `ipAddress` | `String` | No | — | Trimmed string | Client IP address |
| `userAgent` | `String` | No | — | Trimmed string | Client browser / device string |
| `isActive` | `Boolean` | No | `true` | Boolean | Session validity toggle |

### Database Indexes
1. `{ _id: 1 }` (Primary Key)
2. `{ userId: 1 }` (Standard index)
3. `{ sessionTokenHash: 1 }` (`unique: true`)
4. `{ expiresAt: 1 }` (`expireAfterSeconds: 0`, TTL auto-purge)

---

## 11. Canonical Dynamic RBAC Permissions (44 Total)

| Permission ID | Module | Action | Default Assigned Roles |
| :--- | :--- | :---: | :--- |
| `AUTH_READ_SELF` | Auth | `READ` | All active authenticated users |
| `USER_CREATE` | User Management | `CREATE` | `ROLE_SUPER_ADMIN`, `ROLE_PLACEMENT_HEAD` |
| `USER_READ` | User Management | `READ` | `ROLE_SUPER_ADMIN`, `ROLE_PLACEMENT_HEAD`, `ROLE_PLACEMENT_COORDINATOR` |
| `USER_UPDATE` | User Management | `UPDATE` | `ROLE_SUPER_ADMIN`, `ROLE_PLACEMENT_HEAD` |
| `USER_DELETE` | User Management | `DELETE` | `ROLE_SUPER_ADMIN` |
| `USER_MANAGE` | User Management | `MANAGE` | `ROLE_SUPER_ADMIN` |
| `USER_ASSIGN_ROLE` | User Management | `MANAGE` | `ROLE_SUPER_ADMIN` |
| `USER_MANAGE_STATUS` | User Management | `MANAGE` | `ROLE_SUPER_ADMIN` |
| `USER_LOCK` | User Management | `MANAGE` | `ROLE_SUPER_ADMIN` |
| `USER_UNLOCK` | User Management | `MANAGE` | `ROLE_SUPER_ADMIN` |
| `ROLE_CREATE` | Role Management | `CREATE` | `ROLE_SUPER_ADMIN` |
| `ROLE_READ` | Role Management | `READ` | `ROLE_SUPER_ADMIN`, `ROLE_PLACEMENT_HEAD`, `ROLE_PLACEMENT_COORDINATOR` |
| `ROLE_UPDATE` | Role Management | `UPDATE` | `ROLE_SUPER_ADMIN` |
| `ROLE_DELETE` | Role Management | `DELETE` | `ROLE_SUPER_ADMIN` |
| `ROLE_MANAGE` | Role Management | `MANAGE` | `ROLE_SUPER_ADMIN` |
| `ROLE_ASSIGN_PERMISSION` | Role Management | `MANAGE` | `ROLE_SUPER_ADMIN` |
| `ROLE_MANAGE_STATUS` | Role Management | `MANAGE` | `ROLE_SUPER_ADMIN` |
| `PERMISSION_CREATE` | Permission Management | `CREATE` | `ROLE_SUPER_ADMIN` |
| `PERMISSION_READ` | Permission Management | `READ` | `ROLE_SUPER_ADMIN` |
| `PERMISSION_UPDATE` | Permission Management | `UPDATE` | `ROLE_SUPER_ADMIN` |
| `PERMISSION_DELETE` | Permission Management | `DELETE` | `ROLE_SUPER_ADMIN` |
| `PERMISSION_MANAGE` | Permission Management | `MANAGE` | `ROLE_SUPER_ADMIN` |
| `PERMISSION_MANAGE_STATUS` | Permission Management | `MANAGE` | `ROLE_SUPER_ADMIN` |
| `SESSION_READ` | Session Management | `READ` | `ROLE_SUPER_ADMIN` |
| `STUDENT_IMPORT` | Data Import | `CREATE` | `ROLE_SUPER_ADMIN`, `ROLE_PLACEMENT_HEAD`, `ROLE_PLACEMENT_COORDINATOR` |
| `COMPANY_IMPORT` | Data Import | `CREATE` | `ROLE_SUPER_ADMIN`, `ROLE_PLACEMENT_HEAD`, `ROLE_PLACEMENT_COORDINATOR` |
| `PLACEMENT_USER_IMPORT` | Data Import | `CREATE` | `ROLE_SUPER_ADMIN`, `ROLE_PLACEMENT_HEAD` |
| `STUDENT_CREATE` | Student Management | `CREATE` | `ROLE_SUPER_ADMIN`, `ROLE_PLACEMENT_HEAD`, `ROLE_PLACEMENT_COORDINATOR` |
| `STUDENT_READ` | Student Management | `READ` | `ROLE_SUPER_ADMIN`, `ROLE_PLACEMENT_HEAD`, `ROLE_PLACEMENT_COORDINATOR`, `ROLE_COMPANY` |
| `STUDENT_UPDATE` | Student Management | `UPDATE` | `ROLE_SUPER_ADMIN`, `ROLE_PLACEMENT_HEAD`, `ROLE_PLACEMENT_COORDINATOR` |
| `STUDENT_DELETE` | Student Management | `DELETE` | `ROLE_SUPER_ADMIN`, `ROLE_PLACEMENT_HEAD` |
| `STUDENT_PROFILE_READ` | Student Self | `READ` | `ROLE_STUDENT` |
| `STUDENT_PROFILE_UPDATE` | Student Self | `UPDATE` | `ROLE_STUDENT` |
| `STUDENT_PROFILE_PUBLIC_READ` | Student Public | `READ` | `ROLE_STUDENT`, `ROLE_COMPANY`, `ROLE_PLACEMENT_COORDINATOR`, `ROLE_PLACEMENT_HEAD` |
| `DEPARTMENT_CREATE` | Department Management | `CREATE` | `ROLE_SUPER_ADMIN`, `ROLE_PLACEMENT_HEAD` |
| `DEPARTMENT_READ` | Department Management | `READ` | `ROLE_SUPER_ADMIN`, `ROLE_PLACEMENT_HEAD`, `ROLE_PLACEMENT_COORDINATOR` |
| `DEPARTMENT_UPDATE` | Department Management | `UPDATE` | `ROLE_SUPER_ADMIN`, `ROLE_PLACEMENT_HEAD` |
| `DEPARTMENT_DELETE` | Department Management | `DELETE` | `ROLE_SUPER_ADMIN`, `ROLE_PLACEMENT_HEAD` |
| `DEPARTMENT_MANAGE` | Department Management | `MANAGE` | `ROLE_SUPER_ADMIN`, `ROLE_PLACEMENT_HEAD` |
| `COURSE_CREATE` | Course Management | `CREATE` | `ROLE_SUPER_ADMIN`, `ROLE_PLACEMENT_HEAD` |
| `COURSE_READ` | Course Management | `READ` | `ROLE_SUPER_ADMIN`, `ROLE_PLACEMENT_HEAD`, `ROLE_PLACEMENT_COORDINATOR` |
| `COURSE_UPDATE` | Course Management | `UPDATE` | `ROLE_SUPER_ADMIN`, `ROLE_PLACEMENT_HEAD` |
| `COURSE_DELETE` | Course Management | `DELETE` | `ROLE_SUPER_ADMIN`, `ROLE_PLACEMENT_HEAD` |
| `COURSE_MANAGE` | Course Management | `MANAGE` | `ROLE_SUPER_ADMIN`, `ROLE_PLACEMENT_HEAD` |

---

## 12. API Specification

| Endpoint | Method | Required Permission | Description |
| :--- | :---: | :--- | :--- |
| `/api/departments` | `GET` | `DEPARTMENT_READ` | List and search departments |
| `/api/departments/:id` | `GET` | `DEPARTMENT_READ` | Retrieve single department by ObjectId |
| `/api/departments` | `POST` | `DEPARTMENT_CREATE` | Create new department |
| `/api/departments/:id` | `PATCH` | `DEPARTMENT_UPDATE` | Edit department details |
| `/api/departments/:id/status` | `PATCH` | `DEPARTMENT_UPDATE` | Activate or deactivate department |
| `/api/courses` | `GET` | `COURSE_READ` | List & search courses (supports `departmentId`, `level`, `isActive`, `search`) |
| `/api/courses/:id` | `GET` | `COURSE_READ` | Retrieve single course with populated department |
| `/api/courses` | `POST` | `COURSE_CREATE` | Create new course (verifies active department) |
| `/api/courses/:id` | `PATCH` | `COURSE_UPDATE` | Edit course details (verifies active department if reassigned) |
| `/api/courses/:id/status` | `PATCH` | `COURSE_UPDATE` | Activate or deactivate course (`isActive: true/false`) |
