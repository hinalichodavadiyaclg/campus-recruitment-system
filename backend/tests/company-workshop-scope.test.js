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
import { Company } from '../src/models/company.model.js';
import { Department } from '../src/models/department.model.js';
import { Course } from '../src/models/course.model.js';
import { PlacementOfficer } from '../src/models/placement_officer.model.js';
import { Workshop } from '../src/models/workshop.model.js';
import { WorkshopRegistration } from '../src/models/workshop_registration.model.js';
import { WorkshopAttendance } from '../src/models/workshop_attendance.model.js';
import { WorkshopAuditLog } from '../src/models/workshop_audit_log.model.js';
import { ROLE_IDS } from '../src/utils/access-constants.js';
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
  await WorkshopAuditLog.deleteMany({});
  await UserSession.deleteMany({});
  await Company.deleteMany({});

  departmentDoc = await Department.findOne({ code: 'CSE' });
  if (!departmentDoc) {
    departmentDoc = await Department.create({
      name: 'Computer Science and Engineering',
      code: 'CSE',
      isActive: true
    });
  }

  let courseDoc = await Course.findOne({ code: 'BCA' });
  if (!courseDoc) {
    await Course.create({
      name: 'Bachelor of Computer Applications',
      code: 'BCA',
      departmentId: departmentDoc._id,
      level: 'UNDERGRADUATE',
      durationYears: 3,
      totalSemesters: 6,
      isActive: true
    });
  }
});

/**
 * Helper to create an active authenticated session for a specific role/userType.
 */
