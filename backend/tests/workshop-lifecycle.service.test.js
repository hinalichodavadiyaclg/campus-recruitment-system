import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import {
  createWorkshop,
  getWorkshopById,
  listWorkshops,
  updateWorkshop,
  submitWorkshopForApproval,
  approveWorkshop,
  rejectWorkshop,
  publishWorkshop,
  cancelWorkshop,
  deleteWorkshop
} from '../src/services/workshop.service.js';
import { Workshop } from '../src/models/workshop.model.js';
import { WorkshopRegistration } from '../src/models/workshop_registration.model.js';
import { WorkshopAuditLog } from '../src/models/workshop_audit_log.model.js';
import { Department } from '../src/models/department.model.js';
import { PlacementOfficer } from '../src/models/placement_officer.model.js';
import { Company } from '../src/models/company.model.js';
import { User } from '../src/models/user.model.js';
import { ROLE_IDS } from '../src/utils/access-constants.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';

let replSet;
let adminAuth;
let coordinatorAuth;
let studentAuth;
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
  await Department.deleteMany({});
  await PlacementOfficer.deleteMany({});
  await User.deleteMany({});

  // Seed sample department
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

  // Seed PlacementOfficer profile for coordinator
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
});

test('1. createWorkshop - Successfully creates workshop with sequential WS-YYYY-XXXX derived from IST year', async () => {
  const futureStart = new Date('2026-11-10T10:00:00Z');
  const futureEnd = new Date('2026-11-10T12:00:00Z');
  const deadline = new Date('2026-11-09T18:00:00Z');

  const payload = {
    title: 'Cloud Architecture Workshop',
    description: 'Comprehensive hands-on training on microservices and cloud infrastructure.',
    category: 'TECHNICAL',
    mode: 'ONLINE',
    meetingLink: 'https://meet.google.com/xyz-abc-def',
    ownershipType: 'DEPARTMENT',
    departmentId: departmentDoc._id,
    startAt: futureStart,
    endAt: futureEnd,
    registrationDeadline: deadline,
    maxParticipants: 60,
    sessions: [
      {
        sessionId: 'SES-01',
        sessionNumber: 1,
        title: 'Session 1: Cloud Basics',
        startAt: futureStart,
        endAt: futureEnd,
        isAttendanceRequired: true
      }
    ]
  };

  const workshop = await createWorkshop(payload, coordinatorAuth);

  assert.ok(workshop._id);
  assert.equal(workshop.approvalStatus, 'APPROVED');
  assert.equal(workshop.isPublished, true);
  assert.equal(workshop.lifecycleStatus, 'SCHEDULED');
  assert.ok(workshop.workshopId.startsWith('WS-2026-'));

  // Verify audit log creation and auto-publication
  const createAudit = await WorkshopAuditLog.findOne({ entityId: workshop.workshopId, action: 'WORKSHOP_CREATED' });
  assert.ok(createAudit);
  assert.equal(String(createAudit.changedBy), String(coordinatorAuth.userId));

  const publishAudit = await WorkshopAuditLog.findOne({ entityId: workshop.workshopId, action: 'WORKSHOP_PUBLISHED' });
  assert.ok(publishAudit);
  assert.equal(String(publishAudit.changedBy), String(coordinatorAuth.userId));
});

