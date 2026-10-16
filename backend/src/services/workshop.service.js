import mongoose from 'mongoose';
import { Workshop } from '../models/workshop.model.js';
import { WorkshopRegistration } from '../models/workshop_registration.model.js';
import { Student } from '../models/student.model.js';
import { ROLE_IDS } from '../utils/access-constants.js';
import { AppError } from '../utils/app-error.js';
import { getCoordinatorDepartment } from '../utils/department-scope.js';
import { generateWorkshopId } from '../utils/sequence-generator.js';
import { executeWorkshopTransaction, logWorkshopAudit } from './workshop-audit.service.js';

/**
 * Checks if user has permission to manage (create/update/submit) a workshop for a department.
 */
async function assertDepartmentScope(auth, workshopDepartmentId, ownershipType) {
  if (auth.roleId === ROLE_IDS.SUPER_ADMIN || auth.roleId === ROLE_IDS.PLACEMENT_HEAD) {
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
    if (!workshopDepartmentId || String(workshopDepartmentId) !== String(coordDept.departmentId)) {
      throw new AppError(403, 'FORBIDDEN', 'You are only authorized to manage workshops for your assigned department.');
    }
    return;
  }

  throw new AppError(403, 'FORBIDDEN', 'You do not have permission to perform this workshop action.');
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

  if (auth.roleId === ROLE_IDS.COMPANY) {
    throw new AppError(403, 'FORBIDDEN', 'Companies cannot create workshops directly.');
  }

  // Validate start date is provided and valid
  if (!inputData.startAt) {
    throw new AppError(400, 'INVALID_INPUT', 'Workshop startAt date is required.');
  }

  const startAt = inputData.startAt instanceof Date ? inputData.startAt : new Date(inputData.startAt);
  if (Number.isNaN(startAt.getTime())) {
    throw new AppError(400, 'INVALID_INPUT', 'Invalid workshop startAt date provided.');
  }

  // Verify department scope
  await assertDepartmentScope(auth, inputData.departmentId, inputData.ownershipType || 'DEPARTMENT');

  return executeWorkshopTransaction(async (session) => {
    // Generate WS-YYYY-XXXX with IST year
    const workshopId = await generateWorkshopId(startAt, { session });

    const workshopData = {
      ...inputData,
      workshopId,
      createdBy: auth.userId,
      coordinatorId: inputData.coordinatorId || (auth.roleId === ROLE_IDS.PLACEMENT_COORDINATOR ? auth.userId : undefined),
      approvalStatus: 'DRAFT',
      isPublished: false,
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
          endAt: createdWorkshop.endAt
        }
      },
      session
    );

    return createdWorkshop.toObject();
  });
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
  ).lean();

  if (!workshop) {
    throw new AppError(404, 'WORKSHOP_NOT_FOUND', 'Workshop not found.');
  }

  // Scoped read authorization:
  // Students and external users can ONLY view published & approved workshops
  const isPublishedAndApproved = workshop.isPublished && workshop.approvalStatus === 'APPROVED';

  if (!isPublishedAndApproved) {
    if (auth.roleId === ROLE_IDS.STUDENT || auth.userType === 'STUDENT') {
      throw new AppError(404, 'WORKSHOP_NOT_FOUND', 'Workshop not found.');
    }

    if (auth.roleId === ROLE_IDS.PLACEMENT_COORDINATOR) {
      const coordDept = await getCoordinatorDepartment(auth);
      const isCreator = String(workshop.createdBy) === String(auth.userId);
      const isCoordinator = workshop.coordinatorId && String(workshop.coordinatorId) === String(auth.userId);
      const isDeptMatch = coordDept && workshop.departmentId && String(workshop.departmentId) === String(coordDept.departmentId);

      if (!isCreator && !isCoordinator && !isDeptMatch) {
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
    seatsRemaining
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
    myRegistrationsOnly
  } = query;

  const mongoQuery = {};

  // Role scoping
  if (auth.roleId === ROLE_IDS.STUDENT || auth.userType === 'STUDENT') {
    // Students see only published, approved workshops
    mongoQuery.isPublished = true;
    mongoQuery.approvalStatus = 'APPROVED';

    if (myRegistrationsOnly) {
      const student = await Student.findOne({ userId: auth.userId }).lean();
      if (student) {
        const myRegs = await WorkshopRegistration.find({
          studentId: student._id,
          activeRegistrationKey: 'ACTIVE'
        }).select('workshopId').lean();
        const registeredWorkshopIds = myRegs.map((r) => r.workshopId);
        mongoQuery._id = { $in: registeredWorkshopIds };
      } else {
        mongoQuery._id = { $in: [] };
      }
    }
  } else if (auth.roleId === ROLE_IDS.PLACEMENT_COORDINATOR) {
    const coordDept = await getCoordinatorDepartment(auth);
    // Coordinators see all published workshops plus unpublished ones from their department or created by them
    if (coordDept) {
      mongoQuery.$or = [
        { isPublished: true, approvalStatus: 'APPROVED' },
        { departmentId: coordDept.departmentId },
        { createdBy: auth.userId },
        { coordinatorId: auth.userId }
      ];
    }
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
    mongoQuery.departmentId = new mongoose.Types.ObjectId(departmentId);
  }
  if (approvalStatus && auth.roleId !== ROLE_IDS.STUDENT) {
    mongoQuery.approvalStatus = approvalStatus;
  }
  if (lifecycleStatus) {
    mongoQuery.lifecycleStatus = lifecycleStatus;
  }
  if (typeof isPublished === 'boolean' && auth.roleId !== ROLE_IDS.STUDENT) {
    mongoQuery.isPublished = isPublished;
  }
  if (startDateFrom || startDateTo) {
    mongoQuery.startAt = {};
    if (startDateFrom) mongoQuery.startAt.$gte = new Date(startDateFrom);
    if (startDateTo) mongoQuery.startAt.$lte = new Date(startDateTo);
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
      .sort({ startAt: -1, _id: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    Workshop.countDocuments(mongoQuery)
  ]);

  // Enrich with enrolledCount and seatsRemaining
  const workshopIds = items.map((w) => w._id);
  const activeRegCounts = await WorkshopRegistration.aggregate([
    { $match: { workshopId: { $in: workshopIds }, activeRegistrationKey: 'ACTIVE' } },
    { $group: { _id: '$workshopId', count: { $sum: 1 } } }
  ]);

  const countMap = new Map();
  for (const entry of activeRegCounts) {
    countMap.set(String(entry._id), entry.count);
  }

  const enrichedWorkshops = items.map((w) => {
    const enrolledCount = countMap.get(String(w._id)) || 0;
    return {
      ...w,
      enrolledCount,
      seatsRemaining: Math.max(0, w.maxParticipants - enrolledCount)
    };
  });

  return {
    workshops: enrichedWorkshops,
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum) || 1
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
  await assertDepartmentScope(auth, workshop.departmentId, workshop.ownershipType);

  if (workshop.lifecycleStatus === 'CANCELLED' || workshop.lifecycleStatus === 'COMPLETED') {
    throw new AppError(400, 'INVALID_LIFECYCLE_STATE', `Cannot update workshop in ${workshop.lifecycleStatus} status.`);
  }

  // Published Immutability Rules:
  // Once published, core structural fields cannot be modified
  if (workshop.isPublished) {
    if (updateData.workshopId && updateData.workshopId !== workshop.workshopId) {
      throw new AppError(400, 'IMMUTABLE_FIELD_MODIFICATION', 'Cannot modify workshopId of a published workshop.');
    }
    if (updateData.ownershipType && updateData.ownershipType !== workshop.ownershipType) {
      throw new AppError(400, 'IMMUTABLE_FIELD_MODIFICATION', 'Cannot modify ownershipType of a published workshop.');
    }
    if (
      updateData.departmentId &&
      String(updateData.departmentId) !== (workshop.departmentId ? String(workshop.departmentId) : '')
    ) {
      throw new AppError(400, 'IMMUTABLE_FIELD_MODIFICATION', 'Cannot modify departmentId of a published workshop.');
    }
    if (updateData.targetAudience) {
      const existingAudience = JSON.stringify(workshop.targetAudience);
      const incomingAudience = JSON.stringify(updateData.targetAudience);
      if (existingAudience !== incomingAudience) {
        throw new AppError(400, 'IMMUTABLE_FIELD_MODIFICATION', 'Cannot modify targetAudience of a published workshop.');
      }
    }
  }

  return executeWorkshopTransaction(async (session) => {
    const oldValue = {
      title: workshop.title,
      description: workshop.description,
      venue: workshop.venue,
      meetingLink: workshop.meetingLink,
      maxParticipants: workshop.maxParticipants,
      startAt: workshop.startAt,
      endAt: workshop.endAt
    };

    // Apply allowed updates to Mongoose document
    Object.assign(workshop, updateData);

    await workshop.save({ session });

    await logWorkshopAudit(
      {
        workshopId: workshop._id,
        action: 'WORKSHOP_UPDATED',
        entityType: 'WORKSHOP',
        entityId: workshop.workshopId,
        changedBy: auth.userId,
        oldValue,
        newValue: updateData
      },
      session
    );

    return workshop.toObject();
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

  await assertDepartmentScope(auth, workshop.departmentId, workshop.ownershipType);

  if (workshop.approvalStatus !== 'DRAFT' && workshop.approvalStatus !== 'REJECTED') {
    throw new AppError(
      400,
      'INVALID_LIFECYCLE_TRANSITION',
      `Cannot submit workshop with approvalStatus "${workshop.approvalStatus}". Must be DRAFT or REJECTED.`
    );
  }

  return executeWorkshopTransaction(async (session) => {
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

  const workshop = await Workshop.findById(id);
  if (!workshop) {
    throw new AppError(404, 'WORKSHOP_NOT_FOUND', 'Workshop not found.');
  }

  await assertDepartmentScope(auth, workshop.departmentId, workshop.ownershipType);

  if (workshop.approvalStatus !== 'APPROVED') {
    throw new AppError(400, 'WORKSHOP_NOT_APPROVED', 'Only approved workshops can be published.');
  }

  if (workshop.isPublished) {
    throw new AppError(400, 'ALREADY_PUBLISHED', 'Workshop is already published.');
  }

  return executeWorkshopTransaction(async (session) => {
    const updated = await Workshop.findOneAndUpdate(
      { _id: id, approvalStatus: 'APPROVED', isPublished: false },
      { $set: { isPublished: true } },
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

  await assertDepartmentScope(auth, workshop.departmentId, workshop.ownershipType);

  if (workshop.lifecycleStatus === 'CANCELLED') {
    throw new AppError(400, 'ALREADY_CANCELLED', 'Workshop is already cancelled.');
  }

  if (workshop.lifecycleStatus === 'COMPLETED') {
    throw new AppError(400, 'INVALID_LIFECYCLE_STATE', 'Completed workshops cannot be cancelled.');
  }

  return executeWorkshopTransaction(async (session) => {
    // 1. Update workshop lifecycle status
    const updated = await Workshop.findOneAndUpdate(
      { _id: id, lifecycleStatus: { $ne: 'CANCELLED' } },
      { $set: { lifecycleStatus: 'CANCELLED' } },
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
        oldValue: { lifecycleStatus: workshop.lifecycleStatus },
        newValue: { lifecycleStatus: 'CANCELLED', cancelledActiveRegistrationsCount: activeRegistrations.length }
      },
      session
    );

    return updated.toObject();
  });
}

/**
 * Hard deletes a DRAFT or REJECTED workshop.
 * Permitted only if the workshop has never been published and has ZERO registrations of any status.
 * Preserves the audit trail with the workshop business identifier.
 *
 * @param {string} id
 * @param {object} auth
 * @returns {Promise<{ success: boolean, deletedWorkshopId: string }>}
 */
export async function deleteWorkshop(id, auth) {
  if (!auth || !auth.userId) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  }

  const workshop = await Workshop.findById(id);
  if (!workshop) {
    throw new AppError(404, 'WORKSHOP_NOT_FOUND', 'Workshop not found.');
  }

  await assertDepartmentScope(auth, workshop.departmentId, workshop.ownershipType);

  // Must be DRAFT or REJECTED
  if (workshop.approvalStatus !== 'DRAFT' && workshop.approvalStatus !== 'REJECTED') {
    throw new AppError(
      400,
      'CANNOT_DELETE_ACTIVE_WORKSHOP',
      `Cannot delete workshop with approvalStatus "${workshop.approvalStatus}". Only DRAFT or REJECTED workshops can be deleted.`
    );
  }

  // Must NEVER have been published
  if (workshop.isPublished) {
    throw new AppError(400, 'CANNOT_DELETE_PUBLISHED_WORKSHOP', 'Published workshops cannot be deleted. Cancel the workshop instead.');
  }

  return executeWorkshopTransaction(async (session) => {
    // Check if any registrations exist (including cancelled historical ones)
    const totalRegistrations = await WorkshopRegistration.countDocuments({ workshopId: id }).session(session);
    if (totalRegistrations > 0) {
      throw new AppError(
        400,
        'WORKSHOP_HAS_REGISTRATIONS',
        'Workshops with registration history cannot be deleted. Cancel the workshop instead.'
      );
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
