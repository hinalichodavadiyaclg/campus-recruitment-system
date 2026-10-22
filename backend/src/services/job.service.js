import { Job } from '../models/job.model.js';
import { Company } from '../models/company.model.js';
import { Application } from '../models/application.model.js';
import { Student } from '../models/student.model.js';
import { ROLE_IDS } from '../utils/access-constants.js';
import { AppError } from '../utils/app-error.js';
import { executeWithJobIdRetry, getNextCandidateJobId } from '../utils/job-id.js';
import { getCoordinatorDepartment } from '../utils/department-scope.js';
import { findCompanyByUserId } from './company.service.js';
import {
  dispatchJobPublishedNotifications,
  dispatchJobReopenedNotifications,
  dispatchJobStatusChangedNotifications
} from './notification.service.js';

export async function createJob({ auth, body }) {
  let companyId;

  if (auth.userType === 'COMPANY' || auth.roleId === ROLE_IDS.COMPANY) {
    const company = await findCompanyByUserId(auth.userId);
    companyId = company._id;
  } else if (
    auth.roleId === ROLE_IDS.PLACEMENT_HEAD ||
    auth.roleId === ROLE_IDS.SUPER_ADMIN
  ) {
    if (!body.companyId) {
      throw new AppError(400, 'COMPANY_ID_REQUIRED', 'companyId is required when creating a job posting as administrator.');
    }
    const company = await Company.findById(body.companyId);
    if (!company) {
      throw new AppError(404, 'COMPANY_NOT_FOUND', 'Company profile not found.');
    }
    companyId = company._id;
  } else {
    throw new AppError(403, 'FORBIDDEN', 'You do not have permission to create job postings.');
  }

  const deadline = new Date(body.deadline);
  if (body.status === 'OPEN' && deadline <= new Date()) {
    throw new AppError(400, 'INVALID_DEADLINE', 'Job deadline must be in the future when publishing.');
  }

  const jobData = {
    ...body,
    companyId,
    createdBy: auth.userId,
    recruitmentRound: 1,
    publishedAt: body.status === 'OPEN' ? new Date() : undefined,
    history: [
      {
        action: 'CREATED',
        changedBy: auth.userId,
        note: 'Job posting created',
        changedAt: new Date()
      }
    ]
  };

  const createdJob = await executeWithJobIdRetry(async () => {
    const candidateJobId = await getNextCandidateJobId();
    const job = new Job({
      ...jobData,
      jobId: candidateJobId
    });
    return await job.save();
  });

  if (createdJob.status === 'OPEN') {
    dispatchJobPublishedNotifications(createdJob).catch(err => {
      console.error('Failed to dispatch job published notifications:', err.message);
    });
  }

  return await Job.findById(createdJob._id)
    .populate('companyId', 'companyName companyId officeAddress website industryType')
    .populate('eligibilityCriteria.allowedDepartmentIds', 'name code')
    .populate('eligibilityCriteria.allowedCourseIds', 'name code level');
}

