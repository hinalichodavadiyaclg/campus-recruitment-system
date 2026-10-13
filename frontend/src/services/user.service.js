import { apiRequest } from './api.js';

export const userService = {
  listUsers: (params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set('page', params.page);
    if (params.limit) searchParams.set('limit', params.limit);
    if (params.userType) searchParams.set('userType', params.userType);
    if (params.accountStatus) searchParams.set('accountStatus', params.accountStatus);
    if (params.roleId) searchParams.set('roleId', params.roleId);
    const qs = searchParams.toString();
    return apiRequest(`/api/users${qs ? `?${qs}` : ''}`);
  },

  getUser: (id) =>
    apiRequest(`/api/users/${id}`),

  createUser: (data) =>
    apiRequest('/api/users', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  updateUser: (id, data) =>
    apiRequest(`/api/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),

  deleteUser: (id) =>
    apiRequest(`/api/users/${id}`, {
      method: 'DELETE'
    }),

  setStatus: (id, accountStatus) =>
    apiRequest(`/api/users/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ accountStatus })
    }),

  lockUser: (id, lockMinutes = 30) =>
    apiRequest(`/api/users/${id}/lock`, {
      method: 'PATCH',
      body: JSON.stringify({ lockMinutes })
    }),

  unlockUser: (id) =>
    apiRequest(`/api/users/${id}/unlock`, {
      method: 'PATCH',
      body: '{}'
    }),

  changeRole: (id, roleId) =>
    apiRequest(`/api/users/${id}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ roleId })
    })
};
