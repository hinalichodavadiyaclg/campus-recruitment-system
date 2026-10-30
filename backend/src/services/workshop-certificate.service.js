import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { Workshop } from '../models/workshop.model.js';
import { WorkshopRegistration } from '../models/workshop_registration.model.js';
import { WorkshopCertificate } from '../models/workshop_certificate.model.js';
import { WorkshopCertificateTemplate } from '../models/workshop_certificate_template.model.js';
import { Student } from '../models/student.model.js';
import { ROLE_IDS } from '../utils/access-constants.js';
import { AppError } from '../utils/app-error.js';
import { generateCertificateNumber } from '../utils/sequence-generator.js';
import { executeWorkshopTransaction, logWorkshopAudit } from './workshop-audit.service.js';
import { generatePersonalizedCertificatePdf } from './pdf-generator.service.js';
import { isCompanyUser, isCompanyOwnWorkshop } from '../utils/company-workshop-scope.js';
import { getCoordinatorDepartment } from '../utils/department-scope.js';
import {
  dispatchCertificateIssuedNotification,
  dispatchCertificateRevokedNotification
} from './workshop-notification.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDirectory = path.join(__dirname, '..', '..', 'public');
const certificatesDirectory = path.join(publicDirectory, 'uploads', 'certificates');

/**
 * Checks if the caller has authority to issue certificates for this workshop.
 */
async function assertCanIssueCertificates(auth, workshop) {
  if (!auth || !auth.userId) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  }

  if (auth.isInternalSystem) {
    return true;
  }

  if (auth.roleId === ROLE_IDS.SUPER_ADMIN || auth.roleId === ROLE_IDS.PLACEMENT_HEAD) {
    return true;
  }

  if (isCompanyUser(auth)) {
    const isOwn = await isCompanyOwnWorkshop(workshop, auth);
    if (!isOwn) {
      throw new AppError(403, 'FORBIDDEN', 'Company can only manage certificates for its own workshops.');
    }
    return true;
  }

  if (auth.roleId === ROLE_IDS.PLACEMENT_COORDINATOR) {
    const coordDept = await getCoordinatorDepartment(auth);
    const wsDeptId = workshop.departmentId?._id || workshop.departmentId;
    const isMatch = wsDeptId && coordDept && String(wsDeptId) === String(coordDept.departmentId);
    if (!isMatch && workshop.ownershipType !== 'CENTRAL_PLACEMENT_CELL') {
      throw new AppError(403, 'FORBIDDEN', 'Access denied to manage certificates outside your department.');
    }
    return true;
  }

  throw new AppError(403, 'FORBIDDEN', 'You do not have permission to issue certificates for this workshop.');
}

/**
 * Issues completion certificates for eligible candidates of a concluded workshop.
 *
 * Rules:
 * - Allowed for Placement Head, Super Admin, and workshop managers within their scope.
 * - Workshop must have concluded (now >= endAt or lifecycleStatus === 'COMPLETED').
 * - Workshop must NOT be cancelled.
 * - Candidates must have registration completionStatus === 'COMPLETED' (attendance >= 75%).
 * - Preserves immutable recipientName, templateVersion, and templateSnapshot.
 * - Generates CERT-YYYY-XXXX using IST year derived from issuedAt.
 * - Generates cryptographically secure 32-character random verification code.
 * - Safe duplicate handling: idempotent skip if already issued.
 * - Partial failure isolation: failures do not roll back successfully issued certificates.
 *
 * @param {object} params
 * @param {string} params.workshopId
 * @param {Array<string>} [params.registrationIds] - Optional target registration subset
 * @param {object} auth
 * @returns {Promise<{ success: boolean, issuedCount: number, skippedCount: number, failedCount: number, certificates: Array, failures: Array }>}
 */
