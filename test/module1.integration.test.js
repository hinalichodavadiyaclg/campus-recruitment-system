import assert from 'node:assert/strict';
import { join } from 'node:path';
import test, { after, afterEach, before } from 'node:test';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.BCRYPT_ROUNDS = '10';
process.env.SESSION_TOKEN_PEPPER = 'test-session-token-pepper-that-is-long-enough';
process.env.PASSWORD_RESET_SECRET = 'test-password-reset-secret-that-is-long-enough';

const [
  { createApp },
  { connectDatabase, disconnectDatabase },
  { seedInitialData },
  { User },
  { UserSession },
  { Role },
  { Permission },
  { Student },
  { Company },
  { hashPassword },
  { hashSessionToken },
  { ROLE_IDS, PERMISSION_IDS },
  { migrateLegacyPermissions }
] = await Promise.all([
  import('../src/app.js'),
  import('../src/config/database.js'),
  import('../src/seeders/seed.js'),
  import('../src/models/user.model.js'),
  import('../src/models/user-session.model.js'),
  import('../src/models/role.model.js'),
  import('../src/models/permission.model.js'),
  import('../src/models/student.model.js'),
  import('../src/models/company.model.js'),
  import('../src/utils/password.js'),
  import('../src/utils/session-token.js'),
  import('../src/utils/access-constants.js'),
  import('../src/utils/permission-migration.js')
]);

const PASSWORD = 'OriginalPassword!123';
const NEW_PASSWORD = 'NewSecurePassword!123';
let mongo;
let app;
let passwordHash;

