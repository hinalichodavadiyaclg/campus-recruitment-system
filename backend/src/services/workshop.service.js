import mongoose from 'mongoose';
import { Workshop } from '../models/workshop.model.js';
import { WorkshopRegistration } from '../models/workshop_registration.model.js';
import { WorkshopAttendance } from '../models/workshop_attendance.model.js';
import { Student } from '../models/student.model.js';
import { User } from '../models/user.model.js';
import { ROLE_IDS } from '../utils/access-constants.js';
import { AppError } from '../utils/app-error.js';
import { getCoordinatorDepartment } from '../utils/department-scope.js';
import { generateWorkshopId } from '../utils/sequence-generator.js';
import { executeWorkshopTransaction, logWorkshopAudit } from './workshop-audit.service.js';
import { isStudentEligibleForCohort } from './workshop-registration.service.js';
import { calculateRegistrationAttendance } from './workshop-attendance.service.js';
import { issueCertificates } from './workshop-certificate.service.js';
import {
  isCompanyUser,
  isCompanyOwnWorkshop,
  getCompanyWorkshopQueryCondition,
  getCompanyIdForAuth
} from '../utils/company-workshop-scope.js';
import {
  dispatchWorkshopSubmittedForApproval,
  dispatchCompanyWorkshopUpdateForReview,
  dispatchWorkshopPublished,
  dispatchWorkshopUpdateAnnouncement
} from './workshop-notification.service.js';

/**
 * Checks if user has permission to manage (create/update/submit) a workshop for a department or company.
 */
async function assertDepartmentScope(auth, workshopDepartmentId, ownershipType, workshop = null) {
  if (auth.roleId === ROLE_IDS.SUPER_ADMIN || auth.roleId === ROLE_IDS.PLACEMENT_HEAD) {
    return;
  }

  if (isCompanyUser(auth)) {
    if (workshop) {
      const isOwn = await isCompanyOwnWorkshop(workshop, auth);
      if (!isOwn) {
        throw new AppError(403, 'FORBIDDEN', 'Company can only view and manage their own workshops.');
      }
      return;
    }
    return;
  }

  if (auth.roleId === ROLE_IDS.PLACEMENT_COORDINATOR) {
    const coordDept = await getCoordinatorDepartment(auth);
    if (!coordDept) {
      throw new AppError(403, 'FORBIDDEN', 'No valid department assigned to this coordinator.');
    }
    if (ownershipType === 'CENTRAL_PLACEMENT_CELL') {
      throw new AppError(403, 'FORBIDDEN', 'Placement Coordinators cannot manage Central Placement Cell workshops.');
    }
    const deptIdStr = workshopDepartmentId?._id ? String(workshopDepartmentId._id) : String(workshopDepartmentId || '');
    if (!deptIdStr || deptIdStr !== String(coordDept.departmentId)) {
      throw new AppError(403, 'FORBIDDEN', 'You are only authorized to manage workshops for your assigned department.');
    }
    return;
  }

  throw new AppError(403, 'FORBIDDEN', 'You do not have permission to perform this workshop action.');
}

/**
 * Validates trainer assignment integrity against caller permissions and company identity.
 */
async function assertTrainersScope(trainers, auth, companyId) {
  if (!Array.isArray(trainers) || trainers.length === 0) return;
  const isCompany = isCompanyUser(auth);

  for (const t of trainers) {
    if (isCompany) {
      if (t.trainerType === 'COMPANY') {
        const callerCompanyId = String(companyId || (await getCompanyIdForAuth(auth)));
        if (t.companyId && String(t.companyId) !== callerCompanyId) {
          throw new AppError(403, 'FORBIDDEN', 'Company can only assign trainers from their own company.');
        }
      } else if (t.trainerType === 'PLACEMENT_COORDINATOR' || t.trainerType === 'PLACEMENT_HEAD') {
        throw new AppError(403, 'FORBIDDEN', 'Company recruiters cannot assign internal university staff as trainers.');
      }
    } else if (auth.roleId === ROLE_IDS.PLACEMENT_COORDINATOR) {
      if (t.trainerType === 'PLACEMENT_COORDINATOR' || t.trainerType === 'PLACEMENT_HEAD') {
        if (t.userId) {
          const userDoc = await User.findById(t.userId).lean();
          if (!userDoc || (userDoc.roleId !== ROLE_IDS.PLACEMENT_COORDINATOR && userDoc.roleId !== ROLE_IDS.PLACEMENT_HEAD && userDoc.roleId !== ROLE_IDS.SUPER_ADMIN)) {
            throw new AppError(400, 'INVALID_INPUT', 'Assigned internal trainer must be a valid placement coordinator or head.');
          }
        }
      }
    }
  }
}

/**
 * Creates a new Workshop in DRAFT status.
 * Generates sequential WS-YYYY-XXXX identifier derived from startAt in Asia/Kolkata timezone.
 *
 * @param {object} inputData
 * @param {object} auth
 * @returns {Promise<import('../models/workshop.model.js').Workshop>}
 */
