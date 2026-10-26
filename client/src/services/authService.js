import api from './api';

export const login = async (email, password) => {
  const response = await api.post('/auth/login', { email, password });
  return response.data;
};

export const getMe = async () => {
  const response = await api.get('/auth/me');
  return response.data;
};

export const logout = async () => {
  const response = await api.post('/auth/logout');
  return response.data;
};

export const updateProfile = async (payload) => {
  const response = await api.put('/auth/profile', payload);
  return response.data;
};

export const changePassword = async (currentPassword, newPassword) => {
  const response = await api.put('/auth/change-password', { currentPassword, newPassword });
  return response.data;
};

export const getDashboardMetrics = async () => {
  const response = await api.get('/dashboard/metrics');
  return response.data;
};
