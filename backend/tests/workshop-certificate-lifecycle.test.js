import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';

import { WorkshopCertificateTemplate } from '../src/models/workshop_certificate_template.model.js';
import { Workshop } from '../src/models/workshop.model.js';
import { WorkshopRegistration } from '../src/models/workshop_registration.model.js';
import { WorkshopAttendance } from '../src/models/workshop_attendance.model.js';
import { WorkshopCertificate } from '../src/models/workshop_certificate.model.js';
import { WorkshopAuditLog } from '../src/models/workshop_audit_log.model.js';
import { Notification } from '../src/models/notification.model.js';
import { Student } from '../src/models/student.model.js';
import { User } from '../src/models/user.model.js';
import { Company } from '../src/models/company.model.js';
import { Department } from '../src/models/department.model.js';
import { PlacementOfficer } from '../src/models/placement_officer.model.js';
import { ROLE_IDS } from '../src/utils/access-constants.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';

import * as templateService from '../src/services/workshop-certificate-template.service.js';
import * as certService from '../src/services/workshop-certificate.service.js';
import { completeWorkshop } from '../src/services/workshop.service.js';
import { calculateRegistrationAttendance } from '../src/services/workshop-attendance.service.js';
import { generatePersonalizedCertificatePdf } from '../src/services/pdf-generator.service.js';

let replSet;
let departmentDoc;
let adminAuth;
let coordinatorAuth;
let companyAAuth;
let companyBAuth;
let companyADoc;
let companyBDoc;

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
  await WorkshopCertificateTemplate.deleteMany({});
  await Workshop.deleteMany({});
  await WorkshopRegistration.deleteMany({});
  await WorkshopAttendance.deleteMany({});
  await WorkshopCertificate.deleteMany({});
  await WorkshopAuditLog.deleteMany({});
  await Notification.deleteMany({});
  await Student.deleteMany({});
  await User.deleteMany({});
  await Company.deleteMany({});
  await Department.deleteMany({});
  await PlacementOfficer.deleteMany({});

  departmentDoc = await Department.create({
    name: 'Information Technology',
    code: 'IT',
    isActive: true
  });

  const adminUserId = new mongoose.Types.ObjectId();
  await User.create({
    _id: adminUserId,
    email: 'admin@vvwu.edu.in',
    employeeId: 'EMP-ADM-001',
    passwordHash: 'dummy',
    userType: 'PLACEMENT',
    roleId: ROLE_IDS.SUPER_ADMIN
  });
  adminAuth = {
    userId: adminUserId,
    roleId: ROLE_IDS.SUPER_ADMIN,
    userType: 'PLACEMENT'
  };

  const coordUserId = new mongoose.Types.ObjectId();
  await User.create({
    _id: coordUserId,
    email: 'coord@vvwu.edu.in',
    employeeId: 'EMP-IT-001',
    passwordHash: 'dummy',
    userType: 'PLACEMENT',
    roleId: ROLE_IDS.PLACEMENT_COORDINATOR
  });
  await PlacementOfficer.create({
    employeeId: 'EMP-IT-001',
    firstName: 'Sara',
    lastName: 'Coordinator',
    email: 'coord@vvwu.edu.in',
    designation: 'Assistant Professor',
    departmentId: departmentDoc._id,
    department: 'Information Technology',
    role: ROLE_IDS.PLACEMENT_COORDINATOR,
    userId: coordUserId
  });
  coordinatorAuth = {
    userId: coordUserId,
    roleId: ROLE_IDS.PLACEMENT_COORDINATOR,
    userType: 'PLACEMENT'
  };

  companyADoc = await Company.create({
    companyName: 'Acme Cloud Technologies',
    email: 'contact@acme.com',
    industryType: 'Cloud Services',
    hrRecruiterName: 'Alice Recruiter',
    yearEstablished: 2012,
    website: 'https://acme.com'
  });
  const userAId = new mongoose.Types.ObjectId();
  await User.create({
    _id: userAId,
    email: 'recruiter@acme.com',
    passwordHash: 'dummy',
    userType: 'COMPANY',
    roleId: ROLE_IDS.COMPANY,
    companyId: companyADoc._id
  });
  companyAAuth = {
    userId: userAId,
    companyId: companyADoc._id,
    roleId: ROLE_IDS.COMPANY,
    userType: 'COMPANY'
  };

  companyBDoc = await Company.create({
    companyName: 'Nexus Global Systems',
    email: 'contact@nexus.com',
    industryType: 'Enterprise IT',
    hrRecruiterName: 'Bob Recruiter',
    yearEstablished: 2018,
    website: 'https://nexus.com'
  });
  const userBId = new mongoose.Types.ObjectId();
  await User.create({
    _id: userBId,
    email: 'recruiter@nexus.com',
    passwordHash: 'dummy',
    userType: 'COMPANY',
    roleId: ROLE_IDS.COMPANY,
    companyId: companyBDoc._id
  });
  companyBAuth = {
    userId: userBId,
    companyId: companyBDoc._id,
    roleId: ROLE_IDS.COMPANY,
    userType: 'COMPANY'
  };
});

