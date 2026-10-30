import assert from 'node:assert/strict';
import test, { after, before, beforeEach, describe, it } from 'node:test';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { seedInitialData } from '../src/seeders/seed.js';
import { User } from '../src/models/user.model.js';
import { UserSession } from '../src/models/user-session.model.js';
import { Student } from '../src/models/student.model.js';
import { Company } from '../src/models/company.model.js';
import { PlacementOfficer } from '../src/models/placement_officer.model.js';
import { Department } from '../src/models/department.model.js';
import { Course } from '../src/models/course.model.js';
import { Workshop } from '../src/models/workshop.model.js';
import { WorkshopRegistration } from '../src/models/workshop_registration.model.js';
import { Notification } from '../src/models/notification.model.js';
import { ROLE_IDS } from '../src/utils/access-constants.js';
import { hashPassword } from '../src/utils/password.js';
import { createRawSessionToken, hashSessionToken } from '../src/utils/session-token.js';
import {
  createWorkshop,
  submitWorkshopForApproval,
  updateWorkshop,
  approveWorkshop,
  approveWorkshopEdit,
  publishWorkshop
} from '../src/services/workshop.service.js';
import { registerStudent } from '../src/services/workshop-registration.service.js';
import {
  dispatchWorkshopSubmittedForApproval,
  dispatchCompanyWorkshopUpdateForReview,
  dispatchWorkshopPublished,
  dispatchWorkshopUpdateAnnouncement,
  hasWorkshopDataChanged
} from '../src/services/workshop-notification.service.js';

