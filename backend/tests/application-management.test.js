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
  import('../src/models/student.model.js'),
  import('../src/models/placement_officer.model.js'),
  import('../src/models/job.model.js'),
  import('../src/models/application.model.js'),
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
});
