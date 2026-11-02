import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { Student } from '../models/student.model.js';
import { StudentResume } from '../models/student_resume.model.js';
import { ResumeImprovement } from '../models/resume_improvement.model.js';
import { AppError } from '../utils/app-error.js';
import { classifyResumeDocument } from './resume-text-extraction.service.js';
import { generateResumeImprovements } from './ai-resume-improvement.service.js';
import { generateResumePdf } from './resume-pdf-generator.service.js';
import { generateResumeDocx } from './resume-docx-generator.service.js';
import { extractSourceFacts, validateImprovedSection } from './resume-fact-validation.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDirectory = path.join(__dirname, '..', '..', 'public');
const resumesDirectory = path.join(publicDirectory, 'uploads', 'resumes');

if (!fs.existsSync(resumesDirectory)) {
  fs.mkdirSync(resumesDirectory, { recursive: true });
}

/**
 * Resolves the authenticated student profile.
 */
async function resolveStudent(auth) {
  if (!auth || !auth.userId) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required.');
  }
  const student = await Student.findOne({ userId: auth.userId });
  if (!student) {
    throw new AppError(404, 'STUDENT_NOT_FOUND', 'Student profile not found.');
  }
  return student;
}

/**
 * Initiates an AI Resume Improvement draft for an existing uploaded resume.
 *
 * @param {string} resumeId
 * @param {object} auth
 * @returns {Promise<object>}
 */
export async function createResumeImprovement(resumeId, auth) {
  const student = await resolveStudent(auth);

  const resume = await StudentResume.findById(resumeId);
  if (!resume || !resume.studentId.equals(student._id)) {
    throw new AppError(404, 'RESUME_NOT_FOUND', 'Resume document not found.');
  }

  // Pre-condition: Document must be an authentic Resume/CV, not a certificate
  const classification = classifyResumeDocument(resume.extractedText);
  if (!classification.isResume) {
    throw new AppError(
      400,
      'INVALID_DOCUMENT_FOR_IMPROVEMENT',
      `Cannot improve a ${classification.documentType || 'Certificate'}. Please upload a genuine Resume or CV first.`
    );
  }

  // Run provider-independent AI improvement with fact validation
  const improvementResult = await generateResumeImprovements({
    resumeText: resume.extractedText,
    extractedData: resume.extractedData,
    student
  });

  const improvementDoc = await ResumeImprovement.create({
    studentId: student._id,
    userId: auth.userId,
    resumeId: resume._id,
    originalVersion: resume.versionNumber,
    status: 'READY_FOR_REVIEW',
    aiProvider: improvementResult.aiProvider,
    sections: improvementResult.sections,
    missingInformationQuestions: improvementResult.missingInformationQuestions,
    validationStatus: improvementResult.validationStatus
  });

  return improvementDoc.toObject();
}

/**
 * Retrieves an improvement record by ID with ownership verification.
 */
export async function getImprovementById(improvementId, auth) {
  const student = await resolveStudent(auth);

  const improvement = await ResumeImprovement.findById(improvementId);
  if (!improvement || !improvement.studentId.equals(student._id)) {
    throw new AppError(404, 'IMPROVEMENT_NOT_FOUND', 'Resume improvement record not found.');
  }

  return improvement.toObject();
}

/**
 * Retrieves the latest active improvement draft for a specific resume.
 */
export async function getLatestImprovementForResume(resumeId, auth) {
  const student = await resolveStudent(auth);

  const improvement = await ResumeImprovement.findOne({
    studentId: student._id,
    resumeId
  }).sort({ createdAt: -1 });

  return improvement ? improvement.toObject() : null;
}

/**
 * Updates a student's review decision for a specific section.
 *
 * @param {string} improvementId
 * @param {string} sectionKey
 * @param {object} payload - { decision: 'ACCEPTED'|'REJECTED'|'EDITED', editedContent }
 * @param {object} auth
 */