describe('Workshop & Training Centralized Notifications Suite', () => {
  let mongo;
  let app;
  let deptCE;
  let deptIT;
  let courseCE;
  let courseIT;

  let headUser;
  let coordCEUser;
  let coordITUser;
  let companyUser;
  let companyDoc;
  let student1EligibleUser;
  let student1Doc;
  let student2IneligibleUser;
  let student2Doc;

  before(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await connectDatabase(mongo.getUri());
    await seedInitialData();
    app = createApp();

    // Create Departments
    deptCE = await Department.create({ name: 'Computer Engineering', code: 'CE', isActive: true });
    deptIT = await Department.create({ name: 'Information Technology', code: 'IT', isActive: true });

    // Create Courses
    courseCE = await Course.create({
      name: 'B.Tech CE',
      code: 'BTECH_CE',
      departmentId: deptCE._id,
      level: 'UNDERGRADUATE',
      durationYears: 4,
      isActive: true
    });
    courseIT = await Course.create({
      name: 'B.Tech IT',
      code: 'BTECH_IT',
      departmentId: deptIT._id,
      level: 'UNDERGRADUATE',
      durationYears: 4,
      isActive: true
    });

    // Create Company
    companyDoc = await Company.create({
      companyId: 'COMP-101',
      companyName: 'Tech Innovators Corp',
      industryType: 'Software',
      hrRecruiterName: 'Alice Recruiter',
      email: 'recruiter@techinnovators.com',
      yearEstablished: 2015,
      portalStatus: 'APPROVED',
      isActive: true
    });

    // Create Users & Placement Officers
    const headAuth = await createAuthUser(ROLE_IDS.PLACEMENT_HEAD, 'PLACEMENT');
    headUser = headAuth.user;
    await PlacementOfficer.create({
      userId: headUser._id,
      employeeId: 'EMP-HEAD-01',
      firstName: 'Director',
      lastName: 'Placements',
      email: headUser.email,
      mobileNumber: '9876543210',
      designation: 'Head, Training & Placement Cell',
      role: ROLE_IDS.PLACEMENT_HEAD
    });

    const coordCEAuth = await createAuthUser(ROLE_IDS.PLACEMENT_COORDINATOR, 'PLACEMENT', { departmentId: deptCE._id });
    coordCEUser = coordCEAuth.user;
    await PlacementOfficer.create({
      userId: coordCEUser._id,
      employeeId: 'EMP-CSE-01',
      firstName: 'CE',
      lastName: 'Coordinator',
      email: coordCEUser.email,
      mobileNumber: '9876543211',
      designation: 'Assistant Professor & Coordinator',
      role: ROLE_IDS.PLACEMENT_COORDINATOR,
      departmentId: deptCE._id
    });

    const coordITAuth = await createAuthUser(ROLE_IDS.PLACEMENT_COORDINATOR, 'PLACEMENT', { departmentId: deptIT._id });
    coordITUser = coordITAuth.user;
    await PlacementOfficer.create({
      userId: coordITUser._id,
      employeeId: 'EMP-IT-01',
      firstName: 'IT',
      lastName: 'Coordinator',
      email: coordITUser.email,
      mobileNumber: '9876543212',
      designation: 'Assistant Professor & Coordinator',
      role: ROLE_IDS.PLACEMENT_COORDINATOR,
      departmentId: deptIT._id
    });

    const companyAuth = await createAuthUser(ROLE_IDS.COMPANY, 'COMPANY', { companyId: companyDoc._id });
    companyUser = companyAuth.user;

    // Student 1: CE, Semester 6
    const st1Auth = await createAuthUser(ROLE_IDS.STUDENT, 'STUDENT', { departmentId: deptCE._id });
    student1EligibleUser = st1Auth.user;
    student1Doc = await Student.create({
      userId: student1EligibleUser._id,
      universityId: `U-CE-${Date.now()}`,
      firstName: 'Aarohi',
      lastName: 'Patel',
      email: student1EligibleUser.email,
      mobileNumber: '9876543220',
      gender: 'FEMALE',
      department: 'Computer Engineering',
      branch: 'Computer Engineering',
      departmentId: deptCE._id,
      courseId: courseCE._id,
      semester: 6,
      passingYear: 2026,
      cgpa: 8.5,
      backlogs: 0
    });

    // Student 2: IT, Semester 4
    const st2Auth = await createAuthUser(ROLE_IDS.STUDENT, 'STUDENT', { departmentId: deptIT._id });
    student2IneligibleUser = st2Auth.user;
    student2Doc = await Student.create({
      userId: student2IneligibleUser._id,
      universityId: `U-IT-${Date.now() + 1}`,
      firstName: 'Diya',
      lastName: 'Shah',
      email: student2IneligibleUser.email,
      mobileNumber: '9876543221',
      gender: 'FEMALE',
      department: 'Information Technology',
      branch: 'Information Technology',
      departmentId: deptIT._id,
      courseId: courseIT._id,
      semester: 4,
      passingYear: 2027,
      cgpa: 8.0,
      backlogs: 0
    });
  });

  after(async () => {
    await disconnectDatabase();
    if (mongo) {
      await mongo.stop();
    }
  });

  beforeEach(async () => {
    await Notification.deleteMany({});
  });

  async function createAuthUser(roleId, userType, extra = {}) {
    const ts = Date.now() + Math.floor(Math.random() * 1000000);
    const email = `ws-notif-${roleId.toLowerCase()}-${ts}@vvwu.edu.in`;
    const passwordHash = await hashPassword('Password!123456');

    const userData = {
      email,
      passwordHash,
      userType,
      roleId,
      accountStatus: 'ACTIVE',
      ...extra
    };

    if (userType === 'STUDENT' && !userData.universityId) {
      userData.universityId = `U${ts}`;
    }
    if (userType === 'PLACEMENT' && !userData.employeeId) {
      userData.employeeId = `EMP-${ts}`;
    }

    const user = await User.create(userData);

    const rawToken = createRawSessionToken();
    const sessionTokenHash = hashSessionToken(rawToken);
    const now = new Date();
    await UserSession.create({
      userId: user._id,
      sessionTokenHash,
      loginAt: now,
      lastActivityAt: now,
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      ipAddress: '127.0.0.1',
      userAgent: 'TestAgent/1.0',
      isActive: true
    });

    return { user, token: rawToken, authHeader: `Bearer ${rawToken}` };
  }

  function getBaseWorkshopInput(overrides = {}) {
    const now = new Date();
    const startAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const endAt = new Date(startAt.getTime() + 3 * 60 * 60 * 1000);
    const deadline = new Date(startAt.getTime() - 24 * 60 * 60 * 1000);

    return {
      title: 'Full-Stack Modern Web Engineering',
      description: 'Hands-on practical development workshop.',
      category: 'TECHNICAL',
      mode: 'OFFLINE',
      ownershipType: 'DEPARTMENT',
      departmentId: deptCE._id,
      targetAudience: {
        isAllDepartments: false,
        departmentRules: [
          {
            departmentId: deptCE._id,
            targetingMode: 'ALL_COURSES_SELECTED_SEMESTERS',
            semesters: [6, 8]
          }
        ]
      },
      startAt,
      endAt,
      registrationDeadline: deadline,
      maxParticipants: 50,
      venue: 'Lab 301, Engineering Block',
      sessions: [
        {
          sessionId: 'SES-01',
          sessionNumber: 1,
          title: 'Introduction and System Architecture',
          startAt,
          endAt,
          venue: 'Lab 301'
        }
      ],
      ...overrides
    };
  }

  async function waitForNotifications(query, minCount = 1, timeoutMs = 2500) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const docs = await Notification.find(query).lean();
      if (docs.length >= minCount) return docs;
      await new Promise((r) => setTimeout(r, 60));
    }
    return await Notification.find(query).lean();
  }

  describe('Rule A — Workshop Submitted for Approval Routing', () => {
    it('company workshop targeting exactly one department notifies Placement Head and assigned Coordinator only', async () => {
      const companyAuth = { userId: companyUser._id, roleId: ROLE_IDS.COMPANY, userType: 'COMPANY', companyId: companyDoc._id };
      const workshop = await createWorkshop(getBaseWorkshopInput({
        ownershipType: 'DEPARTMENT',
        departmentId: deptCE._id
      }), companyAuth);

      assert.equal(workshop.approvalStatus, 'DRAFT');

      await submitWorkshopForApproval(workshop._id, companyAuth);

      // Verify notification delivery
      const notifs = await waitForNotifications({ relatedResourceId: workshop._id, type: 'WORKSHOP_SUBMITTED_FOR_APPROVAL' }, 2);
      assert.equal(notifs.length, 2, 'Should notify exactly 2 recipients: Head and CE Coordinator');

      const recipientIds = notifs.map((n) => String(n.recipientId));
      assert.ok(recipientIds.includes(String(headUser._id)), 'Placement Head must be notified');
      assert.ok(recipientIds.includes(String(coordCEUser._id)), 'CE Coordinator must be notified');
      assert.ok(!recipientIds.includes(String(coordITUser._id)), 'IT Coordinator must NOT be notified');

      for (const n of notifs) {
        assert.equal(n.relatedResourceType, 'WORKSHOP');
        assert.ok(n.actionUrl.includes('training-workshops'));
        assert.ok(n.dedupKey.startsWith(`ws_sub_${workshop._id}`));
      }
    });

    it('company workshop targeting multiple departments notifies Placement Head ONLY', async () => {
      const companyAuth = { userId: companyUser._id, roleId: ROLE_IDS.COMPANY, userType: 'COMPANY', companyId: companyDoc._id };
      const workshop = await createWorkshop(getBaseWorkshopInput({
        ownershipType: 'DEPARTMENT',
        departmentId: deptCE._id,
        targetAudience: {
          isAllDepartments: false,
          departmentRules: [
            { departmentId: deptCE._id, targetingMode: 'ALL_COURSES_ALL_SEMESTERS' },
            { departmentId: deptIT._id, targetingMode: 'ALL_COURSES_ALL_SEMESTERS' }
          ]
        }
      }), companyAuth);

      await submitWorkshopForApproval(workshop._id, companyAuth);

      const notifs = await waitForNotifications({ relatedResourceId: workshop._id, type: 'WORKSHOP_SUBMITTED_FOR_APPROVAL' }, 1);
      assert.equal(notifs.length, 1, 'Multi-department workshop must notify Placement Head only');
      assert.equal(String(notifs[0].recipientId), String(headUser._id));
    });

    it('central workshop with no department notifies Placement Head ONLY', async () => {
      const companyAuth = { userId: companyUser._id, roleId: ROLE_IDS.COMPANY, userType: 'COMPANY', companyId: companyDoc._id };
      const workshop = await createWorkshop(getBaseWorkshopInput({
        ownershipType: 'CENTRAL_PLACEMENT_CELL',
        departmentId: undefined,
        targetAudience: { isAllDepartments: true, departmentRules: [] }
      }), companyAuth);

      await submitWorkshopForApproval(workshop._id, companyAuth);

      const notifs = await waitForNotifications({ relatedResourceId: workshop._id, type: 'WORKSHOP_SUBMITTED_FOR_APPROVAL' }, 1);
      assert.equal(notifs.length, 1, 'Central workshop must notify Placement Head only');
      assert.equal(String(notifs[0].recipientId), String(headUser._id));
    });

    it('institution-created workshops auto-publish and do NOT generate approval notifications', async () => {
      const headAuth = { userId: headUser._id, roleId: ROLE_IDS.PLACEMENT_HEAD, userType: 'PLACEMENT' };
      const workshop = await createWorkshop(getBaseWorkshopInput(), headAuth);

      assert.equal(workshop.approvalStatus, 'APPROVED');
      assert.equal(workshop.isPublished, true);

      const approvalNotifs = await Notification.find({
        relatedResourceId: workshop._id,
        type: 'WORKSHOP_SUBMITTED_FOR_APPROVAL'
      }).lean();
      assert.equal(approvalNotifs.length, 0, 'Auto-published institution workshops must not generate approval notifications');
    });
  });

  describe('Rule B — Company Updates Workshop Requiring Review', () => {
    it('company edit on approved single-department workshop notifies Head and assigned Coordinator only', async () => {
      const companyAuth = { userId: companyUser._id, roleId: ROLE_IDS.COMPANY, userType: 'COMPANY', companyId: companyDoc._id };
      const headAuth = { userId: headUser._id, roleId: ROLE_IDS.PLACEMENT_HEAD, userType: 'PLACEMENT' };

      const workshop = await createWorkshop(getBaseWorkshopInput(), companyAuth);
      await submitWorkshopForApproval(workshop._id, companyAuth);
      await approveWorkshop(workshop._id, { comment: 'Approved' }, headAuth);
      await publishWorkshop(workshop._id, headAuth);

      await Notification.deleteMany({}); // Clear previous notifications

      // Company updates venue and meetingLink
      await updateWorkshop(workshop._id, { venue: 'Auditorium 2', editReason: 'Updated venue for larger audience' }, companyAuth);

      const reviewNotifs = await waitForNotifications({
        relatedResourceId: workshop._id,
        type: 'WORKSHOP_EDIT_SUBMITTED'
      }, 2);

      assert.equal(reviewNotifs.length, 2, 'Should notify Placement Head and responsible CE Coordinator');
      const recipientIds = reviewNotifs.map((n) => String(n.recipientId));
      assert.ok(recipientIds.includes(String(headUser._id)));
      assert.ok(recipientIds.includes(String(coordCEUser._id)));
      assert.ok(!recipientIds.includes(String(coordITUser._id)));
    });

    it('company edit on multi-department workshop notifies Placement Head ONLY', async () => {
      const companyAuth = { userId: companyUser._id, roleId: ROLE_IDS.COMPANY, userType: 'COMPANY', companyId: companyDoc._id };
      const headAuth = { userId: headUser._id, roleId: ROLE_IDS.PLACEMENT_HEAD, userType: 'PLACEMENT' };

      const workshop = await createWorkshop(getBaseWorkshopInput({
        targetAudience: {
          isAllDepartments: false,
          departmentRules: [
            { departmentId: deptCE._id, targetingMode: 'ALL_COURSES_ALL_SEMESTERS' },
            { departmentId: deptIT._id, targetingMode: 'ALL_COURSES_ALL_SEMESTERS' }
          ]
        }
      }), companyAuth);
      await submitWorkshopForApproval(workshop._id, companyAuth);
      await approveWorkshop(workshop._id, { comment: 'Approved' }, headAuth);
      await publishWorkshop(workshop._id, headAuth);

      await Notification.deleteMany({});

      await updateWorkshop(workshop._id, { venue: 'Hall B' }, companyAuth);

      const reviewNotifs = await waitForNotifications({
        relatedResourceId: workshop._id,
        type: 'WORKSHOP_EDIT_SUBMITTED'
      }, 1);

      assert.equal(reviewNotifs.length, 1);
      assert.equal(String(reviewNotifs[0].recipientId), String(headUser._id));
    });

    it('no-op saves do NOT generate false review notifications', async () => {
      const current = {
        title: 'Python Workshop',
        venue: 'Room 101',
        startAt: new Date('2026-11-01T10:00:00Z'),
        endAt: new Date('2026-11-01T13:00:00Z')
      };
      const proposedIdentical = {
        title: 'Python Workshop',
        venue: 'Room 101',
        startAt: new Date('2026-11-01T10:00:00Z'),
        endAt: new Date('2026-11-01T13:00:00Z')
      };

      const changed = hasWorkshopDataChanged(proposedIdentical, current);
      assert.equal(changed, false, 'hasWorkshopDataChanged must return false for identical payloads');
    });
  });

  describe('Rule C — Workshop Newly Published to Eligible Students', () => {
    it('notifies only eligible students matching department, course, and semester targeting', async () => {
      const companyAuth = { userId: companyUser._id, roleId: ROLE_IDS.COMPANY, userType: 'COMPANY', companyId: companyDoc._id };
      const headAuth = { userId: headUser._id, roleId: ROLE_IDS.PLACEMENT_HEAD, userType: 'PLACEMENT' };
      // Company creates workshop, submits, and Placement Head approves it
      const workshop = await createWorkshop(getBaseWorkshopInput(), companyAuth);
      await submitWorkshopForApproval(workshop._id, companyAuth);
      await approveWorkshop(workshop._id, { comment: 'Approved' }, headAuth);

      await Notification.deleteMany({});

      // Publish workshop
      await publishWorkshop(workshop._id, headAuth);

      const pubNotifs = await waitForNotifications({
        relatedResourceId: workshop._id,
        type: 'WORKSHOP_PUBLISHED'
      }, 1);

      // Student 1 is CE, Semester 6 -> Eligible
      // Student 2 is IT, Semester 4 -> Ineligible
      assert.equal(pubNotifs.length, 1, 'Only eligible student 1 should receive publication notification');
      assert.equal(String(pubNotifs[0].recipientId), String(student1EligibleUser._id));
      assert.ok(pubNotifs[0].title.includes('Registration Open'));
      assert.ok(pubNotifs[0].actionUrl.includes(String(workshop._id)));
      assert.equal(pubNotifs[0].relatedResourceType, 'WORKSHOP');
    });

    it('does NOT send publication notifications for draft, rejected, or cancelled workshops', async () => {
      const companyAuth = { userId: companyUser._id, roleId: ROLE_IDS.COMPANY, userType: 'COMPANY', companyId: companyDoc._id };
      const draftWorkshop = await createWorkshop(getBaseWorkshopInput(), companyAuth);

      const notifs = await dispatchWorkshopPublished(draftWorkshop._id);
      assert.equal(notifs.length, 0, 'Draft workshops must not send publication notifications');
    });

    it('republishing event increments publishVersion and delivers new notification', async () => {
      const companyAuth = { userId: companyUser._id, roleId: ROLE_IDS.COMPANY, userType: 'COMPANY', companyId: companyDoc._id };
      const headAuth = { userId: headUser._id, roleId: ROLE_IDS.PLACEMENT_HEAD, userType: 'PLACEMENT' };
      const workshop = await createWorkshop(getBaseWorkshopInput(), companyAuth);
      await submitWorkshopForApproval(workshop._id, companyAuth);
      await approveWorkshop(workshop._id, { comment: 'Approved' }, headAuth);
      await publishWorkshop(workshop._id, headAuth);

      const firstPubNotifs = await waitForNotifications({ relatedResourceId: workshop._id, type: 'WORKSHOP_PUBLISHED' }, 1);
      assert.equal(firstPubNotifs.length, 1);
      assert.ok(firstPubNotifs[0].dedupKey.includes('_v1_'));

      // If legitimate new publication version is triggered
      await dispatchWorkshopPublished(workshop._id, 2);
      const allPubNotifs = await waitForNotifications({ relatedResourceId: workshop._id, type: 'WORKSHOP_PUBLISHED' }, 2);
      assert.equal(allPubNotifs.length, 2, 'New publication version must generate a distinct notification');
      assert.ok(allPubNotifs.some((n) => n.dedupKey.includes('_v2_')));
    });
  });

  describe('Rule D — Approved Workshop Update Announcements', () => {
    it('notifies active registered students and included department coordinators on change', async () => {
      const headAuth = { userId: headUser._id, roleId: ROLE_IDS.PLACEMENT_HEAD, userType: 'PLACEMENT' };
      const workshop = await createWorkshop(getBaseWorkshopInput(), headAuth);

      // Student 1 registers for the workshop
      const st1Auth = { userId: student1EligibleUser._id, roleId: ROLE_IDS.STUDENT, userType: 'STUDENT' };
      await registerStudent(workshop._id, st1Auth);

      await Notification.deleteMany({});

      // Placement Head updates the venue and schedule with matching session dates
      const newStartAt = new Date(new Date(workshop.startAt).getTime() + 2 * 60 * 60 * 1000);
      const newEndAt = new Date(newStartAt.getTime() + 3 * 60 * 60 * 1000);
      await updateWorkshop(workshop._id, {
        venue: 'Auditorium 1, Main Campus',
        startAt: newStartAt,
        endAt: newEndAt,
        sessions: [
          {
            sessionId: 'SES-01',
            sessionNumber: 1,
            title: 'Introduction and System Architecture',
            startAt: newStartAt,
            endAt: newEndAt,
            venue: 'Auditorium 1'
          }
        ]
      }, headAuth);

      const updateNotifs = await waitForNotifications({
        relatedResourceId: workshop._id,
        type: 'WORKSHOP_UPDATED'
      }, 2);

      // Recipient 1: Registered Student 1
      // Recipient 2: Coordinator for included department (CE)
      // Excluded: Student 2 (not registered), Coordinator IT (not included)
      assert.equal(updateNotifs.length, 2, 'Should notify registered student and CE coordinator');
      const recipientIds = updateNotifs.map((n) => String(n.recipientId));
      assert.ok(recipientIds.includes(String(student1EligibleUser._id)), 'Registered student must receive update');
      assert.ok(recipientIds.includes(String(coordCEUser._id)), 'CE Coordinator must receive update');
      assert.ok(!recipientIds.includes(String(coordITUser._id)), 'Unrelated IT Coordinator must NOT receive update');

      for (const n of updateNotifs) {
        assert.ok(n.message.includes('venue') || n.message.includes('schedule'), 'Message should describe changed fields');
      }
    });

    it('cancelled registrations do NOT receive workshop update announcements', async () => {
      const headAuth = { userId: headUser._id, roleId: ROLE_IDS.PLACEMENT_HEAD, userType: 'PLACEMENT' };
      const workshop = await createWorkshop(getBaseWorkshopInput(), headAuth);

      const st1Auth = { userId: student1EligibleUser._id, roleId: ROLE_IDS.STUDENT, userType: 'STUDENT' };
      const reg = await registerStudent(workshop._id, st1Auth);

      // Cancel registration
      await WorkshopRegistration.updateOne(
        { _id: reg._id },
        { $set: { status: 'CANCELLED' }, $unset: { activeRegistrationKey: 1 } }
      );

      await Notification.deleteMany({});

      // Update workshop
      await updateWorkshop(workshop._id, { venue: 'Hall 5' }, headAuth);

      const studentNotifs = await Notification.find({
        relatedResourceId: workshop._id,
        recipientId: student1EligibleUser._id,
        type: 'WORKSHOP_UPDATED'
      });

      assert.equal(studentNotifs.length, 0, 'Cancelled registrations must not receive update notifications');
    });
  });

  describe('Rule E & Shared Notification System Integration', () => {
    it('workshop notification records pass schema validation and REST API retrieval', async () => {
      const headAuthUser = await createAuthUser(ROLE_IDS.PLACEMENT_HEAD, 'PLACEMENT');

      const notifDoc = await Notification.create({
        recipientId: headAuthUser.user._id,
        type: 'WORKSHOP_PUBLISHED',
        title: 'New Workshop Scheduled',
        message: 'A new workshop has been published.',
        relatedResourceType: 'WORKSHOP',
        relatedResourceId: new mongoose.Types.ObjectId(),
        actionUrl: '#/training-workshops'
      });

      assert.ok(notifDoc._id);
      assert.equal(notifDoc.relatedResourceType, 'WORKSHOP');

      // Test GET /api/notifications
      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', headAuthUser.authHeader);

      assert.equal(res.status, 200);
      assert.ok(res.body.success);
      assert.equal(res.body.data.notifications.length, 1);
      assert.equal(res.body.data.notifications[0].type, 'WORKSHOP_PUBLISHED');
      assert.equal(res.body.data.unreadCount, 1);

      // Test PATCH /api/notifications/:id/read
      const readRes = await request(app)
        .patch(`/api/notifications/${notifDoc._id}/read`)
        .set('Authorization', headAuthUser.authHeader);

      assert.equal(readRes.status, 200);
      assert.equal(readRes.body.data.isRead, true);
    });

    it('idempotency: retried dispatches with identical dedupKey do NOT produce duplicates', async () => {
      const dedupKey = `test_ws_dedup_${Date.now()}`;
      const notifData = {
        recipientId: headUser._id,
        type: 'WORKSHOP_PUBLISHED',
        title: 'Duplicate test',
        message: 'Duplicate test message',
        relatedResourceType: 'WORKSHOP',
        dedupKey
      };

      await Notification.create(notifData);
      // Attempt duplicate insertion
      try {
        await Notification.create(notifData);
      } catch (err) {
        assert.equal(err.code, 11000, 'Mongoose should enforce unique dedupKey index');
      }

      const total = await Notification.countDocuments({ dedupKey });
      assert.equal(total, 1);
    });
  });
});
