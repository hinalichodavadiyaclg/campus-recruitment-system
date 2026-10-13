import { apiRequest } from './api.js';

export const courseService = {
  listCourses: (params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set('page', params.page);
    if (params.limit) searchParams.set('limit', params.limit);
    if (params.search) searchParams.set('search', params.search);
    if (params.departmentId) searchParams.set('departmentId', params.departmentId);
    if (params.level) searchParams.set('level', params.level);
    if (params.isActive !== undefined) searchParams.set('isActive', params.isActive);
    const qs = searchParams.toString();
    return apiRequest(`/api/courses${qs ? `?${qs}` : ''}`);
  },

  getCourse: (id) => apiRequest(`/api/courses/${id}`),

  createCourse: (data) =>
    apiRequest('/api/courses', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  updateCourse: (id, data) =>
    apiRequest(`/api/courses/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    }),

  setCourseStatus: (id, isActive) =>
    apiRequest(`/api/courses/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive })
    })
};
