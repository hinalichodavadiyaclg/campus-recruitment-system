import mongoose from 'mongoose';
import { Workshop } from '../models/workshop.model.js';
import { WorkshopRegistration } from '../models/workshop_registration.model.js';
import { Student } from '../models/student.model.js';
import { User } from '../models/user.model.js';
import { PlacementOfficer } from '../models/placement_officer.model.js';
import { ROLE_IDS } from '../utils/access-constants.js';
import { createNotificationsBatch } from './notification.service.js';
import { getWorkshopDepartmentScope } from './workshop.service.js';
import { isStudentEligibleForCohort } from './workshop-registration.service.js';

/**
 * Resolves active user IDs for Placement Heads.
 */
export async function resolvePlacementHeadUserIds() {
  const candidateUserIds = new Set();

  try {
    const headOfficers = await PlacementOfficer.find({
      role: ROLE_IDS.PLACEMENT_HEAD
    }).select('userId').lean();

    for (const o of headOfficers) {
      if (o.userId) candidateUserIds.add(String(o.userId));
    }

    const headUsers = await User.find({
      roleId: ROLE_IDS.PLACEMENT_HEAD
    }).select('_id').lean();

    for (const u of headUsers) {
      candidateUserIds.add(String(u._id));
    }

    if (candidateUserIds.size === 0) return [];

    const activeUsers = await User.find({
      _id: { $in: Array.from(candidateUserIds) },
      accountStatus: 'ACTIVE'
    }).select('_id').lean();

    return activeUsers.map((u) => String(u._id));
  } catch (err) {
    console.error('resolvePlacementHeadUserIds error:', err.message);
    return [];
  }
}

/**
 * Resolves active user IDs for Placement Coordinators assigned to specific departments.
 */
export async function resolveCoordinatorUserIdsForDepartments(departmentIds = []) {
  if (!Array.isArray(departmentIds) || departmentIds.length === 0) return [];
  const validDeptIds = departmentIds
    .map((d) => d?._id || d)
    .filter(Boolean)
    .map((id) => (mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id));

  if (validDeptIds.length === 0) return [];

  const candidateUserIds = new Set();

  try {
    const officers = await PlacementOfficer.find({
      role: ROLE_IDS.PLACEMENT_COORDINATOR,
      departmentId: { $in: validDeptIds }
    }).select('userId departmentId').lean();

    for (const o of officers) {
      if (o.userId) candidateUserIds.add(String(o.userId));
    }

    if (candidateUserIds.size === 0) return [];

    const activeUsers = await User.find({
      _id: { $in: Array.from(candidateUserIds) },
      accountStatus: 'ACTIVE'
    }).select('_id').lean();

    return activeUsers.map((u) => String(u._id));
  } catch (err) {
    console.error('resolveCoordinatorUserIdsForDepartments error:', err.message);
    return [];
  }
}

/**
 * Checks whether an incoming update or proposedChanges payload differs from current workshop data.
 * Prevents no-op saves from generating false review notifications.
 */
export function hasWorkshopDataChanged(proposed, current) {
  if (!proposed || typeof proposed !== 'object' || !current) return false;

  const textFields = ['title', 'description', 'category', 'mode', 'venue', 'meetingLink', 'maxParticipants', 'cancellationReason'];
  for (const f of textFields) {
    if (proposed[f] !== undefined) {
      const pVal = String(proposed[f] ?? '').trim();
      const cVal = String(current[f] ?? '').trim();
      if (pVal !== cVal) return true;
    }
  }

  const dateFields = ['startAt', 'endAt', 'registrationDeadline', 'registrationOpensAt'];
  for (const df of dateFields) {
    if (proposed[df] !== undefined) {
      const pTime = proposed[df] ? new Date(proposed[df]).getTime() : 0;
      const cTime = current[df] ? new Date(current[df]).getTime() : 0;
      if (pTime !== cTime) return true;
    }
  }

  if (Array.isArray(proposed.trainers)) {
    const origTrainers = (current.trainers || []).map((t) => `${t.name || ''}:${t.trainerType || ''}`).join('|');
    const newTrainers = proposed.trainers.map((t) => `${t.name || ''}:${t.trainerType || ''}`).join('|');
    if (origTrainers !== newTrainers) return true;
  }

  if (Array.isArray(proposed.sessions)) {
    const origSessions = (current.sessions || []).map((s) => `${s.sessionId}:${s.title}:${s.startAt ? new Date(s.startAt).getTime() : 0}`).join('|');
    const newSessions = proposed.sessions.map((s) => `${s.sessionId}:${s.title}:${s.startAt ? new Date(s.startAt).getTime() : 0}`).join('|');
    if (origSessions !== newSessions || proposed.sessions.length !== (current.sessions || []).length) return true;
  }

  return false;
}

