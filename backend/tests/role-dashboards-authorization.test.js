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
  { Student },
  { Company },
  { hashPassword },
  { createRawSessionToken, hashSessionToken },
  { ROLE_IDS }
] = await Promise.all([
  import('../src/app.js'),
  import('../src/config/database.js'),
  import('../src/seeders/seed.js'),
  import('../src/models/user.model.js'),
  import('../src/models/user-session.model.js'),
  import('../src/models/student.model.js'),
  import('../src/models/company.model.js'),
  import('../src/utils/password.js'),
  import('../src/utils/session-token.js'),
  import('../src/utils/access-constants.js')
]);

let mongo;
let app;

async function createAuthenticatedSession(roleId, userType = 'PLACEMENT', linkedCompanyId = null, extraUserData = {}) {
  const ts = Date.now() + Math.floor(Math.random() * 100000);
  const email = `test-${roleId.toLowerCase()}-${ts}@vvwu.ac.in`;
  const passwordHash = await hashPassword('Password!123456');

  const user = await User.create({
    email,
    passwordHash,
    userType,
    roleId,
    employeeId: userType === 'PLACEMENT' ? `EMP-${ts}` : undefined,
    universityId: userType === 'STUDENT' ? `U${ts}` : undefined,
    companyId: linkedCompanyId || undefined,
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

before(async () => {
  mongo = await MongoMemoryServer.create();
  await connectDatabase(mongo.getUri());
  await seedInitialData();
  app = createApp();
});

after(async () => {
  await disconnectDatabase();
  if (mongo) await mongo.stop();
});

beforeEach(async () => {
  await Student.deleteMany({});
  await Company.deleteMany({});
  await User.deleteMany({ roleId: { $ne: ROLE_IDS.SUPER_ADMIN } });
  await UserSession.deleteMany({});
});

test('1. Super Admin retains administrative access to all system endpoints', async () => {
  const admin = await createAuthenticatedSession(ROLE_IDS.SUPER_ADMIN, 'PLACEMENT');

  const meRes = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${admin.token}`);
  assert.equal(meRes.status, 200);
  assert.equal(meRes.body.data.role.id, ROLE_IDS.SUPER_ADMIN);

  const studentsRes = await request(app)
    .get('/api/students')
    .set('Authorization', `Bearer ${admin.token}`);
  assert.equal(studentsRes.status, 200);

  const companiesRes = await request(app)
    .get('/api/companies')
    .set('Authorization', `Bearer ${admin.token}`);
  assert.equal(companiesRes.status, 200);

  const sessionsRes = await request(app)
    .get('/api/sessions')
    .set('Authorization', `Bearer ${admin.token}`);
  assert.equal(sessionsRes.status, 200);
});

test('2. Student user can only access own profile via /api/students/me and is blocked from administrative endpoints', async () => {
  const studentSession = await createAuthenticatedSession(ROLE_IDS.STUDENT, 'STUDENT');

  // Create student profile record linked to this user
  await Student.create({
    userId: studentSession.user._id,
    universityId: studentSession.user.universityId,
    firstName: 'Priya',
    lastName: 'Sharma',
    email: studentSession.user.email,
    mobileNumber: '9876543210',
    department: 'Computer Science',
    branch: 'B.Tech CSE',
    semester: 7,
    cgpa: 8.92,
    passingYear: 2026,
    backlogs: 0,
    isPublicProfile: false
  });

  // A. Student fetches own profile via /api/students/me -> Success 200
  const meProfileRes = await request(app)
    .get('/api/students/me')
    .set('Authorization', `Bearer ${studentSession.token}`);
  assert.equal(meProfileRes.status, 200);
  assert.equal(meProfileRes.body.data.firstName, 'Priya');
  assert.equal(meProfileRes.body.data.department, 'Computer Science');
  assert.equal(meProfileRes.body.data.cgpa, 8.92);

  // B. Student attempts to access global /api/students list -> Blocked 403
  const globalStudentsRes = await request(app)
    .get('/api/students')
    .set('Authorization', `Bearer ${studentSession.token}`);
  assert.equal(globalStudentsRes.status, 403);

  // C. Student attempts to access global /api/companies list -> Blocked 403
  const globalCompaniesRes = await request(app)
    .get('/api/companies')
    .set('Authorization', `Bearer ${studentSession.token}`);
  assert.equal(globalCompaniesRes.status, 403);

  // D. Student attempts to access audit /api/sessions -> Blocked 403
  const sessionsRes = await request(app)
    .get('/api/sessions')
    .set('Authorization', `Bearer ${studentSession.token}`);
  assert.equal(sessionsRes.status, 403);

  // E. Student attempts to query /api/companies/me -> Returns 404 (no company associated)
  const compMeRes = await request(app)
    .get('/api/companies/me')
    .set('Authorization', `Bearer ${studentSession.token}`);
  assert.equal(compMeRes.status, 404);
});

test('3. Student cannot access another student private academic details via direct ID', async () => {
  const studentA = await createAuthenticatedSession(ROLE_IDS.STUDENT, 'STUDENT');
  const studentB = await createAuthenticatedSession(ROLE_IDS.STUDENT, 'STUDENT');

  const privateStudentB = await Student.create({
    userId: studentB.user._id,
    universityId: studentB.user.universityId,
    firstName: 'Riya',
    lastName: 'Patel',
    email: studentB.user.email,
    mobileNumber: '9123456780',
    department: 'Information Technology',
    branch: 'B.Tech IT',
    semester: 5,
    cgpa: 9.15,
    isPublicProfile: false
  });

  // Student A attempts to access Student B's private profile via public route -> Blocked 403
  const accessRes = await request(app)
    .get(`/api/students/public/${privateStudentB._id}`)
    .set('Authorization', `Bearer ${studentA.token}`);
  assert.equal(accessRes.status, 403);

  // Student A attempts to access Student B via admin /api/students/:id endpoint -> Blocked 403
  const adminAccessRes = await request(app)
    .get(`/api/students/${privateStudentB._id}`)
    .set('Authorization', `Bearer ${studentA.token}`);
  assert.equal(adminAccessRes.status, 403);
});

test('4. Company recruiter accesses only authorized company data and is blocked from unauthorized endpoints', async () => {
  // Create Company A
  const companyA = await Company.create({
    companyId: 'COMP-0001',
    companyName: 'Acme Technologies',
    industryType: 'Software',
    hrRecruiterName: 'Anil Kumar',
    email: 'recruiter@acme.com',
    yearEstablished: 2015
  });

  // Create recruiter session for Company A
  const recruiterSession = await createAuthenticatedSession(
    ROLE_IDS.COMPANY,
    'COMPANY',
    companyA._id
  );

  // A. Recruiter fetches own company profile via /api/companies/me -> Success 200
  const compMeRes = await request(app)
    .get('/api/companies/me')
    .set('Authorization', `Bearer ${recruiterSession.token}`);
  assert.equal(compMeRes.status, 200);
  assert.equal(compMeRes.body.data.companyName, 'Acme Technologies');
  assert.equal(compMeRes.body.data.companyId, 'COMP-0001');

  // B. Recruiter attempts to access global /api/companies list -> Blocked 403
  const globalCompRes = await request(app)
    .get('/api/companies')
    .set('Authorization', `Bearer ${recruiterSession.token}`);
  assert.equal(globalCompRes.status, 403);

  // C. Recruiter attempts to access /api/sessions -> Blocked 403
  const sessionsRes = await request(app)
    .get('/api/sessions')
    .set('Authorization', `Bearer ${recruiterSession.token}`);
  assert.equal(sessionsRes.status, 403);

  // D. Recruiter attempts to access /api/students/me -> Returns 404
  const studentMeRes = await request(app)
    .get('/api/students/me')
    .set('Authorization', `Bearer ${recruiterSession.token}`);
  assert.equal(studentMeRes.status, 404);
});

test('5. Company recruiter cannot access or modify another company profile', async () => {
  const companyA = await Company.create({
    companyId: 'COMP-0001',
    companyName: 'Company Alpha',
    industryType: 'Software',
    hrRecruiterName: 'Alpha Recruiter',
    email: 'recruiter@alpha.com',
    yearEstablished: 2018
  });

  const companyB = await Company.create({
    companyId: 'COMP-0002',
    companyName: 'Company Beta',
    industryType: 'Finance',
    hrRecruiterName: 'Beta Recruiter',
    email: 'recruiter@beta.com',
    yearEstablished: 2020
  });

  const recruiterA = await createAuthenticatedSession(ROLE_IDS.COMPANY, 'COMPANY', companyA._id);

  // Recruiter A querying /me strictly returns Company A
  const profileRes = await request(app)
    .get('/api/companies/me')
    .set('Authorization', `Bearer ${recruiterA.token}`);
  assert.equal(profileRes.status, 200);
  assert.equal(profileRes.body.data.companyName, 'Company Alpha');
  assert.equal(profileRes.body.data.companyId, 'COMP-0001');

  // Recruiter A cannot update Company B via admin PUT /api/companies/:id -> Blocked 403
  const editBetaRes = await request(app)
    .put(`/api/companies/${companyB._id}`)
    .set('Authorization', `Bearer ${recruiterA.token}`)
    .send({ companyName: 'Hacked Beta' });
  assert.equal(editBetaRes.status, 403);

  // Verify Company B was not altered
  const bInDb = await Company.findById(companyB._id);
  assert.equal(bInDb.companyName, 'Company Beta');
});

test('6. Placement Coordinator cannot access session audit logs and respects existing RBAC permissions', async () => {
  const coordinator = await createAuthenticatedSession(ROLE_IDS.PLACEMENT_COORDINATOR, 'PLACEMENT');

  // A. Access /api/sessions -> Blocked 403
  const sessionRes = await request(app)
    .get('/api/sessions')
    .set('Authorization', `Bearer ${coordinator.token}`);
  assert.equal(sessionRes.status, 403);

  // B. Access permitted /api/students -> Success 200
  const studentsRes = await request(app)
    .get('/api/students')
    .set('Authorization', `Bearer ${coordinator.token}`);
  assert.equal(studentsRes.status, 200);
});

test('7. Placement Head cannot access session audit logs and has student/company management permissions', async () => {
  const head = await createAuthenticatedSession(ROLE_IDS.PLACEMENT_HEAD, 'PLACEMENT');

  // A. Access /api/sessions -> Blocked 403 (SESSION_READ is super admin only)
  const sessionRes = await request(app)
    .get('/api/sessions')
    .set('Authorization', `Bearer ${head.token}`);
  assert.equal(sessionRes.status, 403);

  // B. Access permitted /api/students -> Success 200
  const studentsRes = await request(app)
    .get('/api/students')
    .set('Authorization', `Bearer ${head.token}`);
  assert.equal(studentsRes.status, 200);

  // C. Access permitted /api/companies -> Success 200
  const companiesRes = await request(app)
    .get('/api/companies')
    .set('Authorization', `Bearer ${head.token}`);
  assert.equal(companiesRes.status, 200);
});
