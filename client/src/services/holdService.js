import api from './api';

export const getFisherHolds = async (fisherId) => {
  const response = await api.get(`/holds/fisher/${fisherId}`);
  return response.data;
};

export const getBlockHistory = async (params) => {
  const response = await api.get('/holds', { params });
  return response.data;
};

export const createHold = async (fisherId, holdData) => {
  const response = await api.post(`/holds/fisher/${fisherId}`, holdData);
  return response.data;
};

export const releaseHold = async (holdId, releaseNotes) => {
  const response = await api.post(`/holds/${holdId}/release`, { releaseNotes });
  return response.data;
};
