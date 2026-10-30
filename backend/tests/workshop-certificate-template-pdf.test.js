import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';

import { WorkshopCertificateTemplate } from '../src/models/workshop_certificate_template.model.js';
import { Workshop } from '../src/models/workshop.model.js';
import { WorkshopRegistration } from '../src/models/workshop_registration.model.js';
import { WorkshopCertificate } from '../src/models/workshop_certificate.model.js';
import { WorkshopAuditLog } from '../src/models/workshop_audit_log.model.js';
import { Student } from '../src/models/student.model.js';
import { User } from '../src/models/user.model.js';
import { Company } from '../src/models/company.model.js';
import { Department } from '../src/models/department.model.js';
import { ROLE_IDS } from '../src/utils/access-constants.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';

import * as templateService from '../src/services/workshop-certificate-template.service.js';
import * as certService from '../src/services/workshop-certificate.service.js';
import { generatePersonalizedCertificatePdf } from '../src/services/pdf-generator.service.js';

let replSet;
let departmentDoc;
let adminAuth;
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
  await WorkshopCertificate.deleteMany({});
  await WorkshopAuditLog.deleteMany({});
  await Student.deleteMany({});
  await User.deleteMany({});
  await Company.deleteMany({});
  await Department.deleteMany({});

  departmentDoc = await Department.create({
    name: 'Computer Engineering',
    code: 'CO',
    isActive: true
  });

  adminAuth = {
    userId: new mongoose.Types.ObjectId(),
    roleId: ROLE_IDS.SUPER_ADMIN,
    userType: 'PLACEMENT'
  };

  companyADoc = await Company.create({
    companyName: 'Tech Corp Alpha',
    email: 'contact@alpha.com',
    industryType: 'Software',
    hrRecruiterName: 'John Recruiter',
    yearEstablished: 2010,
    website: 'https://alpha.com'
  });

  const userAId = new mongoose.Types.ObjectId();
  await User.create({
    _id: userAId,
    email: 'recruiter@alpha.com',
    passwordHash: 'dummy_hash',
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
    companyName: 'Beta Global Solutions',
    email: 'contact@beta.com',
    industryType: 'Cloud',
    hrRecruiterName: 'Jane Recruiter',
    yearEstablished: 2015,
    website: 'https://beta.com'
  });

  const userBId = new mongoose.Types.ObjectId();
  await User.create({
    _id: userBId,
    email: 'recruiter@beta.com',
    passwordHash: 'dummy_hash',
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

test('Company Template CRUD and Company Isolation', async () => {
  // 1. Company A creates a template
  const templateA = await templateService.createTemplate({
    companyId: companyADoc._id,
    name: 'Alpha AI Certification Design',
    backgroundUrl: '/uploads/certificate-templates/test-alpha.png',
    orientation: 'LANDSCAPE',
    signatoryName: 'Dr. Jane Smith',
    signatoryTitle: 'CTO, Tech Corp Alpha'
  }, companyAAuth);

  assert.ok(templateA._id);
  assert.equal(templateA.name, 'Alpha AI Certification Design');
  assert.equal(templateA.version, 1);
  assert.equal(String(templateA.companyId), String(companyADoc._id));

  // 2. Company B creates a template
  const templateB = await templateService.createTemplate({
    companyId: companyBDoc._id,
    name: 'Beta Cloud Architect Design',
    backgroundUrl: '/uploads/certificate-templates/test-beta.png',
    orientation: 'LANDSCAPE',
    signatoryName: 'Mark Vance',
    signatoryTitle: 'Head of People, Beta Global'
  }, companyBAuth);

  assert.ok(templateB._id);

  // 3. Verify Isolation: Company A only lists Company A's templates
  const listA = await templateService.listTemplates(companyAAuth);
  assert.equal(listA.length, 1);
  assert.equal(listA[0].name, 'Alpha AI Certification Design');

  // 4. Verify Isolation: Company B only lists Company B's templates
  const listB = await templateService.listTemplates(companyBAuth);
  assert.equal(listB.length, 1);
  assert.equal(listB[0].name, 'Beta Cloud Architect Design');

  // 5. Placement Head / Admin can list all active templates
  const listAdmin = await templateService.listTemplates(adminAuth);
  assert.equal(listAdmin.length, 2);

  // 6. Cross-company access to getTemplateById is rejected
  await assert.rejects(
    () => templateService.getTemplateById(templateB._id, companyAAuth),
    (err) => {
      assert.match(err.message, /Access denied|not found/i);
      return true;
    }
  );
});

test('Template versioning increments if certificates were previously issued', async () => {
  const template = await templateService.createTemplate({
    companyId: companyADoc._id,
    name: 'Initial Template',
    backgroundUrl: '/uploads/certificate-templates/initial.png',
    orientation: 'LANDSCAPE',
    signatoryName: 'Alice',
    signatoryTitle: 'Lead'
  }, companyAAuth);

  // Update without any issued certs -> version stays 1
  const updated1 = await templateService.updateTemplate(template._id, {
    name: 'Updated Name (No Certs)'
  }, companyAAuth);
  assert.equal(updated1.version, 1);

  // Simulate an issued certificate linked to this template
  await WorkshopCertificate.create({
    certificateNumber: 'CERT-2026-TEST',
    verificationCode: 'VERIFY-12345678',
    workshopId: new mongoose.Types.ObjectId(),
    registrationId: new mongoose.Types.ObjectId(),
    studentId: new mongoose.Types.ObjectId(),
    recipientName: 'Student Name',
    issuedAt: new Date(),
    certificateStatus: 'ISSUED',
    issuedBy: adminAuth.userId,
    certificateTemplateId: template._id,
    templateVersion: 1
  });

  // Update after certificate issued -> version should bump to 2
  const updated2 = await templateService.updateTemplate(template._id, {
    name: 'Updated Name (After Issuance)'
  }, companyAAuth);
  assert.equal(updated2.version, 2);
  assert.equal(updated2.name, 'Updated Name (After Issuance)');
});

test('PDF Generator creates a valid PDF with embedded QR code', async () => {
  const result = await generatePersonalizedCertificatePdf({
    certificate: {
      certificateNumber: 'VVWU-WS-2026-9999',
      verificationCode: 'TESTCODE-VERIFY-123',
      issuedAt: new Date()
    },
    student: {
      firstName: 'Aishwarya',
      lastName: 'Patel'
    },
    workshop: {
      title: 'Full-Stack Modern Web Engineering',
      startAt: new Date(),
      endAt: new Date()
    },
    template: null
  });

  assert.ok(result.fileUrl, 'result.fileUrl should exist');
  assert.ok(result.absolutePath, 'result.absolutePath should exist');
  assert.ok(result.qrCodeDataUrl, 'result.qrCodeDataUrl should exist');
  assert.ok(fs.existsSync(result.absolutePath), 'PDF file must exist on disk');

  const fileBytes = fs.readFileSync(result.absolutePath);
  assert.ok(fileBytes.length > 1000, 'PDF file size should be substantial');
  const header = fileBytes.slice(0, 5).toString('ascii');
  assert.match(header, /%PDF-/);
});

test('Default institutional certificate contains VVWU branding and no third-party university branding', async () => {
  const result = await generatePersonalizedCertificatePdf({
    certificate: {
      certificateNumber: 'VVWU-CERT-2026-TEST',
      verificationCode: 'VERIFY-VVWU-SECURE-KEY-8888',
      issuedAt: new Date()
    },
    student: {
      firstName: 'Pooja',
      lastName: 'Patel'
    },
    workshop: {
      title: 'Cloud DevOps Masterclass',
      startAt: new Date(),
      endAt: new Date()
    },
    template: null
  });

  const fileBytes = fs.readFileSync(result.absolutePath);
  const str = fileBytes.toString('binary');
  const streamRegex = /stream[\r\n]+([\s\S]*?)[\r\n]+endstream/g;
  let match;
  let decodedText = '';

  while ((match = streamRegex.exec(str)) !== null) {
    try {
      const decompressed = zlib.inflateSync(Buffer.from(match[1], 'binary')).toString('latin1');
      const hexRegex = /<([0-9a-fA-F]+)>/g;
      let hexMatch;
      while ((hexMatch = hexRegex.exec(decompressed)) !== null) {
        const hex = hexMatch[1];
        for (let i = 0; i < hex.length; i += 2) {
          decodedText += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
        }
      }
      decodedText += ' ';
    } catch (_) {}
  }

  // Must contain Vanita Vishram Women's University
  assert.ok(decodedText.includes("VANITA VISHRAM WOMEN'S UNIVERSITY"), 'Must include VANITA VISHRAM WOMEN\'S UNIVERSITY');
  assert.ok(decodedText.includes('TRAINING & PLACEMENT CELL'), 'Must include TRAINING & PLACEMENT CELL');
  assert.ok(decodedText.includes('CERTIFICATE OF COMPLETION'), 'Must include CERTIFICATE OF COMPLETION');
  assert.ok(decodedText.includes('Pooja Patel'), 'Must include student name');
  assert.ok(decodedText.includes('Cloud DevOps Masterclass'), 'Must include workshop title');
  assert.ok(decodedText.includes('VVWU-CERT-2026-TEST'), 'Must include certificate number');

  // Must NOT contain third-party university branding
  assert.equal(/VEER|NARMAD|SOUTH GUJARAT|VNSGU/i.test(decodedText), false, 'Must NOT include third-party university branding');
});

test('End-to-End: Workshop Creation with Template, 75% Gate, Issuance, and Secure Download', async () => {
  // 1. Create company template
  const template = await templateService.createTemplate({
    companyId: companyADoc._id,
    name: 'Alpha DevOps Masterclass',
    backgroundUrl: '/uploads/certificate-templates/devops.png',
    orientation: 'LANDSCAPE',
    signatoryName: 'Dr. Ramesh Kumar',
    signatoryTitle: 'Principal Cloud Architect'
  }, companyAAuth);

  // 2. Concluded Workshop created with this template
  const startAt = new Date(Date.now() - 7200000);
  const endAt = new Date(Date.now() - 3600000); // 1 hr ago

  const workshop = await Workshop.create({
    workshopId: 'WS-2026-ALPHA',
    title: 'Cloud DevOps Masterclass',
    description: 'Hands-on production devops pipelines.',
    category: 'TECHNICAL',
    mode: 'ONLINE',
    ownershipType: 'CENTRAL_PLACEMENT_CELL',
    companyId: companyADoc._id,
    certificateTemplateId: template._id,
    approvalStatus: 'APPROVED',
    isPublished: true,
    lifecycleStatus: 'COMPLETED',
    createdBy: companyAAuth.userId,
    startAt,
    endAt,
    registrationDeadline: new Date(startAt.getTime() - 3600000),
    maxParticipants: 30,
    sessions: [
      {
        sessionId: 'SES-01',
        sessionNumber: 1,
        title: 'Kubernetes in Action',
        startAt,
        endAt,
        isAttendanceRequired: true
      }
    ]
  });

  // 3. Register Student 1: 100% Attendance (Eligible)
  const student1User = new mongoose.Types.ObjectId();
  await User.create({
    _id: student1User,
    universityId: 'VVWU-CO-001',
    email: 'stu1@vvwu.edu.in',
    passwordHash: 'dummy_hash',
    userType: 'STUDENT',
    roleId: ROLE_IDS.STUDENT
  });
  const student1Doc = await Student.create({
    universityId: 'VVWU-CO-001',
    firstName: 'Pooja',
    lastName: 'Sharma',
    email: 'stu1@vvwu.edu.in',
    mobileNumber: '9988776655',
    cgpa: 8.5,
    branch: 'Computer Engineering',
    department: 'Computer Engineering',
    departmentId: departmentDoc._id,
    semester: 8,
    userId: student1User
  });
  await WorkshopRegistration.create({
    registrationId: 'WREG-ALPHA-001',
    workshopId: workshop._id,
    studentId: student1Doc._id,
    status: 'COMPLETED',
    attendancePercentage: 100,
    completionStatus: 'COMPLETED',
    registrationSource: 'STUDENT',
    registeredBy: student1User,
    activeRegistrationKey: 'ACTIVE'
  });

  // 4. Register Student 2: 50% Attendance (Ineligible, below 75%)
  const student2User = new mongoose.Types.ObjectId();
  await User.create({
    _id: student2User,
    universityId: 'VVWU-CO-002',
    email: 'stu2@vvwu.edu.in',
    passwordHash: 'dummy_hash',
    userType: 'STUDENT',
    roleId: ROLE_IDS.STUDENT
  });
  const student2Doc = await Student.create({
    universityId: 'VVWU-CO-002',
    firstName: 'Rani',
    lastName: 'Patel',
    email: 'stu2@vvwu.edu.in',
    mobileNumber: '9988776644',
    cgpa: 7.9,
    branch: 'Computer Engineering',
    department: 'Computer Engineering',
    departmentId: departmentDoc._id,
    semester: 8,
    userId: student2User
  });
  await WorkshopRegistration.create({
    registrationId: 'WREG-ALPHA-002',
    workshopId: workshop._id,
    studentId: student2Doc._id,
    status: 'ATTENDED',
    attendancePercentage: 50,
    completionStatus: 'PENDING',
    registrationSource: 'STUDENT',
    registeredBy: student2User,
    activeRegistrationKey: 'ACTIVE'
  });

  // 5. Issue Certificates triggered by Admin / Placement Head
  const result = await certService.issueCertificates({ workshopId: workshop._id }, adminAuth);
  assert.equal(result.issuedCount, 1, 'Only eligible student (>=75%) must receive certificate');
  assert.equal(result.certificates.length, 1);

  const issuedCert = result.certificates[0];
  assert.equal(String(issuedCert.studentId), String(student1Doc._id));
  assert.equal(String(issuedCert.certificateTemplateId), String(template._id));
  assert.ok(issuedCert.fileUrl, 'fileUrl must be stored');
  assert.ok(issuedCert.qrCodeUrl, 'qrCodeUrl must be stored');

  // Check PDF file created on disk
  const expectedDiskPath = fs.existsSync(path.join(process.cwd(), 'backend', 'public', issuedCert.fileUrl))
    ? path.join(process.cwd(), 'backend', 'public', issuedCert.fileUrl)
    : path.join(process.cwd(), 'public', issuedCert.fileUrl);
  assert.ok(fs.existsSync(expectedDiskPath), `PDF file should exist at ${expectedDiskPath}`);

  // 6. Test Secure Download
  // 6a: Recipient student can download
  const student1Auth = {
    userId: student1User,
    roleId: ROLE_IDS.STUDENT,
    userType: 'STUDENT'
  };
  const download1 = await certService.getCertificateDownloadPath(issuedCert._id, student1Auth);
  assert.ok(fs.existsSync(download1.absolutePath));
  assert.equal(download1.fileName, `${issuedCert.certificateNumber}.pdf`);

  // 6b: Another student CANNOT download (Forbidden / Not found)
  const student2Auth = {
    userId: student2User,
    roleId: ROLE_IDS.STUDENT,
    userType: 'STUDENT'
  };
  await assert.rejects(
    () => certService.getCertificateDownloadPath(issuedCert._id, student2Auth),
    (err) => {
      assert.match(err.message, /own certificates|Access denied|not authorized|not found/i);
      return true;
    }
  );

  // 6c: Owning Company CAN download
  const downloadCompany = await certService.getCertificateDownloadPath(issuedCert._id, companyAAuth);
  assert.ok(fs.existsSync(downloadCompany.absolutePath));

  // 6d: Other Company CANNOT download
  await assert.rejects(
    () => certService.getCertificateDownloadPath(issuedCert._id, companyBAuth),
    (err) => {
      assert.match(err.message, /Access denied|not authorized|not found/i);
      return true;
    }
  );

  // 6e: Placement Head / Admin CAN download
  const downloadAdmin = await certService.getCertificateDownloadPath(issuedCert._id, adminAuth);
  assert.ok(fs.existsSync(downloadAdmin.absolutePath));

  // 7. Revoke Certificate and test Public Verification
  const revoked = await certService.revokeCertificate(
    {
      certificateId: issuedCert._id,
      reason: 'Revoked due to administrative policy update'
    },
    adminAuth
  );
  assert.equal(revoked.certificateStatus, 'REVOKED');

  const publicData = await certService.verifyCertificatePublic(issuedCert.verificationCode);
  assert.equal(publicData.studentName, 'Pooja S.');
  assert.equal(publicData.revocationReason, 'Revoked due to administrative policy update');
  // Ensure data minimization: no sensitive internals
  assert.equal(publicData.fileUrl, undefined);
  assert.equal(publicData.userId, undefined);
  assert.equal(publicData.studentId, undefined);
});