test('2. createWorkshop - Authorization & Department Scoping Rejections', async () => {
  const futureStart = new Date('2026-11-10T10:00:00Z');
  const futureEnd = new Date('2026-11-10T12:00:00Z');

  const basePayload = {
    title: 'Unauthorized Workshop',
    description: 'Testing authorization boundaries.',
    category: 'TECHNICAL',
    mode: 'ONLINE',
    meetingLink: 'https://meet.google.com/xyz-abc-def',
    ownershipType: 'DEPARTMENT',
    departmentId: departmentDoc._id,
    startAt: futureStart,
    endAt: futureEnd,
    registrationDeadline: new Date('2026-11-09T18:00:00Z'),
    maxParticipants: 40,
    sessions: [
      {
        sessionId: 'SES-01',
        sessionNumber: 1,
        title: 'Session 1',
        startAt: futureStart,
        endAt: futureEnd
      }
    ]
  };

  // Student cannot create workshops
  await assert.rejects(
    async () => createWorkshop(basePayload, studentAuth),
    (err) => {
      assert.equal(err.statusCode, 403);
      return true;
    }
  );

  // Coordinator cannot create Central Placement Cell workshop
  await assert.rejects(
    async () =>
      createWorkshop(
        { ...basePayload, ownershipType: 'CENTRAL_PLACEMENT_CELL', departmentId: undefined },
        coordinatorAuth
      ),
    (err) => {
      assert.equal(err.statusCode, 403);
      return true;
    }
  );

  // Missing start date fails with 400
  await assert.rejects(
    async () => createWorkshop({ ...basePayload, startAt: null }, coordinatorAuth),
    (err) => {
      assert.equal(err.statusCode, 400);
      assert.equal(err.code, 'INVALID_INPUT');
      return true;
    }
  );
});

test('3. Lifecycle Transitions - Submission, Approval, Rejection, and Publication', async () => {
  const futureStart = new Date('2026-12-01T09:00:00Z');
  const futureEnd = new Date('2026-12-01T12:00:00Z');

  const created = await createWorkshop(
    {
      title: 'Full Lifecycle Workshop',
      description: 'Verifying complete state machine transitions.',
      category: 'SOFT_SKILLS',
      mode: 'OFFLINE',
      venue: 'Auditorium Hall A',
      ownershipType: 'DEPARTMENT',
      departmentId: departmentDoc._id,
      startAt: futureStart,
      endAt: futureEnd,
      registrationDeadline: new Date('2026-11-30T18:00:00Z'),
      maxParticipants: 100,
      sessions: [
        {
          sessionId: 'SES-01',
          sessionNumber: 1,
          title: 'Opening Session',
          startAt: futureStart,
          endAt: futureEnd
        }
      ],
      approvalStatus: 'DRAFT'
    },
    coordinatorAuth
  );

  // 1. Submit for approval (DRAFT -> PENDING_APPROVAL)
  const submitted = await submitWorkshopForApproval(created._id, coordinatorAuth);
  assert.equal(submitted.approvalStatus, 'PENDING_APPROVAL');

  // Duplicate submission rejected
  await assert.rejects(
    async () => submitWorkshopForApproval(created._id, coordinatorAuth),
    /Cannot submit workshop with approvalStatus "PENDING_APPROVAL"/
  );

  // 2. Reject workshop (PENDING_APPROVAL -> REJECTED)
  const rejected = await rejectWorkshop(
    created._id,
    { reason: 'Description needs more detailed curriculum breakdown.' },
    adminAuth
  );
  assert.equal(rejected.approvalStatus, 'REJECTED');

  // Verify rejection reason is in audit log, NOT in workshop model
  const rejectAudit = await WorkshopAuditLog.findOne({
    entityId: created.workshopId,
    action: 'WORKSHOP_REJECTED'
  });
  assert.ok(rejectAudit);
  assert.equal(rejectAudit.reason, 'Description needs more detailed curriculum breakdown.');

  const reloadedWorkshop = await Workshop.findById(created._id).lean();
  assert.equal(reloadedWorkshop.rejectionReason, undefined);

  // 3. Re-submit after rejection (REJECTED -> PENDING_APPROVAL)
  const resubmitted = await submitWorkshopForApproval(created._id, coordinatorAuth);
  assert.equal(resubmitted.approvalStatus, 'PENDING_APPROVAL');

  // 4. Approve workshop (PENDING_APPROVAL -> APPROVED)
  const approved = await approveWorkshop(created._id, { comment: 'Curriculum looks great.' }, adminAuth);
  assert.equal(approved.approvalStatus, 'APPROVED');

  // 5. Publish workshop (APPROVED -> Published)
  const published = await publishWorkshop(created._id, coordinatorAuth);
  assert.equal(published.isPublished, true);

  // Duplicate publication rejected
  await assert.rejects(
    async () => publishWorkshop(created._id, coordinatorAuth),
    (err) => {
      assert.equal(err.statusCode, 400);
      assert.equal(err.code, 'ALREADY_PUBLISHED');
      return true;
    }
  );
});

