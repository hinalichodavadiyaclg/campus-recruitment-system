import { fileURLToPath } from 'node:url';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { ALL_PERMISSION_IDS, PERMISSION_IDS, ROLE_IDS } from '../utils/access-constants.js';
import { Permission } from '../models/permission.model.js';
import { Role } from '../models/role.model.js';
import { User } from '../models/user.model.js';
import { UserSession } from '../models/user-session.model.js';
import { Student } from '../models/student.model.js';
import { Company } from '../models/company.model.js';
import { PlacementOfficer } from '../models/placement_officer.model.js';
import { Department } from '../models/department.model.js';
import { Course } from '../models/course.model.js';
import { Job } from '../models/job.model.js';
import { Application } from '../models/application.model.js';
import { assertStrongPassword, hashPassword } from '../utils/password.js';
import { migrateLegacyPermissions } from '../utils/permission-migration.js';

const initialPermissions = [
  // Authentication
  { _id: PERMISSION_IDS.AUTH_READ_SELF, name: 'View own account', module: 'Authentication', action: 'READ', description: 'Allows a user to view their authenticated account and effective access.' },

  // User Management
  { _id: PERMISSION_IDS.USER_CREATE, name: 'Create users', module: 'User Management', action: 'CREATE', description: 'Allows creating new user accounts.' },
  { _id: PERMISSION_IDS.USER_READ, name: 'View users', module: 'User Management', action: 'READ', description: 'Allows viewing user accounts.' },
  { _id: PERMISSION_IDS.USER_UPDATE, name: 'Update users', module: 'User Management', action: 'UPDATE', description: 'Allows updating user account details.' },
  { _id: PERMISSION_IDS.USER_DELETE, name: 'Delete users', module: 'User Management', action: 'DELETE', description: 'Allows deleting user accounts.' },
  { _id: PERMISSION_IDS.USER_MANAGE, name: 'Full user management', module: 'User Management', action: 'MANAGE', description: 'Allows full management of user accounts.' },
  { _id: PERMISSION_IDS.USER_ASSIGN_ROLE, name: 'Assign user roles', module: 'User Management', action: 'MANAGE', description: 'Allows changing a user role.' },
  { _id: PERMISSION_IDS.USER_MANAGE_STATUS, name: 'Manage user status', module: 'User Management', action: 'MANAGE', description: 'Allows activating and deactivating user accounts.' },
  { _id: PERMISSION_IDS.USER_LOCK, name: 'Lock user accounts', module: 'User Management', action: 'MANAGE', description: 'Allows temporarily locking user accounts.' },
  { _id: PERMISSION_IDS.USER_UNLOCK, name: 'Unlock user accounts', module: 'User Management', action: 'MANAGE', description: 'Allows unlocking user accounts.' },

  // Role Management
  { _id: PERMISSION_IDS.ROLE_CREATE, name: 'Create roles', module: 'Role Management', action: 'CREATE', description: 'Allows creating roles.' },
  { _id: PERMISSION_IDS.ROLE_READ, name: 'View roles', module: 'Role Management', action: 'READ', description: 'Allows viewing roles and permission assignments.' },
  { _id: PERMISSION_IDS.ROLE_UPDATE, name: 'Update roles', module: 'Role Management', action: 'UPDATE', description: 'Allows updating role details.' },
  { _id: PERMISSION_IDS.ROLE_DELETE, name: 'Delete roles', module: 'Role Management', action: 'DELETE', description: 'Allows deleting roles.' },
  { _id: PERMISSION_IDS.ROLE_MANAGE, name: 'Full role management', module: 'Role Management', action: 'MANAGE', description: 'Allows full management of roles.' },
  { _id: PERMISSION_IDS.ROLE_ASSIGN_PERMISSION, name: 'Assign role permissions', module: 'Role Management', action: 'MANAGE', description: 'Allows assigning and removing permissions on roles.' },
  { _id: PERMISSION_IDS.ROLE_MANAGE_STATUS, name: 'Manage role status', module: 'Role Management', action: 'MANAGE', description: 'Allows activating and deactivating roles.' },

  // Permission Management
  { _id: PERMISSION_IDS.PERMISSION_CREATE, name: 'Create permissions', module: 'Permission Management', action: 'CREATE', description: 'Allows creating permissions.' },
  { _id: PERMISSION_IDS.PERMISSION_READ, name: 'View permissions', module: 'Permission Management', action: 'READ', description: 'Allows viewing permissions.' },
  { _id: PERMISSION_IDS.PERMISSION_UPDATE, name: 'Update permissions', module: 'Permission Management', action: 'UPDATE', description: 'Allows updating permissions.' },
  { _id: PERMISSION_IDS.PERMISSION_DELETE, name: 'Delete permissions', module: 'Permission Management', action: 'DELETE', description: 'Allows deleting permissions.' },
  { _id: PERMISSION_IDS.PERMISSION_MANAGE, name: 'Full permission management', module: 'Permission Management', action: 'MANAGE', description: 'Allows full management of permissions.' },
  { _id: PERMISSION_IDS.PERMISSION_MANAGE_STATUS, name: 'Manage permission status', module: 'Permission Management', action: 'MANAGE', description: 'Allows activating and deactivating permissions.' },

  // Session Management
  { _id: PERMISSION_IDS.SESSION_READ, name: 'View login activity', module: 'Session Management', action: 'READ', description: 'Allows viewing login and session activity.' },

  // Excel Import Operations
  { _id: PERMISSION_IDS.STUDENT_IMPORT, name: 'Import students', module: 'Data Import', action: 'CREATE', description: 'Allows importing student records from Excel/CSV files.' },
  { _id: PERMISSION_IDS.COMPANY_IMPORT, name: 'Import companies', module: 'Data Import', action: 'CREATE', description: 'Allows importing company records from Excel/CSV files.' },
  { _id: PERMISSION_IDS.PLACEMENT_USER_IMPORT, name: 'Import placement cell users', module: 'Data Import', action: 'CREATE', description: 'Allows importing placement cell accounts from Excel/CSV files.' },

  // Student Profile & Management
  { _id: PERMISSION_IDS.STUDENT_CREATE, name: 'Create student profiles', module: 'Student Management', action: 'CREATE', description: 'Allows creating student domain profiles.' },
  { _id: PERMISSION_IDS.STUDENT_READ, name: 'View student profiles', module: 'Student Management', action: 'READ', description: 'Allows viewing student domain profiles.' },
  { _id: PERMISSION_IDS.STUDENT_UPDATE, name: 'Update student profiles', module: 'Student Management', action: 'UPDATE', description: 'Allows updating student domain profiles.' },
  { _id: PERMISSION_IDS.STUDENT_DELETE, name: 'Delete student profiles', module: 'Student Management', action: 'DELETE', description: 'Allows deleting student domain profiles.' },
  { _id: PERMISSION_IDS.STUDENT_PROFILE_READ, name: 'Read student profile details', module: 'Student Management', action: 'READ', description: 'Allows reading full student profile, resume, certificates, projects, internships, and achievements.' },
  { _id: PERMISSION_IDS.STUDENT_PROFILE_UPDATE, name: 'Update student profile details', module: 'Student Management', action: 'UPDATE', description: 'Allows updating personal profile, bio, skills, resume, certificates, projects, internships, and achievements.' },
  { _id: PERMISSION_IDS.STUDENT_PROFILE_PUBLIC_READ, name: 'Read public student profiles', module: 'Student Management', action: 'READ', description: 'Allows reading public shareable student profiles.' },

  // Department Management
  { _id: PERMISSION_IDS.DEPARTMENT_CREATE, name: 'Create departments', module: 'Department Management', action: 'CREATE', description: 'Allows creating academic departments.' },
  { _id: PERMISSION_IDS.DEPARTMENT_READ, name: 'View departments', module: 'Department Management', action: 'READ', description: 'Allows viewing academic departments.' },
  { _id: PERMISSION_IDS.DEPARTMENT_UPDATE, name: 'Update departments', module: 'Department Management', action: 'UPDATE', description: 'Allows updating department details and active status.' },
  { _id: PERMISSION_IDS.DEPARTMENT_DELETE, name: 'Delete departments', module: 'Department Management', action: 'DELETE', description: 'Allows managing department deactivation.' },
  { _id: PERMISSION_IDS.DEPARTMENT_MANAGE, name: 'Full department management', module: 'Department Management', action: 'MANAGE', description: 'Allows full management of academic departments.' },

  // Course Management
  { _id: PERMISSION_IDS.COURSE_CREATE, name: 'Create courses', module: 'Course Management', action: 'CREATE', description: 'Allows creating academic courses.' },
  { _id: PERMISSION_IDS.COURSE_READ, name: 'View courses', module: 'Course Management', action: 'READ', description: 'Allows viewing academic courses.' },
  { _id: PERMISSION_IDS.COURSE_UPDATE, name: 'Update courses', module: 'Course Management', action: 'UPDATE', description: 'Allows updating course details and active status.' },
  { _id: PERMISSION_IDS.COURSE_DELETE, name: 'Delete courses', module: 'Course Management', action: 'DELETE', description: 'Allows managing course deactivation.' },
  { _id: PERMISSION_IDS.COURSE_MANAGE, name: 'Full course management', module: 'Course Management', action: 'MANAGE', description: 'Allows full management of academic courses.' },

  // Job Management
  { _id: PERMISSION_IDS.JOB_CREATE, name: 'Create job postings', module: 'Job Management', action: 'CREATE', description: 'Allows creating new job postings.' },
  { _id: PERMISSION_IDS.JOB_READ, name: 'View job postings', module: 'Job Management', action: 'READ', description: 'Allows viewing published job postings and details.' },
  { _id: PERMISSION_IDS.JOB_UPDATE, name: 'Update job postings', module: 'Job Management', action: 'UPDATE', description: 'Allows editing, pausing, closing, and reopening job postings.' },
  { _id: PERMISSION_IDS.JOB_DELETE, name: 'Delete job postings', module: 'Job Management', action: 'DELETE', description: 'Allows deleting unapplied job postings.' },
  { _id: PERMISSION_IDS.JOB_MANAGE, name: 'Full job management', module: 'Job Management', action: 'MANAGE', description: 'Allows Placement Cell oversight, suspension, and auditing across all job postings.' },

  // Application Management
  { _id: PERMISSION_IDS.APPLICATION_CREATE, name: 'Submit job applications', module: 'Application Management', action: 'CREATE', description: 'Allows eligible students to apply for jobs and withdraw applications.' },
  { _id: PERMISSION_IDS.APPLICATION_READ, name: 'View job applications', module: 'Application Management', action: 'READ', description: 'Allows viewing job applications and applicant details.' },
  { _id: PERMISSION_IDS.APPLICATION_UPDATE, name: 'Update application status', module: 'Application Management', action: 'UPDATE', description: 'Allows advancing applicant stages (shortlist, interview, selection, rejection).' },
  { _id: PERMISSION_IDS.APPLICATION_MANAGE, name: 'Full application management', module: 'Application Management', action: 'MANAGE', description: 'Allows Placement Cell oversight, auditing, and override across all job applications.' }
];

