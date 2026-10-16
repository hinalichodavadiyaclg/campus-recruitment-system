import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { seedInitialData } from '../src/seeders/seed.js';
import { User } from '../src/models/user.model.js';
import { UserSession } from '../src/models/user-session.model.js';
import { Student } from '../src/models/student.model.js';
import { Department } from '../src/models/department.model.js';
import { PlacementOfficer } from '../src/models/placement_officer.model.js';
import { Workshop } from '../src/models/workshop.model.js';
import { WorkshopRegistration } from '../src/models/workshop_registration.model.js';
import { WorkshopAttendance } from '../src/models/workshop_attendance.model.js';
import { WorkshopCertificate } from '../src/models/workshop_certificate.model.js';
import { WorkshopAuditLog } from '../src/models/workshop_audit_log.model.js';
import { ROLE_IDS, PERMISSION_IDS } from '../src/utils/access-constants.js';
import { hashPassword } from '../src/utils/password.js';
import { createRawSessionToken, hashSessionToken } from '../src/utils/session-token.js';

let replSet;
let app;
let departmentDoc;

before(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await connectDatabase(replSet.getUri());
  await seedInitialData();
  app = createApp();
});

after(async () => {
  await disconnectDatabase();
  if (replSet) {
    await replSet.stop();
  }
});

beforeEach(async () => {
  await Workshop.deleteMany({});
  await WorkshopRegistration.deleteMany({});
  await WorkshopAttendance.deleteMany({});
  await WorkshopCertificate.deleteMany({});
  await WorkshopAuditLog.deleteMany({});
  await Student.deleteMany({});
  await UserSession.deleteMany({});

  departmentDoc = await Department.findOne({ code: 'CSE' });
  if (!departmentDoc) {
    departmentDoc = await Department.create({
      name: 'Computer Science and Engineering',
      code: 'CSE',
      isActive: true
    });
  }
});

/**
 * Creates an active authenticated user and session, returning the raw Bearer token and user doc.
 */
async function createAuthenticatedSession(roleId, userType = 'PLACEMENT', extraUserData = {}) {
  const ts = Date.now() + Math.floor(Math.random() * 1000000);
  const email = `test-${roleId.toLowerCase()}-${ts}@vvwu.edu.in`;
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

  if (roleId === ROLE_IDS.PLACEMENT_COORDINATOR) {
    await PlacementOfficer.create({
      userId: user._id,
      employeeId: user.employeeId,
      firstName: 'Coordinator',
      lastName: 'Test',
      email: user.email,
      mobileNumber: '9876543210',
      designation: 'Assistant Professor',
      department: departmentDoc.name,
      departmentId: departmentDoc._id,
      role: ROLE_IDS.PLACEMENT_COORDINATOR
    });
  }

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

  return { user, rawToken };
}

/**
 * Helper to link a valid Student domain profile to a student user account.
 */
async function seedStudentProfile(user, semester = 6) {
  const student = await Student.create({
    universityId: user.universityId,
    firstName: 'Sneha',
    lastName: 'Patel',
    email: user.email,
    mobileNumber: '9876543210',
    branch: 'Computer Science and Engineering',
    department: departmentDoc.name,
    departmentId: departmentDoc._id,
    semester,
    cgpa: 8.9,
    userId: user._id
  });
  return student;
}

test('1. POST /api/workshops - Unauthenticated request is rejected with 401', async () => {
  const response = await request(app)
    .post('/api/workshops')
    .send({ title: 'Test Workshop' });

  assert.equal(response.status, 401);
  assert.equal(response.body.success, false);
  assert.equal(response.body.error.code, 'UNAUTHENTICATED');
});

test('2. POST /api/workshops - Unauthorized role (Student) is rejected with 403', async () => {
  const { user, rawToken } = await createAuthenticatedSession(ROLE_IDS.STUDENT, 'STUDENT');
  await seedStudentProfile(user);

  const response = await request(app)
    .post('/api/workshops')
    .set('Authorization', `Bearer ${rawToken}`)
    .send({
      title: 'Hacking 101',
      description: 'Unauthorized student workshop creation attempt.',
      category: 'TECHNICAL',
      mode: 'ONLINE',
      meetingLink: 'https://meet.google.com/test',
      startAt: new Date(Date.now() + 86400000).toISOString(),
      endAt: new Date(Date.now() + 90000000).toISOString(),
      registrationDeadline: new Date(Date.now() + 43200000).toISOString(),
      maxParticipants: 30,
      sessions: [
        {
          sessionId: 'SES-01',
          sessionNumber: 1,
          title: 'Session 1',
          startAt: new Date(Date.now() + 86400000).toISOString(),
          endAt: new Date(Date.now() + 90000000).toISOString()
        }
      ]
    });

  assert.equal(response.status, 403);
  assert.equal(response.body.success, false);
  assert.equal(response.body.error.code, 'FORBIDDEN');
});

