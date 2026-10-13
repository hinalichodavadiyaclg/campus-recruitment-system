import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  { PlacementOfficer },
  { Department },
  { Course },
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
  import('../src/models/placement_officer.model.js'),
  import('../src/models/department.model.js'),
  import('../src/models/course.model.js'),
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
  const testDir = dirname(fileURLToPath(import.meta.url));
  const backendBinaryDir = join(testDir, '..', '.mongodb-binaries');
  const binaryDir = existsSync(backendBinaryDir) ? backendBinaryDir : join(process.cwd(), '.mongodb-binaries');
  mongo = await MongoMemoryServer.create({ binary: { downloadDir: binaryDir } });
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
  await PlacementOfficer.deleteMany({});
  await Department.deleteMany({});
  await Course.deleteMany({});
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

test('Protected Profile Fields - Student attempt to edit CGPA or University ID is strictly rejected', async () => {
  const studentUser = await createStudent({ email: 'student.security@example.edu', universityId: 'STU-SEC-01' });
  await Student.create({
    universityId: 'STU-SEC-01',
    firstName: 'Security',
    lastName: 'Test',
    email: 'student.security@example.edu',
    mobileNumber: '9999988888',
    branch: 'Computer Science',
    department: 'Engineering',
    semester: 6,
    cgpa: 8.5,
    backlogs: 0,
    userId: studentUser._id
  });

  const signedIn = await login(studentUser.email);
  const headers = bearer(signedIn.body.data.sessionToken);

  // Attempt to illegally update CGPA via PUT /api/students/me
  const resCgpa = await request(app)
    .put('/api/students/me')
    .set(headers)
    .send({ cgpa: 9.9 });

  assert.equal(resCgpa.status, 400);
  assert.equal(resCgpa.body.error.code, 'PROTECTED_FIELD_READONLY');

  // Attempt to illegally update University ID via PUT /api/students/me
  const resUni = await request(app)
    .put('/api/students/me')
    .set(headers)
    .send({ universityId: 'HACKED-ID' });

  assert.equal(resUni.status, 400);
  assert.equal(resUni.body.error.code, 'PROTECTED_FIELD_READONLY');

  // Attempt to illegally update passingYear via PUT /api/students/me
  const resPassYear = await request(app)
    .put('/api/students/me')
    .set(headers)
    .send({ passingYear: 2030 });

  assert.equal(resPassYear.status, 400);
  assert.equal(resPassYear.body.error.code, 'PROTECTED_FIELD_READONLY');

  // Attempt to illegally update department/branch/semester via PUT /api/students/me
  const resDept = await request(app)
    .put('/api/students/me')
    .set(headers)
    .send({ department: 'Unauthorized Dept', semester: 8 });

  assert.equal(resDept.status, 400);
  assert.equal(resDept.body.error.code, 'PROTECTED_FIELD_READONLY');

  // Valid profile update (mobile & bio) succeeds
  const resValid = await request(app)
    .put('/api/students/me')
    .set(headers)
    .send({ mobileNumber: '9876500000', bio: 'Valid bio update' });

  assert.equal(resValid.status, 200);
  assert.equal(resValid.body.data.mobileNumber, '9876500000');
  assert.equal(resValid.body.data.bio, 'Valid bio update');
});

test('Company Recruiter - Self profile GET and PUT /api/companies/me', async () => {
  const companyDoc = await Company.create({
    companyName: 'Apex Innovations',
    industryType: 'Technology',
    hrRecruiterName: 'Ananya Sharma',
    yearEstablished: 2018,
    email: 'recruiter.self@example.com'
  });
  const companyUser = await User.create({
    email: 'recruiter.self@example.com',
    passwordHash,
    userType: 'COMPANY',
    companyId: companyDoc._id,
    roleId: ROLE_IDS.COMPANY,
    accountStatus: 'ACTIVE'
  });
  companyDoc.userId = companyUser._id;
  await companyDoc.save();

  const signedIn = await login(companyUser.email);
  const headers = bearer(signedIn.body.data.sessionToken);

  // GET /api/companies/me
  const getRes = await request(app).get('/api/companies/me').set(headers);
  assert.equal(getRes.status, 200);
  assert.equal(getRes.body.data.companyName, 'Apex Innovations');

  // PUT /api/companies/me with valid fields
  const putRes = await request(app)
    .put('/api/companies/me')
    .set(headers)
    .send({ designation: 'Senior Talent Acquisition Lead', website: 'https://apex.example.com' });
  assert.equal(putRes.status, 200);
  assert.equal(putRes.body.data.designation, 'Senior Talent Acquisition Lead');
});

test('Company Multi-Recruiter Support - Linking secondary recruiter preserves primary userId', async () => {
  // 1. Create primary recruiter and company
  const company = await Company.create({
    companyName: 'MultiRecruiter Corp',
    industryType: 'Enterprise Tech',
    hrRecruiterName: 'Primary HR',
    yearEstablished: 2010,
    email: 'primary.hr@multicorp.com'
  });
  const primaryUser = await User.create({
    email: 'primary.hr@multicorp.com',
    passwordHash,
    userType: 'COMPANY',
    companyId: company._id,
    roleId: ROLE_IDS.COMPANY,
    accountStatus: 'ACTIVE'
  });
  company.userId = primaryUser._id;
  await company.save();

  // 2. Create secondary recruiter linking to the same company
  const secondaryUser = await User.create({
    email: 'secondary.hr@multicorp.com',
    passwordHash,
    userType: 'COMPANY',
    companyId: company._id,
    roleId: ROLE_IDS.COMPANY,
    accountStatus: 'ACTIVE'
  });

  // 3. Verify primary userId was not overwritten
  const freshCompany = await Company.findById(company._id).lean();
  assert.equal(String(freshCompany.userId), String(primaryUser._id));

  // 4. Verify secondary recruiter can sign in and fetch company profile via /api/companies/me
  const secondarySignedIn = await login(secondaryUser.email);
  const secondaryHeaders = bearer(secondarySignedIn.body.data.sessionToken);
  const secondaryProfileRes = await request(app).get('/api/companies/me').set(secondaryHeaders);

  assert.equal(secondaryProfileRes.status, 200);
  assert.equal(secondaryProfileRes.body.data.companyName, 'MultiRecruiter Corp');
});