async function createAuthSession(roleId, userType = 'COMPANY', extraData = {}) {
  const ts = Date.now() + Math.floor(Math.random() * 1000000);
  const email = `test-${roleId.toLowerCase()}-${ts}@domain.com`;
  const passwordHash = await hashPassword('Password!123456');

  let companyId = extraData.companyId;
  if (userType === 'COMPANY' && !companyId) {
    const comp = await Company.create({
      companyId: `COMP-${ts}`,
      companyName: `${extraData.companyName || 'Company'}_${ts}`,
      industryType: 'IT',
      hrRecruiterName: 'Recruiter',
      email: `hr-${ts}@domain.com`,
      yearEstablished: 2020
    });
    companyId = comp._id;
  }

  const user = await User.create({
    email,
    passwordHash,
    userType,
    roleId,
    companyId: userType === 'COMPANY' ? companyId : undefined,
    employeeId: userType === 'PLACEMENT' ? `EMP-${ts}` : undefined,
    accountStatus: 'ACTIVE',
    ...extraData
  });

  if (roleId === ROLE_IDS.PLACEMENT_COORDINATOR) {
    await PlacementOfficer.create({
      userId: user._id,
      employeeId: user.employeeId,
      firstName: 'Coordinator',
      lastName: 'User',
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
    ipAddress: '127.0.0.1',
    userAgent: 'Supertest-Agent',
    loginAt: now,
    lastActivityAt: now,
    createdAt: now,
    lastSeenAt: now,
    expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    isActive: true,
    isRevoked: false
  });

  return { token: rawToken, user, companyId };
}

function buildValidWorkshopPayload(overrides = {}) {
  return {
    title: 'Valid Program Title',
    description: 'Detailed program curriculum description for testing.',
    category: 'TECHNICAL',
    mode: 'ONLINE',
    meetingLink: 'https://meet.google.com/test-room',
    ownershipType: 'CENTRAL_PLACEMENT_CELL',
    maxParticipants: 50,
    startAt: '2026-11-20T10:00:00.000Z',
    endAt: '2026-11-20T13:00:00.000Z',
    registrationOpensAt: '2026-10-25T00:00:00.000Z',
    registrationDeadline: '2026-11-19T23:59:59.000Z',
    targetAudience: { isAllDepartments: true, departmentRules: [] },
    sessions: [
      {
        sessionId: 'SES-01',
        sessionNumber: 1,
        title: 'Core Concepts',
        startAt: '2026-11-20T10:00:00.000Z',
        endAt: '2026-11-20T13:00:00.000Z',
        isAttendanceRequired: true
      }
    ],
    ...overrides
  };
}

test('1. Company can create their own workshop and ownership is correctly associated', async () => {
  const companyA = await createAuthSession(ROLE_IDS.COMPANY, 'COMPANY', { companyName: 'Company Alpha' });

  const payload = buildValidWorkshopPayload({
    title: 'Alpha Tech Bootcamp 2026',
    description: 'Special technical workshop by Company Alpha on cloud architecture.',
    mode: 'OFFLINE',
    venue: 'Alpha Lab 1',
    meetingLink: undefined,
    trainers: [
      {
        trainerType: 'COMPANY',
        companyId: String(companyA.companyId),
        name: 'Alpha Lead Engineer',
        designation: 'Architect',
        organization: 'Company Alpha'
      }
    ]
  });

  const res = await request(app)
    .post('/api/workshops')
    .set('Authorization', `Bearer ${companyA.token}`)
    .send(payload);

  if (res.status !== 201) {
    console.log('CREATE_WORKSHOP_400_ERROR:', JSON.stringify(res.body, null, 2));
  }
  assert.equal(res.status, 201);
  assert.equal(res.body.success, true);
  assert.ok(res.body.data?.workshopId);
  assert.equal(String(res.body.data?.companyId?._id || res.body.data?.companyId), String(companyA.companyId));
  assert.equal(String(res.body.data?.createdBy), String(companyA.user._id));
  assert.equal(res.body.data?.approvalStatus, 'DRAFT');
});

test('2. Company can only see their own workshops in listWorkshops', async () => {
  const companyA = await createAuthSession(ROLE_IDS.COMPANY, 'COMPANY', { companyName: 'Company Alpha' });
  const companyB = await createAuthSession(ROLE_IDS.COMPANY, 'COMPANY', { companyName: 'Company Beta' });
  const coord = await createAuthSession(ROLE_IDS.PLACEMENT_COORDINATOR, 'PLACEMENT');

  // Company A creates workshop
  const resA = await request(app)
    .post('/api/workshops')
    .set('Authorization', `Bearer ${companyA.token}`)
    .send(buildValidWorkshopPayload({
      title: 'Company Alpha Workshop',
      startAt: '2026-11-15T09:00:00.000Z',
      endAt: '2026-11-15T12:00:00.000Z',
      registrationDeadline: '2026-11-14T23:59:59.000Z',
      sessions: [{
        sessionId: 'SES-01',
        sessionNumber: 1,
        title: 'Alpha Session',
        startAt: '2026-11-15T09:00:00.000Z',
        endAt: '2026-11-15T12:00:00.000Z'
      }]
    }));
  assert.equal(resA.status, 201);
  const wsAId = resA.body.data._id;

  // Company B creates workshop
  const resB = await request(app)
    .post('/api/workshops')
    .set('Authorization', `Bearer ${companyB.token}`)
    .send(buildValidWorkshopPayload({
      title: 'Company Beta Workshop',
      startAt: '2026-11-16T09:00:00.000Z',
      endAt: '2026-11-16T12:00:00.000Z',
      registrationDeadline: '2026-11-15T23:59:59.000Z',
      sessions: [{
        sessionId: 'SES-01',
        sessionNumber: 1,
        title: 'Beta Session',
        startAt: '2026-11-16T09:00:00.000Z',
        endAt: '2026-11-16T12:00:00.000Z'
      }]
    }));
  assert.equal(resB.status, 201);
  const wsBId = resB.body.data._id;

  // Coordinator creates workshop
  const resCoord = await request(app)
    .post('/api/workshops')
    .set('Authorization', `Bearer ${coord.token}`)
    .send(buildValidWorkshopPayload({
      title: 'Department CSE Workshop',
      mode: 'OFFLINE',
      venue: 'Lab 2',
      meetingLink: undefined,
      ownershipType: 'DEPARTMENT',
      departmentId: String(departmentDoc._id),
      targetAudience: {
        isAllDepartments: false,
        departmentRules: [{ departmentId: String(departmentDoc._id), targetingMode: 'ALL_COURSES_ALL_SEMESTERS' }]
      }
    }));
  assert.equal(resCoord.status, 201);

  // Company A lists workshops: Must only see wsA
  const listA = await request(app)
    .get('/api/workshops')
    .set('Authorization', `Bearer ${companyA.token}`);

  assert.equal(listA.status, 200);
  assert.equal(listA.body.success, true);
  const idsForA = listA.body.data.workshops.map((w) => String(w._id));
  assert.ok(idsForA.includes(String(wsAId)), 'Company A must see their own workshop');
  assert.equal(idsForA.includes(String(wsBId)), false, 'Company A must NOT see Company B workshop');
  assert.equal(idsForA.length, 1, 'Company A must only see exactly 1 workshop');

  // Company B lists workshops: Must only see wsB
  const listB = await request(app)
    .get('/api/workshops')
    .set('Authorization', `Bearer ${companyB.token}`);

  assert.equal(listB.status, 200);
  assert.equal(listB.body.success, true);
  const idsForB = listB.body.data.workshops.map((w) => String(w._id));
  assert.ok(idsForB.includes(String(wsBId)), 'Company B must see their own workshop');
  assert.equal(idsForB.includes(String(wsAId)), false, 'Company B must NOT see Company A workshop');
  assert.equal(idsForB.length, 1, 'Company B must only see exactly 1 workshop');
});

test('3. Company cannot view or manage another company workshop by ID (403 Forbidden)', async () => {
  const companyA = await createAuthSession(ROLE_IDS.COMPANY, 'COMPANY', { companyName: 'Company Alpha' });
  const companyB = await createAuthSession(ROLE_IDS.COMPANY, 'COMPANY', { companyName: 'Company Beta' });

  // Company B creates workshop
  const resB = await request(app)
    .post('/api/workshops')
    .set('Authorization', `Bearer ${companyB.token}`)
    .send(buildValidWorkshopPayload({
      title: 'Company Beta Workshop'
    }));
  assert.equal(resB.status, 201);
  const wsBId = resB.body.data._id;

  // 1. Company A trying to GET wsB -> 403 Forbidden
  const getRes = await request(app)
    .get(`/api/workshops/${wsBId}`)
    .set('Authorization', `Bearer ${companyA.token}`);
  assert.equal(getRes.status, 403);
  assert.equal(getRes.body.error?.code, 'FORBIDDEN');

  // 2. Company A trying to PATCH wsB -> 403 Forbidden
  const updateRes = await request(app)
    .patch(`/api/workshops/${wsBId}`)
    .set('Authorization', `Bearer ${companyA.token}`)
    .send({ title: 'Hacked Title' });
  assert.equal(updateRes.status, 403);
  assert.equal(updateRes.body.error?.code, 'FORBIDDEN');

  // 3. Company A trying to SUBMIT wsB -> 403 Forbidden
  const submitRes = await request(app)
    .post(`/api/workshops/${wsBId}/submit`)
    .set('Authorization', `Bearer ${companyA.token}`);
  assert.equal(submitRes.status, 403);
  assert.equal(submitRes.body.error?.code, 'FORBIDDEN');

  // 4. Company A trying to DELETE wsB -> 403 Forbidden
  const deleteRes = await request(app)
    .delete(`/api/workshops/${wsBId}`)
    .set('Authorization', `Bearer ${companyA.token}`);
  assert.equal(deleteRes.status, 403);
  assert.equal(deleteRes.body.error?.code, 'FORBIDDEN');

  // 5. Company A trying to GET ROSTER of wsB -> 403 Forbidden
  const rosterRes = await request(app)
    .get(`/api/workshops/${wsBId}/roster`)
    .set('Authorization', `Bearer ${companyA.token}`);
  assert.equal(rosterRes.status, 403);
  assert.equal(rosterRes.body.error?.code, 'FORBIDDEN');

  // 6. Company A trying to GET AUDIT LOGS of wsB -> 403 Forbidden
  const auditRes = await request(app)
    .get(`/api/workshops/${wsBId}/audit-logs`)
    .set('Authorization', `Bearer ${companyA.token}`);
  assert.equal(auditRes.status, 403);
  assert.equal(auditRes.body.error?.code, 'FORBIDDEN');
});

test('4. Company CAN view, update, submit, and delete their OWN draft workshop', async () => {
  const companyA = await createAuthSession(ROLE_IDS.COMPANY, 'COMPANY', { companyName: 'Company Alpha' });

  // 1. Create
  const createRes = await request(app)
    .post('/api/workshops')
    .set('Authorization', `Bearer ${companyA.token}`)
    .send(buildValidWorkshopPayload({
      title: 'Company Alpha Workshop Draft'
    }));
  assert.equal(createRes.status, 201);
  const wsId = createRes.body.data._id;

  // 2. Get by ID
  const getRes = await request(app)
    .get(`/api/workshops/${wsId}`)
    .set('Authorization', `Bearer ${companyA.token}`);
  assert.equal(getRes.status, 200);
  assert.equal(getRes.body.data.title, 'Company Alpha Workshop Draft');

  // 3. Update
  const updateRes = await request(app)
    .patch(`/api/workshops/${wsId}`)
    .set('Authorization', `Bearer ${companyA.token}`)
    .send({ title: 'Company Alpha Updated Title' });
  assert.equal(updateRes.status, 200);
  assert.equal(updateRes.body.data.title, 'Company Alpha Updated Title');

  // 4. Submit for review
  const submitRes = await request(app)
    .post(`/api/workshops/${wsId}/submit`)
    .set('Authorization', `Bearer ${companyA.token}`);
  assert.equal(submitRes.status, 200);
  assert.equal(submitRes.body.data.approvalStatus, 'PENDING_APPROVAL');

  // 5. Anti-bypass: Company cannot approve or publish
  const approveRes = await request(app)
    .post(`/api/workshops/${wsId}/approve`)
    .set('Authorization', `Bearer ${companyA.token}`);
  assert.equal(approveRes.status, 403);

  const publishRes = await request(app)
    .post(`/api/workshops/${wsId}/publish`)
    .set('Authorization', `Bearer ${companyA.token}`);
  assert.equal(publishRes.status, 403);
});

test('5. Company can cancel their own published workshop, but not other companies', async () => {
  const companyA = await createAuthSession(ROLE_IDS.COMPANY, 'COMPANY', { companyName: 'Company Alpha' });
  const companyB = await createAuthSession(ROLE_IDS.COMPANY, 'COMPANY', { companyName: 'Company Beta' });
  const admin = await createAuthSession(ROLE_IDS.SUPER_ADMIN, 'PLACEMENT');

  // Create workshop by Company A
  const createRes = await request(app)
    .post('/api/workshops')
    .set('Authorization', `Bearer ${companyA.token}`)
    .send(buildValidWorkshopPayload({
      title: 'Company Alpha To Be Published'
    }));
  assert.equal(createRes.status, 201);
  const wsId = createRes.body.data._id;

  // Submit, approve, publish as admin
  await request(app).post(`/api/workshops/${wsId}/submit`).set('Authorization', `Bearer ${companyA.token}`);
  await request(app).post(`/api/workshops/${wsId}/approve`).set('Authorization', `Bearer ${admin.token}`);
  await request(app).post(`/api/workshops/${wsId}/publish`).set('Authorization', `Bearer ${admin.token}`);

  // Company B tries to cancel Company A workshop -> 403 Forbidden
  const cancelByB = await request(app)
    .post(`/api/workshops/${wsId}/cancel`)
    .set('Authorization', `Bearer ${companyB.token}`)
    .send({ reason: 'Malicious cancellation by competitor' });
  assert.equal(cancelByB.status, 403);

  // Company A cancels own workshop -> 200 OK
  const cancelByA = await request(app)
    .post(`/api/workshops/${wsId}/cancel`)
    .set('Authorization', `Bearer ${companyA.token}`)
    .send({ reason: 'Inclement weather rescheduling needed' });
  assert.equal(cancelByA.status, 200);
  assert.equal(cancelByA.body.data.lifecycleStatus, 'CANCELLED');
});

test('6. Company attendance isolation: Cannot view or submit attendance for other companies', async () => {
  const companyA = await createAuthSession(ROLE_IDS.COMPANY, 'COMPANY', { companyName: 'Company Alpha' });
  const companyB = await createAuthSession(ROLE_IDS.COMPANY, 'COMPANY', { companyName: 'Company Beta' });
  const admin = await createAuthSession(ROLE_IDS.SUPER_ADMIN, 'PLACEMENT');

  // Company B creates workshop with an assigned company trainer
  const createRes = await request(app)
    .post('/api/workshops')
    .set('Authorization', `Bearer ${companyB.token}`)
    .send(buildValidWorkshopPayload({
      title: 'Company Beta Attendance Workshop',
      trainers: [
        {
          trainerType: 'COMPANY',
          companyId: String(companyB.companyId),
          name: 'Beta Instructor',
          designation: 'Tech Specialist'
        }
      ]
    }));
  assert.equal(createRes.status, 201);
  const wsId = createRes.body.data._id;

  // Publish via admin
  await request(app).post(`/api/workshops/${wsId}/submit`).set('Authorization', `Bearer ${companyB.token}`);
  await request(app).post(`/api/workshops/${wsId}/approve`).set('Authorization', `Bearer ${admin.token}`);
  await request(app).post(`/api/workshops/${wsId}/publish`).set('Authorization', `Bearer ${admin.token}`);

  // 1. Company A trying to GET session attendance -> 403 Forbidden
  const getRes = await request(app)
    .get(`/api/workshops/${wsId}/sessions/SES-01/attendance`)
    .set('Authorization', `Bearer ${companyA.token}`);
  assert.equal(getRes.status, 403);
  assert.equal(getRes.body.error?.code, 'FORBIDDEN');

  // 2. Company A trying to POST session attendance -> 403 Forbidden
  const postRes = await request(app)
    .post(`/api/workshops/${wsId}/sessions/SES-01/attendance`)
    .set('Authorization', `Bearer ${companyA.token}`)
    .send({
      attendees: [
        {
          registrationId: new mongoose.Types.ObjectId().toString(),
          studentId: new mongoose.Types.ObjectId().toString(),
          attendanceStatus: 'PRESENT'
        }
      ]
    });
  assert.equal(postRes.status, 403);
  assert.equal(postRes.body.error?.code, 'FORBIDDEN');

  // 3. Company B viewing attendance -> 200 OK
  const getByB = await request(app)
    .get(`/api/workshops/${wsId}/sessions/SES-01/attendance`)
    .set('Authorization', `Bearer ${companyB.token}`);
  assert.equal(getByB.status, 200);
  assert.equal(getByB.body.success, true);
});

test('7. Company cannot delete another company draft workshop, but CAN delete own draft workshop', async () => {
  const companyA = await createAuthSession(ROLE_IDS.COMPANY, 'COMPANY', { companyName: 'Company Alpha' });
  const companyB = await createAuthSession(ROLE_IDS.COMPANY, 'COMPANY', { companyName: 'Company Beta' });

  // Company B creates draft workshop
  const createRes = await request(app)
    .post('/api/workshops')
    .set('Authorization', `Bearer ${companyB.token}`)
    .send(buildValidWorkshopPayload({
      title: 'Company Beta Delete Draft Test'
    }));
  assert.equal(createRes.status, 201);
  const wsId = createRes.body.data._id;

  // Company A tries to delete Company B workshop -> 403 Forbidden
  const delByA = await request(app)
    .delete(`/api/workshops/${wsId}`)
    .set('Authorization', `Bearer ${companyA.token}`);
  assert.equal(delByA.status, 403);

  // Company B deletes own workshop -> 200 OK
  const delByB = await request(app)
    .delete(`/api/workshops/${wsId}`)
    .set('Authorization', `Bearer ${companyB.token}`);
  assert.equal(delByB.status, 200);
  assert.equal(delByB.body.success, true);
});

test('8. Company can list active departments and courses to target workshop audience', async () => {
  const company = await createAuthSession(ROLE_IDS.COMPANY, 'COMPANY', { companyName: 'Company Audience Target' });

  // 1. Fetch departments
  const deptRes = await request(app)
    .get('/api/departments?limit=100')
    .set('Authorization', `Bearer ${company.token}`);
  assert.equal(deptRes.status, 200);
  assert.equal(deptRes.body.success, true);
  assert.ok(Array.isArray(deptRes.body.data?.items));
  assert.ok(deptRes.body.data.items.length > 0);

  // 2. Fetch courses
  const courseRes = await request(app)
    .get('/api/courses?limit=100')
    .set('Authorization', `Bearer ${company.token}`);
  assert.equal(courseRes.status, 200);
  assert.equal(courseRes.body.success, true);
  assert.ok(Array.isArray(courseRes.body.data?.items));
  assert.ok(courseRes.body.data.items.length > 0);
});