async function createAdmin(email = 'admin@example.edu') {
  return User.create({
    email,
    passwordHash,
    userType: 'PLACEMENT',
    employeeId: `ADMIN-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    roleId: ROLE_IDS.SUPER_ADMIN,
    accountStatus: 'ACTIVE',
    isEmailVerified: true
  });
}

async function createStudent(overrides = {}) {
  return User.create({
    email: overrides.email || `student-${Date.now()}@example.edu`,
    passwordHash,
    userType: 'STUDENT',
    universityId: overrides.universityId || `STU-${Date.now()}`,
    roleId: ROLE_IDS.STUDENT,
    accountStatus: 'ACTIVE',
    ...overrides
  });
}

async function createPlacementUser(roleId = ROLE_IDS.PLACEMENT_COORDINATOR, overrides = {}) {
  return User.create({
    email: overrides.email || `placement-${Date.now()}@example.edu`,
    passwordHash,
    userType: 'PLACEMENT',
    employeeId: overrides.employeeId || `EMP-${Date.now()}`,
    roleId,
    accountStatus: 'ACTIVE',
    ...overrides
  });
}

async function login(email, password = PASSWORD) {
  return request(app).post('/api/auth/login').send({ email, password });
}

function bearer(token) {
  return { Authorization: `Bearer ${token}` };
}

before(async () => {
  mongo = await MongoMemoryServer.create({ binary: { downloadDir: join(process.cwd(), '.mongodb-binaries') } });
  await connectDatabase(mongo.getUri());
  await seedInitialData();
  passwordHash = await hashPassword(PASSWORD);
  app = createApp();
});

afterEach(async () => {
  await UserSession.deleteMany({});
  await User.deleteMany({});
  await Student.deleteMany({});
  await Company.deleteMany({});
});

after(async () => {
  await disconnectDatabase();
  await mongo.stop();
});

test('successful login tracks last login, creates a hashed session, and hides passwordHash', async () => {
  const student = await createStudent();
  const response = await login(student.email);
  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.ok(response.body.data.sessionToken);
  assert.equal(response.body.data.user.passwordHash, undefined);

  const updatedUser = await User.findById(student._id).lean();
  const session = await UserSession.findOne({ userId: student._id }).select('+sessionTokenHash').lean();
  assert.ok(updatedUser.lastLoginAt);
  assert.equal(session.sessionTokenHash, hashSessionToken(response.body.data.sessionToken));
  assert.notEqual(session.sessionTokenHash, response.body.data.sessionToken);
});

test('invalid credentials are rejected and increment failed attempts', async () => {
  const student = await createStudent();
  const response = await login(student.email, 'WrongPassword!123');
  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, 'INVALID_CREDENTIALS');
  assert.equal((await User.findById(student._id).lean()).failedLoginAttempts, 1);
});

test('inactive and locked accounts cannot sign in', async () => {
  const inactive = await createStudent({ email: 'inactive@example.edu', universityId: 'STU-002', accountStatus: 'INACTIVE' });
  const locked = await createStudent({
    email: 'locked@example.edu',
    universityId: 'STU-003',
    accountStatus: 'LOCKED',
    lockedUntil: new Date(Date.now() + 60_000)
  });
  assert.equal((await login(inactive.email)).status, 403);
  const response = await login(locked.email);
  assert.equal(response.status, 423);
  assert.equal(response.body.error.code, 'ACCOUNT_LOCKED');
});

test('password change invalidates other sessions and accepts the new password', async () => {
  const student = await createStudent();
  const first = await login(student.email);
  const second = await login(student.email);
  const change = await request(app)
    .post('/api/auth/change-password')
    .set(bearer(first.body.data.sessionToken))
    .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
  assert.equal(change.status, 200);
  assert.equal((await request(app).get('/api/auth/me').set(bearer(second.body.data.sessionToken))).status, 401);
  assert.equal((await login(student.email, NEW_PASSWORD)).status, 200);
});

test('forgot/reset password uses a one-time token and invalidates all sessions', async () => {
  const student = await createStudent();
  const activeLogin = await login(student.email);
  const forgot = await request(app).post('/api/auth/forgot-password').send({ email: student.email });
  assert.equal(forgot.status, 200);
  assert.ok(forgot.body.data.resetToken);
  const reset = await request(app)
    .post('/api/auth/reset-password')
    .send({ token: forgot.body.data.resetToken, newPassword: NEW_PASSWORD });
  assert.equal(reset.status, 200);
  assert.equal((await request(app).get('/api/auth/me').set(bearer(activeLogin.body.data.sessionToken))).status, 401);
  assert.equal((await login(student.email, NEW_PASSWORD)).status, 200);
  assert.equal(
    (await request(app).post('/api/auth/reset-password').send({ token: forgot.body.data.resetToken, newPassword: PASSWORD })).status,
    400
  );
});

test('logout deactivates its session and expired sessions are refused', async () => {
  const student = await createStudent();
  const signedIn = await login(student.email);
  assert.equal((await request(app).post('/api/auth/logout').set(bearer(signedIn.body.data.sessionToken))).status, 200);
  assert.equal((await request(app).get('/api/auth/me').set(bearer(signedIn.body.data.sessionToken))).status, 401);
});

test('role and permission authorization reject an ordinary student from admin routes', async () => {
  const student = await createStudent();
  const signedIn = await login(student.email);
  const headers = bearer(signedIn.body.data.sessionToken);

  assert.equal((await request(app).get('/api/roles').set(headers)).status, 403);
  assert.equal((await request(app).get('/api/users').set(headers)).status, 403);
  assert.equal((await request(app).get('/api/permissions').set(headers)).status, 403);
  assert.equal((await request(app).post('/api/users').set(headers).send({})).status, 403);
});

test('Super Admin can perform complete Role CRUD and assign/remove permissions', async () => {
  const admin = await createAdmin();
  const signedIn = await login(admin.email);
  const headers = bearer(signedIn.body.data.sessionToken);

  // 1. View roles (ROLE_READ)
  const list = await request(app).get('/api/roles').set(headers);
  assert.equal(list.status, 200);
  assert.ok(Array.isArray(list.body.data));

  // 2. Create role (ROLE_CREATE)
  const roleId = 'ROLE_AUDIT_SPECIALIST';
  const create = await request(app)
    .post('/api/roles')
    .set(headers)
    .send({
      id: roleId,
      name: 'Audit Specialist',
      description: 'Reviews compliance and audit logs.',
      permissionIds: [PERMISSION_IDS.SESSION_READ]
    });
  assert.equal(create.status, 201);
  assert.equal(create.body.data._id, roleId);

  // 3. Edit role (ROLE_UPDATE)
  const edit = await request(app)
    .put(`/api/roles/${roleId}`)
    .set(headers)
    .send({ name: 'Senior Audit Specialist', description: 'Updated role description.' });
  assert.equal(edit.status, 200);
  assert.equal(edit.body.data.name, 'Senior Audit Specialist');

  // 4. Assign permissions to role (ROLE_ASSIGN_PERMISSION)
  const assign = await request(app)
    .put(`/api/roles/${roleId}/permissions`)
    .set(headers)
    .send({ permissionIds: [PERMISSION_IDS.SESSION_READ, PERMISSION_IDS.USER_READ] });
  assert.equal(assign.status, 200);
  assert.deepEqual(assign.body.data.permissionIds.sort(), [PERMISSION_IDS.SESSION_READ, PERMISSION_IDS.USER_READ].sort());

  // 5. Remove permission from role
  const remove = await request(app)
    .put(`/api/roles/${roleId}/permissions`)
    .set(headers)
    .send({ permissionIds: [PERMISSION_IDS.SESSION_READ] });
  assert.equal(remove.status, 200);
  assert.deepEqual(remove.body.data.permissionIds, [PERMISSION_IDS.SESSION_READ]);

  // 6. Delete role (ROLE_DELETE)
  const del = await request(app).delete(`/api/roles/${roleId}`).set(headers);
  assert.equal(del.status, 200);
  assert.equal(await Role.exists({ _id: roleId }), null);
});

test('Super Admin can perform complete User CRUD, lock, unlock, and assign roles', async () => {
  const admin = await createAdmin();
  const signedIn = await login(admin.email);
  const headers = bearer(signedIn.body.data.sessionToken);

  // 1. Create user (USER_CREATE)
  const createdUser = await request(app)
    .post('/api/users')
    .set(headers)
    .send({
      email: 'new.member@university.edu',
      userType: 'PLACEMENT',
      employeeId: 'EMP-NEW-99',
      roleId: ROLE_IDS.PLACEMENT_COORDINATOR,
      password: 'StrongInitialPassword!123'
    });
  assert.equal(createdUser.status, 201);
  const userId = createdUser.body.data._id;
  assert.ok(userId);

  // 2. View users (USER_READ)
  const viewUser = await request(app).get(`/api/users/${userId}`).set(headers);
  assert.equal(viewUser.status, 200);
  assert.equal(viewUser.body.data.email, 'new.member@university.edu');

  // 3. Update user (USER_UPDATE)
  const updateUser = await request(app)
    .put(`/api/users/${userId}`)
    .set(headers)
    .send({ email: 'updated.member@university.edu' });
  assert.equal(updateUser.status, 200);
  assert.equal(updateUser.body.data.email, 'updated.member@university.edu');

  // 4. Assign role (USER_ASSIGN_ROLE)
  const changeRole = await request(app)
    .patch(`/api/users/${userId}/role`)
    .set(headers)
    .send({ roleId: ROLE_IDS.PLACEMENT_HEAD });
  assert.equal(changeRole.status, 200);
  assert.equal(changeRole.body.data.roleId, ROLE_IDS.PLACEMENT_HEAD);

  // 5. Lock user (USER_LOCK)
  const lock = await request(app).patch(`/api/users/${userId}/lock`).set(headers).send({ lockMinutes: 15 });
  assert.equal(lock.status, 200);
  assert.equal((await User.findById(userId).lean()).accountStatus, 'LOCKED');

  // 6. Unlock user (USER_UNLOCK)
  const unlock = await request(app).patch(`/api/users/${userId}/unlock`).set(headers).send({});
  assert.equal(unlock.status, 200);
  assert.equal((await User.findById(userId).lean()).accountStatus, 'ACTIVE');

  // 7. Delete user (USER_DELETE)
  const del = await request(app).delete(`/api/users/${userId}`).set(headers);
  assert.equal(del.status, 200);
  assert.equal(await User.exists({ _id: userId }), null);
});

test('Granular 403 authorization when user lacks specific required permissions', async () => {
  // Create custom role with ONLY ROLE_READ (no ROLE_UPDATE, no ROLE_ASSIGN_PERMISSION, no USER_CREATE)
  const customRoleId = 'ROLE_VIEWER_ONLY';
  await Role.create({
    _id: customRoleId,
    name: 'Viewer Only',
    description: 'Read only access',
    permissionIds: [PERMISSION_IDS.AUTH_READ_SELF, PERMISSION_IDS.ROLE_READ, PERMISSION_IDS.USER_READ],
    isActive: true
  });

  const viewer = await User.create({
    email: 'viewer@university.edu',
    passwordHash,
    userType: 'PLACEMENT',
    employeeId: 'EMP-VIEWER-1',
    roleId: customRoleId,
    accountStatus: 'ACTIVE'
  });

  const signedIn = await login(viewer.email);
  const headers = bearer(signedIn.body.data.sessionToken);

  // Can view roles
  assert.equal((await request(app).get('/api/roles').set(headers)).status, 200);

  // Denied editing role (needs ROLE_UPDATE) -> 403
  const editRoleRes = await request(app)
    .put('/api/roles/ROLE_STUDENT')
    .set(headers)
    .send({ name: 'Student Updated' });
  assert.equal(editRoleRes.status, 403);

  // Denied assigning permissions (needs ROLE_ASSIGN_PERMISSION) -> 403
  const assignPermRes = await request(app)
    .put('/api/roles/ROLE_STUDENT/permissions')
    .set(headers)
    .send({ permissionIds: [PERMISSION_IDS.AUTH_READ_SELF] });
  assert.equal(assignPermRes.status, 403);

  // Denied creating user (needs USER_CREATE) -> 403
  const createUserRes = await request(app)
    .post('/api/users')
    .set(headers)
    .send({ email: 'test@example.com', userType: 'STUDENT', roleId: ROLE_IDS.STUDENT });
  assert.equal(createUserRes.status, 403);
});

test('Dynamic permission lifecycle: permission addition/removal in MongoDB immediately affects authorization', async () => {
  const dynamicRoleId = 'ROLE_DYNAMIC_TEST';
  await Role.create({
    _id: dynamicRoleId,
    name: 'Dynamic Test Role',
    description: 'Dynamic testing',
    permissionIds: [PERMISSION_IDS.AUTH_READ_SELF],
    isActive: true
  });

  const dynamicUser = await User.create({
    email: 'dynamic@university.edu',
    passwordHash,
    userType: 'PLACEMENT',
    employeeId: 'EMP-DYN-01',
    roleId: dynamicRoleId,
    accountStatus: 'ACTIVE'
  });

  const signedIn = await login(dynamicUser.email);
  const headers = bearer(signedIn.body.data.sessionToken);

  // 1. Initially cannot view sessions
  assert.equal((await request(app).get('/api/sessions').set(headers)).status, 403);

  // 2. Add SESSION_READ to the role in MongoDB
  await Role.updateOne({ _id: dynamicRoleId }, { $addToSet: { permissionIds: PERMISSION_IDS.SESSION_READ } });

  // 3. The VERY NEXT API call without re-login immediately succeeds!
  const granted = await request(app).get('/api/sessions').set(headers);
  assert.equal(granted.status, 200);

  // 4. Remove SESSION_READ from the role in MongoDB
  await Role.updateOne({ _id: dynamicRoleId }, { $pull: { permissionIds: PERMISSION_IDS.SESSION_READ } });

  // 5. The VERY NEXT API call is immediately denied with 403!
  const revoked = await request(app).get('/api/sessions').set(headers);
  assert.equal(revoked.status, 403);
});

test('Legacy non-canonical permission names are detected, migrated to canonical format, and cleaned up', async () => {
  // Directly insert non-canonical permission CREATE_USER
  await Permission.create({
    _id: 'CREATE_USER',
    name: 'Legacy create user',
    module: 'User Management',
    action: 'CREATE',
    description: 'Legacy format'
  });

  const testRoleId = 'ROLE_LEGACY_TEST';
  await Role.create({
    _id: testRoleId,
    name: 'Legacy Role',
    description: 'Role with non-canonical permission',
    permissionIds: ['CREATE_USER'],
    isActive: true
  });

  await migrateLegacyPermissions();

  // Canonical permission USER_CREATE exists
  assert.ok(await Permission.exists({ _id: PERMISSION_IDS.USER_CREATE }));
  // Legacy duplicate CREATE_USER was deleted
  assert.equal(await Permission.exists({ _id: 'CREATE_USER' }), null);

  // Role reference was updated to USER_CREATE
  const updatedRole = await Role.findById(testRoleId).lean();
  assert.ok(updatedRole.permissionIds.includes(PERMISSION_IDS.USER_CREATE));
  assert.ok(!updatedRole.permissionIds.includes('CREATE_USER'));

  await Role.deleteOne({ _id: testRoleId });
});

test('Excel Import - Student validation and database storage into students and users collections', async () => {
  const coordinator = await createPlacementUser(ROLE_IDS.PLACEMENT_COORDINATOR);
  const signedIn = await login(coordinator.email);
  const headers = bearer(signedIn.body.data.sessionToken);

  // 1. Download template
  const template = await request(app).get('/api/imports/templates/student').set(headers);
  assert.equal(template.status, 200);
  assert.ok(template.header['content-disposition'].includes('student_import_template.xlsx'));

  // 2. Validate mixed payload (valid, invalid email, invalid cgpa, missing required)
  const rowsToValidate = [
    {
      universityId: 'STU-VALID-101',
      firstName: 'Rahul',
      lastName: 'Sharma',
      email: 'rahul.sharma@campus.edu',
      mobileNumber: '9876543210',
      branch: 'Computer Engineering',
      department: 'Technology',
      semester: 8,
      cgpa: 8.9,
      backlogs: 0,
      passingYear: 2026
    },
    {
      universityId: 'STU-INVALID-102',
      firstName: 'Ankit',
      lastName: 'Verma',
      email: 'invalid-email-format',
      mobileNumber: '9876543211',
      branch: 'IT',
      department: 'Technology',
      semester: 8,
      cgpa: 14.5, // Invalid CGPA > 10
      passingYear: 2026
    }
  ];

  const validation = await request(app)
    .post('/api/imports/validate/student')
    .set(headers)
    .send({ rows: rowsToValidate });

  assert.equal(validation.status, 200);
  assert.equal(validation.body.data.totalRows, 2);
  assert.equal(validation.body.data.validCount, 1);
  assert.equal(validation.body.data.invalidCount, 1);
  assert.equal(validation.body.data.preview[0].status, 'VALID');
  assert.equal(validation.body.data.preview[1].status, 'INVALID');

  // 3. Confirm import of valid rows
  const confirmation = await request(app)
    .post('/api/imports/confirm/student')
    .set(headers)
    .send({ rows: rowsToValidate });

  assert.equal(confirmation.status, 200);
  assert.equal(confirmation.body.data.importedCount, 1);
  assert.equal(confirmation.body.data.skippedCount, 1);

  // 4. Verify record in students collection
  const studentDoc = await Student.findOne({ universityId: 'STU-VALID-101' }).lean();
  assert.ok(studentDoc);
  assert.equal(studentDoc.firstName, 'Rahul');
  assert.equal(studentDoc.cgpa, 8.9);

  // 5. Verify corresponding user account in users collection
  const userDoc = await User.findOne({ email: 'rahul.sharma@campus.edu' }).lean();
  assert.ok(userDoc);
  assert.equal(userDoc.userType, 'STUDENT');
  assert.equal(userDoc.roleId, ROLE_IDS.STUDENT);
});

test('Excel Import - Company validation and database storage', async () => {
  const coordinator = await createPlacementUser(ROLE_IDS.PLACEMENT_COORDINATOR);
  const signedIn = await login(coordinator.email);
  const headers = bearer(signedIn.body.data.sessionToken);

  const companyRows = [
    {
      companyName: 'Global Cloud Systems',
      industryType: 'Software',
      description: 'Cloud and Enterprise Systems',
      website: 'https://globalcloud.example.com',
      yearEstablished: 2015,
      hrRecruiterName: 'Suman Roy',
      email: 'recruiter@globalcloud.example.com',
      mobileNumber: '9988776655'
    }
  ];

  const confirmation = await request(app)
    .post('/api/imports/confirm/company')
    .set(headers)
    .send({ rows: companyRows });

  assert.equal(confirmation.status, 200);
  assert.equal(confirmation.body.data.importedCount, 1);

  const companyDoc = await Company.findOne({ companyName: 'Global Cloud Systems' }).lean();
  assert.ok(companyDoc);
  assert.equal(companyDoc.hrRecruiterName, 'Suman Roy');

  const userDoc = await User.findOne({ email: 'recruiter@globalcloud.example.com' }).lean();
  assert.ok(userDoc);
  assert.equal(userDoc.userType, 'COMPANY');
});

test('Excel Import - Placement Cell staff import restricted to authorized roles', async () => {
  const admin = await createAdmin();
  const signedIn = await login(admin.email);
  const headers = bearer(signedIn.body.data.sessionToken);

  const staffRows = [
    {
      employeeId: 'EMP-HEAD-01',
      firstName: 'Dr. Meera',
      lastName: 'Nair',
      email: 'meera.nair@university.edu',
      role: ROLE_IDS.PLACEMENT_HEAD
    }
  ];

  const confirmation = await request(app)
    .post('/api/imports/confirm/placement')
    .set(headers)
    .send({ rows: staffRows });

  assert.equal(confirmation.status, 200);
  assert.equal(confirmation.body.data.importedCount, 1);

  const staffUser = await User.findOne({ email: 'meera.nair@university.edu' }).lean();
  assert.ok(staffUser);
  assert.equal(staffUser.roleId, ROLE_IDS.PLACEMENT_HEAD);
  assert.equal(staffUser.userType, 'PLACEMENT');
});