test('Placement Officer Creation & RBAC - Designation stored and dynamic roles enforced', async () => {
  const admin = await createAdmin();
  const signedIn = await login(admin.email);
  const headers = bearer(signedIn.body.data.sessionToken);

  // 1. Super Admin creates placement officer with designation and role
  const createRes = await request(app)
    .post('/api/placement-officers')
    .set(headers)
    .send({
      email: 'officer.designation@university.edu',
      employeeId: 'EMP-DESIG-999',
      firstName: 'Vikram',
      lastName: 'Seth',
      designation: 'Director of Placement & Corporate Relations',
      role: ROLE_IDS.PLACEMENT_HEAD
    });

  assert.equal(createRes.status, 201);
  assert.equal(createRes.body.data.designation, 'Director of Placement & Corporate Relations');

  const officerDoc = await PlacementOfficer.findOne({ employeeId: 'EMP-DESIG-999' }).lean();
  assert.ok(officerDoc);
  assert.equal(officerDoc.designation, 'Director of Placement & Corporate Relations');
  assert.equal(officerDoc.role, ROLE_IDS.PLACEMENT_HEAD);

  const officerUser = await User.findOne({ email: 'officer.designation@university.edu' }).lean();
  assert.ok(officerUser);
  assert.equal(officerUser.roleId, ROLE_IDS.PLACEMENT_HEAD);
  assert.equal(officerUser.userType, 'PLACEMENT');

  // 2. Unauthorized student cannot create placement officer
  const student = await createStudent({ email: 'unauth.student@campus.edu', universityId: 'STU-UNAUTH-01' });
  const studentSignedIn = await login(student.email);
  const studentHeaders = bearer(studentSignedIn.body.data.sessionToken);

  const unauthRes = await request(app)
    .post('/api/placement-officers')
    .set(studentHeaders)
    .send({
      email: 'hacked.officer@university.edu',
      employeeId: 'EMP-HACK-01',
      firstName: 'Hack',
      lastName: 'User',
      designation: 'Officer',
      role: ROLE_IDS.SUPER_ADMIN
    });

  assert.equal(unauthRes.status, 403);
});

test('Regression 1: Deleting a secondary recruiter preserves the company and primary recruiter', async () => {
  const admin = await createAdmin();
  const signedIn = await login(admin.email);
  const adminHeaders = bearer(signedIn.body.data.sessionToken);

  const company = await Company.create({
    companyName: 'Preserved Primary Corp',
    industryType: 'Technology',
    hrRecruiterName: 'Lead Recruiter',
    yearEstablished: 2012,
    email: 'lead.recruiter@preserved.com'
  });
  const primaryUser = await User.create({
    email: 'lead.recruiter@preserved.com',
    passwordHash,
    userType: 'COMPANY',
    companyId: company._id,
    roleId: ROLE_IDS.COMPANY,
    accountStatus: 'ACTIVE'
  });
  company.userId = primaryUser._id;
  await company.save();

  const secondaryUser = await User.create({
    email: 'junior.recruiter@preserved.com',
    passwordHash,
    userType: 'COMPANY',
    companyId: company._id,
    roleId: ROLE_IDS.COMPANY,
    accountStatus: 'ACTIVE'
  });

  // Admin deletes secondary recruiter
  const delRes = await request(app).delete(`/api/users/${secondaryUser._id}`).set(adminHeaders);
  assert.equal(delRes.status, 200);

  // 1. Secondary user is deleted
  assert.equal(await User.findById(secondaryUser._id), null);

  // 2. Company profile is preserved intact
  const freshCompany = await Company.findById(company._id).lean();
  assert.ok(freshCompany);
  assert.equal(freshCompany.companyName, 'Preserved Primary Corp');
  assert.equal(String(freshCompany.userId), String(primaryUser._id));

  // 3. Primary recruiter is preserved intact and can access /api/companies/me
  const primarySignedIn = await login(primaryUser.email);
  const primaryHeaders = bearer(primarySignedIn.body.data.sessionToken);
  const profileRes = await request(app).get('/api/companies/me').set(primaryHeaders);
  assert.equal(profileRes.status, 200);
  assert.equal(profileRes.body.data.companyName, 'Preserved Primary Corp');
});

test('Regression 2: Deleting a primary recruiter does not break other recruiters', async () => {
  const admin = await createAdmin();
  const signedIn = await login(admin.email);
  const adminHeaders = bearer(signedIn.body.data.sessionToken);

  const company = await Company.create({
    companyName: 'Reassigned Recruiter Corp',
    industryType: 'Finance',
    hrRecruiterName: 'Founding Recruiter',
    yearEstablished: 2015,
    email: 'founding.hr@reassigned.com'
  });
  const primaryUser = await User.create({
    email: 'founding.hr@reassigned.com',
    passwordHash,
    userType: 'COMPANY',
    companyId: company._id,
    roleId: ROLE_IDS.COMPANY,
    accountStatus: 'ACTIVE'
  });
  company.userId = primaryUser._id;
  await company.save();

  const remainingUser = await User.create({
    email: 'remaining.hr@reassigned.com',
    passwordHash,
    userType: 'COMPANY',
    companyId: company._id,
    roleId: ROLE_IDS.COMPANY,
    accountStatus: 'ACTIVE'
  });

  // Admin deletes the primary recruiter
  const delRes = await request(app).delete(`/api/users/${primaryUser._id}`).set(adminHeaders);
  assert.equal(delRes.status, 200);

  // 1. Primary user is deleted
  assert.equal(await User.findById(primaryUser._id), null);

  // 2. Company profile is preserved and primary recruiter reference is safely updated to remaining recruiter
  const freshCompany = await Company.findById(company._id).lean();
  assert.ok(freshCompany);
  assert.equal(freshCompany.companyName, 'Reassigned Recruiter Corp');
  assert.equal(String(freshCompany.userId), String(remainingUser._id));

  // 3. Remaining recruiter is not broken: can log in, fetch profile, and update profile
  const remainingSignedIn = await login(remainingUser.email);
  const remainingHeaders = bearer(remainingSignedIn.body.data.sessionToken);

  const profileRes = await request(app).get('/api/companies/me').set(remainingHeaders);
  assert.equal(profileRes.status, 200);
  assert.equal(profileRes.body.data.companyName, 'Reassigned Recruiter Corp');

  const updateRes = await request(app)
    .put('/api/companies/me')
    .set(remainingHeaders)
    .send({ designation: 'Newly Promoted Primary HR' });
  assert.equal(updateRes.status, 200);
  assert.equal(updateRes.body.data.designation, 'Newly Promoted Primary HR');
});

