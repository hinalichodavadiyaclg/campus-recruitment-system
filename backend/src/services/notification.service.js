import mongoose from 'mongoose';
import { Notification } from '../models/notification.model.js';
import { User } from '../models/user.model.js';
import { Student } from '../models/student.model.js';
import { PlacementOfficer } from '../models/placement_officer.model.js';
import { Company } from '../models/company.model.js';
import { ROLE_IDS } from '../utils/access-constants.js';
import { AppError } from '../utils/app-error.js';

/**
 * Create a single notification with deduplication support
 */
export async function createNotification({
  recipientId,
  type = 'SYSTEM',
  title,
  message,
  relatedResourceType = 'SYSTEM',
  relatedResourceId = null,
  actionUrl = null,
  dedupKey = null,
  metadata = {}
}) {
  if (!recipientId || !title || !message) {
    return null;
  }

  try {
    const notification = new Notification({
      recipientId,
      type,
      title,
      message,
      relatedResourceType,
      relatedResourceId,
      actionUrl,
      dedupKey: dedupKey || undefined,
      metadata
    });

    return await notification.save();
  } catch (error) {
    // If deduplication key already exists, silently ignore duplicate
    if (error.code === 11000) {
      return null;
    }
    console.error('Failed to create notification:', error.message);
    return null;
  }
}

/**
 * Create multiple notifications in bulk with deduplication handling
 */
export async function createNotificationsBatch(notifications = []) {
  if (!Array.isArray(notifications) || notifications.length === 0) {
    return [];
  }

  const results = [];
  for (const item of notifications) {
    try {
      const created = await createNotification(item);
      if (created) results.push(created);
    } catch (err) {
      // Continue processing remaining notifications
    }
  }
  return results;
}

/**
 * Retrieve paginated notifications for the authenticated user
 */
export async function getUserNotifications({ userId, page = 1, limit = 20, unreadOnly = false }) {
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (safePage - 1) * safeLimit;

  const query = { recipientId: new mongoose.Types.ObjectId(userId) };
  if (unreadOnly) {
    query.isRead = false;
  }

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean(),
    Notification.countDocuments(query),
    Notification.countDocuments({ recipientId: new mongoose.Types.ObjectId(userId), isRead: false })
  ]);

  return {
    notifications,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit) || 1
    },
    unreadCount
  };
}

/**
 * Fast unread count lookup for header badge
 */
export async function getUnreadCount(userId) {
  const count = await Notification.countDocuments({
    recipientId: new mongoose.Types.ObjectId(userId),
    isRead: false
  });
  return { unreadCount: count };
}

/**
 * Mark a single notification as read, enforcing recipient ownership
 */
export async function markAsRead({ userId, notificationId }) {
  if (!mongoose.Types.ObjectId.isValid(notificationId)) {
    throw new AppError(400, 'INVALID_NOTIFICATION_ID', 'Invalid notification ID.');
  }

  const notification = await Notification.findOne({
    _id: notificationId,
    recipientId: new mongoose.Types.ObjectId(userId)
  });

  if (!notification) {
    throw new AppError(404, 'NOTIFICATION_NOT_FOUND', 'Notification not found or does not belong to you.');
  }

  if (!notification.isRead) {
    notification.isRead = true;
    notification.readAt = new Date();
    await notification.save();
  }

  return notification;
}

/**
 * Mark all notifications as read for authenticated user
 */
export async function markAllAsRead(userId) {
  const result = await Notification.updateMany(
    {
      recipientId: new mongoose.Types.ObjectId(userId),
      isRead: false
    },
    {
      $set: {
        isRead: true,
        readAt: new Date()
      }
    }
  );

  return {
    matchedCount: result.matchedCount,
    modifiedCount: result.modifiedCount
  };
}

/* ==========================================================================
   DOMAIN NOTIFICATION DISPATCHERS (JOB & APPLICATION MODULE EVENTS)
   ========================================================================== */

/**
 * Dispatch notifications when a job is officially published (OPEN status)
 */