const initialRoles = [
  {
    _id: ROLE_IDS.STUDENT,
    name: 'Student',
    description: 'University student account.',
    permissionIds: [
      PERMISSION_IDS.AUTH_READ_SELF,
      PERMISSION_IDS.STUDENT_PROFILE_READ,
      PERMISSION_IDS.STUDENT_PROFILE_UPDATE,
      PERMISSION_IDS.STUDENT_PROFILE_PUBLIC_READ,
      PERMISSION_IDS.JOB_READ,
      PERMISSION_IDS.APPLICATION_CREATE,
      PERMISSION_IDS.APPLICATION_READ
    ]
  },
  {
    _id: ROLE_IDS.COMPANY,
    name: 'Company Recruiter',
    description: 'Company recruiter account.',
    permissionIds: [
      PERMISSION_IDS.AUTH_READ_SELF,
      PERMISSION_IDS.STUDENT_READ,
      PERMISSION_IDS.STUDENT_PROFILE_PUBLIC_READ,
      PERMISSION_IDS.JOB_CREATE,
      PERMISSION_IDS.JOB_READ,
      PERMISSION_IDS.JOB_UPDATE,
      PERMISSION_IDS.APPLICATION_READ,
      PERMISSION_IDS.APPLICATION_UPDATE
    ]
  },
  {
    _id: ROLE_IDS.PLACEMENT_COORDINATOR,
    name: 'Placement Coordinator',
    description: 'Placement cell coordinator account with data import and review access.',
    permissionIds: [
      PERMISSION_IDS.AUTH_READ_SELF,
      PERMISSION_IDS.USER_READ,
      PERMISSION_IDS.ROLE_READ,
      PERMISSION_IDS.STUDENT_IMPORT,
      PERMISSION_IDS.COMPANY_IMPORT,
      PERMISSION_IDS.STUDENT_CREATE,
      PERMISSION_IDS.STUDENT_READ,
      PERMISSION_IDS.STUDENT_UPDATE,
      PERMISSION_IDS.STUDENT_PROFILE_PUBLIC_READ,
      PERMISSION_IDS.DEPARTMENT_READ,
      PERMISSION_IDS.COURSE_READ,
      PERMISSION_IDS.JOB_READ,
      PERMISSION_IDS.APPLICATION_READ
    ]
  },
  {
    _id: ROLE_IDS.PLACEMENT_HEAD,
    name: 'Placement Head',
    description: 'Placement cell head account with broad student/company and user management access.',
    permissionIds: [
      PERMISSION_IDS.AUTH_READ_SELF,
      PERMISSION_IDS.USER_CREATE,
      PERMISSION_IDS.USER_READ,
      PERMISSION_IDS.USER_UPDATE,
      PERMISSION_IDS.ROLE_READ,
      PERMISSION_IDS.STUDENT_IMPORT,
      PERMISSION_IDS.COMPANY_IMPORT,
      PERMISSION_IDS.PLACEMENT_USER_IMPORT,
      PERMISSION_IDS.STUDENT_CREATE,
      PERMISSION_IDS.STUDENT_READ,
      PERMISSION_IDS.STUDENT_UPDATE,
      PERMISSION_IDS.STUDENT_DELETE,
      PERMISSION_IDS.STUDENT_PROFILE_PUBLIC_READ,
      PERMISSION_IDS.DEPARTMENT_CREATE,
      PERMISSION_IDS.DEPARTMENT_READ,
      PERMISSION_IDS.DEPARTMENT_UPDATE,
      PERMISSION_IDS.DEPARTMENT_DELETE,
      PERMISSION_IDS.DEPARTMENT_MANAGE,
      PERMISSION_IDS.COURSE_CREATE,
      PERMISSION_IDS.COURSE_READ,
      PERMISSION_IDS.COURSE_UPDATE,
      PERMISSION_IDS.COURSE_DELETE,
      PERMISSION_IDS.COURSE_MANAGE,
      PERMISSION_IDS.JOB_CREATE,
      PERMISSION_IDS.JOB_READ,
      PERMISSION_IDS.JOB_UPDATE,
      PERMISSION_IDS.JOB_DELETE,
      PERMISSION_IDS.JOB_MANAGE,
      PERMISSION_IDS.APPLICATION_READ,
      PERMISSION_IDS.APPLICATION_UPDATE,
      PERMISSION_IDS.APPLICATION_MANAGE
    ]
  },
  {
    _id: ROLE_IDS.SUPER_ADMIN,
    name: 'Super Admin',
    description: 'System administrator with all permissions and data import capabilities.',
    permissionIds: ALL_PERMISSION_IDS
  }
];