test('3. POST /api/workshops - Authorized Coordinator creates workshop in DRAFT', async () => {
  const { rawToken } = await createAuthenticatedSession(ROLE_IDS.PLACEMENT_COORDINATOR, 'PLACEMENT');

  const startAt = new Date(Date.now() + 86400000);
  const endAt = new Date(startAt.getTime() + 7200000);
  const deadline = new Date(startAt.getTime() - 3600000);

  const response = await request(app)
    .post('/api/workshops')
    .set('Authorization', `Bearer ${rawToken}`)
    .send({
      title: 'Full Stack Development Workshop',
      description: 'Hands on MERN stack and modern cloud architecture.',
      category: 'TECHNICAL',
      mode: 'ONLINE',
      meetingLink: 'https://meet.google.com/mern-bootcamp',
      ownershipType: 'DEPARTMENT',
      departmentId: String(departmentDoc._id),
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      registrationDeadline: deadline.toISOString(),
      maxParticipants: 50,
      sessions: [
        {
          sessionId: 'SES-01',
          sessionNumber: 1,
          title: 'React & Node Overview',
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          isAttendanceRequired: true
        }
      ]
    });

  assert.equal(response.status, 201);
  assert.equal(response.body.success, true);
  const data = response.body.data;
  assert.ok(data._id);
  assert.ok(data.workshopId.startsWith('WS-2026-'));
  assert.equal(data.approvalStatus, 'DRAFT');
  assert.equal(data.isPublished, false);
});

test('4. Complete Lifecycle API Workflow - Submit, Approve, Publish, and Cancel', async () => {
  const { rawToken: coordToken } = await createAuthenticatedSession(ROLE_IDS.PLACEMENT_COORDINATOR, 'PLACEMENT');
  const { rawToken: headToken } = await createAuthenticatedSession(ROLE_IDS.PLACEMENT_HEAD, 'PLACEMENT');

  const startAt = new Date(Date.now() + 86400000);
  const endAt = new Date(startAt.getTime() + 7200000);
  const deadline = new Date(startAt.getTime() - 3600000);

  // 1. Create Workshop
  const createRes = await request(app)
    .post('/api/workshops')
    .set('Authorization', `Bearer ${coordToken}`)
    .send({
      title: 'Lifecycle Verification Workshop',
      description: 'Testing complete API controller state machine.',
      category: 'CAREER_PREP',
      mode: 'ONLINE',
      meetingLink: 'https://meet.google.com/lifecycle-test',
      ownershipType: 'DEPARTMENT',
      departmentId: String(departmentDoc._id),
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      registrationDeadline: deadline.toISOString(),
      maxParticipants: 40,
      sessions: [
        {
          sessionId: 'SES-01',
          sessionNumber: 1,
          title: 'Career Roadmap',
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString()
        }
      ]
    });

  assert.equal(createRes.status, 201);
  const workshopId = createRes.body.data._id;

  // 2. Submit for review (POST /api/workshops/:id/submit)
  const submitRes = await request(app)
    .post(`/api/workshops/${workshopId}/submit`)
    .set('Authorization', `Bearer ${coordToken}`)
    .send({});

  assert.equal(submitRes.status, 200);
  assert.equal(submitRes.body.data.approvalStatus, 'PENDING_APPROVAL');

  // 3. Approve workshop (POST /api/workshops/:id/approve)
  const approveRes = await request(app)
    .post(`/api/workshops/${workshopId}/approve`)
    .set('Authorization', `Bearer ${headToken}`)
    .send({ comment: 'Approved for university-wide rollout.' });

  assert.equal(approveRes.status, 200);
  assert.equal(approveRes.body.data.approvalStatus, 'APPROVED');

  // 4. Publish workshop (POST /api/workshops/:id/publish)
  const publishRes = await request(app)
    .post(`/api/workshops/${workshopId}/publish`)
    .set('Authorization', `Bearer ${coordToken}`)
    .send({});

  assert.equal(publishRes.status, 200);
  assert.equal(publishRes.body.data.isPublished, true);

  // 5. Cancel workshop with reason (POST /api/workshops/:id/cancel)
  const cancelRes = await request(app)
    .post(`/api/workshops/${workshopId}/cancel`)
    .set('Authorization', `Bearer ${headToken}`)
    .send({ reason: 'Speaker unavailable due to scheduling conflict.' });

  assert.equal(cancelRes.status, 200);
  assert.equal(cancelRes.body.data.lifecycleStatus, 'CANCELLED');
});

