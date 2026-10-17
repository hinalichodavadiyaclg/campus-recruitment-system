import mongoose from 'mongoose';
import { Application } from '../models/application.model.js';
import { Job } from '../models/job.model.js';
import { Student } from '../models/student.model.js';
import { ROLE_IDS } from '../utils/access-constants.js';
import { AppError } from '../utils/app-error.js';
import { executeWithApplicationIdRetry, getNextCandidateApplicationId } from '../utils/application-id.js';
import { getCoordinatorDepartment } from '../utils/department-scope.js';
import { findStudentByUserId } from './student.service.js';
import { findCompanyByUserId } from './company.service.js';
import { evaluateEligibility } from './eligibility.service.js';

const ALLOWED_STATUS_TRANSITIONS = {
  APPLIED: ['UNDER_REVIEW', 'SHORTLISTED', 'REJECTED'],
  UNDER_REVIEW: ['SHORTLISTED', 'ASSESSMENT', 'INTERVIEW', 'REJECTED'],
  SHORTLISTED: ['ASSESSMENT', 'INTERVIEW', 'SELECTED', 'REJECTED'],
  ASSESSMENT: ['INTERVIEW', 'SELECTED', 'REJECTED'],
  INTERVIEW: ['SELECTED', 'REJECTED']
};

export async function submitApplication({ auth, body }) {
  if (auth.userType !== 'STUDENT' && auth.roleId !== ROLE_IDS.STUDENT) {
    throw new AppError(403, 'FORBIDDEN', 'Only students can submit job applications.');
  }

  const student = await findStudentByUserId(auth.userId);
  const job = await Job.findById(body.jobId);
  if (!job) {
    throw new AppError(404, 'JOB_NOT_FOUND', 'Job posting not found.');
  }

  const recruitmentRound = job.recruitmentRound || 1;

  // Prevent duplicate application in the same recruitment round
  const existingApp = await Application.findOne({
    jobId: job._id,
    studentId: student._id,
    recruitmentRound
  });
  if (existingApp) {
    throw new AppError(
      409,
      'DUPLICATE_APPLICATION',
      'You have already submitted an application for this recruitment round.'
    );
  }

  // Server-side eligibility evaluation
  const evaluation = await evaluateEligibility({ job, student });
  if (!evaluation.isEligible) {
    throw new AppError(400, 'INELIGIBLE_FOR_JOB', evaluation.ineligibleReason, evaluation);
  }

  // Capture immutable job terms snapshot
  const jobSnapshot = {
    title: job.title,
    jobType: job.jobType,
    category: job.category,
    workMode: job.workMode,
    location: job.location,
    vacancies: job.vacancies,
    compensation: job.compensation,
    selectionProcess: job.selectionProcess,
    deadline: job.deadline,
    recruitmentRound
  };

  // Capture immutable resume snapshot from student profile
  const resumeSnapshot = {
    url: student.resume.url,
    fileName: student.resume.fileName,
    fileSize: student.resume.fileSize,
    submittedAt: new Date()
  };

  // Capture eligibility evaluation snapshot
  const eligibilitySnapshot = {
    evaluatedAt: new Date(),
    isEligible: true,
    checks: evaluation.checks,
    details: evaluation.details
  };

  const createdApp = await executeWithApplicationIdRetry(async () => {
    const candidateAppId = await getNextCandidateApplicationId();
    const application = new Application({
      applicationId: candidateAppId,
      jobId: job._id,
      studentId: student._id,
      companyId: job.companyId,
      recruitmentRound,
      status: 'APPLIED',
      jobSnapshot,
      resumeSnapshot,
      eligibilitySnapshot,
      statusHistory: [
        {
          previousStatus: null,
          newStatus: 'APPLIED',
          changedBy: auth.userId,
          changedAt: new Date(),
          note: 'Application submitted successfully.'
        }
      ]
    });
    return await application.save();
  });

  return await Application.findById(createdApp._id)
    .populate('jobId', 'jobId title jobType workMode location deadline status')
    .populate('companyId', 'companyName companyId officeAddress website industryType')
    .populate('studentId', 'firstName lastName universityId email mobileNumber branch department cgpa');
}

