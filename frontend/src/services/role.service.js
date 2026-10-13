import { apiRequest } from './api.js';

export const roleService = {
  listRoles: () =>
    apiRequest('/api/roles'),

  getRole: (id) =>
    apiRequest(`/api/roles/${id}`),

  createRole: (data) =>
    apiRequest('/api/roles', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  updateRole: (id, data) =>
    apiRequest(`/api/roles/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),

  deleteRole: (id) =>
    apiRequest(`/api/roles/${id}`, {
      method: 'DELETE'
    }),

  setRoleStatus: (id, isActive) =>
    apiRequest(`/api/roles/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive })
    }),

  assignPermissions: (id, permissionIds) =>
    apiRequest(`/api/roles/${id}/permissions`, {
      method: 'PUT',
      body: JSON.stringify({ permissionIds })
    })
};