export async function issueCertificates({ workshopId, registrationIds }, auth) {
  if (!auth || !auth.userId) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  }

  const workshop = await Workshop.findById(workshopId).lean();
  if (!workshop) {
    throw new AppError(404, 'WORKSHOP_NOT_FOUND', 'Workshop not found.');
  }

  if (workshop.lifecycleStatus === 'CANCELLED') {
    throw new AppError(400, 'WORKSHOP_CANCELLED', 'Cannot issue certificates for a cancelled workshop.');
  }

  await assertCanIssueCertificates(auth, workshop);

  const now = new Date();
  const isConcluded = (workshop.endAt && now >= workshop.endAt) || workshop.lifecycleStatus === 'COMPLETED';
  if (!isConcluded) {
    throw new AppError(
      400,
      'WORKSHOP_NOT_CONCLUDED',
      'Certificates cannot be issued before the workshop has concluded.'
    );
  }

  // 1. Resolve template if configured
  let template = null;
  if (workshop.certificateTemplateId) {
    template = await WorkshopCertificateTemplate.findById(workshop.certificateTemplateId).lean();
    if (template && workshop.companyId) {
      const wsCompId = String(workshop.companyId?._id || workshop.companyId);
      const tmplCompId = String(template.companyId?._id || template.companyId);
      if (wsCompId !== tmplCompId && template.templateScope === 'COMPANY') {
        throw new AppError(403, 'FORBIDDEN', 'Certificate template does not belong to the company hosting this workshop.');
      }
    }
  } else if (workshop.companyId) {
    template = await WorkshopCertificateTemplate.findOne({
      companyId: workshop.companyId?._id || workshop.companyId,
      isDefault: true,
      status: 'APPROVED'
    }).lean();
  }

  // 2. Query candidate registrations
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

  const registrations = await WorkshopRegistration.find(regQuery);

  if (Array.isArray(registrationIds) && registrationIds.length > 0) {
    if (registrations.length !== registrationIds.length) {
      throw new AppError(400, 'INVALID_REGISTRATION', 'One or more requested registrations not found for this workshop.');
    }
  }

  const issuedCertificates = [];
  const skippedCertificates = [];
  const failedCertificates = [];

  // Snapshot template properties for immutability
  const templateSnapshot = template
    ? {
        name: template.name,
        backgroundUrl: template.backgroundUrl,
        orientation: template.orientation,
        signatoryName: template.signatoryName,
        signatoryTitle: template.signatoryTitle,
        version: template.version || 1
      }
    : null;

  for (const reg of registrations) {
    // Attendance gate check
    if (reg.completionStatus !== 'COMPLETED' || (reg.attendancePercentage || 0) < 75) {
      if (Array.isArray(registrationIds)) {
        throw new AppError(
          400,
          'INELIGIBLE_FOR_CERTIFICATE',
          `Registration "${reg.registrationId}" is not eligible (attendance: ${reg.attendancePercentage}%, status: ${reg.completionStatus}).`
        );
      }
      continue;
    }

    try {
      // 3. Check existing certificate
      let existingCert = await WorkshopCertificate.findOne({
        $or: [
          { registrationId: reg._id },
          { workshopId: workshop._id, studentId: reg.studentId }
        ]
      });

      if (existingCert && existingCert.certificateStatus === 'ISSUED') {
        // Idempotent: certificate already exists and issued
        skippedCertificates.push(existingCert.toObject());
        issuedCertificates.push(existingCert.toObject());
        continue;
      }

      const issuedAt = new Date();
      let certificateNumber = existingCert?.certificateNumber;
      if (!certificateNumber) {
        certificateNumber = await generateCertificateNumber(issuedAt);
      }

      let verificationCode = existingCert?.verificationCode;
      if (!verificationCode) {
        verificationCode = crypto.randomBytes(16).toString('hex').toUpperCase();
      }

      const student = await Student.findById(reg.studentId).lean();
      const firstName = student?.firstName || '';
      const lastName = student?.lastName || '';
      const recipientName = `${firstName} ${lastName}`.trim() || 'Distinguished Participant';

      // 4. Generate Authoritative PDF
      const pdfResult = await generatePersonalizedCertificatePdf({
        certificate: { certificateNumber, verificationCode, issuedAt, recipientName },
        student,
        workshop,
        template
      });

      if (!existingCert) {
        existingCert = await WorkshopCertificate.create({
          workshopId: workshop._id,
          registrationId: reg._id,
          studentId: reg.studentId,
          recipientName,
          certificateNumber,
          verificationCode,
          eligibilityStatus: 'ELIGIBLE',
          certificateStatus: 'ISSUED',
          attendancePercentage: reg.attendancePercentage || 100,
          templateSnapshot,
          certificateTemplateId: template?._id || null,
          templateVersion: template?.version || 1,
          fileUrl: pdfResult.fileUrl,
          qrCodeUrl: pdfResult.qrCodeDataUrl,
          idempotencyKey: `${workshop._id}_${reg.studentId}`,
          approvedBy: auth.userId,
          approvedAt: issuedAt,
          issuedAt
        });
      } else {
        existingCert.certificateNumber = certificateNumber;
        existingCert.verificationCode = verificationCode;
        existingCert.recipientName = recipientName;
        existingCert.eligibilityStatus = 'ELIGIBLE';
        existingCert.certificateStatus = 'ISSUED';
        existingCert.attendancePercentage = reg.attendancePercentage || 100;
        existingCert.templateSnapshot = templateSnapshot;
        existingCert.certificateTemplateId = template?._id || null;
        existingCert.templateVersion = template?.version || 1;
        existingCert.fileUrl = pdfResult.fileUrl;
        existingCert.qrCodeUrl = pdfResult.qrCodeDataUrl;
        existingCert.approvedBy = auth.userId;
        existingCert.approvedAt = issuedAt;
        existingCert.issuedAt = issuedAt;
        await existingCert.save();
      }

      // 5. Emit non-blocking notification and audit log
      dispatchCertificateIssuedNotification({
        certificate: existingCert,
        workshop,
        student
      }).catch((err) => console.error('Notification dispatch error:', err.message));

      try {
        await executeWorkshopTransaction(async (session) => {
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
                recipientName,
                issuedAt,
                fileUrl: existingCert.fileUrl
              }
            },
            session
          );
        });
      } catch (auditErr) {
        console.warn('Certificate audit log failed:', auditErr.message);
      }

      issuedCertificates.push(existingCert.toObject());
    } catch (studentErr) {
      console.error(`Failed to issue certificate for student ${reg.studentId}:`, studentErr.message);
      failedCertificates.push({
        registrationId: reg._id,
        studentId: reg.studentId,
        error: studentErr.message
      });
    }
  }

  return {
    success: failedCertificates.length === 0,
    totalEligible: registrations.length,
    issuedCount: issuedCertificates.length,
    skippedCount: skippedCertificates.length,
    failedCount: failedCertificates.length,
    certificates: issuedCertificates,
    failures: failedCertificates
  };
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

    // Notify recipient student about revocation
    const student = await Student.findById(cert.studentId).session(session).lean();
    const workshop = await Workshop.findById(cert.workshopId).session(session).lean();
    dispatchCertificateRevokedNotification({
      certificate: cert,
      workshop,
      student,
      reason: reason.trim()
    }).catch((err) => console.error('Revocation notification error:', err.message));

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

  // Preserve candidate privacy
  const studentInitials = student.lastName ? `${student.lastName.charAt(0)}.` : '';
  const maskedStudentName = cert.recipientName
    ? cert.recipientName.split(' ')[0] + (studentInitials ? ` ${studentInitials}` : '')
    : (student.firstName ? `${student.firstName} ${studentInitials}`.trim() : 'Verified Candidate');

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
    certificateStatus: { $in: ['ISSUED', 'REVOKED'] }
  })
    .sort({ issuedAt: -1 })
    .populate('workshopId', 'workshopId title category mode startAt endAt')
    .lean();

  return certificates;
}

