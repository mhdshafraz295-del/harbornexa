import api from './api';

export const getDebts = async (params = {}) => {
  const response = await api.get('/debts', { params });
  return response.data;
};

export const getFisherFinancialInfo = async (fisherId) => {
  const response = await api.get(`/debts/fisher/${fisherId}`);
  return response.data;
};

export const createDebt = async (fisherId, debtData) => {
  const response = await api.post(`/debts/fisher/${fisherId}`, debtData);
  return response.data;
};

export const updateDebt = async (id, debtData) => {
  const response = await api.patch(`/debts/${id}`, debtData);
  return response.data;
};

export const cancelDebt = async (id, cancellationReason) => {
  const response = await api.post(`/debts/${id}/cancel`, { cancellationReason });
  return response.data;
};

export const recordPayment = async (debtId, paymentData) => {
  const response = await api.post(`/debts/${debtId}/payments`, paymentData);
  return response.data;
};

export const reversePayment = async (paymentId, reversalReason) => {
  const response = await api.post(`/debts/payments/${paymentId}/reverse`, { reversalReason });
  return response.data;
};