test('1. Template Scope & Role Enforcement — Institutional, Departmental, and Company Isolation', async () => {
  // 1a. Institutional template created by Super Admin (no companyId needed)
  const instTemplate = await templateService.createTemplate({
    name: 'VVWU Central Gold Certificate',
    backgroundUrl: '/uploads/certificate-templates/gold.png',
    orientation: 'LANDSCAPE',
    signatoryName: 'Dr. Provost',
    signatoryTitle: 'Vice Chancellor'
  }, adminAuth);
  assert.equal(instTemplate.templateScope, 'INSTITUTION');
  assert.equal(instTemplate.companyId, null);

  // 1b. Departmental template created by Placement Coordinator
  const deptTemplate = await templateService.createTemplate({
    name: 'IT Department Advanced Coding Certificate',
    backgroundUrl: '/uploads/certificate-templates/it.png',
    orientation: 'LANDSCAPE',
    signatoryName: 'Prof. Head',
    signatoryTitle: 'HOD, Information Technology'
  }, coordinatorAuth);
  assert.equal(deptTemplate.templateScope, 'DEPARTMENT');
  assert.equal(String(deptTemplate.departmentId), String(departmentDoc._id));

  // 1c. Company template created by Company A
  const compTemplate = await templateService.createTemplate({
    name: 'Acme Cloud Master Practitioner',
    backgroundUrl: '/uploads/certificate-templates/acme.png',
    orientation: 'LANDSCAPE',
    signatoryName: 'Alice Recruiter',
    signatoryTitle: 'Lead Talent Partner'
  }, companyAAuth);
  assert.equal(compTemplate.templateScope, 'COMPANY');
  assert.equal(String(compTemplate.companyId), String(companyADoc._id));

  // 1d. Company B cannot update or delete Company A's template
  await assert.rejects(
    () => templateService.updateTemplate(compTemplate._id, { name: 'Compromised Name' }, companyBAuth),
    (err) => {
      assert.match(err.message, /Access denied|not authorized|FORBIDDEN/i);
      return true;
    }
  );
  await assert.rejects(
    () => templateService.deleteTemplate(compTemplate._id, companyBAuth),
    (err) => {
      assert.match(err.message, /Access denied|not authorized|FORBIDDEN/i);
      return true;
    }
  );
});

