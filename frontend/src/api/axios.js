import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000/api',
});

// Attach the admin JWT (if present) to every request
api.interceptors.request.use((config) => {
  const admin = JSON.parse(localStorage.getItem('adminInfo'));
  if (admin?.token) {
    config.headers.Authorization = `Bearer ${admin.token}`;
  }
  return config;
});

export default api;
