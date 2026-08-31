import assert from 'node:assert/strict';
import { join } from 'node:path';
import test, { after, afterEach, before } from 'node:test';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.BCRYPT_ROUNDS = '10';
process.env.SESSION_TOKEN_PEPPER = 'test-session-token-pepper-that-is-long-enough';
process.env.PASSWORD_RESET_SECRET = 'test-password-reset-secret-that-is-long-enough';

const [{ createApp }, { connectDatabase, disconnectDatabase }, { seedInitialData }, { User }, { UserSession }, { Role }, { Permission }, { hashPassword }, { hashSessionToken }, { ROLE_IDS, PERMISSION_IDS }] = await Promise.all([
  import('../src/app.js'),
  import('../src/config/database.js'),
  import('../src/seeders/seed.js'),
  import('../src/models/user.model.js'),
  import('../src/models/user-session.model.js'),
  import('../src/models/role.model.js'),
  import('../src/models/permission.model.js'),
  import('../src/utils/password.js'),
  import('../src/utils/session-token.js'),
  import('../src/utils/access-constants.js')
]);

const PASSWORD = 'OriginalPassword!123';
const NEW_PASSWORD = 'NewSecurePassword!123';
let mongo;
let app;
let passwordHash;

async function createAdmin() {
  return User.create({
    email: 'admin@example.edu',
    passwordHash,
    userType: 'PLACEMENT',
    employeeId: 'ADMIN-001',
    roleId: ROLE_IDS.SUPER_ADMIN,
    accountStatus: 'ACTIVE',
    isEmailVerified: true
  });
}

async function createStudent(overrides = {}) {
  return User.create({
    email: 'student@example.edu',
    passwordHash,
    userType: 'STUDENT',
    universityId: 'STU-001',
    roleId: ROLE_IDS.STUDENT,
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

  const rawToken = 'expired-session-token-for-integration-test';
  await UserSession.create({
    userId: student._id,
    sessionTokenHash: hashSessionToken(rawToken),
    loginAt: new Date(Date.now() - 60_000),
    lastActivityAt: new Date(Date.now() - 60_000),
    expiresAt: new Date(Date.now() - 1),
    isActive: true
  });
  assert.equal((await request(app).get('/api/auth/me').set(bearer(rawToken))).status, 401);
});

test('role and permission authorization reject an ordinary student', async () => {
  const student = await createStudent();
  const signedIn = await login(student.email);
  assert.equal((await request(app).get('/api/roles').set(bearer(signedIn.body.data.sessionToken))).status, 403);
  assert.equal((await request(app).get('/api/users').set(bearer(signedIn.body.data.sessionToken))).status, 403);
});

test('Super Admin can assign roles, permissions, and lock/unlock accounts', async () => {
  const admin = await createAdmin();
  const student = await createStudent();
  const signedIn = await login(admin.email);
  const headers = bearer(signedIn.body.data.sessionToken);

  const permission = await request(app)
    .post('/api/permissions')
    .set(headers)
    .send({ id: 'REPORT_READ', name: 'Read reports', module: 'Reporting', action: 'READ', description: 'Allows viewing reports.' });
  assert.equal(permission.status, 201);
  const role = await request(app)
    .post('/api/roles')
    .set(headers)
    .send({ id: 'ROLE_REPORT_VIEWER', name: 'Report Viewer', description: 'Can view reporting data.', permissionIds: ['REPORT_READ'] });
  assert.equal(role.status, 201);
  const assignment = await request(app)
    .patch(`/api/users/${student._id}/role`)
    .set(headers)
    .send({ roleId: 'ROLE_REPORT_VIEWER' });
  assert.equal(assignment.status, 200);
  const lock = await request(app).patch(`/api/users/${student._id}/lock`).set(headers).send({ lockMinutes: 5 });
  assert.equal(lock.status, 200);
  assert.equal((await User.findById(student._id).lean()).accountStatus, 'LOCKED');
  const unlock = await request(app).patch(`/api/users/${student._id}/unlock`).set(headers).send({});
  assert.equal(unlock.status, 200);
  assert.equal((await User.findById(student._id).lean()).accountStatus, 'ACTIVE');
});

test('required initial role and permission records are seeded', async () => {
  assert.ok(await Role.exists({ _id: ROLE_IDS.SUPER_ADMIN }));
  assert.ok(await Role.exists({ _id: ROLE_IDS.PLACEMENT_HEAD }));
  assert.ok(await Permission.exists({ _id: PERMISSION_IDS.USER_ASSIGN_ROLE }));
});