test('2. Authoritative Attendance Eligibility Calculation — 75% Gate and Boundary Scenarios', async () => {
  const sessions = [
    { sessionId: 'S1', isAttendanceRequired: true },
    { sessionId: 'S2', isAttendanceRequired: true },
    { sessionId: 'S3', isAttendanceRequired: true },
    { sessionId: 'S4', isAttendanceRequired: true }
  ];

  // 2a. Exactly 75% (3 out of 4 sessions PRESENT) -> COMPLETED
  const records75 = [
    { sessionId: 'S1', attendanceStatus: 'PRESENT' },
    { sessionId: 'S2', attendanceStatus: 'PRESENT' },
    { sessionId: 'S3', attendanceStatus: 'PRESENT' },
    { sessionId: 'S4', attendanceStatus: 'ABSENT' }
  ];
  const res75 = calculateRegistrationAttendance(sessions, records75, true);
  assert.equal(res75.attendancePercentage, 75);
  assert.equal(res75.completionStatus, 'COMPLETED');

  // 2b. Below 75% (2 out of 4 sessions PRESENT, 50%) -> NOT_COMPLETED
  const records50 = [
    { sessionId: 'S1', attendanceStatus: 'PRESENT' },
    { sessionId: 'S2', attendanceStatus: 'PRESENT' },
    { sessionId: 'S3', attendanceStatus: 'ABSENT' },
    { sessionId: 'S4', attendanceStatus: 'ABSENT' }
  ];
  const res50 = calculateRegistrationAttendance(sessions, records50, true);
  assert.equal(res50.attendancePercentage, 50);
  assert.equal(res50.completionStatus, 'NOT_COMPLETED');

  // 2c. Above 75% (4 out of 4 sessions PRESENT, 100%) -> COMPLETED
  const records100 = [
    { sessionId: 'S1', attendanceStatus: 'PRESENT' },
    { sessionId: 'S2', attendanceStatus: 'PRESENT' },
    { sessionId: 'S3', attendanceStatus: 'PRESENT' },
    { sessionId: 'S4', attendanceStatus: 'PRESENT' }
  ];
  const res100 = calculateRegistrationAttendance(sessions, records100, true);
  assert.equal(res100.attendancePercentage, 100);
  assert.equal(res100.completionStatus, 'COMPLETED');

  // 2d. Missing records count as absent
  const recordsMissing = [{ sessionId: 'S1', attendanceStatus: 'PRESENT' }];
  const resMissing = calculateRegistrationAttendance(sessions, recordsMissing, true);
  assert.equal(resMissing.attendancePercentage, 25);
  assert.equal(resMissing.completionStatus, 'NOT_COMPLETED');

  // 2e. Zero required sessions explicit handling: no division by zero, 0% attendance
  const zeroSessions = [];
  const resZero = calculateRegistrationAttendance(zeroSessions, [], true);
  assert.equal(resZero.attendancePercentage, 0);
  assert.equal(resZero.completionStatus, 'PENDING');
});

