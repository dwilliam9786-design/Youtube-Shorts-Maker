import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API_BASE = `${BACKEND_URL}/api`;

const api = axios.create({ baseURL: API_BASE, timeout: 180000 });

export const apiClient = {
  meta: () => api.get('/meta').then((r) => r.data),
  listProjects: () => api.get('/projects').then((r) => r.data),
  getProject: (id) => api.get(`/projects/${id}`).then((r) => r.data),
  deleteProject: (id) => api.delete(`/projects/${id}`).then((r) => r.data),
  updateProject: (id, patch) => api.patch(`/projects/${id}`, patch).then((r) => r.data),
  generate: (body) => api.post('/projects/generate', body).then((r) => r.data),
  createBlank: (body) => api.post('/projects/blank', body).then((r) => r.data),
  library: (q, type = 'image') => api.get('/library/search', { params: { q, type } }).then((r) => r.data),
  startRender: (project_id) => api.post('/renders', { project_id }).then((r) => r.data),
  getRender: (job_id) => api.get(`/renders/${job_id}`).then((r) => r.data),
  listRenders: () => api.get('/renders').then((r) => r.data),
};

export const resolveMedia = (url) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  if (url.startsWith('/api/')) return `${BACKEND_URL}${url}`;
  return url;
};

export default api;
