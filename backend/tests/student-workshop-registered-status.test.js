import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import {
  createWorkshop,
  getWorkshopById,
  listWorkshops,
  submitWorkshopForApproval,
  approveWorkshop,
  publishWorkshop
} from '../src/services/workshop.service.js';
import {
  registerStudent,
  cancelStudentRegistration
} from '../src/services/workshop-registration.service.js';
import { Workshop } from '../src/models/workshop.model.js';
import { WorkshopRegistration } from '../src/models/workshop_registration.model.js';
import { Department } from '../src/models/department.model.js';
import { PlacementOfficer } from '../src/models/placement_officer.model.js';
import { Student } from '../src/models/student.model.js';
import { ROLE_IDS } from '../src/utils/access-constants.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';

let replSet;
let adminAuth;
let coordinatorAuth;
let studentAuth;
let studentDoc;
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
  await Department.deleteMany({});
  await PlacementOfficer.deleteMany({});
  await Student.deleteMany({});

  departmentDoc = await Department.create({
    name: 'Computer Science',
    code: 'CSE',
    isActive: true
  });

  const adminUserId = new mongoose.Types.ObjectId();
  const coordinatorUserId = new mongoose.Types.ObjectId();
  const studentUserId = new mongoose.Types.ObjectId();

  adminAuth = {
    userId: adminUserId,
    roleId: ROLE_IDS.SUPER_ADMIN,
    userType: 'PLACEMENT'
  };

  coordinatorAuth = {
    userId: coordinatorUserId,
    roleId: ROLE_IDS.PLACEMENT_COORDINATOR,
    userType: 'PLACEMENT'
  };

  studentAuth = {
    userId: studentUserId,
    roleId: ROLE_IDS.STUDENT,
    userType: 'STUDENT'
  };

  await PlacementOfficer.create({
    employeeId: 'EMP-CSE-001',
    firstName: 'Jane',
    lastName: 'Coordinator',
    email: 'coordinator@vvwu.edu.in',
    designation: 'Assistant Professor',
    departmentId: departmentDoc._id,
    department: 'Computer Science',
    role: ROLE_IDS.PLACEMENT_COORDINATOR,
    userId: coordinatorUserId
  });

  studentDoc = await Student.create({
    userId: studentUserId,
    universityId: 'U2026042',
    firstName: 'Alice',
    lastName: 'Student',
    email: 'alice@vvwu.edu.in',
    mobileNumber: '9876543210',
    branch: 'CSE',
    department: departmentDoc.name,
    departmentId: departmentDoc._id,
    semester: 5,
    cgpa: 8.8,
    academicStatus: 'REGULAR'
  });
});

test('Student isRegistered flag is accurately reflected in listWorkshops and getWorkshopById', async () => {
  const futureStart = new Date(Date.now() + 86400000 * 5);
  const futureEnd = new Date(Date.now() + 86400000 * 5 + 7200000);
  const deadline = new Date(Date.now() + 86400000 * 3);

  // Create workshop 1
  const ws1 = await createWorkshop({
    title: 'Advanced MongoDB',
    description: 'Learn advanced aggregation and transactions',
    category: 'TECHNICAL',
    mode: 'OFFLINE',
    venue: 'Lab 101',
    ownershipType: 'DEPARTMENT',
    departmentId: departmentDoc._id,
    targetingMode: 'OPEN_TO_ALL',
    targetAudience: { isAllDepartments: true },
    maxParticipants: 50,
    registrationDeadline: deadline,
    startAt: futureStart,
    endAt: futureEnd,
    sessions: [
      {
        sessionNumber: 1,
        sessionId: 'S01',
        title: 'Aggregation Pipelines',
        startAt: futureStart,
        endAt: futureEnd,
        isAttendanceRequired: true
      }
    ]
  }, coordinatorAuth);

  // Create workshop 2
  const ws2 = await createWorkshop({
    title: 'Cloud Computing',
    description: 'Real life cloud computing topics',
    category: 'TECHNICAL',
    mode: 'OFFLINE',
    venue: 'Lab 102',
    ownershipType: 'DEPARTMENT',
    departmentId: departmentDoc._id,
    targetingMode: 'OPEN_TO_ALL',
    targetAudience: { isAllDepartments: true },
    maxParticipants: 50,
    registrationDeadline: deadline,
    startAt: futureStart,
    endAt: futureEnd,
    sessions: [
      {
        sessionNumber: 1,
        sessionId: 'S01',
        title: 'Cloud Intro',
        startAt: futureStart,
        endAt: futureEnd,
        isAttendanceRequired: true
      }
    ]
  }, coordinatorAuth);

  // Department workshops start in APPROVED and PUBLISHED status upon creation

  // 1. Before student registers: isRegistered should be false for both
  const listBefore = await listWorkshops({}, studentAuth);
  assert.equal(listBefore.total, 2);
  const item1Before = listBefore.workshops.find((w) => String(w._id) === String(ws1._id));
  const item2Before = listBefore.workshops.find((w) => String(w._id) === String(ws2._id));
  assert.equal(item1Before.isRegistered, false);
  assert.equal(item2Before.isRegistered, false);

  const ws1DetailsBefore = await getWorkshopById(ws1._id, studentAuth);
  assert.equal(ws1DetailsBefore.isRegistered, false);

  // 2. Student registers for ws1
  await registerStudent(ws1._id, studentAuth);

  // Check listWorkshops: ws1 should have isRegistered: true, ws2 should have isRegistered: false
  const listAfterReg = await listWorkshops({}, studentAuth);
  const item1AfterReg = listAfterReg.workshops.find((w) => String(w._id) === String(ws1._id));
  const item2AfterReg = listAfterReg.workshops.find((w) => String(w._id) === String(ws2._id));
  assert.equal(item1AfterReg.isRegistered, true, 'ws1 must show isRegistered === true');
  assert.equal(item2AfterReg.isRegistered, false, 'ws2 must show isRegistered === false');

  // Check getWorkshopById
  const ws1DetailsAfterReg = await getWorkshopById(ws1._id, studentAuth);
  assert.equal(ws1DetailsAfterReg.isRegistered, true, 'ws1 getWorkshopById must show isRegistered === true');

  const ws2DetailsAfterReg = await getWorkshopById(ws2._id, studentAuth);
  assert.equal(ws2DetailsAfterReg.isRegistered, false, 'ws2 getWorkshopById must show isRegistered === false');

  // 3. Student cancels registration for ws1
  await cancelStudentRegistration(ws1._id, { reason: 'Changed mind' }, studentAuth);

  // Check listWorkshops and getWorkshopById: ws1 should now have isRegistered: false
  const listAfterCancel = await listWorkshops({}, studentAuth);
  const item1AfterCancel = listAfterCancel.workshops.find((w) => String(w._id) === String(ws1._id));
  assert.equal(item1AfterCancel.isRegistered, false, 'ws1 must show isRegistered === false after cancellation');

  const ws1DetailsAfterCancel = await getWorkshopById(ws1._id, studentAuth);
  assert.equal(ws1DetailsAfterCancel.isRegistered, false, 'ws1 getWorkshopById must show isRegistered === false after cancellation');
});
