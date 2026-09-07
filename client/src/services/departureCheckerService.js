import api from './api';

export const checkDeparturePdfs = async (files) => {
  const formData = new FormData();
  Array.from(files || []).forEach((file) => {
    formData.append('pdfs', file, file.name);
  });

  const response = await api.post('/departure-checker/check-pdfs', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  return response.data;
};

export default {
  checkDeparturePdfs,
};

