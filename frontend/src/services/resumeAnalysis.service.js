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
  getEligibleJobs: () => apiRequest('/api/student/resumes/eligible-jobs'),

  /**
   * Trigger AI resume improvement
   */
  createImprovement: (resumeId) =>
    apiRequest(`/api/student/resumes/${resumeId}/improve`, {
      method: 'POST'
    }),

  /**
   * Get latest improvement for resume
   */
  getLatestImprovementForResume: (resumeId) =>
    apiRequest(`/api/student/resumes/${resumeId}/improvements/latest`),

  /**
   * Get improvement by ID
   */
  getImprovementById: (improvementId) =>
    apiRequest(`/api/student/resume-improvements/${improvementId}`),

  /**
   * Update section decision (ACCEPT / REJECT / EDIT)
   */
  updateSectionDecision: (improvementId, sectionKey, payload) =>
    apiRequest(`/api/student/resume-improvements/${improvementId}/sections/${sectionKey}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),

  /**
   * Answer optional missing information question
   */
  answerQuestion: (improvementId, questionId, answer) =>
    apiRequest(`/api/student/resume-improvements/${improvementId}/questions/${questionId}`, {
      method: 'POST',
      body: JSON.stringify({ answer })
    }),

  /**
   * Generate approved resume (PDF + DOCX)
   */
  generateApprovedResume: (improvementId) =>
    apiRequest(`/api/student/resume-improvements/${improvementId}/generate`, {
      method: 'POST'
    }),

  /**
   * Get improvement history
   */
  getImprovementHistory: () =>
    apiRequest('/api/student/resume-improvements/history')
};