test('4. Published Workshop Immutability - Rejects modification of structural fields', async () => {
  const futureStart = new Date('2026-12-05T09:00:00Z');
  const futureEnd = new Date('2026-12-05T12:00:00Z');

  const created = await createWorkshop(
    {
      title: 'Published Immutability Workshop',
      description: 'Testing that structural fields freeze upon publication.',
      category: 'CAREER_PREP',
      mode: 'ONLINE',
      meetingLink: 'https://meet.google.com/test-published',
      ownershipType: 'DEPARTMENT',
      departmentId: departmentDoc._id,
      startAt: futureStart,
      endAt: futureEnd,
      registrationDeadline: new Date('2026-12-04T18:00:00Z'),
      maxParticipants: 50,
      sessions: [
        {
          sessionId: 'SES-01',
          sessionNumber: 1,
          title: 'Career Prep',
          startAt: futureStart,
          endAt: futureEnd
        }
      ]
    },
    coordinatorAuth
  );

  // Workshop created by coordinator is automatically approved and published
  assert.equal(created.approvalStatus, 'APPROVED');
  assert.equal(created.isPublished, true);

  // Attempting to change ownershipType must be rejected
  await assert.rejects(
    async () =>
      updateWorkshop(
        created._id,
        { ownershipType: 'CENTRAL_PLACEMENT_CELL' },
        adminAuth
      ),
    (err) => {
      assert.equal(err.statusCode, 400);
      assert.equal(err.code, 'IMMUTABLE_FIELD_MODIFICATION');
      return true;
    }
  );

  // Allowed operational field update (e.g. updating description or meeting link)
  const updated = await updateWorkshop(
    created._id,
    { meetingLink: 'https://meet.google.com/new-updated-link' },
    adminAuth
  );
  assert.equal(updated.meetingLink, 'https://meet.google.com/new-updated-link');
});

