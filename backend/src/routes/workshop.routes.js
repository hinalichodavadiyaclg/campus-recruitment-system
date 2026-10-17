import { Router } from 'express';
import { z } from 'zod';
import * as workshopController from '../controllers/workshop.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorizePermissions } from '../middleware/authorize.js';
import { PERMISSION_IDS } from '../utils/access-constants.js';
import { asyncHandler } from '../utils/async-handler.js';
import { validate } from '../validators/request.validator.js';
import {
  workshopCreateSchema,
  workshopUpdateSchema,
  workshopListQuerySchema,
  workshopApproveSchema,
  workshopRejectSchema,
  workshopPublishSchema,
  workshopCancelSchema,
  workshopRegisterSchema,
  workshopCancelRegistrationSchema,
  workshopAttendanceSubmitSchema,
  workshopAttendanceQuerySchema,
  workshopCertificateIssueSchema,
  workshopCertificateRevokeSchema,
  workshopRosterQuerySchema,
  workshopAuditLogQuerySchema,
  emptyParams,
  emptyQuery,
  emptyBody
} from '../validators/workshop.validator.js';

export const workshopRouter = Router();

// Reusable empty envelope schema for parameter-less / body-less endpoints
const emptyEnvelopeSchema = z.object({
  params: emptyParams,
  body: emptyBody,
  query: emptyQuery
});

// Schema for public certificate verification
const certificateVerifySchema = z.object({
  params: z.object({
    code: z.string().trim().min(1, 'Verification code is required.')
  }).strict(),
  body: emptyBody,
  query: emptyQuery
});

// ==========================================
// 1. PUBLIC ROUTES (Unauthenticated)
// Must be registered BEFORE protected and parameterized routes
// ==========================================

workshopRouter.get(
  '/certificates/verify/:code',
  validate(certificateVerifySchema),
  asyncHandler(workshopController.verifyCertificate)
);

// ==========================================
// 2. STATIC AUTHENTICATED ROUTES
// Must be registered BEFORE dynamic /:id parameter routes
// ==========================================

// Authenticated student's own certificates
workshopRouter.get(
  '/certificates/me',
  authenticate,
  authorizePermissions(PERMISSION_IDS.WORKSHOP_READ),
  validate(emptyEnvelopeSchema),
  asyncHandler(workshopController.getMyCertificates)
);

// Revoke certificate by certificate ID
workshopRouter.post(
  '/certificates/:id/revoke',
  authenticate,
  authorizePermissions(PERMISSION_IDS.WORKSHOP_CERTIFICATE_MANAGE),
  validate(workshopCertificateRevokeSchema),
  asyncHandler(workshopController.revokeCertificate)
);

// Workshop listing
workshopRouter.get(
  '/',
  authenticate,
  authorizePermissions(PERMISSION_IDS.WORKSHOP_READ),
  validate(workshopListQuerySchema),
  asyncHandler(workshopController.list)
);

// Workshop creation
workshopRouter.post(
  '/',
  authenticate,
  authorizePermissions(PERMISSION_IDS.WORKSHOP_CREATE),
  validate(workshopCreateSchema),
  asyncHandler(workshopController.create)
);

// ==========================================
// 3. PARAMETERIZED WORKSHOP ROUTES (/:id)
// ==========================================

// Get workshop details by ID
workshopRouter.get(
  '/:id',
  authenticate,
  authorizePermissions(PERMISSION_IDS.WORKSHOP_READ),
  validate(workshopPublishSchema),
  asyncHandler(workshopController.getById)
);

// Update workshop
workshopRouter.patch(
  '/:id',
  authenticate,
  authorizePermissions(PERMISSION_IDS.WORKSHOP_UPDATE),
  validate(workshopUpdateSchema),
  asyncHandler(workshopController.update)
);