test('5. Registration & Roster APIs - Student registers and cancels active booking', async () => {
  const { rawToken: adminToken } = await createAuthenticatedSession(ROLE_IDS.SUPER_ADMIN, 'PLACEMENT');
  const { user: studentUser, rawToken: studentToken } = await createAuthenticatedSession(ROLE_IDS.STUDENT, 'STUDENT');
  await seedStudentProfile(studentUser);

  const startAt = new Date(Date.now() + 86400000);
  const endAt = new Date(startAt.getTime() + 7200000);
  const deadline = new Date(startAt.getTime() - 3600000);

  // Seed published workshop
  const workshop = await Workshop.create({
    workshopId: 'WS-2026-0777',
    title: 'Registration API Workshop',
    description: 'Testing registration and roster controller endpoints.',
    category: 'TECHNICAL',
    mode: 'ONLINE',
    meetingLink: 'https://meet.google.com/reg-api-test',
    ownershipType: 'CENTRAL_PLACEMENT_CELL',
    approvalStatus: 'APPROVED',
    isPublished: true,
    lifecycleStatus: 'SCHEDULED',
    createdBy: studentUser._id,
    startAt,
    endAt,
    registrationDeadline: deadline,
    maxParticipants: 10,
    targetAudience: { isAllDepartments: true, departmentRules: [] },
    sessions: [
      {
        sessionId: 'SES-01',
        sessionNumber: 1,
        title: 'Session 1',
        startAt,
        endAt,
        isAttendanceRequired: true
      }
    ]
  });

  // 1. Student registers (POST /api/workshops/:id/register)
  const regRes = await request(app)
    .post(`/api/workshops/${workshop._id}/register`)
    .set('Authorization', `Bearer ${studentToken}`)
    .send({});

  assert.equal(regRes.status, 201);
  assert.equal(regRes.body.success, true);
  assert.ok(regRes.body.data.registrationId.startsWith('WREG-2026-'));
  assert.equal(regRes.body.data.status, 'REGISTERED');

  // Duplicate registration rejected with 409
  const dupRes = await request(app)
    .post(`/api/workshops/${workshop._id}/register`)
    .set('Authorization', `Bearer ${studentToken}`)
    .send({});

  assert.equal(dupRes.status, 409);
  assert.equal(dupRes.body.error.code, 'ALREADY_REGISTERED');

  // 2. View roster (GET /api/workshops/:id/roster)
  const rosterRes = await request(app)
    .get(`/api/workshops/${workshop._id}/roster`)
    .set('Authorization', `Bearer ${adminToken}`);

  assert.equal(rosterRes.status, 200);
  assert.equal(rosterRes.body.data.total, 1);
  assert.equal(rosterRes.body.data.roster.length, 1);

  // 3. Student cancels registration (POST /api/workshops/:id/cancel-registration)
  const cancelRegRes = await request(app)
    .post(`/api/workshops/${workshop._id}/cancel-registration`)
    .set('Authorization', `Bearer ${studentToken}`)
    .send({ reason: 'Personal conflict' });

  assert.equal(cancelRegRes.status, 200);
  assert.equal(cancelRegRes.body.data.status, 'CANCELLED');
});

