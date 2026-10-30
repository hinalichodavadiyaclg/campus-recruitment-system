import mongoose from 'mongoose';
import { WorkshopCertificateTemplate } from '../models/workshop_certificate_template.model.js';
import { WorkshopCertificate } from '../models/workshop_certificate.model.js';
import { Workshop } from '../models/workshop.model.js';
import { ROLE_IDS } from '../utils/access-constants.js';
import { AppError } from '../utils/app-error.js';
import { getCompanyIdForAuth, isCompanyUser } from '../utils/company-workshop-scope.js';
import { getCoordinatorDepartment } from '../utils/department-scope.js';
import { generatePersonalizedCertificatePdf } from './pdf-generator.service.js';

/**
 * Creates a new certificate template.
 *
 * Scope rules:
 * - Company Recruiter: templates for their own company (templateScope: 'COMPANY').
 * - Placement Coordinator: templates for their assigned department (templateScope: 'DEPARTMENT').
 * - Placement Head / Super Admin: templates for institution ('INSTITUTION'), department, or company.
 *
 * @param {object} params
 * @param {string} [params.companyId]
 * @param {string} [params.departmentId]
 * @param {string} [params.templateScope]
 * @param {string} params.name
 * @param {string} params.backgroundUrl
 * @param {string} [params.orientation]
 * @param {string} [params.signatoryName]
 * @param {string} [params.signatoryTitle]
 * @param {boolean} [params.isDefault]
 * @param {object} auth
 * @returns {Promise<object>}
 */
export async function createTemplate({
  companyId,
  departmentId,
  templateScope,
  name,
  backgroundUrl,
  orientation = 'LANDSCAPE',
  signatoryName = '',
  signatoryTitle = '',
  isDefault = false
}, auth) {
  if (!auth || !auth.userId) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  }

  let targetCompanyId = companyId || null;
  let targetDepartmentId = departmentId || null;
  let resolvedScope = templateScope || 'COMPANY';

  if (isCompanyUser(auth)) {
    const authCompanyId = await getCompanyIdForAuth(auth);
    if (!authCompanyId) {
      throw new AppError(403, 'FORBIDDEN', 'No company profile associated with this user account.');
    }
    targetCompanyId = authCompanyId;
    targetDepartmentId = null;
    resolvedScope = 'COMPANY';
  } else if (auth.roleId === ROLE_IDS.PLACEMENT_COORDINATOR) {
    const coordDept = await getCoordinatorDepartment(auth);
    if (!coordDept) {
      throw new AppError(403, 'FORBIDDEN', 'No department assigned to coordinator.');
    }
    targetDepartmentId = coordDept.departmentId;
    targetCompanyId = null;
    resolvedScope = 'DEPARTMENT';
  } else if (
    auth.roleId !== ROLE_IDS.SUPER_ADMIN &&
    auth.roleId !== ROLE_IDS.PLACEMENT_HEAD
  ) {
    throw new AppError(403, 'FORBIDDEN', 'Only authorized Company, Placement Coordinator, Placement Head, or Super Admin can create templates.');
  } else {
    // Super Admin or Placement Head
    if (targetCompanyId) {
      resolvedScope = 'COMPANY';
    } else if (targetDepartmentId) {
      resolvedScope = 'DEPARTMENT';
    } else {
      resolvedScope = 'INSTITUTION';
    }
  }

  // If company scope, companyId is required
  if (resolvedScope === 'COMPANY' && (!targetCompanyId || !mongoose.Types.ObjectId.isValid(targetCompanyId))) {
    throw new AppError(400, 'INVALID_INPUT', 'Valid companyId is required for company templates.');
  }

  if (resolvedScope === 'DEPARTMENT' && (!targetDepartmentId || !mongoose.Types.ObjectId.isValid(targetDepartmentId))) {
    throw new AppError(400, 'INVALID_INPUT', 'Valid departmentId is required for departmental templates.');
  }

  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new AppError(400, 'INVALID_INPUT', 'Template name is required.');
  }

  if (!backgroundUrl || typeof backgroundUrl !== 'string') {
    throw new AppError(400, 'INVALID_INPUT', 'Background image URL or upload is required.');
  }

  if (isDefault) {
    const defaultFilter = {};
    if (resolvedScope === 'COMPANY' && targetCompanyId) defaultFilter.companyId = targetCompanyId;
    if (resolvedScope === 'DEPARTMENT' && targetDepartmentId) defaultFilter.departmentId = targetDepartmentId;
    if (resolvedScope === 'INSTITUTION') defaultFilter.templateScope = 'INSTITUTION';

    if (Object.keys(defaultFilter).length > 0) {
      await WorkshopCertificateTemplate.updateMany(defaultFilter, { $set: { isDefault: false } });
    }
  }

  const template = await WorkshopCertificateTemplate.create({
    companyId: targetCompanyId ? new mongoose.Types.ObjectId(targetCompanyId) : null,
    departmentId: targetDepartmentId ? new mongoose.Types.ObjectId(targetDepartmentId) : null,
    templateScope: resolvedScope,
    name: name.trim(),
    backgroundUrl: backgroundUrl.trim(),
    orientation: orientation === 'PORTRAIT' ? 'PORTRAIT' : 'LANDSCAPE',
    status: 'APPROVED',
    version: 1,
    signatoryName: (signatoryName || '').trim(),
    signatoryTitle: (signatoryTitle || '').trim(),
    isDefault: !!isDefault,
    createdBy: auth.userId
  });

  return template.toObject();
}