export async function listApplications({ auth, query = {} }) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const mongoQuery = {};

  if (auth.userType === 'STUDENT' || auth.roleId === ROLE_IDS.STUDENT) {
    const student = await findStudentByUserId(auth.userId);
    mongoQuery.studentId = student._id;
  } else if (auth.userType === 'COMPANY' || auth.roleId === ROLE_IDS.COMPANY) {
    const company = await findCompanyByUserId(auth.userId);
    mongoQuery.companyId = company._id;
    if (query.jobId) mongoQuery.jobId = query.jobId;
  } else if (auth.roleId === ROLE_IDS.PLACEMENT_COORDINATOR) {
    const coordDept = await getCoordinatorDepartment(auth);
    const deptStudentIds = await Student.find({
      $or: [
        { departmentId: coordDept.departmentId },
        { department: new RegExp(`^${coordDept.departmentName.trim()}$`, 'i') }
      ]
    }).distinct('_id');

    mongoQuery.studentId = { $in: deptStudentIds };
    if (query.jobId) mongoQuery.jobId = query.jobId;
    if (query.companyId) mongoQuery.companyId = query.companyId;
  } else if (
    auth.roleId === ROLE_IDS.PLACEMENT_HEAD ||
    auth.roleId === ROLE_IDS.SUPER_ADMIN
  ) {
    if (query.jobId) mongoQuery.jobId = query.jobId;
    if (query.companyId) mongoQuery.companyId = query.companyId;
    if (query.studentId) mongoQuery.studentId = query.studentId;
  } else {
    throw new AppError(403, 'FORBIDDEN', 'You do not have permission to view applications.');
  }

  if (query.status) {
    mongoQuery.status = query.status;
  }
  if (query.recruitmentRound) {
    mongoQuery.recruitmentRound = Number(query.recruitmentRound);
  }

  const [items, total] = await Promise.all([
    Application.find(mongoQuery)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('jobId', 'jobId title jobType workMode location deadline status')
      .populate('companyId', 'companyName companyId officeAddress website industryType')
      .populate('studentId', 'firstName lastName universityId email mobileNumber branch department cgpa'),
    Application.countDocuments(mongoQuery)
  ]);

  return { items, page, limit, total };
}

export async function getApplicationById({ auth, id }) {
  const application = await Application.findById(id)
    .populate('jobId')
    .populate('companyId', 'companyName companyId officeAddress website industryType hrRecruiterName email')
    .populate('studentId')
    .populate('statusHistory.changedBy', 'email userType');

  if (!application) {
    throw new AppError(404, 'APPLICATION_NOT_FOUND', 'Application record not found.');
  }

  if (auth.userType === 'STUDENT' || auth.roleId === ROLE_IDS.STUDENT) {
    const student = await findStudentByUserId(auth.userId);
    const appStudentId = application.studentId?._id || application.studentId;
    if (String(appStudentId) !== String(student._id)) {
      throw new AppError(403, 'FORBIDDEN', 'You do not have permission to view another student\'s application.');
    }
  } else if (auth.userType === 'COMPANY' || auth.roleId === ROLE_IDS.COMPANY) {
    const company = await findCompanyByUserId(auth.userId);
    const appCompanyId = application.companyId?._id || application.companyId;
    if (String(appCompanyId) !== String(company._id)) {
      throw new AppError(403, 'FORBIDDEN', 'You do not have permission to view applications for another company.');
    }
  } else if (auth.roleId === ROLE_IDS.PLACEMENT_COORDINATOR) {
    const coordDept = await getCoordinatorDepartment(auth);
    const student = application.studentId;
    const matchesDept =
      (student.departmentId && String(student.departmentId) === String(coordDept.departmentId)) ||
      (student.department && student.department.trim().toLowerCase() === coordDept.departmentName.trim().toLowerCase());
    if (!matchesDept) {
      throw new AppError(403, 'FORBIDDEN', 'You are not authorized to view applications from another department.');
    }
  }

  return application;
}