test('Regression 3: Company deletion occurs only when explicitly authorized and safe under business rules', async () => {
  const admin = await createAdmin();
  const signedIn = await login(admin.email);
  const adminHeaders = bearer(signedIn.body.data.sessionToken);

  // Scenario A: Sole recruiter deleted -> Company profile is safely cascade-deleted because no other recruiters exist
  const soleCompany = await Company.create({
    companyName: 'Sole Recruiter Corp',
    industryType: 'Consulting',
    hrRecruiterName: 'Sole HR',
    yearEstablished: 2018,
    email: 'sole.hr@consulting.com'
  });
  const soleUser = await User.create({
    email: 'sole.hr@consulting.com',
    passwordHash,
    userType: 'COMPANY',
    companyId: soleCompany._id,
    roleId: ROLE_IDS.COMPANY,
    accountStatus: 'ACTIVE'
  });
  soleCompany.userId = soleUser._id;
  await soleCompany.save();

  const delSoleRes = await request(app).delete(`/api/users/${soleUser._id}`).set(adminHeaders);
  assert.equal(delSoleRes.status, 200);
  assert.equal(await User.findById(soleUser._id), null);
  // Company is deleted because zero other recruiters reference it
  assert.equal(await Company.findById(soleCompany._id), null);

  // Scenario B: Unauthorized company deletion attempt by unprivileged recruiter is rejected (403)
  const compToDelete = await Company.create({
    companyName: 'Target Deletion Corp',
    industryType: 'Retail',
    hrRecruiterName: 'Target HR',
    yearEstablished: 2020,
    email: 'target.hr@retail.com'
  });
  const recruiterUser = await User.create({
    email: 'target.hr@retail.com',
    passwordHash,
    userType: 'COMPANY',
    companyId: compToDelete._id,
    roleId: ROLE_IDS.COMPANY,
    accountStatus: 'ACTIVE'
  });
  compToDelete.userId = recruiterUser._id;
  await compToDelete.save();

  const recruiterSignedIn = await login(recruiterUser.email);
  const recruiterHeaders = bearer(recruiterSignedIn.body.data.sessionToken);

  const unauthDel = await request(app)
    .delete(`/api/companies/${compToDelete._id}`)
    .set(recruiterHeaders);
  assert.equal(unauthDel.status, 403);
  // Company still exists
  assert.ok(await Company.findById(compToDelete._id));

  // Scenario C: Explicit company deletion by authorized admin succeeds and removes company and recruiter
  const authDel = await request(app)
    .delete(`/api/companies/${compToDelete._id}`)
    .set(adminHeaders);
  assert.equal(authDel.status, 200);
  assert.equal(await Company.findById(compToDelete._id), null);
  assert.equal(await User.findById(recruiterUser._id), null);
});

test('Failure Injection 1: Standalone student creation rolls back User when Student creation fails', async () => {
  const admin = await createAdmin();
  const signedIn = await login(admin.email);
  const adminHeaders = bearer(signedIn.body.data.sessionToken);

  const controlUser = await User.create({
    email: 'control.existing.student@example.edu',
    passwordHash,
    userType: 'STUDENT',
    universityId: 'STU-CONTROL-01',
    roleId: ROLE_IDS.STUDENT,
    accountStatus: 'ACTIVE'
  });

  const origStartSession = mongoose.startSession;
  const origStudentCreate = Student.create;
  try {
    mongoose.startSession = async () => {
      throw new Error('Transaction numbers are only allowed on a replica set member or mongos');
    };

    Student.create = async function () {
      throw new Error('Injected failure during Student profile persistence');
    };

    const targetEmail = 'injected.fail.student@example.edu';
    const targetUniId = 'STU-FAIL-01';

    const res = await request(app)
      .post('/api/students')
      .set(adminHeaders)
      .send({
        universityId: targetUniId,
        firstName: 'Injected',
        lastName: 'Fail',
        email: targetEmail,
        mobileNumber: '9876543210',
        branch: 'Computer Science',
        department: 'Computer Science',
        semester: 2,
        cgpa: 7.5
      });

    assert.notEqual(res.status, 201);

    const orphanedUser = await User.findOne({ email: targetEmail });
    assert.equal(orphanedUser, null);

    const orphanedStudent = await Student.findOne({ universityId: targetUniId });
    assert.equal(orphanedStudent, null);

    const preservedControl = await User.findById(controlUser._id);
    assert.ok(preservedControl);
  } finally {
    mongoose.startSession = origStartSession;
    Student.create = origStudentCreate;
  }
});

test('Failure Injection 2: Standalone company creation rolls back Company when User creation fails', async () => {
  const admin = await createAdmin();
  const signedIn = await login(admin.email);
  const adminHeaders = bearer(signedIn.body.data.sessionToken);

  const controlCompany = await Company.create({
    companyName: 'Control Preserved Enterprise',
    industryType: 'Manufacturing',
    hrRecruiterName: 'Control Lead',
    yearEstablished: 2010,
    email: 'control.enterprise@preserved.com'
  });

  const origStartSession = mongoose.startSession;
  const origUserCreate = User.create;
  try {
    mongoose.startSession = async () => {
      throw new Error('Transaction numbers are only allowed on a replica set member or mongos');
    };

    User.create = async function () {
      throw new Error('Injected failure during Recruiter User persistence');
    };

    const targetEmail = 'injected.fail.company@recruiter.com';
    const targetCompanyName = 'Injected Failure Corp';

    const res = await request(app)
      .post('/api/companies')
      .set(adminHeaders)
      .send({
        companyName: targetCompanyName,
        industryType: 'Consulting',
        hrRecruiterName: 'Fail HR',
        email: targetEmail,
        yearEstablished: 2022
      });

    assert.notEqual(res.status, 201);

    const orphanedCompany = await Company.findOne({ companyName: targetCompanyName });
    assert.equal(orphanedCompany, null);

    const orphanedUser = await User.findOne({ email: targetEmail });
    assert.equal(orphanedUser, null);

    const preservedControl = await Company.findById(controlCompany._id);
    assert.ok(preservedControl);
  } finally {
    mongoose.startSession = origStartSession;
    User.create = origUserCreate;
  }
});