test('6. Session Attendance APIs - Assigned trainer submits and corrects attendance', async () => {
  const { user: trainerUser, rawToken: trainerToken } = await createAuthenticatedSession(ROLE_IDS.PLACEMENT_COORDINATOR, 'PLACEMENT');
  const trainerSubId = new mongoose.Types.ObjectId();

  const { user: studentUser } = await createAuthenticatedSession(ROLE_IDS.STUDENT, 'STUDENT');
  const studentDoc = await seedStudentProfile(studentUser);

  const startAt = new Date(Date.now() - 3600000);
  const endAt = new Date(Date.now() + 3600000);

  const workshop = await Workshop.create({
    workshopId: 'WS-2026-0888',
    title: 'Attendance Controller Workshop',
    description: 'Testing attendance endpoints.',
    category: 'TECHNICAL',
    mode: 'ONLINE',
    meetingLink: 'https://meet.google.com/att-test',
    ownershipType: 'CENTRAL_PLACEMENT_CELL',
    approvalStatus: 'APPROVED',
    isPublished: true,
    lifecycleStatus: 'ACTIVE',
    createdBy: trainerUser._id,
    startAt,
    endAt,
    registrationDeadline: new Date(Date.now() - 7200000),
    maxParticipants: 20,
    trainers: [
      {
        _id: trainerSubId,
        trainerType: 'PLACEMENT_COORDINATOR',
        userId: trainerUser._id,
        name: 'Internal Assigned Trainer'
      }
    ],
    sessions: [
      {
        sessionId: 'SES-01',
        sessionNumber: 1,
        title: 'Session 1',
        startAt,
        endAt,
        trainerIds: [String(trainerSubId)],
        isAttendanceRequired: true
      }
    ]
  });

  const registrationDoc = await WorkshopRegistration.create({
    registrationId: 'WREG-2026-8888',
    workshopId: workshop._id,
    studentId: studentDoc._id,
    status: 'REGISTERED',
    registrationSource: 'STUDENT',
    registeredBy: studentUser._id,
    activeRegistrationKey: 'ACTIVE'
  });

  // 1. Submit initial attendance (POST /api/workshops/:id/sessions/:sessionId/attendance)
  const submitRes = await request(app)
    .post(`/api/workshops/${workshop._id}/sessions/SES-01/attendance`)
    .set('Authorization', `Bearer ${trainerToken}`)
    .send({
      attendees: [
        {
          registrationId: String(registrationDoc._id),
          studentId: String(studentDoc._id),
          attendanceStatus: 'ABSENT'
        }
      ]
    });

  assert.equal(submitRes.status, 200);
  assert.equal(submitRes.body.data.recordedCount, 1);

  // 2. Query attendance (GET /api/workshops/:id/sessions/:sessionId/attendance)
  const getAttRes = await request(app)
    .get(`/api/workshops/${workshop._id}/sessions/SES-01/attendance`)
    .set('Authorization', `Bearer ${trainerToken}`);

  assert.equal(getAttRes.status, 200);
  assert.equal(getAttRes.body.data.total, 1);
  assert.equal(getAttRes.body.data.attendance[0].attendanceStatus, 'ABSENT');

  // 3. Correction requires reason (>= 5 chars)
  const failCorrectionRes = await request(app)
    .post(`/api/workshops/${workshop._id}/sessions/SES-01/attendance`)
    .set('Authorization', `Bearer ${trainerToken}`)
    .send({
      attendees: [
        {
          registrationId: String(registrationDoc._id),
          studentId: String(studentDoc._id),
          attendanceStatus: 'PRESENT'
        }
      ]
    });

  assert.equal(failCorrectionRes.status, 400);
  assert.equal(failCorrectionRes.body.error.code, 'CORRECTION_REASON_REQUIRED');

  // 4. Correction with valid reason succeeds
  const correctionRes = await request(app)
    .post(`/api/workshops/${workshop._id}/sessions/SES-01/attendance`)
    .set('Authorization', `Bearer ${trainerToken}`)
    .send({
      correctionReason: 'Student confirmed network reconnection verification.',
      attendees: [
        {
          registrationId: String(registrationDoc._id),
          studentId: String(studentDoc._id),
          attendanceStatus: 'PRESENT'
        }
      ]
    });

  assert.equal(correctionRes.status, 200);
  assert.equal(correctionRes.body.data.updatedCount, 1);
});

