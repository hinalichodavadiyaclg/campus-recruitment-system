import { apiRequest } from './api.js';

export const permissionService = {
  listPermissions: () =>
    apiRequest('/api/permissions'),

  getPermission: (id) =>
    apiRequest(`/api/permissions/${id}`),

  createPermission: (data) =>
    apiRequest('/api/permissions', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  updatePermission: (id, data) =>
    apiRequest(`/api/permissions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),

  deletePermission: (id) =>
    apiRequest(`/api/permissions/${id}`, {
      method: 'DELETE'
    }),

  setPermissionStatus: (id, isActive) =>
    apiRequest(`/api/permissions/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive })
    })
};