/**
 * Rule A: Dispatch notifications when a company workshop is submitted for approval.
 * - Single department: Notifies Placement Head AND responsible Coordinator.
 * - Multi-department / Central: Notifies Placement Head only.
 */
export async function dispatchWorkshopSubmittedForApproval(workshopId) {
  try {
    const workshop = await Workshop.findById(workshopId)
      .populate('companyId', 'companyName')
      .lean();

    if (!workshop || workshop.approvalStatus !== 'PENDING_APPROVAL') {
      return [];
    }

    const companyName = workshop.companyId?.companyName || 'Company Recruiter';
    const scope = getWorkshopDepartmentScope(workshop);
    const recipientUserIds = new Set();

    // 1. Placement Head is always notified
    const headUserIds = await resolvePlacementHeadUserIds();
    headUserIds.forEach((id) => recipientUserIds.add(id));

    // 2. If exactly one department, notify only its responsible Coordinator
    if (scope.isSingleDept && scope.departmentId) {
      const coordUserIds = await resolveCoordinatorUserIdsForDepartments([scope.departmentId]);
      coordUserIds.forEach((id) => recipientUserIds.add(id));
    }

    const notifications = [];
    for (const userId of recipientUserIds) {
      notifications.push({
        recipientId: userId,
        type: 'WORKSHOP_SUBMITTED_FOR_APPROVAL',
        title: `Workshop Approval Required: ${workshop.title}`,
        message: `${companyName} has submitted "${workshop.title}" (${workshop.workshopId}) for review and approval.`,
        relatedResourceType: 'WORKSHOP',
        relatedResourceId: workshop._id,
        actionUrl: `#/training-workshops`,
        dedupKey: `ws_sub_${workshop._id}_u${userId}`,
        metadata: {
          workshopId: workshop._id,
          workshopCode: workshop.workshopId,
          companyName,
          scopeType: scope.isSingleDept ? 'SINGLE_DEPARTMENT' : 'MULTI_OR_CENTRAL'
        }
      });
    }

    return await createNotificationsBatch(notifications);
  } catch (err) {
    console.error('dispatchWorkshopSubmittedForApproval failed:', err.message);
    return [];
  }
}

/**
 * Rule B: Dispatch notifications when a company updates an approved/published workshop requiring review.
 * - Single department: Notifies Placement Head AND responsible Coordinator.
 * - Multi-department / Central: Notifies Placement Head only.
 * - Guards against no-op saves.
 */