export async function dispatchJobPublishedNotifications(job) {
  try {
    const company = await Company.findById(job.companyId).lean();
    const companyName = company?.companyName || 'Company';

    // 1. Placement Officers (Head + Coordinators) & Super Admins
    const officers = await PlacementOfficer.find({}).lean();
    const superAdmins = await User.find({
      roleId: ROLE_IDS.SUPER_ADMIN,
      accountStatus: 'ACTIVE'
    }).select('_id email').lean();
    const placementNotifications = [];

    for (const admin of superAdmins) {
      placementNotifications.push({
        recipientId: admin._id,
        type: 'JOB_PUBLISHED',
        title: `New Job Opening: ${job.title}`,
        message: `${companyName} has published a new job opportunity "${job.title}".`,
        relatedResourceType: 'JOB',
        relatedResourceId: job._id,
        actionUrl: `#/job-postings`,
        dedupKey: `job_pub_${job._id}_u${admin._id}`,
        metadata: { jobId: job._id, companyName }
      });
    }

    const allowedDeptIds = (job.eligibilityCriteria?.allowedDepartmentIds || []).map(String);
    const isAllStudents = job.eligibilityMode === 'ALL_STUDENTS' || allowedDeptIds.length === 0;

    for (const officer of officers) {
      if (!officer.userId) continue;

      let isTargeted = false;
      if (officer.role === ROLE_IDS.PLACEMENT_HEAD) {
        isTargeted = true;
      } else if (officer.role === ROLE_IDS.PLACEMENT_COORDINATOR) {
        if (isAllStudents || (officer.departmentId && allowedDeptIds.includes(String(officer.departmentId)))) {
          isTargeted = true;
        }
      }

      if (isTargeted) {
        placementNotifications.push({
          recipientId: officer.userId,
          type: 'JOB_PUBLISHED',
          title: `New Job Opening: ${job.title}`,
          message: `${companyName} has published a new job opportunity "${job.title}".`,
          relatedResourceType: 'JOB',
          relatedResourceId: job._id,
          actionUrl: `#/job-postings`,
          dedupKey: `job_pub_${job._id}_u${officer.userId}`,
          metadata: { jobId: job._id, companyName }
        });
      }
    }

    // 2. Eligible Students
    const studentQuery = {};
    if (job.eligibilityMode === 'RESTRICTED') {
      if (allowedDeptIds.length > 0) {
        studentQuery.departmentId = { $in: job.eligibilityCriteria.allowedDepartmentIds };
      }
      const allowedCourseIds = job.eligibilityCriteria?.allowedCourseIds || [];
      if (allowedCourseIds.length > 0) {
        studentQuery.courseId = { $in: allowedCourseIds };
      }
      const allowedPassingYears = job.eligibilityCriteria?.allowedPassingYears || [];
      if (allowedPassingYears.length > 0) {
        studentQuery.passingYear = { $in: allowedPassingYears };
      }
      if (job.eligibilityCriteria?.minCgpa > 0) {
        studentQuery.cgpa = { $gte: job.eligibilityCriteria.minCgpa };
      }
      if (job.eligibilityCriteria?.maxActiveBacklogs !== undefined && job.eligibilityCriteria?.maxActiveBacklogs !== null) {
        studentQuery.backlogs = { $lte: job.eligibilityCriteria.maxActiveBacklogs };
      }
    }

    const eligibleStudents = await Student.find(studentQuery).select('userId firstName email').lean();
    const studentNotifications = [];

    for (const st of eligibleStudents) {
      if (!st.userId) continue;
      studentNotifications.push({
        recipientId: st.userId,
        type: 'JOB_PUBLISHED',
        title: `Opportunity: ${job.title}`,
        message: `${companyName} is hiring for "${job.title}". Check your eligibility and apply before ${new Date(job.deadline).toLocaleDateString()}.`,
        relatedResourceType: 'JOB',
        relatedResourceId: job._id,
        actionUrl: `#/job-postings`,
        dedupKey: `job_pub_${job._id}_u${st.userId}`,
        metadata: { jobId: job._id, companyName }
      });
    }

    await createNotificationsBatch([...placementNotifications, ...studentNotifications]);
  } catch (err) {
    console.error('dispatchJobPublishedNotifications failed:', err.message);
  }
}

/**
 * Dispatch notifications when a job is reopened for a new recruitment round
 */
