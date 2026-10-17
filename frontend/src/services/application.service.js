import { apiRequest } from './api.js';

export const applicationService = {
  /**
   * Submit an application for an open job (Student only)
   * @param {string} jobId - The MongoDB _id of the target Job
   */
  submitApplication: (jobId) =>
    apiRequest('/api/applications', {
      method: 'POST',
      body: JSON.stringify({ jobId })
    }),

  /**
   * List applications with pagination and filters
   * Automatically scoped on backend according to user role:
   * - Students see only their own applications
   * - Companies see only applicants for their own jobs
   * - Coordinators see only applicants in their department
   * - Placement Head & Super Admin oversee all
   * @param {Object} params - Query params (page, limit, jobId, studentId, companyId, status, recruitmentRound)
   */
  listApplications: (params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set('page', params.page);
    if (params.limit) searchParams.set('limit', params.limit);
    if (params.jobId) searchParams.set('jobId', params.jobId);
    if (params.studentId) searchParams.set('studentId', params.studentId);
    if (params.companyId) searchParams.set('companyId', params.companyId);
    if (params.status) searchParams.set('status', params.status);
    if (params.recruitmentRound) searchParams.set('recruitmentRound', params.recruitmentRound);
    const qs = searchParams.toString();
    return apiRequest(`/api/applications${qs ? `?${qs}` : ''}`);
  },

  /**
   * Get single application by ID with snapshots and audit history
   * @param {string} id - Application ID
   */
  getApplicationById: (id) => apiRequest(`/api/applications/${id}`),

  /**
   * Advance or update application stage
   * @param {string} id - Application ID
   * @param {Object} payload - { status: 'UNDER_REVIEW'|'SHORTLISTED'|'ASSESSMENT'|'INTERVIEW'|'SELECTED'|'REJECTED', note?: string, reviewerNotes?: string }
   */
  updateApplicationStatus: (id, { status, note, reviewerNotes }) =>
    apiRequest(`/api/applications/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, note, reviewerNotes })
    }),

  /**
   * Candidate withdrawal of pending/active application
   * @param {string} id - Application ID
   * @param {Object} payload - { reason?: string }
   */
  withdrawApplication: (id, { reason } = {}) =>
    apiRequest(`/api/applications/${id}/withdraw`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    })
};