test('7. Certificate APIs - Issue, Revoke, Student Listing, and Public Verification', async () => {
  const { rawToken: headToken } = await createAuthenticatedSession(ROLE_IDS.PLACEMENT_HEAD, 'PLACEMENT');
  const { user: studentUser, rawToken: studentToken } = await createAuthenticatedSession(ROLE_IDS.STUDENT, 'STUDENT');
  const studentDoc = await seedStudentProfile(studentUser);

  const startAt = new Date(Date.now() - 7200000);
  const endAt = new Date(Date.now() - 3600000);

  const workshop = await Workshop.create({
    workshopId: 'WS-2026-0999',
    title: 'Certificate API Workshop',
    description: 'Testing certificate issuance and public verification.',
    category: 'TECHNICAL',
    mode: 'ONLINE',
    meetingLink: 'https://meet.google.com/cert-test',
    ownershipType: 'CENTRAL_PLACEMENT_CELL',
    approvalStatus: 'APPROVED',
    isPublished: true,
    lifecycleStatus: 'COMPLETED',
    createdBy: studentUser._id,
    startAt,
    endAt,
    registrationDeadline: new Date(Date.now() - 10000000),
    maxParticipants: 20,
    sessions: [
      {
        sessionId: 'SES-01',
        sessionNumber: 1,
        title: 'Session 1',
        startAt,
        endAt,
        isAttendanceRequired: true
      }
    ]
  });

  const registrationDoc = await WorkshopRegistration.create({
    registrationId: 'WREG-2026-0999',
    workshopId: workshop._id,
    studentId: studentDoc._id,
    status: 'COMPLETED',
    attendancePercentage: 100,
    completionStatus: 'COMPLETED',
    registrationSource: 'STUDENT',
    registeredBy: studentUser._id,
    activeRegistrationKey: 'ACTIVE'
  });

  // 1. Issue certificates (POST /api/workshops/:id/certificates/issue)
  const issueRes = await request(app)
    .post(`/api/workshops/${workshop._id}/certificates/issue`)
    .set('Authorization', `Bearer ${headToken}`)
    .send({});

  assert.equal(issueRes.status, 200);
  assert.equal(issueRes.body.data.issuedCount, 1);
  const cert = issueRes.body.data.certificates[0];
  assert.ok(cert.certificateNumber.startsWith('CERT-2026-'));
  const verificationCode = cert.verificationCode;

  // 2. Student views their certificates (GET /api/workshops/certificates/me)
  // Ensures static route does not collide with /:id!
  const myCertsRes = await request(app)
    .get('/api/workshops/certificates/me')
    .set('Authorization', `Bearer ${studentToken}`);

  assert.equal(myCertsRes.status, 200);
  assert.equal(myCertsRes.body.data.length, 1);
  assert.equal(myCertsRes.body.data[0].certificateNumber, cert.certificateNumber);

  // 3. Public certificate verification (GET /api/workshops/certificates/verify/:code)
  // Public endpoint: NO Authorization header needed
  const publicVerifyRes = await request(app)
    .get(`/api/workshops/certificates/verify/${verificationCode}`);

  assert.equal(publicVerifyRes.status, 200);
  assert.equal(publicVerifyRes.body.data.isValid, true);
  assert.equal(publicVerifyRes.body.data.certificateNumber, cert.certificateNumber);
  // Privacy data minimization verification
  assert.equal(publicVerifyRes.body.data.studentName, 'Sneha P.');
  assert.equal(publicVerifyRes.body.data.universityId, undefined);
  assert.equal(publicVerifyRes.body.data.email, undefined);

  // 4. Revoke certificate (POST /api/workshops/certificates/:id/revoke)
  const revokeRes = await request(app)
    .post(`/api/workshops/certificates/${cert._id}/revoke`)
    .set('Authorization', `Bearer ${headToken}`)
    .send({ reason: 'Found non-compliance in attendance logs.' });

  assert.equal(revokeRes.status, 200);
  assert.equal(revokeRes.body.data.certificateStatus, 'REVOKED');
});

test('8. Audit Log API - Authorized retrieval of workshop audit trail', async () => {
  const { rawToken: adminToken } = await createAuthenticatedSession(ROLE_IDS.SUPER_ADMIN, 'PLACEMENT');

  const startAt = new Date(Date.now() + 86400000);
  const workshop = await Workshop.create({
    workshopId: 'WS-2026-0666',
    title: 'Audit Log Workshop',
    description: 'Testing audit logs endpoint.',
    category: 'TECHNICAL',
    mode: 'ONLINE',
    meetingLink: 'https://meet.google.com/audit-test',
    ownershipType: 'CENTRAL_PLACEMENT_CELL',
    approvalStatus: 'DRAFT',
    isPublished: false,
    lifecycleStatus: 'SCHEDULED',
    createdBy: new mongoose.Types.ObjectId(),
    startAt,
    endAt: new Date(startAt.getTime() + 7200000),
    registrationDeadline: new Date(startAt.getTime() - 3600000),
    maxParticipants: 20,
    sessions: [
      {
        sessionId: 'SES-01',
        sessionNumber: 1,
        title: 'Session 1',
        startAt,
        endAt: new Date(startAt.getTime() + 7200000)
      }
    ]
  });

  await WorkshopAuditLog.create({
    workshopId: workshop._id,
    action: 'WORKSHOP_CREATED',
    entityType: 'WORKSHOP',
    entityId: workshop.workshopId,
    changedBy: new mongoose.Types.ObjectId(),
    newValue: { title: workshop.title }
  });

  const auditRes = await request(app)
    .get(`/api/workshops/${workshop._id}/audit-logs`)
    .set('Authorization', `Bearer ${adminToken}`);

  assert.equal(auditRes.status, 200);
  assert.equal(auditRes.body.data.total, 1);
  assert.equal(auditRes.body.data.auditLogs[0].action, 'WORKSHOP_CREATED');
});