export async function dispatchJobReopenedNotifications(job) {
  try {
    const company = await Company.findById(job.companyId).lean();
    const companyName = company?.companyName || 'Company';
    const round = job.recruitmentRound || 1;

    // 1. Placement Officers & Super Admins
    const officers = await PlacementOfficer.find({}).lean();
    const superAdmins = await User.find({
      roleId: ROLE_IDS.SUPER_ADMIN,
      accountStatus: 'ACTIVE'
    }).select('_id email').lean();
    const notifications = [];

    for (const admin of superAdmins) {
      notifications.push({
        recipientId: admin._id,
        type: 'JOB_REOPENED',
        title: `Job Reopened: ${job.title} (Round ${round})`,
        message: `${companyName} reopened "${job.title}" for recruitment round ${round}.`,
        relatedResourceType: 'JOB',
        relatedResourceId: job._id,
        actionUrl: `#/job-postings`,
        dedupKey: `job_reopen_${job._id}_r${round}_u${admin._id}`,
        metadata: { jobId: job._id, round }
      });
    }

    const allowedDeptIds = (job.eligibilityCriteria?.allowedDepartmentIds || []).map(String);
    const isAllStudents = job.eligibilityMode === 'ALL_STUDENTS' || allowedDeptIds.length === 0;

    for (const officer of officers) {
      if (!officer.userId) continue;

      let isTargeted = false;
      if (officer.role === ROLE_IDS.PLACEMENT_HEAD) {
        isTargeted = true;
      } else if (officer.role === ROLE_IDS.PLACEMENT_COORDINATOR) {
        if (isAllStudents || (officer.departmentId && allowedDeptIds.includes(String(officer.departmentId)))) {
          isTargeted = true;
        }
      }

      if (isTargeted) {
        notifications.push({
          recipientId: officer.userId,
          type: 'JOB_REOPENED',
          title: `Job Reopened: ${job.title} (Round ${round})`,
          message: `${companyName} reopened "${job.title}" for recruitment round ${round}.`,
          relatedResourceType: 'JOB',
          relatedResourceId: job._id,
          actionUrl: `#/job-postings`,
          dedupKey: `job_reopen_${job._id}_r${round}_u${officer.userId}`,
          metadata: { jobId: job._id, round }
        });
      }
    }

    // 2. Eligible Students
    const studentQuery = {};
    if (job.eligibilityMode === 'RESTRICTED') {
      if (allowedDeptIds.length > 0) {
        studentQuery.departmentId = { $in: job.eligibilityCriteria.allowedDepartmentIds };
      }
      const allowedCourseIds = job.eligibilityCriteria?.allowedCourseIds || [];
      if (allowedCourseIds.length > 0) {
        studentQuery.courseId = { $in: allowedCourseIds };
      }
      const allowedPassingYears = job.eligibilityCriteria?.allowedPassingYears || [];
      if (allowedPassingYears.length > 0) {
        studentQuery.passingYear = { $in: allowedPassingYears };
      }
    }

    if (job.eligibilityCriteria?.minCgpa > 0) {
      studentQuery.cgpa = { $gte: job.eligibilityCriteria.minCgpa };
    }

    const eligibleStudents = await Student.find(studentQuery).select('userId firstName').lean();
    for (const st of eligibleStudents) {
      if (!st.userId) continue;
      notifications.push({
        recipientId: st.userId,
        type: 'JOB_REOPENED',
        title: `Reopened: ${job.title}`,
        message: `${companyName} reopened applications for "${job.title}" (Round ${round}). Apply before ${new Date(job.deadline).toLocaleDateString()}.`,
        relatedResourceType: 'JOB',
        relatedResourceId: job._id,
        actionUrl: `#/job-postings`,
        dedupKey: `job_reopen_${job._id}_r${round}_u${st.userId}`,
        metadata: { jobId: job._id, round }
      });
    }

    await createNotificationsBatch(notifications);
  } catch (err) {
    console.error('dispatchJobReopenedNotifications failed:', err.message);
  }
}

/**
 * Dispatch notifications on job status changes (e.g. suspended, restored, closed)
 */