export async function updateSectionDecision(improvementId, sectionKey, payload = {}, auth) {
  const student = await resolveStudent(auth);

  const improvement = await ResumeImprovement.findById(improvementId);
  if (!improvement || !improvement.studentId.equals(student._id)) {
    throw new AppError(404, 'IMPROVEMENT_NOT_FOUND', 'Improvement record not found.');
  }

  const section = improvement.sections.find((s) => s.sectionKey === sectionKey);
  if (!section) {
    throw new AppError(404, 'SECTION_NOT_FOUND', `Section '${sectionKey}' not found in improvement record.`);
  }

  const decision = payload.decision || 'ACCEPTED';
  section.studentDecision = decision;

  if (decision === 'EDITED' && payload.editedContent !== undefined) {
    section.studentEditedContent = payload.editedContent;
  }

  await improvement.save();
  return improvement.toObject();
}

/**
 * Stores student answer to an optional missing information question.
 */
export async function answerMissingInfoQuestion(improvementId, questionId, answer, auth) {
  const student = await resolveStudent(auth);

  const improvement = await ResumeImprovement.findById(improvementId);
  if (!improvement || !improvement.studentId.equals(student._id)) {
    throw new AppError(404, 'IMPROVEMENT_NOT_FOUND', 'Improvement record not found.');
  }

  const q = improvement.missingInformationQuestions.find((item) => item.id === questionId);
  if (!q) {
    throw new AppError(404, 'QUESTION_NOT_FOUND', 'Question not found.');
  }

  q.studentAnswer = (answer || '').trim();
  q.isAnswered = Boolean(q.studentAnswer);

  await improvement.save();
  return improvement.toObject();
}

/**
 * Generates the final improved resume document (PDF + DOCX), preserving authentic data,
 * registering the new version, and providing instant downloads.
 *
 * @param {string} improvementId
 * @param {object} auth
 * @returns {Promise<object>}
 */