export async function dispatchCompanyWorkshopUpdateForReview(workshopId) {
  try {
    const workshop = await Workshop.findById(workshopId)
      .populate('companyId', 'companyName')
      .lean();

    if (!workshop || !workshop.pendingEdit || workshop.pendingEdit.status !== 'PENDING') {
      return [];
    }

    const proposed = workshop.pendingEdit.proposedChanges || {};
    // Check for no-op saves
    if (!hasWorkshopDataChanged(proposed, workshop)) {
      return [];
    }

    const companyName = workshop.companyId?.companyName || 'Company Recruiter';
    const scope = getWorkshopDepartmentScope(workshop);
    const recipientUserIds = new Set();

    // 1. Placement Head is always notified
    const headUserIds = await resolvePlacementHeadUserIds();
    headUserIds.forEach((id) => recipientUserIds.add(id));

    // 2. If exactly one department, notify only its responsible Coordinator
    if (scope.isSingleDept && scope.departmentId) {
      const coordUserIds = await resolveCoordinatorUserIdsForDepartments([scope.departmentId]);
      coordUserIds.forEach((id) => recipientUserIds.add(id));
    }

    const editTimestamp = workshop.pendingEdit.submittedAt
      ? new Date(workshop.pendingEdit.submittedAt).getTime()
      : Date.now();

    const notifications = [];
    for (const userId of recipientUserIds) {
      notifications.push({
        recipientId: userId,
        type: 'WORKSHOP_EDIT_SUBMITTED',
        title: `Workshop Review Required: ${workshop.title}`,
        message: `${companyName} proposed updates for "${workshop.title}" (${workshop.workshopId}) that require review.`,
        relatedResourceType: 'WORKSHOP',
        relatedResourceId: workshop._id,
        actionUrl: `#/training-workshops/${workshop._id}`,
        dedupKey: `ws_review_${workshop._id}_${editTimestamp}_u${userId}`,
        metadata: {
          workshopId: workshop._id,
          workshopCode: workshop.workshopId,
          companyName,
          submittedAt: workshop.pendingEdit.submittedAt
        }
      });
    }

    return await createNotificationsBatch(notifications);
  } catch (err) {
    console.error('dispatchCompanyWorkshopUpdateForReview failed:', err.message);
    return [];
  }
}

/**
 * Rule C: Dispatch notifications to eligible students when a workshop is published.
 * Evaluates authoritative cohort targeting criteria (department, course, semester).
 */
export async function dispatchWorkshopPublished(workshopId, publicationVersion = 1) {
  try {
    const workshop = await Workshop.findById(workshopId).lean();

    if (
      !workshop ||
      !workshop.isPublished ||
      workshop.approvalStatus !== 'APPROVED' ||
      workshop.lifecycleStatus === 'CANCELLED'
    ) {
      return [];
    }

    const targetAudience = workshop.targetAudience || { isAllDepartments: false, departmentRules: [] };
    let candidateStudents = [];

    if (targetAudience.isAllDepartments) {
      candidateStudents = await Student.find({})
        .select('_id userId departmentId courseId semester')
        .lean();
    } else {
      const targetDeptIds = (targetAudience.departmentRules || [])
        .map((r) => r.departmentId)
        .filter(Boolean);

      if (workshop.departmentId) {
        targetDeptIds.push(workshop.departmentId);
      }

      if (targetDeptIds.length > 0) {
        candidateStudents = await Student.find({ departmentId: { $in: targetDeptIds } })
          .select('_id userId departmentId courseId semester')
          .lean();
      }
    }

    let effectiveAudience = targetAudience;
    if (
      !targetAudience.isAllDepartments &&
      (!targetAudience.departmentRules || targetAudience.departmentRules.length === 0) &&
      workshop.departmentId
    ) {
      effectiveAudience = {
        isAllDepartments: false,
        departmentRules: [
          {
            departmentId: workshop.departmentId,
            targetingMode: 'ALL_COURSES_ALL_SEMESTERS'
          }
        ]
      };
    }

    // Filter by strict cohort eligibility logic
    const eligibleStudents = candidateStudents.filter((student) =>
      isStudentEligibleForCohort(effectiveAudience, student)
    );

    const eligibleUserIds = new Set(
      eligibleStudents.map((s) => s.userId).filter(Boolean).map(String)
    );

    if (eligibleUserIds.size === 0) return [];

    // Verify active user accounts
    const activeUsers = await User.find({
      _id: { $in: Array.from(eligibleUserIds) },
      accountStatus: 'ACTIVE'
    }).select('_id').lean();

    const formattedSchedule = new Date(workshop.startAt).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      dateStyle: 'short',
      timeStyle: 'short'
    });

    const version = publicationVersion || workshop.publishVersion || 1;

    const notifications = activeUsers.map((user) => ({
      recipientId: user._id,
      type: 'WORKSHOP_PUBLISHED',
      title: `Registration Open: ${workshop.title}`,
      message: `Registration is open for "${workshop.title}" (${workshop.workshopId}). Schedule: ${formattedSchedule}. Total seats: ${workshop.maxParticipants}.`,
      relatedResourceType: 'WORKSHOP',
      relatedResourceId: workshop._id,
      actionUrl: `#/training-workshops/${workshop._id}`,
      dedupKey: `ws_pub_${workshop._id}_v${version}_u${user._id}`,
      metadata: {
        workshopId: workshop._id,
        workshopCode: workshop.workshopId,
        startAt: workshop.startAt,
        publicationVersion: version
      }
    }));

    return await createNotificationsBatch(notifications);
  } catch (err) {
    console.error('dispatchWorkshopPublished failed:', err.message);
    return [];
  }
}

