import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import {
  registerStudent,
  cancelStudentRegistration,
  getWorkshopRoster
} from '../src/services/workshop-registration.service.js';
import { Workshop } from '../src/models/workshop.model.js';
import { WorkshopRegistration } from '../src/models/workshop_registration.model.js';
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
  await WorkshopAuditLog.deleteMany({});
  await Student.deleteMany({});
  await User.deleteMany({});
  await Department.deleteMany({});

  departmentDoc = await Department.create({
    name: 'Computer Engineering',
    code: 'CE',
    isActive: true
  });
});

/**
 * Helper to seed a valid Student User and Student profile.
 */
async function seedStudent({ universityId, email = `${universityId.toLowerCase()}@vvwu.edu.in`, semester = 6, deptId = departmentDoc._id } = {}) {
  const userId = new mongoose.Types.ObjectId();

  await User.create({
    _id: userId,
    universityId,
    email,
    passwordHash: 'dummy_hash_for_testing',
    userType: 'STUDENT',
    roleId: ROLE_IDS.STUDENT,
    accountStatus: 'ACTIVE'
  });

  const studentDoc = await Student.create({
    universityId,
    firstName: `Student_${universityId}`,
    lastName: 'Patel',
    email,
    mobileNumber: '9876543210',
    branch: 'Computer Engineering',
    department: 'Computer Engineering',
    departmentId: deptId,
    semester,
    cgpa: 8.5,
    userId
  });

  const auth = {
    userId,
    roleId: ROLE_IDS.STUDENT,
    userType: 'STUDENT'
  };

  return { userId, studentDoc, auth };
}

/**
 * Helper to seed an active, published workshop.
 */
async function seedPublishedWorkshop({ maxParticipants = 5, startAt = new Date(Date.now() + 86400000), targetAudience = { isAllDepartments: true, departmentRules: [] } } = {}) {
  const adminId = new mongoose.Types.ObjectId();
  const endAt = new Date(startAt.getTime() + 7200000);
  const deadline = new Date(startAt.getTime() - 3600000);
  const uniqueNum = Math.floor(1000 + Math.random() * 9000);

  const workshop = await Workshop.create({
    workshopId: `WS-2026-${uniqueNum}`,
    title: 'Concurrent Concurrency Workshop',
    description: 'Testing high-concurrency capacity serialization without oversubscription.',
    category: 'TECHNICAL',
    mode: 'ONLINE',
    meetingLink: 'https://meet.google.com/test-concurrency',
    ownershipType: 'CENTRAL_PLACEMENT_CELL',
    approvalStatus: 'APPROVED',
    isPublished: true,
    lifecycleStatus: 'SCHEDULED',
    createdBy: adminId,
    startAt,
    endAt,
    registrationDeadline: deadline,
    maxParticipants,
    targetAudience,
    sessions: [
      {
        sessionId: 'SES-01',
        sessionNumber: 1,
        title: 'Concurrency Core',
        startAt,
        endAt,
        isAttendanceRequired: true
      }
    ]
  });

  return workshop;
}

test('1. registerStudent - Valid registration with WREG-YYYY-XXXX and transactional audit log', async () => {
  const workshop = await seedPublishedWorkshop({ maxParticipants: 10 });
  const { auth, studentDoc } = await seedStudent({ universityId: 'U26CE001' });

  const registration = await registerStudent(workshop._id, auth);

  assert.ok(registration._id);
  assert.equal(registration.status, 'REGISTERED');
  assert.equal(registration.activeRegistrationKey, 'ACTIVE');
  assert.equal(String(registration.studentId), String(studentDoc._id));
  assert.ok(registration.registrationId.startsWith('WREG-2026-'));

  // Transactional audit log must exist
  const audit = await WorkshopAuditLog.findOne({ entityId: registration.registrationId });
  assert.ok(audit);
  assert.equal(audit.action, 'STUDENT_REGISTERED');
  assert.equal(String(audit.changedBy), String(auth.userId));
});

test('2. registerStudent - Non-student identity and missing profile rejection', async () => {
  const workshop = await seedPublishedWorkshop({ maxParticipants: 10 });

  // 1. Staff / Placement user attempting to register
  const adminAuth = {
    userId: new mongoose.Types.ObjectId(),
    roleId: ROLE_IDS.SUPER_ADMIN,
    userType: 'PLACEMENT'
  };

  await assert.rejects(
    async () => registerStudent(workshop._id, adminAuth),
    (err) => {
      assert.equal(err.statusCode, 403);
      assert.equal(err.code, 'FORBIDDEN');
      return true;
    }
  );

  // 2. Student user with no linked Student domain profile
  const orphanUserAuth = {
    userId: new mongoose.Types.ObjectId(),
    roleId: ROLE_IDS.STUDENT,
    userType: 'STUDENT'
  };

  await assert.rejects(
    async () => registerStudent(workshop._id, orphanUserAuth),
    (err) => {
      assert.equal(err.statusCode, 404);
      assert.equal(err.code, 'STUDENT_PROFILE_NOT_FOUND');
      return true;
    }
  );
});

test('3. registerStudent - Duplicate active registration is safely rejected with 409', async () => {
  const workshop = await seedPublishedWorkshop({ maxParticipants: 10 });
  const { auth } = await seedStudent({ universityId: 'U26CE002' });

  // First registration succeeds
  await registerStudent(workshop._id, auth);

  // Second registration by same student must be rejected
  await assert.rejects(
    async () => registerStudent(workshop._id, auth),
    (err) => {
      assert.equal(err.statusCode, 409);
      assert.equal(err.code, 'ALREADY_REGISTERED');
      return true;
    }
  );
});

