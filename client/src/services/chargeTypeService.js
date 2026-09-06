import axios from 'axios';

const API_URL = '/api/charge-types';

const axiosInstance = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const getChargeTypes = async (params = {}) => {
  const response = await axiosInstance.get('/', { params });
  return response.data;
};

export const createChargeType = async (data) => {
  const response = await axiosInstance.post('/', data);
  return response.data;
};

export const updateChargeType = async (id, data) => {
  const response = await axiosInstance.patch(`/${id}`, data);
  return response.data;
};

export const activateChargeType = async (id) => {
  const response = await axiosInstance.post(`/${id}/activate`);
  return response.data;
};

export const deactivateChargeType = async (id) => {
  const response = await axiosInstance.post(`/${id}/deactivate`);
  return response.data;
};