export async function createWorkshop(inputData, auth) {
  if (!auth || !auth.userId) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  }

  if (auth.userType === 'STUDENT' || auth.roleId === ROLE_IDS.STUDENT) {
    throw new AppError(403, 'FORBIDDEN', 'Students cannot create workshops.');
  }

  if (isCompanyUser(auth)) {
    const companyId = await getCompanyIdForAuth(auth);
    inputData.companyId = companyId;
    if (!inputData.ownershipType || (inputData.ownershipType === 'DEPARTMENT' && !inputData.departmentId)) {
      inputData.ownershipType = 'CENTRAL_PLACEMENT_CELL';
      delete inputData.departmentId;
    }
  } else {
    // Verify department scope
    await assertDepartmentScope(auth, inputData.departmentId, inputData.ownershipType || 'DEPARTMENT');
  }

  if (inputData.trainers) {
    await assertTrainersScope(inputData.trainers, auth, inputData.companyId);
  }

  // Validate start date is provided and valid
  if (!inputData.startAt) {
    throw new AppError(400, 'INVALID_INPUT', 'Workshop startAt date is required.');
  }

  const startAt = inputData.startAt instanceof Date ? inputData.startAt : new Date(inputData.startAt);
  if (Number.isNaN(startAt.getTime())) {
    throw new AppError(400, 'INVALID_INPUT', 'Invalid workshop startAt date provided.');
  }

  const isCompany = isCompanyUser(auth);
  // Placement cell, placement head, coordinators, and admins do not need approval
  // and their workshops are automatically published upon creation.
  // ONLY company-created workshops require approval (created in DRAFT, isPublished = false).
  const autoPublish = !isCompany && inputData.approvalStatus !== 'DRAFT';

  const result = await executeWorkshopTransaction(async (session) => {
    // Generate WS-YYYY-XXXX with IST year
    const workshopId = await generateWorkshopId(startAt, { session });

    const workshopData = {
      ...inputData,
      workshopId,
      createdBy: auth.userId,
      coordinatorId: inputData.coordinatorId || (auth.roleId === ROLE_IDS.PLACEMENT_COORDINATOR ? auth.userId : undefined),
      approvalStatus: autoPublish ? 'APPROVED' : 'DRAFT',
      isPublished: autoPublish,
      publishVersion: autoPublish ? 1 : 0,
      lifecycleStatus: 'SCHEDULED'
    };

    const [createdWorkshop] = await Workshop.create([workshopData], { session });

    await logWorkshopAudit(
      {
        workshopId: createdWorkshop._id,
        action: 'WORKSHOP_CREATED',
        entityType: 'WORKSHOP',
        entityId: createdWorkshop.workshopId,
        changedBy: auth.userId,
        newValue: {
          workshopId: createdWorkshop.workshopId,
          title: createdWorkshop.title,
          category: createdWorkshop.category,
          mode: createdWorkshop.mode,
          ownershipType: createdWorkshop.ownershipType,
          startAt: createdWorkshop.startAt,
          endAt: createdWorkshop.endAt,
          approvalStatus: createdWorkshop.approvalStatus,
          isPublished: createdWorkshop.isPublished
        }
      },
      session
    );

    if (autoPublish) {
      await logWorkshopAudit(
        {
          workshopId: createdWorkshop._id,
          action: 'WORKSHOP_PUBLISHED',
          entityType: 'WORKSHOP',
          entityId: createdWorkshop.workshopId,
          changedBy: auth.userId,
          oldValue: { isPublished: false },
          newValue: { isPublished: true }
        },
        session
      );
    }

    const populated = await Workshop.findById(createdWorkshop._id)
      .populate('departmentId', 'name code')
      .populate('companyId', 'companyName')
      .session(session)
      .lean();

    return populated || createdWorkshop.toObject();
  });

  if (autoPublish && result?._id) {
    dispatchWorkshopPublished(result._id).catch((err) => {
      console.error('dispatchWorkshopPublished failed in createWorkshop:', err.message);
    });
  }

  return result;
}

/**
 * Retrieves a single Workshop by ObjectId or workshopId.
 * Enforces scoped read authorization and enriches with active enrolledCount and seatsRemaining.
 *
 * @param {string} id - ObjectId or WS-YYYY-XXXX string
 * @param {object} auth - Authenticated user context
 * @returns {Promise<object>}
 */
export async function getWorkshopById(id, auth) {
  if (!auth || !auth.userId) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  }

  const isObjectId = mongoose.Types.ObjectId.isValid(id);
  const workshop = await Workshop.findOne(
    isObjectId ? { $or: [{ _id: id }, { workshopId: id }] } : { workshopId: id }
  )
    .populate('departmentId', 'name code')
    .populate('companyId', 'companyName')
    .populate('targetAudience.departmentRules.departmentId', 'name code')
    .populate('coordinatorId', 'email employeeId')
    .lean();

  if (!workshop) {
    throw new AppError(404, 'WORKSHOP_NOT_FOUND', 'Workshop not found.');
  }

  // Company scoping: Companies can ONLY view their own company's workshops
  if (isCompanyUser(auth)) {
    const isOwn = await isCompanyOwnWorkshop(workshop, auth);
    if (!isOwn) {
      throw new AppError(403, 'FORBIDDEN', 'Company can only view and manage their own workshops.');
    }
  }

  // Scoped read authorization:
  // Students and external users can ONLY view published & approved workshops
  const isPublishedAndApproved = workshop.isPublished && workshop.approvalStatus === 'APPROVED';

  let isStudentRegistered = false;
  if (auth.roleId === ROLE_IDS.STUDENT || auth.userType === 'STUDENT') {
    if (!isPublishedAndApproved) {
      throw new AppError(404, 'WORKSHOP_NOT_FOUND', 'Workshop not found.');
    }
    const student = await Student.findOne({ userId: auth.userId }).lean();
    if (student) {
      const activeReg = await WorkshopRegistration.exists({
        workshopId: workshop._id,
        studentId: student._id,
        activeRegistrationKey: 'ACTIVE'
      });
      isStudentRegistered = Boolean(activeReg);
      if (!isStudentRegistered) {
        if (workshop.lifecycleStatus === 'CANCELLED') {
          throw new AppError(404, 'WORKSHOP_NOT_FOUND', 'Workshop not found.');
        }
        if (!isStudentEligibleForCohort(workshop.targetAudience, student)) {
          throw new AppError(403, 'INELIGIBLE_COHORT', 'You are not eligible for this workshop based on your department, course, or semester.');
        }
      }
    }
  }

  if (!isPublishedAndApproved) {

    if (auth.roleId === ROLE_IDS.PLACEMENT_COORDINATOR) {
      let coordDept = null;
      try {
        coordDept = await getCoordinatorDepartment(auth);
      } catch {
        // Coordinator profile or department may not be configured
      }
      const isCreator = String(workshop.createdBy) === String(auth.userId);
      const coordinatorRefId = workshop.coordinatorId?._id || workshop.coordinatorId;
      const isCoordinator = coordinatorRefId && String(coordinatorRefId) === String(auth.userId);
      const workshopDeptId = workshop.departmentId?._id || workshop.departmentId;
      const isDeptMatch = coordDept && workshopDeptId && String(workshopDeptId) === String(coordDept.departmentId);
      const isTargetDeptMatch = coordDept && Array.isArray(workshop.targetAudience?.departmentRules) &&
        workshop.targetAudience.departmentRules.some((r) => String(r.departmentId?._id || r.departmentId) === String(coordDept.departmentId));

      if (!isCreator && !isCoordinator && !isDeptMatch && !isTargetDeptMatch) {
        throw new AppError(403, 'FORBIDDEN', 'You are not authorized to view unpublished workshops outside your department.');
      }
    }
  }

  // Active registration count
  const enrolledCount = await WorkshopRegistration.countDocuments({
    workshopId: workshop._id,
    activeRegistrationKey: 'ACTIVE'
  });

  const seatsRemaining = Math.max(0, workshop.maxParticipants - enrolledCount);

  return {
    ...workshop,
    enrolledCount,
    seatsRemaining,
    ...(auth.roleId === ROLE_IDS.STUDENT || auth.userType === 'STUDENT' ? { isRegistered: isStudentRegistered } : {})
  };
}

/**
 * Lists workshops with filtering, pagination, and role-based access scoping.
 *
 * @param {object} query
 * @param {object} auth
 * @returns {Promise<{ workshops: Array, total: number, page: number, totalPages: number }>}
 */
