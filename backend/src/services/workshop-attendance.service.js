import mongoose from 'mongoose';
import { Workshop } from '../models/workshop.model.js';
import { WorkshopRegistration } from '../models/workshop_registration.model.js';
import { WorkshopAttendance, ATTENDANCE_STATUSES } from '../models/workshop_attendance.model.js';
import { WorkshopCertificate } from '../models/workshop_certificate.model.js';
import { ROLE_IDS } from '../utils/access-constants.js';
import { AppError } from '../utils/app-error.js';
import { executeWorkshopTransaction, logWorkshopAudit } from './workshop-audit.service.js';

/**
 * Calculates attendance metrics and completion status for a workshop registration.
 *
 * Rules:
 * - Missing records count as absent.
 * - Only PRESENT counts toward the attended count; EXCUSED does NOT count.
 * - If no sessions are marked as required, all workshop sessions are required.
 * - Completion threshold is >= 75.0% of required sessions attended as PRESENT.
 *
 * @param {Array<object>} workshopSessions - Array of session objects from Workshop
 * @param {Array<object>} attendanceRecords - All attendance records for this registration
 * @param {boolean} isWorkshopConcluded - Whether the workshop end date has passed or status is COMPLETED
 * @returns {{ attendancePercentage: number, completionStatus: string, attendedSessions: number, requiredSessions: number }}
 */
export function calculateRegistrationAttendance(workshopSessions, attendanceRecords, isWorkshopConcluded = false) {
  if (!Array.isArray(workshopSessions) || workshopSessions.length === 0) {
    return {
      attendancePercentage: 0,
      completionStatus: 'PENDING',
      attendedSessions: 0,
      requiredSessions: 0
    };
  }

  // 1. Identify required sessions
  const explicitlyRequired = workshopSessions.filter((s) => s.isAttendanceRequired === true);
  const requiredSessionsList = explicitlyRequired.length > 0 ? explicitlyRequired : workshopSessions;
  const requiredCount = requiredSessionsList.length;

  const requiredSessionIdSet = new Set(requiredSessionsList.map((s) => s.sessionId));

  // 2. Count PRESENT attendance for required sessions
  let presentCount = 0;
  for (const record of attendanceRecords) {
    if (requiredSessionIdSet.has(record.sessionId)) {
      if (record.attendanceStatus === 'PRESENT') {
        presentCount++;
      }
      // Note: EXCUSED does NOT increment presentCount
    }
  }

  const rawPercentage = requiredCount > 0 ? (presentCount / requiredCount) * 100 : 0;
  const attendancePercentage = Math.round(rawPercentage * 100) / 100;

  let completionStatus = 'PENDING';
  if (attendancePercentage >= 75) {
    completionStatus = 'COMPLETED';
  } else if (isWorkshopConcluded) {
    completionStatus = 'NOT_COMPLETED';
  }

  return {
    attendancePercentage,
    completionStatus,
    attendedSessions: presentCount,
    requiredSessions: requiredCount
  };
}

/**
 * Submits or corrects attendance for a workshop session.
 *
 * Strict Trainer Identity & Assignment Verification:
 * - Requires explicit WORKSHOP_ATTENDANCE_MANAGE permission.
 * - Authenticated user's internal trainer identity MUST be assigned to the specific session through session.trainerIds.
 * - Zero coordinator bypass: coordinators who are not assigned trainers for this session cannot submit attendance.
 *
 * @param {object} params
 * @param {string} params.workshopId
 * @param {string} params.sessionId
 * @param {Array<{ registrationId: string, studentId: string, attendanceStatus: string, remarks?: string }>} params.attendees
 * @param {string} [params.correctionReason] - Mandatory if modifying existing attendance records
 * @param {object} auth
 * @returns {Promise<{ updatedCount: number, recordedCount: number }>}
 */
