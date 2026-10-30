import { apiRequest } from './api.js';

export const resumeAnalysisService = {
  /**
   * Upload resume document (PDF / DOCX)
   */
  uploadResume: (formData) =>
    apiRequest('/api/student/resumes/upload', {
      method: 'POST',
      body: formData
    }),

  /**
   * Get currently active resume
   */
  getActiveResume: () => apiRequest('/api/student/resumes/active'),

  /**
   * List all resume versions
   */
  getStudentResumes: () => apiRequest('/api/student/resumes'),

  /**
   * Delete a resume version
   */
  deleteResume: (id) =>
    apiRequest(`/api/student/resumes/${id}`, {
      method: 'DELETE'
    }),

  /**
   * Trigger AI analysis (General or Job-Matched)
   */
  analyzeResume: (resumeId, jobId = null) =>
    apiRequest(`/api/student/resumes/${resumeId}/analyze`, {
      method: 'POST',
      body: JSON.stringify({ jobId })
    }),

  /**
   * Get latest completed analysis for active resume
   */
  getLatestAnalysis: () => apiRequest('/api/student/resumes/analyses/latest'),

  /**
   * Get all historical analyses across versions
   */
  getAllStudentAnalyses: () => apiRequest('/api/student/resumes/analyses/all'),

  /**
   * Get specific analysis report
   */
  getAnalysisById: (analysisId) =>
    apiRequest(`/api/student/resumes/analyses/${analysisId}`),

  /**
   * Compare two analysis reports
   */
  compareAnalyses: (id1, id2) =>
    apiRequest(`/api/student/resumes/analyses/compare?id1=${encodeURIComponent(id1)}&id2=${encodeURIComponent(id2)}`),

  /**
   * Get eligible published jobs for matching
   */
  getEligibleJobs: () => apiRequest('/api/student/resumes/eligible-jobs')
};
