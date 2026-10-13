import { apiRequest } from './api.js';

export const companyService = {
  listCompanies: (params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set('page', params.page);
    if (params.limit) searchParams.set('limit', params.limit);
    if (params.search) searchParams.set('search', params.search);
    const qs = searchParams.toString();
    return apiRequest(`/api/companies${qs ? `?${qs}` : ''}`);
  },

  getCompany: (id) => apiRequest(`/api/companies/${id}`),

  createCompany: (data) =>
    apiRequest('/api/companies', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  updateCompany: (id, data) =>
    apiRequest(`/api/companies/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),

  getMyProfile: () => apiRequest('/api/companies/me'),

  updateMyProfile: (data) =>
    apiRequest('/api/companies/me', {
      method: 'PUT',
      body: JSON.stringify(data)
    }),

  deleteCompany: (id) =>
    apiRequest(`/api/companies/${id}`, {
      method: 'DELETE'
    }),

  listRecruiters: (companyId) =>
    apiRequest(`/api/companies/${companyId}/recruiters`),

  createRecruiter: (companyId, data) =>
    apiRequest(`/api/companies/${companyId}/recruiters`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  updateRecruiter: (companyId, recruiterId, data) =>
    apiRequest(`/api/companies/${companyId}/recruiters/${recruiterId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),

  deleteRecruiter: (companyId, recruiterId) =>
    apiRequest(`/api/companies/${companyId}/recruiters/${recruiterId}`, {
      method: 'DELETE'
    })
};
