import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { Student } from '../models/student.model.js';
import { Job } from '../models/job.model.js';
import { StudentResume } from '../models/student_resume.model.js';
import { ResumeAnalysis } from '../models/resume_analysis.model.js';
import { AppError } from '../utils/app-error.js';
import { extractResumeText } from './resume-text-extraction.service.js';
import { analyzeResume } from './ai-resume-analyzer.service.js';

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
    throw new AppError(404, 'STUDENT_NOT_FOUND', 'No student profile linked to this user account.');
  }
  return student;
}

/**
 * Uploads a resume (PDF/DOCX), extracts text, archives previous active version,
 * and synchronizes with the Student profile.
 *
 * @param {object} params
 * @param {object} params.file - Multer file object
 * @param {object} params.auth - Authenticated request credentials
 * @returns {Promise<object>}
 */
export async function uploadResume({ file, auth }) {
  const student = await resolveStudent(auth);

  if (!file || !file.buffer || file.buffer.length === 0) {
    throw new AppError(400, 'INVALID_FILE', 'Please select a valid resume document to upload.');
  }

  // 5 MB limit
  if (file.size > 5 * 1024 * 1024) {
    throw new AppError(400, 'FILE_TOO_LARGE', 'Resume file size cannot exceed 5 MB.');
  }

  // Extract readable text and parse sections
  const { text: extractedText, fileType, extractedData } = await extractResumeText(
    file.buffer,
    file.originalname,
    file.mimetype
  );

  // Determine versioning
  const latestResume = await StudentResume.findOne({ studentId: student._id }).sort({ versionNumber: -1 });
  const nextVersion = (latestResume?.versionNumber || 0) + 1;

  // Persist file on disk
  const ext = path.extname(file.originalname).toLowerCase() || (fileType === 'PDF' ? '.pdf' : '.docx');
  const storedFileName = `resume-${student._id}-v${nextVersion}-${Date.now()}${ext}`;
  const absolutePath = path.join(resumesDirectory, storedFileName);
  const fileUrl = `/uploads/resumes/${storedFileName}`;

  fs.writeFileSync(absolutePath, file.buffer);

  // Deactivate any currently active resumes for this student
  await StudentResume.updateMany(
    { studentId: student._id, isActive: true },
    { $set: { isActive: false } }
  );

  // Create new versioned StudentResume record
  const newResume = await StudentResume.create({
    studentId: student._id,
    userId: auth.userId,
    fileName: file.originalname,
    fileUrl,
    fileType,
    fileSize: file.size,
    versionNumber: nextVersion,
    isActive: true,
    extractedText,
    extractedData,
    extractionStatus: 'SUCCESS'
  });

  // Synchronize legacy/profile field on Student model
  student.resume = {
    url: fileUrl,
    fileName: file.originalname,
    fileSize: file.size,
    uploadedAt: new Date()
  };
  await student.save();

  return newResume.toObject();
}

/**
 * Returns all resume versions for the authenticated student.
 */
export async function getStudentResumes(auth) {
  const student = await resolveStudent(auth);
  return StudentResume.find({ studentId: student._id }).sort({ versionNumber: -1 }).lean();
}

/**
 * Returns the currently active resume for the student.
 */
export async function getActiveResume(auth) {
  const student = await resolveStudent(auth);
  let active = await StudentResume.findOne({ studentId: student._id, isActive: true }).lean();
  if (!active) {
    active = await StudentResume.findOne({ studentId: student._id }).sort({ versionNumber: -1 }).lean();
  }
  return active;
}

/**
 * Returns a specific resume by ID with student ownership check.
 */
export async function getResumeById(resumeId, auth) {
  const student = await resolveStudent(auth);
  const resume = await StudentResume.findById(resumeId).lean();
  if (!resume || !resume.studentId.equals(student._id)) {
    throw new AppError(404, 'RESUME_NOT_FOUND', 'Resume not found.');
  }
  return resume;
}

/**
 * Deletes a resume record. If active, promotes the preceding version to active.
 */