export async function listWorkshops(query = {}, auth) {
  if (!auth || !auth.userId) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  }

  const {
    page = 1,
    limit = 20,
    search,
    category,
    mode,
    ownershipType,
    departmentId,
    approvalStatus,
    lifecycleStatus,
    isPublished,
    startDateFrom,
    startDateTo,
    myRegistrationsOnly,
    hasPendingEdit,
    includeCancelled
  } = query;

  const mongoQuery = {};
  let studentDoc = null;

  // Role scoping
  if (auth.roleId === ROLE_IDS.STUDENT || auth.userType === 'STUDENT') {
    // Students see only published, approved workshops
    mongoQuery.isPublished = true;
    mongoQuery.approvalStatus = 'APPROVED';

    studentDoc = await Student.findOne({ userId: auth.userId }).lean();

    if (myRegistrationsOnly) {
      if (studentDoc) {
        const myRegs = await WorkshopRegistration.find({
          studentId: studentDoc._id,
          activeRegistrationKey: 'ACTIVE'
        }).select('workshopId').lean();
        const registeredWorkshopIds = myRegs.map((r) => r.workshopId);
        mongoQuery._id = { $in: registeredWorkshopIds };
      } else {
        mongoQuery._id = { $in: [] };
      }
    } else {
      mongoQuery.lifecycleStatus = { $ne: 'CANCELLED' };
      if (studentDoc && studentDoc.departmentId) {
        mongoQuery.$and = mongoQuery.$and || [];
        mongoQuery.$and.push({
          $or: [
            { 'targetAudience.isAllDepartments': true },
            { 'targetAudience.departmentRules.departmentId': studentDoc.departmentId }
          ]
        });
      }
    }
  } else if (auth.roleId === ROLE_IDS.PLACEMENT_COORDINATOR) {
    let coordDept = null;
    try {
      coordDept = await getCoordinatorDepartment(auth);
    } catch {
      // Coordinator may not have department assigned yet or inactive
    }
    // Coordinators see all published workshops plus unpublished ones from their department or created by them or targeted to their department
    if (coordDept) {
      mongoQuery.$or = [
        { isPublished: true, approvalStatus: 'APPROVED' },
        { departmentId: coordDept.departmentId },
        { 'targetAudience.departmentRules.departmentId': coordDept.departmentId },
        { createdBy: auth.userId },
        { coordinatorId: auth.userId }
      ];
    } else {
      mongoQuery.$or = [
        { isPublished: true, approvalStatus: 'APPROVED' },
        { createdBy: auth.userId },
        { coordinatorId: auth.userId }
      ];
    }
  } else if (isCompanyUser(auth)) {
    const companyCondition = await getCompanyWorkshopQueryCondition(auth);
    mongoQuery.$or = companyCondition.$or;
  }

  // Additional explicit filters
  if (category) {
    mongoQuery.category = category;
  }
  if (mode) {
    mongoQuery.mode = mode;
  }
  if (ownershipType) {
    mongoQuery.ownershipType = ownershipType;
  }
  if (departmentId && mongoose.Types.ObjectId.isValid(departmentId)) {
    const deptObjId = new mongoose.Types.ObjectId(departmentId);
    const deptFilter = {
      $or: [
        { departmentId: deptObjId },
        { 'targetAudience.departmentRules.departmentId': deptObjId }
      ]
    };
    mongoQuery.$and = mongoQuery.$and || [];
    mongoQuery.$and.push(deptFilter);
  }
  if (approvalStatus && auth.roleId !== ROLE_IDS.STUDENT) {
    mongoQuery.approvalStatus = approvalStatus;
  }
  if (lifecycleStatus) {
    if ((auth.roleId === ROLE_IDS.STUDENT || auth.userType === 'STUDENT') && !myRegistrationsOnly) {
      if (lifecycleStatus !== 'CANCELLED') {
        mongoQuery.lifecycleStatus = lifecycleStatus;
      }
    } else {
      mongoQuery.lifecycleStatus = lifecycleStatus;
    }
  } else if (!includeCancelled || (includeCancelled !== true && includeCancelled !== 'true')) {
    // By default, cancelled workshops do not appear in normal active listings
    mongoQuery.lifecycleStatus = { $ne: 'CANCELLED' };
  }
  if (typeof isPublished === 'boolean' && auth.roleId !== ROLE_IDS.STUDENT) {
    mongoQuery.isPublished = isPublished;
  }
  if (startDateFrom || startDateTo) {
    mongoQuery.startAt = {};
    if (startDateFrom) mongoQuery.startAt.$gte = new Date(startDateFrom);
    if (startDateTo) mongoQuery.startAt.$lte = new Date(startDateTo);
  }
  if ((hasPendingEdit === true || hasPendingEdit === 'true') && auth.roleId !== ROLE_IDS.STUDENT) {
    mongoQuery['pendingEdit.status'] = 'PENDING';
  }

  if (search) {
    const regex = new RegExp(search.trim(), 'i');
    mongoQuery.$and = mongoQuery.$and || [];
    mongoQuery.$and.push({
      $or: [{ title: regex }, { description: regex }, { workshopId: regex }]
    });
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const [items, total] = await Promise.all([
    Workshop.find(mongoQuery)
      .populate('departmentId', 'name code')
      .populate('companyId', 'companyName')
      .populate('targetAudience.departmentRules.departmentId', 'name code')
      .sort({ startAt: -1, _id: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    Workshop.countDocuments(mongoQuery)
  ]);

  let eligibleItems = items;
  if ((auth.roleId === ROLE_IDS.STUDENT || auth.userType === 'STUDENT') && studentDoc && !myRegistrationsOnly) {
    eligibleItems = items.filter((w) => isStudentEligibleForCohort(w.targetAudience, studentDoc));
  }

  // Enrich with enrolledCount, seatsRemaining, and isRegistered
  const workshopIds = eligibleItems.map((w) => w._id);
  const [activeRegCounts, studentRegistrations] = await Promise.all([
    WorkshopRegistration.aggregate([
      { $match: { workshopId: { $in: workshopIds }, activeRegistrationKey: 'ACTIVE' } },
      { $group: { _id: '$workshopId', count: { $sum: 1 } } }
    ]),
    (auth.roleId === ROLE_IDS.STUDENT || auth.userType === 'STUDENT') && studentDoc && workshopIds.length > 0
      ? WorkshopRegistration.find({
          studentId: studentDoc._id,
          workshopId: { $in: workshopIds },
          activeRegistrationKey: 'ACTIVE'
        }).select('workshopId').lean()
      : Promise.resolve([])
  ]);

  const countMap = new Map();
  for (const entry of activeRegCounts) {
    countMap.set(String(entry._id), entry.count);
  }

  const studentRegisteredSet = new Set(
    (studentRegistrations || []).map((r) => String(r.workshopId))
  );

  const enrichedWorkshops = eligibleItems.map((w) => {
    const enrolledCount = countMap.get(String(w._id)) || 0;
    const isRegistered = studentRegisteredSet.has(String(w._id));
    return {
      ...w,
      enrolledCount,
      seatsRemaining: Math.max(0, w.maxParticipants - enrolledCount),
      ...(auth.roleId === ROLE_IDS.STUDENT || auth.userType === 'STUDENT' ? { isRegistered } : {})
    };
  });

  const effectiveTotal = (auth.roleId === ROLE_IDS.STUDENT || auth.userType === 'STUDENT') && !myRegistrationsOnly ? eligibleItems.length : total;

  return {
    workshops: enrichedWorkshops,
    total: effectiveTotal,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(effectiveTotal / limitNum) || 1
  };
}

/**
 * Updates a workshop.
 * Enforces immutable published fields (ownershipType, departmentId, targetingMode, targetAudience, workshopId).
 *
 * @param {string} id
 * @param {object} updateData
 * @param {object} auth
 * @returns {Promise<object>}
 */
export async function updateWorkshop(id, updateData, auth) {
  if (!auth || !auth.userId) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  }

  const workshop = await Workshop.findById(id);
  if (!workshop) {
    throw new AppError(404, 'WORKSHOP_NOT_FOUND', 'Workshop not found.');
  }

  // Scope check
  await assertDepartmentScope(auth, workshop.departmentId, workshop.ownershipType, workshop);

  if (workshop.lifecycleStatus === 'CANCELLED' || workshop.lifecycleStatus === 'COMPLETED') {
    throw new AppError(400, 'INVALID_LIFECYCLE_STATE', `Cannot update workshop in ${workshop.lifecycleStatus} status.`);
  }

  // Optimistic concurrency protection
  if (updateData.expectedUpdatedAt) {
    const currentMs = new Date(workshop.updatedAt).getTime();
    const expectedMs = new Date(updateData.expectedUpdatedAt).getTime();
    if (!Number.isNaN(expectedMs) && !Number.isNaN(currentMs) && Math.abs(currentMs - expectedMs) > 1000) {
      throw new AppError(409, 'STALE_DATA_CONFLICT', 'Workshop has been modified by another transaction. Please reload the latest data and try again.');
    }
  }

  // Sanitize updateData - strip protected/forged/lifecycle properties
  const sanitizedUpdate = { ...updateData };
  delete sanitizedUpdate.expectedUpdatedAt;
  delete sanitizedUpdate._id;
  delete sanitizedUpdate.id;
  delete sanitizedUpdate.workshopId;
  delete sanitizedUpdate.approvalStatus;
  delete sanitizedUpdate.isPublished;
  delete sanitizedUpdate.lifecycleStatus;
  delete sanitizedUpdate.createdBy;
  delete sanitizedUpdate.companyId;
  delete sanitizedUpdate.enrolledCount;
  delete sanitizedUpdate.seatsRemaining;
  delete sanitizedUpdate.attendedCount;
  delete sanitizedUpdate.completedCount;
  delete sanitizedUpdate.createdAt;
  delete sanitizedUpdate.updatedAt;

  // Capacity protection: Cannot reduce maxParticipants below active registered count
  if (sanitizedUpdate.maxParticipants !== undefined) {
    const activeEnrolledCount = await WorkshopRegistration.countDocuments({
      workshopId: workshop._id,
      activeRegistrationKey: 'ACTIVE'
    });
    if (sanitizedUpdate.maxParticipants < activeEnrolledCount) {
      throw new AppError(
        400,
        'CAPACITY_BELOW_ENROLLED',
        `Cannot reduce maxParticipants (${sanitizedUpdate.maxParticipants}) below the number of active registrations (${activeEnrolledCount}).`
      );
    }
  }

  // Session deletion protection: Cannot remove session IDs with marked attendance
  if (Array.isArray(sanitizedUpdate.sessions)) {
    const existingSessionIds = (workshop.sessions || []).map((s) => s.sessionId);
    const incomingSessionIds = new Set(sanitizedUpdate.sessions.map((s) => s.sessionId));
    const removedSessionIds = existingSessionIds.filter((sid) => !incomingSessionIds.has(sid));

    if (removedSessionIds.length > 0) {
      const attendanceCount = await WorkshopAttendance.countDocuments({
        workshopId: workshop._id,
        sessionId: { $in: removedSessionIds }
      });
      if (attendanceCount > 0) {
        throw new AppError(
          400,
          'CANNOT_DELETE_SESSION_WITH_ATTENDANCE',
          'Cannot remove sessions that already have attendance records marked.'
        );
      }
    }
  }

  if (sanitizedUpdate.trainers) {
    await assertTrainersScope(sanitizedUpdate.trainers, auth, workshop.companyId);
  }

  // Published Immutability Rules:
  // Once published, structural ownership and targeting cannot be modified
  if (workshop.isPublished) {
    if (sanitizedUpdate.ownershipType && sanitizedUpdate.ownershipType !== workshop.ownershipType) {
      throw new AppError(400, 'IMMUTABLE_FIELD_MODIFICATION', 'Cannot modify ownershipType of a published workshop.');
    }
    if (
      sanitizedUpdate.departmentId &&
      String(sanitizedUpdate.departmentId) !== (workshop.departmentId ? String(workshop.departmentId._id || workshop.departmentId) : '')
    ) {
      throw new AppError(400, 'IMMUTABLE_FIELD_MODIFICATION', 'Cannot modify departmentId of a published workshop.');
    }
    if (sanitizedUpdate.targetAudience) {
      const existingAudience = JSON.stringify(workshop.targetAudience);
      const incomingAudience = JSON.stringify(sanitizedUpdate.targetAudience);
      if (existingAudience !== incomingAudience) {
        throw new AppError(400, 'IMMUTABLE_FIELD_MODIFICATION', 'Cannot modify targetAudience of a published workshop.');
      }
    }
  }

  const isCompany = isCompanyUser(auth);

  // If company is editing an already approved or published workshop,
  // the edit must be approved before taking effect!
  if (isCompany && (workshop.approvalStatus === 'APPROVED' || workshop.isPublished)) {
    const result = await executeWorkshopTransaction(async (session) => {
      workshop.pendingEdit = {
        status: 'PENDING',
        proposedChanges: sanitizedUpdate,
        submittedBy: auth.userId,
        submittedAt: new Date(),
        comment: updateData.editReason || updateData.comment || 'Company proposed updates to workshop details.',
        reviewComment: null,
        reviewedBy: null,
        reviewedAt: null
      };

      await workshop.save({ session });

      await logWorkshopAudit(
        {
          workshopId: workshop._id,
          action: 'WORKSHOP_EDIT_SUBMITTED',
          entityType: 'WORKSHOP',
          entityId: workshop.workshopId,
          changedBy: auth.userId,
          reason: updateData.editReason || updateData.comment,
          newValue: sanitizedUpdate
        },
        session
      );

      const populated = await Workshop.findById(workshop._id)
        .populate('departmentId', 'name code')
        .populate('companyId', 'companyName')
        .session(session)
        .lean();

      return {
        ...(populated || workshop.toObject()),
        requiresApproval: true,
        message: 'Workshop edit request submitted for administrative review.'
      };
    });

    dispatchCompanyWorkshopUpdateForReview(workshop._id).catch((err) => {
      console.error('dispatchCompanyWorkshopUpdateForReview failed:', err.message);
    });

    return result;
  }

  const oldValue = {
    title: workshop.title,
    description: workshop.description,
    category: workshop.category,
    mode: workshop.mode,
    venue: workshop.venue,
    meetingLink: workshop.meetingLink,
    maxParticipants: workshop.maxParticipants,
    startAt: workshop.startAt,
    endAt: workshop.endAt,
    registrationOpensAt: workshop.registrationOpensAt,
    registrationDeadline: workshop.registrationDeadline,
    certificateTemplateId: workshop.certificateTemplateId
  };

  const result = await executeWorkshopTransaction(async (session) => {
    // Apply sanitized allowed updates to Mongoose document
    Object.assign(workshop, sanitizedUpdate);

    await workshop.save({ session });

    await logWorkshopAudit(
      {
        workshopId: workshop._id,
        action: 'WORKSHOP_UPDATED',
        entityType: 'WORKSHOP',
        entityId: workshop.workshopId,
        changedBy: auth.userId,
        oldValue,
        newValue: sanitizedUpdate
      },
      session
    );

    const populated = await Workshop.findById(workshop._id)
      .populate('departmentId', 'name code')
      .populate('companyId', 'companyName')
      .session(session)
      .lean();

    return populated || workshop.toObject();
  });

  if (workshop.isPublished) {
    dispatchWorkshopUpdateAnnouncement(workshop._id, {
      oldValue,
      changedFields: Object.keys(sanitizedUpdate)
    }).catch((err) => {
      console.error('dispatchWorkshopUpdateAnnouncement failed in updateWorkshop:', err.message);
    });
  }

  return result;
}

/**
 * Determines whether a workshop is targeted to or owned by only a single department.
 * Returns { isSingleDept: boolean, departmentId: string | null, count: number }
 */
export function getWorkshopDepartmentScope(workshop) {
  if (workshop.targetAudience?.isAllDepartments) {
    return { isSingleDept: false, departmentId: null, count: Infinity };
  }

  const deptIds = new Set();

  if (workshop.departmentId) {
    const dId = workshop.departmentId._id ? String(workshop.departmentId._id) : String(workshop.departmentId);
    if (dId) deptIds.add(dId);
  }

  const rules = workshop.targetAudience?.departmentRules || [];
  for (const rule of rules) {
    if (rule.departmentId) {
      const rId = rule.departmentId._id ? String(rule.departmentId._id) : String(rule.departmentId);
      if (rId) deptIds.add(rId);
    }
  }

  if (deptIds.size === 1) {
    return {
      isSingleDept: true,
      departmentId: Array.from(deptIds)[0],
      count: 1
    };
  }

  return {
    isSingleDept: false,
    departmentId: null,
    count: deptIds.size
  };
}

/**
 * Asserts authorization for reviewing (approving or rejecting) a company workshop edit request:
 * - Super Admin and Placement Head can approve/reject any workshop edit.
 * - Placement Coordinator can approve/reject ONLY if the workshop includes only ONE department
 *   and that department matches the coordinator's assigned department.
 */
export async function assertEditReviewScope(auth, workshop) {
  if (!auth || !auth.userId) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  }

  if (auth.roleId === ROLE_IDS.SUPER_ADMIN || auth.roleId === ROLE_IDS.PLACEMENT_HEAD) {
    return true;
  }

  if (auth.roleId === ROLE_IDS.PLACEMENT_COORDINATOR) {
    const scope = getWorkshopDepartmentScope(workshop);
    if (!scope.isSingleDept || !scope.departmentId) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'Only the Placement Head can approve edits for workshops that include multiple departments or central placement cell.'
      );
    }

    const coordDept = await getCoordinatorDepartment(auth);
    if (!coordDept || String(coordDept.departmentId) !== String(scope.departmentId)) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'You are only authorized to approve workshop edits for your assigned department.'
      );
    }

    return true;
  }

  throw new AppError(403, 'FORBIDDEN', 'You do not have permission to approve or reject workshop edits.');
}

