import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import * as xlsx from 'xlsx';

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
  { Student },
  { PlacementOfficer },
  { Department },
  { Course },
  { Role },
  { hashPassword },
  { createRawSessionToken, hashSessionToken },
  { ROLE_IDS, PERMISSION_IDS }
] = await Promise.all([
  import('../src/app.js'),
  import('../src/config/database.js'),
  import('../src/seeders/seed.js'),
  import('../src/models/user.model.js'),
  import('../src/models/user-session.model.js'),
  import('../src/models/student.model.js'),
  import('../src/models/placement_officer.model.js'),
  import('../src/models/department.model.js'),
  import('../src/models/course.model.js'),
  import('../src/models/role.model.js'),
  import('../src/utils/password.js'),
  import('../src/utils/session-token.js'),
  import('../src/utils/access-constants.js')
]);

let mongo;
let app;

// Global department & course references
let deptA;
let deptB;
let deptInactive;
let courseA;
let courseB;

async function createAuthenticatedSession(roleId, userType = 'PLACEMENT', extraUserData = {}) {
  const ts = Date.now() + Math.floor(Math.random() * 1000000);
  const email = `test-${roleId.toLowerCase()}-${ts}@vvwu.ac.in`;
  const passwordHash = await hashPassword('Password!123456');

  const user = await User.create({
    email,
    passwordHash,
    userType,
    roleId,
    employeeId: userType === 'PLACEMENT' ? `EMP-${ts}` : undefined,
    universityId: userType === 'STUDENT' ? `U${ts}` : undefined,
    accountStatus: 'ACTIVE',
    ...extraUserData
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

async function createCoordinatorSession(departmentDoc) {
  const session = await createAuthenticatedSession(ROLE_IDS.PLACEMENT_COORDINATOR, 'PLACEMENT');
  const officer = await PlacementOfficer.create({
    userId: session.user._id,
    employeeId: session.user.employeeId,
    firstName: 'Coordinator',
    lastName: departmentDoc.code,
    email: session.user.email,
    mobileNumber: '9876543210',
    designation: 'Department Coordinator',
    role: 'ROLE_PLACEMENT_COORDINATOR',
    departmentId: departmentDoc._id,
    department: departmentDoc.name
  });
  return { ...session, officer };
}

async function createPlacementHeadSession() {
  const session = await createAuthenticatedSession(ROLE_IDS.PLACEMENT_HEAD, 'PLACEMENT');
  const officer = await PlacementOfficer.create({
    userId: session.user._id,
    employeeId: session.user.employeeId,
    firstName: 'Placement',
    lastName: 'Head',
    email: session.user.email,
    mobileNumber: '9876543211',
    designation: 'Placement Head',
    role: 'ROLE_PLACEMENT_HEAD'
  });
  return { ...session, officer };
}

before(async () => {
  mongo = await MongoMemoryServer.create();
  await connectDatabase(mongo.getUri());
  await seedInitialData();
  app = createApp();

  deptA = await Department.create({
    name: 'Computer Science and Engineering',
    code: 'CSE',
    description: 'CSE Department',
    isActive: true
  });

  deptB = await Department.create({
    name: 'Mechanical Engineering',
    code: 'MECH',
    description: 'Mechanical Dept',
    isActive: true
  });

  deptInactive = await Department.create({
    name: 'Civil Engineering',
    code: 'CIVIL',
    description: 'Civil Dept Inactive',
    isActive: false
  });

  courseA = await Course.create({
    name: 'B.Tech Computer Science',
    code: 'BTECH-CSE',
    departmentId: deptA._id,
    level: 'UNDERGRADUATE',
    durationYears: 4,
    isActive: true
  });

  courseB = await Course.create({
    name: 'B.Tech Mechanical Engineering',
    code: 'BTECH-MECH',
    departmentId: deptB._id,
    level: 'UNDERGRADUATE',
    durationYears: 4,
    isActive: true
  });
});

after(async () => {
  await disconnectDatabase();
  if (mongo) await mongo.stop();
});

beforeEach(async () => {
  await Student.deleteMany({});
  await PlacementOfficer.deleteMany({});
  await User.deleteMany({ roleId: { $ne: ROLE_IDS.SUPER_ADMIN } });
  await UserSession.deleteMany({});
});

// ============================================================================
// PART 1: PLACEMENT CELL / PLACEMENT OFFICER ACCESS RESTRICTIONS
// ============================================================================
test('1.1 Placement Coordinator cannot list placement officers (GET /api/placement-officers -> 403)', async () => {
  const coord = await createCoordinatorSession(deptA);

  const res = await request(app)
    .get('/api/placement-officers')
    .set('Authorization', `Bearer ${coord.token}`);

  assert.equal(res.status, 403);
  assert.equal(res.body.success, false);
});

test('1.2 Placement Coordinator cannot read single placement officer record (GET /api/placement-officers/:id -> 403)', async () => {
  const head = await createPlacementHeadSession();
  const coord = await createCoordinatorSession(deptA);

  const res = await request(app)
    .get(`/api/placement-officers/${head.officer._id}`)
    .set('Authorization', `Bearer ${coord.token}`);

  assert.equal(res.status, 403);
  assert.equal(res.body.success, false);
});

test('1.3 Placement Coordinator cannot create a placement officer (POST /api/placement-officers -> 403)', async () => {
  const coord = await createCoordinatorSession(deptA);

  const res = await request(app)
    .post('/api/placement-officers')
    .set('Authorization', `Bearer ${coord.token}`)
    .send({
      firstName: 'New',
      lastName: 'Officer',
      email: 'new.officer@vvwu.ac.in',
      mobileNumber: '9123456780',
      role: 'ROLE_PLACEMENT_COORDINATOR',
      departmentId: String(deptA._id)
    });

  assert.equal(res.status, 403);
});

test('1.4 Placement Coordinator cannot update a placement officer (PUT /api/placement-officers/:id -> 403)', async () => {
  const head = await createPlacementHeadSession();
  const coord = await createCoordinatorSession(deptA);

  const res = await request(app)
    .put(`/api/placement-officers/${head.officer._id}`)
    .set('Authorization', `Bearer ${coord.token}`)
    .send({ designation: 'Updated Head' });

  assert.equal(res.status, 403);
});

test('1.5 Placement Coordinator cannot delete a placement officer (DELETE /api/placement-officers/:id -> 403)', async () => {
  const head = await createPlacementHeadSession();
  const coord = await createCoordinatorSession(deptA);

  const res = await request(app)
    .delete(`/api/placement-officers/${head.officer._id}`)
    .set('Authorization', `Bearer ${coord.token}`);

  assert.equal(res.status, 403);
});

test('1.6 Placement Coordinator cannot export placement officers data (GET /api/imports/export/placement -> 403)', async () => {
  const coord = await createCoordinatorSession(deptA);

  const res = await request(app)
    .get('/api/imports/export/placement')
    .set('Authorization', `Bearer ${coord.token}`);

  assert.equal(res.status, 403);
});

test('1.7 Placement Coordinator cannot validate/import placement officers (POST /api/imports/validate/placement -> 403)', async () => {
  const coord = await createCoordinatorSession(deptA);

  const res = await request(app)
    .post('/api/imports/validate/placement')
    .set('Authorization', `Bearer ${coord.token}`)
    .send({ rows: [] });

  assert.equal(res.status, 403);
});

test('1.8 Authorized roles (Super Admin and Placement Head) retain placement officer access', async () => {
  const admin = await createAuthenticatedSession(ROLE_IDS.SUPER_ADMIN, 'PLACEMENT');
  const head = await createPlacementHeadSession();

  // Super Admin can list placement officers
  const adminList = await request(app)
    .get('/api/placement-officers')
    .set('Authorization', `Bearer ${admin.token}`);
  assert.equal(adminList.status, 200);
  assert.equal(adminList.body.success, true);

  // Placement Head can list placement officers
  const headList = await request(app)
    .get('/api/placement-officers')
    .set('Authorization', `Bearer ${head.token}`);
  assert.equal(headList.status, 200);
  assert.equal(headList.body.success, true);

  // Super Admin can export placement officers
  const adminExport = await request(app)
    .get('/api/imports/export/placement')
    .set('Authorization', `Bearer ${admin.token}`);
  assert.equal(adminExport.status, 200);

  // Placement Head can export placement officers
  const headExport = await request(app)
    .get('/api/imports/export/placement')
    .set('Authorization', `Bearer ${head.token}`);
  assert.equal(headExport.status, 200);
});

// ============================================================================
// PART 2: DEPARTMENT-LEVEL STUDENT DATA ISOLATION
// ============================================================================
test('2.1 Placement Coordinator can access only students in their own department', async () => {
  const coordA = await createCoordinatorSession(deptA);

  // Create Student A in Department A
  const studentUserA = await createAuthenticatedSession(ROLE_IDS.STUDENT, 'STUDENT');
  const studentA = await Student.create({
    userId: studentUserA.user._id,
    universityId: 'U-CSE-001',
    firstName: 'Alice',
    lastName: 'Sharma',
    email: 'alice.cse@vvwu.ac.in',
    mobileNumber: '9876543210',
    departmentId: deptA._id,
    department: deptA.name,
    courseId: courseA._id,
    branch: courseA.name,
    semester: 6,
    cgpa: 8.5
  });

  // Create Student B in Department B
  const studentUserB = await createAuthenticatedSession(ROLE_IDS.STUDENT, 'STUDENT');
  const studentB = await Student.create({
    userId: studentUserB.user._id,
    universityId: 'U-MECH-001',
    firstName: 'Bob',
    lastName: 'Patel',
    email: 'bob.mech@vvwu.ac.in',
    mobileNumber: '9876543211',
    departmentId: deptB._id,
    department: deptB.name,
    courseId: courseB._id,
    branch: courseB.name,
    semester: 6,
    cgpa: 7.9
  });

  // Coordinator A lists students -> must see ONLY Student A
  const listRes = await request(app)
    .get('/api/students')
    .set('Authorization', `Bearer ${coordA.token}`);
  assert.equal(listRes.status, 200);
  assert.equal(listRes.body.data.total, 1);
  assert.equal(listRes.body.data.items.length, 1);
  assert.equal(listRes.body.data.items[0].universityId, 'U-CSE-001');

  // Coordinator A reads Student A by ID -> 200
  const detailA = await request(app)
    .get(`/api/students/${studentA._id}`)
    .set('Authorization', `Bearer ${coordA.token}`);
  assert.equal(detailA.status, 200);
  assert.equal(detailA.body.data.universityId, 'U-CSE-001');

  // Coordinator A reads Student B by ID -> 403 Forbidden
  const detailB = await request(app)
    .get(`/api/students/${studentB._id}`)
    .set('Authorization', `Bearer ${coordA.token}`);
  assert.equal(detailB.status, 403);
  assert.equal(detailB.body.success, false);

  // Coordinator A attempts to query Department B via filter -> returns empty (cannot see Student B)
  const filterDeptB = await request(app)
    .get(`/api/students?departmentId=${deptB._id}`)
    .set('Authorization', `Bearer ${coordA.token}`);
  assert.equal(filterDeptB.status, 200);
  assert.equal(filterDeptB.body.data.total, 0);
  assert.equal(filterDeptB.body.data.items.length, 0);
});

test('2.2 Placement Coordinator cannot create a student in another department', async () => {
  const coordA = await createCoordinatorSession(deptA);

  // Attempt to create student in Department B
  const res = await request(app)
    .post('/api/students')
    .set('Authorization', `Bearer ${coordA.token}`)
    .send({
      universityId: 'U-MECH-999',
      firstName: 'Malicious',
      lastName: 'Attempt',
      email: 'malicious@vvwu.ac.in',
      mobileNumber: '9988776655',
      departmentId: String(deptB._id),
      department: deptB.name,
      courseId: String(courseB._id),
      branch: courseB.name,
      semester: 4,
      cgpa: 7.5
    });

  assert.equal(res.status, 403);
});

test('2.3 Placement Coordinator creating student cannot select course from another department', async () => {
  const coordA = await createCoordinatorSession(deptA);

  // Attempt to create student in Department A with Course B (from Department B)
  const res = await request(app)
    .post('/api/students')
    .set('Authorization', `Bearer ${coordA.token}`)
    .send({
      universityId: 'U-CSE-998',
      firstName: 'Cross',
      lastName: 'Course',
      email: 'cross.course@vvwu.ac.in',
      mobileNumber: '9988776654',
      departmentId: String(deptA._id),
      department: deptA.name,
      courseId: String(courseB._id), // Belongs to deptB!
      branch: courseB.name,
      semester: 4,
      cgpa: 7.5
    });

  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'INVALID_COURSE_DEPARTMENT');
});

test('2.4 Placement Coordinator cannot update or move a student to another department', async () => {
  const coordA = await createCoordinatorSession(deptA);

  const studentUserA = await createAuthenticatedSession(ROLE_IDS.STUDENT, 'STUDENT');
  const studentA = await Student.create({
    userId: studentUserA.user._id,
    universityId: 'U-CSE-002',
    firstName: 'Charlie',
    lastName: 'Brown',
    email: 'charlie.cse@vvwu.ac.in',
    mobileNumber: '9876543212',
    departmentId: deptA._id,
    department: deptA.name,
    courseId: courseA._id,
    branch: courseA.name,
    semester: 4,
    cgpa: 8.0
  });

  const studentUserB = await createAuthenticatedSession(ROLE_IDS.STUDENT, 'STUDENT');
  const studentB = await Student.create({
    userId: studentUserB.user._id,
    universityId: 'U-MECH-002',
    firstName: 'David',
    lastName: 'Miller',
    email: 'david.mech@vvwu.ac.in',
    mobileNumber: '9876543213',
    departmentId: deptB._id,
    department: deptB.name,
    courseId: courseB._id,
    branch: courseB.name,
    semester: 4,
    cgpa: 7.0
  });

  // Coordinator A updating Student B -> 403 Forbidden
  const updateB = await request(app)
    .put(`/api/students/${studentB._id}`)
    .set('Authorization', `Bearer ${coordA.token}`)
    .send({ firstName: 'Hacked' });
  assert.equal(updateB.status, 403);

  // Coordinator A attempting to move Student A to Department B -> 403 Forbidden
  const moveA = await request(app)
    .put(`/api/students/${studentA._id}`)
    .set('Authorization', `Bearer ${coordA.token}`)
    .send({ departmentId: String(deptB._id) });
  assert.equal(moveA.status, 403);

  // Coordinator A updating Student A within Department A -> 200
  const updateA = await request(app)
    .put(`/api/students/${studentA._id}`)
    .set('Authorization', `Bearer ${coordA.token}`)
    .send({ firstName: 'Charles' });
  assert.equal(updateA.status, 200);
  assert.equal(updateA.body.data.firstName, 'Charles');
});

test('2.5 Student Excel export includes ONLY students from coordinator assigned department', async () => {
  const coordA = await createCoordinatorSession(deptA);

  // Student in Department A
  const uA = await createAuthenticatedSession(ROLE_IDS.STUDENT, 'STUDENT');
  await Student.create({
    userId: uA.user._id,
    universityId: 'U-CSE-EXPORT',
    firstName: 'Export',
    lastName: 'A',
    email: 'export.a@vvwu.ac.in',
    mobileNumber: '9876543201',
    departmentId: deptA._id,
    department: deptA.name,
    courseId: courseA._id,
    branch: courseA.name,
    semester: 6,
    cgpa: 9.0
  });

  // Student in Department B
  const uB = await createAuthenticatedSession(ROLE_IDS.STUDENT, 'STUDENT');
  await Student.create({
    userId: uB.user._id,
    universityId: 'U-MECH-EXPORT',
    firstName: 'Export',
    lastName: 'B',
    email: 'export.b@vvwu.ac.in',
    mobileNumber: '9876543202',
    departmentId: deptB._id,
    department: deptB.name,
    courseId: courseB._id,
    branch: courseB.name,
    semester: 6,
    cgpa: 8.0
  });

  // Coordinator A exports all students (filtered=false)
  const res = await request(app)
    .get('/api/imports/export/student?filtered=false')
    .set('Authorization', `Bearer ${coordA.token}`)
    .responseType('blob');

  assert.equal(res.status, 200);

  const workbook = xlsx.read(res.body, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet);

  assert.equal(rows.length, 1);
  assert.equal(rows[0]['University ID'], 'U-CSE-EXPORT');
});

test('2.6 Student Excel import validation rejects rows from another department', async () => {
  const coordA = await createCoordinatorSession(deptA);

  const res = await request(app)
    .post('/api/imports/validate/student')
    .set('Authorization', `Bearer ${coordA.token}`)
    .send({
      rows: [
        {
          universityId: 'U-NEW-CSE',
          firstName: 'Good',
          lastName: 'Student',
          email: 'good.student@vvwu.ac.in',
          mobileNumber: '9876543210',
          department: deptA.name,
          branch: courseA.name,
          semester: 4,
          passingYear: 2026,
          cgpa: 8.5
        },
        {
          universityId: 'U-BAD-MECH',
          firstName: 'Bad',
          lastName: 'Student',
          email: 'bad.student@vvwu.ac.in',
          mobileNumber: '9876543211',
          department: deptB.name, // Other department!
          branch: courseB.name,
          semester: 4,
          passingYear: 2026,
          cgpa: 8.5
        }
      ]
    });

  assert.equal(res.status, 200);
  assert.equal(res.body.data.validCount, 1);
  assert.equal(res.body.data.invalidCount, 1);

  const invalidItem = res.body.data.preview.find((p) => p.data.universityId === 'U-BAD-MECH');
  assert.equal(invalidItem.status, 'INVALID');
  assert.ok(invalidItem.errors.some((e) => e.includes('assigned department')));
});

test('2.7 Private student profile cannot be accessed by coordinator of another department', async () => {
  const coordA = await createCoordinatorSession(deptA);

  const uB = await createAuthenticatedSession(ROLE_IDS.STUDENT, 'STUDENT');
  const studentB = await Student.create({
    userId: uB.user._id,
    universityId: 'U-PRIVATE-MECH',
    firstName: 'Private',
    lastName: 'Mech',
    email: 'private.mech@vvwu.ac.in',
    mobileNumber: '9876543209',
    departmentId: deptB._id,
    department: deptB.name,
    courseId: courseB._id,
    branch: courseB.name,
    semester: 4,
    cgpa: 8.0,
    isPublicProfile: false // Private profile!
  });

  const res = await request(app)
    .get(`/api/students/public/${studentB._id}`)
    .set('Authorization', `Bearer ${coordA.token}`);

  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'PROFILE_PRIVATE');
});

// ============================================================================
// PART 3: DEPARTMENT-LEVEL COURSE DATA ISOLATION
// ============================================================================
test('3.1 Placement Coordinator can access only courses belonging to their assigned department', async () => {
  const coordA = await createCoordinatorSession(deptA);

  // List courses
  const res = await request(app)
    .get('/api/courses')
    .set('Authorization', `Bearer ${coordA.token}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.data.total, 1);
  assert.equal(res.body.data.items.length, 1);
  assert.equal(res.body.data.items[0]._id, String(courseA._id));

  // Access Course A detail -> 200
  const detailA = await request(app)
    .get(`/api/courses/${courseA._id}`)
    .set('Authorization', `Bearer ${coordA.token}`);
  assert.equal(detailA.status, 200);
  assert.equal(detailA.body.data.code, 'BTECH-CSE');

  // Access Course B detail -> 403 Forbidden
  const detailB = await request(app)
    .get(`/api/courses/${courseB._id}`)
    .set('Authorization', `Bearer ${coordA.token}`);
  assert.equal(detailB.status, 403);
  assert.equal(detailB.body.success, false);
});

test('3.2 Placement Coordinator cannot create or update courses (no COURSE_CREATE / COURSE_UPDATE permissions)', async () => {
  const coordA = await createCoordinatorSession(deptA);

  // Attempt course creation
  const createRes = await request(app)
    .post('/api/courses')
    .set('Authorization', `Bearer ${coordA.token}`)
    .send({
      name: 'M.Tech CSE',
      code: 'MTECH-CSE',
      departmentId: String(deptA._id),
      level: 'POSTGRADUATE'
    });
  assert.equal(createRes.status, 403);

  // Attempt course update
  const updateRes = await request(app)
    .patch(`/api/courses/${courseA._id}`)
    .set('Authorization', `Bearer ${coordA.token}`)
    .send({ name: 'Renamed Course' });
  assert.equal(updateRes.status, 403);
});

// ============================================================================
// PART 4: FAIL CLOSED ON MISSING OR INACTIVE DEPARTMENT
// ============================================================================
test('4.1 Placement Coordinator with no linked profile fails closed (403 Forbidden)', async () => {
  // Coordinator user without a PlacementOfficer document
  const coordNoProfile = await createAuthenticatedSession(ROLE_IDS.PLACEMENT_COORDINATOR, 'PLACEMENT');

  const res = await request(app)
    .get('/api/students')
    .set('Authorization', `Bearer ${coordNoProfile.token}`);

  assert.equal(res.status, 403);
  assert.ok(res.body.error.message.includes('No Placement Officer profile linked'));
});

test('4.2 Placement Coordinator with inactive department fails closed (403 Forbidden)', async () => {
  const coordInactive = await createCoordinatorSession(deptInactive);

  const res = await request(app)
    .get('/api/students')
    .set('Authorization', `Bearer ${coordInactive.token}`);

  assert.equal(res.status, 403);
  assert.ok(res.body.error.message.includes('inactive'));
});

// ============================================================================
// PART 5: REGRESSION & MULTI-ROLE VERIFICATION
// ============================================================================
test('5.1 Placement Head and Super Admin retain cross-department access for students & courses', async () => {
  const admin = await createAuthenticatedSession(ROLE_IDS.SUPER_ADMIN, 'PLACEMENT');
  const head = await createPlacementHeadSession();

  // Seed student in dept A and student in dept B
  const uA = await createAuthenticatedSession(ROLE_IDS.STUDENT, 'STUDENT');
  await Student.create({
    userId: uA.user._id,
    universityId: 'U-REG-A',
    firstName: 'RegA',
    lastName: 'A',
    email: 'rega@vvwu.ac.in',
    mobileNumber: '9876543291',
    departmentId: deptA._id,
    department: deptA.name,
    courseId: courseA._id,
    branch: courseA.name,
    semester: 4,
    cgpa: 8.0
  });

  const uB = await createAuthenticatedSession(ROLE_IDS.STUDENT, 'STUDENT');
  await Student.create({
    userId: uB.user._id,
    universityId: 'U-REG-B',
    firstName: 'RegB',
    lastName: 'B',
    email: 'regb@vvwu.ac.in',
    mobileNumber: '9876543292',
    departmentId: deptB._id,
    department: deptB.name,
    courseId: courseB._id,
    branch: courseB.name,
    semester: 4,
    cgpa: 8.0
  });

  // Admin lists students -> sees both (2)
  const adminStudents = await request(app)
    .get('/api/students')
    .set('Authorization', `Bearer ${admin.token}`);
  assert.equal(adminStudents.status, 200);
  assert.equal(adminStudents.body.data.total, 2);

  // Placement Head lists students -> sees both (2)
  const headStudents = await request(app)
    .get('/api/students')
    .set('Authorization', `Bearer ${head.token}`);
  assert.equal(headStudents.status, 200);
  assert.equal(headStudents.body.data.total, 2);

  // Admin lists courses -> sees both (2)
  const adminCourses = await request(app)
    .get('/api/courses')
    .set('Authorization', `Bearer ${admin.token}`);
  assert.equal(adminCourses.status, 200);
  assert.equal(adminCourses.body.data.total, 2);

  // Placement Head lists courses -> sees both (2)
  const headCourses = await request(app)
    .get('/api/courses')
    .set('Authorization', `Bearer ${head.token}`);
  assert.equal(headCourses.status, 200);
  assert.equal(headCourses.body.data.total, 2);
});

test('5.2 GET /api/auth/me enriches department info for Placement Coordinator', async () => {
  const coordA = await createCoordinatorSession(deptA);

  const res = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${coordA.token}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.data.user.roleId, ROLE_IDS.PLACEMENT_COORDINATOR);
  assert.equal(res.body.data.user.departmentId, String(deptA._id));
  assert.equal(res.body.data.user.departmentName, deptA.name);
  assert.equal(res.body.data.user.departmentCode, deptA.code);
});

// ============================================================================
// PART 6: DEPARTMENT-LEVEL DEPARTMENT API ISOLATION
// ============================================================================
test('6.1 Placement Coordinator can access only their own department via GET /api/departments', async () => {
  const coordA = await createCoordinatorSession(deptA);

  // Coordinator A lists departments -> returns only Dept A
  const res = await request(app)
    .get('/api/departments')
    .set('Authorization', `Bearer ${coordA.token}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.data.total, 1);
  assert.equal(res.body.data.items.length, 1);
  assert.equal(res.body.data.items[0]._id, String(deptA._id));
  assert.equal(res.body.data.items[0].name, deptA.name);

  // Super Admin lists departments -> sees all departments (at least 2)
  const admin = await createAuthenticatedSession(ROLE_IDS.SUPER_ADMIN, 'PLACEMENT');
  const adminRes = await request(app)
    .get('/api/departments')
    .set('Authorization', `Bearer ${admin.token}`);
  assert.equal(adminRes.status, 200);
  assert.ok(adminRes.body.data.total >= 2);
});

test('6.2 Placement Coordinator cannot read another department record by ID via GET /api/departments/:id', async () => {
  const coordA = await createCoordinatorSession(deptA);

  // Coordinator A reads own department -> 200
  const ownRes = await request(app)
    .get(`/api/departments/${deptA._id}`)
    .set('Authorization', `Bearer ${coordA.token}`);
  assert.equal(ownRes.status, 200);
  assert.equal(ownRes.body.data.name, deptA.name);

  // Coordinator A attempts to read Department B -> 403 Forbidden
  const otherRes = await request(app)
    .get(`/api/departments/${deptB._id}`)
    .set('Authorization', `Bearer ${coordA.token}`);
  assert.equal(otherRes.status, 403);
  assert.equal(otherRes.body.success, false);
});

test('6.3 Placement Coordinator cannot delete other placement officers or administrators', async () => {
  const coordA = await createCoordinatorSession(deptA);
  const officerUser = await createAuthenticatedSession(ROLE_IDS.PLACEMENT_COORDINATOR, 'PLACEMENT');

  const res = await request(app)
    .delete(`/api/users/${officerUser.user._id}`)
    .set('Authorization', `Bearer ${coordA.token}`);

  assert.equal(res.status, 403);
  assert.equal(res.body.success, false);
});
