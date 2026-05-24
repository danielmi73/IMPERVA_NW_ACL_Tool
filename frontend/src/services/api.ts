import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT from localStorage on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('ddos_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 globally — redirect to login
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !err.config.url?.includes('/auth/login')) {
      localStorage.removeItem('ddos_token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

/* ---- Auth ---- */
export const authAPI = {
  getStatus: () => api.get('/auth/status'),
  setupPassword: (password: string) => api.post('/auth/setup/password', { password }),
  login: (password: string) => api.post('/auth/login', { password }),
  changePassword: (current_password: string, new_password: string) =>
    api.post('/auth/change-password', { current_password, new_password }),
};

/* ---- Admin ---- */
export const adminAPI = {
  getSettings: () => api.get('/admin/settings'),
  saveCredentials: (data: { api_id: string; api_key: string; account_id: string; api_base_url?: string }) =>
    api.post('/admin/credentials', data),
  completeSetup: () => api.post('/admin/setup/complete'),
  testConnection: () => api.post('/admin/test-connection'),
  setPollInterval: (seconds: number) => api.post('/admin/poll-interval', { seconds }),
  getACLPolicies: (sync = false) => api.get(`/admin/acl-policies?sync=${sync}`),
  updateACLDescription: (policyId: string, description: string) =>
    api.patch(`/admin/acl-policies/${policyId}`, { description }),
  saveSMTP: (data: {
    smtp_host: string; smtp_port: number; smtp_user: string; smtp_password: string;
    smtp_from_address: string; smtp_encryption: string;
    smtp_default_subject?: string; smtp_default_body?: string;
  }) => api.post('/admin/smtp', data),
  testSMTP: () => api.post('/admin/smtp/test'),
};

/* ---- Prefixes ---- */
export const prefixAPI = {
  list: () => api.get('/prefixes/'),
  get: (id: number) => api.get(`/prefixes/${id}`),
  update: (id: number, data: Record<string, any>) => api.patch(`/prefixes/${id}`, data),
  sync: () => api.post('/prefixes/sync'),
  attackHistory: (id: number) => api.get(`/prefixes/${id}/attack-history`),
};

/* ---- Customers ---- */
export const customerAPI = {
  list: () => api.get('/customers/'),
  get: (id: number) => api.get(`/customers/${id}`),
  create: (data: { name: string; email?: string }) => api.post('/customers/', data),
  update: (id: number, data: Record<string, any>) => api.patch(`/customers/${id}`, data),
  delete: (id: number) => api.delete(`/customers/${id}`),
};

export default api;