test('Failure Injection 3: Standalone placement officer creation rolls back User when Officer creation fails', async () => {
  const admin = await createAdmin();
  const signedIn = await login(admin.email);
  const adminHeaders = bearer(signedIn.body.data.sessionToken);

  const controlOfficer = await User.create({
    email: 'control.placement.officer@example.edu',
    passwordHash,
    userType: 'PLACEMENT',
    employeeId: 'EMP-CONTROL-OFFICER-01',
    roleId: ROLE_IDS.PLACEMENT_COORDINATOR,
    accountStatus: 'ACTIVE'
  });

  const origStartSession = mongoose.startSession;
  const origOfficerCreate = PlacementOfficer.create;
  try {
    mongoose.startSession = async () => {
      throw new Error('Transaction numbers are only allowed on a replica set member or mongos');
    };

    PlacementOfficer.create = async function () {
      throw new Error('Injected failure during Placement Officer profile persistence');
    };

    const targetEmail = 'injected.fail.officer@university.edu';
    const targetEmpId = 'EMP-FAIL-OFFICER-01';

    const res = await request(app)
      .post('/api/placement-officers')
      .set(adminHeaders)
      .send({
        employeeId: targetEmpId,
        firstName: 'Fail',
        lastName: 'Officer',
        email: targetEmail,
        designation: 'Rollback Officer',
        role: ROLE_IDS.PLACEMENT_COORDINATOR
      });

    assert.notEqual(res.status, 201);

    const orphanedUser = await User.findOne({ email: targetEmail });
    assert.equal(orphanedUser, null);

    const orphanedOfficer = await PlacementOfficer.findOne({ employeeId: targetEmpId });
    assert.equal(orphanedOfficer, null);

    const preservedControl = await User.findById(controlOfficer._id);
    assert.ok(preservedControl);
  } finally {
    mongoose.startSession = origStartSession;
    PlacementOfficer.create = origOfficerCreate;
  }
});

test('Regression Step 3a: Seed idempotency preserves canonical roles, permissions, and Super Admin without duplication', async () => {
  const prevEmail = process.env.SUPER_ADMIN_EMAIL;
  const prevPass = process.env.SUPER_ADMIN_PASSWORD;
  const prevEmp = process.env.SUPER_ADMIN_EMPLOYEE_ID;

  try {
    process.env.SUPER_ADMIN_EMAIL = 'admin.idempotent.seed@example.edu';
    process.env.SUPER_ADMIN_PASSWORD = 'SeedAdminPassword!123';
    process.env.SUPER_ADMIN_EMPLOYEE_ID = 'ADMIN-IDEMP-01';

    // First seed run
    await seedInitialData();

    const permCount1 = await Permission.countDocuments();
    const roleCount1 = await Role.countDocuments();
    const adminCount1 = await User.countDocuments({ email: 'admin.idempotent.seed@example.edu' });
    const officerCount1 = await PlacementOfficer.countDocuments();

    assert.equal(adminCount1, 1, 'Exactly one Super Admin account created');
    assert.equal(officerCount1, 0, 'No PlacementOfficer document created for Super Admin');

    const adminDoc = await User.findOne({ email: 'admin.idempotent.seed@example.edu' }).lean();
    assert.equal(adminDoc.roleId, ROLE_IDS.SUPER_ADMIN);
    assert.equal(adminDoc.userType, 'PLACEMENT');
    assert.equal(adminDoc.employeeId, 'ADMIN-IDEMP-01');

    // Second seed run (must be strictly idempotent)
    await seedInitialData();

    // Third seed run
    await seedInitialData();

    const permCount2 = await Permission.countDocuments();
    const roleCount2 = await Role.countDocuments();
    const adminCount2 = await User.countDocuments({ email: 'admin.idempotent.seed@example.edu' });
    const officerCount2 = await PlacementOfficer.countDocuments();

    assert.equal(permCount1, permCount2, 'Permission count unchanged across multiple seed runs');
    assert.equal(roleCount1, roleCount2, 'Role count unchanged across multiple seed runs');
    assert.equal(adminCount2, 1, 'Super Admin user is not duplicated');
    assert.equal(officerCount2, 0, 'No ghost PlacementOfficer created during repeated seeding');
  } finally {
    process.env.SUPER_ADMIN_EMAIL = prevEmail;
    process.env.SUPER_ADMIN_PASSWORD = prevPass;
    process.env.SUPER_ADMIN_EMPLOYEE_ID = prevEmp;
    await User.deleteMany({ email: 'admin.idempotent.seed@example.edu' });
  }
});

test('Regression Step 3b: User list identifies Super Admin as System Administrator and Placement Officers list returns only genuine placement officers', async () => {
  const admin = await createAdmin('superadmin.profile.test@example.edu');
  const signedIn = await login(admin.email);
  const adminHeaders = bearer(signedIn.body.data.sessionToken);

  // 1. GET /api/users should display 'System Administrator' as profileName for Super Admin
  const usersRes = await request(app).get('/api/users').set(adminHeaders);
  assert.equal(usersRes.status, 200);
  const foundAdmin = usersRes.body.data.items.find((u) => u.email === admin.email);
  assert.ok(foundAdmin, 'Super Admin found in user list');
  assert.equal(foundAdmin.profileName, 'System Administrator');
  assert.equal(foundAdmin.roleId, ROLE_IDS.SUPER_ADMIN);

  // 2. GET /api/placement-officers must not return ghost placement officer with Super Admin ID when empty
  const emptyOfficersRes = await request(app).get('/api/placement-officers').set(adminHeaders);
  assert.equal(emptyOfficersRes.status, 200);
  assert.equal(emptyOfficersRes.body.data.items.length, 0);
  assert.equal(emptyOfficersRes.body.data.total, 0);

  // 3. Create a genuine Placement Officer
  const createPoRes = await request(app)
    .post('/api/placement-officers')
    .set(adminHeaders)
    .send({
      employeeId: 'EMP-GENUINE-PO-01',
      firstName: 'Rakesh',
      lastName: 'Verma',
      email: 'rakesh.verma@university.edu',
      designation: 'Senior Placement Officer',
      role: ROLE_IDS.PLACEMENT_COORDINATOR
    });
  assert.equal(createPoRes.status, 201);
  const createdPoId = createPoRes.body.data._id;

  // 4. GET /api/placement-officers should return only the genuine placement officer
  const poListRes = await request(app).get('/api/placement-officers').set(adminHeaders);
  assert.equal(poListRes.status, 200);
  assert.equal(poListRes.body.data.items.length, 1);
  assert.equal(poListRes.body.data.total, 1);
  assert.equal(poListRes.body.data.items[0]._id, createdPoId);
  assert.equal(poListRes.body.data.items[0].email, 'rakesh.verma@university.edu');

  // 5. GET /api/placement-officers/:id works with valid ID (not a 404 ghost)
  const getSinglePoRes = await request(app).get(`/api/placement-officers/${createdPoId}`).set(adminHeaders);
  assert.equal(getSinglePoRes.status, 200);
  assert.equal(getSinglePoRes.body.data.firstName, 'Rakesh');

  // 6. User list now shows 'Rakesh Verma' for PO and 'System Administrator' for Super Admin
  const updatedUsersRes = await request(app).get('/api/users').set(adminHeaders);
  assert.equal(updatedUsersRes.status, 200);
  const adminUser = updatedUsersRes.body.data.items.find((u) => u.email === admin.email);
  const poUser = updatedUsersRes.body.data.items.find((u) => u.email === 'rakesh.verma@university.edu');
  assert.equal(adminUser.profileName, 'System Administrator');
  assert.equal(poUser.profileName, 'Rakesh Verma');
});