/**
 * Retrieves all certificates for a specific workshop.
 * Accessible to Super Admin, Placement Head, Placement Coordinator, or the Workshop Owner Company.
 *
 * @param {string} workshopId
 * @param {object} auth
 * @returns {Promise<Array>}
 */
export async function getWorkshopCertificates(workshopId, auth) {
  if (!auth || !auth.userId) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  }

  const isStudent = auth.roleId === ROLE_IDS.STUDENT || auth.userType === 'STUDENT';
  if (isStudent) {
    throw new AppError(403, 'FORBIDDEN', 'Students cannot view the workshop certificates roster.');
  }

  const workshop = await Workshop.findById(workshopId).lean();
  if (!workshop) {
    throw new AppError(404, 'WORKSHOP_NOT_FOUND', 'Workshop not found.');
  }

  const isCompany = isCompanyUser(auth);
  if (isCompany) {
    const isOwn = await isCompanyOwnWorkshop(workshop, auth);
    if (!isOwn) {
      throw new AppError(403, 'FORBIDDEN', 'Access denied to certificates for this workshop.');
    }
  } else if (auth.roleId === ROLE_IDS.PLACEMENT_COORDINATOR) {
    const coordDept = await getCoordinatorDepartment(auth);
    if (!coordDept) {
      throw new AppError(403, 'FORBIDDEN', 'No department assigned to coordinator.');
    }
    const wsDeptId = workshop.departmentId?._id || workshop.departmentId;
    const isMatch = wsDeptId && String(wsDeptId) === String(coordDept.departmentId);
    const isTargetMatch = Array.isArray(workshop.targetAudience?.departmentRules) &&
      workshop.targetAudience.departmentRules.some((r) => String(r.departmentId?._id || r.departmentId) === String(coordDept.departmentId));
    if (!isMatch && !isTargetMatch && workshop.ownershipType !== 'CENTRAL_PLACEMENT_CELL') {
      throw new AppError(403, 'FORBIDDEN', 'Access denied to certificates for workshops outside your department.');
    }
  }

  const certificates = await WorkshopCertificate.find({ workshopId: workshop._id })
    .sort({ certificateNumber: 1 })
    .populate('studentId', 'firstName lastName universityId email')
    .populate('certificateTemplateId', 'name')
    .lean();

  return certificates;
}

