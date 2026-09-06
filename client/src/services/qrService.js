import api from './api';

export const generateQrToken = async (fisherId) => {
  const response = await api.post(`/qr/fishers/${fisherId}/generate`);
  return response.data;
};

export const getQrStatus = async (fisherId) => {
  const response = await api.get(`/qr/fishers/${fisherId}/status`);
  return response.data;
};

export const revokeQrToken = async (fisherId) => {
  const response = await api.post(`/qr/fishers/${fisherId}/revoke`);
  return response.data;
};

export const verifyQrToken = async (token) => {
  const response = await api.post('/qr/verify', { token });
  return response.data;
};
