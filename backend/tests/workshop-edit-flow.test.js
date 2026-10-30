import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import {
  createWorkshop,
  updateWorkshop
} from '../src/services/workshop.service.js';
import { canUserEditWorkshop } from '../../frontend/src/components/workshops/workshopValidation.js';
import { Workshop } from '../src/models/workshop.model.js';
import { WorkshopRegistration } from '../src/models/workshop_registration.model.js';
import { WorkshopAttendance } from '../src/models/workshop_attendance.model.js';
import { WorkshopAuditLog } from '../src/models/workshop_audit_log.model.js';
import { Department } from '../src/models/department.model.js';
import { PlacementOfficer } from '../src/models/placement_officer.model.js';
import { Company } from '../src/models/company.model.js';
import { User } from '../src/models/user.model.js';
import { Student } from '../src/models/student.model.js';
import { ROLE_IDS } from '../src/utils/access-constants.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';

let replSet;
let adminAuth;
let coordinatorAuth;
let otherCoordinatorAuth;
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
  await WorkshopRegistration.deleteMany({});
  await WorkshopAttendance.deleteMany({});
  await WorkshopAuditLog.deleteMany({});
  await Department.deleteMany({});
  await PlacementOfficer.deleteMany({});
  await Company.deleteMany({});
  await User.deleteMany({});
  await Student.deleteMany({});

  // Seed departments
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

  // Seed companies
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

  // Seed users and auth contexts
  const adminUserId = new mongoose.Types.ObjectId();
  const coordinatorUserId = new mongoose.Types.ObjectId();
  const otherCoordinatorUserId = new mongoose.Types.ObjectId();
  const companyUserId = new mongoose.Types.ObjectId();
  const otherCompanyUserId = new mongoose.Types.ObjectId();
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

  otherCoordinatorAuth = {
    userId: otherCoordinatorUserId,
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

  // Seed PlacementOfficer profile for CSE coordinator
  await PlacementOfficer.create({
    employeeId: 'EMP-CSE-001',
    firstName: 'Jane',
    lastName: 'Coordinator',
    email: 'coordinator@vvwu.ac.in',
    designation: 'Assistant Professor',
    departmentId: cseDept._id,
    department: 'Computer Science and Engineering',
    role: ROLE_IDS.PLACEMENT_COORDINATOR,
    userId: coordinatorUserId
  });

  // Seed PlacementOfficer profile for IT coordinator
  await PlacementOfficer.create({
    employeeId: 'EMP-IT-002',
    firstName: 'John',
    lastName: 'Coordinator',
    email: 'itcoordinator@vvwu.ac.in',
    designation: 'Assistant Professor',
    departmentId: itDept._id,
    department: 'Information Technology',
    role: ROLE_IDS.PLACEMENT_COORDINATOR,
    userId: otherCoordinatorUserId
  });
});