/**
 * Approves a company's pending workshop edit request and merges proposed changes into the live workshop.
 * Authorized for Placement Head, Super Admin, or Placement Coordinator (if single department).
 *
 * @param {string} id - Workshop _id
 * @param {object} [options={}] - { comment }
 * @param {object} auth
 * @returns {Promise<object>}
 */
export async function approveWorkshopEdit(id, { comment } = {}, auth) {
  if (!auth || !auth.userId) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  }

  const workshop = await Workshop.findById(id);
  if (!workshop) {
    throw new AppError(404, 'WORKSHOP_NOT_FOUND', 'Workshop not found.');
  }

  await assertEditReviewScope(auth, workshop);

  if (!workshop.pendingEdit || workshop.pendingEdit.status !== 'PENDING') {
    throw new AppError(400, 'NO_PENDING_EDIT', 'This workshop does not have a pending edit request awaiting approval.');
  }

  const txResult = await executeWorkshopTransaction(async (session) => {
    const proposed = workshop.pendingEdit.proposedChanges || {};

    const oldValue = {};
    for (const key of Object.keys(proposed)) {
      oldValue[key] = workshop[key];
      workshop[key] = proposed[key];
    }

    workshop.pendingEdit.status = 'APPROVED';
    workshop.pendingEdit.reviewedBy = auth.userId;
    workshop.pendingEdit.reviewedAt = new Date();
    workshop.pendingEdit.reviewComment = comment ? comment.trim() : 'Approved';

    await workshop.save({ session });

    await logWorkshopAudit(
      {
        workshopId: workshop._id,
        action: 'WORKSHOP_EDIT_APPROVED',
        entityType: 'WORKSHOP',
        entityId: workshop.workshopId,
        changedBy: auth.userId,
        reason: comment ? comment.trim() : undefined,
        oldValue,
        newValue: proposed
      },
      session
    );

    const populated = await Workshop.findById(workshop._id)
      .populate('departmentId', 'name code')
      .populate('companyId', 'companyName')
      .session(session)
      .lean();

    return {
      result: populated || workshop.toObject(),
      oldValue,
      proposed,
      wasPublished: workshop.isPublished
    };
  });

  if (txResult.wasPublished) {
    dispatchWorkshopUpdateAnnouncement(workshop._id, {
      oldValue: txResult.oldValue,
      changedFields: Object.keys(txResult.proposed || {})
    }).catch((err) => {
      console.error('dispatchWorkshopUpdateAnnouncement failed in approveWorkshopEdit:', err.message);
    });
  }

  return txResult.result;
}