export async function submitSessionAttendance({ workshopId, sessionId, attendees, correctionReason }, auth) {
  if (!auth || !auth.userId) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  }

  if (!Array.isArray(attendees) || attendees.length === 0) {
    throw new AppError(400, 'INVALID_INPUT', 'Attendees array cannot be empty.');
  }

  // Load target workshop
  const workshop = await Workshop.findById(workshopId);
  if (!workshop) {
    throw new AppError(404, 'WORKSHOP_NOT_FOUND', 'Workshop not found.');
  }

  if (workshop.lifecycleStatus === 'CANCELLED') {
    throw new AppError(400, 'WORKSHOP_CANCELLED', 'Cannot record attendance for a cancelled workshop.');
  }

  // Locate session within workshop
  const targetSession = (workshop.sessions || []).find((s) => s.sessionId === sessionId);
  if (!targetSession) {
    throw new AppError(404, 'SESSION_NOT_FOUND', `Session "${sessionId}" not found in workshop.`);
  }

  // Strict Trainer Assignment Authorization (Zero Coordinator Bypass)
  // Super Admin possesses permission for administrative overrides; for all others,
  // the authenticated user must be an internal trainer assigned to this specific session.
  if (auth.roleId !== ROLE_IDS.SUPER_ADMIN) {
    const internalTrainerIds = (workshop.trainers || [])
      .filter((t) => t.userId && String(t.userId) === String(auth.userId))
      .map((t) => String(t._id));

    const isAssignedToSession = internalTrainerIds.some((trainerSubId) =>
      Array.isArray(targetSession.trainerIds) && targetSession.trainerIds.includes(trainerSubId)
    );

    if (!isAssignedToSession) {
      throw new AppError(
        403,
        'NOT_ASSIGNED_SESSION_TRAINER',
        'You are not assigned as a trainer for this workshop session.'
      );
    }
  }

  // Reject duplicate students or registrations in payload
  const studentSet = new Set();
  const regSet = new Set();
  for (const item of attendees) {
    if (studentSet.has(String(item.studentId))) {
      throw new AppError(400, 'DUPLICATE_STUDENT_IN_PAYLOAD', `Duplicate studentId "${item.studentId}" in attendance submission.`);
    }
    studentSet.add(String(item.studentId));

    if (regSet.has(String(item.registrationId))) {
      throw new AppError(400, 'DUPLICATE_REGISTRATION_IN_PAYLOAD', `Duplicate registrationId "${item.registrationId}" in attendance submission.`);
    }
    regSet.add(String(item.registrationId));

    if (!ATTENDANCE_STATUSES.includes(item.attendanceStatus)) {
      throw new AppError(400, 'INVALID_INPUT', `Invalid attendanceStatus "${item.attendanceStatus}".`);
    }
  }

  return executeWorkshopTransaction(async (session) => {
    // 1. Check existing attendance records to determine if any record is being corrected
    const registrationIds = attendees.map((a) => a.registrationId);
    const existingRecords = await WorkshopAttendance.find({
      workshopId: workshop._id,
      sessionId,
      registrationId: { $in: registrationIds }
    }).session(session);

    const existingMap = new Map();
    for (const rec of existingRecords) {
      existingMap.set(String(rec.registrationId), rec);
    }

    const hasAnyExisting = existingRecords.length > 0;
    if (hasAnyExisting) {
      // Non-empty correction reason required (>= 5 chars)
      if (!correctionReason || typeof correctionReason !== 'string' || correctionReason.trim().length < 5) {
        throw new AppError(
          400,
          'CORRECTION_REASON_REQUIRED',
          'A correction reason of at least 5 characters is required when modifying existing attendance records.'
        );
      }
    }

    // 2. Validate registrations belong to this workshop
    const registrations = await WorkshopRegistration.find({
      _id: { $in: registrationIds },
      workshopId: workshop._id
    }).session(session);

    if (registrations.length !== attendees.length) {
      throw new AppError(400, 'INVALID_REGISTRATION', 'One or more registrations do not belong to this workshop.');
    }

    const regMap = new Map();
    for (const r of registrations) {
      regMap.set(String(r._id), r);
    }

    let recordedCount = 0;
    let updatedCount = 0;
    const now = new Date();

    for (const attendee of attendees) {
      const regDoc = regMap.get(String(attendee.registrationId));
      if (!regDoc || String(regDoc.studentId) !== String(attendee.studentId)) {
        throw new AppError(400, 'REGISTRATION_STUDENT_MISMATCH', `Student "${attendee.studentId}" does not match registration "${attendee.registrationId}".`);
      }

      const existingRecord = existingMap.get(String(attendee.registrationId));

      if (existingRecord) {
        // Attendance Correction
        const oldStatus = existingRecord.attendanceStatus;
        existingRecord.attendanceStatus = attendee.attendanceStatus;
        existingRecord.remarks = attendee.remarks ? attendee.remarks.trim() : undefined;
        existingRecord.updatedBy = auth.userId;
        await existingRecord.save({ session });
        updatedCount++;

        await logWorkshopAudit(
          {
            workshopId: workshop._id,
            registrationId: regDoc._id,
            attendanceId: existingRecord._id,
            action: 'ATTENDANCE_CORRECTED',
            entityType: 'ATTENDANCE',
            entityId: `${attendee.registrationId}_${sessionId}`,
            changedBy: auth.userId,
            reason: correctionReason.trim(),
            oldValue: { attendanceStatus: oldStatus },
            newValue: { attendanceStatus: attendee.attendanceStatus, remarks: attendee.remarks }
          },
          session
        );
      } else {
        // New Attendance Entry
        const [createdRecord] = await WorkshopAttendance.create(
          [
            {
              workshopId: workshop._id,
              sessionId,
              registrationId: regDoc._id,
              studentId: regDoc.studentId,
              attendanceStatus: attendee.attendanceStatus,
              remarks: attendee.remarks ? attendee.remarks.trim() : undefined,
              markedBy: auth.userId,
              markedAt: now
            }
          ],
          { session }
        );
        recordedCount++;

        await logWorkshopAudit(
          {
            workshopId: workshop._id,
            registrationId: regDoc._id,
            attendanceId: createdRecord._id,
            action: 'ATTENDANCE_RECORDED',
            entityType: 'ATTENDANCE',
            entityId: `${attendee.registrationId}_${sessionId}`,
            changedBy: auth.userId,
            newValue: { attendanceStatus: attendee.attendanceStatus, remarks: attendee.remarks }
          },
          session
        );
      }
    }

    // 3. Recalculate attendance percentage and completion status for all affected registrations
    const isConcluded = (workshop.endAt && now >= workshop.endAt) || workshop.lifecycleStatus === 'COMPLETED';

    for (const attendee of attendees) {
      const allStudentRecords = await WorkshopAttendance.find({
        registrationId: attendee.registrationId
      }).session(session);

      const metrics = calculateRegistrationAttendance(workshop.sessions, allStudentRecords, isConcluded);

      await WorkshopRegistration.updateOne(
        { _id: attendee.registrationId },
        {
          $set: {
            attendancePercentage: metrics.attendancePercentage,
            completionStatus: metrics.completionStatus,
            status: metrics.completionStatus === 'COMPLETED' ? 'COMPLETED' : 'ATTENDED'
          }
        },
        { session }
      );

      // Keep certificate eligibility consistent if a certificate record exists
      const certificate = await WorkshopCertificate.findOne({
        registrationId: attendee.registrationId
      }).session(session);

      if (certificate && certificate.certificateStatus !== 'REVOKED') {
        const newEligibility = metrics.attendancePercentage >= 75 ? 'ELIGIBLE' : 'NOT_ELIGIBLE';
        if (certificate.eligibilityStatus !== newEligibility) {
          certificate.eligibilityStatus = newEligibility;
          await certificate.save({ session });
        }
      }
    }

    return {
      success: true,
      sessionId,
      recordedCount,
      updatedCount,
      totalProcessed: attendees.length
    };
  });
}

