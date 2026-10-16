import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import {
  submitSessionAttendance,
  getSessionAttendance,
  calculateRegistrationAttendance
} from '../src/services/workshop-attendance.service.js';
import { Workshop } from '../src/models/workshop.model.js';
import { WorkshopRegistration } from '../src/models/workshop_registration.model.js';
import { WorkshopAttendance } from '../src/models/workshop_attendance.model.js';
import { WorkshopCertificate } from '../src/models/workshop_certificate.model.js';
import { WorkshopAuditLog } from '../src/models/workshop_audit_log.model.js';
import { Student } from '../src/models/student.model.js';
import { User } from '../src/models/user.model.js';
import { Department } from '../src/models/department.model.js';
import { ROLE_IDS } from '../src/utils/access-constants.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';

let replSet;
let departmentDoc;

before(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await connectDatabase(replSet.getUri());
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
  await User.deleteMany({});
  await Department.deleteMany({});

  departmentDoc = await Department.create({
    name: 'Information Technology',
    code: 'IT',
    isActive: true
  });
});

/**
 * Helper to seed student and registration.
 */
async function seedStudentAndRegistration(workshopId, universityId) {
  const userId = new mongoose.Types.ObjectId();
  await User.create({
    _id: userId,
    universityId,
    email: `${universityId.toLowerCase()}@vvwu.edu.in`,
    passwordHash: 'dummy_hash',
    userType: 'STUDENT',
    roleId: ROLE_IDS.STUDENT
  });

  const studentDoc = await Student.create({
    universityId,
    firstName: `Student_${universityId}`,
    lastName: 'Shah',
    email: `${universityId.toLowerCase()}@vvwu.edu.in`,
    mobileNumber: '9876543211',
    branch: 'Information Technology',
    department: 'Information Technology',
    departmentId: departmentDoc._id,
    semester: 6,
    cgpa: 8.8,
    userId
  });

  const registrationDoc = await WorkshopRegistration.create({
    registrationId: `WREG-2026-${universityId.slice(-4)}`,
    workshopId,
    studentId: studentDoc._id,
    status: 'REGISTERED',
    registrationSource: 'STUDENT',
    registeredBy: userId,
    activeRegistrationKey: 'ACTIVE'
  });

  return { studentDoc, registrationDoc };
}

test('1. calculateRegistrationAttendance - 75% boundary, EXCUSED excluded, missing treated as absent', () => {
  const sessions = [
    { sessionId: 'S1', isAttendanceRequired: true },
    { sessionId: 'S2', isAttendanceRequired: true },
    { sessionId: 'S3', isAttendanceRequired: true },
    { sessionId: 'S4', isAttendanceRequired: true }
  ];

  // Case A: 3 PRESENT out of 4 (75.0%) -> COMPLETED
  const recordsA = [
    { sessionId: 'S1', attendanceStatus: 'PRESENT' },
    { sessionId: 'S2', attendanceStatus: 'PRESENT' },
    { sessionId: 'S3', attendanceStatus: 'PRESENT' },
    { sessionId: 'S4', attendanceStatus: 'ABSENT' }
  ];
  const resultA = calculateRegistrationAttendance(sessions, recordsA, true);
  assert.equal(resultA.attendancePercentage, 75.0);
  assert.equal(resultA.completionStatus, 'COMPLETED');

  // Case B: 2 PRESENT, 1 EXCUSED, 1 missing out of 4 (50.0%) -> NOT_COMPLETED
  const recordsB = [
    { sessionId: 'S1', attendanceStatus: 'PRESENT' },
    { sessionId: 'S2', attendanceStatus: 'PRESENT' },
    { sessionId: 'S3', attendanceStatus: 'EXCUSED' }
    // S4 is missing -> counted as absent
  ];
  const resultB = calculateRegistrationAttendance(sessions, recordsB, true);
  assert.equal(resultB.attendancePercentage, 50.0);
  assert.equal(resultB.completionStatus, 'NOT_COMPLETED');

  // Case C: When no sessions are explicitly marked required, all sessions are required
  const sessionsNoneMarked = [
    { sessionId: 'S1', isAttendanceRequired: false },
    { sessionId: 'S2', isAttendanceRequired: false }
  ];
  const recordsC = [{ sessionId: 'S1', attendanceStatus: 'PRESENT' }];
  const resultC = calculateRegistrationAttendance(sessionsNoneMarked, recordsC, true);
  // Both are required -> 1/2 = 50%
  assert.equal(resultC.requiredSessions, 2);
  assert.equal(resultC.attendancePercentage, 50.0);
  assert.equal(resultC.completionStatus, 'NOT_COMPLETED');
});

