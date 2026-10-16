import * as workshopService from '../services/workshop.service.js';
import * as registrationService from '../services/workshop-registration.service.js';
import * as attendanceService from '../services/workshop-attendance.service.js';
import * as certificateService from '../services/workshop-certificate.service.js';
import * as auditService from '../services/workshop-audit.service.js';
import { sendSuccess } from '../utils/api-response.js';

// ==========================================
// 1. Workshop Management & Lifecycle Handlers
// ==========================================

export async function create(req, res) {
  const body = res.locals.input?.body || req.body;
  const result = await workshopService.createWorkshop(body, req.auth);
  return sendSuccess(res, 201, result);
}

export async function list(req, res) {
  const query = res.locals.input?.query || req.query || {};
  const result = await workshopService.listWorkshops(query, req.auth);
  return sendSuccess(res, 200, result);
}

export async function getById(req, res) {
  const id = res.locals.input?.params?.id || req.params.id;
  const result = await workshopService.getWorkshopById(id, req.auth);
  return sendSuccess(res, 200, result);
}

export async function update(req, res) {
  const id = res.locals.input?.params?.id || req.params.id;
  const body = res.locals.input?.body || req.body;
  const result = await workshopService.updateWorkshop(id, body, req.auth);
  return sendSuccess(res, 200, result);
}

export async function submit(req, res) {
  const id = res.locals.input?.params?.id || req.params.id;
  const result = await workshopService.submitWorkshopForApproval(id, req.auth);
  return sendSuccess(res, 200, result);
}

export async function approve(req, res) {
  const id = res.locals.input?.params?.id || req.params.id;
  const body = res.locals.input?.body || req.body || {};
  const result = await workshopService.approveWorkshop(id, body, req.auth);
  return sendSuccess(res, 200, result);
}

export async function reject(req, res) {
  const id = res.locals.input?.params?.id || req.params.id;
  const body = res.locals.input?.body || req.body;
  const result = await workshopService.rejectWorkshop(id, body, req.auth);
  return sendSuccess(res, 200, result);
}

export async function publish(req, res) {
  const id = res.locals.input?.params?.id || req.params.id;
  const result = await workshopService.publishWorkshop(id, req.auth);
  return sendSuccess(res, 200, result);
}

export async function cancel(req, res) {
  const id = res.locals.input?.params?.id || req.params.id;
  const body = res.locals.input?.body || req.body;
  const result = await workshopService.cancelWorkshop(id, body, req.auth);
  return sendSuccess(res, 200, result);
}

export async function remove(req, res) {
  const id = res.locals.input?.params?.id || req.params.id;
  const result = await workshopService.deleteWorkshop(id, req.auth);
  return sendSuccess(res, 200, result);
}

// ==========================================
// 2. Student Registration & Roster Handlers
// ==========================================

export async function register(req, res) {
  const id = res.locals.input?.params?.id || req.params.id;
  const result = await registrationService.registerStudent(id, req.auth);
  return sendSuccess(res, 201, result);
}

export async function cancelRegistration(req, res) {
  const id = res.locals.input?.params?.id || req.params.id;
  const body = res.locals.input?.body || req.body || {};
  const result = await registrationService.cancelStudentRegistration(id, body, req.auth);
  return sendSuccess(res, 200, result);
}

export async function getRoster(req, res) {
  const id = res.locals.input?.params?.id || req.params.id;
  const query = res.locals.input?.query || req.query || {};
  const result = await registrationService.getWorkshopRoster(id, query, req.auth);
  return sendSuccess(res, 200, result);
}

// ==========================================
// 3. Session Attendance Handlers
// ==========================================

export async function submitAttendance(req, res) {
  const workshopId = res.locals.input?.params?.id || req.params.id;
  const sessionId = res.locals.input?.params?.sessionId || req.params.sessionId;
  const body = res.locals.input?.body || req.body;

  const result = await attendanceService.submitSessionAttendance(
    {
      workshopId,
      sessionId,
      attendees: body.attendees,
      correctionReason: body.correctionReason
    },
    req.auth
  );
  return sendSuccess(res, 200, result);
}

export async function getAttendance(req, res) {
  const workshopId = res.locals.input?.params?.id || req.params.id;
  const sessionId = res.locals.input?.params?.sessionId || req.params.sessionId;
  const query = res.locals.input?.query || req.query || {};

  const result = await attendanceService.getSessionAttendance(
    {
      workshopId,
      sessionId,
      ...query
    },
    req.auth
  );
  return sendSuccess(res, 200, result);
}

// ==========================================
// 4. Certificate Handlers
// ==========================================

export async function issueCertificates(req, res) {
  const workshopId = res.locals.input?.params?.id || req.params.id;
  const body = res.locals.input?.body || req.body || {};

  const result = await certificateService.issueCertificates(
    {
      workshopId,
      registrationIds: body.registrationIds
    },
    req.auth
  );
  return sendSuccess(res, 200, result);
}

export async function revokeCertificate(req, res) {
  const certificateId = res.locals.input?.params?.id || req.params.id;
  const body = res.locals.input?.body || req.body;

  const result = await certificateService.revokeCertificate(
    {
      certificateId,
      reason: body.reason
    },
    req.auth
  );
  return sendSuccess(res, 200, result);
}

export async function getMyCertificates(req, res) {
  const result = await certificateService.getMyCertificates(req.auth);
  return sendSuccess(res, 200, result);
}

export async function verifyCertificate(req, res) {
  const code = res.locals.input?.params?.code || req.params.code || req.query.code;
  const result = await certificateService.verifyCertificatePublic(code);
  return sendSuccess(res, 200, result);
}

// ==========================================
// 5. Audit History Handler
// ==========================================

export async function getAuditLogs(req, res) {
  const workshopId = res.locals.input?.params?.id || req.params.id;
  const query = res.locals.input?.query || req.query || {};

  const result = await auditService.getWorkshopAuditTrail(
    {
      workshopId,
      ...query
    },
    req.auth
  );
  return sendSuccess(res, 200, result);
}
