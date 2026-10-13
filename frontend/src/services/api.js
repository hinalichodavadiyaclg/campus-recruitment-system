export const SESSION_KEY = 'campusRecruitSessionToken';
export const REMEMBER_KEY = 'campusRecruitRememberedSessionToken';

export const getToken = () =>
  sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(REMEMBER_KEY);

export const setToken = (token, remember = false) => {
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(REMEMBER_KEY);
  (remember ? localStorage : sessionStorage).setItem(
    remember ? REMEMBER_KEY : SESSION_KEY,
    token
  );
};

export const clearToken = () => {
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(REMEMBER_KEY);
};

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export const getAssetUrl = (path) => {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:') || path.startsWith('blob:')) {
    return path;
  }
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${BASE_URL}${cleanPath}`;
};

export async function apiRequest(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const headers = {
    ...(!isFormData && options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {})
  };

  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const url = `${BASE_URL}${path}`;
  let response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch (networkErr) {
    const error = new Error('Unable to connect to the backend server. Please verify that the server is running.');
    error.code = 'NETWORK_ERROR';
    error.status = 0;
    throw error;
  }

  const body = await response.json().catch(() => ({}));

  if (!response.ok || !body.success) {
    if (response.status === 401 && getToken()) {
      clearToken();
      window.dispatchEvent(new CustomEvent('auth:expired'));
    }

    let errorMsg = body?.error?.message;
    if (!errorMsg) {
      if (response.status >= 500) {
        errorMsg = 'Backend server is temporarily unavailable. Please verify the backend API is running on port 3000.';
      } else if (response.status === 404) {
        errorMsg = `Requested endpoint was not found: ${path}`;
      } else {
        errorMsg = `The request failed with status ${response.status}.`;
      }
    }

    const error = new Error(errorMsg);
    error.code = body?.error?.code || (response.status >= 500 ? 'SERVER_UNAVAILABLE' : 'REQUEST_FAILED');
    error.details = body?.error?.details;
    error.status = response.status;
    throw error;
  }

  return body.data;
}

export async function downloadFile(path, defaultFilename = 'download.xlsx') {
  const token = getToken();
  const headers = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const url = `${BASE_URL}${path}`;
  const response = await fetch(url, { headers });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const error = new Error(errorBody?.error?.message || 'Download request failed.');
    error.status = response.status;
    throw error;
  }

  const blob = await response.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = downloadUrl;
  anchor.download = defaultFilename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(downloadUrl);
}