export async function listJobs({ auth, query = {} }) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const mongoQuery = {};

  if (auth.userType === 'STUDENT' || auth.roleId === ROLE_IDS.STUDENT) {
    // Students can only see published, non-suspended, non-expired jobs
    mongoQuery.status = 'OPEN';
    mongoQuery.isSuspended = false;
    mongoQuery.deadline = { $gte: new Date() };
  } else if (auth.userType === 'COMPANY' || auth.roleId === ROLE_IDS.COMPANY) {
    // Companies see all their own jobs across all statuses, but cannot see other companies' jobs
    const company = await findCompanyByUserId(auth.userId);
    mongoQuery.companyId = company._id;
    if (query.status) {
      mongoQuery.status = query.status;
    }
  } else if (auth.roleId === ROLE_IDS.PLACEMENT_COORDINATOR) {
    // Placement coordinator is scoped to jobs relevant to their assigned department
    try {
      const coordDept = await getCoordinatorDepartment(auth);
      if (coordDept?.departmentId) {
        mongoQuery.$and = mongoQuery.$and || [];
        mongoQuery.$and.push({
          $or: [
            { eligibilityMode: 'ALL_STUDENTS' },
            { 'eligibilityCriteria.allowedDepartmentIds': { $size: 0 } },
            { 'eligibilityCriteria.allowedDepartmentIds': coordDept.departmentId }
          ]
        });
      }
    } catch {
      // Gracefully handle coordinator without department assignment
    }
    if (query.companyId) mongoQuery.companyId = query.companyId;
    if (query.status) mongoQuery.status = query.status;
  } else if (
    auth.roleId === ROLE_IDS.PLACEMENT_HEAD ||
    auth.roleId === ROLE_IDS.SUPER_ADMIN
  ) {
    // Placement Head & Super Admin oversee institution-wide jobs
    if (query.companyId) mongoQuery.companyId = query.companyId;
    if (query.status) mongoQuery.status = query.status;
  } else {
    throw new AppError(403, 'FORBIDDEN', 'You do not have permission to view job postings.');
  }

  if (query.jobType) {
    mongoQuery.jobType = query.jobType;
  }
  if (query.workMode) {
    mongoQuery.workMode = query.workMode;
  }
  if (query.departmentId) {
    mongoQuery.$and = mongoQuery.$and || [];
    mongoQuery.$and.push({
      $or: [
        { eligibilityMode: 'ALL_STUDENTS' },
        { 'eligibilityCriteria.allowedDepartmentIds': { $size: 0 } },
        { 'eligibilityCriteria.allowedDepartmentIds': query.departmentId }
      ]
    });
  }
  if (query.courseId) {
    mongoQuery.$and = mongoQuery.$and || [];
    mongoQuery.$and.push({
      $or: [
        { eligibilityMode: 'ALL_STUDENTS' },
        { 'eligibilityCriteria.allowedCourseIds': { $size: 0 } },
        { 'eligibilityCriteria.allowedCourseIds': query.courseId }
      ]
    });
  }
  if (query.search && query.search.trim()) {
    const regex = new RegExp(query.search.trim(), 'i');
    mongoQuery.$and = mongoQuery.$and || [];
    mongoQuery.$and.push({
      $or: [{ title: regex }, { jobId: regex }, { category: regex }]
    });
  }

  const [rawItems, total] = await Promise.all([
    Job.find(mongoQuery)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('companyId', 'companyName companyId officeAddress website industryType')
      .populate('eligibilityCriteria.allowedDepartmentIds', 'name code')
      .populate('eligibilityCriteria.allowedCourseIds', 'name code level'),
    Job.countDocuments(mongoQuery)
  ]);

  // Authoritatively compute application counts for each returned job within permitted scope
  const jobIds = rawItems.map((j) => j._id);
  let countMap = new Map();

  if (jobIds.length > 0 && auth.roleId !== ROLE_IDS.STUDENT && auth.userType !== 'STUDENT') {
    const appMatch = { jobId: { $in: jobIds } };

    if (auth.roleId === ROLE_IDS.PLACEMENT_COORDINATOR) {
      // Coordinator sees count of applications only from students within their department scope
      try {
        const coordDept = await getCoordinatorDepartment(auth);
        if (coordDept?.departmentId) {
          const scopedStudentIds = await Student.find({
            $or: [
              { departmentId: coordDept.departmentId },
              { department: new RegExp(`^${coordDept.departmentName.trim()}$`, 'i') }
            ]
          }).distinct('_id');
          appMatch.studentId = { $in: scopedStudentIds };
        }
      } catch {
        // Coordinator without profile
      }
    }

    const appCounts = await Application.aggregate([
      { $match: appMatch },
      { $group: { _id: '$jobId', count: { $sum: 1 } } }
    ]);
    countMap = new Map(appCounts.map((c) => [String(c._id), c.count]));
  }

  const items = rawItems.map((doc) => {
    const item = doc.toObject ? doc.toObject() : { ...doc };
    item.applicationsCount = countMap.get(String(doc._id)) || 0;
    return item;
  });

  const totalPages = Math.ceil(total / limit) || 1;

  return {
    items,
    jobs: items,
    page,
    limit,
    total,
    totalPages,
    pagination: {
      page,
      limit,
      total,
      totalPages
    }
  };
}

export async function getJobById({ auth, id }) {
  const job = await Job.findById(id)
    .populate('companyId', 'companyName companyId officeAddress website industryType hrRecruiterName email')
    .populate('eligibilityCriteria.allowedDepartmentIds', 'name code')
    .populate('eligibilityCriteria.allowedCourseIds', 'name code level')
    .populate('suspendedBy', 'email userType');

  if (!job) {
    throw new AppError(404, 'JOB_NOT_FOUND', 'Job posting not found.');
  }

  if (auth.userType === 'STUDENT' || auth.roleId === ROLE_IDS.STUDENT) {
    const isAvailable =
      job.status === 'OPEN' && !job.isSuspended && new Date(job.deadline) >= new Date();
    if (!isAvailable) {
      throw new AppError(404, 'JOB_NOT_FOUND', 'Job posting not found.');
    }
  } else if (auth.userType === 'COMPANY' || auth.roleId === ROLE_IDS.COMPANY) {
    const company = await findCompanyByUserId(auth.userId);
    const jobCompanyId = job.companyId?._id ? job.companyId._id : job.companyId;
    if (String(jobCompanyId) !== String(company._id)) {
      throw new AppError(403, 'FORBIDDEN', 'You do not have permission to access another company\'s job posting.');
    }
  }

  return job;
}