test('Regression Step 3c: Placement Officer deletion cannot delete a Super Admin user account', async () => {
  const admin = await createAdmin('protected.superadmin@example.edu');
  const signedIn = await login(admin.email);
  const adminHeaders = bearer(signedIn.body.data.sessionToken);

  // Create a genuine placement officer
  const createPoRes = await request(app)
    .post('/api/placement-officers')
    .set(adminHeaders)
    .send({
      employeeId: 'EMP-DEL-GUARD-01',
      firstName: 'Geeta',
      lastName: 'Patel',
      email: 'geeta.patel@university.edu',
      designation: 'Placement Coordinator',
      role: ROLE_IDS.PLACEMENT_COORDINATOR
    });
  assert.equal(createPoRes.status, 201);
  const poId = createPoRes.body.data._id;

  // Even if a placement officer document somehow references a Super Admin's userId
  const maliciousPo = await PlacementOfficer.create({
    employeeId: 'EMP-MALICIOUS-01',
    firstName: 'Malicious',
    lastName: 'Link',
    email: 'malicious.link@university.edu',
    designation: 'Officer',
    role: ROLE_IDS.PLACEMENT_COORDINATOR,
    userId: admin._id
  });

  const deleteMaliciousRes = await request(app)
    .delete(`/api/placement-officers/${maliciousPo._id}`)
    .set(adminHeaders);

  assert.equal(deleteMaliciousRes.status, 403);
  assert.equal(deleteMaliciousRes.body.error.code, 'CANNOT_DELETE_SUPER_ADMIN');

  // Super Admin account is intact
  const intactAdmin = await User.findById(admin._id);
  assert.ok(intactAdmin, 'Super Admin user is still intact');

  // Clean up malicious document
  await PlacementOfficer.findByIdAndDelete(maliciousPo._id);

  // Normal deletion of genuine PO succeeds without affecting Super Admin
  const deleteNormalRes = await request(app)
    .delete(`/api/placement-officers/${poId}`)
    .set(adminHeaders);
  assert.equal(deleteNormalRes.status, 200);

  const deletedPo = await PlacementOfficer.findById(poId);
  assert.equal(deletedPo, null);

  const intactAdminFinal = await User.findById(admin._id);
  assert.ok(intactAdminFinal, 'Super Admin user remains intact after normal PO deletion');
});

test('RBAC Drift Fix: Seeding synchronizes missing approved permissions, prevents duplicates, and preserves custom permissions and metadata', async () => {
  // Simulate an existing database state with permission drift:
  // 1. Role metadata has custom description & name
  // 2. Custom permission assigned to ROLE_COMPANY
  // 3. Misassigned STUDENT_PROFILE_READ assigned to non-student roles
  // 4. Missing approved permissions
  const customPerm = 'CUSTOM_TEST_PERMISSION';
  await Permission.updateOne(
    { _id: customPerm },
    { $set: { name: 'Custom Test', module: 'Custom', action: 'READ', description: 'Custom' } },
    { upsert: true }
  );

  await Role.updateOne(
    { _id: ROLE_IDS.COMPANY },
    {
      $set: {
        name: 'Custom Company HR Name',
        description: 'Custom company HR description',
        permissionIds: [PERMISSION_IDS.AUTH_READ_SELF, PERMISSION_IDS.STUDENT_PROFILE_READ, customPerm]
      }
    }
  );

  await Role.updateOne(
    { _id: ROLE_IDS.PLACEMENT_COORDINATOR },
    {
      $set: {
        permissionIds: [PERMISSION_IDS.AUTH_READ_SELF, PERMISSION_IDS.DEPARTMENT_READ, PERMISSION_IDS.STUDENT_PROFILE_READ]
      }
    }
  );

  await Role.updateOne(
    { _id: ROLE_IDS.PLACEMENT_HEAD },
    {
      $set: {
        permissionIds: [PERMISSION_IDS.AUTH_READ_SELF, PERMISSION_IDS.USER_READ, PERMISSION_IDS.STUDENT_PROFILE_READ]
      }
    }
  );

  // Run seedInitialData() to synchronize
  await seedInitialData();

  // 1. Verify ROLE_COMPANY received missing approved permissions, removed misassigned STUDENT_PROFILE_READ, preserved custom permission & metadata
  const updatedCompanyRole = await Role.findById(ROLE_IDS.COMPANY).lean();
  assert.equal(updatedCompanyRole.name, 'Custom Company HR Name', 'Preserves custom name');
  assert.equal(updatedCompanyRole.description, 'Custom company HR description', 'Preserves custom description');
  assert.ok(updatedCompanyRole.permissionIds.includes(PERMISSION_IDS.STUDENT_READ), 'Includes STUDENT_READ');
  assert.ok(updatedCompanyRole.permissionIds.includes(PERMISSION_IDS.STUDENT_PROFILE_PUBLIC_READ), 'Includes STUDENT_PROFILE_PUBLIC_READ');
  assert.ok(updatedCompanyRole.permissionIds.includes(customPerm), 'Preserves custom permission');
  assert.equal(updatedCompanyRole.permissionIds.includes(PERMISSION_IDS.STUDENT_PROFILE_READ), false, 'Removed STUDENT_PROFILE_READ');

  // 2. Verify ROLE_PLACEMENT_COORDINATOR received all 11 approved permissions
  const updatedCoordRole = await Role.findById(ROLE_IDS.PLACEMENT_COORDINATOR).lean();
  const expectedCoordPerms = [
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
    PERMISSION_IDS.COURSE_READ
  ];
  for (const p of expectedCoordPerms) {
    assert.ok(updatedCoordRole.permissionIds.includes(p), `Coordinator missing ${p}`);
  }
  assert.equal(updatedCoordRole.permissionIds.includes(PERMISSION_IDS.STUDENT_DELETE), false, 'Coordinator must NOT have STUDENT_DELETE');
  assert.equal(updatedCoordRole.permissionIds.includes(PERMISSION_IDS.PLACEMENT_USER_IMPORT), false, 'Coordinator must NOT have PLACEMENT_USER_IMPORT');
  assert.equal(updatedCoordRole.permissionIds.includes(PERMISSION_IDS.STUDENT_PROFILE_READ), false, 'Removed STUDENT_PROFILE_READ');

  // 3. Verify ROLE_PLACEMENT_HEAD received all 23 approved permissions
  const updatedHeadRole = await Role.findById(ROLE_IDS.PLACEMENT_HEAD).lean();
  const expectedHeadPerms = [
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
    PERMISSION_IDS.COURSE_MANAGE
  ];
  for (const p of expectedHeadPerms) {
    assert.ok(updatedHeadRole.permissionIds.includes(p), `Head missing ${p}`);
  }
  assert.equal(updatedHeadRole.permissionIds.includes(PERMISSION_IDS.STUDENT_PROFILE_READ), false, 'Removed STUDENT_PROFILE_READ');

  // 4. Test repeated seeding produces NO duplicate permissions
  await seedInitialData();
  const rolesAfterReseed = await Role.find({}).lean();
  for (const r of rolesAfterReseed) {
    const uniqueSet = new Set(r.permissionIds);
    assert.equal(uniqueSet.size, r.permissionIds.length, `Role ${r._id} has duplicate permissions after reseed`);
  }
});