test('5. cancelWorkshop - Cascades cancellation to active registrations and clears activeRegistrationKey', async () => {
  const futureStart = new Date('2026-12-10T10:00:00Z');
  const futureEnd = new Date('2026-12-10T12:00:00Z');

  const created = await createWorkshop(
    {
      title: 'Cancellation Cascade Workshop',
      description: 'Ensures active registrations are cancelled atomically.',
      category: 'TECHNICAL',
      mode: 'ONLINE',
      meetingLink: 'https://meet.google.com/cancel-test',
      ownershipType: 'DEPARTMENT',
      departmentId: departmentDoc._id,
      startAt: futureStart,
      endAt: futureEnd,
      registrationDeadline: new Date('2026-12-09T18:00:00Z'),
      maxParticipants: 10,
      sessions: [
        {
          sessionId: 'SES-01',
          sessionNumber: 1,
          title: 'Session 1',
          startAt: futureStart,
          endAt: futureEnd
        }
      ]
    },
    coordinatorAuth
  );

  // Create two active registrations
  const student1Id = new mongoose.Types.ObjectId();
  const student2Id = new mongoose.Types.ObjectId();

  await WorkshopRegistration.create([
    {
      registrationId: 'WREG-2026-0001',
      workshopId: created._id,
      studentId: student1Id,
      status: 'REGISTERED',
      registrationSource: 'STUDENT',
      registeredBy: student1Id,
      activeRegistrationKey: 'ACTIVE'
    },
    {
      registrationId: 'WREG-2026-0002',
      workshopId: created._id,
      studentId: student2Id,
      status: 'REGISTERED',
      registrationSource: 'STUDENT',
      registeredBy: student2Id,
      activeRegistrationKey: 'ACTIVE'
    }
  ]);

  // Workshop is preserved with CANCELLED lifecycle status and active registrations are cancelled
  const cancelResult = await cancelWorkshop(
    created._id,
    { reason: 'Trainer unavailable due to unforeseen emergency.' },
    adminAuth
  );

  assert.equal(cancelResult.lifecycleStatus, 'CANCELLED');
  assert.equal(cancelResult.isPublished, false);

  // Workshop document is preserved in database with CANCELLED lifecycle status
  const cancelledWorkshop = await Workshop.findById(created._id);
  assert.ok(cancelledWorkshop);
  assert.equal(cancelledWorkshop.lifecycleStatus, 'CANCELLED');
  assert.equal(cancelledWorkshop.isPublished, false);
  assert.equal(cancelledWorkshop.cancellationReason, 'Trainer unavailable due to unforeseen emergency.');

  // Attempting to republish cancelled workshop must be rejected with 400 CANNOT_PUBLISH_CANCELLED
  await assert.rejects(
    async () => publishWorkshop(created._id, coordinatorAuth),
    (err) => {
      assert.equal(err.statusCode, 400);
      assert.equal(err.code, 'CANNOT_PUBLISH_CANCELLED');
      return true;
    }
  );

  // Both registrations must now be CANCELLED and activeRegistrationKey unset
  const activeCount = await WorkshopRegistration.countDocuments({
    workshopId: created._id,
    activeRegistrationKey: 'ACTIVE'
  });
  assert.equal(activeCount, 0);

  const regDocs = await WorkshopRegistration.find({ workshopId: created._id });
  assert.equal(regDocs.length, 2);
  for (const reg of regDocs) {
    assert.equal(reg.status, 'CANCELLED');
    assert.equal(reg.activeRegistrationKey, undefined);
    assert.ok(reg.cancellationReason.includes('Trainer unavailable'));
  }
});

test('6. deleteWorkshop - Hard deletion rules and audit preservation', async () => {
  const futureStart = new Date('2026-12-15T10:00:00Z');
  const futureEnd = new Date('2026-12-15T12:00:00Z');

  const draftWorkshop = await createWorkshop(
    {
      title: 'Eligible For Deletion Workshop',
      description: 'Testing clean deletion with audit retention.',
      category: 'TECHNICAL',
      mode: 'ONLINE',
      meetingLink: 'https://meet.google.com/delete-test',
      ownershipType: 'DEPARTMENT',
      departmentId: departmentDoc._id,
      startAt: futureStart,
      endAt: futureEnd,
      registrationDeadline: new Date('2026-12-14T18:00:00Z'),
      maxParticipants: 20,
      sessions: [
        {
          sessionId: 'SES-01',
          sessionNumber: 1,
          title: 'Session 1',
          startAt: futureStart,
          endAt: futureEnd
        }
      ],
      approvalStatus: 'DRAFT'
    },
    coordinatorAuth
  );

  const businessId = draftWorkshop.workshopId;

  // 1. Delete eligible workshop
  const delResult = await deleteWorkshop(draftWorkshop._id, coordinatorAuth);
  assert.equal(delResult.success, true);
  assert.equal(delResult.deletedWorkshopId, businessId);

  // Workshop document is removed
  const exists = await Workshop.findById(draftWorkshop._id);
  assert.equal(exists, null);

  // Preserved audit record retains workshop identifier
  const deleteAudit = await WorkshopAuditLog.findOne({
    action: 'WORKSHOP_DELETED',
    entityId: businessId
  });
  assert.ok(deleteAudit);
  assert.equal(deleteAudit.entityId, businessId);

  // 2. Workshop with historical registrations cannot be deleted
  const workshopWithReg = await createWorkshop(
    {
      title: 'Has Regs Workshop',
      description: 'Cannot be deleted because registrations exist.',
      category: 'TECHNICAL',
      mode: 'ONLINE',
      meetingLink: 'https://meet.google.com/has-regs',
      ownershipType: 'DEPARTMENT',
      departmentId: departmentDoc._id,
      startAt: futureStart,
      endAt: futureEnd,
      registrationDeadline: new Date('2026-12-14T18:00:00Z'),
      maxParticipants: 20,
      sessions: [
        {
          sessionId: 'SES-01',
          sessionNumber: 1,
          title: 'Session 1',
          startAt: futureStart,
          endAt: futureEnd
        }
      ],
      approvalStatus: 'DRAFT'
    },
    coordinatorAuth
  );

  // Add historical cancelled registration
  await WorkshopRegistration.create({
    registrationId: 'WREG-2026-9999',
    workshopId: workshopWithReg._id,
    studentId: new mongoose.Types.ObjectId(),
    status: 'CANCELLED',
    registrationSource: 'STUDENT',
    registeredBy: new mongoose.Types.ObjectId(),
    cancelledAt: new Date()
  });

  await assert.rejects(
    async () => deleteWorkshop(workshopWithReg._id, coordinatorAuth),
    (err) => {
      assert.equal(err.statusCode, 400);
      assert.equal(err.code, 'WORKSHOP_HAS_REGISTRATIONS');
      return true;
    }
  );
});

