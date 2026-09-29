import { checkServerVersion } from '../services/version';

const API_BASE = '/api';

async function request(url, options = {}) {
  const config = {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  };

  const response = await fetch(`${API_BASE}${url}`, config);

  // Check server version header (like in d-flow)
  const serverVersion = response.headers?.get('x-app-version') || response.headers?.get('X-App-Version');
  if (serverVersion) {
    checkServerVersion(serverVersion);
  }

  const data = await response.json();

  if (!response.ok) {
    if (response.status === 401 && window.location.pathname !== '/login' && url !== '/login') {
      window.location.href = '/login';
    }
    const error = new Error(data.error || 'Request failed');
    error.status = response.status;
    throw error;
  }

  return data;
}

export const api = {
  login: (username, password) =>
    request('/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  logout: () =>
    request('/logout', { method: 'POST' }),

  me: () => request('/me'),

  getLineIds: (page = 1, limit = 20, search = '') => {
    const params = new URLSearchParams({ page, limit });
    if (search) params.set('search', search);
    return request(`/lineid?${params}`);
  },

  getLineIdsToday: (date = '', search = '') => {
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    if (search) params.set('search', search);
    return request(`/lineid/today?${params}`);
  },

  updateLineIdPhone: (id, phone) =>
    request(`/lineid/${id}/phone`, {
      method: 'PUT',
      body: JSON.stringify({ phone }),
    }),

  createTelemedLink: (hn, cid, patient_name, channel = 'line') =>
    request('/create-link', {
      method: 'POST',
      body: JSON.stringify({ hn, cid, patient_name, channel }),
    }),

  // Admin user management
  getAdminUsers: () => request('/admin-users'),

  addAdminUser: (username, display_name, role) =>
    request('/admin-users', {
      method: 'POST',
      body: JSON.stringify({ username, display_name, role }),
    }),

  updateAdminUser: (id, updates) =>
    request(`/admin-users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),

  deleteAdminUser: (id) =>
    request(`/admin-users/${id}`, { method: 'DELETE' }),

  searchOpdUser: (q) => {
    const params = new URLSearchParams({ q });
    return request(`/admin-users/search-opduser?${params}`);
  },

  getTelemedCasesWithDoctor: (date) => {
    const params = new URLSearchParams({ date });
    return request(`/telemed-cases/visit-with-doctor?${params}`);
  },

  getTelemedCasesNoDoctor: (date) => {
    const params = new URLSearchParams({ date });
    return request(`/telemed-cases/visit-no-doctor?${params}`);
  },

  getTelemedCasesCombined: (date) => {
    const params = new URLSearchParams({ date });
    return request(`/telemed-cases/combined?${params}`);
  },

  getTelemedAppointments: (date) => {
    const params = new URLSearchParams({ date });
    return request(`/telemed-cases/appointments?${params}`);
  },

  getTelemedDashboard: (startDate, endDate) => {
    const params = new URLSearchParams({ startDate, endDate });
    return request(`/telemed-cases/dashboard?${params}`);
  },

  // Pre-screening
  getPrescreeningData: (date = '', search = '', status = '') => {
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    return request(`/prescreening?${params}`);
  },

  getPrescreeningImages: (id) => request(`/prescreening/${id}/images`),

  getCronLogs: () => request('/prescreening/logs'),

  runCronNow: () =>
    request('/prescreening/run-now', { method: 'POST' }),

  getCronSettings: () => request('/cron-settings'),

  updateCronSettings: (time) =>
    request('/cron-settings', {
      method: 'PUT',
      body: JSON.stringify({ time }),
    }),

  // Request Telemed (req_telemed)
  getRequestTelemed: ({ page = 1, limit = 20, search = '', status = '', startDate = '', endDate = '' } = {}) => {
    const params = new URLSearchParams({ page, limit });
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    return request(`/request-telemed?${params}`);
  },

  getRequestTelemedById: (id) => request(`/request-telemed/${id}`),

  receiveRequestTelemed: (id) =>
    request(`/request-telemed/${id}/receive`, { method: 'POST' }),

  approveRequestTelemed: (id, { approve, remark }) =>
    request(`/request-telemed/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ approve, remark }),
    }),

  updateDeliveryRequestTelemed: (id, { tracking_number }) =>
    request(`/request-telemed/${id}/delivery`, {
      method: 'POST',
      body: JSON.stringify({ tracking_number }),
    }),

  getPatientAppointments: (hn) =>
    request(`/request-telemed/patient-appointments/${encodeURIComponent(hn)}`),

  registerTelemedRequest: (payload) =>
    request('/request-telemed/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // System version & updates
  getSystemVersion: () => request('/system/version'),
  checkSystemUpdate: () => request('/system/check-update'),
};
