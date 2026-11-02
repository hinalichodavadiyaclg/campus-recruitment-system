import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';

import { User } from '../src/models/user.model.js';
import { Student } from '../src/models/student.model.js';
import { Department } from '../src/models/department.model.js';
import { StudentResume } from '../src/models/student_resume.model.js';
import { ResumeImprovement } from '../src/models/resume_improvement.model.js';
import { ROLE_IDS } from '../src/utils/access-constants.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';

import * as resumeService from '../src/services/resume-analysis.service.js';
import * as improvementService from '../src/services/resume-improvement.service.js';

let replSet;
let student1User;
let student1Auth;
let student2User;
let student2Auth;

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
  process.env.MONGODB_URI = replSet.getUri();
  await connectDatabase();
});

after(async () => {
  await disconnectDatabase();
  if (replSet) await replSet.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
  await Student.deleteMany({});
  await Department.deleteMany({});
  await StudentResume.deleteMany({});
  await ResumeImprovement.deleteMany({});

  const dept = await Department.create({
    name: 'Computer Engineering',
    code: 'CE',
    isActive: true
  });

  student1User = new mongoose.Types.ObjectId();
  await User.create({
    _id: student1User,
    email: 'ananya@vvwu.edu.in',
    universityId: 'VVWU-CE-201',
    passwordHash: 'dummy',
    userType: 'STUDENT',
    roleId: ROLE_IDS.STUDENT
  });

  await Student.create({
    universityId: 'VVWU-CE-201',
    firstName: 'Ananya',
    lastName: 'Sharma',
    email: 'ananya@vvwu.edu.in',
    mobileNumber: '9876543210',
    department: 'Computer Engineering',
    departmentId: dept._id,
    branch: 'Computer Engineering',
    semester: 8,
    cgpa: 8.9,
    userId: student1User
  });

  student1Auth = {
    userId: student1User,
    roleId: ROLE_IDS.STUDENT,
    userType: 'STUDENT'
  };

  student2User = new mongoose.Types.ObjectId();
  await User.create({
    _id: student2User,
    email: 'other@vvwu.edu.in',
    universityId: 'VVWU-CE-202',
    passwordHash: 'dummy',
    userType: 'STUDENT',
    roleId: ROLE_IDS.STUDENT
  });

  await Student.create({
    universityId: 'VVWU-CE-202',
    firstName: 'Other',
    lastName: 'Student',
    email: 'other@vvwu.edu.in',
    mobileNumber: '9988776655',
    department: 'Computer Engineering',
    departmentId: dept._id,
    branch: 'Computer Engineering',
    semester: 8,
    cgpa: 8.0,
    userId: student2User
  });

  student2Auth = {
    userId: student2User,
    roleId: ROLE_IDS.STUDENT,
    userType: 'STUDENT'
  };
});