export async function dispatchJobStatusChangedNotifications({ job, previousStatus, newStatus, isSuspended, suspensionReason }) {
  try {
    // Notify company recruiter(s)
    const companyUsers = await User.find({
      companyId: job.companyId,
      accountStatus: 'ACTIVE'
    }).select('_id email').lean();

    const notifications = [];

    for (const u of companyUsers) {
      if (isSuspended !== undefined) {
        if (isSuspended) {
          notifications.push({
            recipientId: u._id,
            type: 'JOB_SUSPENDED',
            title: `Job Posting Suspended: ${job.title}`,
            message: `Your job posting "${job.title}" has been suspended by the Placement Cell. Reason: ${suspensionReason || 'Administrative review'}`,
            relatedResourceType: 'JOB',
            relatedResourceId: job._id,
            actionUrl: `#/job-postings`,
            dedupKey: `job_suspend_${job._id}_t${Date.now()}`,
            metadata: { jobId: job._id, suspensionReason }
          });
        } else {
          notifications.push({
            recipientId: u._id,
            type: 'JOB_RESTORED',
            title: `Job Posting Restored: ${job.title}`,
            message: `Your job posting "${job.title}" has been restored by the Placement Cell and is active again.`,
            relatedResourceType: 'JOB',
            relatedResourceId: job._id,
            actionUrl: `#/job-postings`,
            dedupKey: `job_restore_${job._id}_t${Date.now()}`,
            metadata: { jobId: job._id }
          });
        }
      } else if (newStatus && previousStatus !== newStatus) {
        notifications.push({
          recipientId: u._id,
          type: 'JOB_STATUS_CHANGED',
          title: `Job Status: ${job.title}`,
          message: `Your job posting "${job.title}" status has changed from ${previousStatus} to ${newStatus}.`,
          relatedResourceType: 'JOB',
          relatedResourceId: job._id,
          actionUrl: `#/job-postings`,
          dedupKey: `job_status_${job._id}_${newStatus}_u${u._id}`,
          metadata: { jobId: job._id, previousStatus, newStatus }
        });
      }
    }

    await createNotificationsBatch(notifications);
  } catch (err) {
    console.error('dispatchJobStatusChangedNotifications failed:', err.message);
  }
}

/**
 * Dispatch notification to company when a new application is received
 */
export async function dispatchApplicationReceivedNotification({ application, job, student }) {
  try {
    const companyUsers = await User.find({
      companyId: job.companyId,
      accountStatus: 'ACTIVE'
    }).select('_id email').lean();

    const notifications = [];
    const studentName = `${student.firstName} ${student.lastName}`.trim();

    for (const u of companyUsers) {
      notifications.push({
        recipientId: u._id,
        type: 'APPLICATION_RECEIVED',
        title: `New Applicant: ${job.title}`,
        message: `${studentName} has submitted an application for "${job.title}".`,
        relatedResourceType: 'APPLICATION',
        relatedResourceId: application._id,
        actionUrl: `#/applications`,
        dedupKey: `app_recv_${application._id}_u${u._id}`,
        metadata: { applicationId: application._id, jobId: job._id, studentId: student._id }
      });
    }

    await createNotificationsBatch(notifications);
  } catch (err) {
    console.error('dispatchApplicationReceivedNotification failed:', err.message);
  }
}

/**
 * Dispatch notification to student when application status updates
 */
export async function dispatchApplicationStatusChangedNotification({ application, previousStatus, newStatus, jobTitle }) {
  try {
    const student = await Student.findById(application.studentId).select('userId firstName').lean();
    if (!student || !student.userId) return;

    await createNotification({
      recipientId: student.userId,
      type: 'APPLICATION_STATUS_CHANGED',
      title: `Application Status Updated: ${jobTitle || 'Job Application'}`,
      message: `Your application status for "${jobTitle || 'your applied role'}" has been updated to "${newStatus}".`,
      relatedResourceType: 'APPLICATION',
      relatedResourceId: application._id,
      actionUrl: `#/applications`,
      dedupKey: `app_status_${application._id}_${newStatus}`,
      metadata: { applicationId: application._id, previousStatus, newStatus }
    });
  } catch (err) {
    console.error('dispatchApplicationStatusChangedNotification failed:', err.message);
  }
}

/**
 * Dispatch notification to company when student withdraws their application
 */
export async function dispatchApplicationWithdrawnNotification({ application, job, student }) {
  try {
    const companyUsers = await User.find({
      companyId: job.companyId,
      accountStatus: 'ACTIVE'
    }).select('_id email').lean();

    const studentName = `${student.firstName} ${student.lastName}`.trim();
    const notifications = [];

    for (const u of companyUsers) {
      notifications.push({
        recipientId: u._id,
        type: 'APPLICATION_WITHDRAWN',
        title: `Application Withdrawn: ${job.title}`,
        message: `${studentName} has withdrawn their application for "${job.title}".`,
        relatedResourceType: 'APPLICATION',
        relatedResourceId: application._id,
        actionUrl: `#/applications`,
        dedupKey: `app_withdrawn_${application._id}_u${u._id}`,
        metadata: { applicationId: application._id, jobId: job._id }
      });
    }

    await createNotificationsBatch(notifications);
  } catch (err) {
    console.error('dispatchApplicationWithdrawnNotification failed:', err.message);
  }
}
