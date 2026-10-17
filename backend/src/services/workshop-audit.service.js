import mongoose from 'mongoose';
import { WorkshopAuditLog, AUDIT_ENTITY_TYPES } from '../models/workshop_audit_log.model.js';
import { Workshop } from '../models/workshop.model.js';
import { User } from '../models/user.model.js';
import { ROLE_IDS, PERMISSION_IDS } from '../utils/access-constants.js';
import { AppError } from '../utils/app-error.js';
import { getCoordinatorDepartment } from '../utils/department-scope.js';

/**
 * Checks whether an error signifies that MongoDB does not support multi-document transactions
 * (e.g., standalone deployment or uninitialized replica set).
 *
 * @param {Error|any} err
 * @returns {boolean}
 */
export function isTransactionUnsupportedError(err) {
  if (!err) return false;
  if (err.code === 20 || err.codeName === 'IllegalOperation') return true;
  const msg = typeof err.message === 'string' ? err.message : '';
  return (
    msg.includes('Transaction numbers are only allowed on a replica set member or mongos') ||
    msg.includes('This MongoDB deployment does not support retryable writes') ||
    msg.includes('Transactions are not supported by this deployment') ||
    (msg.includes('replica set') && msg.includes('transaction'))
  );
}

/**
 * Executes an operation inside an atomic MongoDB multi-document transaction with safe,
 * bounded retry handling for transient write conflicts (e.g. WiredTiger WriteConflict).
 *
 * Fails closed with HTTP 503 and TRANSACTION_SUPPORT_REQUIRED when standalone MongoDB
 * or unsupported transaction infrastructure is encountered. Never falls back to standalone writes.
 *
 * @param {Function} workFn - Callback taking (session) and returning a Promise
 * @param {object} [options={}]
 * @param {number} [options.maxRetries=3]
 * @returns {Promise<any>} Result of workFn
 */