test('Complete AI Resume Improvement Lifecycle: Draft, Review, Answer, PDF & DOCX Generation, and Security', async () => {
  // 1. Upload initial genuine resume (Version 1)
  const pdf1 = await createMockPdf([
    'Ananya Sharma',
    'ananya@vvwu.edu.in | 9876543210 | github.com/ananya-dev',
    "EDUCATION: B.Tech in Computer Engineering at Vanita Vishram Women's University, CGPA 8.9",
    'SKILLS: Python, JavaScript, React, Node.js, MySQL, Git',
    'PROJECTS: Student Placement Portal made using React and Node.js with MySQL database.',
    'EXPERIENCE: Web development intern at Local Tech'
  ]);

  const resume1 = await resumeService.uploadResume({
    file: {
      originalname: 'Ananya_Resume_v1.pdf',
      mimetype: 'application/pdf',
      size: pdf1.length,
      buffer: pdf1
    },
    auth: student1Auth
  });

  assert.ok(resume1._id);
  assert.equal(resume1.versionNumber, 1);
  assert.equal(resume1.isActive, true);

  // 2. Initiate AI Resume Improvement
  const draft = await improvementService.createResumeImprovement(resume1._id, student1Auth);

  assert.ok(draft._id);
  assert.equal(draft.status, 'READY_FOR_REVIEW');
  assert.ok(draft.sections.length >= 3);
  assert.ok(draft.sections.some((s) => s.sectionKey === 'summary'));
  assert.ok(draft.sections.some((s) => s.sectionKey === 'skills'));
  assert.ok(draft.sections.some((s) => s.sectionKey === 'projects'));

  // 3. Review individual sections: Accept Summary, Edit Projects manually, Reject/Keep original
  const summarySec = draft.sections.find((s) => s.sectionKey === 'summary');
  const updatedSummary = await improvementService.updateSectionDecision(
    draft._id,
    summarySec.sectionKey,
    { decision: 'ACCEPTED' },
    student1Auth
  );
  const acceptedSec = updatedSummary.sections.find((s) => s.sectionKey === 'summary');
  assert.equal(acceptedSec.studentDecision, 'ACCEPTED');

  const projSec = draft.sections.find((s) => s.sectionKey === 'projects');
  const updatedProj = await improvementService.updateSectionDecision(
    draft._id,
    projSec.sectionKey,
    {
      decision: 'EDITED',
      editedContent: 'Engineered student placement portal using React, Node.js and MySQL.'
    },
    student1Auth
  );
  const editedSec = updatedProj.sections.find((s) => s.sectionKey === 'projects');
  assert.equal(editedSec.studentDecision, 'EDITED');
  assert.equal(editedSec.studentEditedContent, 'Engineered student placement portal using React, Node.js and MySQL.');

  // 4. Answer missing info question if present
  if (draft.missingInformationQuestions && draft.missingInformationQuestions.length > 0) {
    const q = draft.missingInformationQuestions[0];
    const withAnswer = await improvementService.answerMissingInfoQuestion(
      draft._id,
      q.id,
      'Designed user interface and REST endpoints.',
      student1Auth
    );
    const answeredQ = withAnswer.missingInformationQuestions.find((item) => item.id === q.id);
    assert.equal(answeredQ.isAnswered, true);
    assert.equal(answeredQ.studentAnswer, 'Designed user interface and REST endpoints.');
  }

  // 5. Generate Approved Resume (Produces both PDF and DOCX)
  const generationResult = await improvementService.generateApprovedResume(draft._id, student1Auth);

  assert.equal(generationResult.success, true);
  assert.ok(generationResult.newResume);
  assert.equal(generationResult.newResume.versionNumber, 2);
  assert.equal(generationResult.newResume.isActive, true);
  assert.equal(generationResult.newResume.isAiImproved, true);
  assert.ok(generationResult.newResume.fileUrl.endsWith('.pdf'));
  assert.ok(generationResult.newResume.docxUrl.endsWith('.docx'));

  // Verify physical files exist on disk
  const publicDir = path.resolve('backend/public');
  const pdfDisk = path.join(publicDir, generationResult.newResume.fileUrl.replace(/^\/+/, ''));
  const docxDisk = path.join(publicDir, generationResult.newResume.docxUrl.replace(/^\/+/, ''));

  assert.ok(fs.existsSync(pdfDisk), 'Generated PDF file must exist on disk');
  assert.ok(fs.existsSync(docxDisk), 'Generated DOCX file must exist on disk');
  assert.ok(fs.statSync(pdfDisk).size > 500, 'PDF must contain valid content');
  assert.ok(fs.statSync(docxDisk).size > 500, 'DOCX must contain valid content');

  // Verify previous version 1 was deactivated
  const oldResume = await StudentResume.findById(resume1._id);
  assert.equal(oldResume.isActive, false);

  // 6. Security Isolation Check: Student 2 CANNOT access or modify Student 1's improvement
  await assert.rejects(
    () => improvementService.getImprovementById(draft._id, student2Auth),
    (err) => {
      assert.match(err.message, /not found/i);
      return true;
    }
  );

  await assert.rejects(
    () =>
      improvementService.updateSectionDecision(
        draft._id,
        'summary',
        { decision: 'ACCEPTED' },
        student2Auth
      ),
    (err) => {
      assert.match(err.message, /not found/i);
      return true;
    }
  );

  await assert.rejects(
    () => improvementService.generateApprovedResume(draft._id, student2Auth),
    (err) => {
      assert.match(err.message, /not found/i);
      return true;
    }
  );

  // Clean up test generated files
  try {
    if (fs.existsSync(pdfDisk)) fs.unlinkSync(pdfDisk);
    if (fs.existsSync(docxDisk)) fs.unlinkSync(docxDisk);
  } catch (_) {}
});
