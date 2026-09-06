import axios from 'axios';

const API_URL = '/api/clearance';

const axiosInstance = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const getFisherClearance = async (fisherId) => {
  const response = await axiosInstance.get(`/fishers/${fisherId}`);
  return response.data;
};

export const grantClearance = async (fisherId, data) => {
  const response = await axiosInstance.post(`/fishers/${fisherId}/grant`, data);
  return response.data;
};

export const getTodayClearances = async () => {
  const response = await axiosInstance.get('/today');
  return response.data;
};

export const getFisherClearanceHistory = async (fisherId) => {
  const response = await axiosInstance.get(`/fishers/${fisherId}/history`);
  return response.data;
};