/**
 * Resolves the authenticated download path for a certificate PDF.
 * Authorized for:
 * - The recipient student (studentId.userId === auth.userId)
 * - Super Admin / Placement Head / Placement Coordinator (in department)
 * - Company that owns the workshop
 *
 * @param {string} certificateId
 * @param {object} auth
 * @returns {Promise<{ absolutePath: string, fileName: string, certificate: object }>}
 */
export async function getCertificateDownloadPath(certificateId, auth) {
  if (!auth || !auth.userId) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  }

  const certificate = await WorkshopCertificate.findById(certificateId)
    .populate('workshopId')
    .populate('studentId')
    .populate('certificateTemplateId')
    .lean();

  if (!certificate) {
    throw new AppError(404, 'CERTIFICATE_NOT_FOUND', 'Certificate not found.');
  }

  if (certificate.certificateStatus === 'REVOKED') {
    throw new AppError(400, 'CERTIFICATE_REVOKED', `This certificate has been revoked: ${certificate.revocationReason || 'Revoked'}`);
  }

  if (certificate.certificateStatus !== 'ISSUED') {
    throw new AppError(400, 'CERTIFICATE_NOT_READY', 'This certificate is not yet issued or available for download.');
  }

  // Authorization Checks
  const isStudent = auth.roleId === ROLE_IDS.STUDENT || auth.userType === 'STUDENT';
  if (isStudent) {
    const student = await Student.findOne({ userId: auth.userId }).lean();
    if (!student || String(student._id) !== String(certificate.studentId?._id || certificate.studentId)) {
      throw new AppError(403, 'FORBIDDEN', 'You can only download your own certificates.');
    }
  } else if (isCompanyUser(auth)) {
    const isOwn = await isCompanyOwnWorkshop(certificate.workshopId, auth);
    if (!isOwn) {
      throw new AppError(403, 'FORBIDDEN', 'Access denied to this company certificate.');
    }
  } else if (auth.roleId === ROLE_IDS.PLACEMENT_COORDINATOR) {
    const coordDept = await getCoordinatorDepartment(auth);
    const wsDeptId = certificate.workshopId?.departmentId?._id || certificate.workshopId?.departmentId;
    if (wsDeptId && coordDept && String(wsDeptId) !== String(coordDept.departmentId)) {
      throw new AppError(403, 'FORBIDDEN', 'Access denied to certificate outside your department.');
    }
  }

  const fileName = `${certificate.certificateNumber}.pdf`;
  let absolutePath = path.join(certificatesDirectory, fileName);

  // If the file does not exist on disk, is empty, or contains obsolete third-party branding, regenerate it dynamically
  let needsRegeneration = !fs.existsSync(absolutePath) || fs.statSync(absolutePath).size <= 100;
  if (!needsRegeneration) {
    try {
      const fileBytes = fs.readFileSync(absolutePath);
      // Ensure no legacy third-party institutional branding exists in cached PDF
      if (fileBytes.includes(Buffer.from('56454552204e41524d4144', 'hex'))) {
        needsRegeneration = true;
      }
    } catch (_) {}
  }

  if (needsRegeneration) {
    const pdfRes = await generatePersonalizedCertificatePdf({
      certificate,
      student: certificate.studentId,
      workshop: certificate.workshopId,
      template: certificate.templateSnapshot || certificate.certificateTemplateId
    });
    absolutePath = pdfRes.absolutePath;
    await WorkshopCertificate.updateOne(
      { _id: certificate._id },
      { $set: { fileUrl: pdfRes.fileUrl, qrCodeUrl: pdfRes.qrCodeDataUrl } }
    );
  }

  return {
    absolutePath,
    fileName,
    certificate
  };
}