test('3. Automatic Certificate Issuance on Workshop Completion — Lifecycle Transition, Personalized PDFs & Notifications', async () => {
  // 3a. Create Company Template
  const template = await templateService.createTemplate({
    companyId: companyADoc._id,
    name: 'Acme Cloud Architect Certification',
    backgroundUrl: '/uploads/certificate-templates/acme-bg.png',
    orientation: 'LANDSCAPE',
    signatoryName: 'Dr. Jane Smith',
    signatoryTitle: 'VP of Engineering, Acme Corp'
  }, companyAAuth);

  // 3b. Create Published Workshop with 2 sessions
  const startAt = new Date(Date.now() - 7200000);
  const endAt = new Date(Date.now() - 1800000);
  const workshop = await Workshop.create({
    workshopId: 'WS-2026-AUTO',
    title: 'Cloud DevOps and Production Automation',
    description: 'Intensive workshop on production deployment.',
    category: 'TECHNICAL',
    mode: 'ONLINE',
    ownershipType: 'CENTRAL_PLACEMENT_CELL',
    companyId: companyADoc._id,
    certificateTemplateId: template._id,
    approvalStatus: 'APPROVED',
    isPublished: true,
    lifecycleStatus: 'ACTIVE',
    createdBy: adminAuth.userId,
    startAt,
    endAt,
    registrationDeadline: new Date(startAt.getTime() - 3600000),
    maxParticipants: 50,
    sessions: [
      {
        sessionId: 'SES-01',
        sessionNumber: 1,
        title: 'CI/CD Pipelines',
        startAt,
        endAt: new Date(startAt.getTime() + 3600000),
        isAttendanceRequired: true
      },
      {
        sessionId: 'SES-02',
        sessionNumber: 2,
        title: 'Kubernetes In Production',
        startAt: new Date(startAt.getTime() + 3600000),
        endAt,
        isAttendanceRequired: true
      }
    ]
  });

  // 3c. Register Student 1: Attended both sessions (100% -> Eligible)
  const stu1User = new mongoose.Types.ObjectId();
  await User.create({
    _id: stu1User,
    universityId: 'VVWU-IT-001',
    email: 'priya@vvwu.edu.in',
    passwordHash: 'dummy',
    userType: 'STUDENT',
    roleId: ROLE_IDS.STUDENT
  });
  const stu1 = await Student.create({
    universityId: 'VVWU-IT-001',
    firstName: 'Priya',
    lastName: 'Shah',
    email: 'priya@vvwu.edu.in',
    mobileNumber: '9988112233',
    cgpa: 9.1,
    branch: 'Information Technology',
    department: 'Information Technology',
    departmentId: departmentDoc._id,
    semester: 8,
    userId: stu1User
  });
  const reg1 = await WorkshopRegistration.create({
    registrationId: 'WREG-AUTO-001',
    workshopId: workshop._id,
    studentId: stu1._id,
    status: 'ATTENDED',
    attendancePercentage: 0,
    completionStatus: 'PENDING',
    registrationSource: 'STUDENT',
    registeredBy: stu1User,
    activeRegistrationKey: 'ACTIVE'
  });
  await WorkshopAttendance.create([
    {
      workshopId: workshop._id,
      sessionId: 'SES-01',
      registrationId: reg1._id,
      studentId: stu1._id,
      attendanceStatus: 'PRESENT',
      markedBy: adminAuth.userId
    },
    {
      workshopId: workshop._id,
      sessionId: 'SES-02',
      registrationId: reg1._id,
      studentId: stu1._id,
      attendanceStatus: 'PRESENT',
      markedBy: adminAuth.userId
    }
  ]);

  // 3d. Register Student 2: Attended 0 sessions (0% -> Ineligible)
  const stu2User = new mongoose.Types.ObjectId();
  await User.create({
    _id: stu2User,
    universityId: 'VVWU-IT-002',
    email: 'anita@vvwu.edu.in',
    passwordHash: 'dummy',
    userType: 'STUDENT',
    roleId: ROLE_IDS.STUDENT
  });
  const stu2 = await Student.create({
    universityId: 'VVWU-IT-002',
    firstName: 'Anita',
    lastName: 'Desai',
    email: 'anita@vvwu.edu.in',
    mobileNumber: '9988112244',
    cgpa: 8.0,
    branch: 'Information Technology',
    department: 'Information Technology',
    departmentId: departmentDoc._id,
    semester: 8,
    userId: stu2User
  });
  const reg2 = await WorkshopRegistration.create({
    registrationId: 'WREG-AUTO-002',
    workshopId: workshop._id,
    studentId: stu2._id,
    status: 'REGISTERED',
    attendancePercentage: 0,
    completionStatus: 'PENDING',
    registrationSource: 'STUDENT',
    registeredBy: stu2User,
    activeRegistrationKey: 'ACTIVE'
  });
  await WorkshopAttendance.create([
    {
      workshopId: workshop._id,
      sessionId: 'SES-01',
      registrationId: reg2._id,
      studentId: stu2._id,
      attendanceStatus: 'ABSENT',
      markedBy: adminAuth.userId
    },
    {
      workshopId: workshop._id,
      sessionId: 'SES-02',
      registrationId: reg2._id,
      studentId: stu2._id,
      attendanceStatus: 'ABSENT',
      markedBy: adminAuth.userId
    }
  ]);

  // 3e. Trigger completeWorkshop transition
  const completionResult = await completeWorkshop(workshop._id, adminAuth);
  assert.equal(completionResult.workshop.lifecycleStatus, 'COMPLETED');
  assert.equal(completionResult.issuance.issuedCount, 1, 'Only eligible student receives certificate');

  // Verify Student 1 registration is finalized to COMPLETED (100%)
  const updatedReg1 = await WorkshopRegistration.findById(reg1._id);
  assert.equal(updatedReg1.completionStatus, 'COMPLETED');
  assert.equal(updatedReg1.attendancePercentage, 100);

  // Verify Student 2 registration is finalized to NOT_COMPLETED (0%)
  const updatedReg2 = await WorkshopRegistration.findById(reg2._id);
  assert.equal(updatedReg2.completionStatus, 'NOT_COMPLETED');
  assert.equal(updatedReg2.attendancePercentage, 0);

  // Verify Student 1 has Certificate issued
  const cert1 = await WorkshopCertificate.findOne({ studentId: stu1._id });
  assert.ok(cert1);
  assert.equal(cert1.certificateStatus, 'ISSUED');
  assert.equal(cert1.recipientName, 'Priya Shah');
  assert.equal(cert1.templateSnapshot.name, 'Acme Cloud Architect Certification');
  assert.ok(cert1.fileUrl);
  assert.ok(cert1.qrCodeUrl);

  // Verify Student 2 has NO certificate
  const cert2 = await WorkshopCertificate.findOne({ studentId: stu2._id });
  assert.equal(cert2, null, 'Ineligible student must not have a certificate record');

  // Verify Student 1 received notification
  const student1Notifications = await Notification.find({
    recipientId: stu1User,
    type: 'WORKSHOP_CERTIFICATE_ISSUED'
  });
  assert.equal(student1Notifications.length, 1);
  assert.match(student1Notifications[0].message, /Cloud DevOps and Production Automation/);

  // 3f. Idempotency test: Re-running issuance or completeWorkshop does NOT duplicate certificate
  const repeatIssuance = await certService.issueCertificates({ workshopId: workshop._id }, adminAuth);
  assert.equal(repeatIssuance.issuedCount, 1);
  assert.equal(repeatIssuance.skippedCount, 1);

  const certCount = await WorkshopCertificate.countDocuments({ workshopId: workshop._id });
  assert.equal(certCount, 1, 'Certificate count must remain exactly 1 (idempotent)');

  // Duplicate notifications must NOT be created
  const repeatNotifications = await Notification.find({
    recipientId: stu1User,
    type: 'WORKSHOP_CERTIFICATE_ISSUED'
  });
  assert.equal(repeatNotifications.length, 1);
});