test('2. submitSessionAttendance - Authorized internal assigned trainer records attendance', async () => {
  const trainerUserId = new mongoose.Types.ObjectId();
  const trainerSubId = new mongoose.Types.ObjectId();

  const workshop = await Workshop.create({
    workshopId: 'WS-2026-0301',
    title: 'Attendance Test Workshop',
    description: 'Testing trainer authorization.',
    category: 'TECHNICAL',
    mode: 'ONLINE',
    meetingLink: 'https://meet.google.com/test-att',
    ownershipType: 'CENTRAL_PLACEMENT_CELL',
    approvalStatus: 'APPROVED',
    isPublished: true,
    lifecycleStatus: 'ACTIVE',
    createdBy: new mongoose.Types.ObjectId(),
    startAt: new Date(Date.now() - 3600000),
    endAt: new Date(Date.now() + 3600000),
    registrationDeadline: new Date(Date.now() - 7200000),
    maxParticipants: 30,
    trainers: [
      {
        _id: trainerSubId,
        trainerType: 'PLACEMENT_COORDINATOR',
        userId: trainerUserId,
        name: 'Prof. Trainer'
      }
    ],
    sessions: [
      {
        sessionId: 'SES-01',
        sessionNumber: 1,
        title: 'Session 1',
        startAt: new Date(Date.now() - 3600000),
        endAt: new Date(Date.now() + 3600000),
        trainerIds: [String(trainerSubId)],
        isAttendanceRequired: true
      }
    ]
  });

  const { studentDoc, registrationDoc } = await seedStudentAndRegistration(workshop._id, 'U26IT001');

  const trainerAuth = {
    userId: trainerUserId,
    roleId: ROLE_IDS.PLACEMENT_COORDINATOR,
    userType: 'PLACEMENT'
  };

  const result = await submitSessionAttendance(
    {
      workshopId: workshop._id,
      sessionId: 'SES-01',
      attendees: [
        {
          registrationId: registrationDoc._id,
          studentId: studentDoc._id,
          attendanceStatus: 'PRESENT',
          remarks: 'Good participation'
        }
      ]
    },
    trainerAuth
  );

  assert.equal(result.recordedCount, 1);
  assert.equal(result.updatedCount, 0);

  // Verify attendance record in DB
  const attendanceRecord = await WorkshopAttendance.findOne({
    workshopId: workshop._id,
    sessionId: 'SES-01'
  });
  assert.ok(attendanceRecord);
  assert.equal(attendanceRecord.attendanceStatus, 'PRESENT');

  // Verify registration completionStatus and attendancePercentage updated
  const updatedReg = await WorkshopRegistration.findById(registrationDoc._id);
  assert.equal(updatedReg.attendancePercentage, 100);
  assert.equal(updatedReg.completionStatus, 'COMPLETED');

  // Verify transactional audit log
  const audit = await WorkshopAuditLog.findOne({
    action: 'ATTENDANCE_RECORDED',
    workshopId: workshop._id
  });
  assert.ok(audit);
  assert.equal(String(audit.changedBy), String(trainerUserId));
});