test('RBAC Access: Company recruiter can read permitted student listings via GET /api/students', async () => {
  await seedInitialData();

  // Create a student to list
  const studentUser = await createStudent({
    email: 'candidate.companytest@example.edu',
    universityId: 'CAND-001'
  });
  const createdStudentDoc = await Student.create({
    userId: studentUser._id,
    universityId: 'CAND-001',
    firstName: 'Ananya',
    lastName: 'Sharma',
    email: 'candidate.companytest@example.edu',
    mobileNumber: '9876543210',
    branch: 'Computer Science',
    department: 'Technology',
    semester: 6,
    cgpa: 9.1
  });

  // Create and login company recruiter
  const company = await Company.create({
    companyName: 'Apex Recruiting Ltd',
    industryType: 'Technology',
    hrRecruiterName: 'Talent Acquisition HR',
    yearEstablished: 2016,
    email: 'talent@apexrecruiting.com'
  });
  const companyUser = await User.create({
    email: 'talent@apexrecruiting.com',
    passwordHash,
    userType: 'COMPANY',
    companyId: company._id,
    roleId: ROLE_IDS.COMPANY,
    accountStatus: 'ACTIVE'
  });
  company.userId = companyUser._id;
  await company.save();

  const companySignedIn = await login(companyUser.email);
  assert.equal(companySignedIn.status, 200);
  const companyHeaders = bearer(companySignedIn.body.data.sessionToken);

  // Recruiter requests GET /api/students
  const listRes = await request(app).get('/api/students').set(companyHeaders);
  assert.equal(listRes.status, 200, 'Company recruiter should successfully access GET /api/students');
  assert.ok(Array.isArray(listRes.body.data.items));
  assert.ok(listRes.body.data.items.some((s) => s.universityId === 'CAND-001'));

  // Recruiter requests GET /api/students/:id
  const getRes = await request(app).get(`/api/students/${createdStudentDoc._id}`).set(companyHeaders);
  assert.equal(getRes.status, 200, 'Company recruiter should successfully access GET /api/students/:id');
  assert.equal(getRes.body.data.firstName, 'Ananya');
});

test('RBAC Access: Placement coordinator can create/update students and read roles, but is forbidden from deleting students', async () => {
  await seedInitialData();

  const coordinatorUser = await createPlacementUser(ROLE_IDS.PLACEMENT_COORDINATOR, {
    email: 'coord.rbac@university.edu',
    employeeId: 'EMP-COORD-RBAC'
  });
  const coordSignedIn = await login(coordinatorUser.email);
  assert.equal(coordSignedIn.status, 200);
  const coordHeaders = bearer(coordSignedIn.body.data.sessionToken);

  // 1. Placement coordinator can read roles (ROLE_READ)
  const rolesRes = await request(app).get('/api/roles').set(coordHeaders);
  assert.equal(rolesRes.status, 200, 'Coordinator should be authorized to read roles');

  // 2. Placement coordinator can create student (STUDENT_CREATE)
  const createStudentRes = await request(app)
    .post('/api/students')
    .set(coordHeaders)
    .send({
      universityId: 'STU-COORD-CREATE-01',
      firstName: 'Pooja',
      lastName: 'Mehta',
      email: 'pooja.mehta@university.edu',
      mobileNumber: '9988776655',
      branch: 'Information Technology',
      department: 'Computer Science',
      semester: 7,
      cgpa: 8.5
    });
  assert.equal(createStudentRes.status, 201, 'Coordinator should be authorized to create a student');
  const createdStudentId = createStudentRes.body.data._id;

  // 3. Placement coordinator can update student (STUDENT_UPDATE)
  const updateStudentRes = await request(app)
    .put(`/api/students/${createdStudentId}`)
    .set(coordHeaders)
    .send({
      mobileNumber: '9988776600',
      semester: 8
    });
  assert.equal(updateStudentRes.status, 200, 'Coordinator should be authorized to update a student');
  assert.equal(updateStudentRes.body.data.semester, 8);

  // 4. Placement coordinator CANNOT delete student (STUDENT_DELETE is forbidden)
  const deleteStudentRes = await request(app)
    .delete(`/api/students/${createdStudentId}`)
    .set(coordHeaders);
  assert.equal(deleteStudentRes.status, 403, 'Coordinator must be forbidden from deleting a student');

  // Verify student was NOT deleted
  const studentStillExists = await Student.findById(createdStudentId);
  assert.ok(studentStillExists, 'Student must remain intact');
});

test('RBAC Access: Placement head receives documented permissions and can delete students', async () => {
  await seedInitialData();

  const headUser = await createPlacementUser(ROLE_IDS.PLACEMENT_HEAD, {
    email: 'head.rbac@university.edu',
    employeeId: 'EMP-HEAD-RBAC'
  });
  const headSignedIn = await login(headUser.email);
  assert.equal(headSignedIn.status, 200);
  const headHeaders = bearer(headSignedIn.body.data.sessionToken);

  // Create a student first
  const createStudentRes = await request(app)
    .post('/api/students')
    .set(headHeaders)
    .send({
      universityId: 'STU-HEAD-DELETE-01',
      firstName: 'Karan',
      lastName: 'Shah',
      email: 'karan.shah@university.edu',
      mobileNumber: '9123456780',
      branch: 'Mechanical Engineering',
      department: 'Engineering',
      semester: 5,
      cgpa: 7.9
    });
  assert.equal(createStudentRes.status, 201);
  const studentId = createStudentRes.body.data._id;

  // Placement head CAN delete student (STUDENT_DELETE authorized)
  const deleteStudentRes = await request(app)
    .delete(`/api/students/${studentId}`)
    .set(headHeaders);
  assert.equal(deleteStudentRes.status, 200, 'Placement head should be authorized to delete student');

  // Verify student is deleted
  const deletedStudent = await Student.findById(studentId);
  assert.equal(deletedStudent, null, 'Student should be deleted');
});

