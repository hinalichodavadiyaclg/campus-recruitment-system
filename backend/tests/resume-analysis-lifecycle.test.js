import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import PDFDocument from 'pdfkit';

import { User } from '../src/models/user.model.js';
import { Student } from '../src/models/student.model.js';
import { Company } from '../src/models/company.model.js';
import { Department } from '../src/models/department.model.js';
import { Job } from '../src/models/job.model.js';
import { StudentResume } from '../src/models/student_resume.model.js';
import { ResumeAnalysis } from '../src/models/resume_analysis.model.js';
import { ROLE_IDS } from '../src/utils/access-constants.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';

import * as resumeService from '../src/services/resume-analysis.service.js';

let replSet;
let student1User;
let student1Doc;
let student1Auth;

let student2User;
let student2Doc;
let student2Auth;

let jobDoc;

async function createMockPdf(contentLines = []) {
  return new Promise((resolve) => {
    const doc = new PDFDocument();
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    for (const line of contentLines) {
      doc.text(line);
    }
    doc.end();
  });
}

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
  await User.deleteMany({});
  await Student.deleteMany({});
  await Company.deleteMany({});
  await Department.deleteMany({});
  await Job.deleteMany({});
  await StudentResume.deleteMany({});
  await ResumeAnalysis.deleteMany({});

  const dept = await Department.create({
    name: 'Computer Engineering',
    code: 'CE',
    isActive: true
  });

  // Student 1
  student1User = new mongoose.Types.ObjectId();
  await User.create({
    _id: student1User,
    email: 'riya@vvwu.edu.in',
    universityId: 'VVWU-CE-101',
    passwordHash: 'dummy',
    userType: 'STUDENT',
    roleId: ROLE_IDS.STUDENT
  });
  student1Doc = await Student.create({
    universityId: 'VVWU-CE-101',
    firstName: 'Riya',
    lastName: 'Patel',
    email: 'riya@vvwu.edu.in',
    mobileNumber: '9898112233',
    department: 'Computer Engineering',
    departmentId: dept._id,
    branch: 'Computer Engineering',
    semester: 8,
    cgpa: 8.6,
    userId: student1User
  });
  student1Auth = {
    userId: student1User,
    roleId: ROLE_IDS.STUDENT,
    userType: 'STUDENT'
  };

  // Student 2 (for authorization isolation)
  student2User = new mongoose.Types.ObjectId();
  await User.create({
    _id: student2User,
    email: 'priya@vvwu.edu.in',
    universityId: 'VVWU-CE-102',
    passwordHash: 'dummy',
    userType: 'STUDENT',
    roleId: ROLE_IDS.STUDENT
  });
  student2Doc = await Student.create({
    universityId: 'VVWU-CE-102',
    firstName: 'Priya',
    lastName: 'Shah',
    email: 'priya@vvwu.edu.in',
    mobileNumber: '9898445566',
    department: 'Computer Engineering',
    departmentId: dept._id,
    branch: 'Computer Engineering',
    semester: 8,
    cgpa: 8.2,
    userId: student2User
  });
  student2Auth = {
    userId: student2User,
    roleId: ROLE_IDS.STUDENT,
    userType: 'STUDENT'
  };

  // Company and Job
  const company = await Company.create({
    companyName: 'Tech Innovators India',
    email: 'hr@techinnovators.com',
    industryType: 'Information Technology',
    hrRecruiterName: 'Anil Kumar',
    yearEstablished: 2012
  });

  const recruiterUser = new mongoose.Types.ObjectId();
  await User.create({
    _id: recruiterUser,
    email: 'recruiter@techinnovators.com',
    universityId: 'EMP-001',
    passwordHash: 'dummy',
    userType: 'COMPANY',
    companyId: company._id,
    roleId: ROLE_IDS.COMPANY
  });

  jobDoc = await Job.create({
    jobId: 'JOB-2026-TEST01',
    companyId: company._id,
    title: 'Software Development Engineer',
    description: 'Looking for a passionate junior developer with web and backend expertise.',
    jobType: 'FULL_TIME',
    workMode: 'ON_SITE',
    location: 'Surat',
    vacancies: 2,
    deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    createdBy: recruiterUser,
    status: 'OPEN',
    eligibilityCriteria: {
      requiredSkills: ['JavaScript', 'React', 'Node.js'],
      preferredSkills: ['MongoDB', 'Docker', 'AWS'],
      minCgpa: 7.0
    }
  });
});

