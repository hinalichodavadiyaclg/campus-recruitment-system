import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { Workshop } from '../models/workshop.model.js';
import { WorkshopRegistration } from '../models/workshop_registration.model.js';
import { WorkshopCertificate } from '../models/workshop_certificate.model.js';
import { Student } from '../models/student.model.js';
import { ROLE_IDS } from '../utils/access-constants.js';
import { AppError } from '../utils/app-error.js';
import { generateCertificateNumber } from '../utils/sequence-generator.js';
import { executeWorkshopTransaction, logWorkshopAudit } from './workshop-audit.service.js';

/**
 * Issues completion certificates for eligible candidates of a concluded workshop.
 *
 * Rules:
 * - Allowed only for Placement Head and Super Admin.
 * - Workshop must have concluded (now >= endAt or lifecycleStatus === 'COMPLETED').
 * - Candidates must have registration completionStatus === 'COMPLETED' (attendance >= 75%).
 * - Generates CERT-YYYY-XXXX using IST year derived from issuedAt.
 * - Generates cryptographically secure 32-character random verification code.
 * - Safe duplicate handling: idempotent skip if already issued.
 * - Entire batch sequence allocation, certificate creation, and audit logging runs in one transaction.
 *
 * @param {object} params
 * @param {string} params.workshopId
 * @param {Array<string>} [params.registrationIds] - Optional target registration subset
 * @param {object} auth
 * @returns {Promise<{ issuedCount: number, certificates: Array }>}
 */
export async function issueCertificates({ workshopId, registrationIds }, auth) {
  if (!auth || !auth.userId) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  }

  // Only Placement Head and Super Admin can issue certificates
  if (auth.roleId !== ROLE_IDS.SUPER_ADMIN && auth.roleId !== ROLE_IDS.PLACEMENT_HEAD) {
    throw new AppError(403, 'FORBIDDEN', 'Only Placement Head or Super Admin can issue certificates.');
  }

  const workshop = await Workshop.findById(workshopId).lean();
  if (!workshop) {
    throw new AppError(404, 'WORKSHOP_NOT_FOUND', 'Workshop not found.');
  }

  // Concluded workshop guard: certificates cannot be issued before the workshop concludes
  const now = new Date();
  const isConcluded = (workshop.endAt && now >= workshop.endAt) || workshop.lifecycleStatus === 'COMPLETED';
  if (!isConcluded) {
    throw new AppError(
      400,
      'WORKSHOP_NOT_CONCLUDED',
      'Certificates cannot be issued before the workshop has concluded.'
    );
  }

  return executeWorkshopTransaction(async (session) => {
    // 1. Resolve candidate registrations
    const regQuery = {
      workshopId: workshop._id,
      status: { $in: ['COMPLETED', 'ATTENDED', 'REGISTERED'] }
    };

    if (Array.isArray(registrationIds) && registrationIds.length > 0) {
      regQuery._id = { $in: registrationIds };
    } else {
      regQuery.completionStatus = 'COMPLETED';
      regQuery.attendancePercentage = { $gte: 75 };
    }

    const registrations = await WorkshopRegistration.find(regQuery).session(session);

    if (Array.isArray(registrationIds) && registrationIds.length > 0) {
      if (registrations.length !== registrationIds.length) {
        throw new AppError(400, 'INVALID_REGISTRATION', 'One or more requested registrations not found for this workshop.');
      }
    }

    const issuedCertificates = [];

    for (const reg of registrations) {
      // Validate completion eligibility
      if (reg.completionStatus !== 'COMPLETED' || reg.attendancePercentage < 75) {
        if (Array.isArray(registrationIds)) {
          throw new AppError(
            400,
            'INELIGIBLE_FOR_CERTIFICATE',
            `Registration "${reg.registrationId}" is not eligible (attendance: ${reg.attendancePercentage}%, status: ${reg.completionStatus}).`
          );
        }
        continue;
      }

      // Check if certificate already exists
      let existingCert = await WorkshopCertificate.findOne({
        registrationId: reg._id
      }).session(session);

      if (existingCert && existingCert.certificateStatus === 'ISSUED') {
        // Idempotent: already issued
        issuedCertificates.push(existingCert.toObject());
        continue;
      }

      const issuedAt = new Date();
      // Generate sequence number CERT-YYYY-XXXX with session
      const certificateNumber = await generateCertificateNumber(issuedAt, { session });

      // Generate cryptographically secure verification code
      const verificationCode = crypto.randomBytes(16).toString('hex').toUpperCase();

      if (!existingCert) {
        const [newCert] = await WorkshopCertificate.create(
          [
            {
              workshopId: workshop._id,
              registrationId: reg._id,
              studentId: reg.studentId,
              certificateNumber,
              verificationCode,
              eligibilityStatus: 'ELIGIBLE',
              certificateStatus: 'ISSUED',
              approvedBy: auth.userId,
              approvedAt: issuedAt,
              issuedAt
            }
          ],
          { session }
        );
        existingCert = newCert;
      } else {
        existingCert.certificateNumber = certificateNumber;
        existingCert.verificationCode = verificationCode;
        existingCert.eligibilityStatus = 'ELIGIBLE';
        existingCert.certificateStatus = 'ISSUED';
        existingCert.approvedBy = auth.userId;
        existingCert.approvedAt = issuedAt;
        existingCert.issuedAt = issuedAt;
        await existingCert.save({ session });
      }

      await logWorkshopAudit(
        {
          workshopId: workshop._id,
          registrationId: reg._id,
          certificateId: existingCert._id,
          action: 'CERTIFICATE_ISSUED',
          entityType: 'CERTIFICATE',
          entityId: existingCert.certificateNumber,
          changedBy: auth.userId,
          newValue: {
            certificateNumber: existingCert.certificateNumber,
            studentId: reg.studentId,
            issuedAt
          }
        },
        session
      );

      issuedCertificates.push(existingCert.toObject());
    }

    return {
      success: true,
      issuedCount: issuedCertificates.length,
      certificates: issuedCertificates
    };
  });
}

