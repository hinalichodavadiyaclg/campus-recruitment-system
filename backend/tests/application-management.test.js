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
  { Student },
  { PlacementOfficer },
  { Job },
  { Application },
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
  import('../src/models/company.model.js'),
  import('../src/models/department.model.js'),
  import('../src/models/course.model.js'),
  import('../src/models/student.model.js'),
  import('../src/models/placement_officer.model.js'),
  import('../src/models/job.model.js'),
  import('../src/models/application.model.js'),
  import('../src/models/role.model.js'),
  import('../src/utils/password.js'),
  import('../src/utils/session-token.js'),
  import('../src/utils/access-constants.js')
]);

let mongo;
let app;

async function createAuthenticatedSession(roleId, userType = 'PLACEMENT', linkedCompanyId = null, extraUserData = {}) {
  const ts = Date.now() + Math.floor(Math.random() * 1000000);
  const email = `test-${roleId.toLowerCase()}-${ts}@example.edu`;
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
  await Application.deleteMany({});
  await Job.deleteMany({});
  await Company.deleteMany({});
  await Student.deleteMany({});
  await PlacementOfficer.deleteMany({});
  await Department.deleteMany({});
  await Course.deleteMany({});
  await User.deleteMany({ roleId: { $ne: ROLE_IDS.SUPER_ADMIN } });
  await UserSession.deleteMany({});
});