export async function executeWorkshopTransaction(workFn, { maxRetries = 10 } = {}) {
  let session;
  try {
    session = await mongoose.startSession();
  } catch (err) {
    if (isTransactionUnsupportedError(err)) {
      throw new AppError(
        503,
        'TRANSACTION_SUPPORT_REQUIRED',
        'MongoDB multi-document transaction support is required for this operation.'
      );
    }
    throw err;
  }

  try {
    let attempt = 0;
    while (attempt < maxRetries) {
      attempt++;
      try {
        session.startTransaction();
      } catch (startErr) {
        if (isTransactionUnsupportedError(startErr)) {
          throw new AppError(
            503,
            'TRANSACTION_SUPPORT_REQUIRED',
            'MongoDB multi-document transaction support is required for this operation.'
          );
        }
        throw startErr;
      }

      try {
        const result = await workFn(session);
        await session.commitTransaction();
        return result;
      } catch (workErr) {
        if (session.inTransaction()) {
          try {
            await session.abortTransaction();
          } catch (_) {}
        }

        if (isTransactionUnsupportedError(workErr)) {
          throw new AppError(
            503,
            'TRANSACTION_SUPPORT_REQUIRED',
            'MongoDB multi-document transaction support is required for this operation.'
          );
        }

        const isTransient =
          workErr.hasErrorLabel?.('TransientTransactionError') ||
          workErr.errorLabels?.includes('TransientTransactionError') ||
          workErr.code === 112 ||
          (typeof workErr.message === 'string' && workErr.message.includes('WriteConflict'));

        if (isTransient && attempt < maxRetries) {
          // Progressive randomized jittered sleep (20ms - 60ms * attempt)
          const delay = 20 + Math.floor(Math.random() * 40) + attempt * 10;
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        throw workErr;
      }
    }
  } finally {
    await session.endSession();
  }
}

/**
 * Records an audit log event into the WorkshopAuditLog collection.
 * Strictly requires the caller's active Mongoose ClientSession.
 * Never commits an audit log independently outside the caller's transaction.
 *
 * @param {object} auditData
 * @param {import('mongoose').Types.ObjectId|string} [auditData.workshopId]
 * @param {import('mongoose').Types.ObjectId|string} [auditData.registrationId]
 * @param {import('mongoose').Types.ObjectId|string} [auditData.attendanceId]
 * @param {import('mongoose').Types.ObjectId|string} [auditData.certificateId]
 * @param {string} auditData.action - Approved action string
 * @param {string} auditData.entityType - One of AUDIT_ENTITY_TYPES
 * @param {string} auditData.entityId - Identifier string of the target entity
 * @param {import('mongoose').Types.ObjectId|string} auditData.changedBy - User ID of actor
 * @param {Date} [auditData.changedAt]
 * @param {any} [auditData.oldValue]
 * @param {any} [auditData.newValue]
 * @param {string} [auditData.reason]
 * @param {import('mongoose').ClientSession} session - Active transaction session
 * @returns {Promise<import('../models/workshop_audit_log.model.js').WorkshopAuditLog>}
 */
export async function logWorkshopAudit(auditData, session) {
  if (!session || typeof session.inTransaction !== 'function' || !session.inTransaction()) {
    throw new AppError(
      500,
      'TRANSACTION_SESSION_REQUIRED',
      'An active MongoDB transaction session is required for workshop audit logging.'
    );
  }

  if (!auditData.action || typeof auditData.action !== 'string') {
    throw new AppError(400, 'INVALID_INPUT', 'Audit action is required.');
  }

  if (!AUDIT_ENTITY_TYPES.includes(auditData.entityType)) {
    throw new AppError(
      400,
      'INVALID_INPUT',
      `Audit entityType must be one of: ${AUDIT_ENTITY_TYPES.join(', ')}`
    );
  }

  if (!auditData.entityId || typeof auditData.entityId !== 'string') {
    throw new AppError(400, 'INVALID_INPUT', 'Audit entityId is required.');
  }

  if (!auditData.changedBy) {
    throw new AppError(400, 'INVALID_INPUT', 'Audit changedBy actor is required.');
  }

  const [logDoc] = await WorkshopAuditLog.create(
    [
      {
        workshopId: auditData.workshopId || undefined,
        registrationId: auditData.registrationId || undefined,
        attendanceId: auditData.attendanceId || undefined,
        certificateId: auditData.certificateId || undefined,
        action: auditData.action.trim(),
        entityType: auditData.entityType,
        entityId: auditData.entityId.trim(),
        changedBy: auditData.changedBy,
        changedAt: auditData.changedAt || new Date(),
        oldValue: auditData.oldValue,
        newValue: auditData.newValue,
        reason: auditData.reason ? auditData.reason.trim() : undefined
      }
    ],
    { session }
  );

  return logDoc;
}

/**
 * Retrieves the paginated audit trail for a workshop.
 * Strictly verifies WORKSHOP_AUDIT_READ permission and department scope.
 *
 * @param {object} params
 * @param {string} params.workshopId - Workshop ID (ObjectId or business ID)
 * @param {number} [params.page=1]
 * @param {number} [params.limit=20]
 * @param {string} [params.action]
 * @param {string} [params.entityType]
 * @param {object} auth - Authenticated user context
 * @returns {Promise<{ auditLogs: Array, total: number, page: number, totalPages: number }>}
 */
export async function getWorkshopAuditTrail({ workshopId, page = 1, limit = 20, action, entityType } = {}, auth) {
  if (!auth || !auth.userId) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  }

  // 1. Resolve Workshop to verify existence and check department scope
  const isObjectId = mongoose.Types.ObjectId.isValid(workshopId);
  const workshop = await Workshop.findOne(
    isObjectId ? { $or: [{ _id: workshopId }, { workshopId }] } : { workshopId }
  ).lean();

  if (!workshop) {
    // If workshop document does not exist, check if there are historical logs (e.g. deleted workshop)
    // Only Placement Head or Super Admin can view logs of deleted workshops
    if (auth.roleId !== ROLE_IDS.PLACEMENT_HEAD && auth.roleId !== ROLE_IDS.SUPER_ADMIN) {
      throw new AppError(404, 'WORKSHOP_NOT_FOUND', 'Workshop not found.');
    }
  } else {
    // Check Coordinator department scope
    const coordDept = await getCoordinatorDepartment(auth);
    if (coordDept) {
      if (workshop.ownershipType === 'DEPARTMENT') {
        if (!workshop.departmentId || String(workshop.departmentId) !== String(coordDept.departmentId)) {
          throw new AppError(403, 'FORBIDDEN', 'You can only view audit logs for workshops in your department.');
        }
      } else {
        throw new AppError(403, 'FORBIDDEN', 'Coordinators cannot view central placement cell workshop audit logs.');
      }
    }
  }

  const query = {};
  if (workshop) {
    query.$or = [{ workshopId: workshop._id }, { entityId: workshop.workshopId }];
  } else {
    query.entityId = workshopId;
  }

  if (action) {
    query.action = action.trim();
  }
  if (entityType) {
    query.entityType = entityType;
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const [logs, total] = await Promise.all([
    WorkshopAuditLog.find(query)
      .sort({ changedAt: -1, _id: -1 })
      .skip(skip)
      .limit(limitNum)
      .populate('changedBy', 'firstName lastName email roleId employeeId universityId')
      .lean(),
    WorkshopAuditLog.countDocuments(query)
  ]);

  return {
    auditLogs: logs,
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum) || 1
  };
}