/**
 * Lists templates with isolation per role.
 *
 * @param {object} auth
 * @param {object} [query={}]
 * @returns {Promise<Array>}
 */
export async function listTemplates(auth, query = {}) {
  if (!auth || !auth.userId) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  }

  const filter = {};

  if (isCompanyUser(auth)) {
    const companyId = await getCompanyIdForAuth(auth);
    if (!companyId) return [];
    filter.companyId = new mongoose.Types.ObjectId(companyId);
  } else if (auth.roleId === ROLE_IDS.PLACEMENT_COORDINATOR) {
    const coordDept = await getCoordinatorDepartment(auth);
    const deptId = coordDept?.departmentId;
    filter.$or = [
      { templateScope: 'INSTITUTION' },
      ...(deptId ? [{ departmentId: new mongoose.Types.ObjectId(deptId) }] : [])
    ];
  } else if (query.companyId && mongoose.Types.ObjectId.isValid(query.companyId)) {
    filter.companyId = new mongoose.Types.ObjectId(query.companyId);
  } else if (query.departmentId && mongoose.Types.ObjectId.isValid(query.departmentId)) {
    filter.departmentId = new mongoose.Types.ObjectId(query.departmentId);
  } else if (query.templateScope) {
    filter.templateScope = query.templateScope;
  }

  const templates = await WorkshopCertificateTemplate.find(filter)
    .sort({ createdAt: -1 })
    .populate('companyId', 'name companyName legalName')
    .populate('departmentId', 'name code')
    .lean();

  return templates;
}

/**
 * Retrieves a single template by ID with ownership verification.
 *
 * @param {string} templateId
 * @param {object} auth
 * @returns {Promise<object>}
 */
export async function getTemplateById(templateId, auth) {
  if (!auth || !auth.userId) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  }

  const template = await WorkshopCertificateTemplate.findById(templateId)
    .populate('companyId', 'name companyName legalName')
    .populate('departmentId', 'name code')
    .lean();

  if (!template) {
    throw new AppError(404, 'TEMPLATE_NOT_FOUND', 'Certificate template not found.');
  }

  if (isCompanyUser(auth)) {
    const companyId = await getCompanyIdForAuth(auth);
    if (!companyId || !template.companyId || String(template.companyId._id || template.companyId) !== String(companyId)) {
      throw new AppError(403, 'FORBIDDEN', 'Access denied to this certificate template.');
    }
  } else if (auth.roleId === ROLE_IDS.PLACEMENT_COORDINATOR) {
    const coordDept = await getCoordinatorDepartment(auth);
    if (template.templateScope === 'DEPARTMENT' && template.departmentId) {
      const tmplDeptId = String(template.departmentId._id || template.departmentId);
      if (!coordDept || tmplDeptId !== String(coordDept.departmentId)) {
        throw new AppError(403, 'FORBIDDEN', 'Access denied to certificate template outside your department.');
      }
    }
  }

  return template;
}

/**
 * Updates a template. If already used in issued certificates, bumps version to protect existing certs.
 *
 * @param {string} templateId
 * @param {object} payload
 * @param {object} auth
 * @returns {Promise<object>}
 */
