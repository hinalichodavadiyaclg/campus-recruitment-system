import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import {
  createWorkshop,
  submitWorkshopForApproval,
  updateWorkshop,
  approveWorkshop,
  approveWorkshopEdit,
  rejectWorkshopEdit,
  getWorkshopDepartmentScope
} from '../src/services/workshop.service.js';
import { Workshop } from '../src/models/workshop.model.js';
import { WorkshopAuditLog } from '../src/models/workshop_audit_log.model.js';
import { Department } from '../src/models/department.model.js';
import { PlacementOfficer } from '../src/models/placement_officer.model.js';
import { Company } from '../src/models/company.model.js';
import { User } from '../src/models/user.model.js';
import { ROLE_IDS } from '../src/utils/access-constants.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';

let replSet;
let headAuth;
let cseCoordinatorAuth;
let itCoordinatorAuth;
let companyAuth;
let otherCompanyAuth;
let studentAuth;
let cseDept;
let itDept;
let testCompany;
let otherCompany;

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
  await WorkshopAuditLog.deleteMany({});
  await Department.deleteMany({});
  await PlacementOfficer.deleteMany({});
  await Company.deleteMany({});
  await User.deleteMany({});

  cseDept = await Department.create({
    name: 'Computer Science and Engineering',
    code: 'CSE',
    isActive: true
  });

  itDept = await Department.create({
    name: 'Information Technology',
    code: 'IT',
    isActive: true
  });

  testCompany = await Company.create({
    companyId: 'COMP-101',
    companyName: 'Tech Innovations Ltd',
    industryType: 'Software',
    hrRecruiterName: 'Alice Recruiter',
    email: 'alice@techinnovations.com',
    yearEstablished: 2015
  });

  otherCompany = await Company.create({
    companyId: 'COMP-102',
    companyName: 'Global Solutions Inc',
    industryType: 'Consulting',
    hrRecruiterName: 'Bob Recruiter',
    email: 'bob@globalsolutions.com',
    yearEstablished: 2018
  });

  const headUserId = new mongoose.Types.ObjectId();
  const cseCoordUserId = new mongoose.Types.ObjectId();
  const itCoordUserId = new mongoose.Types.ObjectId();
  const companyUserId = new mongoose.Types.ObjectId();
  const otherCompanyUserId = new mongoose.Types.ObjectId();
  const studentUserId = new mongoose.Types.ObjectId();

  headAuth = {
    userId: headUserId,
    roleId: ROLE_IDS.PLACEMENT_HEAD,
    userType: 'PLACEMENT'
  };

  cseCoordinatorAuth = {
    userId: cseCoordUserId,
    roleId: ROLE_IDS.PLACEMENT_COORDINATOR,
    userType: 'PLACEMENT'
  };

  itCoordinatorAuth = {
    userId: itCoordUserId,
    roleId: ROLE_IDS.PLACEMENT_COORDINATOR,
    userType: 'PLACEMENT'
  };

  companyAuth = {
    userId: companyUserId,
    roleId: ROLE_IDS.COMPANY,
    userType: 'COMPANY',
    companyId: testCompany._id
  };

  otherCompanyAuth = {
    userId: otherCompanyUserId,
    roleId: ROLE_IDS.COMPANY,
    userType: 'COMPANY',
    companyId: otherCompany._id
  };

  studentAuth = {
    userId: studentUserId,
    roleId: ROLE_IDS.STUDENT,
    userType: 'STUDENT'
  };

  await PlacementOfficer.create({
    userId: headUserId,
    employeeId: 'EMP-HEAD-01',
    firstName: 'Director',
    lastName: 'Placements',
    email: 'head@vvwu.edu.in',
    mobileNumber: '9876543210',
    designation: 'Head, Training & Placement Cell',
    role: ROLE_IDS.PLACEMENT_HEAD
  });

  await PlacementOfficer.create({
    userId: cseCoordUserId,
    employeeId: 'EMP-CSE-01',
    firstName: 'CSE',
    lastName: 'Coordinator',
    email: 'coordinator.cse@vvwu.edu.in',
    mobileNumber: '9876543211',
    departmentId: cseDept._id,
    designation: 'Assistant Professor & Coordinator',
    role: ROLE_IDS.PLACEMENT_COORDINATOR
  });

  await PlacementOfficer.create({
    userId: itCoordUserId,
    employeeId: 'EMP-IT-01',
    firstName: 'IT',
    lastName: 'Coordinator',
    email: 'coordinator.it@vvwu.edu.in',
    mobileNumber: '9876543212',
    departmentId: itDept._id,
    designation: 'Assistant Professor & Coordinator',
    role: ROLE_IDS.PLACEMENT_COORDINATOR
  });

  await User.create([
    { _id: headUserId, email: 'head@vvwu.edu.in', passwordHash: 'hash', userType: 'PLACEMENT', roleId: ROLE_IDS.PLACEMENT_HEAD, employeeId: 'EMP-HEAD-01', accountStatus: 'ACTIVE' },
    { _id: cseCoordUserId, email: 'coordinator.cse@vvwu.edu.in', passwordHash: 'hash', userType: 'PLACEMENT', roleId: ROLE_IDS.PLACEMENT_COORDINATOR, employeeId: 'EMP-CSE-01', departmentId: cseDept._id, accountStatus: 'ACTIVE' },
    { _id: itCoordUserId, email: 'coordinator.it@vvwu.edu.in', passwordHash: 'hash', userType: 'PLACEMENT', roleId: ROLE_IDS.PLACEMENT_COORDINATOR, employeeId: 'EMP-IT-01', departmentId: itDept._id, accountStatus: 'ACTIVE' },
    { _id: companyUserId, email: 'alice@techinnovations.com', passwordHash: 'hash', userType: 'COMPANY', roleId: ROLE_IDS.COMPANY, companyId: testCompany._id, accountStatus: 'ACTIVE' },
    { _id: otherCompanyUserId, email: 'bob@globalsolutions.com', passwordHash: 'hash', userType: 'COMPANY', roleId: ROLE_IDS.COMPANY, companyId: otherCompany._id, accountStatus: 'ACTIVE' },
    { _id: studentUserId, email: 'student@vvwu.edu.in', passwordHash: 'hash', userType: 'STUDENT', roleId: ROLE_IDS.STUDENT, universityId: 'U12345', accountStatus: 'ACTIVE' }
  ]);
});