test('Student Creation & Relational Department/Course: Persists departmentId & courseId and enforces validation', async () => {
  await seedInitialData();

  // Create active departments
  const dept1 = await Department.create({
    name: 'Computer Engineering',
    code: 'CE-TEST',
    isActive: true
  });
  const dept2 = await Department.create({
    name: 'Electrical Engineering',
    code: 'EE-TEST',
    isActive: true
  });
  const inactiveDept = await Department.create({
    name: 'Obsolete Dept',
    code: 'OBS-TEST',
    isActive: false
  });

  // Create active courses
  const course1 = await Course.create({
    name: 'B.Tech Computer Science',
    code: 'BT-CS',
    departmentId: dept1._id,
    level: 'UNDERGRADUATE',
    isActive: true
  });
  const course2 = await Course.create({
    name: 'B.Tech Electrical Power',
    code: 'BT-EP',
    departmentId: dept2._id,
    level: 'UNDERGRADUATE',
    isActive: true
  });

  const admin = await createAdmin('admin.deptest@example.edu');
  const signedIn = await login(admin.email);
  const adminHeaders = bearer(signedIn.body.data.sessionToken);

  // 1. Creation with mismatched course and department is rejected (HTTP 400)
  const mismatchRes = await request(app)
    .post('/api/students')
    .set(adminHeaders)
    .send({
      universityId: 'STU-MISMATCH-01',
      firstName: 'Rohan',
      lastName: 'Das',
      email: 'rohan.mismatch@university.edu',
      mobileNumber: '9876500001',
      departmentId: String(dept1._id),
      courseId: String(course2._id), // course2 belongs to dept2!
      department: 'Computer Engineering',
      branch: 'B.Tech Electrical Power',
      semester: 3,
      cgpa: 8.2
    });
  assert.equal(mismatchRes.status, 400);
  assert.equal(mismatchRes.body.error.code, 'INVALID_COURSE_DEPARTMENT');

  // 2. Creation with inactive department is rejected (HTTP 400)
  const inactiveDeptRes = await request(app)
    .post('/api/students')
    .set(adminHeaders)
    .send({
      universityId: 'STU-INACTIVE-01',
      firstName: 'Rohan',
      lastName: 'Das',
      email: 'rohan.inactive@university.edu',
      mobileNumber: '9876500002',
      departmentId: String(inactiveDept._id),
      department: 'Obsolete Dept',
      branch: 'General',
      semester: 1,
      cgpa: 7.5
    });
  assert.equal(inactiveDeptRes.status, 400);
  assert.equal(inactiveDeptRes.body.error.code, 'DEPARTMENT_INACTIVE');

  // 3. Valid creation correctly persists departmentId, courseId, auto-populates legacy strings, and links User
  const validCreateRes = await request(app)
    .post('/api/students')
    .set(adminHeaders)
    .send({
      universityId: 'STU-VALID-REL-01',
      firstName: 'Divya',
      lastName: 'Iyer',
      email: 'divya.iyer@university.edu',
      mobileNumber: '9876543299',
      address: 'Hostel Block B, Room 204',
      departmentId: String(dept1._id),
      courseId: String(course1._id),
      department: 'Computer Engineering',
      branch: 'B.Tech Computer Science',
      semester: 5,
      passingYear: 2027,
      cgpa: 9.45,
      backlogs: 0
    });
  assert.equal(validCreateRes.status, 201);
  const createdStudent = validCreateRes.body.data;
  assert.equal(String(createdStudent.departmentId), String(dept1._id));
  assert.equal(String(createdStudent.courseId), String(course1._id));
  assert.equal(createdStudent.department, 'Computer Engineering');
  assert.equal(createdStudent.branch, 'B.Tech Computer Science');

  // Verify in MongoDB
  const studentDoc = await Student.findById(createdStudent._id).lean();
  assert.ok(studentDoc);
  assert.equal(String(studentDoc.departmentId), String(dept1._id));
  assert.equal(String(studentDoc.courseId), String(course1._id));
  assert.ok(studentDoc.userId, 'Must have associated userId');

  // Verify linked User record
  const userDoc = await User.findById(studentDoc.userId).lean();
  assert.ok(userDoc);
  assert.equal(userDoc.email, 'divya.iyer@university.edu');
  assert.equal(userDoc.roleId, ROLE_IDS.STUDENT);
  assert.equal(userDoc.userType, 'STUDENT');
  assert.equal(userDoc.accountStatus, 'ACTIVE');

  // 4. Update student with new valid course within department persists properly
  const updateRes = await request(app)
    .put(`/api/students/${createdStudent._id}`)
    .set(adminHeaders)
    .send({
      cgpa: 9.6,
      semester: 6
    });
  assert.equal(updateRes.status, 200);
  assert.equal(updateRes.body.data.cgpa, 9.6);
  assert.equal(updateRes.body.data.semester, 6);
});

