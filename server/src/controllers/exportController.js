const xlsx = require('xlsx');
const multer = require('multer');
const db = require('../config/db');
const { validateSriLankanNIC, normalizeSriLankanPhone } = require('../utils/validation');
const { getFisherClearanceStatus } = require('../services/financialService');
const { logAudit } = require('../services/auditService');
const { generatePdfReport } = require('../utils/pdfGenerator');

// Multer in-memory storage for import files
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

/**
 * Helper to normalize object keys from uploaded spreadsheet
 */
const normalizeRowKeys = (row) => {
  const normalized = {};
  for (const [key, value] of Object.entries(row)) {
    const cleanKey = key.toString().trim().toLowerCase().replace(/[\s_\-\.]+/g, '');
    if (['fullname', 'name', 'fishername', 'full_name'].includes(cleanKey)) {
      normalized.full_name = value;
    } else if (['nic', 'nicnumber', 'nationalid'].includes(cleanKey)) {
      normalized.nic = value;
    } else if (['phone', 'phonenumber', 'mobile', 'contact'].includes(cleanKey)) {
      normalized.phone = value;
    } else if (['boatno', 'boatnumber', 'boatname', 'boatregistrationnumber', 'boat'].includes(cleanKey)) {
      normalized.boat_no = value;
    } else if (['address', 'location'].includes(cleanKey)) {
      normalized.address = value;
    } else if (['status', 'basestatus'].includes(cleanKey)) {
      normalized.status = value;
    } else if (['notes', 'remarks', 'note'].includes(cleanKey)) {
      normalized.notes = value;
    }
  }
  return normalized;
};

/**
 * Helper to format currency for export files
 */
const fmtCurrency = (val) => {
  const num = parseFloat(val) || 0;
  return `Rs. ${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

/**
 * Helper to format dates for export files
 */
const fmtDate = (val) => {
  if (!val) return '-';
  const d = new Date(val);
  if (isNaN(d.getTime())) return String(val);
  return d.toISOString().split('T')[0] + ' ' + d.toTimeString().split(' ')[0];
};

/**
 * Helper to escape single CSV cell and force text formatting for NIC / Phone in Excel
 */
const escapeCsvCell = (key, val) => {
  if (val === null || val === undefined) return '';
  const str = String(val);
  const keyLower = String(key).toLowerCase();

  const isNic = keyLower === 'nic' || keyLower.includes('nic');
  const isPhone = keyLower.includes('phone') || keyLower.includes('mobile') || keyLower.includes('contact');

  // Excel text force for NIC & Phone so Excel never formats them as scientific notation (2.0012E+11) or strips leading +
  if ((isNic || isPhone) && str !== '-' && str.trim() !== '') {
    return `="${str.replace(/"/g, '""')}"`;
  }

  // Standard CSV escaping if contains comma, quote, or newline
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

/**
 * Custom robust CSV generator with single UTF-8 BOM, strict text escaping for Excel, and zero extra columns
 */