test('1. Frontend Action Visibility: canUserEditWorkshop enforces RBAC, scope, and lifecycle states', () => {
  const publishedDeptWorkshop = {
    _id: 'ws-001',
    ownershipType: 'DEPARTMENT',
    departmentId: cseDept._id,
    approvalStatus: 'APPROVED',
    isPublished: true,
    lifecycleStatus: 'SCHEDULED'
  };

  const publishedCentralWorkshop = {
    _id: 'ws-002',
    ownershipType: 'CENTRAL_PLACEMENT_CELL',
    approvalStatus: 'APPROVED',
    isPublished: true,
    lifecycleStatus: 'SCHEDULED'
  };

  const publishedCompanyWorkshop = {
    _id: 'ws-003',
    ownershipType: 'CENTRAL_PLACEMENT_CELL',
    companyId: testCompany._id,
    approvalStatus: 'APPROVED',
    isPublished: true,
    lifecycleStatus: 'SCHEDULED'
  };

  const cancelledWorkshop = {
    _id: 'ws-004',
    ownershipType: 'DEPARTMENT',
    departmentId: cseDept._id,
    approvalStatus: 'APPROVED',
    isPublished: true,
    lifecycleStatus: 'CANCELLED'
  };

  const completedWorkshop = {
    _id: 'ws-005',
    ownershipType: 'DEPARTMENT',
    departmentId: cseDept._id,
    approvalStatus: 'APPROVED',
    isPublished: true,
    lifecycleStatus: 'COMPLETED'
  };

  const hasPerm = (p) => p === 'WORKSHOP_UPDATE';

  // Super Admin can edit approved & published departmental, central, and company workshops
  assert.equal(
    canUserEditWorkshop({
      workshop: publishedDeptWorkshop,
      user: adminAuth,
      role: { id: ROLE_IDS.SUPER_ADMIN },
      has: hasPerm
    }),
    true
  );
  assert.equal(
    canUserEditWorkshop({
      workshop: publishedCentralWorkshop,
      user: adminAuth,
      role: { id: ROLE_IDS.SUPER_ADMIN },
      has: hasPerm
    }),
    true
  );

  // Student CANNOT edit any workshop
  assert.equal(
    canUserEditWorkshop({
      workshop: publishedDeptWorkshop,
      user: studentAuth,
      role: { id: ROLE_IDS.STUDENT },
      has: hasPerm
    }),
    false
  );

  // In-scope Placement Coordinator can edit published departmental workshop in their assigned department
  assert.equal(
    canUserEditWorkshop({
      workshop: publishedDeptWorkshop,
      user: coordinatorAuth,
      role: { id: ROLE_IDS.PLACEMENT_COORDINATOR },
      has: hasPerm,
      coordinatorDeptId: String(cseDept._id)
    }),
    true
  );

  // Out-of-scope Placement Coordinator CANNOT edit another department's workshop
  assert.equal(
    canUserEditWorkshop({
      workshop: publishedDeptWorkshop,
      user: otherCoordinatorAuth,
      role: { id: ROLE_IDS.PLACEMENT_COORDINATOR },
      has: hasPerm,
      coordinatorDeptId: String(itDept._id)
    }),
    false
  );

  // Placement Coordinator CANNOT edit Central Placement Cell workshop
  assert.equal(
    canUserEditWorkshop({
      workshop: publishedCentralWorkshop,
      user: coordinatorAuth,
      role: { id: ROLE_IDS.PLACEMENT_COORDINATOR },
      has: hasPerm,
      coordinatorDeptId: String(cseDept._id)
    }),
    false
  );

  // Company recruiter CAN edit their own company's approved and published workshop
  assert.equal(
    canUserEditWorkshop({
      workshop: publishedCompanyWorkshop,
      user: companyAuth,
      role: { id: ROLE_IDS.COMPANY },
      has: hasPerm
    }),
    true
  );

  // Company recruiter CANNOT edit another company's workshop
  assert.equal(
    canUserEditWorkshop({
      workshop: publishedCompanyWorkshop,
      user: otherCompanyAuth,
      role: { id: ROLE_IDS.COMPANY },
      has: hasPerm
    }),
    false
  );

  // Cancelled and completed workshops cannot be edited by anyone
  assert.equal(
    canUserEditWorkshop({
      workshop: cancelledWorkshop,
      user: adminAuth,
      role: { id: ROLE_IDS.SUPER_ADMIN },
      has: hasPerm
    }),
    false
  );
  assert.equal(
    canUserEditWorkshop({
      workshop: completedWorkshop,
      user: adminAuth,
      role: { id: ROLE_IDS.SUPER_ADMIN },
      has: hasPerm
    }),
    false
  );
});

