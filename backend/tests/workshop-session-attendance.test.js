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
import { ROLE_IDS } from '../src/utils/access-constants.js';
import { hashPassword } from '../src/utils/password.js';
import { createRawSessionToken, hashSessionToken } from '../src/utils/session-token.js';

let replSet;
let app;
let departmentDoc;
let headUser;
let headToken;
let studentUser1;
let studentProfile1;
let studentUser2;
let studentProfile2;

async function createAuthenticatedSession(userId) {
  const rawToken = createRawSessionToken();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await UserSession.create({
    userId,
    sessionTokenHash: hashSessionToken(rawToken),
    loginAt: new Date(),
    lastActivityAt: new Date(),
    expiresAt,
    isActive: true
  });
  return rawToken;
}

before(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await connectDatabase(replSet.getUri());
  await seedInitialData();
  app = createApp();

  departmentDoc = await Department.create({
    name: 'Computer Science',
    code: 'CSE',
    isActive: true
  });

  const headPwdHash = await hashPassword('Head@123');
  headUser = await User.create({
    email: 'head.placement@example.edu',
    employeeId: 'HEAD-001',
    passwordHash: headPwdHash,
    roleId: ROLE_IDS.SUPER_ADMIN,
    userType: 'PLACEMENT',
    accountStatus: 'ACTIVE'
  });

  await PlacementOfficer.create({
    userId: headUser._id,
    employeeId: 'HEAD-001',
    firstName: 'Kriti',
    lastName: 'Head',
    email: 'head.placement@example.edu',
    designation: 'Placement Head',
    role: ROLE_IDS.PLACEMENT_HEAD
  });

  headToken = await createAuthenticatedSession(headUser._id);

  // Student 1
  const sPwd1 = await hashPassword('Student1@123');
  studentUser1 = await User.create({
    email: 'student1@example.edu',
    universityId: 'U2026001',
    passwordHash: sPwd1,
    roleId: ROLE_IDS.STUDENT,
    userType: 'STUDENT',
    accountStatus: 'ACTIVE'
  });
  studentProfile1 = await Student.create({
    userId: studentUser1._id,
    universityId: 'U2026001',
    firstName: 'Student',
    lastName: 'One',
    email: 'student1@example.edu',
    mobileNumber: '9876543211',
    branch: 'CSE',
    department: departmentDoc.name,
    departmentId: departmentDoc._id,
    semester: 6,
    cgpa: 8.5
  });

  // Student 2
  const sPwd2 = await hashPassword('Student2@123');
  studentUser2 = await User.create({
    email: 'student2@example.edu',
    universityId: 'U2026002',
    passwordHash: sPwd2,
    roleId: ROLE_IDS.STUDENT,
    userType: 'STUDENT',
    accountStatus: 'ACTIVE'
  });
  studentProfile2 = await Student.create({
    userId: studentUser2._id,
    universityId: 'U2026002',
    firstName: 'Student',
    lastName: 'Two',
    email: 'student2@example.edu',
    mobileNumber: '9876543212',
    branch: 'CSE',
    department: departmentDoc.name,
    departmentId: departmentDoc._id,
    semester: 6,
    cgpa: 8.2
  });
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
});