export async function updateTemplate(templateId, payload, auth) {
  if (!auth || !auth.userId) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  }

  const template = await WorkshopCertificateTemplate.findById(templateId);
  if (!template) {
    throw new AppError(404, 'TEMPLATE_NOT_FOUND', 'Certificate template not found.');
  }

  if (isCompanyUser(auth)) {
    const companyId = await getCompanyIdForAuth(auth);
    if (!companyId || !template.companyId || String(template.companyId) !== String(companyId)) {
      throw new AppError(403, 'FORBIDDEN', 'Access denied to update this certificate template.');
    }
  } else if (auth.roleId === ROLE_IDS.PLACEMENT_COORDINATOR) {
    const coordDept = await getCoordinatorDepartment(auth);
    if (template.templateScope === 'DEPARTMENT' && template.departmentId) {
      if (!coordDept || String(template.departmentId) !== String(coordDept.departmentId)) {
        throw new AppError(403, 'FORBIDDEN', 'Access denied to update template outside your department.');
      }
    } else {
      throw new AppError(403, 'FORBIDDEN', 'Coordinators can only update templates in their assigned department.');
    }
  } else if (
    auth.roleId !== ROLE_IDS.SUPER_ADMIN &&
    auth.roleId !== ROLE_IDS.PLACEMENT_HEAD
  ) {
    throw new AppError(403, 'FORBIDDEN', 'Only authorized Company, Placement Head, or Super Admin can update templates.');
  }

  // Check if any certificates have already been issued with this template
  const issuedCount = await WorkshopCertificate.countDocuments({
    certificateTemplateId: template._id,
    certificateStatus: 'ISSUED'
  });

  if (payload.name) template.name = payload.name.trim();
  if (payload.backgroundUrl) template.backgroundUrl = payload.backgroundUrl.trim();
  if (payload.orientation) template.orientation = payload.orientation;
  if (payload.signatoryName !== undefined) template.signatoryName = (payload.signatoryName || '').trim();
  if (payload.signatoryTitle !== undefined) template.signatoryTitle = (payload.signatoryTitle || '').trim();

  if (payload.isDefault === true) {
    const defaultFilter = { _id: { $ne: template._id } };
    if (template.companyId) defaultFilter.companyId = template.companyId;
    if (template.departmentId) defaultFilter.departmentId = template.departmentId;
    if (template.templateScope === 'INSTITUTION') defaultFilter.templateScope = 'INSTITUTION';

    await WorkshopCertificateTemplate.updateMany(defaultFilter, { $set: { isDefault: false } });
    template.isDefault = true;
  } else if (payload.isDefault === false) {
    template.isDefault = false;
  }

  // If already used, bump version so future issuances use new version, keeping past immutable
  if (issuedCount > 0) {
    template.version = (template.version || 1) + 1;
  }

  await template.save();
  return template.toObject();
}

/**
 * Deletes a template if not referenced by issued certificates.
 *
 * @param {string} templateId
 * @param {object} auth
 * @returns {Promise<{ success: boolean }>}
 */
export async function deleteTemplate(templateId, auth) {
  if (!auth || !auth.userId) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  }

  const template = await WorkshopCertificateTemplate.findById(templateId);
  if (!template) {
    throw new AppError(404, 'TEMPLATE_NOT_FOUND', 'Certificate template not found.');
  }

  if (isCompanyUser(auth)) {
    const companyId = await getCompanyIdForAuth(auth);
    if (!companyId || !template.companyId || String(template.companyId) !== String(companyId)) {
      throw new AppError(403, 'FORBIDDEN', 'Access denied to delete this certificate template.');
    }
  } else if (auth.roleId === ROLE_IDS.PLACEMENT_COORDINATOR) {
    const coordDept = await getCoordinatorDepartment(auth);
    if (template.templateScope === 'DEPARTMENT' && template.departmentId) {
      if (!coordDept || String(template.departmentId) !== String(coordDept.departmentId)) {
        throw new AppError(403, 'FORBIDDEN', 'Access denied to delete template outside your department.');
      }
    } else {
      throw new AppError(403, 'FORBIDDEN', 'Coordinators can only delete templates in their assigned department.');
    }
  } else if (
    auth.roleId !== ROLE_IDS.SUPER_ADMIN &&
    auth.roleId !== ROLE_IDS.PLACEMENT_HEAD
  ) {
    throw new AppError(403, 'FORBIDDEN', 'Only authorized Company, Placement Head, or Super Admin can delete templates.');
  }

  // Check for issued certificates
  const issuedCount = await WorkshopCertificate.countDocuments({
    certificateTemplateId: template._id,
    certificateStatus: 'ISSUED'
  });

  if (issuedCount > 0) {
    throw new AppError(
      400,
      'TEMPLATE_IN_USE',
      'Cannot delete certificate template that has already been used to issue certificates.'
    );
  }

  // Clear references in workshops using this template
  await Workshop.updateMany(
    { certificateTemplateId: template._id },
    { $set: { certificateTemplateId: null } }
  );

  await WorkshopCertificateTemplate.deleteOne({ _id: template._id });
  return { success: true };
}

/**
 * Previews a certificate template using sample participant data.
 *
 * @param {string} templateId
 * @param {object} auth
 * @returns {Promise<object>}
 */
export async function previewTemplate(templateId, auth) {
  const template = await getTemplateById(templateId, auth);

  const sampleCertificate = {
    certificateNumber: 'SAMPLE-2026-0001',
    verificationCode: 'SAMPLE-VERIFICATION-CODE-PREVIEW',
    issuedAt: new Date()
  };

  const sampleStudent = {
    firstName: 'Jane',
    lastName: 'Doe'
  };

  const sampleWorkshop = {
    title: 'Advanced Professional Workshop',
    startAt: new Date(),
    endAt: new Date()
  };

  const pdfResult = await generatePersonalizedCertificatePdf({
    certificate: sampleCertificate,
    student: sampleStudent,
    workshop: sampleWorkshop,
    template
  });

  return {
    template,
    sampleCertificate,
    fileUrl: pdfResult.fileUrl,
    qrCodeDataUrl: pdfResult.qrCodeDataUrl
  };
}
