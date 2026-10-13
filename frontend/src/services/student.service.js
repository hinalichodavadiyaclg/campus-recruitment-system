import { apiRequest } from './api.js';

export const studentService = {
  listStudents: (params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set('page', params.page);
    if (params.limit) searchParams.set('limit', params.limit);
    if (params.search) searchParams.set('search', params.search);
    const qs = searchParams.toString();
    return apiRequest(`/api/students${qs ? `?${qs}` : ''}`);
  },

  getStudent: (id) => apiRequest(`/api/students/${id}`),

  createStudent: (data) =>
    apiRequest('/api/students', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  updateStudent: (id, data) =>
    apiRequest(`/api/students/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),

  deleteStudent: (id) =>
    apiRequest(`/api/students/${id}`, {
      method: 'DELETE'
    }),

  getMyProfile: () => apiRequest('/api/students/me'),

  updateMyProfile: (data) =>
    apiRequest('/api/students/me', {
      method: 'PUT',
      body: JSON.stringify(data)
    }),

  uploadPhoto: (formData) =>
    apiRequest('/api/students/me/photo', {
      method: 'POST',
      body: formData
    }),

  deletePhoto: () =>
    apiRequest('/api/students/me/photo', {
      method: 'DELETE'
    }),

  getPublicProfile: (id) => apiRequest(`/api/students/public/${id}`),

  uploadResume: (formData) =>
    apiRequest('/api/students/me/resume', {
      method: 'POST',
      body: formData
    }),

  deleteResume: () =>
    apiRequest('/api/students/me/resume', {
      method: 'DELETE'
    }),

  // Certificates
  addCertificate: (data) => {
    const isFD = data instanceof FormData;
    return apiRequest('/api/students/me/certificates', {
      method: 'POST',
      body: isFD ? data : JSON.stringify(data)
    });
  },

  updateCertificate: (id, data) => {
    const isFD = data instanceof FormData;
    return apiRequest(`/api/students/me/certificates/${id}`, {
      method: 'PUT',
      body: isFD ? data : JSON.stringify(data)
    });
  },

  deleteCertificate: (id) =>
    apiRequest(`/api/students/me/certificates/${id}`, {
      method: 'DELETE'
    }),

  // Projects
  addProject: (data) =>
    apiRequest('/api/students/me/projects', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  updateProject: (id, data) =>
    apiRequest(`/api/students/me/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),

  deleteProject: (id) =>
    apiRequest(`/api/students/me/projects/${id}`, {
      method: 'DELETE'
    }),

  // Internships
  addInternship: (data) => {
    const isFD = data instanceof FormData;
    return apiRequest('/api/students/me/internships', {
      method: 'POST',
      body: isFD ? data : JSON.stringify(data)
    });
  },

  updateInternship: (id, data) => {
    const isFD = data instanceof FormData;
    return apiRequest(`/api/students/me/internships/${id}`, {
      method: 'PUT',
      body: isFD ? data : JSON.stringify(data)
    });
  },

  deleteInternship: (id) =>
    apiRequest(`/api/students/me/internships/${id}`, {
      method: 'DELETE'
    }),

  // Achievements
  addAchievement: (data) => {
    const isFD = data instanceof FormData;
    return apiRequest('/api/students/me/achievements', {
      method: 'POST',
      body: isFD ? data : JSON.stringify(data)
    });
  },

  updateAchievement: (id, data) => {
    const isFD = data instanceof FormData;
    return apiRequest(`/api/students/me/achievements/${id}`, {
      method: 'PUT',
      body: isFD ? data : JSON.stringify(data)
    });
  },

  deleteAchievement: (id) =>
    apiRequest(`/api/students/me/achievements/${id}`, {
      method: 'DELETE'
    })
};

