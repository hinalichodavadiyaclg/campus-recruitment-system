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
import {
  dispatchApplicationReceivedNotification,
  dispatchApplicationStatusChangedNotification,
  dispatchApplicationWithdrawnNotification
} from './notification.service.js';

const ALLOWED_STATUS_TRANSITIONS = {
  APPLIED: ['UNDER_REVIEW', 'SHORTLISTED', 'REJECTED'],
  UNDER_REVIEW: ['SHORTLISTED', 'ASSESSMENT', 'INTERVIEW', 'REJECTED'],
  SHORTLISTED: ['ASSESSMENT', 'INTERVIEW', 'SELECTED', 'REJECTED'],
  ASSESSMENT: ['INTERVIEW', 'SELECTED', 'REJECTED'],
  INTERVIEW: ['SELECTED', 'REJECTED']
};

export const MAX_APPLICATION_ATTEMPTS = 3;

export async function submitApplication({ auth, body }) {
  if (auth.userType !== 'STUDENT' && auth.roleId !== ROLE_IDS.STUDENT) {
    throw new AppError(403, 'FORBIDDEN', 'Only students can submit job applications.');
  }

  const student = await findStudentByUserId(auth.userId);
  const job = await Job.findById(body.jobId);
  if (!job) {
    throw new AppError(404, 'JOB_NOT_FOUND', 'Job posting not found.');
  }

  // 1. Validate job status, suspension, and deadline
  if (job.status !== 'OPEN') {
    throw new AppError(400, 'JOB_NOT_OPEN', 'Applications can only be submitted for open jobs.');
  }
  if (job.isSuspended) {
    throw new AppError(400, 'JOB_SUSPENDED', 'This job posting has been suspended.');
  }
  if (job.deadline && new Date() > new Date(job.deadline)) {
    throw new AppError(400, 'APPLICATION_DEADLINE_PASSED', 'The application deadline for this job has passed.');
  }

  const recruitmentRound = job.recruitmentRound || 1;

  // 2. Query all existing application attempts for this student, job, and round
  const existingAttempts = await Application.find({
    jobId: job._id,
    studentId: student._id,
    recruitmentRound
  }).sort({ attemptNumber: 1 });

  const attemptsUsed = existingAttempts.length;

  // 3. Strict attempt ceiling (Max 3 attempts per job per recruitment round)
  if (attemptsUsed >= MAX_APPLICATION_ATTEMPTS) {
    throw new AppError(
      400,
      'MAX_APPLICATION_ATTEMPTS_REACHED',
      `You have reached the maximum allowed application attempts (${MAX_APPLICATION_ATTEMPTS}) for this recruitment round.`
    );
  }

  // 4. Verify previous attempt status (reapplication only allowed after WITHDRAWN)
  if (existingAttempts.length > 0) {
    const latestAttempt = existingAttempts[existingAttempts.length - 1];

    const activeStatuses = ['APPLIED', 'UNDER_REVIEW', 'SHORTLISTED', 'ASSESSMENT', 'INTERVIEW'];
    if (activeStatuses.includes(latestAttempt.status)) {
      throw new AppError(
        409,
        'DUPLICATE_APPLICATION',
        'You already have an active application for this job posting in the current recruitment round.'
      );
    }

    if (latestAttempt.status === 'SELECTED') {
      throw new AppError(
        400,
        'REAPPLICATION_NOT_ALLOWED',
        'Reapplication is not permitted after being selected for this job.'
      );
    }
    if (latestAttempt.status === 'REJECTED') {
      throw new AppError(
        400,
        'REAPPLICATION_NOT_ALLOWED',
        'Reapplication is not permitted after being rejected for this job.'
      );
    }

    if (latestAttempt.status !== 'WITHDRAWN') {
      throw new AppError(
        400,
        'REAPPLICATION_NOT_ALLOWED',
        'You can only reapply after withdrawing your previous application.'
      );
    }
  }

  const attemptNumber = attemptsUsed + 1;
  const isReapplication = attemptNumber > 1;

  // Determine active resume: custom job-specific resume or student profile resume
  let selectedResume = null;
  if (body.customResume && body.customResume.url && body.customResume.url.trim()) {
    selectedResume = {
      url: body.customResume.url.trim(),
      fileName: body.customResume.fileName || 'Job_Specific_Resume.pdf',
      fileSize: body.customResume.fileSize,
      source: 'JOB_SPECIFIC'
    };
  } else if (student.resume?.url && student.resume.url.trim()) {
    selectedResume = {
      url: student.resume.url.trim(),
      fileName: student.resume.fileName || 'Candidate_Resume.pdf',
      fileSize: student.resume.fileSize,
      source: 'PROFILE'
    };
  }

  // Server-side eligibility evaluation
  const evaluation = await evaluateEligibility({ job, student, resume: selectedResume });
  if (!evaluation.isEligible) {
    throw new AppError(400, 'INELIGIBLE_FOR_JOB', evaluation.ineligibleReason, evaluation);
  }

  if (!selectedResume || !selectedResume.url) {
    throw new AppError(400, 'RESUME_REQUIRED', 'A valid resume must be selected or uploaded before submitting an application.');
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

  // Capture immutable resume snapshot (does not overwrite student profile resume)
  const resumeSnapshot = {
    url: selectedResume.url,
    fileName: selectedResume.fileName,
    fileSize: selectedResume.fileSize,
    source: selectedResume.source || 'PROFILE',
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
      attemptNumber,
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
          note: isReapplication
            ? `Application re-submitted (attempt ${attemptNumber} of ${MAX_APPLICATION_ATTEMPTS}).`
            : 'Application submitted successfully.'
        }
      ]
    });
    try {
      return await application.save();
    } catch (saveErr) {
      if (saveErr.code === 11000) {
        throw new AppError(
          409,
          'APPLICATION_ALREADY_ACTIVE',
          'An active application already exists or another application attempt is in progress.'
        );
      }
      throw saveErr;
    }
  });

  dispatchApplicationReceivedNotification({
    application: createdApp,
    job,
    student,
    isReapplication,
    attemptNumber
  }).catch(err => {
    console.error('Failed to dispatch application received notification:', err.message);
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

  // Case 1: Student listing their own applications (consolidated per studentId + jobId + recruitmentRound)
  if (auth.userType === 'STUDENT' || auth.roleId === ROLE_IDS.STUDENT) {
    const student = await findStudentByUserId(auth.userId);
    const matchCriteria = { studentId: student._id };

    if (query.recruitmentRound) {
      matchCriteria.recruitmentRound = Number(query.recruitmentRound);
    }
    if (query.jobId && mongoose.Types.ObjectId.isValid(query.jobId)) {
      matchCriteria.jobId = new mongoose.Types.ObjectId(query.jobId);
    }
    if (query.search && query.search.trim()) {
      const searchRegex = new RegExp(query.search.trim(), 'i');
      const matchingJobs = await Job.find({
        $or: [
          { title: searchRegex },
          { jobId: searchRegex }
        ]
      }).distinct('_id');
      matchCriteria.$or = [
        { jobId: { $in: matchingJobs } },
        { 'jobSnapshot.title': searchRegex }
      ];
    }

    const studentPipeline = [
      { $match: matchCriteria },
      { $sort: { createdAt: -1, attemptNumber: -1 } },
      {
        $group: {
          _id: { jobId: '$jobId', recruitmentRound: '$recruitmentRound' },
          latestApp: { $first: '$$ROOT' },
          totalAttempts: { $sum: 1 },
          allAttempts: {
            $push: {
              _id: '$_id',
              applicationId: '$applicationId',
              attemptNumber: '$attemptNumber',
              status: '$status',
              createdAt: '$createdAt',
              resumeSnapshot: '$resumeSnapshot',
              eligibilitySnapshot: '$eligibilitySnapshot',
              statusHistory: '$statusHistory'
            }
          }
        }
      },
      {
        $replaceRoot: {
          newRoot: {
            $mergeObjects: [
              '$latestApp',
              {
                totalAttempts: '$totalAttempts',
                allAttempts: '$allAttempts'
              }
            ]
          }
        }
      }
    ];

    if (query.status) {
      studentPipeline.push({ $match: { status: query.status } });
    }

    studentPipeline.push({
      $facet: {
        items: [
          { $sort: { createdAt: -1 } },
          { $skip: skip },
          { $limit: limit }
        ],
        totalCount: [
          { $count: 'count' }
        ]
      }
    });

    const [aggResult] = await Application.aggregate(studentPipeline);
    const rawItems = aggResult?.items || [];
    const total = aggResult?.totalCount?.[0]?.count || 0;

    const populatedItems = await Application.populate(rawItems, [
      { path: 'jobId', select: 'jobId title jobType workMode location deadline status' },
      { path: 'companyId', select: 'companyName companyId officeAddress website industryType' },
      { path: 'studentId', select: 'firstName lastName universityId email mobileNumber branch department cgpa passingYear' }
    ]);

    return { items: populatedItems, page, limit, total };
  }

  // Case 2: Recruiter / Placement Staff ATS view (grouped by student and job; displays candidate's latest attempt)
  const matchCriteria = {};

  if (auth.userType === 'COMPANY' || auth.roleId === ROLE_IDS.COMPANY) {
    const company = await findCompanyByUserId(auth.userId);
    matchCriteria.companyId = company._id;
    if (query.jobId && mongoose.Types.ObjectId.isValid(query.jobId)) {
      matchCriteria.jobId = new mongoose.Types.ObjectId(query.jobId);
    }
  } else if (auth.roleId === ROLE_IDS.PLACEMENT_COORDINATOR) {
    const coordDept = await getCoordinatorDepartment(auth);
    const deptStudentIds = await Student.find({
      $or: [
        { departmentId: coordDept.departmentId },
        { department: new RegExp(`^${coordDept.departmentName.trim()}$`, 'i') }
      ]
    }).distinct('_id');

    matchCriteria.studentId = { $in: deptStudentIds };
    if (query.jobId && mongoose.Types.ObjectId.isValid(query.jobId)) {
      matchCriteria.jobId = new mongoose.Types.ObjectId(query.jobId);
    }
    if (query.companyId && mongoose.Types.ObjectId.isValid(query.companyId)) {
      matchCriteria.companyId = new mongoose.Types.ObjectId(query.companyId);
    }
  } else if (
    auth.roleId === ROLE_IDS.PLACEMENT_HEAD ||
    auth.roleId === ROLE_IDS.SUPER_ADMIN
  ) {
    if (query.jobId && mongoose.Types.ObjectId.isValid(query.jobId)) {
      matchCriteria.jobId = new mongoose.Types.ObjectId(query.jobId);
    }
    if (query.companyId && mongoose.Types.ObjectId.isValid(query.companyId)) {
      matchCriteria.companyId = new mongoose.Types.ObjectId(query.companyId);
    }
    if (query.studentId && mongoose.Types.ObjectId.isValid(query.studentId)) {
      matchCriteria.studentId = new mongoose.Types.ObjectId(query.studentId);
    }
  } else {
    throw new AppError(403, 'FORBIDDEN', 'You do not have permission to view applications.');
  }

  if (query.recruitmentRound) {
    matchCriteria.recruitmentRound = Number(query.recruitmentRound);
  }

  // Recruiter & Placement cell applicant filtering by passing year (batch) and minimum CGPA
  if (query.passingYear || (query.minCgpa !== undefined && query.minCgpa !== null && query.minCgpa !== '')) {
    const studentFilter = {};
    if (query.passingYear) {
      studentFilter.passingYear = Number(query.passingYear);
    }
    if (query.minCgpa !== undefined && query.minCgpa !== null && query.minCgpa !== '') {
      studentFilter.cgpa = { $gte: Number(query.minCgpa) };
    }
    const matchingStudentIds = await Student.find(studentFilter).distinct('_id');

    if (matchCriteria.studentId) {
      if (Array.isArray(matchCriteria.studentId.$in)) {
        const matchingSet = new Set(matchingStudentIds.map(String));
        matchCriteria.studentId.$in = matchCriteria.studentId.$in.filter((id) =>
          matchingSet.has(String(id))
        );
      } else {
        const currentId = String(matchCriteria.studentId);
        const matchingSet = new Set(matchingStudentIds.map(String));
        matchCriteria.studentId = matchingSet.has(currentId) ? currentId : null;
      }
    } else {
      matchCriteria.studentId = { $in: matchingStudentIds };
    }
  }

  // Search filter across candidate details and job title
  if (query.search && query.search.trim()) {
    const searchRegex = new RegExp(query.search.trim(), 'i');
    const [matchingStudents, matchingJobs] = await Promise.all([
      Student.find({
        $or: [
          { firstName: searchRegex },
          { lastName: searchRegex },
          { universityId: searchRegex },
          { email: searchRegex },
          { department: searchRegex }
        ]
      }).distinct('_id'),
      Job.find({
        $or: [
          { title: searchRegex },
          { jobId: searchRegex }
        ]
      }).distinct('_id')
    ]);

    const orClauses = [];
    if (matchingStudents.length > 0) {
      orClauses.push({ studentId: { $in: matchingStudents } });
    }
    if (matchingJobs.length > 0) {
      orClauses.push({ jobId: { $in: matchingJobs } });
    }

    if (orClauses.length > 0) {
      matchCriteria.$or = orClauses;
    } else {
      matchCriteria._id = null;
    }
  }

  const pipeline = [
    { $match: matchCriteria },
    { $sort: { createdAt: -1, attemptNumber: -1 } },
    {
      $group: {
        _id: { jobId: '$jobId', studentId: '$studentId' },
        latestApp: { $first: '$$ROOT' },
        totalAttempts: { $sum: 1 },
        allAttempts: {
          $push: {
            _id: '$_id',
            applicationId: '$applicationId',
            attemptNumber: '$attemptNumber',
            status: '$status',
            createdAt: '$createdAt',
            resumeSnapshot: '$resumeSnapshot',
            eligibilitySnapshot: '$eligibilitySnapshot',
            statusHistory: '$statusHistory'
          }
        }
      }
    },
    {
      $replaceRoot: {
        newRoot: {
          $mergeObjects: [
            '$latestApp',
            {
              totalAttempts: '$totalAttempts',
              allAttempts: '$allAttempts'
            }
          ]
        }
      }
    }
  ];

  if (query.status) {
    pipeline.push({ $match: { status: query.status } });
  }

  pipeline.push({
    $facet: {
      items: [
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: limit }
      ],
      totalCount: [
        { $count: 'count' }
      ]
    }
  });

  const [aggResult] = await Application.aggregate(pipeline);
  const items = aggResult?.items || [];
  const total = aggResult?.totalCount?.[0]?.count || 0;

  const populatedItems = await Application.populate(items, [
    { path: 'jobId', select: 'jobId title jobType workMode location deadline status' },
    { path: 'companyId', select: 'companyName companyId officeAddress website industryType' },
    { path: 'studentId', select: 'firstName lastName universityId email mobileNumber branch department cgpa passingYear' }
  ]);

  return { items: populatedItems, page, limit, total };
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
      (student?.departmentId && String(student.departmentId) === String(coordDept.departmentId)) ||
      (student?.department && student.department.trim().toLowerCase() === coordDept.departmentName.trim().toLowerCase());
    if (!matchesDept) {
      throw new AppError(403, 'FORBIDDEN', 'You are not authorized to view applications from another department.');
    }
  }

  // Load complete application attempt history in descending order
  const historyQuery = {
    jobId: application.jobId?._id || application.jobId,
    studentId: application.studentId?._id || application.studentId
  };

  // For students, isolate attempts to the drive's recruitment round
  if (auth.userType === 'STUDENT' || auth.roleId === ROLE_IDS.STUDENT) {
    historyQuery.recruitmentRound = application.recruitmentRound || 1;
  }

  const attemptHistory = await Application.find(historyQuery)
    .sort({ recruitmentRound: -1, attemptNumber: -1, createdAt: -1 })
    .populate('statusHistory.changedBy', 'email userType')
    .lean();

  const appObj = application.toObject();
  appObj.attemptHistory = attemptHistory;
  appObj.totalAttempts = attemptHistory.length;

  return appObj;
}