export async function generateApprovedResume(improvementId, auth) {
  const student = await resolveStudent(auth);

  const improvement = await ResumeImprovement.findById(improvementId);
  if (!improvement || !improvement.studentId.equals(student._id)) {
    throw new AppError(404, 'IMPROVEMENT_NOT_FOUND', 'Improvement record not found.');
  }

  const sourceResume = await StudentResume.findById(improvement.resumeId);
  if (!sourceResume) {
    throw new AppError(404, 'SOURCE_RESUME_NOT_FOUND', 'Original source resume not found.');
  }

  // 1. Build consolidated data from approved student decisions
  const candidateName = `${student.firstName || ''} ${student.lastName || ''}`.trim() || 'Vanita Vishram Candidate';
  const contact = {
    name: candidateName,
    email: sourceResume.extractedData?.contact?.email || student.email || '',
    phone: sourceResume.extractedData?.contact?.phone || student.mobileNumber || '',
    linkedin: sourceResume.extractedData?.contact?.linkedin || '',
    github: sourceResume.extractedData?.contact?.github || '',
    location: student.department ? `Surat, Gujarat • ${student.department}` : 'Surat, Gujarat'
  };

  function getConsolidatedSection(key) {
    const sec = improvement.sections.find((s) => s.sectionKey === key);
    if (!sec) return null;
    if (sec.studentDecision === 'REJECTED') return sec.originalContent;
    if (sec.studentDecision === 'EDITED' && sec.studentEditedContent) return sec.studentEditedContent;
    return sec.improvedContent;
  }

  const summary = getConsolidatedSection('summary') || '';
  const skills = getConsolidatedSection('skills') || sourceResume.extractedData?.skills || [];
  const projectsContent = getConsolidatedSection('projects');
  const educationContent = getConsolidatedSection('education');
  const experienceContent = getConsolidatedSection('experience');
  const certificationsContent = getConsolidatedSection('certifications');

  // Parse structured project array or string
  let projects = [];
  if (Array.isArray(projectsContent)) {
    projects = projectsContent;
  } else if (typeof projectsContent === 'string' && projectsContent.trim()) {
    const parts = projectsContent.split(/\n\s*•|\n\s*-\s*|\n{2,}/).filter(Boolean);
    projects = parts.map((p, idx) => ({
      title: idx === 0 ? 'Core Academic Project' : `Project ${idx + 1}`,
      technologies: '',
      description: p.trim()
    }));
  }

  // Parse structured education
  let education = [];
  if (Array.isArray(educationContent)) {
    education = educationContent;
  } else {
    education = [
      {
        degree: student.branch || student.department || 'B.Tech Computer Engineering',
        institution: "Vanita Vishram Women's University",
        year: 'Expected 2026',
        score: student.cgpa ? `CGPA: ${student.cgpa}` : ''
      }
    ];
  }

  // Incorporate student answers to questions if answered
  for (const q of improvement.missingInformationQuestions) {
    if (q.isAnswered && q.studentAnswer && projects.length > 0) {
      projects[0].description += ` Individual Contribution: ${q.studentAnswer}`;
    }
  }

  const resumePayload = {
    contact,
    summary,
    education,
    skills,
    projects,
    experience: Array.isArray(experienceContent) ? experienceContent : [],
    certifications: Array.isArray(certificationsContent) ? certificationsContent : []
  };

  // 2. Generate PDF and DOCX in memory
  const [pdfBuffer, docxBuffer] = await Promise.all([
    generateResumePdf(resumePayload),
    generateResumeDocx(resumePayload)
  ]);

  // 3. Persist files to disk
  const latestResume = await StudentResume.findOne({ studentId: student._id }).sort({ versionNumber: -1 });
  const nextVersion = (latestResume?.versionNumber || 0) + 1;

  const pdfFileName = `resume-${student._id}-v${nextVersion}-improved-${Date.now()}.pdf`;
  const docxFileName = `resume-${student._id}-v${nextVersion}-improved-${Date.now()}.docx`;

  const pdfDiskPath = path.join(resumesDirectory, pdfFileName);
  const docxDiskPath = path.join(resumesDirectory, docxFileName);

  fs.writeFileSync(pdfDiskPath, pdfBuffer);
  fs.writeFileSync(docxDiskPath, docxBuffer);

  const pdfUrl = `/uploads/resumes/${pdfFileName}`;
  const docxUrl = `/uploads/resumes/${docxFileName}`;

  // 4. Archive previous active versions
  await StudentResume.updateMany(
    { studentId: student._id, isActive: true },
    { $set: { isActive: false } }
  );

  // 5. Register new active version in StudentResume
  const newResume = await StudentResume.create({
    studentId: student._id,
    userId: auth.userId,
    fileName: `Improved_Resume_v${nextVersion}.pdf`,
    fileUrl: pdfUrl,
    docxUrl,
    fileType: 'PDF',
    fileSize: pdfBuffer.length,
    versionNumber: nextVersion,
    isActive: true,
    isAiImproved: true,
    improvementId: improvement._id,
    extractedText: [
      candidateName,
      contact.email,
      contact.phone,
      summary,
      typeof skills === 'string' ? skills : JSON.stringify(skills),
      projects.map((p) => `${p.title} ${p.description}`).join(' ')
    ].join('\n'),
    extractedData: {
      contact,
      skills: Array.isArray(skills) ? skills : []
    },
    extractionStatus: 'SUCCESS'
  });

  // Synchronize student profile
  student.resume = {
    url: pdfUrl,
    fileName: newResume.fileName,
    fileSize: newResume.fileSize,
    uploadedAt: new Date()
  };
  await student.save();

  // 6. Update improvement record
  improvement.status = 'GENERATED';
  improvement.generatedVersion = {
    versionNumber: nextVersion,
    newResumeId: newResume._id,
    pdfUrl,
    docxUrl,
    generatedAt: new Date()
  };
  await improvement.save();

  return {
    success: true,
    newResume: newResume.toObject(),
    generatedVersion: improvement.generatedVersion
  };
}

/**
 * Returns all past improvements for student.
 */
export async function getImprovementHistory(auth) {
  const student = await resolveStudent(auth);
  return ResumeImprovement.find({ studentId: student._id })
    .sort({ createdAt: -1 })
    .lean();
}

