const PdfPrinter = require('pdfmake').default || require('pdfmake');
const URLResolver = require('pdfmake/js/URLResolver').default || require('pdfmake/js/URLResolver');

// Standard fonts bundled with PDF readers
const fonts = {
  Roboto: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique',
  },
};

const printer = new PdfPrinter(fonts, null, new URLResolver());

/**
 * Formats a number as Sri Lankan Rupees (Rs. X,XXX.XX)
 * @param {number|string} amount
 * @returns {string}
 */
const formatCurrency = (amount) => {
  const num = parseFloat(amount) || 0;
  return `Rs. ${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

/**
 * Formats date string into readable format
 * @param {string|Date} dateStr
 * @returns {string}
 */
const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr);
  return d.toISOString().split('T')[0] + ' ' + d.toTimeString().split(' ')[0];
};

/**
 * Generates a PDF buffer for reports
 * @param {Object} params
 * @param {string} params.title - Main report title
 * @param {string} [params.subtitle] - Optional subtitle
 * @param {string} [params.filterText] - Summary of applied filters
 * @param {Array<{header: string, key: string, width?: string|number, align?: string, format?: string}>} params.columns
 * @param {Array<Object>} params.data - Table data rows
 * @param {Object} [params.summaryStats] - Summary totals to show above/below table
 * @returns {Promise<Buffer>}
 */
const generatePdfReport = async ({
  title = 'OFFICIAL HARBOR REPORT',
  subtitle = '',
  filterText = '',
  columns = [],
  data = [],
  summaryStats = null,
}) => {
  return new Promise((resolve, reject) => {
    try {
      const generatedAt = new Date().toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'medium',
      });

      // Build Table Headers
      const tableHeaderRow = columns.map((col) => ({
        text: col.header.toUpperCase(),
        style: 'tableHeader',
        alignment: col.align || 'left',
      }));

      // Build Table Rows
      const tableBodyRows = data.map((row, index) => {
        return columns.map((col) => {
          let val = row[col.key];
          if (val === undefined || val === null) val = '-';

          if (col.format === 'currency') {
            val = formatCurrency(val);
          } else if (col.format === 'date') {
            val = formatDate(val);
          } else if (typeof val === 'boolean') {
            val = val ? 'YES' : 'NO';
          } else {
            val = String(val);
          }

          return {
            text: val,
            style: index % 2 === 0 ? 'tableRowEven' : 'tableRowOdd',
            alignment: col.align || 'left',
          };
        });
      });

      // Table widths definition
      const colWidths = columns.map((col) => col.width || '*');

      // Header block content
      const docDefinition = {
        pageSize: 'A4',
        pageOrientation: 'landscape',
        pageMargins: [40, 80, 40, 50],
        header: (currentPage, pageCount) => {
          return {
            margin: [40, 20, 40, 0],
            columns: [
              {
                stack: [
                  { text: 'VALACHCHENAI HARBOR FISHER CLEARANCE SYSTEM', style: 'docHeaderMain' },
                  { text: title.toUpperCase(), style: 'docHeaderSub' },
                  subtitle ? { text: subtitle, style: 'docHeaderFilter' } : null,
                  filterText ? { text: `Applied Filters: ${filterText}`, style: 'docHeaderFilter' } : null,
                ].filter(Boolean),
              },
              {
                stack: [
                  { text: `Generated: ${generatedAt}`, alignment: 'right', style: 'metaText' },
                  { text: `Total Records: ${data.length}`, alignment: 'right', style: 'metaTextBold' },
                ],
              },
            ],
          };
        },
        footer: (currentPage, pageCount) => {
          return {
            margin: [40, 15, 40, 0],
            columns: [
              {
                text: 'Valachchenai Harbor Management System — Official & Confidential Document',
                style: 'footerText',
              },
              {
                text: `Page ${currentPage} of ${pageCount}`,
                alignment: 'right',
                style: 'footerText',
              },
            ],
          };
        },
        content: [],
        styles: {
          docHeaderMain: { fontSize: 13, bold: true, color: '#0f172a' },
          docHeaderSub: { fontSize: 11, bold: true, color: '#0284c7', margin: [0, 2, 0, 2] },
          docHeaderFilter: { fontSize: 9, italic: true, color: '#475569' },
          metaText: { fontSize: 9, color: '#64748b' },
          metaTextBold: { fontSize: 9, bold: true, color: '#334155' },
          footerText: { fontSize: 8, color: '#94a3b8' },
          tableHeader: {
            bold: true,
            fontSize: 9,
            color: '#ffffff',
            fillColor: '#1e293b',
            margin: [4, 6, 4, 6],
          },
          tableRowEven: {
            fontSize: 8.5,
            color: '#1e293b',
            fillColor: '#f8fafc',
            margin: [4, 5, 4, 5],
          },
          tableRowOdd: {
            fontSize: 8.5,
            color: '#1e293b',
            fillColor: '#ffffff',
            margin: [4, 5, 4, 5],
          },
          summaryBox: {
            margin: [0, 0, 0, 10],
            padding: 8,
            fillColor: '#f1f5f9',
          },
          summaryTitle: { fontSize: 10, bold: true, color: '#0f172a' },
          summaryValue: { fontSize: 9, color: '#334155' },
        },
        defaultStyle: {
          font: 'Roboto',
        },
      };

      // If summary statistics are provided
      if (summaryStats && Object.keys(summaryStats).length > 0) {
        const statsCols = Object.entries(summaryStats).map(([key, val]) => ({
          stack: [
            { text: key.toUpperCase(), style: 'summaryTitle' },
            {
              text: typeof val === 'number' && key.toLowerCase().includes('amount') ? formatCurrency(val) : String(val),
              style: 'summaryValue',
            },
          ],
        }));

        docDefinition.content.push({
          style: 'summaryBox',
          columns: statsCols,
        });
      }

      // Add main data table
      docDefinition.content.push({
        table: {
          headerRows: 1,
          widths: colWidths,
          body: [tableHeaderRow, ...tableBodyRows],
        },
        layout: {
          hLineWidth: (i, node) => (i === 0 || i === node.table.body.length ? 1 : 0.5),
          vLineWidth: () => 0,
          hLineColor: (i, node) => (i === 0 || i === 1 ? '#0f172a' : '#cbd5e1'),
        },
      });

      printer.createPdfKitDocument(docDefinition).then((pdfDoc) => {
        const chunks = [];
        pdfDoc.on('data', (chunk) => chunks.push(chunk));
        pdfDoc.on('end', () => {
          const result = Buffer.concat(chunks);
          resolve(result);
        });
        pdfDoc.on('error', (err) => reject(err));
        pdfDoc.end();
      }).catch(reject);
    } catch (err) {
      reject(err);
    }
  });
};

module.exports = {
  generatePdfReport,
  formatCurrency,
  formatDate,
};