test('7. Scoped Reads & Listing - Access controls for Students and Coordinators', async () => {
  const futureStart = new Date('2026-12-20T10:00:00Z');
  const futureEnd = new Date('2026-12-20T12:00:00Z');

  // Create Draft Workshop
  const draftWs = await createWorkshop(
    {
      title: 'Secret Draft Workshop',
      description: 'Draft workshop not yet visible to students.',
      category: 'TECHNICAL',
      mode: 'ONLINE',
      meetingLink: 'https://meet.google.com/secret',
      ownershipType: 'DEPARTMENT',
      departmentId: departmentDoc._id,
      startAt: futureStart,
      endAt: futureEnd,
      registrationDeadline: new Date('2026-12-19T18:00:00Z'),
      maxParticipants: 30,
      sessions: [
        {
          sessionId: 'SES-01',
          sessionNumber: 1,
          title: 'Session 1',
          startAt: futureStart,
          endAt: futureEnd
        }
      ],
      approvalStatus: 'DRAFT'
    },
    coordinatorAuth
  );

  // Student getWorkshopById on draft workshop throws 404
  await assert.rejects(
    async () => getWorkshopById(draftWs._id, studentAuth),
    (err) => {
      assert.equal(err.statusCode, 404);
      return true;
    }
  );

  // Student listWorkshops does not include draft workshop
  const studentList = await listWorkshops({}, studentAuth);
  assert.equal(studentList.total, 0);

  // Coordinator can view their draft workshop
  const coordView = await getWorkshopById(draftWs._id, coordinatorAuth);
  assert.equal(coordView.title, 'Secret Draft Workshop');

  // Submit, approve, and publish the workshop
  await submitWorkshopForApproval(draftWs._id, coordinatorAuth);
  await approveWorkshop(draftWs._id, {}, adminAuth);
  await publishWorkshop(draftWs._id, coordinatorAuth);

  // Student can now view the published workshop
  const studentListBeforeCancel = await listWorkshops({}, studentAuth);
  assert.equal(studentListBeforeCancel.total, 1);
  const studentView = await getWorkshopById(draftWs._id, studentAuth);
  assert.equal(studentView.title, 'Secret Draft Workshop');

  // Cancel the workshop
  await cancelWorkshop(draftWs._id, { reason: 'Program cancelled by department.' }, adminAuth);

  // Student listWorkshops MUST NOT include the cancelled workshop
  const studentListAfterCancel = await listWorkshops({}, studentAuth);
  assert.equal(studentListAfterCancel.total, 0);

  // Student getWorkshopById on cancelled workshop throws 404
  await assert.rejects(
    async () => getWorkshopById(draftWs._id, studentAuth),
    (err) => {
      assert.equal(err.statusCode, 404);
      return true;
    }
  );
});