test('Complete AI Resume Analyzer Lifecycle: Upload, Versioning, Analysis, Job Match, Comparison & Security', async () => {
  // 1. Student 1 uploads Resume Version 1
  const pdf1 = await createMockPdf([
    'Riya Patel',
    'riya@vvwu.edu.in | 9898112233 | github.com/riya-dev',
    'EDUCATION: B.Tech Computer Engineering at Vanita Vishram Women\'s University, CGPA 8.6',
    'SKILLS: JavaScript, React, HTML, CSS',
    'PROJECTS: Campus Event Tracker using React and JavaScript. Built dynamic components.'
  ]);

  const resume1 = await resumeService.uploadResume({
    file: {
      originalname: 'Riya_Patel_CV.pdf',
      mimetype: 'application/pdf',
      size: pdf1.length,
      buffer: pdf1
    },
    auth: student1Auth
  });

  assert.ok(resume1._id);
  assert.equal(resume1.versionNumber, 1);
  assert.equal(resume1.isActive, true);
  assert.ok(resume1.extractedText.includes('Riya Patel'));
  assert.ok(resume1.extractedData.skills.includes('JavaScript'));

  // Verify Student document synchronized
  const updatedStudent = await Student.findById(student1Doc._id);
  assert.ok(updatedStudent.resume);
  assert.equal(updatedStudent.resume.fileName, 'Riya_Patel_CV.pdf');

  // 2. Student 1 runs General AI Analysis on Resume 1
  const analysis1 = await resumeService.analyzeResumeById(
    { resumeId: resume1._id },
    student1Auth
  );

  assert.ok(analysis1._id);
  assert.equal(analysis1.analysisType, 'GENERAL');
  assert.ok(analysis1.overallScore >= 50 && analysis1.overallScore <= 100);
  assert.ok(analysis1.categoryScores.atsCompatibility > 0);
  assert.ok(analysis1.strengths.length > 0);
  assert.ok(analysis1.recommendations.length > 0);

  // 3. Student 1 uploads Resume Version 2 (added Node.js, MongoDB, Docker)
  const pdf2 = await createMockPdf([
    'Riya Patel',
    'riya@vvwu.edu.in | 9898112233 | github.com/riya-dev | linkedin.com/in/riya-patel',
    'EDUCATION: B.Tech Computer Engineering, VVWU Surat, CGPA 8.6',
    'SKILLS: JavaScript, React, Node.js, Express, MongoDB, Docker, Git',
    'PROJECTS: Full-Stack Placement Portal with React and Node.js. Optimized API latency by 35%. Deployed via Docker.'
  ]);

  const resume2 = await resumeService.uploadResume({
    file: {
      originalname: 'Riya_Patel_CV_v2.pdf',
      mimetype: 'application/pdf',
      size: pdf2.length,
      buffer: pdf2
    },
    auth: student1Auth
  });

  assert.equal(resume2.versionNumber, 2);
  assert.equal(resume2.isActive, true);

  // Resume 1 should now be archived (isActive: false)
  const r1Archived = await StudentResume.findById(resume1._id);
  assert.equal(r1Archived.isActive, false);

  // Total resume versions for Student 1 = 2
  const allResumes = await resumeService.getStudentResumes(student1Auth);
  assert.equal(allResumes.length, 2);
  assert.equal(allResumes[0].versionNumber, 2);

  // 4. Run Job-Specific Match Analysis on Resume 2 for the SDE Job
  const jobAnalysis = await resumeService.analyzeResumeById(
    { resumeId: resume2._id, jobId: jobDoc._id },
    student1Auth
  );

  assert.equal(jobAnalysis.analysisType, 'JOB_MATCH');
  assert.ok(jobAnalysis.jobMatchResult);
  assert.ok(jobAnalysis.jobMatchResult.jobMatchScore > 50);
  assert.ok(jobAnalysis.jobMatchResult.matchedSkills.includes('React'));
  assert.ok(jobAnalysis.jobMatchResult.matchedSkills.includes('Node.js'));
  assert.ok(jobAnalysis.jobMatchResult.matchedSkills.includes('MongoDB'));
  assert.ok(jobAnalysis.jobMatchResult.matchedSkills.includes('Docker'));

  // 5. Run General Analysis on Resume 2 to compare with Resume 1
  const analysis2 = await resumeService.analyzeResumeById(
    { resumeId: resume2._id },
    student1Auth
  );

  // Compare Analysis 1 & Analysis 2
  const comparison = await resumeService.compareAnalyses(
    { id1: analysis1._id, id2: analysis2._id },
    student1Auth
  );

  assert.ok(comparison.baseAnalysis);
  assert.ok(comparison.targetAnalysis);
  assert.ok(typeof comparison.scoreDiff === 'number');
  assert.ok(comparison.categoryDeltas);
  assert.ok(comparison.newSkillsAdded.length > 0, 'New skills added in V2 should be detected');

  // 6. Security Isolation Check: Student 2 CANNOT access Student 1's resume or analysis
  await assert.rejects(
    () => resumeService.getResumeById(resume2._id, student2Auth),
    (err) => {
      assert.match(err.message, /not found/i);
      return true;
    }
  );

  await assert.rejects(
    () => resumeService.getAnalysisById(analysis2._id, student2Auth),
    (err) => {
      assert.match(err.message, /not found/i);
      return true;
    }
  );

  // 7. Delete Resume: Student 1 deletes Version 2 -> Version 1 promoted to active
  await resumeService.deleteResume(resume2._id, student1Auth);
  const activeAfterDelete = await resumeService.getActiveResume(student1Auth);
  assert.ok(activeAfterDelete);
  assert.equal(activeAfterDelete.versionNumber, 1);
  assert.equal(activeAfterDelete.isActive, true);

  // 8. Rejection check: Uploading a standalone certificate in place of a resume is rejected
  const certPdf = await createMockPdf([
    "Vanita Vishram Women's University | Training & Placement Cell",
    'CERTIFICATE OF COMPLETION',
    'This is to proudly certify that Riya Patel has completed the training.',
    'Certificate No: CERT-2026-0018',
    'Authorized Signatory'
  ]);

  await assert.rejects(
    () =>
      resumeService.uploadResume({
        file: {
          originalname: 'CERT-2026-0018.pdf',
          mimetype: 'application/pdf',
          size: certPdf.length,
          buffer: certPdf
        },
        auth: student1Auth
      }),
    (err) => {
      assert.equal(err.code, 'INVALID_RESUME_DOCUMENT');
      assert.match(err.message, /Certificate/i);
      return true;
    }
  );
});
