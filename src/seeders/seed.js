import { fileURLToPath } from 'node:url';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { ALL_PERMISSION_IDS, PERMISSION_IDS, ROLE_IDS } from '../utils/access-constants.js';
import { Permission } from '../models/permission.model.js';
import { Role } from '../models/role.model.js';
import { User } from '../models/user.model.js';
import { UserSession } from '../models/user-session.model.js';
import { assertStrongPassword, hashPassword } from '../utils/password.js';

const initialPermissions = [
  { _id: PERMISSION_IDS.AUTH_READ_SELF, name: 'View own account', module: 'Authentication', action: 'READ', description: 'Allows a user to view their authenticated account and effective access.' },
  { _id: PERMISSION_IDS.USER_READ, name: 'View users', module: 'User Management', action: 'READ', description: 'Allows viewing user accounts.' },
  { _id: PERMISSION_IDS.USER_MANAGE_STATUS, name: 'Manage user status', module: 'User Management', action: 'MANAGE', description: 'Allows activating and deactivating user accounts.' },
  { _id: PERMISSION_IDS.USER_LOCK, name: 'Lock user accounts', module: 'User Management', action: 'MANAGE', description: 'Allows temporarily locking user accounts.' },
  { _id: PERMISSION_IDS.USER_UNLOCK, name: 'Unlock user accounts', module: 'User Management', action: 'MANAGE', description: 'Allows unlocking user accounts.' },
  { _id: PERMISSION_IDS.USER_ASSIGN_ROLE, name: 'Assign user roles', module: 'User Management', action: 'MANAGE', description: 'Allows changing a user role.' },
  { _id: PERMISSION_IDS.ROLE_READ, name: 'View roles', module: 'Role Management', action: 'READ', description: 'Allows viewing roles and permission assignments.' },
  { _id: PERMISSION_IDS.ROLE_CREATE, name: 'Create roles', module: 'Role Management', action: 'CREATE', description: 'Allows creating roles.' },
  { _id: PERMISSION_IDS.ROLE_UPDATE, name: 'Update roles', module: 'Role Management', action: 'UPDATE', description: 'Allows updating role details.' },
  { _id: PERMISSION_IDS.ROLE_MANAGE_STATUS, name: 'Manage role status', module: 'Role Management', action: 'MANAGE', description: 'Allows activating and deactivating roles.' },
  { _id: PERMISSION_IDS.ROLE_ASSIGN_PERMISSION, name: 'Assign role permissions', module: 'Role Management', action: 'MANAGE', description: 'Allows assigning and removing permissions on roles.' },
  { _id: PERMISSION_IDS.PERMISSION_READ, name: 'View permissions', module: 'Permission Management', action: 'READ', description: 'Allows viewing permissions.' },
  { _id: PERMISSION_IDS.PERMISSION_CREATE, name: 'Create permissions', module: 'Permission Management', action: 'CREATE', description: 'Allows creating permissions.' },
  { _id: PERMISSION_IDS.PERMISSION_UPDATE, name: 'Update permissions', module: 'Permission Management', action: 'UPDATE', description: 'Allows updating permissions.' },
  { _id: PERMISSION_IDS.PERMISSION_MANAGE_STATUS, name: 'Manage permission status', module: 'Permission Management', action: 'MANAGE', description: 'Allows activating and deactivating permissions.' },
  { _id: PERMISSION_IDS.SESSION_READ, name: 'View login activity', module: 'Session Management', action: 'READ', description: 'Allows viewing login and session activity.' }
];

const initialRoles = [
  { _id: ROLE_IDS.STUDENT, name: 'Student', description: 'University student account.', permissionIds: [PERMISSION_IDS.AUTH_READ_SELF] },
  { _id: ROLE_IDS.COMPANY, name: 'Company Recruiter', description: 'Company recruiter account.', permissionIds: [PERMISSION_IDS.AUTH_READ_SELF] },
  { _id: ROLE_IDS.PLACEMENT_COORDINATOR, name: 'Placement Coordinator', description: 'Placement cell coordinator account.', permissionIds: [PERMISSION_IDS.AUTH_READ_SELF] },
  { _id: ROLE_IDS.PLACEMENT_HEAD, name: 'Placement Head', description: 'Placement cell head account.', permissionIds: [PERMISSION_IDS.AUTH_READ_SELF] },
  { _id: ROLE_IDS.SUPER_ADMIN, name: 'Super Admin', description: 'System administrator with all Module 1 permissions.', permissionIds: ALL_PERMISSION_IDS }
];

export async function seedInitialData() {
  await Promise.all([Permission.createIndexes(), Role.createIndexes(), User.createIndexes(), UserSession.createIndexes()]);
  for (const permission of initialPermissions) {
    await Permission.updateOne({ _id: permission._id }, { $setOnInsert: permission }, { upsert: true });
  }
  for (const role of initialRoles) {
    await Role.updateOne({ _id: role._id }, { $setOnInsert: role }, { upsert: true });
  }
  // Preserve any administrator customizations while making newly introduced Module 1 permissions
  // available to the system role on repeatable seeds.
  await Role.updateOne({ _id: ROLE_IDS.SUPER_ADMIN }, { $addToSet: { permissionIds: { $each: ALL_PERMISSION_IDS } } });

  const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SUPER_ADMIN_PASSWORD;
  const employeeId = process.env.SUPER_ADMIN_EMPLOYEE_ID?.trim();
  const configuredValues = [email, password, employeeId].filter(Boolean).length;
  if (configuredValues !== 0 && configuredValues !== 3) {
    throw new Error('Set SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD, and SUPER_ADMIN_EMPLOYEE_ID together, or omit all three.');
  }
  if (configuredValues === 3) {
    assertStrongPassword(password);
    const existing = await User.exists({ email });
    if (!existing) {
      await User.create({
        email,
        passwordHash: await hashPassword(password),
        userType: 'PLACEMENT',
        employeeId,
        roleId: ROLE_IDS.SUPER_ADMIN,
        accountStatus: 'ACTIVE',
        isEmailVerified: true
      });
      console.info('Created initial Super Admin account.');
    } else {
      console.info('Initial Super Admin email already exists; it was not changed.');
    }
  } else {
    console.info('Roles and permissions seeded. Super Admin was not created because its environment variables were not supplied.');
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
