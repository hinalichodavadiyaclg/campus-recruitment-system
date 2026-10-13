import { apiRequest } from './api.js';

export const authService = {
  login: (credentials) =>
    apiRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials)
    }),

  logout: () =>
    apiRequest('/api/auth/logout', {
      method: 'POST'
    }),

  getMe: () =>
    apiRequest('/api/auth/me'),

  changePassword: (data) =>
    apiRequest('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  forgotPassword: (email) =>
    apiRequest('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email })
    }),

  resetPassword: (token, newPassword) =>
    apiRequest('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword })
    })
};