export async function deleteResume(resumeId, auth) {
  const student = await resolveStudent(auth);
  const resume = await StudentResume.findById(resumeId);
  if (!resume || !resume.studentId.equals(student._id)) {
    throw new AppError(404, 'RESUME_NOT_FOUND', 'Resume not found.');
  }

  // Delete physical file if present
  try {
    const diskPath = path.join(publicDirectory, resume.fileUrl.replace(/^\/+/, ''));
    if (fs.existsSync(diskPath)) {
      fs.unlinkSync(diskPath);
    }
  } catch (_) {}

  const wasActive = resume.isActive;
  await StudentResume.deleteOne({ _id: resume._id });

  if (wasActive) {
    const previous = await StudentResume.findOne({ studentId: student._id }).sort({ versionNumber: -1 });
    if (previous) {
      previous.isActive = true;
      await previous.save();
      student.resume = {
        url: previous.fileUrl,
        fileName: previous.fileName,
        fileSize: previous.fileSize,
        uploadedAt: previous.createdAt
      };
    } else {
      student.resume = undefined;
    }
    await student.save();
  }

  return { success: true, message: 'Resume deleted successfully.' };
}

/**
 * Runs AI analysis (general or job-matched) for a student's resume.
 *
 * @param {object} params
 * @param {string} params.resumeId
 * @param {string} [params.jobId]
 * @param {object} auth
 * @returns {Promise<object>}
 */
export async function analyzeResumeById({ resumeId, jobId = null }, auth) {
  const student = await resolveStudent(auth);

  let targetResumeId = resumeId;
  if (!targetResumeId) {
    const active = await getActiveResume(auth);
    if (!active) {
      throw new AppError(400, 'NO_RESUME_FOUND', 'Please upload a resume first before requesting an AI analysis.');
    }
    targetResumeId = active._id;
  }

  const resume = await StudentResume.findById(targetResumeId);
  if (!resume || !resume.studentId.equals(student._id)) {
    throw new AppError(404, 'RESUME_NOT_FOUND', 'Resume document not found.');
  }

  let job = null;
  if (jobId) {
    if (!mongoose.Types.ObjectId.isValid(jobId)) {
      throw new AppError(400, 'INVALID_JOB_ID', 'Invalid job ID provided.');
    }
    job = await Job.findById(jobId).populate('companyId', 'companyName').lean();
    if (!job) {
      throw new AppError(404, 'JOB_NOT_FOUND', 'Target job posting not found.');
    }
  }

  const analysisResult = await analyzeResume({
    resumeText: resume.extractedText,
    extractedData: resume.extractedData,
    student,
    job
  });

  const analysisRecord = await ResumeAnalysis.create({
    resumeId: resume._id,
    studentId: student._id,
    userId: auth.userId,
    resumeVersion: resume.versionNumber,
    analysisType: job ? 'JOB_MATCH' : 'GENERAL',
    jobId: job ? job._id : null,
    overallScore: analysisResult.overallScore,
    categoryScores: analysisResult.categoryScores,
    summary: analysisResult.summary,
    strengths: analysisResult.strengths,
    areasForImprovement: analysisResult.areasForImprovement,
    extractedSkills: analysisResult.extractedSkills,
    missingSections: analysisResult.missingSections,
    recommendations: analysisResult.recommendations,
    jobMatchResult: analysisResult.jobMatchResult || null,
    aiModel: analysisResult.aiModel || 'vvwu-ai-analyzer-v1',
    analysisStatus: 'COMPLETED'
  });

  return analysisRecord.toObject();
}

/**
 * Retrieves the latest completed analysis for the student's active resume.
 */
export async function getLatestAnalysis(auth) {
  const student = await resolveStudent(auth);
  const activeResume = await getActiveResume(auth);
  if (!activeResume) return null;

  return ResumeAnalysis.findOne({
    studentId: student._id,
    resumeId: activeResume._id,
    analysisStatus: 'COMPLETED'
  })
    .sort({ createdAt: -1 })
    .populate('jobId', 'title companyName jobType')
    .lean();
}

/**
 * Retrieves all analyses associated with a specific resume.
 */
export async function getAnalysesForResume(resumeId, auth) {
  const student = await resolveStudent(auth);
  return ResumeAnalysis.find({
    studentId: student._id,
    resumeId
  })
    .sort({ createdAt: -1 })
    .populate('jobId', 'title companyName jobType')
    .lean();
}

/**
 * Retrieves all historical analyses for the student across all resume versions.
 */