test('3. submitSessionAttendance - Unassigned trainer & Coordinator bypass rejected with 403', async () => {
  const assignedTrainerUserId = new mongoose.Types.ObjectId();
  const assignedTrainerSubId = new mongoose.Types.ObjectId();

  const otherCoordinatorUserId = new mongoose.Types.ObjectId();

  const workshop = await Workshop.create({
    workshopId: 'WS-2026-0302',
    title: 'Trainer Strictness Workshop',
    description: 'Testing zero coordinator bypass.',
    category: 'TECHNICAL',
    mode: 'ONLINE',
    meetingLink: 'https://meet.google.com/test-att2',
    ownershipType: 'CENTRAL_PLACEMENT_CELL',
    approvalStatus: 'APPROVED',
    isPublished: true,
    lifecycleStatus: 'ACTIVE',
    createdBy: new mongoose.Types.ObjectId(),
    startAt: new Date(Date.now() - 3600000),
    endAt: new Date(Date.now() + 3600000),
    registrationDeadline: new Date(Date.now() - 7200000),
    maxParticipants: 30,
    trainers: [
      {
        _id: assignedTrainerSubId,
        trainerType: 'PLACEMENT_COORDINATOR',
        userId: assignedTrainerUserId,
        name: 'Assigned Trainer'
      }
    ],
    sessions: [
      {
        sessionId: 'SES-01',
        sessionNumber: 1,
        title: 'Session 1',
        startAt: new Date(Date.now() - 3600000),
        endAt: new Date(Date.now() + 3600000),
        trainerIds: [String(assignedTrainerSubId)]
      }
    ]
  });

  const { studentDoc, registrationDoc } = await seedStudentAndRegistration(workshop._id, 'U26IT002');

  // Other coordinator attempting to mark attendance without being the assigned trainer
  const unassignedCoordAuth = {
    userId: otherCoordinatorUserId,
    roleId: ROLE_IDS.PLACEMENT_COORDINATOR,
    userType: 'PLACEMENT'
  };

  await assert.rejects(
    async () =>
      submitSessionAttendance(
        {
          workshopId: workshop._id,
          sessionId: 'SES-01',
          attendees: [
            {
              registrationId: registrationDoc._id,
              studentId: studentDoc._id,
              attendanceStatus: 'PRESENT'
            }
          ]
        },
        unassignedCoordAuth
      ),
    (err) => {
      assert.equal(err.statusCode, 403);
      assert.equal(err.code, 'NOT_ASSIGNED_SESSION_TRAINER');
      return true;
    }
  );
});

test('4. submitSessionAttendance - Attendance correction requires mandatory reason (>= 5 chars)', async () => {
  const trainerUserId = new mongoose.Types.ObjectId();
  const trainerSubId = new mongoose.Types.ObjectId();

  const workshop = await Workshop.create({
    workshopId: 'WS-2026-0303',
    title: 'Correction Reason Workshop',
    description: 'Testing mandatory correction reason.',
    category: 'TECHNICAL',
    mode: 'ONLINE',
    meetingLink: 'https://meet.google.com/test-att3',
    ownershipType: 'CENTRAL_PLACEMENT_CELL',
    approvalStatus: 'APPROVED',
    isPublished: true,
    lifecycleStatus: 'ACTIVE',
    createdBy: new mongoose.Types.ObjectId(),
    startAt: new Date(Date.now() - 3600000),
    endAt: new Date(Date.now() + 3600000),
    registrationDeadline: new Date(Date.now() - 7200000),
    maxParticipants: 30,
    trainers: [
      {
        _id: trainerSubId,
        trainerType: 'PLACEMENT_COORDINATOR',
        userId: trainerUserId,
        name: 'Assigned Trainer'
      }
    ],
    sessions: [
      {
        sessionId: 'SES-01',
        sessionNumber: 1,
        title: 'Session 1',
        startAt: new Date(Date.now() - 3600000),
        endAt: new Date(Date.now() + 3600000),
        trainerIds: [String(trainerSubId)]
      }
    ]
  });

  const { studentDoc, registrationDoc } = await seedStudentAndRegistration(workshop._id, 'U26IT003');

  const trainerAuth = {
    userId: trainerUserId,
    roleId: ROLE_IDS.PLACEMENT_COORDINATOR,
    userType: 'PLACEMENT'
  };

  // 1. Initial submission (ABSENT)
  await submitSessionAttendance(
    {
      workshopId: workshop._id,
      sessionId: 'SES-01',
      attendees: [
        {
          registrationId: registrationDoc._id,
          studentId: studentDoc._id,
          attendanceStatus: 'ABSENT'
        }
      ]
    },
    trainerAuth
  );

  // 2. Correction attempt without reason fails
  await assert.rejects(
    async () =>
      submitSessionAttendance(
        {
          workshopId: workshop._id,
          sessionId: 'SES-01',
          attendees: [
            {
              registrationId: registrationDoc._id,
              studentId: studentDoc._id,
              attendanceStatus: 'PRESENT'
            }
          ]
        },
        trainerAuth
      ),
    (err) => {
      assert.equal(err.statusCode, 400);
      assert.equal(err.code, 'CORRECTION_REASON_REQUIRED');
      return true;
    }
  );

  // 3. Correction with valid reason succeeds
  const correctionResult = await submitSessionAttendance(
    {
      workshopId: workshop._id,
      sessionId: 'SES-01',
      correctionReason: 'Student arrived late due to network disruption and presented verification.',
      attendees: [
        {
          registrationId: registrationDoc._id,
          studentId: studentDoc._id,
          attendanceStatus: 'PRESENT'
        }
      ]
    },
    trainerAuth
  );

  assert.equal(correctionResult.updatedCount, 1);

  // Verify ATTENDANCE_CORRECTED audit log
  const audit = await WorkshopAuditLog.findOne({
    action: 'ATTENDANCE_CORRECTED',
    workshopId: workshop._id
  });
  assert.ok(audit);
  assert.equal(audit.reason, 'Student arrived late due to network disruption and presented verification.');
  assert.equal(audit.oldValue.attendanceStatus, 'ABSENT');
  assert.equal(audit.newValue.attendanceStatus, 'PRESENT');
});

