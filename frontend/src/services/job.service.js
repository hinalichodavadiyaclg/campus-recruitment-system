import { apiRequest } from './api.js';

export const jobService = {
  /**
   * List jobs with pagination and multi-parameter filtering
   * @param {Object} params - Query parameters (page, limit, search, jobType, workMode, status, departmentId, courseId, companyId, eligibleOnly)
   */
  listJobs: (params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set('page', params.page);
    if (params.limit) searchParams.set('limit', params.limit);
    if (params.search) searchParams.set('search', params.search.trim());
    if (params.jobType) searchParams.set('jobType', params.jobType);
    if (params.workMode) searchParams.set('workMode', params.workMode);
    if (params.status) searchParams.set('status', params.status);
    if (params.departmentId) searchParams.set('departmentId', params.departmentId);
    if (params.courseId) searchParams.set('courseId', params.courseId);
    if (params.companyId) searchParams.set('companyId', params.companyId);
    if (params.eligibleOnly !== undefined && params.eligibleOnly !== null && params.eligibleOnly !== '') {
      searchParams.set('eligibleOnly', String(params.eligibleOnly));
    }
    const qs = searchParams.toString();
    return apiRequest(`/api/jobs${qs ? `?${qs}` : ''}`);
  },

  /**
   * Get single job details by MongoDB _id
   * @param {string} id - Job ID
   */
  getJobById: (id) => apiRequest(`/api/jobs/${id}`),

  /**
   * Create a new job posting (Company or Placement Head/Super Admin)
   * @param {Object} data - Job creation payload matching jobCreateSchema
   */
  createJob: (data) =>
    apiRequest('/api/jobs', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  /**
   * Update job posting details (Company for own job or Placement Head/Super Admin)
   * @param {string} id - Job ID
   * @param {Object} data - Update payload matching jobUpdateSchema
   */
  updateJob: (id, data) =>
    apiRequest(`/api/jobs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),

  /**
   * Update job lifecycle status (OPEN, PAUSED, CLOSED)
   * @param {string} id - Job ID
   * @param {Object} payload - { status: 'OPEN'|'PAUSED'|'CLOSED', note?: string }
   */
  updateJobStatus: (id, { status, note }) =>
    apiRequest(`/api/jobs/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, note })
    }),

  /**
   * Reopen a closed job posting for a new recruitment round
   * @param {string} id - Job ID
   * @param {Object} payload - { newDeadline: string, vacancies?: number, note?: string }
   */
  reopenJob: (id, { newDeadline, vacancies, note }) =>
    apiRequest(`/api/jobs/${id}/reopen`, {
      method: 'POST',
      body: JSON.stringify({ newDeadline, vacancies, note })
    }),

  /**
   * Placement Cell administrative suspension or restoration of job posting
   * @param {string} id - Job ID
   * @param {Object} payload - { isSuspended: boolean, suspensionReason: string }
   */
  suspendJob: (id, { isSuspended, suspensionReason }) =>
    apiRequest(`/api/jobs/${id}/suspend`, {
      method: 'PATCH',
      body: JSON.stringify({ isSuspended, suspensionReason })
    })
};