/**
 * Rule D: Dispatch update notifications to enrolled students and department Coordinators
 * when an approved/published workshop details are modified.
 */
export async function dispatchWorkshopUpdateAnnouncement(workshopId, { oldValue = {}, changedFields = [] } = {}) {
  try {
    const workshop = await Workshop.findById(workshopId).lean();

    if (!workshop || !workshop.isPublished || workshop.lifecycleStatus === 'CANCELLED') {
      return [];
    }

    // Determine relevant changed fields
    const changes = new Set();
    if (oldValue && typeof oldValue === 'object' && Object.keys(oldValue).length > 0) {
      if (
        (oldValue.startAt && new Date(oldValue.startAt).getTime() !== new Date(workshop.startAt).getTime()) ||
        (oldValue.endAt && new Date(oldValue.endAt).getTime() !== new Date(workshop.endAt).getTime())
      ) {
        changes.add('schedule');
      }
      if (oldValue.venue !== undefined && String(oldValue.venue || '').trim() !== String(workshop.venue || '').trim()) {
        changes.add('venue');
      }
      if (oldValue.meetingLink !== undefined && String(oldValue.meetingLink || '').trim() !== String(workshop.meetingLink || '').trim()) {
        changes.add('virtual meeting link');
      }
      if (oldValue.mode && oldValue.mode !== workshop.mode) {
        changes.add('delivery mode');
      }
      if (
        (oldValue.registrationDeadline && new Date(oldValue.registrationDeadline).getTime() !== new Date(workshop.registrationDeadline).getTime()) ||
        (oldValue.registrationOpensAt && new Date(oldValue.registrationOpensAt).getTime() !== new Date(workshop.registrationOpensAt).getTime())
      ) {
        changes.add('registration details');
      }
      if (oldValue.title && oldValue.title !== workshop.title) {
        changes.add('title');
      }
      if (oldValue.description && oldValue.description !== workshop.description) {
        changes.add('description');
      }
      if (oldValue.maxParticipants && oldValue.maxParticipants !== workshop.maxParticipants) {
        changes.add('capacity');
      }
    }

    // Fallback to explicit changedFields array if oldValue comparison yielded nothing
    if (changes.size === 0 && Array.isArray(changedFields) && changedFields.length > 0) {
      for (const f of changedFields) {
        if (f === 'startAt' || f === 'endAt' || f === 'schedule') changes.add('schedule');
        else if (f === 'venue') changes.add('venue');
        else if (f === 'meetingLink') changes.add('virtual meeting link');
        else if (f === 'mode') changes.add('delivery mode');
        else if (f === 'registrationDeadline' || f === 'registrationOpensAt') changes.add('registration details');
        else if (f === 'sessions') changes.add('session details');
        else if (f === 'title') changes.add('title');
        else if (f === 'description') changes.add('description');
        else if (f !== 'expectedUpdatedAt' && f !== 'updatedAt') changes.add(f);
      }
    }

    if (changes.size === 0) {
      return [];
    }

    // Build human-friendly change summary
    const summary = Array.from(changes).join(', ');
    const message = `The ${summary} for "${workshop.title}" (${workshop.workshopId}) have been updated.`;

    // 1. Enrolled students
    const activeRegistrations = await WorkshopRegistration.find({
      workshopId: workshop._id,
      activeRegistrationKey: 'ACTIVE'
    }).select('studentId').lean();

    const studentIds = activeRegistrations.map((r) => r.studentId).filter(Boolean);
    const students = await Student.find({ _id: { $in: studentIds } }).select('userId').lean();
    const enrolledUserIds = students.map((s) => s.userId).filter(Boolean).map(String);

    // 2. Coordinators of included departments
    const includedDeptIds = new Set();
    if (workshop.departmentId) {
      includedDeptIds.add(String(workshop.departmentId._id || workshop.departmentId));
    }
    const rules = workshop.targetAudience?.departmentRules || [];
    for (const r of rules) {
      if (r.departmentId) includedDeptIds.add(String(r.departmentId._id || r.departmentId));
    }

    let coordinatorUserIds = [];
    if (workshop.targetAudience?.isAllDepartments) {
      // For all-department workshop updates, notify all department coordinators
      const allCoordinators = await PlacementOfficer.find({ role: ROLE_IDS.PLACEMENT_COORDINATOR })
        .select('userId')
        .lean();
      coordinatorUserIds = allCoordinators.map((c) => c.userId).filter(Boolean).map(String);
    } else {
      coordinatorUserIds = await resolveCoordinatorUserIdsForDepartments(Array.from(includedDeptIds));
    }

    const allRecipients = Array.from(new Set([...enrolledUserIds, ...coordinatorUserIds]));
    if (allRecipients.length === 0) return [];

    const updateTimestamp = workshop.updatedAt ? new Date(workshop.updatedAt).getTime() : Date.now();

    const notifications = allRecipients.map((userId) => ({
      recipientId: userId,
      type: 'WORKSHOP_UPDATED',
      title: `Workshop Update: ${workshop.title}`,
      message,
      relatedResourceType: 'WORKSHOP',
      relatedResourceId: workshop._id,
      actionUrl: `#/training-workshops/${workshop._id}`,
      dedupKey: `ws_upd_${workshop._id}_${updateTimestamp}_u${userId}`,
      metadata: {
        workshopId: workshop._id,
        workshopCode: workshop.workshopId,
        changedSummary: summary
      }
    }));

    return await createNotificationsBatch(notifications);
  } catch (err) {
    console.error('dispatchWorkshopUpdateAnnouncement failed:', err.message);
    return [];
  }
}