workshopRouter.put(
  '/:id',
  authenticate,
  authorizePermissions(PERMISSION_IDS.WORKSHOP_UPDATE),
  validate(workshopUpdateSchema),
  asyncHandler(workshopController.update)
);

// Delete draft / rejected workshop
workshopRouter.delete(
  '/:id',
  authenticate,
  authorizePermissions(PERMISSION_IDS.WORKSHOP_DELETE),
  validate(workshopPublishSchema),
  asyncHandler(workshopController.remove)
);

// Submit workshop for review
workshopRouter.post(
  '/:id/submit',
  authenticate,
  authorizePermissions(PERMISSION_IDS.WORKSHOP_UPDATE),
  validate(workshopPublishSchema),
  asyncHandler(workshopController.submit)
);

// Approve workshop
workshopRouter.post(
  '/:id/approve',
  authenticate,
  authorizePermissions(PERMISSION_IDS.WORKSHOP_APPROVE),
  validate(workshopApproveSchema),
  asyncHandler(workshopController.approve)
);

// Reject workshop
workshopRouter.post(
  '/:id/reject',
  authenticate,
  authorizePermissions(PERMISSION_IDS.WORKSHOP_APPROVE),
  validate(workshopRejectSchema),
  asyncHandler(workshopController.reject)
);

// Publish approved workshop
workshopRouter.post(
  '/:id/publish',
  authenticate,
  authorizePermissions(PERMISSION_IDS.WORKSHOP_PUBLISH),
  validate(workshopPublishSchema),
  asyncHandler(workshopController.publish)
);

// Cancel workshop
workshopRouter.post(
  '/:id/cancel',
  authenticate,
  authorizePermissions(PERMISSION_IDS.WORKSHOP_CANCEL),
  validate(workshopCancelSchema),
  asyncHandler(workshopController.cancel)
);

// Register authenticated student for workshop
workshopRouter.post(
  '/:id/register',
  authenticate,
  authorizePermissions(PERMISSION_IDS.WORKSHOP_REGISTER),
  validate(workshopRegisterSchema),
  asyncHandler(workshopController.register)
);

// Cancel student's registration
workshopRouter.post(
  '/:id/cancel-registration',
  authenticate,
  authorizePermissions(PERMISSION_IDS.WORKSHOP_REGISTER),
  validate(workshopCancelRegistrationSchema),
  asyncHandler(workshopController.cancelRegistration)
);

// View workshop roster
workshopRouter.get(
  '/:id/roster',
  authenticate,
  authorizePermissions(PERMISSION_IDS.WORKSHOP_ROSTER_READ),
  validate(workshopRosterQuerySchema),
  asyncHandler(workshopController.getRoster)
);

// View session attendance
workshopRouter.get(
  '/:id/sessions/:sessionId/attendance',
  authenticate,
  authorizePermissions(PERMISSION_IDS.WORKSHOP_ATTENDANCE_MANAGE),
  validate(workshopAttendanceQuerySchema),
  asyncHandler(workshopController.getAttendance)
);

// Submit or correct session attendance
workshopRouter.post(
  '/:id/sessions/:sessionId/attendance',
  authenticate,
  authorizePermissions(PERMISSION_IDS.WORKSHOP_ATTENDANCE_MANAGE),
  validate(workshopAttendanceSubmitSchema),
  asyncHandler(workshopController.submitAttendance)
);

// Issue certificates
workshopRouter.post(
  '/:id/certificates/issue',
  authenticate,
  authorizePermissions(PERMISSION_IDS.WORKSHOP_CERTIFICATE_MANAGE),
  validate(workshopCertificateIssueSchema),
  asyncHandler(workshopController.issueCertificates)
);

// View workshop audit trail
workshopRouter.get(
  '/:id/audit-logs',
  authenticate,
  authorizePermissions(PERMISSION_IDS.WORKSHOP_AUDIT_READ),
  validate(workshopAuditLogQuerySchema),
  asyncHandler(workshopController.getAuditLogs)
);