test('1. Single-department company workshop edit: requires approval, Placement Coordinator can approve', async () => {
  const startAt = new Date('2026-11-20T10:00:00Z');
  const endAt = new Date('2026-11-20T13:00:00Z');

  // Company creates single-department workshop
  const created = await createWorkshop(
    {
      title: 'Original Tech Workshop',
      description: 'Introductory deep dive into software engineering.',
      category: 'TECHNICAL',
      mode: 'ONLINE',
      meetingLink: 'https://meet.google.com/tech-orig',
      ownershipType: 'DEPARTMENT',
      departmentId: cseDept._id,
      startAt,
      endAt,
      registrationDeadline: new Date('2026-11-19T18:00:00Z'),
      maxParticipants: 30,
      targetAudience: {
        isAllDepartments: false,
        departmentRules: [
          {
            departmentId: cseDept._id,
            targetingMode: 'ALL_COURSES_ALL_SEMESTERS'
          }
        ]
      },
      sessions: [
        {
          sessionId: 'SES-01',
          sessionNumber: 1,
          title: 'Session 1',
          startAt,
          endAt
        }
      ]
    },
    companyAuth
  );

  // Submit for approval then initial approval by Placement Head
  await submitWorkshopForApproval(created._id, companyAuth);
  await approveWorkshop(created._id, { comment: 'Initial approval' }, headAuth);
  const approvedWs = await Workshop.findById(created._id);
  assert.equal(approvedWs.approvalStatus, 'APPROVED');

  // Verify department scope helper recognizes single department
  const scope = getWorkshopDepartmentScope(approvedWs);
  assert.equal(scope.isSingleDept, true);
  assert.equal(scope.departmentId, String(cseDept._id));

  // Company edits the approved workshop
  const editResult = await updateWorkshop(
    approvedWs._id,
    {
      title: 'Revised Advanced Tech Workshop',
      description: 'Updated comprehensive software engineering masterclass.',
      maxParticipants: 45
    },
    companyAuth
  );

  assert.equal(editResult.requiresApproval, true);

  // Live workshop title must NOT have changed yet!
  const liveWs = await Workshop.findById(created._id);
  assert.equal(liveWs.title, 'Original Tech Workshop');
  assert.equal(liveWs.maxParticipants, 30);
  assert.ok(liveWs.pendingEdit);
  assert.equal(liveWs.pendingEdit.status, 'PENDING');
  assert.equal(liveWs.pendingEdit.proposedChanges.title, 'Revised Advanced Tech Workshop');

  // Out-of-department (IT) Coordinator CANNOT approve CSE workshop edit
  await assert.rejects(
    async () => approveWorkshopEdit(created._id, { comment: 'IT Coordinator approves' }, itCoordinatorAuth),
    (err) => {
      assert.equal(err.statusCode, 403);
      assert.equal(err.code, 'FORBIDDEN');
      return true;
    }
  );

  // Assigned CSE Coordinator CAN approve the single-department edit!
  const approvedEditResult = await approveWorkshopEdit(
    created._id,
    { comment: 'CSE Coordinator approves change' },
    cseCoordinatorAuth
  );

  assert.equal(approvedEditResult.title, 'Revised Advanced Tech Workshop');
  assert.equal(approvedEditResult.maxParticipants, 45);
  assert.equal(approvedEditResult.pendingEdit.status, 'APPROVED');
  assert.equal(approvedEditResult.pendingEdit.reviewComment, 'CSE Coordinator approves change');

  // Check audit log recorded
  const audit = await WorkshopAuditLog.findOne({
    workshopId: created._id,
    action: 'WORKSHOP_EDIT_APPROVED'
  });
  assert.ok(audit);
  assert.equal(audit.changedBy.toString(), cseCoordinatorAuth.userId.toString());
  assert.equal(audit.newValue.title, 'Revised Advanced Tech Workshop');
});

