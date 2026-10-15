import { apiRequest } from './api.js';

export const placementOfficerService = {
  listPlacementOfficers: (params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set('page', params.page);
    if (params.limit) searchParams.set('limit', params.limit);
    if (params.search) searchParams.set('search', params.search);
    const qs = searchParams.toString();
    return apiRequest(`/api/placement-officers${qs ? `?${qs}` : ''}`);
  },

  getMyProfile: () => apiRequest('/api/placement-officers/me'),

  updateMyProfile: (data) =>
    apiRequest('/api/placement-officers/me', {
      method: 'PUT',
      body: JSON.stringify(data)
    }),

  getPlacementOfficer: (id) => apiRequest(`/api/placement-officers/${id}`),

  createPlacementOfficer: (data) =>
    apiRequest('/api/placement-officers', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  updatePlacementOfficer: (id, data) =>
    apiRequest(`/api/placement-officers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),

  deletePlacementOfficer: (id) =>
    apiRequest(`/api/placement-officers/${id}`, {
      method: 'DELETE'
    })
};