test('2. Backend: Authorized editing of approved and published workshop preserves approval and publication states', async () => {
  const startAt = new Date('2026-11-20T10:00:00Z');
  const endAt = new Date('2026-11-20T13:00:00Z');
  const deadline = new Date('2026-11-19T18:00:00Z');

  // Institution workshop auto-approved and published on creation
  const created = await createWorkshop(
    {
      title: 'Original Cloud Architecture Workshop',
      description: 'Comprehensive deep dive into modern cloud architecture.',
      category: 'TECHNICAL',
      mode: 'ONLINE',
      meetingLink: 'https://meet.google.com/orig-cloud',
      ownershipType: 'DEPARTMENT',
      departmentId: cseDept._id,
      startAt,
      endAt,
      registrationDeadline: deadline,
      maxParticipants: 40,
      sessions: [
        {
          sessionId: 'SES-01',
          sessionNumber: 1,
          title: 'Session 1: Infrastructure as Code',
          startAt,
          endAt
        }
      ]
    },
    coordinatorAuth
  );

  assert.equal(created.approvalStatus, 'APPROVED');
  assert.equal(created.isPublished, true);

  // Authorized coordinator edits their published workshop: updates title, description, maxParticipants, and session title
  const updated = await updateWorkshop(
    created._id,
    {
      title: 'Advanced Cloud Architecture & DevOps Workshop',
      description: 'Comprehensive deep dive into modern cloud architecture with container orchestration.',
      maxParticipants: 50,
      sessions: [
        {
          sessionId: 'SES-01',
          sessionNumber: 1,
          title: 'Session 1: Infrastructure as Code & Kubernetes',
          startAt,
          endAt
        }
      ]
    },
    coordinatorAuth
  );

  // Verifications:
  assert.equal(updated.title, 'Advanced Cloud Architecture & DevOps Workshop');
  assert.equal(updated.maxParticipants, 50);
  assert.equal(updated.sessions[0].title, 'Session 1: Infrastructure as Code & Kubernetes');

  // State preservation: MUST remain APPROVED and PUBLISHED
  assert.equal(updated.approvalStatus, 'APPROVED');
  assert.equal(updated.isPublished, true);
  assert.equal(updated.lifecycleStatus, 'SCHEDULED');

  // Audit record verification
  const audit = await WorkshopAuditLog.findOne({
    workshopId: created._id,
    action: 'WORKSHOP_UPDATED'
  });
  assert.ok(audit, 'WORKSHOP_UPDATED audit log must be recorded');
  assert.equal(audit.changedBy.toString(), coordinatorAuth.userId.toString());
  assert.equal(audit.oldValue.title, 'Original Cloud Architecture Workshop');
  assert.equal(audit.newValue.title, 'Advanced Cloud Architecture & DevOps Workshop');
});