test('Session-wise attendance: session 1 attendance marks students as ATTENDED, and session 2 still shows all active registered students', async () => {
  const startAt = new Date(Date.now() + 86400000);
  const endAt = new Date(Date.now() + 3 * 86400000);

  // 1. Create a 2-session workshop
  const workshop = await Workshop.create({
    workshopId: 'WS-2026-0099',
    title: 'Multi-Session Cloud Architecture',
    description: 'Learn cloud computing across two separate sessions.',
    category: 'TECHNICAL',
    mode: 'ONLINE',
    ownershipType: 'CENTRAL_PLACEMENT_CELL',
    createdBy: headUser._id,
    approvalStatus: 'APPROVED',
    isPublished: true,
    lifecycleStatus: 'SCHEDULED',
    targetAudience: { isAllDepartments: true, departmentRules: [] },
    startAt,
    endAt,
    registrationDeadline: new Date(Date.now() + 43200000),
    maxParticipants: 50,
    sessions: [
      {
        sessionId: 'SES-01',
        sessionNumber: 1,
        title: 'Basic Cloud Concepts',
        startAt,
        endAt: new Date(startAt.getTime() + 7200000),
        isAttendanceRequired: true
      },
      {
        sessionId: 'SES-02',
        sessionNumber: 2,
        title: 'Advanced Cloud Deployments',
        startAt: new Date(startAt.getTime() + 86400000),
        endAt: new Date(startAt.getTime() + 86400000 + 7200000),
        isAttendanceRequired: true
      }
    ]
  });

  // 2. Register both students
  const reg1 = await WorkshopRegistration.create({
    registrationId: 'REG-001',
    workshopId: workshop._id,
    studentId: studentProfile1._id,
    status: 'REGISTERED',
    activeRegistrationKey: 'ACTIVE',
    registeredAt: new Date(),
    registrationSource: 'STUDENT',
    registeredBy: studentUser1._id
  });

  const reg2 = await WorkshopRegistration.create({
    registrationId: 'REG-002',
    workshopId: workshop._id,
    studentId: studentProfile2._id,
    status: 'REGISTERED',
    activeRegistrationKey: 'ACTIVE',
    registeredAt: new Date(),
    registrationSource: 'STUDENT',
    registeredBy: studentUser2._id
  });

  // 3. Check active roster before any attendance is recorded
  const rosterBefore = await request(app)
    .get(`/api/workshops/${workshop._id}/roster?activeOnly=true`)
    .set('Authorization', `Bearer ${headToken}`);

  assert.equal(rosterBefore.status, 200);
  assert.equal(rosterBefore.body.data.roster.length, 2);

  // 4. Mark attendance for SES-01 (Student 1 Present, Student 2 Absent)
  const attRes1 = await request(app)
    .post(`/api/workshops/${workshop._id}/sessions/SES-01/attendance`)
    .set('Authorization', `Bearer ${headToken}`)
    .send({
      attendees: [
        { registrationId: reg1._id, studentId: studentProfile1._id, attendanceStatus: 'PRESENT' },
        { registrationId: reg2._id, studentId: studentProfile2._id, attendanceStatus: 'ABSENT' }
      ]
    });

  assert.equal(attRes1.status, 200);

  // Check that both students transitioned from 'REGISTERED' to 'ATTENDED'
  const updatedReg1 = await WorkshopRegistration.findById(reg1._id).lean();
  const updatedReg2 = await WorkshopRegistration.findById(reg2._id).lean();
  assert.equal(updatedReg1.status, 'ATTENDED');
  assert.equal(updatedReg1.attendancePercentage, 50); // 1 of 2 sessions
  assert.equal(updatedReg2.status, 'ATTENDED');
  assert.equal(updatedReg2.attendancePercentage, 0); // 0 of 2 sessions

  // 5. Query active roster for Session 2 with activeOnly=true
  // MUST return both students even though status is now 'ATTENDED'!
  const rosterForSession2 = await request(app)
    .get(`/api/workshops/${workshop._id}/roster?activeOnly=true`)
    .set('Authorization', `Bearer ${headToken}`);

  assert.equal(rosterForSession2.status, 200);
  assert.equal(rosterForSession2.body.data.roster.length, 2, 'Session 2 must see both registered students!');

  // Check existing attendance for SES-02 (should be 0)
  const attSession2Before = await request(app)
    .get(`/api/workshops/${workshop._id}/sessions/SES-02/attendance`)
    .set('Authorization', `Bearer ${headToken}`);

  assert.equal(attSession2Before.status, 200);
  assert.equal(attSession2Before.body.data.attendance.length, 0, 'SES-02 should have 0 attendance before taking it');

  // 6. Now take attendance for SES-02 (Both students Present)
  const attRes2 = await request(app)
    .post(`/api/workshops/${workshop._id}/sessions/SES-02/attendance`)
    .set('Authorization', `Bearer ${headToken}`)
    .send({
      attendees: [
        { registrationId: reg1._id, studentId: studentProfile1._id, attendanceStatus: 'PRESENT' },
        { registrationId: reg2._id, studentId: studentProfile2._id, attendanceStatus: 'PRESENT' }
      ]
    });

  assert.equal(attRes2.status, 200);

  // 7. Verify session-wise isolation
  // SES-01 attendance: Student 1 Present, Student 2 Absent
  const ses1Att = await request(app)
    .get(`/api/workshops/${workshop._id}/sessions/SES-01/attendance`)
    .set('Authorization', `Bearer ${headToken}`);
  assert.equal(ses1Att.body.data.attendance.length, 2);
  const s1_ses1 = ses1Att.body.data.attendance.find((a) => String(a.studentId._id) === String(studentProfile1._id));
  const s2_ses1 = ses1Att.body.data.attendance.find((a) => String(a.studentId._id) === String(studentProfile2._id));
  assert.equal(s1_ses1.attendanceStatus, 'PRESENT');
  assert.equal(s2_ses1.attendanceStatus, 'ABSENT');

  // SES-02 attendance: Both Present
  const ses2Att = await request(app)
    .get(`/api/workshops/${workshop._id}/sessions/SES-02/attendance`)
    .set('Authorization', `Bearer ${headToken}`);
  assert.equal(ses2Att.body.data.attendance.length, 2);
  const s1_ses2 = ses2Att.body.data.attendance.find((a) => String(a.studentId._id) === String(studentProfile1._id));
  const s2_ses2 = ses2Att.body.data.attendance.find((a) => String(a.studentId._id) === String(studentProfile2._id));
  assert.equal(s1_ses2.attendanceStatus, 'PRESENT');
  assert.equal(s2_ses2.attendanceStatus, 'PRESENT');

  // Overall student attendance updated
  const finalReg1 = await WorkshopRegistration.findById(reg1._id).lean();
  const finalReg2 = await WorkshopRegistration.findById(reg2._id).lean();
  assert.equal(finalReg1.attendancePercentage, 100); // 2/2 = 100%
  assert.equal(finalReg1.completionStatus, 'COMPLETED');
  assert.equal(finalReg2.attendancePercentage, 50); // 1/2 = 50%
  assert.equal(finalReg2.completionStatus, 'PENDING');
});