test('Application Management Backend Integration Tests', async (t) => {
  // Helper to setup academic catalog and student
  async function setupStudentEnvironment({
    departmentName = null,
    departmentCode = null,
    courseName = 'B.Tech CSE',
    cgpa = 8.5,
    backlogs = 0,
    passingYear = 2026,
    skills = ['React', 'Node.js', 'MongoDB'],
    withResume = true,
    hasVerifiedNaandi = true
  } = {}) {
    const ts = Date.now() + Math.floor(Math.random() * 1000000);
    const dCode = departmentCode || `D${ts.toString().slice(-4)}`;
    const dName = departmentName || `Department ${dCode}`;

    let dept = await Department.findOne({ code: dCode });
    if (!dept) {
      dept = await Department.create({ name: dName, code: dCode, isActive: true });
    }

    const cCode = `${dCode}-01`;
    let course = await Course.findOne({ code: cCode });
    if (!course) {
      course = await Course.create({
        name: courseName,
        code: cCode,
        departmentId: dept._id,
        level: 'UNDERGRADUATE',
        isActive: true
      });
    }

    const studentSession = await createAuthenticatedSession(ROLE_IDS.STUDENT, 'STUDENT');

    const certificates = [];
    if (hasVerifiedNaandi) {
      certificates.push({
        name: 'Naandi Soft Skills & Employability Training',
        issuingOrganization: 'Naandi Foundation',
        issueDate: '2025-05-15',
        credentialId: 'NAANDI-VVWU-2025-001',
        isVerified: true
      });
    }

    const studentDoc = await Student.create({
      userId: studentSession.user._id,
      universityId: studentSession.user.universityId,
      firstName: 'Priya',
      lastName: 'Patel',
      email: studentSession.user.email,
      mobileNumber: '9876543210',
      branch: dCode,
      department: dName,
      departmentId: dept._id,
      courseId: course._id,
      semester: 7,
      cgpa,
      backlogs,
      passingYear,
      skills,
      resume: withResume
        ? {
            url: '/uploads/resumes/priya_resume_v1.pdf',
            fileName: 'priya_resume_v1.pdf',
            fileSize: 102450,
            uploadedAt: new Date()
          }
        : undefined,
      certificates
    });

    return { studentSession, studentDoc, dept, course };
  }

  // Helper to setup company recruiter and open job
  async function setupCompanyJob({
    jobTitle = 'Senior Frontend Engineer',
    requiresNaandiTraining = true,
    minCgpa = 7.0,
    maxActiveBacklogs = 0,
    allowedDepartmentIds = [],
    allowedCourseIds = [],
    allowedPassingYears = [2026],
    requiredSkills = ['React'],
    status = 'OPEN',
    isSuspended = false,
    deadline = futureDate(30)
  } = {}) {
    const ts = Date.now() + Math.floor(Math.random() * 100000);
    const company = await Company.create({
      companyName: `Apex Software Innovations ${ts}`,
      industryType: 'Information Technology',
      yearEstablished: 2015,
      hrRecruiterName: 'Anil Shah',
      email: `hr-${ts}@apextech.com`,
      companyId: `COMP-${ts.toString().slice(-4)}`
    });

    const recruiterSession = await createAuthenticatedSession(ROLE_IDS.COMPANY, 'COMPANY', company._id);

    const job = await Job.create({
      jobId: `JOB-${ts.toString().slice(-4)}`,
      companyId: company._id,
      createdBy: recruiterSession.user._id,
      title: jobTitle,
      description: 'Exciting opportunities to build modern campus recruitment platforms.',
      jobType: 'FULL_TIME',
      workMode: 'REMOTE',
      vacancies: 3,
      compensation: {
        salaryMin: 600000,
        salaryMax: 900000,
        currency: 'INR',
        salaryFormat: 'PER_ANNUM'
      },
      eligibilityMode: 'RESTRICTED',
      eligibilityCriteria: {
        allowedDepartmentIds,
        allowedCourseIds,
        allowedPassingYears,
        minCgpa,
        maxActiveBacklogs,
        requiredSkills,
        requiresNaandiTraining
      },
      status,
      isSuspended,
      deadline: new Date(deadline),
      recruitmentRound: 1
    });

    return { company, recruiterSession, job };
  }

  await t.test('1. Application Submission, Sequential ID (APP-0001, APP-0002) and Immutable Snapshots', async () => {
    const { studentSession, studentDoc, dept } = await setupStudentEnvironment();
    const { job, company } = await setupCompanyJob({
      allowedDepartmentIds: [dept._id],
      requiredSkills: ['React', 'Node.js']
    });

    // Student submits application
    const res = await request(app)
      .post('/api/applications')
      .set('Authorization', `Bearer ${studentSession.token}`)
      .send({ jobId: String(job._id) });

    assert.equal(res.status, 201, `Failed to submit application: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.data.applicationId, 'APP-0001');
    assert.equal(res.body.data.status, 'APPLIED');
    assert.equal(res.body.data.recruitmentRound, 1);

    // Verify Snapshots Captured
    assert.equal(res.body.data.jobSnapshot.title, job.title);
    assert.equal(res.body.data.jobSnapshot.workMode, 'REMOTE');
    assert.equal(res.body.data.resumeSnapshot.fileName, 'priya_resume_v1.pdf');
    assert.equal(res.body.data.resumeSnapshot.url, '/uploads/resumes/priya_resume_v1.pdf');
    assert.equal(res.body.data.eligibilitySnapshot.isEligible, true);

    // Verify snapshot immutability:
    // Update the student profile resume and job title afterwards
    await Student.findByIdAndUpdate(studentDoc._id, {
      resume: {
        url: '/uploads/resumes/priya_updated_resume_v2.pdf',
        fileName: 'priya_updated_resume_v2.pdf',
        fileSize: 204800,
        uploadedAt: new Date()
      }
    });

    await Job.findByIdAndUpdate(job._id, {
      title: 'Completely Changed Job Title After Applications',
      vacancies: 99
    });

    // Fetch the submitted application and verify snapshots remain identical to application-time
    const appRecord = await Application.findById(res.body.data._id);
    assert.equal(appRecord.jobSnapshot.title, 'Senior Frontend Engineer');
    assert.equal(appRecord.jobSnapshot.vacancies, 3);
    assert.equal(appRecord.resumeSnapshot.fileName, 'priya_resume_v1.pdf');
    assert.equal(appRecord.resumeSnapshot.url, '/uploads/resumes/priya_resume_v1.pdf');

    // Create a 2nd application with a 2nd student to verify APP-0002 sequential progression
    const student2Env = await setupStudentEnvironment({ departmentName: dept.name, departmentCode: dept.code });
    const res2 = await request(app)
      .post('/api/applications')
      .set('Authorization', `Bearer ${student2Env.studentSession.token}`)
      .send({ jobId: String(job._id) });

    assert.equal(res2.status, 201);
    assert.equal(res2.body.data.applicationId, 'APP-0002');
  });

  await t.test('2. Duplicate Application Prevention per Recruitment Round & Reopen Multi-Round Support', async () => {
    const { studentSession, dept } = await setupStudentEnvironment();
    const { job, recruiterSession } = await setupCompanyJob({ allowedDepartmentIds: [dept._id] });

    // 1st submission in Round 1
    const app1 = await request(app)
      .post('/api/applications')
      .set('Authorization', `Bearer ${studentSession.token}`)
      .send({ jobId: String(job._id) });
    assert.equal(app1.status, 201);

    // 2nd submission in Round 1 -> Rejected with 409 DUPLICATE_APPLICATION
    const appDuplicate = await request(app)
      .post('/api/applications')
      .set('Authorization', `Bearer ${studentSession.token}`)
      .send({ jobId: String(job._id) });
    assert.equal(appDuplicate.status, 409);
    assert.equal(appDuplicate.body.error?.code, 'DUPLICATE_APPLICATION');

    // Close job and Reopen for recruitment round 2
    await request(app)
      .patch(`/api/jobs/${job._id}/status`)
      .set('Authorization', `Bearer ${recruiterSession.token}`)
      .send({ status: 'CLOSED' });

    const reopenRes = await request(app)
      .post(`/api/jobs/${job._id}/reopen`)
      .set('Authorization', `Bearer ${recruiterSession.token}`)
      .send({ newDeadline: futureDate(45), vacancies: 5 });
    assert.equal(reopenRes.status, 200);
    assert.equal(reopenRes.body.data.recruitmentRound, 2);

    // The student can now apply for Round 2!
    const appRound2 = await request(app)
      .post('/api/applications')
      .set('Authorization', `Bearer ${studentSession.token}`)
      .send({ jobId: String(job._id) });
    assert.equal(appRound2.status, 201);
    assert.equal(appRound2.body.data.recruitmentRound, 2);
    assert.notEqual(appRound2.body.data._id, app1.body.data._id);
  });

  await t.test('3. Eligibility Failures: CGPA, Backlogs, Passing Year, Skills, and Resume', async () => {
    // Student missing resume
    const noResumeEnv = await setupStudentEnvironment({ withResume: false });
    const { job } = await setupCompanyJob();

    const resNoResume = await request(app)
      .post('/api/applications')
      .set('Authorization', `Bearer ${noResumeEnv.studentSession.token}`)
      .send({ jobId: String(job._id) });
    assert.equal(resNoResume.status, 400);
    assert.match(resNoResume.body.error?.message || '', /resume/i);

    // Student low CGPA (CGPA: 6.5, Job requires 7.5)
    const lowCgpaEnv = await setupStudentEnvironment({ cgpa: 6.5 });
    const { job: jobHighCgpa } = await setupCompanyJob({ minCgpa: 7.5 });

    const resLowCgpa = await request(app)
      .post('/api/applications')
      .set('Authorization', `Bearer ${lowCgpaEnv.studentSession.token}`)
      .send({ jobId: String(jobHighCgpa._id) });
    assert.equal(resLowCgpa.status, 400);
    assert.match(resLowCgpa.body.error?.message || '', /CGPA/i);

    // Student has 2 backlogs, job requires max 0
    const backlogEnv = await setupStudentEnvironment({ backlogs: 2 });
    const { job: jobZeroBacklogs } = await setupCompanyJob({ maxActiveBacklogs: 0 });

    const resBacklogs = await request(app)
      .post('/api/applications')
      .set('Authorization', `Bearer ${backlogEnv.studentSession.token}`)
      .send({ jobId: String(jobZeroBacklogs._id) });
    assert.equal(resBacklogs.status, 400);
    assert.match(resBacklogs.body.error?.message || '', /backlog/i);

    // Student missing required skill 'Python' and 'Django' (Informational: does not block application)
    const skillsEnv = await setupStudentEnvironment({ skills: ['JavaScript', 'HTML'] });
    const { job: jobReqSkills } = await setupCompanyJob({ requiredSkills: ['Python', 'Django'] });

    const resSkills = await request(app)
      .post('/api/applications')
      .set('Authorization', `Bearer ${skillsEnv.studentSession.token}`)
      .send({ jobId: String(jobReqSkills._id) });
    assert.equal(resSkills.status, 201);
    assert.equal(resSkills.body.data.eligibilitySnapshot.checks.skills.passed, true);
    assert.deepEqual(resSkills.body.data.eligibilitySnapshot.checks.skills.unmatchedSkills, ['Python', 'Django']);
    assert.match(resSkills.body.data.eligibilitySnapshot.checks.skills.label, /Not listed on your profile/i);
  });

  await t.test('4. Mandatory Naandi Training Boundary Enforcement', async () => {
    // Student WITHOUT verified Naandi Training certificate
    const noNaandiEnv = await setupStudentEnvironment({ hasVerifiedNaandi: false });
    const { job: naandiJob } = await setupCompanyJob({ requiresNaandiTraining: true });

    const failRes = await request(app)
      .post('/api/applications')
      .set('Authorization', `Bearer ${noNaandiEnv.studentSession.token}`)
      .send({ jobId: String(naandiJob._id) });

    assert.equal(failRes.status, 400);
    assert.match(failRes.body.error?.message || '', /Naandi Training/i);

    // Student WITH verified Naandi Training certificate succeeds
    const verifiedEnv = await setupStudentEnvironment({ hasVerifiedNaandi: true });
    const successRes = await request(app)
      .post('/api/applications')
      .set('Authorization', `Bearer ${verifiedEnv.studentSession.token}`)
      .send({ jobId: String(naandiJob._id) });

    assert.equal(successRes.status, 201);
    assert.equal(successRes.body.data.eligibilitySnapshot.checks.naandiTraining.passed, true);
  });

  await t.test('5. Job State & Deadline Restrictions (Cannot apply to Draft, Paused, Closed, Expired, Suspended)', async () => {
    const { studentSession } = await setupStudentEnvironment();

    // Draft job
    const { job: draftJob } = await setupCompanyJob({ status: 'DRAFT' });
    const resDraft = await request(app)
      .post('/api/applications')
      .set('Authorization', `Bearer ${studentSession.token}`)
      .send({ jobId: String(draftJob._id) });
    assert.equal(resDraft.status, 400);

    // Paused job
    const { job: pausedJob } = await setupCompanyJob({ status: 'PAUSED' });
    const resPaused = await request(app)
      .post('/api/applications')
      .set('Authorization', `Bearer ${studentSession.token}`)
      .send({ jobId: String(pausedJob._id) });
    assert.equal(resPaused.status, 400);

    // Suspended job
    const { job: suspJob } = await setupCompanyJob({ isSuspended: true });
    const resSusp = await request(app)
      .post('/api/applications')
      .set('Authorization', `Bearer ${studentSession.token}`)
      .send({ jobId: String(suspJob._id) });
    assert.equal(resSusp.status, 400);

    // Expired deadline
    const { job: expJob } = await setupCompanyJob({ deadline: pastDate(2), status: 'DRAFT' });
    // Force expired deadline on open job
    await Job.findByIdAndUpdate(expJob._id, { status: 'OPEN', deadline: new Date(pastDate(2)) });
    const resExp = await request(app)
      .post('/api/applications')
      .set('Authorization', `Bearer ${studentSession.token}`)
      .send({ jobId: String(expJob._id) });
    assert.equal(resExp.status, 400);
  });

  await t.test('6. Company Isolation and Placement Coordinator Department Scoping', async () => {
    // Setup Dept CSE and Dept Mechanical
    const { studentSession: cseStudent, dept: cseDept } = await setupStudentEnvironment({
      departmentName: 'Computer Engineering',
      departmentCode: 'CO'
    });
    const { studentSession: mechStudent, dept: mechDept } = await setupStudentEnvironment({
      departmentName: 'Mechanical Engineering',
      departmentCode: 'MECH'
    });

    // Company A and Company B
    const { job: jobA, recruiterSession: recruiterA } = await setupCompanyJob({ jobTitle: 'Company A Dev' });
    const { job: jobB, recruiterSession: recruiterB } = await setupCompanyJob({ jobTitle: 'Company B Dev' });

    // CSE student applies to Job A
    const appA = await request(app)
      .post('/api/applications')
      .set('Authorization', `Bearer ${cseStudent.token}`)
      .send({ jobId: String(jobA._id) });
    assert.equal(appA.status, 201);
    const appAId = appA.body.data._id;

    // MECH student applies to Job B
    const appB = await request(app)
      .post('/api/applications')
      .set('Authorization', `Bearer ${mechStudent.token}`)
      .send({ jobId: String(jobB._id) });
    assert.equal(appB.status, 201);
    const appBId = appB.body.data._id;

    // Recruiter A lists applications: sees only Job A applications
    const listA = await request(app)
      .get('/api/applications')
      .set('Authorization', `Bearer ${recruiterA.token}`);
    assert.equal(listA.status, 200);
    assert.equal(listA.body.data.items.length, 1);
    assert.equal(listA.body.data.items[0]._id, appAId);

    // Recruiter B tries to view Application A -> 403 Forbidden
    const getForeign = await request(app)
      .get(`/api/applications/${appAId}`)
      .set('Authorization', `Bearer ${recruiterB.token}`);
    assert.equal(getForeign.status, 403);

    // Recruiter B tries to update status of Application A -> 403 Forbidden
    const updateForeign = await request(app)
      .patch(`/api/applications/${appAId}/status`)
      .set('Authorization', `Bearer ${recruiterB.token}`)
      .send({ status: 'SHORTLISTED' });
    assert.equal(updateForeign.status, 403);

    // Setup Placement Coordinator assigned ONLY to CSE department
    const coordSession = await createAuthenticatedSession(ROLE_IDS.PLACEMENT_COORDINATOR, 'PLACEMENT');
    await PlacementOfficer.create({
      userId: coordSession.user._id,
      employeeId: coordSession.user.employeeId,
      firstName: 'Ramesh',
      lastName: 'Mehta',
      email: coordSession.user.email,
      mobileNumber: '9988776655',
      designation: 'Assistant Professor',
      department: cseDept.name,
      departmentId: cseDept._id,
      role: ROLE_IDS.PLACEMENT_COORDINATOR
    });

    // Coordinator lists applications: sees ONLY CSE student's application (appA), cannot see MECH student's application (appB)
    const coordList = await request(app)
      .get('/api/applications')
      .set('Authorization', `Bearer ${coordSession.token}`);
    assert.equal(coordList.status, 200);
    assert.equal(coordList.body.data.items.length, 1);
    assert.equal(coordList.body.data.items[0]._id, appAId);

    // Coordinator direct access to MECH student's application -> 403 Forbidden
    const coordGetOther = await request(app)
      .get(`/api/applications/${appBId}`)
      .set('Authorization', `Bearer ${coordSession.token}`);
    assert.equal(coordGetOther.status, 403);
  });

  await t.test('7. ATS Status Workflow Transitions, Terminal Protection, and Candidate Withdrawal', async () => {
    const { studentSession } = await setupStudentEnvironment();
    const { job, recruiterSession } = await setupCompanyJob();

    const appRes = await request(app)
      .post('/api/applications')
      .set('Authorization', `Bearer ${studentSession.token}`)
      .send({ jobId: String(job._id) });
    assert.equal(appRes.status, 201);
    const appId = appRes.body.data._id;
    assert.equal(appRes.body.data.status, 'APPLIED');

    // Valid forward transition: APPLIED -> UNDER_REVIEW
    const step1 = await request(app)
      .patch(`/api/applications/${appId}/status`)
      .set('Authorization', `Bearer ${recruiterSession.token}`)
      .send({ status: 'UNDER_REVIEW', note: 'Profile matched core criteria' });
    assert.equal(step1.status, 200);
    assert.equal(step1.body.data.status, 'UNDER_REVIEW');

    // Valid forward transition: UNDER_REVIEW -> SHORTLISTED
    const step2 = await request(app)
      .patch(`/api/applications/${appId}/status`)
      .set('Authorization', `Bearer ${recruiterSession.token}`)
      .send({ status: 'SHORTLISTED', note: 'Selected for online test' });
    assert.equal(step2.status, 200);
    assert.equal(step2.body.data.status, 'SHORTLISTED');

    // Valid forward transition: SHORTLISTED -> INTERVIEW
    const step3 = await request(app)
      .patch(`/api/applications/${appId}/status`)
      .set('Authorization', `Bearer ${recruiterSession.token}`)
      .send({ status: 'INTERVIEW', note: 'Technical interview scheduled' });
    assert.equal(step3.status, 200);
    assert.equal(step3.body.data.status, 'INTERVIEW');

    // Valid forward transition: INTERVIEW -> SELECTED (Terminal)
    const step4 = await request(app)
      .patch(`/api/applications/${appId}/status`)
      .set('Authorization', `Bearer ${recruiterSession.token}`)
      .send({ status: 'SELECTED', note: 'Offer letter released' });
    assert.equal(step4.status, 200);
    assert.equal(step4.body.data.status, 'SELECTED');

    // Attempting to modify terminal status SELECTED -> 400 INVALID_STATUS_TRANSITION
    const badRevert = await request(app)
      .patch(`/api/applications/${appId}/status`)
      .set('Authorization', `Bearer ${recruiterSession.token}`)
      .send({ status: 'INTERVIEW' });
    assert.equal(badRevert.status, 400);

    // Candidate cannot withdraw an application that is already SELECTED -> 400
    const badWithdraw = await request(app)
      .post(`/api/applications/${appId}/withdraw`)
      .set('Authorization', `Bearer ${studentSession.token}`)
      .send({ reason: 'Found other job' });
    assert.equal(badWithdraw.status, 400);

    // Verify candidate CAN withdraw an in-flight application
    const { studentSession: student2 } = await setupStudentEnvironment();
    const app2Res = await request(app)
      .post('/api/applications')
      .set('Authorization', `Bearer ${student2.token}`)
      .send({ jobId: String(job._id) });
    const app2Id = app2Res.body.data._id;

    const withdrawRes = await request(app)
      .post(`/api/applications/${app2Id}/withdraw`)
      .set('Authorization', `Bearer ${student2.token}`)
      .send({ reason: 'Relocating to another city' });
    assert.equal(withdrawRes.status, 200);
    assert.equal(withdrawRes.body.data.status, 'WITHDRAWN');

    // Verify status history audit records
    const finalApp2 = await Application.findById(app2Id);
    assert.equal(finalApp2.statusHistory.length, 2);
    assert.equal(finalApp2.statusHistory[0].newStatus, 'APPLIED');
    assert.equal(finalApp2.statusHistory[1].previousStatus, 'APPLIED');
    assert.equal(finalApp2.statusHistory[1].newStatus, 'WITHDRAWN');
    assert.equal(finalApp2.statusHistory[1].note, 'Relocating to another city');
  });

  await t.test('8. Job-Specific Resume Upload, File Validation, and Profile Resume Immutability', async () => {
    const { studentDoc, studentSession } = await setupStudentEnvironment();
    const originalProfileResumeUrl = studentDoc.resume.url;
    const originalProfileResumeFile = studentDoc.resume.fileName;

    const { job, recruiterSession } = await setupCompanyJob();

    // 1. Reject invalid file type (non-PDF)
    const invalidTypeRes = await request(app)
      .post('/api/applications/upload-resume')
      .set('Authorization', `Bearer ${studentSession.token}`)
      .attach('file', Buffer.from('plain text content'), {
        filename: 'resume.txt',
        contentType: 'text/plain'
      });
    assert.equal(invalidTypeRes.status, 400);
    assert.equal(invalidTypeRes.body.error?.code, 'INVALID_FILE_TYPE');

    // 2. Reject oversized file (> 5MB)
    const largeBuffer = Buffer.alloc(5 * 1024 * 1024 + 1024, 'a');
    const oversizedRes = await request(app)
      .post('/api/applications/upload-resume')
      .set('Authorization', `Bearer ${studentSession.token}`)
      .attach('file', largeBuffer, {
        filename: 'huge_resume.pdf',
        contentType: 'application/pdf'
      });
    assert.equal(oversizedRes.status, 400);
    assert.match(oversizedRes.body.error?.message || '', /5MB|exceeds/i);

    // 3. Successfully upload valid PDF
    const validPdfBuffer = Buffer.from('%PDF-1.4 test resume content');
    const uploadRes = await request(app)
      .post('/api/applications/upload-resume')
      .set('Authorization', `Bearer ${studentSession.token}`)
      .attach('file', validPdfBuffer, {
        filename: 'Tailored_ML_Resume.pdf',
        contentType: 'application/pdf'
      });
    assert.equal(uploadRes.status, 201);
    assert.ok(uploadRes.body.data?.url);
    assert.equal(uploadRes.body.data.fileName, 'Tailored_ML_Resume.pdf');
    assert.equal(uploadRes.body.data.source, 'JOB_SPECIFIC');

    const customResumeData = uploadRes.body.data;

    // 4. Submit application using customResume
    const applyRes = await request(app)
      .post('/api/applications')
      .set('Authorization', `Bearer ${studentSession.token}`)
      .send({
        jobId: String(job._id),
        customResume: customResumeData
      });

    assert.equal(applyRes.status, 201);
    assert.equal(applyRes.body.data.resumeSnapshot.url, customResumeData.url);
    assert.equal(applyRes.body.data.resumeSnapshot.fileName, 'Tailored_ML_Resume.pdf');
    assert.equal(applyRes.body.data.resumeSnapshot.source, 'JOB_SPECIFIC');
    const createdAppId = applyRes.body.data._id;

    // 5. Ensure student's profile resume was NOT overwritten
    const studentInDb = await Student.findById(studentDoc._id);
    assert.equal(studentInDb.resume.url, originalProfileResumeUrl);
    assert.equal(studentInDb.resume.fileName, originalProfileResumeFile);

    // 6. Mutate student's profile resume and verify the snapshot remains unchanged
    studentInDb.resume.url = '/uploads/resumes/completely_new_profile_resume.pdf';
    studentInDb.resume.fileName = 'Completely_New_Profile_Resume.pdf';
    await studentInDb.save();

    const applicationAfterProfileUpdate = await Application.findById(createdAppId);
    assert.equal(applicationAfterProfileUpdate.resumeSnapshot.url, customResumeData.url);
    assert.equal(applicationAfterProfileUpdate.resumeSnapshot.fileName, 'Tailored_ML_Resume.pdf');
    assert.equal(applicationAfterProfileUpdate.resumeSnapshot.source, 'JOB_SPECIFIC');

    // 7. Student with NO profile resume applying with customResume succeeds
    const noResumeStudentEnv = await setupStudentEnvironment({ withResume: false });
    const { job: job2 } = await setupCompanyJob();

    const applyNoProfileResumeSuccess = await request(app)
      .post('/api/applications')
      .set('Authorization', `Bearer ${noResumeStudentEnv.studentSession.token}`)
      .send({
        jobId: String(job2._id),
        customResume: customResumeData
      });
    assert.equal(applyNoProfileResumeSuccess.status, 201);
    assert.equal(applyNoProfileResumeSuccess.body.data.resumeSnapshot.source, 'JOB_SPECIFIC');

    // 8. Student with NO profile resume and NO customResume is blocked
    const { job: job3 } = await setupCompanyJob();
    const applyNoResumeFail = await request(app)
      .post('/api/applications')
      .set('Authorization', `Bearer ${noResumeStudentEnv.studentSession.token}`)
      .send({
        jobId: String(job3._id)
      });
    assert.equal(applyNoResumeFail.status, 400);
    assert.match(applyNoResumeFail.body.error?.message || '', /resume/i);

    // 9. Authorization checks on resume download / access route
    // Student who applied can access
    const candidateResumeRes = await request(app)
      .get(`/api/applications/${createdAppId}/resume`)
      .set('Authorization', `Bearer ${studentSession.token}`);
    assert.ok([200, 302].includes(candidateResumeRes.status));

    // Recruiter who owns the job can access
    const recruiterResumeRes = await request(app)
      .get(`/api/applications/${createdAppId}/resume`)
      .set('Authorization', `Bearer ${recruiterSession.token}`);
    assert.ok([200, 302].includes(recruiterResumeRes.status));

    // Another student cannot access (403)
    const otherStudentEnv = await setupStudentEnvironment();
    const badStudentResumeRes = await request(app)
      .get(`/api/applications/${createdAppId}/resume`)
      .set('Authorization', `Bearer ${otherStudentEnv.studentSession.token}`);
    assert.equal(badStudentResumeRes.status, 403);

    // Another company cannot access (403)
    const { recruiterSession: otherRecruiter } = await setupCompanyJob();
    const badCompanyResumeRes = await request(app)
      .get(`/api/applications/${createdAppId}/resume`)
      .set('Authorization', `Bearer ${otherRecruiter.token}`);
    assert.equal(badCompanyResumeRes.status, 403);
  });

  await t.test('9. Dynamic RBAC, Configurable Permissions, Scoping Invariants, and Seeder Preservation', async () => {
    // A. Default Role-Based Access Control State
    const [companyRole, coordRole, headRole, studentRole] = await Promise.all([
      Role.findById(ROLE_IDS.COMPANY).lean(),
      Role.findById(ROLE_IDS.PLACEMENT_COORDINATOR).lean(),
      Role.findById(ROLE_IDS.PLACEMENT_HEAD).lean(),
      Role.findById(ROLE_IDS.STUDENT).lean()
    ]);

    assert.ok(companyRole.permissionIds.includes(PERMISSION_IDS.APPLICATION_UPDATE), 'Company must have APPLICATION_UPDATE enabled by default');
    assert.equal(coordRole.permissionIds.includes(PERMISSION_IDS.APPLICATION_UPDATE), false, 'Placement Coordinator must have APPLICATION_UPDATE disabled by default');
    assert.equal(headRole.permissionIds.includes(PERMISSION_IDS.APPLICATION_UPDATE), false, 'Placement Head must have APPLICATION_UPDATE disabled by default');
    assert.equal(studentRole.permissionIds.includes(PERMISSION_IDS.APPLICATION_UPDATE), false, 'Student must have APPLICATION_UPDATE disabled by default');

    // B. Default Status Update Authorization Checks
    const { job: companyJob, recruiterSession: assignedCompanyRecruiter, company: assignedCompany } = await setupCompanyJob({
      allowedPassingYears: [2025, 2026]
    });
    const { studentSession: student1, studentDoc: student1Doc, dept: cseDept } = await setupStudentEnvironment({
      departmentName: 'Computer Science & Engineering',
      departmentCode: 'CSE',
      cgpa: 8.5,
      passingYear: 2026
    });

    const app1Res = await request(app)
      .post('/api/applications')
      .set('Authorization', `Bearer ${student1.token}`)
      .send({ jobId: String(companyJob._id) });
    assert.equal(app1Res.status, 201);
    const app1Id = app1Res.body.data._id;

    // Coordinator session
    const coordSession = await createAuthenticatedSession(ROLE_IDS.PLACEMENT_COORDINATOR, 'PLACEMENT');
    await PlacementOfficer.create({
      userId: coordSession.user._id,
      employeeId: coordSession.user.employeeId,
      firstName: 'Ramesh',
      lastName: 'Mehta',
      email: coordSession.user.email,
      mobileNumber: '9988776655',
      designation: 'Assistant Professor',
      department: cseDept.name,
      departmentId: cseDept._id,
      role: ROLE_IDS.PLACEMENT_COORDINATOR
    });

    // Placement Head session
    const headSession = await createAuthenticatedSession(ROLE_IDS.PLACEMENT_HEAD, 'PLACEMENT');
    await PlacementOfficer.create({
      userId: headSession.user._id,
      employeeId: headSession.user.employeeId,
      firstName: 'Dr. Suresh',
      lastName: 'Sharma',
      email: headSession.user.email,
      mobileNumber: '9988776644',
      designation: 'Director of Placements',
      role: ROLE_IDS.PLACEMENT_HEAD
    });

    // Coordinator default update attempt -> 403 Forbidden
    const coordDefaultRes = await request(app)
      .patch(`/api/applications/${app1Id}/status`)
      .set('Authorization', `Bearer ${coordSession.token}`)
      .send({ status: 'UNDER_REVIEW' });
    assert.equal(coordDefaultRes.status, 403, 'Placement Coordinator without APPLICATION_UPDATE must receive 403 Forbidden');

    // Placement Head default update attempt -> 403 Forbidden
    const headDefaultRes = await request(app)
      .patch(`/api/applications/${app1Id}/status`)
      .set('Authorization', `Bearer ${headSession.token}`)
      .send({ status: 'UNDER_REVIEW' });
    assert.equal(headDefaultRes.status, 403, 'Placement Head without APPLICATION_UPDATE must receive 403 Forbidden');

    // Student update attempt -> 403 Forbidden
    const studentUpdateRes = await request(app)
      .patch(`/api/applications/${app1Id}/status`)
      .set('Authorization', `Bearer ${student1.token}`)
      .send({ status: 'UNDER_REVIEW' });
    assert.equal(studentUpdateRes.status, 403, 'Student cannot update application status');

    // Assigned company recruiter update -> 200 OK
    const companyUpdateRes = await request(app)
      .patch(`/api/applications/${app1Id}/status`)
      .set('Authorization', `Bearer ${assignedCompanyRecruiter.token}`)
      .send({ status: 'UNDER_REVIEW', note: 'Reviewed by hiring company' });
    assert.equal(companyUpdateRes.status, 200, 'Assigned company recruiter can update application status');
    assert.equal(companyUpdateRes.body.data.status, 'UNDER_REVIEW');

    // Another company recruiter attempt -> 403 Forbidden
    const { recruiterSession: otherCompanyRecruiter } = await setupCompanyJob();
    const otherCompanyRes = await request(app)
      .patch(`/api/applications/${app1Id}/status`)
      .set('Authorization', `Bearer ${otherCompanyRecruiter.token}`)
      .send({ status: 'SHORTLISTED' });
    assert.equal(otherCompanyRes.status, 403, 'Unassigned company recruiter cannot update another company applications');

    // C. University-Created Job Scoping
    const superAdminSession = await createAuthenticatedSession(ROLE_IDS.SUPER_ADMIN, 'PLACEMENT');
    const ts = Date.now() + Math.floor(Math.random() * 100000);
    const univJob = await Job.create({
      jobId: `JOB-UNIV-${ts.toString().slice(-4)}`,
      companyId: assignedCompany._id,
      createdBy: superAdminSession.user._id,
      title: 'University Posted Job for Apex',
      description: 'Job posted by university cell on behalf of partner company.',
      jobType: 'FULL_TIME',
      workMode: 'ON_SITE',
      vacancies: 2,
      compensation: { salaryMin: 500000, salaryMax: 700000, currency: 'INR', salaryFormat: 'PER_ANNUM' },
      eligibilityMode: 'ALL_STUDENTS',
      status: 'OPEN',
      deadline: futureDate(25)
    });

    const univAppRes = await request(app)
      .post('/api/applications')
      .set('Authorization', `Bearer ${student1.token}`)
      .send({ jobId: String(univJob._id) });
    assert.equal(univAppRes.status, 201);
    const univAppId = univAppRes.body.data._id;

    // Assigned hiring company can update application for university-created job
    const assignedUnivUpdate = await request(app)
      .patch(`/api/applications/${univAppId}/status`)
      .set('Authorization', `Bearer ${assignedCompanyRecruiter.token}`)
      .send({ status: 'UNDER_REVIEW' });
    assert.equal(assignedUnivUpdate.status, 200);

    // Another company cannot update university-created job assigned to Apex
    const foreignUnivUpdate = await request(app)
      .patch(`/api/applications/${univAppId}/status`)
      .set('Authorization', `Bearer ${otherCompanyRecruiter.token}`)
      .send({ status: 'SHORTLISTED' });
    assert.equal(foreignUnivUpdate.status, 403);

    // University-created job without assigned company returns 400 NO_ASSIGNED_COMPANY
    const noCompanyJobDoc = new Job({
      jobId: `JOB-NOC-${ts.toString().slice(-4)}`,
      createdBy: superAdminSession.user._id,
      title: 'Job Without Assigned Company',
      description: 'Incomplete university posting.',
      jobType: 'FULL_TIME',
      workMode: 'REMOTE',
      vacancies: 1,
      compensation: { salaryMin: 400000, salaryMax: 600000, currency: 'INR', salaryFormat: 'PER_ANNUM' },
      eligibilityMode: 'ALL_STUDENTS',
      status: 'OPEN',
      deadline: futureDate(20)
    });
    await noCompanyJobDoc.save({ validateBeforeSave: false });
    const noCompAppDoc = new Application({
      applicationId: `APP-NOC-${ts.toString().slice(-4)}`,
      jobId: noCompanyJobDoc._id,
      companyId: null,
      studentId: student1Doc._id,
      status: 'APPLIED',
      recruitmentRound: 1,
      jobSnapshot: {
        title: noCompanyJobDoc.title,
        jobType: noCompanyJobDoc.jobType,
        workMode: noCompanyJobDoc.workMode,
        vacancies: 1,
        deadline: futureDate(20)
      },
      studentSnapshot: {
        firstName: student1Doc.firstName,
        lastName: student1Doc.lastName,
        email: student1Doc.email,
        universityId: student1Doc.universityId
      },
      resumeSnapshot: {
        url: '/uploads/resumes/priya_resume_v1.pdf',
        fileName: 'priya_resume_v1.pdf',
        source: 'PROFILE'
      },
      eligibilitySnapshot: {
        isEligible: true,
        evaluatedAt: new Date()
      }
    });
    await noCompAppDoc.save({ validateBeforeSave: false });
    const missingCompUpdate = await request(app)
      .patch(`/api/applications/${noCompAppDoc._id}/status`)
      .set('Authorization', `Bearer ${assignedCompanyRecruiter.token}`)
      .send({ status: 'UNDER_REVIEW' });
    assert.equal(missingCompUpdate.status, 400);
    assert.equal(missingCompUpdate.body.error?.code, 'NO_ASSIGNED_COMPANY');

    // D. Dynamic RBAC: Granting APPLICATION_UPDATE to Coordinator
    // Create MECH department student
    const { studentSession: studentMech, studentDoc: studentMechDoc } = await setupStudentEnvironment({
      departmentName: 'Mechanical Engineering',
      departmentCode: 'MECH',
      cgpa: 7.2,
      passingYear: 2025
    });

    const mechAppRes = await request(app)
      .post('/api/applications')
      .set('Authorization', `Bearer ${studentMech.token}`)
      .send({ jobId: String(companyJob._id) });
    assert.equal(mechAppRes.status, 201);
    const mechAppId = mechAppRes.body.data._id;

    // Grant APPLICATION_UPDATE to ROLE_PLACEMENT_COORDINATOR dynamically in MongoDB
    await Role.updateOne(
      { _id: ROLE_IDS.PLACEMENT_COORDINATOR },
      { $addToSet: { permissionIds: PERMISSION_IDS.APPLICATION_UPDATE } }
    );

    // Dynamic verification without restart:
    // 1. Coordinator can update CSE student application (assigned department)
    const coordCseUpdate = await request(app)
      .patch(`/api/applications/${app1Id}/status`)
      .set('Authorization', `Bearer ${coordSession.token}`)
      .send({ status: 'SHORTLISTED', note: 'Coordinator shortlisted departmental candidate' });
    assert.equal(coordCseUpdate.status, 200, 'Coordinator dynamically granted APPLICATION_UPDATE can update assigned department candidate');
    assert.equal(coordCseUpdate.body.data.status, 'SHORTLISTED');

    // 2. Coordinator CANNOT update MECH student application (cross-department scope check enforced)
    const coordMechUpdate = await request(app)
      .patch(`/api/applications/${mechAppId}/status`)
      .set('Authorization', `Bearer ${coordSession.token}`)
      .send({ status: 'SHORTLISTED' });
    assert.equal(coordMechUpdate.status, 403, 'Coordinator must NOT be able to update application from another department');

    // Revoke APPLICATION_UPDATE from Coordinator
    await Role.updateOne(
      { _id: ROLE_IDS.PLACEMENT_COORDINATOR },
      { $pull: { permissionIds: PERMISSION_IDS.APPLICATION_UPDATE } }
    );

    // Immediately rejected again (403 Forbidden)
    const coordRevokedRes = await request(app)
      .patch(`/api/applications/${app1Id}/status`)
      .set('Authorization', `Bearer ${coordSession.token}`)
      .send({ status: 'ASSESSMENT' });
    assert.equal(coordRevokedRes.status, 403, 'Revoking permission takes effect immediately without restart');

    // E. Dynamic RBAC: Granting APPLICATION_UPDATE to Placement Head
    await Role.updateOne(
      { _id: ROLE_IDS.PLACEMENT_HEAD },
      { $addToSet: { permissionIds: PERMISSION_IDS.APPLICATION_UPDATE } }
    );

    // Placement Head can update across departments (institution-wide scope)
    const headMechUpdate = await request(app)
      .patch(`/api/applications/${mechAppId}/status`)
      .set('Authorization', `Bearer ${headSession.token}`)
      .send({ status: 'UNDER_REVIEW', note: 'Placement Head reviewed MECH applicant' });
    assert.equal(headMechUpdate.status, 200, 'Placement Head with dynamic APPLICATION_UPDATE has institutional scope');

    // Revoke APPLICATION_UPDATE from Placement Head
    await Role.updateOne(
      { _id: ROLE_IDS.PLACEMENT_HEAD },
      { $pull: { permissionIds: PERMISSION_IDS.APPLICATION_UPDATE } }
    );
    const headRevokedRes = await request(app)
      .patch(`/api/applications/${mechAppId}/status`)
      .set('Authorization', `Bearer ${headSession.token}`)
      .send({ status: 'SHORTLISTED' });
    assert.equal(headRevokedRes.status, 403, 'Placement Head immediately loses update access after permission revocation');

    // F. Preserving Custom Permission Assignments During Seeding
    await Role.updateOne(
      { _id: ROLE_IDS.PLACEMENT_HEAD },
      { $addToSet: { permissionIds: 'CUSTOM_HEAD_PERMISSION' } }
    );
    await seedInitialData();

    const seededHead = await Role.findById(ROLE_IDS.PLACEMENT_HEAD).lean();
    assert.ok(seededHead.permissionIds.includes('CUSTOM_HEAD_PERMISSION'), 'Custom permissions on Placement Head must be preserved during seeding');
    assert.equal(seededHead.permissionIds.includes(PERMISSION_IDS.APPLICATION_UPDATE), false, 'Default seeding does not re-add APPLICATION_UPDATE to Head');

    const seededCompany = await Role.findById(ROLE_IDS.COMPANY).lean();
    assert.ok(seededCompany.permissionIds.includes(PERMISSION_IDS.APPLICATION_UPDATE), 'Company retains APPLICATION_UPDATE after seeding');

    // G. Application List Query Filtering by passingYear and minCgpa
    // Student 1: passingYear 2026, cgpa 8.5
    // Student Mech: passingYear 2025, cgpa 7.2
    const filter2026 = await request(app)
      .get(`/api/applications?jobId=${companyJob._id}&passingYear=2026`)
      .set('Authorization', `Bearer ${assignedCompanyRecruiter.token}`);
    assert.equal(filter2026.status, 200);
    assert.equal(filter2026.body.data.items.length, 1);
    assert.equal(filter2026.body.data.items[0]._id, app1Id);

    const filterMinCgpa8 = await request(app)
      .get(`/api/applications?jobId=${companyJob._id}&minCgpa=8.0`)
      .set('Authorization', `Bearer ${assignedCompanyRecruiter.token}`);
    assert.equal(filterMinCgpa8.status, 200);
    assert.equal(filterMinCgpa8.body.data.items.length, 1);
    assert.equal(filterMinCgpa8.body.data.items[0]._id, app1Id);

    const filter2025 = await request(app)
      .get(`/api/applications?jobId=${companyJob._id}&passingYear=2025`)
      .set('Authorization', `Bearer ${assignedCompanyRecruiter.token}`);
    assert.equal(filter2025.status, 200);
    assert.equal(filter2025.body.data.items.length, 1);
    assert.equal(filter2025.body.data.items[0]._id, mechAppId);

    const filterAll = await request(app)
      .get(`/api/applications?jobId=${companyJob._id}`)
      .set('Authorization', `Bearer ${assignedCompanyRecruiter.token}`);
    assert.equal(filterAll.status, 200);
    assert.equal(filterAll.body.data.items.length, 2, 'Querying without passingYear filter returns all applicants');
  });

  await t.test('Phase 2 — Reapplication After Withdrawal & Application Attempt Management', async () => {
    const { studentSession, studentDoc, dept } = await setupStudentEnvironment({
      cgpa: 8.5,
      passingYear: 2026,
      skills: ['React']
    });

    const { recruiterSession, job, company } = await setupCompanyJob({
      jobTitle: 'Cloud Solutions Architect',
      allowedDepartmentIds: [dept._id],
      allowedPassingYears: [2026],
      minCgpa: 7.0,
      requiredSkills: ['React']
    });

    // 1. Initial Attempt: Student submits first application (Attempt 1)
    const app1Res = await request(app)
      .post('/api/applications')
      .set('Authorization', `Bearer ${studentSession.token}`)
      .send({ jobId: job._id });

    assert.equal(app1Res.status, 201, 'First application attempt should succeed');
    assert.equal(app1Res.body.data.attemptNumber, 1, 'Initial attempt should be attemptNumber 1');
    assert.equal(app1Res.body.data.status, 'APPLIED');
    assert.ok(app1Res.body.data.applicationId.startsWith('APP-'));
    const app1Id = app1Res.body.data._id;

    // 2. Prevent duplicate active application in same round
    const dupRes = await request(app)
      .post('/api/applications')
      .set('Authorization', `Bearer ${studentSession.token}`)
      .send({ jobId: job._id });

    assert.equal(dupRes.status, 409, 'Duplicate active application should be rejected with 409');
    assert.equal(dupRes.body.error.code, 'DUPLICATE_APPLICATION');

    // 3. Student withdraws first attempt
    const withdraw1Res = await request(app)
      .post(`/api/applications/${app1Id}/withdraw`)
      .set('Authorization', `Bearer ${studentSession.token}`)
      .send({ reason: 'Need to update resume details' });

    assert.equal(withdraw1Res.status, 200, 'Withdrawal of attempt 1 should succeed');
    assert.equal(withdraw1Res.body.data.status, 'WITHDRAWN');

    // 4. Student reapplies (Attempt 2)
    const app2Res = await request(app)
      .post('/api/applications')
      .set('Authorization', `Bearer ${studentSession.token}`)
      .send({ jobId: job._id });

    assert.equal(app2Res.status, 201, 'Second application attempt should succeed after withdrawal');
    assert.equal(app2Res.body.data.attemptNumber, 2, 'Reapplication should be attemptNumber 2');
    assert.equal(app2Res.body.data.status, 'APPLIED');
    assert.notEqual(app2Res.body.data.applicationId, app1Res.body.data.applicationId, 'Each attempt has distinct ID');
    const app2Id = app2Res.body.data._id;

    // 5. Candidate withdraws second attempt
    const withdraw2Res = await request(app)
      .post(`/api/applications/${app2Id}/withdraw`)
      .set('Authorization', `Bearer ${studentSession.token}`)
      .send({ reason: 'Revising portfolio link' });

    assert.equal(withdraw2Res.status, 200, 'Withdrawal of attempt 2 should succeed');
    assert.equal(withdraw2Res.body.data.status, 'WITHDRAWN');

    // 6. Student reapplies (Attempt 3 - Maximum allowed)
    const app3Res = await request(app)
      .post('/api/applications')
      .set('Authorization', `Bearer ${studentSession.token}`)
      .send({ jobId: job._id });

    assert.equal(app3Res.status, 201, 'Third application attempt should succeed');
    assert.equal(app3Res.body.data.attemptNumber, 3, 'Third attempt should be attemptNumber 3');
    assert.equal(app3Res.body.data.status, 'APPLIED');
    const app3Id = app3Res.body.data._id;

    // 7. Candidate withdraws third attempt
    const withdraw3Res = await request(app)
      .post(`/api/applications/${app3Id}/withdraw`)
      .set('Authorization', `Bearer ${studentSession.token}`)
      .send({ reason: 'Withdrawing third attempt' });

    assert.equal(withdraw3Res.status, 200, 'Withdrawal of attempt 3 should succeed');
    assert.equal(withdraw3Res.body.data.status, 'WITHDRAWN');

    // 8. Attempt 4 Blocked: Candidate attempts fourth submission
    const app4Res = await request(app)
      .post('/api/applications')
      .set('Authorization', `Bearer ${studentSession.token}`)
      .send({ jobId: job._id });

    assert.equal(app4Res.status, 400, 'Fourth application attempt must be rejected');
    assert.equal(app4Res.body.error.code, 'MAX_APPLICATION_ATTEMPTS_REACHED');

    // 9. Reapplication blocked on terminal rejected or selected
    const { studentSession: s2Session, studentDoc: s2Doc, dept: s2Dept } = await setupStudentEnvironment({
      cgpa: 8.0,
      passingYear: 2026,
      skills: ['React']
    });

    const { recruiterSession: r2Session, job: j2 } = await setupCompanyJob({
      jobTitle: 'Data Engineer',
      allowedDepartmentIds: [s2Dept._id],
      allowedPassingYears: [2026],
      minCgpa: 7.0,
      requiredSkills: ['React']
    });

    const s2AppRes = await request(app)
      .post('/api/applications')
      .set('Authorization', `Bearer ${s2Session.token}`)
      .send({ jobId: j2._id });
    assert.equal(s2AppRes.status, 201);
    const s2AppId = s2AppRes.body.data._id;

    // Company rejects s2
    const rejectRes = await request(app)
      .patch(`/api/applications/${s2AppId}/status`)
      .set('Authorization', `Bearer ${r2Session.token}`)
      .send({ status: 'REJECTED', note: 'Does not meet technical interview standards' });
    assert.equal(rejectRes.status, 200);

    // Student tries to reapply after rejection -> BLOCKED
    const reapplyRejectedRes = await request(app)
      .post('/api/applications')
      .set('Authorization', `Bearer ${s2Session.token}`)
      .send({ jobId: j2._id });
    assert.equal(reapplyRejectedRes.status, 400);
    assert.equal(reapplyRejectedRes.body.error.code, 'REAPPLICATION_NOT_ALLOWED');

    // 10. Job conditions block application (suspended, deadline, closed)
    await Job.updateOne({ _id: j2._id }, { $set: { isSuspended: true } });
    const { studentSession: s3Session, dept: s3Dept } = await setupStudentEnvironment({
      cgpa: 8.0,
      passingYear: 2026,
      skills: ['React']
    });
    await Job.updateOne({ _id: j2._id }, { $addToSet: { 'eligibilityCriteria.allowedDepartmentIds': s3Dept._id } });

    const suspendedRes = await request(app)
      .post('/api/applications')
      .set('Authorization', `Bearer ${s3Session.token}`)
      .send({ jobId: j2._id });
    assert.equal(suspendedRes.status, 400);
    assert.equal(suspendedRes.body.error.code, 'JOB_SUSPENDED');

    await Job.updateOne({ _id: j2._id }, { $set: { isSuspended: false, status: 'CLOSED' } });
    const closedRes = await request(app)
      .post('/api/applications')
      .set('Authorization', `Bearer ${s3Session.token}`)
      .send({ jobId: j2._id });
    assert.equal(closedRes.status, 400);
    assert.equal(closedRes.body.error.code, 'JOB_NOT_OPEN');

    await Job.updateOne({ _id: j2._id }, { $set: { status: 'OPEN', deadline: pastDate(2) } });
    const expiredRes = await request(app)
      .post('/api/applications')
      .set('Authorization', `Bearer ${s3Session.token}`)
      .send({ jobId: j2._id });
    assert.equal(expiredRes.status, 400);
    assert.equal(expiredRes.body.error.code, 'APPLICATION_DEADLINE_PASSED');

    // 11. Recruitment Round Reset: Round 2 gives fresh 3 attempts
    await Job.updateOne({ _id: job._id }, { $set: { recruitmentRound: 2 } });
    const round2App1 = await request(app)
      .post('/api/applications')
      .set('Authorization', `Bearer ${studentSession.token}`)
      .send({ jobId: job._id });
    assert.equal(round2App1.status, 201, 'New recruitment round resets attempt counter');
    assert.equal(round2App1.body.data.attemptNumber, 1);
    assert.equal(round2App1.body.data.recruitmentRound, 2);

    // 12. Recruiter ATS grouping and single entry per candidate per job
    const recruiterList = await request(app)
      .get(`/api/applications?jobId=${job._id}`)
      .set('Authorization', `Bearer ${recruiterSession.token}`);

    assert.equal(recruiterList.status, 200);
    assert.equal(recruiterList.body.data.items.length, 1, 'Recruiter view shows exactly 1 entry per candidate per job');
    const candidateEntry = recruiterList.body.data.items[0];
    assert.equal(candidateEntry.totalAttempts, 4, 'Total attempts includes all attempts by candidate for this job');
    assert.equal(candidateEntry.status, 'APPLIED', 'Latest status reflects candidate active attempt');

    // 12b. Student view consolidation: per studentId + jobId + recruitmentRound
    const studentList = await request(app)
      .get('/api/applications')
      .set('Authorization', `Bearer ${studentSession.token}`);

    assert.equal(studentList.status, 200);
    assert.equal(studentList.body.data.items.length, 2, 'Student view separates different recruitment rounds into distinct rows');
    assert.equal(studentList.body.data.total, 2, 'Pagination total count reflects consolidated entries');

    const round2Entry = studentList.body.data.items.find((item) => item.recruitmentRound === 2);
    const round1Entry = studentList.body.data.items.find((item) => item.recruitmentRound === 1);

    assert.ok(round2Entry, 'Round 2 consolidated entry must exist');
    assert.equal(round2Entry.attemptNumber, 1, 'Round 2 latest attempt number is 1');
    assert.equal(round2Entry.totalAttempts, 1, 'Round 2 has 1 attempt used');
    assert.equal(round2Entry.status, 'APPLIED', 'Round 2 latest status is APPLIED');

    assert.ok(round1Entry, 'Round 1 consolidated entry must exist');
    assert.equal(round1Entry.attemptNumber, 3, 'Round 1 latest attempt number is 3');
    assert.equal(round1Entry.totalAttempts, 3, 'Round 1 has 3 attempts used');
    assert.equal(round1Entry.status, 'WITHDRAWN', 'Round 1 latest status is WITHDRAWN');

    // 12c. Student status filter on consolidated entry
    const studentAppliedOnly = await request(app)
      .get('/api/applications?status=APPLIED')
      .set('Authorization', `Bearer ${studentSession.token}`);
    assert.equal(studentAppliedOnly.status, 200);
    assert.equal(studentAppliedOnly.body.data.items.length, 1);
    assert.equal(studentAppliedOnly.body.data.items[0].recruitmentRound, 2);

    // 12d. Recruiter search filter across consolidated entries
    const searchMatchRes = await request(app)
      .get(`/api/applications?jobId=${job._id}&search=${studentDoc.universityId}`)
      .set('Authorization', `Bearer ${recruiterSession.token}`);
    assert.equal(searchMatchRes.status, 200);
    assert.equal(searchMatchRes.body.data.items.length, 1, 'Search finds candidate by universityId');

    const searchNoMatchRes = await request(app)
      .get(`/api/applications?jobId=${job._id}&search=UNKNOWN_CANDIDATE_XYZ`)
      .set('Authorization', `Bearer ${recruiterSession.token}`);
    assert.equal(searchNoMatchRes.status, 200);
    assert.equal(searchNoMatchRes.body.data.items.length, 0, 'Non-matching search returns 0 results');
    assert.equal(searchNoMatchRes.body.data.total, 0);

    // 13. getApplicationById returns full attempt history in descending order
    const detailRes = await request(app)
      .get(`/api/applications/${round2App1.body.data._id}`)
      .set('Authorization', `Bearer ${recruiterSession.token}`);
    assert.equal(detailRes.status, 200);
    assert.ok(Array.isArray(detailRes.body.data.attemptHistory));
    assert.equal(detailRes.body.data.attemptHistory.length, 4);
    assert.equal(detailRes.body.data.attemptHistory[0].attemptNumber, 1);
    assert.equal(detailRes.body.data.attemptHistory[0].recruitmentRound, 2);

    // 14. Historical attempts locked from modification
    const histUpdateRes = await request(app)
      .patch(`/api/applications/${app1Id}/status`)
      .set('Authorization', `Bearer ${recruiterSession.token}`)
      .send({ status: 'UNDER_REVIEW' });
    assert.equal(histUpdateRes.status, 400, 'Updating a historical attempt must be blocked');

    // 15. Job candidate count in listJobs excludes withdrawn candidates
    const jobListRes = await request(app)
      .get('/api/jobs')
      .set('Authorization', `Bearer ${recruiterSession.token}`);
    assert.equal(jobListRes.status, 200);
    const listedJob = jobListRes.body.data.items.find((j) => String(j._id) === String(job._id));
    assert.equal(listedJob.applicationsCount, 1, 'Active candidate count is 1, not inflated by multiple attempts');
  });
});