/**
 * Rejects a company's pending workshop edit request without modifying live workshop data.
 * Requires mandatory rejection reason.
 * Authorized for Placement Head, Super Admin, or Placement Coordinator (if single department).
 *
 * @param {string} id - Workshop _id
 * @param {object} options - { reason }
 * @param {object} auth
 * @returns {Promise<object>}
 */
export async function rejectWorkshopEdit(id, { reason }, auth) {
  if (!auth || !auth.userId) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  }

  if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
    throw new AppError(400, 'INVALID_INPUT', 'Rejection reason must be at least 5 characters.');
  }

  const workshop = await Workshop.findById(id);
  if (!workshop) {
    throw new AppError(404, 'WORKSHOP_NOT_FOUND', 'Workshop not found.');
  }

  await assertEditReviewScope(auth, workshop);

  if (!workshop.pendingEdit || workshop.pendingEdit.status !== 'PENDING') {
    throw new AppError(400, 'NO_PENDING_EDIT', 'This workshop does not have a pending edit request awaiting review.');
  }

  return executeWorkshopTransaction(async (session) => {
    workshop.pendingEdit.status = 'REJECTED';
    workshop.pendingEdit.reviewedBy = auth.userId;
    workshop.pendingEdit.reviewedAt = new Date();
    workshop.pendingEdit.reviewComment = reason.trim();

    await workshop.save({ session });

    await logWorkshopAudit(
      {
        workshopId: workshop._id,
        action: 'WORKSHOP_EDIT_REJECTED',
        entityType: 'WORKSHOP',
        entityId: workshop.workshopId,
        changedBy: auth.userId,
        reason: reason.trim(),
        oldValue: { pendingEditStatus: 'PENDING' },
        newValue: { pendingEditStatus: 'REJECTED', reason: reason.trim() }
      },
      session
    );

    const populated = await Workshop.findById(workshop._id)
      .populate('departmentId', 'name code')
      .populate('companyId', 'companyName')
      .session(session)
      .lean();

    return populated || workshop.toObject();
  });
}