test('5. getSessionAttendance - Returns paginated attendance records', async () => {
  const trainerUserId = new mongoose.Types.ObjectId();
  const trainerSubId = new mongoose.Types.ObjectId();

  const workshop = await Workshop.create({
    workshopId: 'WS-2026-0304',
    title: 'Query Attendance Workshop',
    description: 'Testing read attendance.',
    category: 'TECHNICAL',
    mode: 'ONLINE',
    meetingLink: 'https://meet.google.com/test-att4',
    ownershipType: 'CENTRAL_PLACEMENT_CELL',
    approvalStatus: 'APPROVED',
    isPublished: true,
    lifecycleStatus: 'ACTIVE',
    createdBy: new mongoose.Types.ObjectId(),
    startAt: new Date(Date.now() - 3600000),
    endAt: new Date(Date.now() + 3600000),
    registrationDeadline: new Date(Date.now() - 7200000),
    maxParticipants: 30,
    trainers: [
      {
        _id: trainerSubId,
        trainerType: 'PLACEMENT_COORDINATOR',
        userId: trainerUserId,
        name: 'Assigned Trainer'
      }
    ],
    sessions: [
      {
        sessionId: 'SES-01',
        sessionNumber: 1,
        title: 'Session 1',
        startAt: new Date(Date.now() - 3600000),
        endAt: new Date(Date.now() + 3600000),
        trainerIds: [String(trainerSubId)]
      }
    ]
  });

  const { studentDoc, registrationDoc } = await seedStudentAndRegistration(workshop._id, 'U26IT004');

  const trainerAuth = {
    userId: trainerUserId,
    roleId: ROLE_IDS.PLACEMENT_COORDINATOR,
    userType: 'PLACEMENT'
  };

  await submitSessionAttendance(
    {
      workshopId: workshop._id,
      sessionId: 'SES-01',
      attendees: [
        {
          registrationId: registrationDoc._id,
          studentId: studentDoc._id,
          attendanceStatus: 'PRESENT'
        }
      ]
    },
    trainerAuth
  );

  const queryResult = await getSessionAttendance(
    { workshopId: workshop._id, sessionId: 'SES-01', page: 1, limit: 10 },
    trainerAuth
  );

  assert.equal(queryResult.total, 1);
  assert.equal(queryResult.attendance.length, 1);
  assert.equal(queryResult.attendance[0].attendanceStatus, 'PRESENT');
});
