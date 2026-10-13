import { apiRequest } from './api.js';

export const departmentService = {
  listDepartments: (params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set('page', params.page);
    if (params.limit) searchParams.set('limit', params.limit);
    if (params.search) searchParams.set('search', params.search);
    if (params.isActive !== undefined) searchParams.set('isActive', params.isActive);
    const qs = searchParams.toString();
    return apiRequest(`/api/departments${qs ? `?${qs}` : ''}`);
  },

  getDepartment: (id) => apiRequest(`/api/departments/${id}`),

  createDepartment: (data) =>
    apiRequest('/api/departments', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  updateDepartment: (id, data) =>
    apiRequest(`/api/departments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    }),

  setDepartmentStatus: (id, isActive) =>
    apiRequest(`/api/departments/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive })
    })
};