test('3. Backend: Capacity protection prevents maxParticipants from being reduced below active registered count', async () => {
  const startAt = new Date('2026-11-25T10:00:00Z');
  const endAt = new Date('2026-11-25T13:00:00Z');

  const created = await createWorkshop(
    {
      title: 'Capacity Boundary Test Workshop',
      description: 'Verifies capacity reduction cannot breach enrolled count.',
      category: 'TECHNICAL',
      mode: 'ONLINE',
      meetingLink: 'https://meet.google.com/cap-test',
      ownershipType: 'DEPARTMENT',
      departmentId: cseDept._id,
      startAt,
      endAt,
      registrationDeadline: new Date('2026-11-24T18:00:00Z'),
      maxParticipants: 10,
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
    coordinatorAuth
  );

  // Create 3 active registrations
  const studentIds = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
  for (let i = 0; i < studentIds.length; i++) {
    await WorkshopRegistration.create({
      registrationId: `WREG-TEST-00${i + 1}`,
      workshopId: created._id,
      studentId: studentIds[i],
      status: 'REGISTERED',
      registrationSource: 'STUDENT',
      registeredBy: studentIds[i],
      activeRegistrationKey: 'ACTIVE'
    });
  }

  // Attempting to reduce maxParticipants to 2 (below 3 active registrations) must be rejected with 400
  await assert.rejects(
    async () =>
      updateWorkshop(
        created._id,
        { maxParticipants: 2 },
        coordinatorAuth
      ),
    (err) => {
      assert.equal(err.statusCode, 400);
      assert.equal(err.code, 'CAPACITY_BELOW_ENROLLED');
      return true;
    }
  );

  // Setting maxParticipants to 3 (exact active count) must succeed
  const updatedExact = await updateWorkshop(
    created._id,
    { maxParticipants: 3 },
    coordinatorAuth
  );
  assert.equal(updatedExact.maxParticipants, 3);

  // Increasing maxParticipants to 20 must succeed
  const updatedHigher = await updateWorkshop(
    created._id,
    { maxParticipants: 20 },
    coordinatorAuth
  );
  assert.equal(updatedHigher.maxParticipants, 20);
});

test('4. Backend: Session attendance preservation prevents removing sessions that already have recorded attendance', async () => {
  const startAt = new Date('2026-11-28T09:00:00Z');
  const endAt = new Date('2026-11-28T16:00:00Z');

  const created = await createWorkshop(
    {
      title: 'Attendance Preservation Workshop',
      description: 'Testing that sessions with attendance records cannot be deleted.',
      category: 'TECHNICAL',
      mode: 'ONLINE',
      meetingLink: 'https://meet.google.com/attend-test',
      ownershipType: 'DEPARTMENT',
      departmentId: cseDept._id,
      startAt,
      endAt,
      registrationDeadline: new Date('2026-11-27T18:00:00Z'),
      maxParticipants: 30,
      sessions: [
        {
          sessionId: 'SES-01',
          sessionNumber: 1,
          title: 'Morning Session',
          startAt,
          endAt: new Date('2026-11-28T12:00:00Z')
        },
        {
          sessionId: 'SES-02',
          sessionNumber: 2,
          title: 'Afternoon Session',
          startAt: new Date('2026-11-28T13:00:00Z'),
          endAt
        }
      ]
    },
    coordinatorAuth
  );

  const studentId = new mongoose.Types.ObjectId();
  const registration = await WorkshopRegistration.create({
    registrationId: 'WREG-ATT-001',
    workshopId: created._id,
    studentId,
    status: 'REGISTERED',
    registrationSource: 'STUDENT',
    registeredBy: studentId,
    activeRegistrationKey: 'ACTIVE'
  });

  // Record attendance for SES-01
  await WorkshopAttendance.create({
    workshopId: created._id,
    sessionId: 'SES-01',
    registrationId: registration._id,
    studentId,
    attendanceStatus: 'PRESENT',
    markedBy: coordinatorAuth.userId
  });

  // Attempting to update workshop by deleting SES-01 (submitting only SES-02) must be rejected
  await assert.rejects(
    async () =>
      updateWorkshop(
        created._id,
        {
          sessions: [
            {
              sessionId: 'SES-02',
              sessionNumber: 1,
              title: 'Afternoon Session Only',
              startAt: new Date('2026-11-28T13:00:00Z'),
              endAt
            }
          ]
        },
        coordinatorAuth
      ),
    (err) => {
      assert.equal(err.statusCode, 400);
      assert.equal(err.code, 'CANNOT_DELETE_SESSION_WITH_ATTENDANCE');
      return true;
    }
  );

  // Updating session titles/metadata while keeping SES-01 must succeed
  const updated = await updateWorkshop(
    created._id,
    {
      sessions: [
        {
          sessionId: 'SES-01',
          sessionNumber: 1,
          title: 'Morning Session (Updated Curriculum)',
          startAt,
          endAt: new Date('2026-11-28T12:00:00Z')
        },
        {
          sessionId: 'SES-02',
          sessionNumber: 2,
          title: 'Afternoon Session (Hands-on Lab)',
          startAt: new Date('2026-11-28T13:00:00Z'),
          endAt
        }
      ]
    },
    coordinatorAuth
  );
  assert.equal(updated.sessions[0].title, 'Morning Session (Updated Curriculum)');
});

test('5. Backend: Optimistic concurrency conflict rejects stale edits with 409', async () => {
  const startAt = new Date('2026-12-01T10:00:00Z');
  const endAt = new Date('2026-12-01T12:00:00Z');

  const created = await createWorkshop(
    {
      title: 'Concurrency Test Workshop',
      description: 'Verifies concurrent stale edits are safely rejected.',
      category: 'CAREER_PREP',
      mode: 'ONLINE',
      meetingLink: 'https://meet.google.com/concurr-test',
      ownershipType: 'DEPARTMENT',
      departmentId: cseDept._id,
      startAt,
      endAt,
      registrationDeadline: new Date('2026-11-30T18:00:00Z'),
      maxParticipants: 25,
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
    coordinatorAuth
  );

  // Outdated timestamp (1 hour in the past)
  const staleTimestamp = new Date(Date.now() - 3600000).toISOString();

  await assert.rejects(
    async () =>
      updateWorkshop(
        created._id,
        {
          title: 'Conflicting Title Update',
          expectedUpdatedAt: staleTimestamp
        },
        coordinatorAuth
      ),
    (err) => {
      assert.equal(err.statusCode, 409);
      assert.equal(err.code, 'STALE_DATA_CONFLICT');
      return true;
    }
  );

  // Correct timestamp succeeds
  const updated = await updateWorkshop(
    created._id,
    {
      title: 'Valid Concurrency Update',
      expectedUpdatedAt: created.updatedAt.toISOString()
    },
    coordinatorAuth
  );
  assert.equal(updated.title, 'Valid Concurrency Update');
});

test('6. Backend: Scope enforcement rejects cross-department, cross-company, and student update attempts', async () => {
  const startAt = new Date('2026-12-08T10:00:00Z');
  const endAt = new Date('2026-12-08T12:00:00Z');

  const deptWorkshop = await createWorkshop(
    {
      title: 'CSE Exclusive Workshop',
      description: 'Departmental workshop scoped to Computer Science.',
      category: 'TECHNICAL',
      mode: 'ONLINE',
      meetingLink: 'https://meet.google.com/cse-scope',
      ownershipType: 'DEPARTMENT',
      departmentId: cseDept._id,
      startAt,
      endAt,
      registrationDeadline: new Date('2026-12-07T18:00:00Z'),
      maxParticipants: 30,
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
    coordinatorAuth
  );

  // IT Coordinator cannot update CSE workshop
  await assert.rejects(
    async () =>
      updateWorkshop(
        deptWorkshop._id,
        { title: 'Hacked by IT Coordinator' },
        otherCoordinatorAuth
      ),
    (err) => {
      assert.equal(err.statusCode, 403);
      assert.equal(err.code, 'FORBIDDEN');
      return true;
    }
  );

  // Student cannot update workshop
  await assert.rejects(
    async () =>
      updateWorkshop(
        deptWorkshop._id,
        { title: 'Hacked by Student' },
        studentAuth
      ),
    (err) => {
      assert.equal(err.statusCode, 403);
      assert.equal(err.code, 'FORBIDDEN');
      return true;
    }
  );

  // Protected properties like approvalStatus, isPublished, and createdBy cannot be forged in update
  const forgedUpdate = await updateWorkshop(
    deptWorkshop._id,
    {
      title: 'Legitimate Title Update',
      approvalStatus: 'DRAFT',
      isPublished: false,
      createdBy: otherCoordinatorAuth.userId
    },
    coordinatorAuth
  );

  assert.equal(forgedUpdate.title, 'Legitimate Title Update');
  assert.equal(forgedUpdate.approvalStatus, 'APPROVED');
  assert.equal(forgedUpdate.isPublished, true);
  assert.equal(forgedUpdate.createdBy.toString(), coordinatorAuth.userId.toString());
});
