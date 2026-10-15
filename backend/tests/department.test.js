import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
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
  { Department },
  { hashPassword },
  { createRawSessionToken, hashSessionToken },
  { ROLE_IDS },
  { PlacementOfficer }
] = await Promise.all([
  import('../src/app.js'),
  import('../src/config/database.js'),
  import('../src/seeders/seed.js'),
  import('../src/models/user.model.js'),
  import('../src/models/user-session.model.js'),
  import('../src/models/department.model.js'),
  import('../src/utils/password.js'),
  import('../src/utils/session-token.js'),
  import('../src/utils/access-constants.js'),
  import('../src/models/placement_officer.model.js')
]);

let mongo;
let app;

async function createAuthenticatedSession(roleId, userType = 'PLACEMENT') {
  const ts = Date.now() + Math.floor(Math.random() * 1000);
  const email = `test-${roleId.toLowerCase()}-${ts}@example.edu`;
  const passwordHash = await hashPassword('Password!123456');
  const user = await User.create({
    email,
    passwordHash,
    userType,
    roleId,
    employeeId: userType === 'PLACEMENT' ? `EMP-${ts}` : undefined,
    universityId: userType === 'STUDENT' ? `UNI-${ts}` : undefined,
    accountStatus: 'ACTIVE'
  });

  const rawToken = createRawSessionToken();
  const sessionTokenHash = hashSessionToken(rawToken);
  const now = new Date();
  await UserSession.create({
    userId: user._id,
    sessionTokenHash,
    loginAt: now,
    lastActivityAt: now,
    expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    isActive: true
  });

  return { token: rawToken, user };
}

before(async () => {
  await connectDatabase('mongodb://127.0.0.1:27017/campus_recruitment_test');
  await seedInitialData();
  app = createApp();
});

after(async () => {
  await disconnectDatabase();
});

beforeEach(async () => {
  await Department.deleteMany({});
  await PlacementOfficer.deleteMany({});
});

test('Department API Integration Tests', async (t) => {
  await t.test('Unauthenticated user cannot create or view departments', async () => {
    const listRes = await request(app).get('/api/departments');
    assert.equal(listRes.status, 401);

    const createRes = await request(app).post('/api/departments').send({
      name: 'Computer Science',
      code: 'CSE'
    });
    assert.equal(createRes.status, 401);
  });

  await t.test('Student user without DEPARTMENT_READ permission gets 403', async () => {
    const studentSession = await createAuthenticatedSession(ROLE_IDS.STUDENT, 'STUDENT');

    const res = await request(app)
      .get('/api/departments')
      .set('Authorization', `Bearer ${studentSession.token}`);

    assert.equal(res.status, 403);
  });

  await t.test('Super Admin can create a department and normalizes department code to uppercase', async () => {
    const adminSession = await createAuthenticatedSession(ROLE_IDS.SUPER_ADMIN);

    const res = await request(app)
      .post('/api/departments')
      .set('Authorization', `Bearer ${adminSession.token}`)
      .send({
        name: 'Computer Science & Engineering',
        code: 'cse',
        description: 'Department of Computer Science'
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.name, 'Computer Science & Engineering');
    assert.equal(res.body.data.code, 'CSE'); // Normalized to uppercase
    assert.equal(res.body.data.isActive, true);
  });

  await t.test('Prevents duplicate department code and duplicate department name', async () => {
    const adminSession = await createAuthenticatedSession(ROLE_IDS.SUPER_ADMIN);

    await request(app)
      .post('/api/departments')
      .set('Authorization', `Bearer ${adminSession.token}`)
      .send({ name: 'Management Studies', code: 'MGT' });

    // Duplicate Code attempt (lowercase)
    const dupCodeRes = await request(app)
      .post('/api/departments')
      .set('Authorization', `Bearer ${adminSession.token}`)
      .send({ name: 'Other Management', code: 'mgt' });

    assert.equal(dupCodeRes.status, 409);

    // Duplicate Name attempt
    const dupNameRes = await request(app)
      .post('/api/departments')
      .set('Authorization', `Bearer ${adminSession.token}`)
      .send({ name: 'Management Studies', code: 'MGMT' });

    assert.equal(dupNameRes.status, 409);
  });

  await t.test('Placement Head can list, search, update and deactivate department', async () => {
    const headSession = await createAuthenticatedSession(ROLE_IDS.PLACEMENT_HEAD);

    const createRes = await request(app)
      .post('/api/departments')
      .set('Authorization', `Bearer ${headSession.token}`)
      .send({ name: 'Electrical Engineering', code: 'EE', description: 'Power systems' });

    assert.equal(createRes.status, 201);
    const deptId = createRes.body.data._id;

    // List and Search
    const listRes = await request(app)
      .get('/api/departments?search=Electrical')
      .set('Authorization', `Bearer ${headSession.token}`);

    assert.equal(listRes.status, 200);
    assert.equal(listRes.body.data.items.length, 1);

    // Update
    const updateRes = await request(app)
      .patch(`/api/departments/${deptId}`)
      .set('Authorization', `Bearer ${headSession.token}`)
      .send({ description: 'Power and electronics systems' });

    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.data.description, 'Power and electronics systems');

    // Deactivate
    const statusRes = await request(app)
      .patch(`/api/departments/${deptId}/status`)
      .set('Authorization', `Bearer ${headSession.token}`)
      .send({ isActive: false });

    assert.equal(statusRes.status, 200);
    assert.equal(statusRes.body.data.isActive, false);

    // Verify record is preserved in DB (not hard-deleted)
    const dbDept = await Department.findById(deptId);
    assert.ok(dbDept);
    assert.equal(dbDept.isActive, false);
  });

  await t.test('Placement Coordinator with DEPARTMENT_READ can view but cannot create or update', async () => {
    // Seed a department directly
    const dept = await Department.create({ name: 'Civil Engineering', code: 'CIVIL', isActive: true });
    const coordSession = await createAuthenticatedSession(ROLE_IDS.PLACEMENT_COORDINATOR);
    await PlacementOfficer.create({
      userId: coordSession.user._id,
      employeeId: coordSession.user.employeeId,
      firstName: 'Civil',
      lastName: 'Coordinator',
      email: coordSession.user.email,
      mobileNumber: '9876543210',
      designation: 'Assistant Professor',
      department: dept.name,
      departmentId: dept._id,
      role: ROLE_IDS.PLACEMENT_COORDINATOR
    });

    // Read allowed
    const readRes = await request(app)
      .get(`/api/departments/${dept._id}`)
      .set('Authorization', `Bearer ${coordSession.token}`);
    assert.equal(readRes.status, 200);

    // Create denied
    const createRes = await request(app)
      .post('/api/departments')
      .set('Authorization', `Bearer ${coordSession.token}`)
      .send({ name: 'Mechanical', code: 'MECH' });
    assert.equal(createRes.status, 403);

    // Update denied
    const updateRes = await request(app)
      .patch(`/api/departments/${dept._id}`)
      .set('Authorization', `Bearer ${coordSession.token}`)
      .send({ name: 'Civil & Struct' });
    assert.equal(updateRes.status, 403);
  });
});