test('2. Multi-department company workshop edit: Coordinator CANNOT approve, only Placement Head can approve', async () => {
  const startAt = new Date('2026-11-25T10:00:00Z');
  const endAt = new Date('2026-11-25T13:00:00Z');

  // Company creates multi-department workshop targeting both CSE and IT
  const created = await createWorkshop(
    {
      title: 'Cross-Department AI Workshop',
      description: 'AI workshop for CSE and IT departments.',
      category: 'TECHNICAL',
      mode: 'ONLINE',
      meetingLink: 'https://meet.google.com/cross-dept',
      ownershipType: 'CENTRAL_PLACEMENT_CELL',
      startAt,
      endAt,
      registrationDeadline: new Date('2026-11-24T18:00:00Z'),
      maxParticipants: 50,
      targetAudience: {
        isAllDepartments: false,
        departmentRules: [
          { departmentId: cseDept._id, targetingMode: 'ALL_COURSES_ALL_SEMESTERS' },
          { departmentId: itDept._id, targetingMode: 'ALL_COURSES_ALL_SEMESTERS' }
        ]
      },
      sessions: [
        {
          sessionId: 'SES-01',
          sessionNumber: 1,
          title: 'Session 1',
          startAt,
          endAt
        }
      ]
    },
    companyAuth
  );

  // Submit for approval then approve workshop initially
  await submitWorkshopForApproval(created._id, companyAuth);
  await approveWorkshop(created._id, { comment: 'Approved' }, headAuth);

  // Verify department scope recognizes multi-department
  const scope = getWorkshopDepartmentScope(await Workshop.findById(created._id));
  assert.equal(scope.isSingleDept, false);

  // Company edits the workshop
  await updateWorkshop(
    created._id,
    {
      title: 'Advanced Cross-Department AI & Data Science Workshop',
      maxParticipants: 75
    },
    companyAuth
  );

  // CSE Coordinator tries to approve multi-department workshop edit -> must be REJECTED with 403
  await assert.rejects(
    async () => approveWorkshopEdit(created._id, { comment: 'CSE Coordinator approval' }, cseCoordinatorAuth),
    (err) => {
      assert.equal(err.statusCode, 403);
      assert.equal(err.code, 'FORBIDDEN');
      assert.ok(err.message.includes('Placement Head'));
      return true;
    }
  );

  // Placement Head CAN approve multi-department workshop edit!
  const headApproved = await approveWorkshopEdit(
    created._id,
    { comment: 'Placement Head approved cross-department update' },
    headAuth
  );

  assert.equal(headApproved.title, 'Advanced Cross-Department AI & Data Science Workshop');
  assert.equal(headApproved.maxParticipants, 75);
  assert.equal(headApproved.pendingEdit.status, 'APPROVED');
});

