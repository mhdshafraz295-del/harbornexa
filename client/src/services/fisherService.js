import api from './api';

export const getFishers = async (params = {}) => {
  const response = await api.get('/fishers', { params });
  return response.data;
};

export const getFisherById = async (id) => {
  const response = await api.get(`/fishers/${id}`);
  return response.data;
};

export const createFisher = async (fisherData) => {
  const response = await api.post('/fishers', fisherData);
  return response.data;
};

export const updateFisher = async (id, fisherData) => {
  const response = await api.patch(`/fishers/${id}`, fisherData);
  return response.data;
};

export const archiveFisher = async (id) => {
  const response = await api.post(`/fishers/${id}/archive`);
  return response.data;
};

export const restoreFisher = async (id) => {
  const response = await api.post(`/fishers/${id}/restore`);
  return response.data;
};
