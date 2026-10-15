import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
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
  { Course },
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
  import('../src/models/course.model.js'),
  import('../src/utils/password.js'),
  import('../src/utils/session-token.js'),
  import('../src/utils/access-constants.js'),
  import('../src/models/placement_officer.model.js')
]);

let app;

async function createAuthenticatedSession(roleId, userType = 'PLACEMENT') {
  const ts = Date.now() + Math.floor(Math.random() * 1000);
  const email = `test-course-${roleId.toLowerCase()}-${ts}@example.edu`;
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
  await Course.deleteMany({});
  await Department.deleteMany({});
  await PlacementOfficer.deleteMany({});
});

test('Course API Integration Tests', async (t) => {
  await t.test('Unauthenticated user cannot access Course endpoints', async () => {
    const listRes = await request(app).get('/api/courses');
    assert.equal(listRes.status, 401);

    const createRes = await request(app).post('/api/courses').send({
      name: 'Computer Science & Engineering',
      code: 'BTECH-CSE',
      level: 'UNDERGRADUATE'
    });
    assert.equal(createRes.status, 401);
  });

  await t.test('Student user without COURSE_READ permission receives 403', async () => {
    const studentSession = await createAuthenticatedSession(ROLE_IDS.STUDENT, 'STUDENT');

    const res = await request(app)
      .get('/api/courses')
      .set('Authorization', `Bearer ${studentSession.token}`);

    assert.equal(res.status, 403);
  });

  await t.test('Super Admin can create a course and normalizes course code to uppercase', async () => {
    const adminSession = await createAuthenticatedSession(ROLE_IDS.SUPER_ADMIN);
    const dept = await Department.create({ name: 'Engineering', code: 'ENG', isActive: true });

    const res = await request(app)
      .post('/api/courses')
      .set('Authorization', `Bearer ${adminSession.token}`)
      .send({
        name: 'B.Tech Computer Science',
        code: 'btech-cs',
        departmentId: dept._id.toString(),
        level: 'UNDERGRADUATE',
        durationYears: 4,
        description: '4-year degree course'
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.name, 'B.Tech Computer Science');
    assert.equal(res.body.data.code, 'BTECH-CS'); // Normalized to uppercase
    assert.equal(res.body.data.level, 'UNDERGRADUATE');
    assert.equal(res.body.data.durationYears, 4);
    assert.equal(res.body.data.departmentId.name, 'Engineering');
  });

  await t.test('Rejects course creation for non-existent or inactive department', async () => {
    const adminSession = await createAuthenticatedSession(ROLE_IDS.SUPER_ADMIN);
    const inactiveDept = await Department.create({ name: 'Old Dept', code: 'OLD', isActive: false });

    // Non-existent department ObjectId
    const fakeId = '507f1f77bcf86cd799439011';
    const fakeRes = await request(app)
      .post('/api/courses')
      .set('Authorization', `Bearer ${adminSession.token}`)
      .send({
        name: 'M.Tech AI',
        code: 'MTECH-AI',
        departmentId: fakeId,
        level: 'POSTGRADUATE'
      });
    assert.equal(fakeRes.status, 404);

    // Inactive department
    const inactiveRes = await request(app)
      .post('/api/courses')
      .set('Authorization', `Bearer ${adminSession.token}`)
      .send({
        name: 'M.Tech AI',
        code: 'MTECH-AI',
        departmentId: inactiveDept._id.toString(),
        level: 'POSTGRADUATE'
      });
    assert.equal(inactiveRes.status, 400);
  });

  await t.test('Prevents duplicate course codes', async () => {
    const adminSession = await createAuthenticatedSession(ROLE_IDS.SUPER_ADMIN);
    const dept = await Department.create({ name: 'Science', code: 'SCI', isActive: true });

    await request(app)
      .post('/api/courses')
      .set('Authorization', `Bearer ${adminSession.token}`)
      .send({
        name: 'B.Sc Physics',
        code: 'BSC-PHY',
        departmentId: dept._id.toString(),
        level: 'UNDERGRADUATE'
      });

    // Duplicate code (case-insensitive)
    const dupRes = await request(app)
      .post('/api/courses')
      .set('Authorization', `Bearer ${adminSession.token}`)
      .send({
        name: 'B.Sc Physics Hons',
        code: 'bsc-phy',
        departmentId: dept._id.toString(),
        level: 'UNDERGRADUATE'
      });

    assert.equal(dupRes.status, 409);
  });

  await t.test('Placement Head can list, search, filter, update and deactivate a course', async () => {
    const headSession = await createAuthenticatedSession(ROLE_IDS.PLACEMENT_HEAD);
    const dept = await Department.create({ name: 'Commerce', code: 'COM', isActive: true });

    const createRes = await request(app)
      .post('/api/courses')
      .set('Authorization', `Bearer ${headSession.token}`)
      .send({
        name: 'Master of Business Administration',
        code: 'MBA',
        departmentId: dept._id.toString(),
        level: 'POSTGRADUATE',
        durationYears: 2
      });

    assert.equal(createRes.status, 201);
    const courseId = createRes.body.data._id;

    // Filter & Search
    const listRes = await request(app)
      .get(`/api/courses?departmentId=${dept._id.toString()}&level=POSTGRADUATE&search=Business`)
      .set('Authorization', `Bearer ${headSession.token}`);

    assert.equal(listRes.status, 200);
    assert.equal(listRes.body.data.items.length, 1);

    // Update
    const updateRes = await request(app)
      .patch(`/api/courses/${courseId}`)
      .set('Authorization', `Bearer ${headSession.token}`)
      .send({ description: '2-year executive management course' });

    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.data.description, '2-year executive management course');

    // Deactivate
    const statusRes = await request(app)
      .patch(`/api/courses/${courseId}/status`)
      .set('Authorization', `Bearer ${headSession.token}`)
      .send({ isActive: false });

    assert.equal(statusRes.status, 200);
    assert.equal(statusRes.body.data.isActive, false);

    // Verify record is preserved in DB
    const dbCourse = await Course.findById(courseId);
    assert.ok(dbCourse);
    assert.equal(dbCourse.isActive, false);
  });

  await t.test('Placement Coordinator with COURSE_READ can view but cannot create or update', async () => {
    const dept = await Department.create({ name: 'Arts', code: 'ARTS', isActive: true });
    const coordSession = await createAuthenticatedSession(ROLE_IDS.PLACEMENT_COORDINATOR);
    await PlacementOfficer.create({
      userId: coordSession.user._id,
      employeeId: coordSession.user.employeeId,
      firstName: 'Arts',
      lastName: 'Coordinator',
      email: coordSession.user.email,
      mobileNumber: '9876543210',
      designation: 'Assistant Professor',
      department: dept.name,
      departmentId: dept._id,
      role: ROLE_IDS.PLACEMENT_COORDINATOR
    });
    const course = await Course.create({
      name: 'BA History',
      code: 'BA-HIST',
      departmentId: dept._id,
      level: 'UNDERGRADUATE',
      isActive: true
    });

    // Read allowed
    const readRes = await request(app)
      .get(`/api/courses/${course._id}`)
      .set('Authorization', `Bearer ${coordSession.token}`);
    assert.equal(readRes.status, 200);
    assert.equal(readRes.body.data.code, 'BA-HIST');

    // Create denied
    const createRes = await request(app)
      .post('/api/courses')
      .set('Authorization', `Bearer ${coordSession.token}`)
      .send({
        name: 'MA History',
        code: 'MA-HIST',
        departmentId: dept._id.toString(),
        level: 'POSTGRADUATE'
      });
    assert.equal(createRes.status, 403);

    // Update denied
    const updateRes = await request(app)
      .patch(`/api/courses/${course._id}`)
      .set('Authorization', `Bearer ${coordSession.token}`)
      .send({ description: 'New description' });
    assert.equal(updateRes.status, 403);
  });
});
