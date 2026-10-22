import assert from 'node:assert/strict';
import test, { after, before, beforeEach, describe, it } from 'node:test';
import { MongoMemoryServer } from 'mongodb-memory-server';
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
import { Job } from '../src/models/job.model.js';
import { Application } from '../src/models/application.model.js';
import { Notification } from '../src/models/notification.model.js';
import { ROLE_IDS } from '../src/utils/access-constants.js';
import { hashPassword } from '../src/utils/password.js';
import { createRawSessionToken, hashSessionToken } from '../src/utils/session-token.js';
import {
  createNotification,
  createNotificationsBatch,
  getUserNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  dispatchJobPublishedNotifications,
  dispatchJobReopenedNotifications,
  dispatchJobStatusChangedNotifications,
  dispatchApplicationReceivedNotification,
  dispatchApplicationStatusChangedNotification,
  dispatchApplicationWithdrawnNotification
} from '../src/services/notification.service.js';

describe('Centralized Notification System Verification Suite', () => {
  let mongo;
  let app;
  let deptDoc;
  let courseDoc;

  before(async () => {
    mongo = await MongoMemoryServer.create();
    await connectDatabase(mongo.getUri());
    await seedInitialData();
    app = createApp();

    deptDoc = await Department.create({
      name: 'Computer Engineering',
      code: 'CE',
      isActive: true
    });

    courseDoc = await Course.create({
      name: 'Bachelor of Technology in Computer Engineering',
      code: 'BTECH_CE',
      departmentId: deptDoc._id,
      level: 'UNDERGRADUATE',
      durationYears: 4,
      isActive: true
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
    const email = `notif-${roleId.toLowerCase()}-${ts}@vvwu.edu.in`;
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
    if (userType === 'COMPANY' && !userData.companyId) {
      userData.companyId = new mongoose.Types.ObjectId();
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

  describe('1. Model Persistence & Deduplication', () => {
    it('creates notification with all required and optional indexed fields', async () => {
      const recipientId = new mongoose.Types.ObjectId();
      const notif = await createNotification({
        recipientId,
        type: 'JOB_PUBLISHED',
        title: 'New Job Opening',
        message: 'Google is hiring Software Engineers.',
        relatedResourceType: 'JOB',
        relatedResourceId: new mongoose.Types.ObjectId(),
        actionUrl: '#/job-postings',
        dedupKey: `dedup_${Date.now()}_1`
      });

      assert.ok(notif._id);
      assert.equal(notif.isRead, false);
      assert.equal(notif.readAt, null);
      assert.equal(notif.title, 'New Job Opening');
      assert.equal(notif.type, 'JOB_PUBLISHED');
      assert.equal(notif.relatedResourceType, 'JOB');
    });

    it('safely handles duplicate dedupKey without throwing errors (idempotency)', async () => {
      const recipientId = new mongoose.Types.ObjectId();
      const dedupKey = `idempotent_key_${Date.now()}`;

      const first = await createNotification({
        recipientId,
        type: 'JOB_PUBLISHED',
        title: 'Job 1',
        message: 'First attempt',
        dedupKey
      });
      assert.ok(first);

      // Attempt second creation with identical dedupKey
      const second = await createNotification({
        recipientId,
        type: 'JOB_PUBLISHED',
        title: 'Job 1 Duplicate',
        message: 'Second attempt',
        dedupKey
      });

      assert.equal(second, null, 'Duplicate dedupKey should be safely caught and return null');

      const count = await Notification.countDocuments({ dedupKey });
      assert.equal(count, 1, 'Only one record should exist with the dedupKey');
    });
  });

  describe('2. Recipient Isolation & Service Queries', () => {
    it('isolates notifications per recipient user', async () => {
      const userA = new mongoose.Types.ObjectId();
      const userB = new mongoose.Types.ObjectId();

      await createNotification({ recipientId: userA, title: 'Notice A1', message: 'For A' });
      await createNotification({ recipientId: userA, title: 'Notice A2', message: 'For A' });
      await createNotification({ recipientId: userB, title: 'Notice B1', message: 'For B' });

      const notifsA = await getUserNotifications({ userId: userA });
      const notifsB = await getUserNotifications({ userId: userB });

      assert.equal(notifsA.notifications.length, 2);
      assert.equal(notifsA.unreadCount, 2);
      assert.equal(notifsB.notifications.length, 1);
      assert.equal(notifsB.unreadCount, 1);
    });

    it('filters unreadOnly correctly and marks single/all notifications as read', async () => {
      const userId = new mongoose.Types.ObjectId();

      const n1 = await createNotification({ recipientId: userId, title: 'N1', message: 'M1' });
      const n2 = await createNotification({ recipientId: userId, title: 'N2', message: 'M2' });

      // Mark n1 as read
      const updatedN1 = await markAsRead({ userId, notificationId: n1._id });
      assert.equal(updatedN1.isRead, true);
      assert.ok(updatedN1.readAt);

      // Verify unread count is now 1
      const countRes = await getUnreadCount(userId);
      assert.equal(countRes.unreadCount, 1);

      // Verify unreadOnly filter returns only n2
      const unreadList = await getUserNotifications({ userId, unreadOnly: true });
      assert.equal(unreadList.notifications.length, 1);
      assert.equal(unreadList.notifications[0]._id.toString(), n2._id.toString());

      // Mark all as read
      await markAllAsRead(userId);
      const postAll = await getUnreadCount(userId);
      assert.equal(postAll.unreadCount, 0);
    });

    it('forbids marking another recipient notification as read', async () => {
      const userA = new mongoose.Types.ObjectId();
      const userB = new mongoose.Types.ObjectId();

      const notifA = await createNotification({ recipientId: userA, title: 'For A', message: 'Msg' });

      await assert.rejects(
        async () => {
          await markAsRead({ userId: userB, notificationId: notifA._id });
        },
        (err) => err.statusCode === 404
      );
    });
  });

  describe('3. Business Event Notification Dispatches', () => {
    it('dispatches job published notifications to placement officers and eligible students', async () => {
      // Create student
      const studentUser = await createAuthUser(ROLE_IDS.STUDENT, 'STUDENT');
      const student = await Student.create({
        userId: studentUser.user._id,
        universityId: `U${Date.now()}`,
        firstName: 'Aarohi',
        lastName: 'Patel',
        email: studentUser.user.email,
        mobileNumber: '9876543210',
        gender: 'FEMALE',
        department: 'Computer Engineering',
        branch: 'Computer Engineering',
        semester: 7,
        departmentId: deptDoc._id,
        courseId: courseDoc._id,
        passingYear: 2026,
        cgpa: 8.5,
        backlogs: 0,
        resume: { url: 'https://example.com/resume.pdf', fileName: 'resume.pdf', fileSize: 1024 }
      });

      // Create placement head officer
      const headUser = await createAuthUser(ROLE_IDS.PLACEMENT_HEAD, 'PLACEMENT');
      await PlacementOfficer.create({
        userId: headUser.user._id,
        employeeId: `EMP-${Date.now()}`,
        firstName: 'Placement',
        lastName: 'Head',
        email: headUser.user.email,
        mobileNumber: '9988776655',
        designation: 'Head Placements',
        role: ROLE_IDS.PLACEMENT_HEAD
      });

      const company = await Company.create({
        companyName: `Infosys Technologies ${Date.now()}`,
        companyId: `CMP-${Date.now()}`,
        industryType: 'Information Technology',
        yearEstablished: 1981,
        hrRecruiterName: 'Sudha Murty',
        email: `recruiter-${Date.now()}@infosys.com`,
        mobileNumber: '9876543210',
        officeAddress: 'Infocity, Surat, Gujarat 395007'
      });

      const mockJob = {
        _id: new mongoose.Types.ObjectId(),
        companyId: company._id,
        title: 'Software Developer',
        deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        eligibilityMode: 'ALL_STUDENTS',
        eligibilityCriteria: {}
      };

      await dispatchJobPublishedNotifications(mockJob);

      // Check student notification
      const studentNotifs = await Notification.find({ recipientId: studentUser.user._id });
      assert.ok(studentNotifs.length >= 1);
      assert.equal(studentNotifs[0].type, 'JOB_PUBLISHED');
      assert.ok(studentNotifs[0].message.includes('Infosys Technologies'));

      // Check head officer notification
      const headNotifs = await Notification.find({ recipientId: headUser.user._id });
      assert.ok(headNotifs.length >= 1);
      assert.equal(headNotifs[0].type, 'JOB_PUBLISHED');
    });

    it('dispatches application received notifications to company recruiters', async () => {
      const company = await Company.create({
        companyName: `TCS Innovation Labs ${Date.now()}`,
        companyId: `CMP-${Date.now()}`,
        industryType: 'Information Technology',
        yearEstablished: 1968,
        hrRecruiterName: 'Ratan Tata',
        email: `tcs-recruiter-${Date.now()}@tcs.com`,
        mobileNumber: '9876543211',
        officeAddress: 'TCS Banyan Park, Mumbai, Maharashtra 400001'
      });

      const recruiterUser = await createAuthUser(ROLE_IDS.COMPANY, 'COMPANY', {
        companyId: company._id
      });

      const mockStudent = {
        _id: new mongoose.Types.ObjectId(),
        firstName: 'Priya',
        lastName: 'Shah'
      };

      const mockJob = {
        _id: new mongoose.Types.ObjectId(),
        companyId: company._id,
        title: 'Full Stack Engineer'
      };

      const mockApp = {
        _id: new mongoose.Types.ObjectId()
      };

      await dispatchApplicationReceivedNotification({
        application: mockApp,
        job: mockJob,
        student: mockStudent
      });

      const recruiterNotifs = await Notification.find({ recipientId: recruiterUser.user._id });
      assert.equal(recruiterNotifs.length, 1);
      assert.equal(recruiterNotifs[0].type, 'APPLICATION_RECEIVED');
      assert.ok(recruiterNotifs[0].message.includes('Priya Shah'));
    });

    it('dispatches application status changed notification to student', async () => {
      const studentUser = await createAuthUser(ROLE_IDS.STUDENT, 'STUDENT');
      const student = await Student.create({
        userId: studentUser.user._id,
        universityId: `U${Date.now()}`,
        firstName: 'Riya',
        lastName: 'Patel',
        email: studentUser.user.email,
        mobileNumber: '9876543212',
        gender: 'FEMALE',
        department: 'Computer Engineering',
        branch: 'Computer Engineering',
        semester: 7,
        departmentId: deptDoc._id,
        courseId: courseDoc._id,
        passingYear: 2026,
        cgpa: 9.0,
        backlogs: 0,
        resume: { url: 'https://example.com/resume.pdf', fileName: 'resume.pdf', fileSize: 1024 }
      });

      const mockApp = {
        _id: new mongoose.Types.ObjectId(),
        studentId: student._id
      };

      await dispatchApplicationStatusChangedNotification({
        application: mockApp,
        previousStatus: 'APPLIED',
        newStatus: 'SHORTLISTED',
        jobTitle: 'Data Analyst'
      });

      const notifs = await Notification.find({ recipientId: studentUser.user._id });
      assert.equal(notifs.length, 1);
      assert.equal(notifs[0].type, 'APPLICATION_STATUS_CHANGED');
      assert.ok(notifs[0].message.includes('SHORTLISTED'));
    });
  });

  describe('4. REST API Endpoint Integration', () => {
    it('GET /api/notifications returns 401 when unauthorized', async () => {
      const res = await request(app).get('/api/notifications');
      assert.equal(res.status, 401);
    });

    it('GET /api/notifications returns paginated list and unreadCount for authenticated user', async () => {
      const auth = await createAuthUser(ROLE_IDS.STUDENT, 'STUDENT');

      await createNotification({
        recipientId: auth.user._id,
        title: 'Api Test 1',
        message: 'Content 1'
      });
      await createNotification({
        recipientId: auth.user._id,
        title: 'Api Test 2',
        message: 'Content 2'
      });

      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', auth.authHeader);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.notifications.length, 2);
      assert.equal(res.body.data.unreadCount, 2);
      assert.equal(res.body.data.pagination.total, 2);
    });

    it('GET /api/notifications/unread-count returns accurate unread badge count', async () => {
      const auth = await createAuthUser(ROLE_IDS.STUDENT, 'STUDENT');

      await createNotification({
        recipientId: auth.user._id,
        title: 'Notice 1',
        message: 'Content 1'
      });

      const res = await request(app)
        .get('/api/notifications/unread-count')
        .set('Authorization', auth.authHeader);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.unreadCount, 1);
    });

    it('PATCH /api/notifications/:id/read marks single notification as read', async () => {
      const auth = await createAuthUser(ROLE_IDS.STUDENT, 'STUDENT');
      const notif = await createNotification({
        recipientId: auth.user._id,
        title: 'To Read',
        message: 'Read me'
      });

      const res = await request(app)
        .patch(`/api/notifications/${notif._id}/read`)
        .set('Authorization', auth.authHeader);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.isRead, true);

      // Verify unread count is now 0
      const countRes = await request(app)
        .get('/api/notifications/unread-count')
        .set('Authorization', auth.authHeader);
      assert.equal(countRes.body.data.unreadCount, 0);
    });

    it('PATCH /api/notifications/read-all marks all unread notifications as read', async () => {
      const auth = await createAuthUser(ROLE_IDS.STUDENT, 'STUDENT');

      await createNotification({ recipientId: auth.user._id, title: 'Item 1', message: 'M1' });
      await createNotification({ recipientId: auth.user._id, title: 'Item 2', message: 'M2' });

      const res = await request(app)
        .patch('/api/notifications/read-all')
        .set('Authorization', auth.authHeader);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.modifiedCount, 2);

      const countRes = await request(app)
        .get('/api/notifications/unread-count')
        .set('Authorization', auth.authHeader);
      assert.equal(countRes.body.data.unreadCount, 0);
    });
  });
});
