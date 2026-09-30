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
    const errorMessage =
      data.error && data.error !== 'Internal server error'
        ? data.error
        : (data.message || data.error || 'Request failed');
    const error = new Error(errorMessage);
    error.status = response.status;
    error.data = data;
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

  // Dynamic Roles & Permissions
  getRoles: () => request('/roles'),
  getMenus: () => request('/roles/menus'),
  createRole: (roleData) =>
    request('/roles', {
      method: 'POST',
      body: JSON.stringify(roleData),
    }),
  updateRole: (roleKey, roleData) =>
    request(`/roles/${roleKey}`, {
      method: 'PUT',
      body: JSON.stringify(roleData),
    }),
  deleteRole: (roleKey) =>
    request(`/roles/${roleKey}`, {
      method: 'DELETE',
    }),

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
  getRequestTelemed: ({ page = 1, limit = 20, search = '', status = '', stage = '', date = '', startDate = '', endDate = '', sortBy = '', sortOrder = '' } = {}) => {
    const params = new URLSearchParams({ page, limit });
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    if (stage) params.set('stage', stage);
    if (date) params.set('date', date);
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (sortBy) params.set('sortBy', sortBy);
    if (sortOrder) params.set('sortOrder', sortOrder);
    return request(`/request-telemed?${params}`);
  },

  getRequestTelemedById: (id) => request(`/request-telemed/${id}`),

  receiveRequestTelemed: (id) =>
    request(`/request-telemed/${id}/receive`, { method: 'POST' }),

  doctorActionRequestTelemed: (id, { approve, remark }) =>
    request(`/request-telemed/${id}/doctor-action`, {
      method: 'POST',
      body: JSON.stringify({ approve, remark }),
    }),

  pharmacyActionRequestTelemed: (id, { approve, remark }) =>
    request(`/request-telemed/${id}/pharmacy-action`, {
      method: 'POST',
      body: JSON.stringify({ approve, remark }),
    }),

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

  getVisitDetail: (id) =>
    request(`/request-telemed/${id}/visit-detail`),

  getPatientAppointments: (hn) =>
    request(`/request-telemed/patient-appointments/${encodeURIComponent(hn)}`),

  registerTelemedRequest: (payload) =>
    request('/request-telemed/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Telemed Today (วันนัดจริง)
  getTelemedTodayAppointments: (params = {}) => {
    const qs = new URLSearchParams();
    if (params.date) qs.set('date', params.date);
    if (params.search) qs.set('search', params.search);
    const qStr = qs.toString();
    return request(`/telemed-today/appointments${qStr ? `?${qStr}` : ''}`);
  },

  syncTelemedTodayVn: (id) =>
    request(`/telemed-today/${id}/sync-vn`, { method: 'POST' }),

  getTelemedTodayPharmacy: (params = {}) => {
    const qs = new URLSearchParams();
    if (params.tab) qs.set('tab', params.tab);
    if (params.search) qs.set('search', params.search);
    const qStr = qs.toString();
    return request(`/telemed-today/pharmacy${qStr ? `?${qStr}` : ''}`);
  },

  getTelemedTodayDetail: (id) =>
    request(`/telemed-today/${id}/detail`),

  pharmacyDispenseTelemedToday: (id, { payType }) =>
    request(`/telemed-today/${id}/pharmacy-dispense`, {
      method: 'POST',
      body: JSON.stringify({ payType }),
    }),

  getTelemedTodayFinance: (params = {}) => {
    const qs = new URLSearchParams();
    if (params.search) qs.set('search', params.search);
    const qStr = qs.toString();
    return request(`/telemed-today/finance${qStr ? `?${qStr}` : ''}`);
  },

  financePayTelemedToday: (id, payload = {}) =>
    request(`/telemed-today/${id}/finance-pay`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  deliveryTelemedToday: (id, { tracking_number }) =>
    request(`/telemed-today/${id}/delivery`, {
      method: 'POST',
      body: JSON.stringify({ tracking_number }),
    }),

  // System version & updates
  getSystemVersion: () => request('/system/version'),
  checkSystemUpdate: () => request('/system/check-update'),
};
