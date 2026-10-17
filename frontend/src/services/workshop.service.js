import { apiRequest } from './api.js';

export const workshopService = {
  /**
   * List workshops with filtering, search, and pagination
   */
  listWorkshops: (params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set('page', params.page);
    if (params.limit) searchParams.set('limit', params.limit);
    if (params.search) searchParams.set('search', params.search);
    if (params.category) searchParams.set('category', params.category);
    if (params.mode) searchParams.set('mode', params.mode);
    if (params.ownershipType) searchParams.set('ownershipType', params.ownershipType);
    if (params.departmentId) searchParams.set('departmentId', params.departmentId);
    if (params.approvalStatus) searchParams.set('approvalStatus', params.approvalStatus);
    if (params.lifecycleStatus) searchParams.set('lifecycleStatus', params.lifecycleStatus);
    if (params.isPublished !== undefined && params.isPublished !== '') {
      searchParams.set('isPublished', String(params.isPublished));
    }
    if (params.startDateFrom) searchParams.set('startDateFrom', params.startDateFrom);
    if (params.startDateTo) searchParams.set('startDateTo', params.startDateTo);
    if (params.myRegistrationsOnly !== undefined && params.myRegistrationsOnly !== '') {
      searchParams.set('myRegistrationsOnly', String(params.myRegistrationsOnly));
    }
    const qs = searchParams.toString();
    return apiRequest(`/api/workshops${qs ? `?${qs}` : ''}`);
  },

  /**
   * Get single workshop by ID (ObjectId or business WS-YYYY-XXXX)
   */
  getWorkshop: (id) => apiRequest(`/api/workshops/${id}`),

  /**
   * Create new workshop draft
   */
  createWorkshop: (data) =>
    apiRequest('/api/workshops', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  /**
   * Update workshop details (partial)
   */
  updateWorkshop: (id, data) =>
    apiRequest(`/api/workshops/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    }),

  /**
   * Delete eligible workshop (DRAFT / REJECTED with 0 registrations)
   */
  deleteWorkshop: (id) =>
    apiRequest(`/api/workshops/${id}`, {
      method: 'DELETE'
    }),

  /**
   * Submit workshop for approval
   */
  submitForApproval: (id) =>
    apiRequest(`/api/workshops/${id}/submit`, {
      method: 'POST'
    }),

  /**
   * Approve workshop (Placement Head / Super Admin)
   */
  approveWorkshop: (id, comment = '') =>
    apiRequest(`/api/workshops/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ comment })
    }),

  /**
   * Reject workshop with mandatory reason (Placement Head / Super Admin)
   */
  rejectWorkshop: (id, reason) =>
    apiRequest(`/api/workshops/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    }),

  /**
   * Publish approved workshop
   */
  publishWorkshop: (id) =>
    apiRequest(`/api/workshops/${id}/publish`, {
      method: 'POST'
    }),

  /**
   * Cancel workshop with mandatory reason
   */
  cancelWorkshop: (id, reason) =>
    apiRequest(`/api/workshops/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    }),

  /**
   * Register authenticated student for workshop
   */
  registerStudent: (id) =>
    apiRequest(`/api/workshops/${id}/register`, {
      method: 'POST'
    }),

  /**
   * Cancel student's own registration before startAt
   */
  cancelRegistration: (id, reason = '') =>
    apiRequest(`/api/workshops/${id}/cancel-registration`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    }),

  /**
   * Get participant roster for workshop
   */
  getRoster: (id, params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set('page', params.page);
    if (params.limit) searchParams.set('limit', params.limit);
    if (params.status) searchParams.set('status', params.status);
    if (params.search) searchParams.set('search', params.search);
    const qs = searchParams.toString();
    return apiRequest(`/api/workshops/${id}/roster${qs ? `?${qs}` : ''}`);
  },

  /**
   * Get session attendance records
   */
  getSessionAttendance: (workshopId, sessionId, params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set('page', params.page);
    if (params.limit) searchParams.set('limit', params.limit);
    if (params.status) searchParams.set('status', params.status);
    const qs = searchParams.toString();
    return apiRequest(`/api/workshops/${workshopId}/sessions/${sessionId}/attendance${qs ? `?${qs}` : ''}`);
  },

  /**
   * Submit or correct session attendance
   */
  submitSessionAttendance: (workshopId, sessionId, { attendees, correctionReason }) => {
    const payload = { attendees };
    if (correctionReason && correctionReason.trim()) {
      payload.correctionReason = correctionReason.trim();
    }
    return apiRequest(`/api/workshops/${workshopId}/sessions/${sessionId}/attendance`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  /**
   * Issue certificates for eligible candidates of a concluded workshop
   */
  issueCertificates: (workshopId, registrationIds = null) => {
    const payload = {};
    if (Array.isArray(registrationIds) && registrationIds.length > 0) {
      payload.registrationIds = registrationIds;
    }
    return apiRequest(`/api/workshops/${workshopId}/certificates/issue`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  /**
   * Revoke certificate with mandatory reason
   */
  revokeCertificate: (certificateId, reason) =>
    apiRequest(`/api/workshops/certificates/${certificateId}/revoke`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    }),

  /**
   * Get authenticated student's issued certificates
   */
  getMyCertificates: () => apiRequest('/api/workshops/certificates/me'),

  /**
   * Public certificate verification (unauthenticated)
   */
  verifyCertificatePublic: (code) =>
    apiRequest(`/api/workshops/certificates/verify/${encodeURIComponent(code)}`),

  /**
   * Get audit log history for workshop
   */
  getAuditLogs: (workshopId, params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set('page', params.page);
    if (params.limit) searchParams.set('limit', params.limit);
    if (params.action) searchParams.set('action', params.action);
    if (params.entityType) searchParams.set('entityType', params.entityType);
    const qs = searchParams.toString();
    return apiRequest(`/api/workshops/${workshopId}/audit-logs${qs ? `?${qs}` : ''}`);
  }
};