/**
 * Submits a DRAFT or REJECTED workshop for approval (transitions to PENDING_APPROVAL).
 *
 * @param {string} id
 * @param {object} auth
 * @returns {Promise<object>}
 */
export async function submitWorkshopForApproval(id, auth) {
  if (!auth || !auth.userId) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  }

  const workshop = await Workshop.findById(id);
  if (!workshop) {
    throw new AppError(404, 'WORKSHOP_NOT_FOUND', 'Workshop not found.');
  }

  await assertDepartmentScope(auth, workshop.departmentId, workshop.ownershipType, workshop);

  if (workshop.approvalStatus !== 'DRAFT' && workshop.approvalStatus !== 'REJECTED') {
    throw new AppError(
      400,
      'INVALID_LIFECYCLE_TRANSITION',
      `Cannot submit workshop with approvalStatus "${workshop.approvalStatus}". Must be DRAFT or REJECTED.`
    );
  }

  const result = await executeWorkshopTransaction(async (session) => {
    const updated = await Workshop.findOneAndUpdate(
      { _id: id, approvalStatus: { $in: ['DRAFT', 'REJECTED'] } },
      { $set: { approvalStatus: 'PENDING_APPROVAL' } },
      { new: true, session }
    );

    if (!updated) {
      throw new AppError(409, 'CONCURRENT_TRANSITION_CONFLICT', 'Failed to submit workshop due to concurrent state change.');
    }

    await logWorkshopAudit(
      {
        workshopId: updated._id,
        action: 'WORKSHOP_SUBMITTED',
        entityType: 'WORKSHOP',
        entityId: updated.workshopId,
        changedBy: auth.userId,
        oldValue: { approvalStatus: workshop.approvalStatus },
        newValue: { approvalStatus: 'PENDING_APPROVAL' }
      },
      session
    );

    return updated.toObject();
  });

  dispatchWorkshopSubmittedForApproval(result._id).catch((err) => {
    console.error('dispatchWorkshopSubmittedForApproval failed in submitWorkshopForApproval:', err.message);
  });

  return result;
}

/**
 * Approves a workshop (transitions from PENDING_APPROVAL to APPROVED).
 * Requires Placement Head or Super Admin authorization.
 *
 * @param {string} id
 * @param {object} [options={}]
 * @param {string} [options.comment]
 * @param {object} auth
 * @returns {Promise<object>}
 */
export async function approveWorkshop(id, { comment } = {}, auth) {
  if (!auth || !auth.userId) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  }

  if (auth.roleId !== ROLE_IDS.SUPER_ADMIN && auth.roleId !== ROLE_IDS.PLACEMENT_HEAD) {
    throw new AppError(403, 'FORBIDDEN', 'Only Placement Head or Super Admin can approve workshops.');
  }

  const workshop = await Workshop.findById(id);
  if (!workshop) {
    throw new AppError(404, 'WORKSHOP_NOT_FOUND', 'Workshop not found.');
  }

  if (workshop.approvalStatus !== 'PENDING_APPROVAL') {
    throw new AppError(
      400,
      'INVALID_LIFECYCLE_TRANSITION',
      `Cannot approve workshop with approvalStatus "${workshop.approvalStatus}". Must be PENDING_APPROVAL.`
    );
  }

  return executeWorkshopTransaction(async (session) => {
    const updated = await Workshop.findOneAndUpdate(
      { _id: id, approvalStatus: 'PENDING_APPROVAL' },
      { $set: { approvalStatus: 'APPROVED' } },
      { new: true, session }
    );

    if (!updated) {
      throw new AppError(409, 'CONCURRENT_TRANSITION_CONFLICT', 'Failed to approve workshop due to concurrent state change.');
    }

    await logWorkshopAudit(
      {
        workshopId: updated._id,
        action: 'WORKSHOP_APPROVED',
        entityType: 'WORKSHOP',
        entityId: updated.workshopId,
        changedBy: auth.userId,
        reason: comment ? comment.trim() : undefined,
        oldValue: { approvalStatus: 'PENDING_APPROVAL' },
        newValue: { approvalStatus: 'APPROVED' }
      },
      session
    );

    return updated.toObject();
  });
}

/**
 * Rejects a workshop (transitions from PENDING_APPROVAL to REJECTED).
 * Requires Placement Head or Super Admin authorization.
 * Mandatory non-empty rejection reason stored exclusively in the audit log.
 *
 * @param {string} id
 * @param {object} options
 * @param {string} options.reason
 * @param {object} auth
 * @returns {Promise<object>}
 */