test('Company Recruiter Management CRUD: multiple recruiters, cross-company isolation, safeguards, RBAC and integrity', async () => {
  await seedInitialData();

  const admin = await createAdmin('admin.recruiters@example.edu');
  const adminSignedIn = await login(admin.email);
  const adminHeaders = bearer(adminSignedIn.body.data.sessionToken);

  const student = await createStudent({ email: 'unauth.student@example.edu' });
  const studentSignedIn = await login(student.email);
  const studentHeaders = bearer(studentSignedIn.body.data.sessionToken);

  // 1. Setup Company A with primary recruiter
  const companyA = await Company.create({
    companyName: 'Acme Technologies',
    industryType: 'Software',
    hrRecruiterName: 'Alice Primary',
    yearEstablished: 2015,
    email: 'alice.primary@acme.com'
  });
  const recruiter1 = await User.create({
    email: 'alice.primary@acme.com',
    passwordHash,
    userType: 'COMPANY',
    companyId: companyA._id,
    roleId: ROLE_IDS.COMPANY,
    accountStatus: 'ACTIVE'
  });
  companyA.userId = recruiter1._id;
  await companyA.save();

  // Setup Company B with primary recruiter
  const companyB = await Company.create({
    companyName: 'Beta Logistics',
    industryType: 'Supply Chain',
    hrRecruiterName: 'Bob Primary',
    yearEstablished: 2012,
    email: 'bob.primary@beta.com'
  });
  const recruiterB = await User.create({
    email: 'bob.primary@beta.com',
    passwordHash,
    userType: 'COMPANY',
    companyId: companyB._id,
    roleId: ROLE_IDS.COMPANY,
    accountStatus: 'ACTIVE'
  });
  companyB.userId = recruiterB._id;
  await companyB.save();

  // 2. Listing recruiters for Company A shows 1 primary recruiter with safe user fields
  const listA1 = await request(app)
    .get(`/api/companies/${companyA._id}/recruiters`)
    .set(adminHeaders);
  assert.equal(listA1.status, 200);
  assert.equal(listA1.body.data.items.length, 1);
  assert.equal(listA1.body.data.items[0].email, 'alice.primary@acme.com');
  assert.equal(listA1.body.data.items[0].isPrimary, true);
  assert.equal(listA1.body.data.items[0].userType, 'COMPANY');
  assert.equal(listA1.body.data.items[0].roleId, ROLE_IDS.COMPANY);
  assert.equal(listA1.body.data.items[0].passwordHash, undefined, 'Password hash must never be returned');

  // 3. Adding secondary recruiter to Company A
  const createRec2 = await request(app)
    .post(`/api/companies/${companyA._id}/recruiters`)
    .set(adminHeaders)
    .send({
      email: 'carol.secondary@acme.com',
      accountStatus: 'ACTIVE'
    });
  assert.equal(createRec2.status, 201);
  assert.ok(createRec2.body.data.temporaryPassword, 'Must return temporary password on creation');
  assert.equal(createRec2.body.data.email, 'carol.secondary@acme.com');
  assert.equal(createRec2.body.data.userType, 'COMPANY');
  assert.equal(createRec2.body.data.roleId, ROLE_IDS.COMPANY);
  assert.equal(String(createRec2.body.data.companyId), String(companyA._id));
  assert.equal(createRec2.body.data.isPrimary, false);
  assert.equal(createRec2.body.data.passwordHash, undefined);

  const recruiter2Id = createRec2.body.data._id;

  // Verify in MongoDB: User has companyId and company collection remains intact
  const rec2Doc = await User.findById(recruiter2Id).lean();
  assert.ok(rec2Doc);
  assert.equal(String(rec2Doc.companyId), String(companyA._id));
  assert.equal(rec2Doc.userType, 'COMPANY');
  assert.equal(rec2Doc.roleId, ROLE_IDS.COMPANY);

  const compADoc = await Company.findById(companyA._id).lean();
  assert.equal(String(compADoc.userId), String(recruiter1._id), 'Primary recruiter must remain recruiter 1');

  // Verify list now has 2 recruiters
  const listA2 = await request(app)
    .get(`/api/companies/${companyA._id}/recruiters`)
    .set(adminHeaders);
  assert.equal(listA2.status, 200);
  assert.equal(listA2.body.data.items.length, 2);

  // 4. Duplicate email prevention across recruiters
  const dupRec = await request(app)
    .post(`/api/companies/${companyA._id}/recruiters`)
    .set(adminHeaders)
    .send({
      email: 'alice.primary@acme.com'
    });
  assert.equal(dupRec.status, 409);
  assert.equal(dupRec.body.error.code, 'EMAIL_EXISTS');

  // 5. Cross-company access denial: cannot update or delete recruiter of Company A via Company B
  const crossUpdate = await request(app)
    .put(`/api/companies/${companyB._id}/recruiters/${recruiter2Id}`)
    .set(adminHeaders)
    .send({
      accountStatus: 'SUSPENDED'
    });
  assert.equal(crossUpdate.status, 403);
  assert.equal(crossUpdate.body.error.code, 'RECRUITER_MISMATCH');

  const crossDelete = await request(app)
    .delete(`/api/companies/${companyB._id}/recruiters/${recruiter2Id}`)
    .set(adminHeaders);
  assert.equal(crossDelete.status, 403);
  assert.equal(crossDelete.body.error.code, 'RECRUITER_MISMATCH');

  // 6. RBAC permission enforcement: student cannot read, create, update, or delete company recruiters
  const unauthList = await request(app)
    .get(`/api/companies/${companyA._id}/recruiters`)
    .set(studentHeaders);
  assert.equal(unauthList.status, 403);

  const unauthCreate = await request(app)
    .post(`/api/companies/${companyA._id}/recruiters`)
    .set(studentHeaders)
    .send({ email: 'hacker@example.com' });
  assert.equal(unauthCreate.status, 403);

  const unauthUpdate = await request(app)
    .put(`/api/companies/${companyA._id}/recruiters/${recruiter2Id}`)
    .set(studentHeaders)
    .send({ accountStatus: 'SUSPENDED' });
  assert.equal(unauthUpdate.status, 403);

  const unauthDelete = await request(app)
    .delete(`/api/companies/${companyA._id}/recruiters/${recruiter2Id}`)
    .set(studentHeaders);
  assert.equal(unauthDelete.status, 403);

  // 7. Update recruiter & promote secondary to primary
  const promoteRec2 = await request(app)
    .put(`/api/companies/${companyA._id}/recruiters/${recruiter2Id}`)
    .set(adminHeaders)
    .send({
      isPrimary: true,
      accountStatus: 'ACTIVE'
    });
  assert.equal(promoteRec2.status, 200);
  assert.equal(promoteRec2.body.data.isPrimary, true);

  // Verify Company A's primary recruiter pointer was updated to recruiter 2
  const compAPromoted = await Company.findById(companyA._id).lean();
  assert.equal(String(compAPromoted.userId), String(recruiter2Id));

  // 8. Safe primary deletion: delete recruiter 2 (now primary), reassigns primary safely to remaining recruiter 1
  const deleteRec2 = await request(app)
    .delete(`/api/companies/${companyA._id}/recruiters/${recruiter2Id}`)
    .set(adminHeaders);
  assert.equal(deleteRec2.status, 200);
  assert.equal(await User.findById(recruiter2Id), null, 'Deleted recruiter user must be removed');

  const compAReassigned = await Company.findById(companyA._id).lean();
  assert.ok(compAReassigned, 'Company must not be deleted while recruiter 1 remains');
  assert.equal(String(compAReassigned.userId), String(recruiter1._id), 'Primary pointer safely reassigned to recruiter 1');

  // 9. Last recruiter deletion safeguard: attempting to delete recruiter 1 (sole remaining) fails
  const deleteLastRec = await request(app)
    .delete(`/api/companies/${companyA._id}/recruiters/${recruiter1._id}`)
    .set(adminHeaders);
  assert.equal(deleteLastRec.status, 400);
  assert.equal(deleteLastRec.body.error.code, 'CANNOT_DELETE_LAST_RECRUITER');

  // Verify recruiter 1 and Company A still exist
  assert.ok(await User.findById(recruiter1._id));
  assert.ok(await Company.findById(companyA._id));
});