export async function seedInitialData() {
  await Promise.all([
    Permission.createIndexes(),
    Role.createIndexes(),
    User.createIndexes(),
    UserSession.createIndexes(),
    Student.createIndexes(),
    Company.createIndexes(),
    PlacementOfficer.createIndexes(),
    Department.createIndexes(),
    Course.createIndexes(),
    Job.createIndexes(),
    Application.createIndexes()
  ]);

  // Clean up any legacy non-canonical permissions
  await migrateLegacyPermissions();

  for (const permission of initialPermissions) {
    await Permission.updateOne({ _id: permission._id }, { $set: permission }, { upsert: true });
  }

  // Idempotently ensure default roles exist and synchronize approved permissions
  for (const role of initialRoles) {
    await Role.updateOne(
      { _id: role._id },
      {
        $setOnInsert: {
          name: role.name,
          description: role.description,
          isActive: true
        },
        $addToSet: {
          permissionIds: { $each: role.permissionIds }
        }
      },
      { upsert: true }
    );
  }

  // Remove misassigned STUDENT_PROFILE_READ from non-student roles to preserve documented least privilege
  await Role.updateMany(
    {
      _id: {
        $in: [
          ROLE_IDS.COMPANY,
          ROLE_IDS.PLACEMENT_COORDINATOR,
          ROLE_IDS.PLACEMENT_HEAD
        ]
      }
    },
    {
      $pull: {
        permissionIds: PERMISSION_IDS.STUDENT_PROFILE_READ
      }
    }
  );

  const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SUPER_ADMIN_PASSWORD;
  const employeeId = process.env.SUPER_ADMIN_EMPLOYEE_ID?.trim();
  const configuredValues = [email, password, employeeId].filter(Boolean).length;
  if (configuredValues !== 0 && configuredValues !== 3) {
    throw new Error('Set SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD, and SUPER_ADMIN_EMPLOYEE_ID together, or omit all three.');
  }
  if (configuredValues === 3) {
    assertStrongPassword(password);
    let user = await User.findOne({ $or: [{ email }, { employeeId }] });
    if (!user) {
      await User.create({
        email,
        passwordHash: await hashPassword(password),
        userType: 'PLACEMENT',
        employeeId,
        roleId: ROLE_IDS.SUPER_ADMIN,
        accountStatus: 'ACTIVE'
      });
      console.info('Created initial Super Admin account.');
    } else {
      user.email = email;
      user.passwordHash = await hashPassword(password);
      user.employeeId = employeeId;
      user.roleId = ROLE_IDS.SUPER_ADMIN;
      user.accountStatus = 'ACTIVE';
      user.failedLoginAttempts = 0;
      user.lockedUntil = undefined;
      await user.save();
      console.info('Updated initial Super Admin account credentials.');
    }
  } else {
    console.info('Roles and permissions seeded. Super Admin was not created because its environment variables were not supplied.');
  }

  // Ensure placement officer accounts are synchronized with active status and default credentials
  const defaultPlacementPassword = process.env.DEFAULT_PLACEMENT_PASSWORD || 'Placement@123456';
  assertStrongPassword(defaultPlacementPassword);
  const placementPasswordHash = await hashPassword(defaultPlacementPassword);
  const placementUpdateResult = await User.updateMany(
    { userType: 'PLACEMENT', roleId: { $ne: ROLE_IDS.SUPER_ADMIN } },
    {
      $set: {
        passwordHash: placementPasswordHash,
        accountStatus: 'ACTIVE',
        failedLoginAttempts: 0
      },
      $unset: {
        lockedUntil: 1
      }
    }
  );
  if (placementUpdateResult.modifiedCount > 0) {
    console.info(`Synchronized ${placementUpdateResult.modifiedCount} Placement account(s) with default credentials.`);
  }
}

async function run() {
  await connectDatabase();
  await seedInitialData();
  await disconnectDatabase();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch(async (error) => {
    console.error('Seeding failed.', error);
    await disconnectDatabase();
    process.exitCode = 1;
  });
}