/**
 * Dispatches notification to a student when their certificate is successfully issued.
 */
export async function dispatchCertificateIssuedNotification({ certificate, workshop, student }) {
  try {
    if (!certificate || !student || !student.userId) return [];
    const wsTitle = workshop?.title || 'Workshop';
    const certNum = certificate.certificateNumber || '';

    return await createNotificationsBatch([
      {
        recipientId: student.userId,
        type: 'WORKSHOP_CERTIFICATE_ISSUED',
        title: 'Certificate of Completion Available',
        message: `Congratulations! Your certificate for "${wsTitle}" (${certNum}) is ready to download.`,
        relatedResourceType: 'WORKSHOP',
        relatedResourceId: workshop?._id || certificate.workshopId,
        actionUrl: '#/certificates',
        dedupKey: `cert_issued_${certificate._id}`,
        metadata: {
          certificateId: certificate._id,
          certificateNumber: certNum,
          workshopId: workshop?._id || certificate.workshopId
        }
      }
    ]);
  } catch (err) {
    console.error('dispatchCertificateIssuedNotification failed:', err.message);
    return [];
  }
}

/**
 * Dispatches notification to a student when their certificate is revoked.
 */
export async function dispatchCertificateRevokedNotification({ certificate, workshop, student, reason }) {
  try {
    if (!certificate || !student || !student.userId) return [];
    const wsTitle = workshop?.title || 'Workshop';
    const certNum = certificate.certificateNumber || '';

    return await createNotificationsBatch([
      {
        recipientId: student.userId,
        type: 'WORKSHOP_CERTIFICATE_REVOKED',
        title: 'Certificate Revoked',
        message: `Your certificate for "${wsTitle}" (${certNum}) has been revoked. Reason: ${reason || 'Administrative action'}`,
        relatedResourceType: 'WORKSHOP',
        relatedResourceId: workshop?._id || certificate.workshopId,
        actionUrl: '#/certificates',
        dedupKey: `cert_revoked_${certificate._id}_${Date.now()}`,
        metadata: {
          certificateId: certificate._id,
          certificateNumber: certNum,
          workshopId: workshop?._id || certificate.workshopId,
          reason
        }
      }
    ]);
  } catch (err) {
    console.error('dispatchCertificateRevokedNotification failed:', err.message);
    return [];
  }
}
