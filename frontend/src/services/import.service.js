import { apiRequest, downloadFile, getToken } from './api.js';

export const importService = {
  getTemplateDownloadUrl: (type) => {
    const token = getToken();
    const query = token ? `?token=${encodeURIComponent(token)}` : '';
    return `/api/imports/templates/${type}${query}`;
  },

  downloadTemplate: async (type) => {
    return downloadFile(`/api/imports/templates/${type}`, `${type}_template.xlsx`);
  },

  validateImportFile: (type, file, options = {}) => {
    const formData = new FormData();
    formData.append('file', file);
    if (options.createNew !== undefined) formData.append('createNew', String(options.createNew));
    if (options.updateExisting !== undefined) formData.append('updateExisting', String(options.updateExisting));

    return apiRequest(`/api/imports/validate/${type}`, {
      method: 'POST',
      body: formData
    });
  },

  confirmImportFile: (type, file, options = {}) => {
    const formData = new FormData();
    formData.append('file', file);
    if (options.createNew !== undefined) formData.append('createNew', String(options.createNew));
    if (options.updateExisting !== undefined) formData.append('updateExisting', String(options.updateExisting));

    return apiRequest(`/api/imports/confirm/${type}`, {
      method: 'POST',
      body: formData
    });
  },

  exportData: async (type, { filtered = false, search = '', department = '', course = '' } = {}) => {
    const params = new URLSearchParams();
    if (filtered) params.set('filtered', 'true');
    if (search) params.set('search', search);
    if (department) params.set('department', department);
    if (course) params.set('course', course);
    const queryString = params.toString() ? `?${params.toString()}` : '';

    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `${type}_${filtered ? 'filtered_' : 'all_'}${timestamp}.xlsx`;

    return downloadFile(`/api/imports/export/${type}${queryString}`, filename);
  }
};