/**
 * Retrieves attendance records for a specific workshop session.
 *
 * @param {object} params
 * @param {string} params.workshopId
 * @param {string} params.sessionId
 * @param {number} [params.page=1]
 * @param {number} [params.limit=20]
 * @param {string} [params.status]
 * @param {object} auth
 * @returns {Promise<{ attendance: Array, total: number, page: number, totalPages: number }>}
 */
export async function getSessionAttendance({ workshopId, sessionId, page = 1, limit = 20, status } = {}, auth) {
  if (!auth || !auth.userId) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  }

  const workshop = await Workshop.findById(workshopId).lean();
  if (!workshop) {
    throw new AppError(404, 'WORKSHOP_NOT_FOUND', 'Workshop not found.');
  }

  const sessionExists = (workshop.sessions || []).some((s) => s.sessionId === sessionId);
  if (!sessionExists) {
    throw new AppError(404, 'SESSION_NOT_FOUND', `Session "${sessionId}" not found.`);
  }

  const query = { workshopId: workshop._id, sessionId };
  if (status) {
    query.attendanceStatus = status;
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const [records, total] = await Promise.all([
    WorkshopAttendance.find(query)
      .sort({ markedAt: -1, _id: -1 })
      .skip(skip)
      .limit(limitNum)
      .populate('studentId', 'firstName lastName universityId email branch department semester')
      .populate('markedBy', 'firstName lastName email employeeId')
      .lean(),
    WorkshopAttendance.countDocuments(query)
  ]);

  return {
    attendance: records,
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum) || 1
  };
}