test('4. Security & Permissions — Student Roster Isolation, Download Ownership & Public Verification', async () => {
  // Create sample workshop and issued certificate
  const template = await templateService.createTemplate({
    companyId: companyADoc._id,
    name: 'Acme Certified Data Scientist',
    backgroundUrl: '/uploads/certificate-templates/ds.png',
    orientation: 'LANDSCAPE',
    signatoryName: 'Head of AI',
    signatoryTitle: 'Acme Corporation'
  }, companyAAuth);

  const wsStart = new Date(Date.now() - 3600000);
  const wsEnd = new Date(Date.now() - 1800000);
  const workshop = await Workshop.create({
    workshopId: 'WS-2026-SEC',
    title: 'Enterprise AI & Data Science',
    description: 'Practical data science applications and machine learning.',
    category: 'TECHNICAL',
    mode: 'OFFLINE',
    ownershipType: 'CENTRAL_PLACEMENT_CELL',
    companyId: companyADoc._id,
    certificateTemplateId: template._id,
    approvalStatus: 'APPROVED',
    isPublished: true,
    lifecycleStatus: 'COMPLETED',
    createdBy: adminAuth.userId,
    startAt: wsStart,
    endAt: wsEnd,
    registrationDeadline: new Date(Date.now() - 4000000),
    maxParticipants: 40,
    sessions: [
      {
        sessionId: 'SES-01',
        sessionNumber: 1,
        title: 'AI Basics',
        startAt: wsStart,
        endAt: wsEnd,
        isAttendanceRequired: true
      }
    ]
  });

  const studentUser = new mongoose.Types.ObjectId();
  await User.create({
    _id: studentUser,
    universityId: 'VVWU-IT-003',
    email: 'kavita@vvwu.edu.in',
    passwordHash: 'dummy',
    userType: 'STUDENT',
    roleId: ROLE_IDS.STUDENT
  });
  const studentDoc = await Student.create({
    universityId: 'VVWU-IT-003',
    firstName: 'Kavita',
    lastName: 'Rao',
    email: 'kavita@vvwu.edu.in',
    mobileNumber: '9988112255',
    cgpa: 8.8,
    branch: 'Information Technology',
    department: 'Information Technology',
    departmentId: departmentDoc._id,
    semester: 8,
    userId: studentUser
  });
  const reg = await WorkshopRegistration.create({
    registrationId: 'WREG-SEC-001',
    workshopId: workshop._id,
    studentId: studentDoc._id,
    status: 'COMPLETED',
    attendancePercentage: 100,
    completionStatus: 'COMPLETED',
    registrationSource: 'STUDENT',
    registeredBy: studentUser,
    activeRegistrationKey: 'ACTIVE'
  });

  // Issue Certificate
  const res = await certService.issueCertificates({ workshopId: workshop._id }, adminAuth);
  assert.equal(res.issuedCount, 1);
  const cert = res.certificates[0];

  // 4a. Recipient student can list their own certificates
  const studentAuth = { userId: studentUser, roleId: ROLE_IDS.STUDENT, userType: 'STUDENT' };
  const myCerts = await certService.getMyCertificates(studentAuth);
  assert.equal(myCerts.length, 1);
  assert.equal(myCerts[0].certificateNumber, cert.certificateNumber);

  // 4b. Another student lists their own certificates -> empty
  const otherStudentUser = new mongoose.Types.ObjectId();
  await User.create({
    _id: otherStudentUser,
    universityId: 'VVWU-IT-004',
    email: 'other@vvwu.edu.in',
    passwordHash: 'dummy',
    userType: 'STUDENT',
    roleId: ROLE_IDS.STUDENT
  });
  await Student.create({
    universityId: 'VVWU-IT-004',
    firstName: 'Other',
    lastName: 'Student',
    email: 'other@vvwu.edu.in',
    mobileNumber: '9988112266',
    cgpa: 7.5,
    branch: 'Information Technology',
    department: 'Information Technology',
    departmentId: departmentDoc._id,
    semester: 8,
    userId: otherStudentUser
  });
  const otherAuth = { userId: otherStudentUser, roleId: ROLE_IDS.STUDENT, userType: 'STUDENT' };
  const otherCerts = await certService.getMyCertificates(otherAuth);
  assert.equal(otherCerts.length, 0);

  // 4c. Other student CANNOT download Student 1's certificate
  await assert.rejects(
    () => certService.getCertificateDownloadPath(cert._id, otherAuth),
    (err) => {
      assert.match(err.message, /only download your own certificates/i);
      return true;
    }
  );

  // 4d. Unrelated Company B CANNOT download Company A's certificate
  await assert.rejects(
    () => certService.getCertificateDownloadPath(cert._id, companyBAuth),
    (err) => {
      assert.match(err.message, /Access denied/i);
      return true;
    }
  );

  // 4e. Students CANNOT view staff certificates roster
  await assert.rejects(
    () => certService.getWorkshopCertificates(workshop._id, studentAuth),
    (err) => {
      assert.match(err.message, /Students cannot view the workshop certificates roster/i);
      return true;
    }
  );

  // 4f. Public Verification data minimization
  const publicVerify = await certService.verifyCertificatePublic(cert.verificationCode);
  assert.equal(publicVerify.isValid, true);
  assert.equal(publicVerify.certificateNumber, cert.certificateNumber);
  assert.equal(publicVerify.studentName, 'Kavita R.');
  // Confirm sensitive data is not leaked
  assert.equal(publicVerify.email, undefined);
  assert.equal(publicVerify.userId, undefined);
  assert.equal(publicVerify.fileUrl, undefined);
  assert.equal(publicVerify.internalPath, undefined);

  // 4g. Revoke Certificate and test behavior
  const revoked = await certService.revokeCertificate(
    { certificateId: cert._id, reason: 'Attendance discrepancy discovered during audit.' },
    adminAuth
  );
  assert.equal(revoked.certificateStatus, 'REVOKED');

  // Revoked certificate CANNOT be downloaded
  await assert.rejects(
    () => certService.getCertificateDownloadPath(cert._id, studentAuth),
    (err) => {
      assert.match(err.message, /has been revoked/i);
      return true;
    }
  );

  // Public verification reflects revoked state
  const publicVerifyRevoked = await certService.verifyCertificatePublic(cert.verificationCode);
  assert.equal(publicVerifyRevoked.isValid, false);
  assert.equal(publicVerifyRevoked.status, 'REVOKED');
  assert.equal(publicVerifyRevoked.revocationReason, 'Attendance discrepancy discovered during audit.');
});