/**
 * Revokes an issued workshop certificate with a mandatory reason.
 *
 * @param {object} params
 * @param {string} params.certificateId
 * @param {string} params.reason
 * @param {object} auth
 * @returns {Promise<object>}
 */
export async function revokeCertificate({ certificateId, reason }, auth) {
  if (!auth || !auth.userId) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  }

  if (auth.roleId !== ROLE_IDS.SUPER_ADMIN && auth.roleId !== ROLE_IDS.PLACEMENT_HEAD) {
    throw new AppError(403, 'FORBIDDEN', 'Only Placement Head or Super Admin can revoke certificates.');
  }

  if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
    throw new AppError(400, 'INVALID_INPUT', 'Revocation reason must be at least 5 characters.');
  }

  return executeWorkshopTransaction(async (session) => {
    const cert = await WorkshopCertificate.findById(certificateId).session(session);
    if (!cert) {
      throw new AppError(404, 'CERTIFICATE_NOT_FOUND', 'Certificate not found.');
    }

    if (cert.certificateStatus === 'REVOKED') {
      throw new AppError(400, 'ALREADY_REVOKED', 'Certificate is already revoked.');
    }

    const now = new Date();
    const oldStatus = cert.certificateStatus;

    cert.certificateStatus = 'REVOKED';
    cert.revokedAt = now;
    cert.revokedBy = auth.userId;
    cert.revocationReason = reason.trim();
    await cert.save({ session });

    await logWorkshopAudit(
      {
        workshopId: cert.workshopId,
        registrationId: cert.registrationId,
        certificateId: cert._id,
        action: 'CERTIFICATE_REVOKED',
        entityType: 'CERTIFICATE',
        entityId: cert.certificateNumber,
        changedBy: auth.userId,
        reason: reason.trim(),
        oldValue: { certificateStatus: oldStatus },
        newValue: { certificateStatus: 'REVOKED', revokedAt: now }
      },
      session
    );

    return cert.toObject();
  });
}

/**
 * Public certificate verification.
 * Applies data minimization: does NOT expose private student identifiers,
 * contact details, emails, internal ObjectIds, or authentication information.
 *
 * @param {string} verificationCode
 * @returns {Promise<object>}
 */
export async function verifyCertificatePublic(verificationCode) {
  if (!verificationCode || typeof verificationCode !== 'string') {
    throw new AppError(400, 'INVALID_INPUT', 'Verification code is required.');
  }

  const cert = await WorkshopCertificate.findOne({
    verificationCode: verificationCode.trim().toUpperCase()
  })
    .populate('workshopId', 'workshopId title category mode startAt endAt')
    .populate('studentId', 'firstName lastName')
    .lean();

  if (!cert) {
    throw new AppError(404, 'CERTIFICATE_NOT_FOUND', 'Invalid verification code or certificate does not exist.');
  }

  const isIssued = cert.certificateStatus === 'ISSUED';
  const student = cert.studentId || {};
  const workshop = cert.workshopId || {};

  // Formats name as "FirstName L." to preserve candidate privacy
  const studentInitials = student.lastName ? `${student.lastName.charAt(0)}.` : '';
  const maskedStudentName = student.firstName ? `${student.firstName} ${studentInitials}`.trim() : 'Verified Candidate';

  return {
    isValid: isIssued,
    status: cert.certificateStatus,
    certificateNumber: cert.certificateNumber,
    issuedAt: cert.issuedAt,
    revokedAt: cert.certificateStatus === 'REVOKED' ? cert.revokedAt : undefined,
    revocationReason: cert.certificateStatus === 'REVOKED' ? cert.revocationReason : undefined,
    studentName: maskedStudentName,
    workshop: {
      workshopId: workshop.workshopId,
      title: workshop.title,
      category: workshop.category,
      mode: workshop.mode,
      startAt: workshop.startAt,
      endAt: workshop.endAt
    }
  };
}

/**
 * Retrieves the authenticated student's issued workshop certificates.
 *
 * @param {object} auth
 * @returns {Promise<Array>}
 */
export async function getMyCertificates(auth) {
  if (!auth || !auth.userId) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  }

  const student = await Student.findOne({ userId: auth.userId }).lean();
  if (!student) {
    throw new AppError(404, 'STUDENT_PROFILE_NOT_FOUND', 'No student profile linked to this user account.');
  }

  const certificates = await WorkshopCertificate.find({
    studentId: student._id,
    certificateStatus: 'ISSUED'
  })
    .sort({ issuedAt: -1 })
    .populate('workshopId', 'workshopId title category mode startAt endAt')
    .lean();

  return certificates;
}
