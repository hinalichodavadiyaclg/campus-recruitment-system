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
  { Company },
  { Department },
  { Course },
  { Job },
  { Student },
  { hashPassword },
  { createRawSessionToken, hashSessionToken },
  { ROLE_IDS }
] = await Promise.all([
  import('../src/app.js'),
  import('../src/config/database.js'),
  import('../src/seeders/seed.js'),
  import('../src/models/user.model.js'),
  import('../src/models/user-session.model.js'),
  import('../src/models/company.model.js'),
  import('../src/models/department.model.js'),
  import('../src/models/course.model.js'),
  import('../src/models/job.model.js'),
  import('../src/models/student.model.js'),
  import('../src/utils/password.js'),
  import('../src/utils/session-token.js'),
  import('../src/utils/access-constants.js')
]);

let mongo;
let app;

async function createAuthenticatedSession(roleId, userType = 'PLACEMENT', linkedCompanyId = null) {
  const ts = Date.now() + Math.floor(Math.random() * 100000);
  const email = `test-${roleId.toLowerCase()}-${ts}@example.edu`;
  const passwordHash = await hashPassword('Password!123456');
  const user = await User.create({
    email,
    passwordHash,
    userType,
    roleId,
    employeeId: userType === 'PLACEMENT' ? `EMP-${ts}` : undefined,
    universityId: userType === 'STUDENT' ? `UNI-${ts}` : undefined,
    companyId: linkedCompanyId || undefined,
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

async function createTestCompany(suffix = '1') {
  return await Company.create({
    companyName: `Acme Corp ${suffix}`,
    industryType: 'Information Technology',
    yearEstablished: 2010,
    hrRecruiterName: `HR Manager ${suffix}`,
    email: `hr${suffix}@acmecorp.com`,
    companyId: `COMP-000${suffix}`
  });
}

function futureDate(days = 30) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function pastDate(days = 5) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
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
  await Job.deleteMany({});
  await Company.deleteMany({});
  await Department.deleteMany({});
  await Course.deleteMany({});
  await User.deleteMany({ roleId: { $ne: ROLE_IDS.SUPER_ADMIN } });
  await UserSession.deleteMany({});
});

test('Job Management Backend API Integration Tests', async (t) => {
  await t.test('1. Job Creation and Sequential Job IDs (JOB-0001, JOB-0002)', async () => {
    const company = await createTestCompany('1');
    const recruiter = await createAuthenticatedSession(ROLE_IDS.COMPANY, 'COMPANY', company._id);

    // Create First Job
    const job1Payload = {
      title: 'Full Stack Software Engineer',
      description: 'Looking for talented developers with React and Node.js proficiency.',
      jobType: 'FULL_TIME',
      category: 'Software Engineering',
      workMode: 'ON_SITE',
      location: 'Surat, Gujarat',
      vacancies: 3,
      compensation: {
        salaryMin: 400000,
        salaryMax: 700000,
        currency: 'INR',
        salaryFormat: 'PER_ANNUM'
      },
      deadline: futureDate(15),
      status: 'DRAFT'
    };

    const res1 = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${recruiter.token}`)
      .send(job1Payload);

    assert.equal(res1.status, 201, `Failed to create job: ${JSON.stringify(res1.body)}`);
    assert.equal(res1.body.data.jobId, 'JOB-0001');
    assert.equal(res1.body.data.title, 'Full Stack Software Engineer');
    assert.equal(res1.body.data.status, 'DRAFT');
    assert.equal(res1.body.data.recruitmentRound, 1);
    assert.equal(String(res1.body.data.companyId._id), String(company._id));

    // Create Second Job
    const job2Payload = {
      title: 'Data Analyst Intern',
      description: 'Internship role analyzing campus recruitment data trends.',
      jobType: 'INTERNSHIP',
      workMode: 'REMOTE',
      vacancies: 2,
      deadline: futureDate(20),
      status: 'OPEN'
    };

    const res2 = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${recruiter.token}`)
      .send(job2Payload);

    assert.equal(res2.status, 201);
    assert.equal(res2.body.data.jobId, 'JOB-0002');
    assert.equal(res2.body.data.status, 'OPEN');
    assert.ok(res2.body.data.publishedAt, 'publishedAt should be set for OPEN jobs');
  });

  await t.test('2. Concurrent Job Creation allocates unique sequential IDs without collisions', async () => {
    const company = await createTestCompany('conc');
    const recruiter = await createAuthenticatedSession(ROLE_IDS.COMPANY, 'COMPANY', company._id);

    const jobsPayloads = Array.from({ length: 5 }, (_, i) => ({
      title: `Concurrent Job Posting ${i + 1}`,
      description: `Description for job vacancy ${i + 1} with required qualifications.`,
      jobType: 'FULL_TIME',
      workMode: 'REMOTE',
      vacancies: 1,
      deadline: futureDate(10),
      status: 'DRAFT'
    }));

    const responses = await Promise.all(
      jobsPayloads.map((payload) =>
        request(app)
          .post('/api/jobs')
          .set('Authorization', `Bearer ${recruiter.token}`)
          .send(payload)
      )
    );

    for (const res of responses) {
      assert.equal(res.status, 201);
      assert.match(res.body.data.jobId, /^JOB-\d{4,}$/);
    }

    const jobIds = responses.map((r) => r.body.data.jobId);
    const uniqueIds = new Set(jobIds);
    assert.equal(uniqueIds.size, 5, 'All concurrent jobs must have unique IDs');
  });

  await t.test('3. Request Validation Failures', async () => {
    const company = await createTestCompany('val');
    const recruiter = await createAuthenticatedSession(ROLE_IDS.COMPANY, 'COMPANY', company._id);

    // On-site job without location
    const resNoLoc = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${recruiter.token}`)
      .send({
        title: 'Network Engineer',
        description: 'Requires on-premise hardware setup and management.',
        jobType: 'FULL_TIME',
        workMode: 'ON_SITE',
        vacancies: 2,
        deadline: futureDate(10)
      });
    assert.equal(resNoLoc.status, 400);

    // Vacancies < 1
    const resZeroVacancies = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${recruiter.token}`)
      .send({
        title: 'Network Engineer',
        description: 'Requires on-premise hardware setup and management.',
        jobType: 'FULL_TIME',
        workMode: 'REMOTE',
        vacancies: 0,
        deadline: futureDate(10)
      });
    assert.equal(resZeroVacancies.status, 400);

    // Salary max < salary min
    const resBadSalary = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${recruiter.token}`)
      .send({
        title: 'Network Engineer',
        description: 'Requires on-premise hardware setup and management.',
        jobType: 'FULL_TIME',
        workMode: 'REMOTE',
        vacancies: 1,
        compensation: {
          salaryMin: 500000,
          salaryMax: 300000
        },
        deadline: futureDate(10)
      });
    assert.equal(resBadSalary.status, 400);

    // CGPA out of bounds (> 10)
    const resBadCgpa = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${recruiter.token}`)
      .send({
        title: 'Network Engineer',
        description: 'Requires on-premise hardware setup and management.',
        jobType: 'FULL_TIME',
        workMode: 'REMOTE',
        vacancies: 1,
        eligibilityCriteria: {
          minCgpa: 11
        },
        deadline: futureDate(10)
      });
    assert.equal(resBadCgpa.status, 400);

    // Expired deadline when creating OPEN job
    const resExpired = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${recruiter.token}`)
      .send({
        title: 'Network Engineer',
        description: 'Requires on-premise hardware setup and management.',
        jobType: 'FULL_TIME',
        workMode: 'REMOTE',
        vacancies: 1,
        deadline: pastDate(2),
        status: 'OPEN'
      });
    assert.equal(resExpired.status, 400);
  });

  await t.test('4. Company Ownership and Cross-Company Isolation', async () => {
    const companyA = await createTestCompany('A');
    const recruiterA = await createAuthenticatedSession(ROLE_IDS.COMPANY, 'COMPANY', companyA._id);

    const companyB = await createTestCompany('B');
    const recruiterB = await createAuthenticatedSession(ROLE_IDS.COMPANY, 'COMPANY', companyB._id);

    // Company A creates draft job
    const createRes = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${recruiterA.token}`)
      .send({
        title: 'Job Owned By Company A',
        description: 'Proprietary internal company development vacancy.',
        jobType: 'FULL_TIME',
        workMode: 'REMOTE',
        vacancies: 1,
        deadline: futureDate(15),
        status: 'DRAFT'
      });
    assert.equal(createRes.status, 201);
    const jobAId = createRes.body.data._id;

    // Company B tries to get Company A's draft job -> 403 Forbidden
    const getRes = await request(app)
      .get(`/api/jobs/${jobAId}`)
      .set('Authorization', `Bearer ${recruiterB.token}`);
    assert.equal(getRes.status, 403);

    // Company B tries to update Company A's job -> 403 Forbidden
    const updateRes = await request(app)
      .put(`/api/jobs/${jobAId}`)
      .set('Authorization', `Bearer ${recruiterB.token}`)
      .send({
        title: 'Malicious Update by Company B'
      });
    assert.equal(updateRes.status, 403);

    // Company B tries to change status of Company A's job -> 403 Forbidden
    const statusRes = await request(app)
      .patch(`/api/jobs/${jobAId}/status`)
      .set('Authorization', `Bearer ${recruiterB.token}`)
      .send({
        status: 'OPEN'
      });
    assert.equal(statusRes.status, 403);
  });

  await t.test('5. Role-Based Visibility (Student vs Placement vs Company)', async () => {
    const company = await createTestCompany('vis');
    const recruiter = await createAuthenticatedSession(ROLE_IDS.COMPANY, 'COMPANY', company._id);
    const student = await createAuthenticatedSession(ROLE_IDS.STUDENT, 'STUDENT');
    const coordinator = await createAuthenticatedSession(ROLE_IDS.PLACEMENT_COORDINATOR, 'PLACEMENT');
    const placementHead = await createAuthenticatedSession(ROLE_IDS.PLACEMENT_HEAD, 'PLACEMENT');

    // Create 1 Draft Job
    const draftRes = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${recruiter.token}`)
      .send({
        title: 'Draft Engineering Job',
        description: 'Not yet ready for student view or applications.',
        jobType: 'FULL_TIME',
        workMode: 'REMOTE',
        vacancies: 1,
        deadline: futureDate(10),
        status: 'DRAFT'
      });
    assert.equal(draftRes.status, 201);
    const draftJobId = draftRes.body.data._id;

    // Create 1 Open Job
    const openRes = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${recruiter.token}`)
      .send({
        title: 'Published Open Job',
        description: 'Available for qualified students to apply immediately.',
        jobType: 'FULL_TIME',
        workMode: 'REMOTE',
        vacancies: 2,
        deadline: futureDate(10),
        status: 'OPEN'
      });
    assert.equal(openRes.status, 201);
    const openJobId = openRes.body.data._id;

    // Student lists jobs: MUST only see the OPEN job
    const studentList = await request(app)
      .get('/api/jobs')
      .set('Authorization', `Bearer ${student.token}`);
    assert.equal(studentList.status, 200);
    assert.equal(studentList.body.data.items.length, 1);
    assert.equal(studentList.body.data.items[0]._id, openJobId);

    // Student tries to view draft job directly -> 404
    const studentGetDraft = await request(app)
      .get(`/api/jobs/${draftJobId}`)
      .set('Authorization', `Bearer ${student.token}`);
    assert.equal(studentGetDraft.status, 404);

    // Student views open job -> 200
    const studentGetOpen = await request(app)
      .get(`/api/jobs/${openJobId}`)
      .set('Authorization', `Bearer ${student.token}`);
    assert.equal(studentGetOpen.status, 200);

    // Student cannot create jobs -> 403
    const studentCreate = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${student.token}`)
      .send({
        title: 'Student Attempted Job',
        description: 'Students do not have JOB_CREATE permission.',
        jobType: 'FULL_TIME',
        workMode: 'REMOTE',
        vacancies: 1,
        deadline: futureDate(5)
      });
    assert.equal(studentCreate.status, 403);

    // Placement Coordinator can view all jobs
    const coordList = await request(app)
      .get('/api/jobs')
      .set('Authorization', `Bearer ${coordinator.token}`);
    assert.equal(coordList.status, 200);
    assert.equal(coordList.body.data.items.length, 2);

    // Placement Coordinator cannot create jobs (does not have JOB_CREATE)
    const coordCreate = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${coordinator.token}`)
      .send({
        title: 'Coordinator Attempted Job',
        description: 'Coordinator is read-only for jobs.',
        jobType: 'FULL_TIME',
        workMode: 'REMOTE',
        vacancies: 1,
        deadline: futureDate(5)
      });
    assert.equal(coordCreate.status, 403);

    // Placement Head can view all jobs and create jobs on behalf of company
    const headCreate = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${placementHead.token}`)
      .send({
        companyId: company._id,
        title: 'Placement Cell Sourced Job',
        description: 'Placement cell created on behalf of partner enterprise.',
        jobType: 'FULL_TIME',
        workMode: 'REMOTE',
        vacancies: 5,
        deadline: futureDate(20),
        status: 'OPEN'
      });
    assert.equal(headCreate.status, 201);
  });

  await t.test('6. Job Lifecycle Transitions (DRAFT -> OPEN -> PAUSED -> CLOSED -> REOPEN)', async () => {
    const company = await createTestCompany('life');
    const recruiter = await createAuthenticatedSession(ROLE_IDS.COMPANY, 'COMPANY', company._id);

    // Create DRAFT
    const createRes = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${recruiter.token}`)
      .send({
        title: 'Lifecycle Test Job',
        description: 'Testing full lifecycle from draft to reopen.',
        jobType: 'FULL_TIME',
        workMode: 'REMOTE',
        vacancies: 1,
        deadline: futureDate(10),
        status: 'DRAFT'
      });
    assert.equal(createRes.status, 201);
    const jobId = createRes.body.data._id;
    assert.equal(createRes.body.data.status, 'DRAFT');

    // Publish to OPEN
    const openRes = await request(app)
      .patch(`/api/jobs/${jobId}/status`)
      .set('Authorization', `Bearer ${recruiter.token}`)
      .send({ status: 'OPEN', note: 'Ready for applicants' });
    assert.equal(openRes.status, 200);
    assert.equal(openRes.body.data.status, 'OPEN');
    assert.ok(openRes.body.data.publishedAt);

    // Pause job
    const pauseRes = await request(app)
      .patch(`/api/jobs/${jobId}/status`)
      .set('Authorization', `Bearer ${recruiter.token}`)
      .send({ status: 'PAUSED', note: 'Temporarily pausing applications' });
    assert.equal(pauseRes.status, 200);
    assert.equal(pauseRes.body.data.status, 'PAUSED');

    // Close job
    const closeRes = await request(app)
      .patch(`/api/jobs/${jobId}/status`)
      .set('Authorization', `Bearer ${recruiter.token}`)
      .send({ status: 'CLOSED', note: 'Applications closed' });
    assert.equal(closeRes.status, 200);
    assert.equal(closeRes.body.data.status, 'CLOSED');
    assert.ok(closeRes.body.data.closedAt);

    // Attempting to reopen via status endpoint directly must be rejected
    const badReopen = await request(app)
      .patch(`/api/jobs/${jobId}/status`)
      .set('Authorization', `Bearer ${recruiter.token}`)
      .send({ status: 'OPEN' });
    assert.equal(badReopen.status, 400);

    // Reopen using dedicated /reopen endpoint
    const reopenRes = await request(app)
      .post(`/api/jobs/${jobId}/reopen`)
      .set('Authorization', `Bearer ${recruiter.token}`)
      .send({
        newDeadline: futureDate(25),
        vacancies: 4,
        note: 'Reopening for second drive round'
      });
    assert.equal(reopenRes.status, 200);
    assert.equal(reopenRes.body.data.status, 'OPEN');
    assert.equal(reopenRes.body.data.recruitmentRound, 2);
    assert.equal(reopenRes.body.data.vacancies, 4);
    assert.equal(reopenRes.body.data.closedAt, null);
  });

  await t.test('7. Placement Cell Suspension and Restoration', async () => {
    const company = await createTestCompany('susp');
    const recruiter = await createAuthenticatedSession(ROLE_IDS.COMPANY, 'COMPANY', company._id);
    const placementHead = await createAuthenticatedSession(ROLE_IDS.PLACEMENT_HEAD, 'PLACEMENT');
    const student = await createAuthenticatedSession(ROLE_IDS.STUDENT, 'STUDENT');

    // Create Open Job
    const jobRes = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${recruiter.token}`)
      .send({
        title: 'Job To Be Suspended',
        description: 'Testing administrative suspension and restore enforcement.',
        jobType: 'FULL_TIME',
        workMode: 'REMOTE',
        vacancies: 2,
        deadline: futureDate(15),
        status: 'OPEN'
      });
    const jobId = jobRes.body.data._id;

    // Recruiter cannot suspend job -> 403
    const recruiterSusp = await request(app)
      .patch(`/api/jobs/${jobId}/suspend`)
      .set('Authorization', `Bearer ${recruiter.token}`)
      .send({
        isSuspended: true,
        suspensionReason: 'Company attempt'
      });
    assert.equal(recruiterSusp.status, 403);

    // Placement Head suspends job
    const suspRes = await request(app)
      .patch(`/api/jobs/${jobId}/suspend`)
      .set('Authorization', `Bearer ${placementHead.token}`)
      .send({
        isSuspended: true,
        suspensionReason: 'Under review for compliance with campus internship norms.'
      });
    assert.equal(suspRes.status, 200);
    assert.equal(suspRes.body.data.isSuspended, true);
    assert.equal(
      suspRes.body.data.suspensionReason,
      'Under review for compliance with campus internship norms.'
    );

    // Suspended job is hidden from student list & details
    const studentList = await request(app)
      .get('/api/jobs')
      .set('Authorization', `Bearer ${student.token}`);
    assert.equal(studentList.body.data.items.length, 0);

    const studentGet = await request(app)
      .get(`/api/jobs/${jobId}`)
      .set('Authorization', `Bearer ${student.token}`);
    assert.equal(studentGet.status, 404);

    // Company cannot edit suspended job
    const editSusp = await request(app)
      .put(`/api/jobs/${jobId}`)
      .set('Authorization', `Bearer ${recruiter.token}`)
      .send({
        title: 'Trying to edit while suspended'
      });
    assert.equal(editSusp.status, 403);

    // Placement Head restores job
    const restoreRes = await request(app)
      .patch(`/api/jobs/${jobId}/suspend`)
      .set('Authorization', `Bearer ${placementHead.token}`)
      .send({
        isSuspended: false,
        suspensionReason: 'Compliance verified by Placement Head'
      });
    assert.equal(restoreRes.status, 200);
    assert.equal(restoreRes.body.data.isSuspended, false);
    assert.equal(restoreRes.body.data.suspensionReason, null);

    // Student can see job again
    const studentGetRestored = await request(app)
      .get(`/api/jobs/${jobId}`)
      .set('Authorization', `Bearer ${student.token}`);
    assert.equal(studentGetRestored.status, 200);
  });

  await t.test('8. Department-Restricted Job Visibility for Students', async () => {
    const company = await createTestCompany('dept-res');
    const recruiter = await createAuthenticatedSession(ROLE_IDS.COMPANY, 'COMPANY', company._id);

    // 1. Create departments
    const ts = Date.now();
    const csDept = await Department.create({
      name: `Computer Science and Engineering ${ts}`,
      code: `CS${ts % 10000}`,
      isActive: true
    });
    const mgmtDept = await Department.create({
      name: `Management Studies ${ts}`,
      code: `MGMT${ts % 10000}`,
      isActive: true
    });

    // 2. Create Student in Computer Science
    const studentCsSession = await createAuthenticatedSession(ROLE_IDS.STUDENT, 'STUDENT');
    await Student.create({
      userId: studentCsSession.user._id,
      universityId: `CS-UNI-${ts % 100000}`,
      firstName: 'Alice',
      lastName: 'CS',
      email: studentCsSession.user.email,
      mobileNumber: '9876543210',
      branch: 'Computer Science',
      department: csDept.name,
      departmentId: csDept._id,
      semester: 6,
      cgpa: 8.5
    });

    // 3. Create Student in Management
    const studentMgmtSession = await createAuthenticatedSession(ROLE_IDS.STUDENT, 'STUDENT');
    await Student.create({
      userId: studentMgmtSession.user._id,
      universityId: `MGMT-UNI-${ts % 100000}`,
      firstName: 'Bob',
      lastName: 'MGMT',
      email: studentMgmtSession.user.email,
      mobileNumber: '9876543211',
      branch: 'Management',
      department: mgmtDept.name,
      departmentId: mgmtDept._id,
      semester: 4,
      cgpa: 8.0
    });

    // 4. Company posts Job restricted to Management Studies
    const mgmtJobRes = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${recruiter.token}`)
      .send({
        title: 'Management Trainee Opening',
        description: 'Exclusively open for students from Management Studies.',
        jobType: 'FULL_TIME',
        workMode: 'ON_SITE',
        location: 'Campus Auditorium',
        vacancies: 3,
        deadline: futureDate(15),
        status: 'OPEN',
        eligibilityMode: 'RESTRICTED',
        eligibilityCriteria: {
          allowedDepartmentIds: [mgmtDept._id]
        }
      });
    assert.equal(mgmtJobRes.status, 201);
    const mgmtJobId = mgmtJobRes.body.data._id;

    // 5. Company posts Job open to ALL_STUDENTS
    const allStudentsJobRes = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${recruiter.token}`)
      .send({
        title: 'General Campus Placement Drive',
        description: 'Open to all departments and disciplines.',
        jobType: 'FULL_TIME',
        workMode: 'REMOTE',
        vacancies: 10,
        deadline: futureDate(20),
        status: 'OPEN',
        eligibilityMode: 'ALL_STUDENTS'
      });
    assert.equal(allStudentsJobRes.status, 201);
    const allStudentsJobId = allStudentsJobRes.body.data._id;

    // 6. Verify CS Student:
    // MUST see the ALL_STUDENTS job
    // MUST NOT see the Management-restricted job
    const csList = await request(app)
      .get('/api/jobs')
      .set('Authorization', `Bearer ${studentCsSession.token}`);
    assert.equal(csList.status, 200);
    const csJobIds = csList.body.data.items.map((j) => String(j._id));
    assert.ok(csJobIds.includes(String(allStudentsJobId)), 'CS student should see ALL_STUDENTS job');
    assert.ok(!csJobIds.includes(String(mgmtJobId)), 'CS student MUST NOT see Management-restricted job');

    // CS Student accessing Management job directly by ID -> 404 Not Found
    const csDirectGet = await request(app)
      .get(`/api/jobs/${mgmtJobId}`)
      .set('Authorization', `Bearer ${studentCsSession.token}`);
    assert.equal(csDirectGet.status, 404);

    // 7. Verify Management Student:
    // MUST see BOTH the Management-restricted job and the ALL_STUDENTS job
    const mgmtList = await request(app)
      .get('/api/jobs')
      .set('Authorization', `Bearer ${studentMgmtSession.token}`);
    assert.equal(mgmtList.status, 200);
    const mgmtJobIds = mgmtList.body.data.items.map((j) => String(j._id));
    assert.ok(mgmtJobIds.includes(String(mgmtJobId)), 'Management student should see Management-restricted job');
    assert.ok(mgmtJobIds.includes(String(allStudentsJobId)), 'Management student should see ALL_STUDENTS job');

    // Management Student accessing Management job directly by ID -> 200 OK
    const mgmtDirectGet = await request(app)
      .get(`/api/jobs/${mgmtJobId}`)
      .set('Authorization', `Bearer ${studentMgmtSession.token}`);
    assert.equal(mgmtDirectGet.status, 200);
    assert.equal(mgmtDirectGet.body.data.title, 'Management Trainee Opening');
  });

  await t.test('9. Passing Year Restricted Job Visibility (e.g. 2027 Passing Year Only)', async () => {
    const company = await createTestCompany('yr-res');
    const recruiter = await createAuthenticatedSession(ROLE_IDS.COMPANY, 'COMPANY', company._id);

    const ts = Date.now();

    // 1. Create Student A with passing year 2027
    const student2027Session = await createAuthenticatedSession(ROLE_IDS.STUDENT, 'STUDENT');
    await Student.create({
      userId: student2027Session.user._id,
      universityId: `UNI-2027-${ts % 100000}`,
      firstName: 'Pooja',
      lastName: 'Batch2027',
      email: student2027Session.user.email,
      mobileNumber: '9876543220',
      branch: 'Information Technology',
      department: 'Information Technology',
      semester: 4,
      cgpa: 8.2,
      passingYear: 2027
    });

    // 2. Create Student B with passing year 2026
    const student2026Session = await createAuthenticatedSession(ROLE_IDS.STUDENT, 'STUDENT');
    await Student.create({
      userId: student2026Session.user._id,
      universityId: `UNI-2026-${ts % 100000}`,
      firstName: 'Rahul',
      lastName: 'Batch2026',
      email: student2026Session.user.email,
      mobileNumber: '9876543221',
      branch: 'Information Technology',
      department: 'Information Technology',
      semester: 6,
      cgpa: 7.9,
      passingYear: 2026
    });

    // 3. Company posts Job restricted strictly to 2027 passing year students
    const job2027Res = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${recruiter.token}`)
      .send({
        title: '2027 Graduate Engineering Trainee',
        description: 'Exclusive opportunity for students graduating in the 2027 batch.',
        jobType: 'FULL_TIME',
        workMode: 'REMOTE',
        vacancies: 5,
        deadline: futureDate(25),
        status: 'OPEN',
        eligibilityMode: 'RESTRICTED',
        eligibilityCriteria: {
          allowedPassingYears: [2027]
        }
      });
    assert.equal(job2027Res.status, 201);
    const job2027Id = job2027Res.body.data._id;

    // 4. Company posts Job with Any Passing Year (empty allowedPassingYears)
    const anyYearJobRes = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${recruiter.token}`)
      .send({
        title: 'General Technical Associate',
        description: 'Open to all graduating batches.',
        jobType: 'FULL_TIME',
        workMode: 'REMOTE',
        vacancies: 8,
        deadline: futureDate(30),
        status: 'OPEN',
        eligibilityMode: 'RESTRICTED',
        eligibilityCriteria: {
          allowedPassingYears: []
        }
      });
    assert.equal(anyYearJobRes.status, 201);
    const anyYearJobId = anyYearJobRes.body.data._id;

    // 5. Verify Student with Passing Year 2027:
    // MUST see BOTH the 2027-restricted job AND the Any-Passing-Year job
    const list2027 = await request(app)
      .get('/api/jobs')
      .set('Authorization', `Bearer ${student2027Session.token}`);
    assert.equal(list2027.status, 200);
    const jobIds2027 = list2027.body.data.items.map((j) => String(j._id));
    assert.ok(jobIds2027.includes(String(job2027Id)), '2027 student MUST see 2027-restricted job');
    assert.ok(jobIds2027.includes(String(anyYearJobId)), '2027 student MUST see any-year job');

    // 2027 student direct get by ID -> 200 OK
    const get2027 = await request(app)
      .get(`/api/jobs/${job2027Id}`)
      .set('Authorization', `Bearer ${student2027Session.token}`);
    assert.equal(get2027.status, 200);
    assert.equal(get2027.body.data.title, '2027 Graduate Engineering Trainee');

    // 6. Verify Student with Passing Year 2026:
    // MUST NOT see the 2027-restricted job
    // MUST see the Any-Passing-Year job
    const list2026 = await request(app)
      .get('/api/jobs')
      .set('Authorization', `Bearer ${student2026Session.token}`);
    assert.equal(list2026.status, 200);
    const jobIds2026 = list2026.body.data.items.map((j) => String(j._id));
    assert.ok(!jobIds2026.includes(String(job2027Id)), '2026 student MUST NOT see 2027-restricted job');
    assert.ok(jobIds2026.includes(String(anyYearJobId)), '2026 student MUST see any-year job');

    // 2026 student direct get by ID for 2027 job -> 404 Not Found
    const get2026 = await request(app)
      .get(`/api/jobs/${job2027Id}`)
      .set('Authorization', `Bearer ${student2026Session.token}`);
    assert.equal(get2026.status, 404);
  });
});