export async function rejectWorkshop(id, { reason }, auth) {
  if (!auth || !auth.userId) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  }

  if (auth.roleId !== ROLE_IDS.SUPER_ADMIN && auth.roleId !== ROLE_IDS.PLACEMENT_HEAD) {
    throw new AppError(403, 'FORBIDDEN', 'Only Placement Head or Super Admin can reject workshops.');
  }

  if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
    throw new AppError(400, 'INVALID_INPUT', 'Rejection reason must be at least 5 characters.');
  }

  const workshop = await Workshop.findById(id);
  if (!workshop) {
    throw new AppError(404, 'WORKSHOP_NOT_FOUND', 'Workshop not found.');
  }

  if (workshop.approvalStatus !== 'PENDING_APPROVAL') {
    throw new AppError(
      400,
      'INVALID_LIFECYCLE_TRANSITION',
      `Cannot reject workshop with approvalStatus "${workshop.approvalStatus}". Must be PENDING_APPROVAL.`
    );
  }

  return executeWorkshopTransaction(async (session) => {
    const updated = await Workshop.findOneAndUpdate(
      { _id: id, approvalStatus: 'PENDING_APPROVAL' },
      { $set: { approvalStatus: 'REJECTED' } },
      { new: true, session }
    );

    if (!updated) {
      throw new AppError(409, 'CONCURRENT_TRANSITION_CONFLICT', 'Failed to reject workshop due to concurrent state change.');
    }

    // Rejection reason stored in WorkshopAuditLog without mutating Workshop schema
    await logWorkshopAudit(
      {
        workshopId: updated._id,
        action: 'WORKSHOP_REJECTED',
        entityType: 'WORKSHOP',
        entityId: updated.workshopId,
        changedBy: auth.userId,
        reason: reason.trim(),
        oldValue: { approvalStatus: 'PENDING_APPROVAL' },
        newValue: { approvalStatus: 'REJECTED' }
      },
      session
    );

    return updated.toObject();
  });
}

/**
 * Publishes an approved workshop.
 *
 * @param {string} id
 * @param {object} auth
 * @returns {Promise<object>}
 */
export async function publishWorkshop(id, auth) {
  if (!auth || !auth.userId) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  }

  if (isCompanyUser(auth)) {
    throw new AppError(403, 'FORBIDDEN', 'Companies cannot publish workshops.');
  }

  const workshop = await Workshop.findById(id);
  if (!workshop) {
    throw new AppError(404, 'WORKSHOP_NOT_FOUND', 'Workshop not found.');
  }

  await assertDepartmentScope(auth, workshop.departmentId, workshop.ownershipType, workshop);

  if (workshop.lifecycleStatus === 'CANCELLED') {
    throw new AppError(400, 'CANNOT_PUBLISH_CANCELLED', 'Cancelled workshops cannot be published.');
  }

  if (workshop.approvalStatus !== 'APPROVED') {
    throw new AppError(400, 'WORKSHOP_NOT_APPROVED', 'Only approved workshops can be published.');
  }

  if (workshop.isPublished) {
    throw new AppError(400, 'ALREADY_PUBLISHED', 'Workshop is already published.');
  }

  const result = await executeWorkshopTransaction(async (session) => {
    const updated = await Workshop.findOneAndUpdate(
      { _id: id, approvalStatus: 'APPROVED', isPublished: false, lifecycleStatus: { $ne: 'CANCELLED' } },
      { $set: { isPublished: true }, $inc: { publishVersion: 1 } },
      { new: true, session }
    );

    if (!updated) {
      throw new AppError(409, 'CONCURRENT_TRANSITION_CONFLICT', 'Failed to publish workshop due to concurrent state change.');
    }

    await logWorkshopAudit(
      {
        workshopId: updated._id,
        action: 'WORKSHOP_PUBLISHED',
        entityType: 'WORKSHOP',
        entityId: updated.workshopId,
        changedBy: auth.userId,
        oldValue: { isPublished: false },
        newValue: { isPublished: true }
      },
      session
    );

    return updated.toObject();
  });

  dispatchWorkshopPublished(result._id, result.publishVersion).catch((err) => {
    console.error('dispatchWorkshopPublished failed in publishWorkshop:', err.message);
  });

  return result;
}

/**
 * Cancels a workshop.
 * Atomically transitions workshop to CANCELLED and cascades cancellation to all active registrations,
 * clearing activeRegistrationKey while preserving historical attendance and issued certificates.
 *
 * @param {string} id
 * @param {object} options
 * @param {string} options.reason - Mandatory cancellation reason
 * @param {object} auth
 * @returns {Promise<object>}
 */
export async function cancelWorkshop(id, { reason }, auth) {
  if (!auth || !auth.userId) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  }

  if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
    throw new AppError(400, 'INVALID_INPUT', 'Cancellation reason must be at least 5 characters.');
  }

  const workshop = await Workshop.findById(id);
  if (!workshop) {
    throw new AppError(404, 'WORKSHOP_NOT_FOUND', 'Workshop not found.');
  }

  await assertDepartmentScope(auth, workshop.departmentId, workshop.ownershipType, workshop);

  if (workshop.lifecycleStatus === 'CANCELLED') {
    throw new AppError(400, 'ALREADY_CANCELLED', 'Workshop is already cancelled.');
  }

  if (workshop.lifecycleStatus === 'COMPLETED') {
    throw new AppError(400, 'INVALID_LIFECYCLE_STATE', 'Completed workshops cannot be cancelled.');
  }

  return executeWorkshopTransaction(async (session) => {
    // 1. Update workshop lifecycle status and unpublish
    const updated = await Workshop.findOneAndUpdate(
      { _id: id, lifecycleStatus: { $ne: 'CANCELLED' } },
      {
        $set: {
          lifecycleStatus: 'CANCELLED',
          isPublished: false,
          cancellationReason: reason.trim()
        }
      },
      { new: true, session }
    );

    if (!updated) {
      throw new AppError(409, 'CONCURRENT_TRANSITION_CONFLICT', 'Failed to cancel workshop due to concurrent state change.');
    }

    // 2. Cascade cancel all active registrations atomically
    const activeRegistrations = await WorkshopRegistration.find({
      workshopId: id,
      activeRegistrationKey: 'ACTIVE'
    }).session(session);

    const now = new Date();
    for (const reg of activeRegistrations) {
      await WorkshopRegistration.updateOne(
        { _id: reg._id },
        {
          $set: {
            status: 'CANCELLED',
            cancelledAt: now,
            cancelledBy: auth.userId,
            cancellationReason: `Workshop cancelled: ${reason.trim()}`
          },
          $unset: { activeRegistrationKey: 1 }
        },
        { session }
      );

      await logWorkshopAudit(
        {
          workshopId: id,
          registrationId: reg._id,
          action: 'REGISTRATION_CANCELLED',
          entityType: 'REGISTRATION',
          entityId: reg.registrationId,
          changedBy: auth.userId,
          reason: `Workshop cancelled: ${reason.trim()}`,
          oldValue: { status: reg.status, activeRegistrationKey: 'ACTIVE' },
          newValue: { status: 'CANCELLED', activeRegistrationKey: null }
        },
        session
      );
    }

    // 3. Log workshop cancellation audit
    await logWorkshopAudit(
      {
        workshopId: updated._id,
        action: 'WORKSHOP_CANCELLED',
        entityType: 'WORKSHOP',
        entityId: updated.workshopId,
        changedBy: auth.userId,
        reason: reason.trim(),
        oldValue: { lifecycleStatus: workshop.lifecycleStatus, isPublished: workshop.isPublished },
        newValue: { lifecycleStatus: 'CANCELLED', isPublished: false, cancelledActiveRegistrationsCount: activeRegistrations.length }
      },
      session
    );

    return updated.toObject();
  });
}