test('8. Placement Cell and Head workshops auto-publish without approval, while Company workshops require approval (start in DRAFT)', async () => {
  const futureStart = new Date('2026-12-25T10:00:00Z');
  const futureEnd = new Date('2026-12-25T13:00:00Z');

  // 1. Placement Cell / Head creates Central workshop -> auto-approved and auto-published
  const cellWs = await createWorkshop(
    {
      title: 'Placement Cell Annual Career Summit',
      description: 'Institutional career training created by central placement cell.',
      category: 'CAREER_PREP',
      mode: 'ONLINE',
      meetingLink: 'https://meet.google.com/placement-cell',
      ownershipType: 'CENTRAL_PLACEMENT_CELL',
      startAt: futureStart,
      endAt: futureEnd,
      registrationDeadline: new Date('2026-12-24T18:00:00Z'),
      maxParticipants: 200,
      sessions: [
        {
          sessionId: 'SES-01',
          sessionNumber: 1,
          title: 'Orientation',
          startAt: futureStart,
          endAt: futureEnd
        }
      ]
    },
    adminAuth
  );

  assert.equal(cellWs.approvalStatus, 'APPROVED');
  assert.equal(cellWs.isPublished, true);
  assert.equal(cellWs.lifecycleStatus, 'SCHEDULED');

  const cellPublishAudit = await WorkshopAuditLog.findOne({
    entityId: cellWs.workshopId,
    action: 'WORKSHOP_PUBLISHED'
  });
  assert.ok(cellPublishAudit);

  // 2. Company creates workshop -> starts in DRAFT and isPublished is false (strictly requires approval)
  const companyDoc = await Company.create({
    companyId: 'COMP-TEST-AUTO',
    companyName: 'Tech Innovators Corp',
    industryType: 'IT',
    hrRecruiterName: 'John Doe',
    email: 'john@techinnovators.com',
    yearEstablished: 2018
  });

  const companyUserId = new mongoose.Types.ObjectId();
  await User.create({
    _id: companyUserId,
    email: 'john@techinnovators.com',
    passwordHash: 'hashed',
    userType: 'COMPANY',
    roleId: ROLE_IDS.COMPANY,
    companyId: companyDoc._id,
    accountStatus: 'ACTIVE'
  });

  const companyAuth = {
    userId: companyUserId,
    roleId: ROLE_IDS.COMPANY,
    userType: 'COMPANY',
    companyId: companyDoc._id
  };

  const companyWs = await createWorkshop(
    {
      title: 'Company Innovation Workshop',
      description: 'Technical masterclass proposed by external corporate partner.',
      category: 'TECHNICAL',
      mode: 'ONLINE',
      meetingLink: 'https://meet.google.com/innovators',
      startAt: futureStart,
      endAt: futureEnd,
      registrationDeadline: new Date('2026-12-24T18:00:00Z'),
      maxParticipants: 50,
      trainers: [
        {
          trainerType: 'COMPANY',
          companyId: String(companyDoc._id),
          name: 'Chief Scientist',
          designation: 'VP of AI'
        }
      ],
      sessions: [
        {
          sessionId: 'SES-01',
          sessionNumber: 1,
          title: 'AI in Enterprise',
          startAt: futureStart,
          endAt: futureEnd
        }
      ]
    },
    companyAuth
  );

  // Company workshop strictly requires approval
  assert.equal(companyWs.approvalStatus, 'DRAFT');
  assert.equal(companyWs.isPublished, false);
  assert.equal(companyWs.lifecycleStatus, 'SCHEDULED');

  // Verify no auto-publish audit log for company workshop
  const companyPublishAudit = await WorkshopAuditLog.findOne({
    entityId: companyWs.workshopId,
    action: 'WORKSHOP_PUBLISHED'
  });
  assert.equal(companyPublishAudit, null);
});