export async function updateJob({ auth, id, body }) {
  const job = await Job.findById(id);
  if (!job) {
    throw new AppError(404, 'JOB_NOT_FOUND', 'Job posting not found.');
  }

  if (auth.userType === 'COMPANY' || auth.roleId === ROLE_IDS.COMPANY) {
    const company = await findCompanyByUserId(auth.userId);
    if (String(job.companyId) !== String(company._id)) {
      throw new AppError(403, 'FORBIDDEN', 'You do not have permission to update another company\'s job posting.');
    }
    if (job.isSuspended) {
      throw new AppError(
        403,
        'JOB_SUSPENDED',
        'This job posting has been suspended by the Placement Cell and cannot be edited. Please contact the Placement Cell.'
      );
    }
  } else if (
    auth.roleId !== ROLE_IDS.PLACEMENT_HEAD &&
    auth.roleId !== ROLE_IDS.SUPER_ADMIN
  ) {
    throw new AppError(403, 'FORBIDDEN', 'You do not have permission to update this job posting.');
  }

  if (body.deadline) {
    const deadline = new Date(body.deadline);
    if (job.status === 'OPEN' && deadline <= new Date()) {
      throw new AppError(400, 'INVALID_DEADLINE', 'Job deadline must be in the future for an active job.');
    }
  }

  const allowedFields = [
    'title',
    'description',
    'responsibilities',
    'jobType',
    'category',
    'workMode',
    'location',
    'vacancies',
    'compensation',
    'selectionProcess',
    'eligibilityMode',
    'eligibilityCriteria',
    'deadline'
  ];

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      job[field] = body[field];
    }
  }

  job.history.push({
    action: 'UPDATED',
    changedBy: auth.userId,
    note: 'Job details updated',
    changedAt: new Date()
  });

  await job.save();

  return await Job.findById(job._id)
    .populate('companyId', 'companyName companyId officeAddress website industryType')
    .populate('eligibilityCriteria.allowedDepartmentIds', 'name code')
    .populate('eligibilityCriteria.allowedCourseIds', 'name code level');
}

export async function updateJobStatus({ auth, id, status, note }) {
  const job = await Job.findById(id);
  if (!job) {
    throw new AppError(404, 'JOB_NOT_FOUND', 'Job posting not found.');
  }

  if (auth.userType === 'COMPANY' || auth.roleId === ROLE_IDS.COMPANY) {
    const company = await findCompanyByUserId(auth.userId);
    if (String(job.companyId) !== String(company._id)) {
      throw new AppError(403, 'FORBIDDEN', 'You do not have permission to update another company\'s job posting.');
    }
    if (job.isSuspended) {
      throw new AppError(
        403,
        'JOB_SUSPENDED',
        'This job posting has been suspended by the Placement Cell and cannot be modified.'
      );
    }
  } else if (
    auth.roleId !== ROLE_IDS.PLACEMENT_HEAD &&
    auth.roleId !== ROLE_IDS.SUPER_ADMIN
  ) {
    throw new AppError(403, 'FORBIDDEN', 'You do not have permission to update job status.');
  }

  if (status === job.status) {
    return job;
  }

  if (status === 'OPEN') {
    if (job.status === 'CLOSED') {
      throw new AppError(
        400,
        'INVALID_STATUS_TRANSITION',
        'Closed jobs cannot be reopened directly via status update. Please use the Reopen endpoint with a new deadline and recruitment round.'
      );
    }
    const deadline = new Date(job.deadline);
    if (deadline <= new Date()) {
      throw new AppError(
        400,
        'INVALID_DEADLINE',
        'Cannot publish job with an expired deadline. Please update the deadline first.'
      );
    }
    if (!job.publishedAt) {
      job.publishedAt = new Date();
    }
  } else if (status === 'CLOSED') {
    job.closedAt = new Date();
  }

  const previousStatus = job.status;
  job.status = status;
  job.history.push({
    action: 'STATUS_CHANGED',
    changedBy: auth.userId,
    note: note || `Status changed to ${status}`,
    changedAt: new Date()
  });

  await job.save();

  if (status === 'OPEN' && previousStatus !== 'OPEN') {
    dispatchJobPublishedNotifications(job).catch(err => {
      console.error('Failed to dispatch job published notifications:', err.message);
    });
  } else {
    dispatchJobStatusChangedNotifications({ job, previousStatus, newStatus: status }).catch(err => {
      console.error('Failed to dispatch job status changed notifications:', err.message);
    });
  }

  return await Job.findById(job._id)
    .populate('companyId', 'companyName companyId officeAddress website industryType')
    .populate('eligibilityCriteria.allowedDepartmentIds', 'name code')
    .populate('eligibilityCriteria.allowedCourseIds', 'name code level');
}

