import api from './api';

/**
 * Helper to trigger browser file download from Blob
 */
const triggerDownload = (blobData, filename) => {
  const url = window.URL.createObjectURL(new Blob([blobData]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

export const exportService = {
  /**
   * Download Fisher Import Excel Template
   */
  async downloadImportTemplate() {
    const response = await api.get('/export/import-template', {
      responseType: 'blob',
    });
    triggerDownload(response.data, 'fisher_import_template.xlsx');
  },

  /**
   * Preview Fisher import file (Excel or CSV)
   */
  async previewFisherImport(file) {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post('/export/preview-import', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  /**
   * Confirm Fisher Import for valid rows
   */
  async confirmFisherImport(validRows) {
    const response = await api.post('/export/confirm-import', { validRows });
    return response.data;
  },

  /**
   * Download import error report for invalid rows
   */
  async downloadErrorReport(invalidRows) {
    const response = await api.post(
      '/export/error-report',
      { invalidRows },
      { responseType: 'blob' }
    );
    triggerDownload(response.data, 'fisher_import_errors.csv');
  },

  /**
   * Export Fishers (ALL matching records)
   */
  async exportFishers(params = {}) {
    const format = params.format || 'excel';
    const response = await api.get('/export/fishers', {
      params,
      responseType: 'blob',
    });
    const ext = format === 'pdf' ? 'pdf' : format === 'csv' ? 'csv' : 'xlsx';
    triggerDownload(response.data, `fishers_export_${new Date().toISOString().split('T')[0]}.${ext}`);
  },

  /**
   * Export Debt Records (ALL matching records)
   */
  async exportDebts(params = {}) {
    const format = params.format || 'excel';
    const response = await api.get('/export/debts', {
      params,
      responseType: 'blob',
    });
    const ext = format === 'pdf' ? 'pdf' : format === 'csv' ? 'csv' : 'xlsx';
    triggerDownload(response.data, `debts_export_${new Date().toISOString().split('T')[0]}.${ext}`);
  },

  /**
   * Export Payment Transactions (ALL matching records)
   */
  async exportPayments(params = {}) {
    const format = params.format || 'excel';
    const response = await api.get('/export/payments', {
      params,
      responseType: 'blob',
    });
    const ext = format === 'pdf' ? 'pdf' : format === 'csv' ? 'csv' : 'xlsx';
    triggerDownload(response.data, `payments_export_${new Date().toISOString().split('T')[0]}.${ext}`);
  },

  /**
   * Export Clearance Records (ALL matching records)
   */
  async exportClearances(params = {}) {
    const format = params.format || 'excel';
    const response = await api.get('/export/clearances', {
      params,
      responseType: 'blob',
    });
    const ext = format === 'pdf' ? 'pdf' : format === 'csv' ? 'csv' : 'xlsx';
    triggerDownload(response.data, `clearances_export_${new Date().toISOString().split('T')[0]}.${ext}`);
  },

  /**
   * Export Block / Hold History (ALL matching records)
   */
  async exportBlockHistory(params = {}) {
    const format = params.format || 'excel';
    const response = await api.get('/export/block-history', {
      params,
      responseType: 'blob',
    });
    const ext = format === 'pdf' ? 'pdf' : format === 'csv' ? 'csv' : 'xlsx';
    triggerDownload(response.data, `block_history_export_${new Date().toISOString().split('T')[0]}.${ext}`);
  },

  /**
   * Export Active Fishers (ALL matching records with effectiveStatus === CLEARED)
   */
  async exportActiveFishers(params = {}) {
    const format = params.format || 'pdf';
    const response = await api.get('/export/active-fishers', {
      params,
      responseType: 'blob',
    });
    const ext = format === 'csv' ? 'csv' : 'pdf';
    triggerDownload(response.data, `active_fishers_report_${new Date().toISOString().split('T')[0]}.${ext}`);
  },

  /**
   * Export Blocked Fishers (BCL) (ALL matching records with effectiveStatus === HOLD)
   */
  async exportBlockedFishers(params = {}) {
    const format = params.format || 'pdf';
    const response = await api.get('/export/blocked-fishers', {
      params,
      responseType: 'blob',
    });
    const ext = format === 'csv' ? 'csv' : 'pdf';
    triggerDownload(response.data, `blocked_fishers_bcl_report_${new Date().toISOString().split('T')[0]}.${ext}`);
  },
};

export default exportService;