test('3. Rejection flow: Placement Coordinator or Head can reject company edit with mandatory reason', async () => {
  const startAt = new Date('2026-11-28T10:00:00Z');
  const endAt = new Date('2026-11-28T13:00:00Z');

  const created = await createWorkshop(
    {
      title: 'Python Mastery Workshop',
      description: 'Hands on Python workshop.',
      category: 'TECHNICAL',
      mode: 'ONLINE',
      meetingLink: 'https://meet.google.com/python-ws',
      ownershipType: 'DEPARTMENT',
      departmentId: cseDept._id,
      startAt,
      endAt,
      registrationDeadline: new Date('2026-11-27T18:00:00Z'),
      maxParticipants: 40,
      targetAudience: {
        isAllDepartments: false,
        departmentRules: [{ departmentId: cseDept._id, targetingMode: 'ALL_COURSES_ALL_SEMESTERS' }]
      },
      sessions: [
        {
          sessionId: 'SES-01',
          sessionNumber: 1,
          title: 'Session 1',
          startAt,
          endAt
        }
      ]
    },
    companyAuth
  );

  await submitWorkshopForApproval(created._id, companyAuth);
  await approveWorkshop(created._id, { comment: 'Approved' }, headAuth);

  // Company submits an edit
  await updateWorkshop(
    created._id,
    {
      title: 'Python & Django Accelerated Bootcamp'
    },
    companyAuth
  );

  // Rejection with less than 5 characters fails
  await assert.rejects(
    async () => rejectWorkshopEdit(created._id, { reason: 'No' }, cseCoordinatorAuth),
    (err) => {
      assert.equal(err.statusCode, 400);
      return true;
    }
  );

  // Rejection by assigned Coordinator succeeds with valid reason
  const rejectionResult = await rejectWorkshopEdit(
    created._id,
    { reason: 'Curriculum scope change conflicts with department semester examinations.' },
    cseCoordinatorAuth
  );

  // Live workshop title must remain UNCHANGED!
  assert.equal(rejectionResult.title, 'Python Mastery Workshop');
  assert.equal(rejectionResult.pendingEdit.status, 'REJECTED');
  assert.equal(
    rejectionResult.pendingEdit.reviewComment,
    'Curriculum scope change conflicts with department semester examinations.'
  );

  // Verify audit log
  const audit = await WorkshopAuditLog.findOne({
    workshopId: created._id,
    action: 'WORKSHOP_EDIT_REJECTED'
  });
  assert.ok(audit);
  assert.equal(audit.changedBy.toString(), cseCoordinatorAuth.userId.toString());
});

test('4. Staff direct editing: Placement Head or Coordinator edits directly without pending approval', async () => {
  const startAt = new Date('2026-12-05T10:00:00Z');
  const endAt = new Date('2026-12-05T13:00:00Z');

  const created = await createWorkshop(
    {
      title: 'Faculty Workshop',
      description: 'Departmental workshop created by Coordinator.',
      category: 'TECHNICAL',
      mode: 'ONLINE',
      meetingLink: 'https://meet.google.com/fac-ws',
      ownershipType: 'DEPARTMENT',
      departmentId: cseDept._id,
      startAt,
      endAt,
      registrationDeadline: new Date('2026-12-04T18:00:00Z'),
      maxParticipants: 30,
      sessions: [{ sessionId: 'SES-01', sessionNumber: 1, title: 'Session 1', startAt, endAt }]
    },
    cseCoordinatorAuth
  );

  // Coordinator edits their own workshop
  const updatedByCoord = await updateWorkshop(
    created._id,
    { title: 'Faculty Workshop (Directly Updated)' },
    cseCoordinatorAuth
  );

  // Must update immediately with no pending edit
  assert.equal(updatedByCoord.title, 'Faculty Workshop (Directly Updated)');
  assert.equal(updatedByCoord.pendingEdit, null);
});