export async function updateApplicationStatus({ auth, id, status, note, reviewerNotes }) {
  if (
    auth.userType !== 'COMPANY' &&
    auth.roleId !== ROLE_IDS.COMPANY &&
    auth.roleId !== ROLE_IDS.PLACEMENT_HEAD &&
    auth.roleId !== ROLE_IDS.SUPER_ADMIN
  ) {
    throw new AppError(403, 'FORBIDDEN', 'You do not have permission to update application status.');
  }

  const application = await Application.findById(id);
  if (!application) {
    throw new AppError(404, 'APPLICATION_NOT_FOUND', 'Application record not found.');
  }

  if (auth.userType === 'COMPANY' || auth.roleId === ROLE_IDS.COMPANY) {
    const company = await findCompanyByUserId(auth.userId);
    if (String(application.companyId) !== String(company._id)) {
      throw new AppError(403, 'FORBIDDEN', 'You do not have permission to update applications for another company.');
    }
  }

  if (status === application.status) {
    return application;
  }

  // Reject modifications on terminal statuses
  if (['SELECTED', 'REJECTED', 'WITHDRAWN'].includes(application.status)) {
    throw new AppError(
      400,
      'INVALID_STATUS_TRANSITION',
      `Applications in terminal status (${application.status}) cannot be modified.`
    );
  }

  // Validate allowed forward stage transitions
  const allowedNext = ALLOWED_STATUS_TRANSITIONS[application.status] || [];
  if (!allowedNext.includes(status)) {
    throw new AppError(
      400,
      'INVALID_STATUS_TRANSITION',
      `Cannot transition application from ${application.status} to ${status}.`
    );
  }

  const previousStatus = application.status;
  application.status = status;
  application.statusHistory.push({
    previousStatus,
    newStatus: status,
    changedBy: auth.userId,
    changedAt: new Date(),
    note: note || (reviewerNotes ? `Reviewer: ${reviewerNotes}` : `Application status updated to ${status}`)
  });

  await application.save();

  return await Application.findById(application._id)
    .populate('jobId', 'jobId title jobType workMode location deadline status')
    .populate('companyId', 'companyName companyId officeAddress website industryType')
    .populate('studentId', 'firstName lastName universityId email mobileNumber branch department cgpa')
    .populate('statusHistory.changedBy', 'email userType');
}

export async function withdrawApplication({ auth, id, reason }) {
  if (auth.userType !== 'STUDENT' && auth.roleId !== ROLE_IDS.STUDENT) {
    throw new AppError(403, 'FORBIDDEN', 'Only candidates can withdraw their own applications.');
  }

  const student = await findStudentByUserId(auth.userId);
  const application = await Application.findById(id);
  if (!application) {
    throw new AppError(404, 'APPLICATION_NOT_FOUND', 'Application record not found.');
  }

  if (String(application.studentId) !== String(student._id)) {
    throw new AppError(403, 'FORBIDDEN', 'You do not have permission to withdraw another candidate\'s application.');
  }

  if (application.status === 'WITHDRAWN') {
    return application;
  }

  if (['SELECTED', 'REJECTED'].includes(application.status)) {
    throw new AppError(
      400,
      'CANNOT_WITHDRAW',
      `Applications that have reached ${application.status} cannot be withdrawn.`
    );
  }

  const previousStatus = application.status;
  application.status = 'WITHDRAWN';
  application.statusHistory.push({
    previousStatus,
    newStatus: 'WITHDRAWN',
    changedBy: auth.userId,
    changedAt: new Date(),
    note: reason || 'Application withdrawn by candidate.'
  });

  await application.save();

  return await Application.findById(application._id)
    .populate('jobId', 'jobId title jobType workMode location deadline status')
    .populate('companyId', 'companyName companyId officeAddress website industryType')
    .populate('studentId', 'firstName lastName universityId email mobileNumber branch department cgpa');
}