export async function getAllStudentAnalyses(auth) {
  const student = await resolveStudent(auth);
  return ResumeAnalysis.find({ studentId: student._id })
    .sort({ createdAt: -1 })
    .populate('jobId', 'title companyName jobType')
    .populate('resumeId', 'fileName versionNumber fileUrl')
    .lean();
}

/**
 * Retrieves an analysis record by its ID with student authorization.
 */
export async function getAnalysisById(analysisId, auth) {
  const student = await resolveStudent(auth);
  const analysis = await ResumeAnalysis.findById(analysisId)
    .populate('jobId', 'title companyName jobType roleOverview responsibilities workLocation')
    .populate('resumeId', 'fileName versionNumber fileUrl')
    .lean();

  if (!analysis || !analysis.studentId.equals(student._id)) {
    throw new AppError(404, 'ANALYSIS_NOT_FOUND', 'Resume analysis report not found.');
  }

  return analysis;
}

/**
 * Compares two analyses and computes score progression and diffs.
 */
export async function compareAnalyses({ id1, id2 }, auth) {
  const student = await resolveStudent(auth);

  const [a1, a2] = await Promise.all([
    ResumeAnalysis.findById(id1).populate('resumeId', 'versionNumber fileName').lean(),
    ResumeAnalysis.findById(id2).populate('resumeId', 'versionNumber fileName').lean()
  ]);

  if (!a1 || !a1.studentId.equals(student._id) || !a2 || !a2.studentId.equals(student._id)) {
    throw new AppError(404, 'ANALYSIS_NOT_FOUND', 'One or both analysis records not found.');
  }

  // Ensure chronological order (older is base, newer is comparison)
  const isA1Older = new Date(a1.createdAt) <= new Date(a2.createdAt);
  const base = isA1Older ? a1 : a2;
  const target = isA1Older ? a2 : a1;

  const scoreDiff = target.overallScore - base.overallScore;

  const categoryDeltas = {
    atsCompatibility: (target.categoryScores?.atsCompatibility || 0) - (base.categoryScores?.atsCompatibility || 0),
    skills: (target.categoryScores?.skills || 0) - (base.categoryScores?.skills || 0),
    education: (target.categoryScores?.education || 0) - (base.categoryScores?.education || 0),
    projects: (target.categoryScores?.projects || 0) - (base.categoryScores?.projects || 0),
    experience: (target.categoryScores?.experience || 0) - (base.categoryScores?.experience || 0),
    resumeStructure: (target.categoryScores?.resumeStructure || 0) - (base.categoryScores?.resumeStructure || 0)
  };

  const baseSkills = new Set(base.extractedSkills?.technical || []);
  const targetSkills = new Set(target.extractedSkills?.technical || []);
  const newSkillsAdded = Array.from(targetSkills).filter((s) => !baseSkills.has(s));

  return {
    baseAnalysis: {
      _id: base._id,
      version: base.resumeVersion || base.resumeId?.versionNumber || 1,
      createdAt: base.createdAt,
      overallScore: base.overallScore,
      categoryScores: base.categoryScores
    },
    targetAnalysis: {
      _id: target._id,
      version: target.resumeVersion || target.resumeId?.versionNumber || 1,
      createdAt: target.createdAt,
      overallScore: target.overallScore,
      categoryScores: target.categoryScores
    },
    scoreDiff,
    categoryDeltas,
    newSkillsAdded
  };
}

/**
 * Returns available published jobs for student resume matching.
 */
export async function getEligibleJobsForStudent(auth) {
  const student = await resolveStudent(auth);

  const query = {
    status: { $in: ['PUBLISHED', 'OPEN'] }
  };

  // If student has department, prioritize relevant jobs
  if (student.departmentId) {
    query.$or = [
      { 'eligibilityCriteria.allowedDepartmentIds': { $size: 0 } },
      { 'eligibilityCriteria.allowedDepartmentIds': student.departmentId }
    ];
  }

  const jobs = await Job.find(query)
    .populate('companyId', 'companyName')
    .select('jobId title companyId jobType workMode location eligibilityCriteria description createdAt')
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  return jobs.map((j) => ({
    ...j,
    companyName: j.companyId?.companyName || 'Campus Partner'
  }));
}