export async function reopenJob({ auth, id, newDeadline, vacancies, note }) {
  const job = await Job.findById(id);
  if (!job) {
    throw new AppError(404, 'JOB_NOT_FOUND', 'Job posting not found.');
  }

  if (auth.userType === 'COMPANY' || auth.roleId === ROLE_IDS.COMPANY) {
    const company = await findCompanyByUserId(auth.userId);
    if (String(job.companyId) !== String(company._id)) {
      throw new AppError(403, 'FORBIDDEN', 'You do not have permission to reopen another company\'s job posting.');
    }
    if (job.isSuspended) {
      throw new AppError(
        403,
        'JOB_SUSPENDED',
        'This job posting has been suspended by the Placement Cell and cannot be reopened.'
      );
    }
  } else if (
    auth.roleId !== ROLE_IDS.PLACEMENT_HEAD &&
    auth.roleId !== ROLE_IDS.SUPER_ADMIN
  ) {
    throw new AppError(403, 'FORBIDDEN', 'You do not have permission to reopen job postings.');
  }

  const parsedDeadline = new Date(newDeadline);
  if (isNaN(parsedDeadline.getTime()) || parsedDeadline <= new Date()) {
    throw new AppError(400, 'INVALID_DEADLINE', 'New deadline must be a valid future date.');
  }

  job.deadline = parsedDeadline;
  job.status = 'OPEN';
  job.closedAt = null;
  job.publishedAt = new Date();
  job.recruitmentRound = (job.recruitmentRound || 1) + 1;
  if (vacancies) {
    job.vacancies = vacancies;
  }

  job.history.push({
    action: 'REOPENED',
    changedBy: auth.userId,
    note: note || `Job reopened for recruitment round ${job.recruitmentRound}`,
    changedAt: new Date()
  });

  await job.save();

  dispatchJobReopenedNotifications(job).catch(err => {
    console.error('Failed to dispatch job reopened notifications:', err.message);
  });

  return await Job.findById(job._id)
    .populate('companyId', 'companyName companyId officeAddress website industryType')
    .populate('eligibilityCriteria.allowedDepartmentIds', 'name code')
    .populate('eligibilityCriteria.allowedCourseIds', 'name code level');
}

export async function suspendJob({ auth, id, isSuspended, suspensionReason }) {
  const job = await Job.findById(id);
  if (!job) {
    throw new AppError(404, 'JOB_NOT_FOUND', 'Job posting not found.');
  }

  if (
    auth.roleId !== ROLE_IDS.PLACEMENT_HEAD &&
    auth.roleId !== ROLE_IDS.SUPER_ADMIN
  ) {
    throw new AppError(403, 'FORBIDDEN', 'Only the Placement Cell or Super Admin can suspend or restore job postings.');
  }

  if (isSuspended) {
    job.isSuspended = true;
    job.suspensionReason = suspensionReason;
    job.suspendedBy = auth.userId;
    job.suspendedAt = new Date();
    job.history.push({
      action: 'SUSPENDED',
      changedBy: auth.userId,
      note: suspensionReason,
      changedAt: new Date()
    });
  } else {
    job.isSuspended = false;
    job.suspensionReason = null;
    job.suspendedBy = null;
    job.suspendedAt = null;
    job.history.push({
      action: 'RESTORED',
      changedBy: auth.userId,
      note: suspensionReason || 'Job posting restored by Placement Cell',
      changedAt: new Date()
    });
  }

  await job.save();

  dispatchJobStatusChangedNotifications({ job, isSuspended, suspensionReason }).catch(err => {
    console.error('Failed to dispatch job suspend/restore notifications:', err.message);
  });

  return await Job.findById(job._id)
    .populate('companyId', 'companyName companyId officeAddress website industryType')
    .populate('eligibilityCriteria.allowedDepartmentIds', 'name code')
    .populate('eligibilityCriteria.allowedCourseIds', 'name code level')
    .populate('suspendedBy', 'email userType');
}