test('5. Company edits startAt, endAt, registrationDeadline, and sessions: requires approval and updates dates on approval', async () => {
  const origStartAt = new Date('2026-12-10T10:00:00Z');
  const origEndAt = new Date('2026-12-10T13:00:00Z');
  const origDeadline = new Date('2026-12-09T18:00:00Z');

  const created = await createWorkshop(
    {
      title: 'Company Cloud Workshop',
      description: 'Hands-on cloud architecture bootcamp for engineering students.',
      category: 'TECHNICAL',
      mode: 'ONLINE',
      meetingLink: 'https://meet.google.com/cloud-bootcamp',
      ownershipType: 'DEPARTMENT',
      departmentId: cseDept._id,
      startAt: origStartAt,
      endAt: origEndAt,
      registrationDeadline: origDeadline,
      maxParticipants: 40,
      targetAudience: {
        isAllDepartments: false,
        departmentRules: [{ departmentId: cseDept._id, targetingMode: 'ALL_COURSES_ALL_SEMESTERS' }]
      },
      sessions: [{ sessionId: 'SES-01', sessionNumber: 1, title: 'Session 1', startAt: origStartAt, endAt: origEndAt }]
    },
    companyAuth
  );

  await submitWorkshopForApproval(created._id, companyAuth);
  await approveWorkshop(created._id, { comment: 'Approved' }, headAuth);

  // New dates proposed by company
  const newStartAt = new Date('2026-12-15T10:00:00Z');
  const newEndAt = new Date('2026-12-15T14:00:00Z');
  const newDeadline = new Date('2026-12-14T18:00:00Z');

  const editResult = await updateWorkshop(
    created._id,
    {
      startAt: newStartAt,
      endAt: newEndAt,
      registrationDeadline: newDeadline,
      sessions: [
        { sessionId: 'SES-01', sessionNumber: 1, title: 'Session 1: Rescheduled', startAt: newStartAt, endAt: newEndAt }
      ]
    },
    companyAuth
  );

  assert.equal(editResult.requiresApproval, true);

  // Live workshop dates unchanged before approval
  const beforeApproval = await Workshop.findById(created._id);
  assert.equal(new Date(beforeApproval.startAt).getTime(), origStartAt.getTime());
  assert.equal(new Date(beforeApproval.endAt).getTime(), origEndAt.getTime());
  assert.equal(new Date(beforeApproval.registrationDeadline).getTime(), origDeadline.getTime());

  // Proposed dates staged in pendingEdit
  assert.ok(beforeApproval.pendingEdit);
  assert.equal(beforeApproval.pendingEdit.status, 'PENDING');
  assert.equal(new Date(beforeApproval.pendingEdit.proposedChanges.startAt).getTime(), newStartAt.getTime());
  assert.equal(new Date(beforeApproval.pendingEdit.proposedChanges.endAt).getTime(), newEndAt.getTime());
  assert.equal(new Date(beforeApproval.pendingEdit.proposedChanges.registrationDeadline).getTime(), newDeadline.getTime());

  // Coordinator approves rescheduled dates
  const approvedResult = await approveWorkshopEdit(
    created._id,
    { comment: 'New schedule approved' },
    cseCoordinatorAuth
  );

  // After approval: live workshop dates are updated!
  assert.equal(new Date(approvedResult.startAt).getTime(), newStartAt.getTime());
  assert.equal(new Date(approvedResult.endAt).getTime(), newEndAt.getTime());
  assert.equal(new Date(approvedResult.registrationDeadline).getTime(), newDeadline.getTime());
  assert.equal(approvedResult.sessions[0].title, 'Session 1: Rescheduled');
  assert.equal(approvedResult.pendingEdit.status, 'APPROVED');
});