const generateCsvContent = (data) => {
  if (!data || !Array.isArray(data) || data.length === 0) {
    return '\uFEFF';
  }
  const headers = Object.keys(data[0]);
  const headerRow = headers
    .map((h) => (/[",\r\n]/.test(h) ? `"${h.replace(/"/g, '""')}"` : h))
    .join(',');

  const rows = data.map((row) =>
    headers.map((h) => escapeCsvCell(h, row[h])).join(',')
  );

  return '\uFEFF' + [headerRow, ...rows].join('\r\n');
};

/**
 * Sends tabular data as Excel (.xlsx), CSV (.csv with UTF-8 BOM), or PDF
 */
const sendExportResponse = async (res, { format = 'excel', filenamePrefix = 'export', pdfTitle, pdfColumns, data, summaryStats, filterText }) => {
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `${filenamePrefix}_${timestamp}`;

  if (format === 'pdf') {
    const pdfBuffer = await generatePdfReport({
      title: pdfTitle,
      filterText,
      columns: pdfColumns,
      data,
      summaryStats,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
    return res.send(pdfBuffer);
  }

  if (format === 'csv') {
    const csvContent = generateCsvContent(data);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
    return res.send(Buffer.from(csvContent, 'utf-8'));
  }

  // Default: Excel (.xlsx)
  const worksheet = xlsx.utils.json_to_sheet(data);
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, 'Data');
  const excelBuffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
  return res.send(excelBuffer);
};

// ==========================================
// 1. IMPORT ENDPOINTS
// ==========================================

/**
 * GET /api/export/import-template
 * Download Fisher Import Excel Template
 */
const downloadTemplate = async (req, res, next) => {
  try {
    const templateData = [
      {
        'Full Name': 'K. Perera',
        NIC: '851234567V',
        'Phone Number': '0771234567',
        'Boat Number': 'BAL-1024',
        Address: 'Main St, Valachchenai',
        Status: 'ACTIVE',
        Notes: 'Regular harbor user',
      },
      {
        'Full Name': 'M. Mohamed',
        NIC: '199012345678',
        'Phone Number': '0719876543',
        'Boat Number': 'BAL-2048',
        Address: 'Harbor Rd, Valachchenai',
        Status: 'ACTIVE',
        Notes: '',
      },
    ];

    const worksheet = xlsx.utils.json_to_sheet(templateData);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Fisher Import Template');
    const excelBuffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="fisher_import_template.xlsx"');
    return res.send(excelBuffer);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/export/preview-import
 * Upload and validate Fisher Excel/CSV file before final import
 */
const previewFisherImport = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please upload an Excel (.xlsx/.xls) or CSV file.' });
    }

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return res.status(400).json({ success: false, message: 'Uploaded spreadsheet is empty.' });
    }

    const rawRows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
    if (rawRows.length === 0) {
      return res.status(400).json({ success: false, message: 'No data rows found in uploaded file.' });
    }

    // Extract all NICs to check existing DB duplicates in one batch query
    const extractedNics = [];
    const normalizedRowList = [];

    rawRows.forEach((row, index) => {
      const norm = normalizeRowKeys(row);
      const rawNic = norm.nic ? String(norm.nic).trim() : '';
      if (rawNic) {
        extractedNics.push(rawNic.toUpperCase());
      }
      normalizedRowList.push({ rowIndex: index + 2, rawData: row, normData: norm });
    });

    let existingDbNicSet = new Set();
    if (extractedNics.length > 0) {
      const placeholders = extractedNics.map(() => '?').join(',');
      const [existingRows] = await db.query(`SELECT nic FROM fishers WHERE nic IN (${placeholders})`, extractedNics);
      existingDbNicSet = new Set(existingRows.map((r) => r.nic.toUpperCase()));
    }

    const seenNicsInFile = new Set();
    const previewRows = [];
    let validCount = 0;
    let invalidCount = 0;
    let duplicateCount = 0;

    for (const item of normalizedRowList) {
      const { rowIndex, rawData, normData } = item;
      const errors = [];
      let isDuplicate = false;

      // 1. Full Name
      const fullName = normData.full_name ? String(normData.full_name).trim() : '';
      if (!fullName) {
        errors.push('Full Name is required');
      }

      // 2. NIC Validation
      const rawNic = normData.nic ? String(normData.nic).trim() : '';
      let normalizedNic = null;
      if (!rawNic) {
        errors.push('NIC is required');
      } else {
        const nicVal = validateSriLankanNIC(rawNic);
        if (!nicVal.isValid) {
          errors.push(nicVal.error);
        } else {
          normalizedNic = nicVal.normalizedNic;
          if (existingDbNicSet.has(normalizedNic)) {
            isDuplicate = true;
            errors.push('NIC already exists in database');
          } else if (seenNicsInFile.has(normalizedNic)) {
            isDuplicate = true;
            errors.push('Duplicate NIC within uploaded file');
          } else {
            seenNicsInFile.add(normalizedNic);
          }
        }
      }

      // 3. Phone Validation
      const rawPhone = normData.phone ? String(normData.phone).trim() : '';
      let normalizedPhone = null;
      if (rawPhone) {
        const phoneVal = normalizeSriLankanPhone(rawPhone);
        if (!phoneVal.isValid) {
          errors.push(phoneVal.error);
        } else {
          normalizedPhone = phoneVal.normalizedPhone;
        }
      }

      // 4. Status Validation
      const rawStatus = normData.status ? String(normData.status).trim().toUpperCase() : 'ACTIVE';
      const validStatus = ['ACTIVE', 'BLOCKED', 'PENDING'].includes(rawStatus) ? rawStatus : 'ACTIVE';

      // 5. Final Row Status
      let rowStatus = 'VALID';
      if (errors.length > 0) {
        if (isDuplicate) {
          rowStatus = 'DUPLICATE';
          duplicateCount++;
        } else {
          rowStatus = 'INVALID';
          invalidCount++;
        }
      } else {
        validCount++;
      }

      previewRows.push({
        rowIndex,
        rawData,
        status: rowStatus,
        errors,
        validatedData: {
          full_name: fullName,
          nic: normalizedNic,
          phone: normalizedPhone,
          boat_no: normData.boat_no ? String(normData.boat_no).trim() : null,
          address: normData.address ? String(normData.address).trim() : null,
          notes: normData.notes ? String(normData.notes).trim() : null,
          status: validStatus,
        },
      });
    }

    return res.status(200).json({
      success: true,
      totalRows: rawRows.length,
      validCount,
      invalidCount,
      duplicateCount,
      previewRows,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/export/confirm-import
 * Batch insert valid fishers with transaction-safe Fisher ID sequence increment
 */
const confirmFisherImport = async (req, res, next) => {
  let connection;
  try {
    const { validRows } = req.body;
    if (!Array.isArray(validRows) || validRows.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid rows submitted for import.' });
    }

    connection = await db.getConnection();
    await connection.beginTransaction();

    // Lock sequence row for transaction safety
    const [seqRows] = await connection.query(
      "SELECT next_value FROM system_sequences WHERE sequence_name = 'FISHER' FOR UPDATE"
    );

    let startVal = 1;
    if (seqRows.length === 0) {
      await connection.query("INSERT INTO system_sequences (sequence_name, next_value) VALUES ('FISHER', 1)");
      startVal = 1;
    } else {
      startVal = seqRows[0].next_value;
    }

    const insertedFishers = [];
    let currentSeq = startVal;

    for (const row of validRows) {
      const fisherIdNum = currentSeq++;
      const formattedFisherId = `FIS-${String(fisherIdNum).padStart(6, '0')}`;

      const [insertResult] = await connection.query(
        `INSERT INTO fishers (fisher_id, full_name, nic, phone, boat_no, address, notes, status, created_by_admin_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          formattedFisherId,
          row.full_name,
          row.nic,
          row.phone || null,
          row.boat_no || null,
          row.address || null,
          row.notes || null,
          row.status || 'ACTIVE',
          req.admin?.id || null,
        ]
      );

      insertedFishers.push({
        id: insertResult.insertId,
        fisher_id: formattedFisherId,
        full_name: row.full_name,
        nic: row.nic,
      });
    }

    // Update system sequence to new next value
    await connection.query("UPDATE system_sequences SET next_value = ? WHERE sequence_name = 'FISHER'", [currentSeq]);

    await connection.commit();
    connection.release();
    connection = null;

    // Log Audit
    await logAudit({
      adminId: req.admin?.id || null,
      action: 'FISHER_IMPORT',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: {
        importedCount: validRows.length,
        firstFisherId: insertedFishers[0]?.fisher_id,
        lastFisherId: insertedFishers[insertedFishers.length - 1]?.fisher_id,
      },
    });

    return res.status(200).json({
      success: true,
      count: validRows.length,
      message: `Successfully imported ${validRows.length} fishers into harbor system.`,
      importedFishers: insertedFishers,
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
      connection.release();
    }
    next(error);
  }
};

/**
 * POST /api/export/error-report
 * Generate CSV/Excel error log of invalid rows from import preview
 */
const downloadImportErrorReport = async (req, res, next) => {
  try {
    const { invalidRows = [] } = req.body;

    const reportData = invalidRows.map((r) => ({
      'Row Number': r.rowIndex,
      'Full Name': r.rawData?.['Full Name'] || r.rawData?.['full_name'] || r.rawData?.['Name'] || '',
      NIC: r.rawData?.['NIC'] || r.rawData?.['nic'] || '',
      Phone: r.rawData?.['Phone Number'] || r.rawData?.['phone'] || '',
      'Boat Number': r.rawData?.['Boat Number'] || r.rawData?.['boat_no'] || '',
      Status: r.status,
      'Error Reasons': Array.isArray(r.errors) ? r.errors.join('; ') : String(r.errors || ''),
    }));

    const csvContent = generateCsvContent(reportData);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="import_error_report.csv"');
    return res.send(Buffer.from(csvContent, 'utf-8'));
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 2. EXPORT ENDPOINTS (ALL ROWS - NO PAGINATION)
// ==========================================

/**
 * GET /api/export/fishers
 * Export ALL fishers (with central effective clearance status) to Excel/CSV/PDF
 */
const exportFishers = async (req, res, next) => {
  try {
    const { format = 'excel', search = '', status = '', archiveStatus = 'ACTIVE' } = req.query;

    const whereConditions = [];
    const queryParams = [];

    if (archiveStatus === 'ARCHIVED') {
      whereConditions.push('f.is_archived = TRUE');
    } else if (archiveStatus !== 'ALL') {
      whereConditions.push('f.is_archived = FALSE');
    }

    const trimmedSearch = search.trim();
    if (trimmedSearch) {
      whereConditions.push('(f.fisher_id LIKE ? OR f.full_name LIKE ? OR f.nic LIKE ? OR f.phone LIKE ? OR f.boat_no LIKE ?)');
      const pattern = `%${trimmedSearch}%`;
      queryParams.push(pattern, pattern, pattern, pattern, pattern);
    }

    const whereSql = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const listSql = `
      SELECT f.id, f.fisher_id, f.full_name, f.nic, f.phone, f.boat_no, f.address, f.notes, f.status, f.is_archived, f.created_at
      FROM fishers f
      ${whereSql}
      ORDER BY f.id DESC
    `;

    const [rawRows] = await db.query(listSql, queryParams);

    // Enrich rows with effective clearance status
    const enrichedRows = await Promise.all(
      rawRows.map(async (row) => {
        const clearance = await getFisherClearanceStatus(row.id);
        const effectiveStatus = clearance.status === 'CLEARED' ? 'CLEARED' : clearance.status === 'HOLD' ? 'HOLD' : clearance.status;

        return {
          ...row,
          effectiveStatus,
          outstandingDebt: clearance.outstandingDebt,
        };
      })
    );

    // Apply status filter if provided
    let finalRows = enrichedRows;
    if (status) {
      const upperStatus = status.toUpperCase();
      finalRows = enrichedRows.filter(
        (r) => r.effectiveStatus.toUpperCase() === upperStatus || r.status.toUpperCase() === upperStatus
      );
    }

    // Format for output table
    const exportData = finalRows.map((r) => ({
      'Fisher ID': r.fisher_id,
      'Full Name': r.full_name,
      NIC: r.nic,
      Phone: r.phone || '-',
      'Boat Number': r.boat_no || '-',
      Address: r.address || '-',
      'Base Status': r.status,
      'Effective Clearance': r.effectiveStatus,
      'Outstanding Debt': fmtCurrency(r.outstandingDebt),
      'Created Date': fmtDate(r.created_at),
    }));

    await logAudit({
      adminId: req.admin?.id || null,
      action: 'FISHER_EXPORT',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { count: exportData.length, format, search, status },
    });

    const filterText = [
      search ? `Search: "${search}"` : null,
      status ? `Status: ${status}` : null,
      archiveStatus !== 'ACTIVE' ? `Archive: ${archiveStatus}` : null,
    ].filter(Boolean).join(' | ') || 'All Fishers';

    const pdfColumns = [
      { header: 'Fisher ID', key: 'Fisher ID', width: 65 },
      { header: 'Full Name', key: 'Full Name', width: '*' },
      { header: 'NIC', key: 'NIC', width: 75 },
      { header: 'Phone', key: 'Phone', width: 75 },
      { header: 'Boat No', key: 'Boat Number', width: 65 },
      { header: 'Base Status', key: 'Base Status', width: 60 },
      { header: 'Effective Clearance', key: 'Effective Clearance', width: 85 },
      { header: 'Outstanding Debt', key: 'Outstanding Debt', width: 90, align: 'right' },
    ];

    const totalOutstanding = finalRows.reduce((acc, r) => acc + (parseFloat(r.outstandingDebt) || 0), 0);

    return await sendExportResponse(res, {
      format,
      filenamePrefix: 'fishers_export',
      pdfTitle: 'OFFICIAL FISHER REGISTRATION REPORT',
      pdfColumns,
      data: exportData,
      summaryStats: {
        'Total Fishers': exportData.length,
        'Total Outstanding Debt': totalOutstanding,
      },
      filterText,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/export/debts
 * Export ALL debt records to Excel/CSV/PDF
 */
const exportDebts = async (req, res, next) => {
  try {
    const { format = 'excel', search = '', status = '' } = req.query;

    const whereConditions = [];
    const queryParams = [];

    const trimmedSearch = search.trim();
    if (trimmedSearch) {
      whereConditions.push('(f.fisher_id LIKE ? OR f.full_name LIKE ? OR f.nic LIKE ? OR fd.description LIKE ?)');
      const pattern = `%${trimmedSearch}%`;
      queryParams.push(pattern, pattern, pattern, pattern);
    }

    if (status) {
      whereConditions.push('fd.status = ?');
      queryParams.push(status.toUpperCase());
    }

    const whereSql = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const listSql = `
      SELECT 
        fd.id, fd.original_amount, fd.status, fd.created_at, fd.due_date, fd.description, fd.category,
        f.fisher_id, f.full_name, f.nic, f.boat_no,
        COALESCE(SUM(dp.amount), 0) AS total_paid
      FROM fisher_debts fd
      JOIN fishers f ON fd.fisher_id = f.id
      LEFT JOIN debt_payments dp ON fd.id = dp.debt_id AND dp.reversed_at IS NULL
      ${whereSql}
      GROUP BY fd.id
      ORDER BY fd.id DESC
    `;

    const [rows] = await db.query(listSql, queryParams);

    let sumOriginal = 0;
    let sumPaid = 0;
    let sumRemaining = 0;

    const exportData = rows.map((r) => {
      const orig = parseFloat(r.original_amount) || 0;
      const paid = parseFloat(r.total_paid) || 0;
      const rem = Math.max(0, orig - paid);

      sumOriginal += orig;
      sumPaid += paid;
      sumRemaining += rem;

      return {
        'Debt Code': `DEBT-${r.id}`,
        'Fisher ID': r.fisher_id,
        'Fisher Name': r.full_name,
        NIC: r.nic,
        'Boat Number': r.boat_no || '-',
        'Charge Type': r.category || r.description || 'General Charge',
        'Original Amount': fmtCurrency(orig),
        'Paid Amount': fmtCurrency(paid),
        'Remaining Balance': fmtCurrency(rem),
        Status: r.status,
        'Created Date': fmtDate(r.created_at),
        'Due Date': fmtDate(r.due_date),
      };
    });

    await logAudit({
      adminId: req.admin?.id || null,
      action: 'DEBT_EXPORT',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { count: exportData.length, format, search, status },
    });

    const filterText = [search ? `Search: "${search}"` : null, status ? `Status: ${status}` : null].filter(Boolean).join(' | ') || 'All Debt Records';

    const pdfColumns = [
      { header: 'Debt Code', key: 'Debt Code', width: 60 },
      { header: 'Fisher ID', key: 'Fisher ID', width: 60 },
      { header: 'Fisher Name', key: 'Fisher Name', width: '*' },
      { header: 'Charge Type', key: 'Charge Type', width: 75 },
      { header: 'Original', key: 'Original Amount', width: 75, align: 'right' },
      { header: 'Paid', key: 'Paid Amount', width: 75, align: 'right' },
      { header: 'Balance', key: 'Remaining Balance', width: 75, align: 'right' },
      { header: 'Status', key: 'Status', width: 55, align: 'center' },
      { header: 'Created', key: 'Created Date', width: 65 },
    ];

    return await sendExportResponse(res, {
      format,
      filenamePrefix: 'debts_export',
      pdfTitle: 'OFFICIAL FISHER DEBT REPORT',
      pdfColumns,
      data: exportData,
      summaryStats: {
        'Total Debts': exportData.length,
        'Total Original Debt': sumOriginal,
        'Total Paid Debt': sumPaid,
        'Total Outstanding Balance': sumRemaining,
      },
      filterText,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/export/payments
 * Export ALL payment transactions to Excel/CSV/PDF
 */
const exportPayments = async (req, res, next) => {
  try {
    const { format = 'excel', search = '', startDate = '', endDate = '' } = req.query;

    const whereConditions = [];
    const queryParams = [];

    const trimmedSearch = search.trim();
    if (trimmedSearch) {
      whereConditions.push('(dp.reference_no LIKE ? OR f.fisher_id LIKE ? OR f.full_name LIKE ? OR f.nic LIKE ?)');
      const pattern = `%${trimmedSearch}%`;
      queryParams.push(pattern, pattern, pattern, pattern);
    }

    if (startDate) {
      whereConditions.push('dp.created_at >= ?');
      queryParams.push(`${startDate} 00:00:00`);
    }

    if (endDate) {
      whereConditions.push('dp.created_at <= ?');
      queryParams.push(`${endDate} 23:59:59`);
    }

    const whereSql = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const listSql = `
      SELECT 
        dp.id, dp.amount, dp.payment_method, dp.reference_no, dp.created_at, dp.reversed_at, dp.reversal_reason, dp.debt_id,
        f.fisher_id, f.full_name, f.nic, f.boat_no,
        fd.category AS debt_category, fd.description AS debt_description,
        a.name AS collected_by_admin
      FROM debt_payments dp
      JOIN fishers f ON dp.fisher_id = f.id
      JOIN fisher_debts fd ON dp.debt_id = fd.id
      LEFT JOIN admins a ON dp.received_by_admin_id = a.id
      ${whereSql}
      ORDER BY dp.id DESC
    `;

    const [rows] = await db.query(listSql, queryParams);

    let sumPayments = 0;
    const exportData = rows.map((r) => {
      const amt = parseFloat(r.amount) || 0;
      if (!r.reversed_at) {
        sumPayments += amt;
      }

      return {
        'Receipt No': r.reference_no || `REC-${String(r.id).padStart(6, '0')}`,
        'Payment Date': fmtDate(r.created_at),
        'Fisher ID': r.fisher_id,
        'Fisher Name': r.full_name,
        NIC: r.nic,
        'Debt Code': `DEBT-${r.debt_id}`,
        'Charge Type': r.debt_category || r.debt_description || 'General Charge',
        'Amount Paid': fmtCurrency(amt),
        'Payment Method': r.payment_method || 'CASH',
        'Status': r.reversed_at ? 'REVERSED' : 'ACTIVE',
        'Collected By': r.collected_by_admin || 'System Admin',
        'Reversal Reason': r.reversal_reason || '-',
      };
    });

    await logAudit({
      adminId: req.admin?.id || null,
      action: 'PAYMENT_EXPORT',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { count: exportData.length, format, search, startDate, endDate },
    });

    const filterText = [
      search ? `Search: "${search}"` : null,
      startDate ? `From: ${startDate}` : null,
      endDate ? `To: ${endDate}` : null,
    ].filter(Boolean).join(' | ') || 'All Payment Records';

    const pdfColumns = [
      { header: 'Receipt No', key: 'Receipt No', width: 65 },
      { header: 'Date', key: 'Payment Date', width: 65 },
      { header: 'Fisher ID', key: 'Fisher ID', width: 60 },
      { header: 'Fisher Name', key: 'Fisher Name', width: '*' },
      { header: 'Charge Type', key: 'Charge Type', width: 75 },
      { header: 'Amount', key: 'Amount Paid', width: 75, align: 'right' },
      { header: 'Method', key: 'Payment Method', width: 55, align: 'center' },
      { header: 'Status', key: 'Status', width: 60, align: 'center' },
    ];

    return await sendExportResponse(res, {
      format,
      filenamePrefix: 'payments_export',
      pdfTitle: 'OFFICIAL HARBOR PAYMENT COLLECTION REPORT',
      pdfColumns,
      data: exportData,
      summaryStats: {
        'Total Payment Records': exportData.length,
        'Total Active Payments Collected': sumPayments,
      },
      filterText,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/export/clearances
 * Export ALL clearance history records to Excel/CSV/PDF
 */
const exportClearances = async (req, res, next) => {
  try {
    const { format = 'excel', search = '', status = '', startDate = '', endDate = '' } = req.query;

    const whereConditions = [];
    const queryParams = [];

    const trimmedSearch = search.trim();
    if (trimmedSearch) {
      whereConditions.push('(cr.clearance_no LIKE ? OR f.fisher_id LIKE ? OR f.full_name LIKE ? OR f.nic LIKE ? OR f.boat_no LIKE ?)');
      const pattern = `%${trimmedSearch}%`;
      queryParams.push(pattern, pattern, pattern, pattern, pattern);
    }

    if (startDate) {
      whereConditions.push('cr.granted_at >= ?');
      queryParams.push(`${startDate} 00:00:00`);
    }

    if (endDate) {
      whereConditions.push('cr.granted_at <= ?');
      queryParams.push(`${endDate} 23:59:59`);
    }

    const whereSql = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const listSql = `
      SELECT 
        cr.id, cr.clearance_no, cr.granted_at, cr.clearance_status, cr.notes, cr.created_at,
        f.fisher_id, f.full_name, f.nic, f.boat_no,
        a.name AS issued_by_admin
      FROM clearance_records cr
      JOIN fishers f ON cr.fisher_id = f.id
      LEFT JOIN admins a ON cr.granted_by_admin_id = a.id
      ${whereSql}
      ORDER BY cr.id DESC
    `;

    const [rows] = await db.query(listSql, queryParams);

    const exportData = rows.map((r) => ({
      'Clearance No': r.clearance_no || `CLR-${String(r.id).padStart(6, '0')}`,
      'Issued Date/Time': fmtDate(r.granted_at || r.created_at),
      'Fisher ID': r.fisher_id,
      'Fisher Name': r.full_name,
      NIC: r.nic,
      'Boat Number': r.boat_no || '-',
      Status: r.clearance_status || 'CLEARED',
      'Issued By': r.issued_by_admin || 'System Admin',
      Notes: r.notes || '-',
    }));

    await logAudit({
      adminId: req.admin?.id || null,
      action: 'CLEARANCE_EXPORT',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { count: exportData.length, format, search, status, startDate, endDate },
    });

    const filterText = [
      search ? `Search: "${search}"` : null,
      status ? `Status: ${status}` : null,
      startDate ? `From: ${startDate}` : null,
      endDate ? `To: ${endDate}` : null,
    ].filter(Boolean).join(' | ') || 'All Clearance Records';

    const pdfColumns = [
      { header: 'Clearance No', key: 'Clearance No', width: 75 },
      { header: 'Issued Date', key: 'Issued Date/Time', width: 85 },
      { header: 'Fisher ID', key: 'Fisher ID', width: 60 },
      { header: 'Fisher Name', key: 'Fisher Name', width: '*' },
      { header: 'NIC', key: 'NIC', width: 75 },
      { header: 'Boat No', key: 'Boat Number', width: 65 },
      { header: 'Status', key: 'Status', width: 65, align: 'center' },
      { header: 'Issued By', key: 'Issued By', width: 75 },
    ];

    return await sendExportResponse(res, {
      format,
      filenamePrefix: 'clearances_export',
      pdfTitle: 'OFFICIAL FISHER CLEARANCE ISSUANCE REPORT',
      pdfColumns,
      data: exportData,
      summaryStats: {
        'Total Clearances Granted': exportData.length,
      },
      filterText,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/export/block-history
 * Export ALL block/hold history records to Excel/CSV/PDF
 */
const exportBlockHistory = async (req, res, next) => {
  try {
    const { format = 'excel', search = '', status = '' } = req.query;

    const whereConditions = [];
    const queryParams = [];

    const trimmedSearch = search.trim();
    if (trimmedSearch) {
      whereConditions.push('(fh.reason_code LIKE ? OR fh.reason_text LIKE ? OR f.fisher_id LIKE ? OR f.full_name LIKE ? OR f.nic LIKE ?)');
      const pattern = `%${trimmedSearch}%`;
      queryParams.push(pattern, pattern, pattern, pattern, pattern);
    }

    if (status === 'ACTIVE') {
      whereConditions.push('fh.released_at IS NULL');
    } else if (status === 'RELEASED') {
      whereConditions.push('fh.released_at IS NOT NULL');
    }

    const whereSql = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const listSql = `
      SELECT 
        fh.id, fh.reason_code, fh.reason_text, fh.notes, fh.hold_date, fh.released_at, fh.release_notes,
        f.fisher_id, f.full_name, f.nic, f.boat_no,
        a1.name AS held_by_admin,
        a2.name AS released_by_admin
      FROM fisher_holds fh
      JOIN fishers f ON fh.fisher_id = f.id
      LEFT JOIN admins a1 ON fh.created_by_admin_id = a1.id
      LEFT JOIN admins a2 ON fh.released_by_admin_id = a2.id
      ${whereSql}
      ORDER BY fh.id DESC
    `;

    const [rows] = await db.query(listSql, queryParams);

    const exportData = rows.map((r) => ({
      'Hold ID': `HOLD-${r.id}`,
      'Hold Date': fmtDate(r.hold_date),
      'Fisher ID': r.fisher_id,
      'Fisher Name': r.full_name,
      NIC: r.nic,
      'Boat Number': r.boat_no || '-',
      'Reason Code': r.reason_code || 'MANUAL_HOLD',
      'Reason Details': r.reason_text || r.notes || 'Manual hold applied',
      'Hold Status': r.released_at ? 'RELEASED' : 'ACTIVE',
      'Held By Admin': r.held_by_admin || 'System Admin',
      'Released Date': fmtDate(r.released_at),
      'Released By Admin': r.released_by_admin || '-',
      'Release Notes': r.release_notes || '-',
    }));

    await logAudit({
      adminId: req.admin?.id || null,
      action: 'BLOCK_HISTORY_EXPORT',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { count: exportData.length, format, search, status },
    });

    const filterText = [search ? `Search: "${search}"` : null, status ? `Status: ${status}` : null].filter(Boolean).join(' | ') || 'All Block History Records';

    const pdfColumns = [
      { header: 'Hold ID', key: 'Hold ID', width: 55 },
      { header: 'Hold Date', key: 'Hold Date', width: 70 },
      { header: 'Fisher ID', key: 'Fisher ID', width: 60 },
      { header: 'Fisher Name', key: 'Fisher Name', width: '*' },
      { header: 'Reason Code', key: 'Reason Code', width: 75 },
      { header: 'Status', key: 'Hold Status', width: 60, align: 'center' },
      { header: 'Held By', key: 'Held By Admin', width: 65 },
      { header: 'Released Date', key: 'Released Date', width: 70 },
    ];

    return await sendExportResponse(res, {
      format,
      filenamePrefix: 'block_history_export',
      pdfTitle: 'OFFICIAL FISHER BLOCK / HOLD HISTORY REPORT',
      pdfColumns,
      data: exportData,
      summaryStats: {
        'Total Block Records': exportData.length,
        'Active Holds': exportData.filter((r) => r['Hold Status'] === 'ACTIVE').length,
        'Released Holds': exportData.filter((r) => r['Hold Status'] === 'RELEASED').length,
      },
      filterText,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/export/active-fishers
 * Export ALL active fishers (effectiveStatus === 'CLEARED') to PDF/CSV
 */
const exportActiveFishers = async (req, res, next) => {
  try {
    const { format = 'pdf', search = '' } = req.query;

    const whereConditions = ['f.is_archived = FALSE'];
    const queryParams = [];

    const trimmedSearch = search.trim();
    if (trimmedSearch) {
      whereConditions.push(
        '(f.fisher_id LIKE ? OR f.full_name LIKE ? OR f.nic LIKE ? OR f.phone LIKE ? OR f.boat_no LIKE ?)'
      );
      const pattern = `%${trimmedSearch}%`;
      queryParams.push(pattern, pattern, pattern, pattern, pattern);
    }

    const whereSql = `WHERE ${whereConditions.join(' AND ')}`;

    const listSql = `
      SELECT f.id, f.fisher_id, f.full_name, f.nic, f.phone, f.boat_no
      FROM fishers f
      ${whereSql}
      ORDER BY f.id ASC
    `;

    const [rawRows] = await db.query(listSql, queryParams);

    // Filter to only fishers whose central effective clearance status === 'CLEARED'
    const clearedFishers = [];
    for (const fisher of rawRows) {
      const clearance = await getFisherClearanceStatus(fisher.id);
      if (clearance.status === 'CLEARED') {
        clearedFishers.push({
          ...fisher,
          outstandingDebt: clearance.outstandingDebt,
        });
      }
    }

    const exportData = clearedFishers.map((r, index) => ({
      'No.': index + 1,
      'Fisher ID': r.fisher_id,
      'Fisher Name': r.full_name,
      NIC: r.nic,
      Phone: r.phone || '-',
      'Boat No': r.boat_no || '-',
      'Effective Status': 'CLEARED',
      'மீதிக் கடன்': fmtCurrency(r.outstandingDebt),
    }));

    await logAudit({
      adminId: req.admin?.id || null,
      action: 'ACTIVE_FISHERS_EXPORT',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { count: exportData.length, format, search },
    });

    const filterText = [
      search ? `Search: "${search}"` : null,
      'Filter: Effective Status = CLEARED',
    ].filter(Boolean).join(' | ');

    const pdfColumns = [
      { header: 'No.', key: 'No.', width: 30 },
      { header: 'Fisher ID', key: 'Fisher ID', width: 70 },
      { header: 'Fisher Name', key: 'Fisher Name', width: '*' },
      { header: 'NIC', key: 'NIC', width: 75 },
      { header: 'Phone', key: 'Phone', width: 75 },
      { header: 'Boat No', key: 'Boat No', width: 65 },
      { header: 'Effective Status', key: 'Effective Status', width: 75, align: 'center' },
      { header: 'Outstanding Debt', key: 'மீதிக் கடன்', width: 85, align: 'right' },
    ];

    return await sendExportResponse(res, {
      format: format === 'csv' ? 'csv' : 'pdf',
      filenamePrefix: 'active_fishers_report',
      pdfTitle: 'VALACHCHENAI HARBOR\nACTIVE FISHERS REPORT',
      pdfColumns,
      data: exportData,
      summaryStats: {
        'Total Active Fishers': exportData.length,
      },
      filterText,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/export/blocked-fishers
 * Export ALL blocked fishers (effectiveStatus === 'HOLD') to PDF/CSV
 */
const exportBlockedFishers = async (req, res, next) => {
  try {
    const { format = 'pdf', search = '' } = req.query;

    const whereConditions = ['f.is_archived = FALSE'];
    const queryParams = [];

    const trimmedSearch = search.trim();
    if (trimmedSearch) {
      whereConditions.push(
        '(f.fisher_id LIKE ? OR f.full_name LIKE ? OR f.nic LIKE ? OR f.phone LIKE ? OR f.boat_no LIKE ?)'
      );
      const pattern = `%${trimmedSearch}%`;
      queryParams.push(pattern, pattern, pattern, pattern, pattern);
    }

    const whereSql = `WHERE ${whereConditions.join(' AND ')}`;

    const listSql = `
      SELECT f.id, f.fisher_id, f.full_name, f.nic, f.phone, f.boat_no
      FROM fishers f
      ${whereSql}
      ORDER BY f.id ASC
    `;

    const [rawRows] = await db.query(listSql, queryParams);

    // Filter to only fishers whose central effective clearance status === 'HOLD'
    const blockedFishers = [];
    for (const fisher of rawRows) {
      const clearance = await getFisherClearanceStatus(fisher.id);
      if (clearance.status === 'HOLD') {
        const reasonLabels = (clearance.reasons || [])
          .map((r) => r.label)
          .filter(Boolean)
          .join(', ');

        blockedFishers.push({
          ...fisher,
          outstandingDebt: clearance.outstandingDebt,
          blockReasons: reasonLabels || 'Hold Pending Investigation',
        });
      }
    }

    const exportData = blockedFishers.map((r, index) => ({
      'No.': index + 1,
      'Fisher ID': r.fisher_id,
      'Fisher Name': r.full_name,
      NIC: r.nic,
      Phone: r.phone || '-',
      'Boat No': r.boat_no || '-',
      'Effective Status': 'HOLD',
      'Block Reason(s)': r.blockReasons,
      'மீதிக் கடன்': fmtCurrency(r.outstandingDebt),
    }));

    await logAudit({
      adminId: req.admin?.id || null,
      action: 'BLOCKED_FISHERS_EXPORT',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { count: exportData.length, format, search },
    });

    const filterText = [
      search ? `Search: "${search}"` : null,
      'Filter: Effective Status = HOLD',
    ].filter(Boolean).join(' | ');

    const pdfColumns = [
      { header: 'No.', key: 'No.', width: 28 },
      { header: 'Fisher ID', key: 'Fisher ID', width: 60 },
      { header: 'Fisher Name', key: 'Fisher Name', width: 110 },
      { header: 'NIC', key: 'NIC', width: 70 },
      { header: 'Phone', key: 'Phone', width: 65 },
      { header: 'Boat No', key: 'Boat No', width: 55 },
      { header: 'Effective Status', key: 'Effective Status', width: 55, align: 'center' },
      { header: 'Block Reason(s)', key: 'Block Reason(s)', width: '*', align: 'left' },
      { header: 'Outstanding Debt', key: 'மீதிக் கடன்', width: 75, align: 'right' },
    ];

    return await sendExportResponse(res, {
      format: format === 'csv' ? 'csv' : 'pdf',
      filenamePrefix: 'blocked_fishers_bcl_report',
      pdfTitle: 'VALACHCHENAI HARBOR\nBLOCKED FISHERS (BCL) REPORT',
      pdfColumns,
      data: exportData,
      summaryStats: {
        'Total Blocked Fishers (BCL)': exportData.length,
      },
      filterText,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  upload,
  downloadTemplate,
  previewFisherImport,
  confirmFisherImport,
  downloadImportErrorReport,
  exportFishers,
  exportDebts,
  exportPayments,
  exportClearances,
  exportBlockHistory,
  exportActiveFishers,
  exportBlockedFishers,
};