export async function updateApplicationStatus({ auth, id, status, note, reviewerNotes }) {
  const application = await Application.findById(id);
  if (!application) {
    throw new AppError(404, 'APPLICATION_NOT_FOUND', 'Application record not found.');
  }

  // 1. Verify that the job has an assigned hiring company
  const job = await Job.findById(application.jobId).select('companyId createdBy');
  const assignedCompanyId = job?.companyId || application.companyId;
  if (!assignedCompanyId) {
    throw new AppError(400, 'NO_ASSIGNED_COMPANY', 'This job posting does not have an assigned hiring company.');
  }

  // 2. Resource ownership / scope authorization checks:
  if (auth.userType === 'COMPANY' || auth.roleId === ROLE_IDS.COMPANY || auth.companyId) {
    const company = await findCompanyByUserId(auth.userId);
    if (!company || String(assignedCompanyId) !== String(company._id)) {
      throw new AppError(403, 'FORBIDDEN', 'You do not have permission to update applications for another company.');
    }
  } else if (auth.roleId === ROLE_IDS.PLACEMENT_COORDINATOR) {
    // If a Placement Coordinator is granted APPLICATION_UPDATE dynamically, enforce assigned department
    const coordDept = await getCoordinatorDepartment(auth);
    if (!coordDept?.departmentId) {
      throw new AppError(403, 'FORBIDDEN', 'Placement Coordinator has no assigned department.');
    }
    const student = await Student.findById(application.studentId).lean();
    const matchesDept =
      (student?.departmentId && String(student?.departmentId) === String(coordDept.departmentId)) ||
      (student?.department && student?.department.trim().toLowerCase() === coordDept.departmentName.trim().toLowerCase());
    if (!matchesDept) {
      throw new AppError(403, 'FORBIDDEN', 'You are not authorized to update applications from another department.');
    }
  } else if (auth.userType === 'STUDENT' || auth.roleId === ROLE_IDS.STUDENT) {
    throw new AppError(403, 'FORBIDDEN', 'Students cannot update application recruitment stages.');
  } else if (auth.userType === 'PLACEMENT' || [ROLE_IDS.SUPER_ADMIN, ROLE_IDS.PLACEMENT_HEAD].includes(auth.roleId)) {
    // Authorized institutional staff (Super Admin, Placement Head) have institution-wide oversight
  } else {
    throw new AppError(403, 'FORBIDDEN', 'You do not have authorized access to update this application.');
  }

  if (status === application.status) {
    return application;
  }

  // 3. Reject modifications on terminal statuses
  if (['SELECTED', 'REJECTED', 'WITHDRAWN'].includes(application.status)) {
    throw new AppError(
      400,
      'INVALID_STATUS_TRANSITION',
      `Applications in terminal status (${application.status}) cannot be modified.`
    );
  }

  // 4. Historical attempts cannot be modified
  const latestAttempt = await Application.findOne({
    jobId: application.jobId,
    studentId: application.studentId,
    recruitmentRound: application.recruitmentRound
  }).sort({ attemptNumber: -1 });

  if (latestAttempt && String(latestAttempt._id) !== String(application._id)) {
    throw new AppError(
      400,
      'HISTORICAL_ATTEMPT_LOCKED',
      'Historical application attempts cannot be modified. Only the candidate\'s active or latest attempt can be updated.'
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

  const jobTitle = application.jobSnapshot?.title;
  dispatchApplicationStatusChangedNotification({ application, previousStatus, newStatus: status, jobTitle }).catch(err => {
    console.error('Failed to dispatch application status change notification:', err.message);
  });

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

  Job.findById(application.jobId).lean().then(job => {
    if (job) {
      dispatchApplicationWithdrawnNotification({ application, job, student }).catch(err => {
        console.error('Failed to dispatch application withdrawn notification:', err.message);
      });
    }
  }).catch(err => {
    console.error('Failed to look up job for application withdrawn notification:', err.message);
  });

  return await Application.findById(application._id)
    .populate('jobId', 'jobId title jobType workMode location deadline status')
    .populate('companyId', 'companyName companyId officeAddress website industryType')
    .populate('studentId', 'firstName lastName universityId email mobileNumber branch department cgpa');
}

export async function getApplicationResumeFile({ auth, id }) {
  const application = await getApplicationById({ auth, id });
  if (!application.resumeSnapshot?.url) {
    throw new AppError(404, 'RESUME_NOT_FOUND', 'No resume snapshot recorded for this application.');
  }
  return {
    url: application.resumeSnapshot.url,
    fileName: application.resumeSnapshot.fileName || 'Resume.pdf'
  };
}