test('4. registerStudent - Registration window, lifecycle, and cohort targeting checks', async () => {
  const otherDept = await Department.create({ name: 'Mechanical', code: 'ME', isActive: true });

  // 1. Ineligible cohort (Targeted only to Mechanical department)
  const targetedWorkshop = await seedPublishedWorkshop({
    maxParticipants: 10,
    targetAudience: {
      isAllDepartments: false,
      departmentRules: [
        {
          departmentId: otherDept._id,
          targetingMode: 'ALL_COURSES_ALL_SEMESTERS'
        }
      ]
    }
  });

  const { auth: ceStudentAuth } = await seedStudent({ universityId: 'U26CE003', deptId: departmentDoc._id });

  await assert.rejects(
    async () => registerStudent(targetedWorkshop._id, ceStudentAuth),
    (err) => {
      assert.equal(err.statusCode, 403);
      assert.equal(err.code, 'INELIGIBLE_COHORT');
      return true;
    }
  );

  // 2. Registration deadline passed
  const pastDeadlineWs = await seedPublishedWorkshop({
    maxParticipants: 10,
    startAt: new Date(Date.now() + 86400000)
  });
  // Mutate deadline to past
  pastDeadlineWs.registrationDeadline = new Date(Date.now() - 60000);
  await pastDeadlineWs.save();

  await assert.rejects(
    async () => registerStudent(pastDeadlineWs._id, ceStudentAuth),
    (err) => {
      assert.equal(err.statusCode, 400);
      assert.equal(err.code, 'REGISTRATION_CLOSED');
      return true;
    }
  );
});

test('5. cancelStudentRegistration - Cancellation before and rejection after workshop.startAt', async () => {
  const futureStart = new Date(Date.now() + 86400000);
  const workshop = await seedPublishedWorkshop({ maxParticipants: 10, startAt: futureStart });
  const { auth } = await seedStudent({ universityId: 'U26CE004' });

  // Register
  const reg = await registerStudent(workshop._id, auth);
  assert.equal(reg.status, 'REGISTERED');

  // Cancel registration before startAt
  const cancelled = await cancelStudentRegistration(
    workshop._id,
    { reason: 'Personal conflict' },
    auth
  );
  assert.equal(cancelled.status, 'CANCELLED');

  // Verify activeRegistrationKey is unset in DB
  const regDoc = await WorkshopRegistration.findById(reg._id);
  assert.equal(regDoc.status, 'CANCELLED');
  assert.equal(regDoc.activeRegistrationKey, undefined);

  // Re-registration is now possible after cancellation
  const reReg = await registerStudent(workshop._id, auth);
  assert.equal(reReg.status, 'REGISTERED');
  assert.equal(reReg.activeRegistrationKey, 'ACTIVE');

  // Fast forward workshop to active/started
  workshop.startAt = new Date(Date.now() - 10000);
  await workshop.save();

  // Attempting to cancel after startAt must be rejected
  await assert.rejects(
    async () => cancelStudentRegistration(workshop._id, {}, auth),
    (err) => {
      assert.equal(err.statusCode, 400);
      assert.equal(err.code, 'CANCELLATION_DEADLINE_PASSED');
      return true;
    }
  );
});

test('6. CAPACITY CONCURRENCY — Exactly 5 of 10 competing concurrent registrations succeed for 5 seats', async () => {
  // Workshop with exactly 5 available seats
  const workshop = await seedPublishedWorkshop({ maxParticipants: 5 });

  // Seed 10 distinct students
  const studentAuthList = [];
  for (let i = 1; i <= 10; i++) {
    const student = await seedStudent({
      universityId: `U26COMP${String(i).padStart(3, '0')}`
    });
    studentAuthList.push(student.auth);
  }

  assert.equal(studentAuthList.length, 10);

  // Execute all 10 registration requests concurrently using Promise.allSettled
  const results = await Promise.allSettled(
    studentAuthList.map((auth) => registerStudent(workshop._id, auth))
  );

  const successful = results.filter((r) => r.status === 'fulfilled');
  const rejected = results.filter((r) => r.status === 'rejected');

  // Assert exactly 5 registrations succeeded
  assert.equal(
    successful.length,
    5,
    `Expected exactly 5 successful registrations, but got ${successful.length}.`
  );

  // Assert exactly 5 registrations were rejected due to capacity limit
  assert.equal(
    rejected.length,
    5,
    `Expected exactly 5 rejected registrations, but got ${rejected.length}.`
  );

  for (const failure of rejected) {
    const error = failure.reason;
    assert.equal(
      error.statusCode,
      409,
      `Expected HTTP 409 status code for full workshop, but got ${error.statusCode}.`
    );
    assert.equal(
      error.code,
      'WORKSHOP_FULL',
      `Expected error code WORKSHOP_FULL, but got ${error.code}.`
    );
  }

  // Database verification: Exactly 5 active registrations exist in MongoDB
  const activeCount = await WorkshopRegistration.countDocuments({
    workshopId: workshop._id,
    activeRegistrationKey: 'ACTIVE'
  });
  assert.equal(activeCount, 5, 'Database must have exactly 5 active registrations.');

  const totalCount = await WorkshopRegistration.countDocuments({
    workshopId: workshop._id
  });
  assert.equal(totalCount, 5, 'Total persisted registrations must equal 5.');

  // Audit logs verification: Exactly 5 STUDENT_REGISTERED audit logs exist
  const auditLogsCount = await WorkshopAuditLog.countDocuments({
    workshopId: workshop._id,
    action: 'STUDENT_REGISTERED'
  });
  assert.equal(auditLogsCount, 5, 'Exactly 5 audit log entries must be created for the successful registrations.');
});