/**
 * Hard deletes a DRAFT, REJECTED, or CANCELLED workshop.
 * Permitted only if the workshop is in DRAFT, REJECTED, or CANCELLED status.
 * Preserves the audit trail with the workshop business identifier.
 *
 * @param {string} id
 * @param {object} auth
 * @returns {Promise<{ success: boolean, deletedWorkshopId: string }>}
 */

/**
 * Concludes and transitions a workshop to COMPLETED lifecycle status.
 * Authoritative trigger for automatic certificate generation.
 *
 * Rules:
 * - Allowed for Super Admin, Placement Head, Placement Coordinator (for department), or owning Company.
 * - Workshop must be published, not CANCELLED, and not already COMPLETED.
 * - Concludes attendance: recalculates final completion metrics for all registrations.
 * - Automatically issues personalized certificates for all eligible candidates (attendance >= 75%).
 * - Generates audit log.
 *
 * @param {string} id
 * @param {object} auth
 * @returns {Promise<{ workshop: object, issuance: object }>}
 */
export async function completeWorkshop(id, auth) {
  if (!auth || !auth.userId) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  }

  const workshop = await Workshop.findById(id);
  if (!workshop) {
    throw new AppError(404, 'WORKSHOP_NOT_FOUND', 'Workshop not found.');
  }

  await assertDepartmentScope(auth, workshop.departmentId, workshop.ownershipType, workshop);

  if (workshop.lifecycleStatus === 'CANCELLED') {
    throw new AppError(400, 'INVALID_LIFECYCLE_STATE', 'Cancelled workshops cannot be completed.');
  }

  if (workshop.lifecycleStatus === 'COMPLETED') {
    throw new AppError(400, 'ALREADY_COMPLETED', 'Workshop is already marked as completed.');
  }

  // 1. Transition lifecycle status to COMPLETED
  const updated = await Workshop.findOneAndUpdate(
    { _id: id, lifecycleStatus: { $nin: ['COMPLETED', 'CANCELLED'] } },
    { $set: { lifecycleStatus: 'COMPLETED' } },
    { new: true }
  );

  if (!updated) {
    throw new AppError(409, 'CONCURRENT_TRANSITION_CONFLICT', 'Failed to complete workshop due to concurrent state change.');
  }

  // 2. Finalize attendance for all registered students
  const registrations = await WorkshopRegistration.find({
    workshopId: id,
    status: { $in: ['REGISTERED', 'ATTENDED', 'COMPLETED'] }
  });

  for (const reg of registrations) {
    const records = await WorkshopAttendance.find({ registrationId: reg._id });
    const metrics = calculateRegistrationAttendance(workshop.sessions, records, true);
    await WorkshopRegistration.updateOne(
      { _id: reg._id },
      {
        $set: {
          attendancePercentage: metrics.attendancePercentage,
          completionStatus: metrics.completionStatus,
          status: metrics.completionStatus === 'COMPLETED' ? 'COMPLETED' : 'ATTENDED'
        }
      }
    );
  }

  // Update completed count on workshop document
  const completedCount = await WorkshopRegistration.countDocuments({
    workshopId: id,
    completionStatus: 'COMPLETED'
  });
  await Workshop.updateOne({ _id: id }, { $set: { completedCount } });

  // 3. Log audit trail
  try {
    await executeWorkshopTransaction(async (session) => {
      await logWorkshopAudit(
        {
          workshopId: updated._id,
          action: 'WORKSHOP_COMPLETED',
          entityType: 'WORKSHOP',
          entityId: updated.workshopId,
          changedBy: auth.userId,
          oldValue: { lifecycleStatus: workshop.lifecycleStatus },
          newValue: { lifecycleStatus: 'COMPLETED', completedCount }
        },
        session
      );
    });
  } catch (auditErr) {
    console.warn('Workshop completion audit log failed:', auditErr.message);
  }

  // 4. Automatically trigger certificate issuance for eligible students
  let issuanceResult = { success: true, issuedCount: 0, certificates: [] };
  try {
    issuanceResult = await issueCertificates({ workshopId: id }, auth);
  } catch (issuanceErr) {
    console.error('Automatic certificate issuance during completion failed:', issuanceErr.message);
    issuanceResult = {
      success: false,
      error: issuanceErr.message,
      issuedCount: 0,
      certificates: []
    };
  }

  return {
    success: true,
    workshop: updated.toObject(),
    issuance: issuanceResult
  };
}

export async function deleteWorkshop(id, auth) {
  if (!auth || !auth.userId) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  }

  const workshop = await Workshop.findById(id);
  if (!workshop) {
    throw new AppError(404, 'WORKSHOP_NOT_FOUND', 'Workshop not found.');
  }

  await assertDepartmentScope(auth, workshop.departmentId, workshop.ownershipType, workshop);

  // Must be DRAFT, REJECTED, or CANCELLED
  if (
    workshop.approvalStatus !== 'DRAFT' &&
    workshop.approvalStatus !== 'REJECTED' &&
    workshop.lifecycleStatus !== 'CANCELLED'
  ) {
    throw new AppError(
      400,
      'CANNOT_DELETE_ACTIVE_WORKSHOP',
      `Cannot delete workshop with approvalStatus "${workshop.approvalStatus}" and lifecycleStatus "${workshop.lifecycleStatus}". Only DRAFT, REJECTED, or CANCELLED workshops can be deleted.`
    );
  }

  // Must not be actively published
  if (workshop.isPublished && workshop.lifecycleStatus !== 'CANCELLED') {
    throw new AppError(400, 'CANNOT_DELETE_PUBLISHED_WORKSHOP', 'Published workshops cannot be deleted. Cancel the workshop first.');
  }

  return executeWorkshopTransaction(async (session) => {
    // Check if any registrations exist (only blocks deletion if not cancelled)
    const totalRegistrations = await WorkshopRegistration.countDocuments({ workshopId: id }).session(session);
    if (totalRegistrations > 0 && workshop.lifecycleStatus !== 'CANCELLED') {
      throw new AppError(
        400,
        'WORKSHOP_HAS_REGISTRATIONS',
        'Workshops with registration history cannot be deleted. Cancel the workshop instead.'
      );
    }

    if (workshop.lifecycleStatus === 'CANCELLED' && totalRegistrations > 0) {
      await WorkshopRegistration.deleteMany({ workshopId: id }, { session });
    }

    const workshopBusinessId = workshop.workshopId;
    await Workshop.deleteOne({ _id: id }, { session });

    // Preserved audit event retains workshopId even though Workshop document is deleted
    await logWorkshopAudit(
      {
        workshopId: id,
        action: 'WORKSHOP_DELETED',
        entityType: 'WORKSHOP',
        entityId: workshopBusinessId,
        changedBy: auth.userId,
        oldValue: {
          workshopId: workshopBusinessId,
          title: workshop.title,
          category: workshop.category,
          approvalStatus: workshop.approvalStatus
        }
      },
      session
    );

    return {
      success: true,
      deletedWorkshopId: workshopBusinessId
    };
  });
}
