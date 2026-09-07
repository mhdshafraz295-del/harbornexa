const multer = require('multer');
const crypto = require('crypto');
const pdfParse = require('pdf-parse');
const { createWorker } = require('tesseract.js');
const prisma = require('../config/prismaClient');
const { getFisherClearanceStatus } = require('../services/financialService');

// Polyfill DOMMatrix for PDF processing on modern Node environments if missing
if (typeof global.DOMMatrix === 'undefined') {
  global.DOMMatrix = class DOMMatrix {
    constructor() {
      this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0;
    }
  };
}

// Multer memory storage configuration (Max 5 files, 10MB per file)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB limit
    files: 5, // Maximum 5 files per batch
  },
  fileFilter: (req, file, cb) => {
    const isPdfMime = file.mimetype === 'application/pdf' || file.mimetype === 'application/x-pdf';
    const isPdfExt = file.originalname && file.originalname.toLowerCase().endsWith('.pdf');
    if (isPdfMime || isPdfExt) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type for "${file.originalname}". Only PDF files are allowed.`), false);
    }
  },
});

/**
 * Normalizes OCR and raw text noise (e.g. "2005 2700 1738" -> "200527001738", "123456789 v" -> "123456789V")
 */
function cleanOcrTextNoise(text) {
  if (!text) return '';
  return text
    .replace(/(\b\d{4})\s+(\d{4})\s+(\d{4}\b)/g, '$1$2$3')
    .replace(/(\b\d{3})\s+(\d{3})\s+(\d{3})\s+(\d{3}\b)/g, '$1$2$3$4')
    .replace(/(\b\d{9})\s+([vVxX]\b)/g, '$1$2');
}

/**
 * Helper to find valid Sri Lankan NIC numbers in a given string snippet
 */
function findNicsInSnippet(text) {
  const nics = new Set();
  if (!text) return Array.from(nics);

  // 1. Old Sri Lankan NIC pattern: 9 digits + V/X
  const oldNicRegex = /\b\d{9}[vVxX]\b/g;
  let match;
  while ((match = oldNicRegex.exec(text)) !== null) {
    nics.add(match[0].toUpperCase());
  }

  // 2. New Sri Lankan NIC pattern: 12 digits starting with 19 or 20
  const newNicRegex = /\b(?:19|20)\d{10}\b/g;
  while ((match = newNicRegex.exec(text)) !== null) {
    nics.add(match[0]);
  }

  return Array.from(nics);
}

/**
 * Context-aware NIC extractor targeting ALL Skipper and Crew NICs in DFAR Departure Manifests.
 * Preserves every extracted Skipper + Crew NIC (both matched and NOT_FOUND).
 * Strictly ignores "Departure Approved By" officer NIC, vessel registration numbers, and phone numbers.
 */
function extractFisherNicsFromText(rawText) {
  if (!rawText || typeof rawText !== 'string') return [];

  const cleanedText = cleanOcrTextNoise(rawText);
  const foundNics = new Set();

  // Cut text before officer approval section to prevent extracting officer NICs
  const textBeforeApproval = cleanedText.split(
    /departure approved by|approved by officer|issuing officer|authorized officer|officer nic/i
  )[0];

  const lines = textBeforeApproval.split(/\r?\n/);
  let afterHeaderSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const lower = line.toLowerCase();

    // 1. Check for Skipper section / label
    if (lower.includes('skipper')) {
      afterHeaderSection = true;
      const textToSearch = line + ' ' + (lines[i + 1] || '');
      const skipperNics = findNicsInSnippet(textToSearch);
      skipperNics.forEach((nic) => foundNics.add(nic));
      continue;
    }

    // 2. Entering Crew Details section
    if (
      lower.includes('detail of crew members') ||
      lower.includes('crew members') ||
      lower.includes('crew details') ||
      lower.includes('crew list') ||
      lower.includes('fisher crew') ||
      lower.includes('crew')
    ) {
      afterHeaderSection = true;
    }

    // 3. Extract NICs if past Skipper/Header section or line has Crew/Fisher/Member context
    if (afterHeaderSection || lower.includes('crew') || lower.includes('fisher') || lower.includes('member') || lower.includes('skipper')) {
      const lineNics = findNicsInSnippet(line);
      lineNics.forEach((nic) => foundNics.add(nic));
    }
  }

  // 4. Fallback: If section markers were incomplete, extract all valid NICs from textBeforeApproval
  if (foundNics.size === 0) {
    const fallbackNics = findNicsInSnippet(textBeforeApproval);
    fallbackNics.forEach((nic) => foundNics.add(nic));
  }

  return Array.from(foundNics);
}

/**
 * Extracts raw image stream buffers (JPEG/PNG) embedded inside a PDF buffer
 */
function extractImageBuffersFromPdf(pdfBuffer) {
  const images = [];
  const str = pdfBuffer.toString('latin1');
  const streamRegex = /stream[\r\n]+([\s\S]*?)endstream/g;
  let match;

  while ((match = streamRegex.exec(str)) !== null) {
    const precedingContext = str.substring(Math.max(0, match.index - 500), match.index);
    const isImage = precedingContext.includes('/Subtype /Image') || precedingContext.includes('/Subtype/Image') || precedingContext.includes('/DCTDecode');

    if (isImage) {
      const streamBufIndex = pdfBuffer.indexOf(Buffer.from('stream'), Math.max(0, match.index - 20));
      if (streamBufIndex !== -1) {
        let dataStart = streamBufIndex + 6;
        if (pdfBuffer[dataStart] === 0x0a) dataStart++;
        else if (pdfBuffer[dataStart] === 0x0d && pdfBuffer[dataStart + 1] === 0x0a) dataStart += 2;

        const dataEnd = pdfBuffer.indexOf(Buffer.from('endstream'), dataStart);
        if (dataEnd > dataStart) {
          const imgBuffer = pdfBuffer.slice(dataStart, dataEnd);
          if (imgBuffer[0] === 0xff && imgBuffer[1] === 0xd8) {
            images.push({ type: 'jpeg', buffer: imgBuffer });
          } else {
            images.push({ type: 'raw', buffer: imgBuffer });
          }
        }
      }
    }
  }

  return images;
}

/**
 * Performs OCR fallback using Tesseract.js on embedded image buffers or PDF text stream
 */
async function performOcrFallback(fileBuffer) {
  const extractedNics = new Set();
  let worker = null;

  try {
    const images = extractImageBuffersFromPdf(fileBuffer);
    if (images.length > 0) {
      worker = await createWorker('eng');
      for (const img of images) {
        const ocrResult = await worker.recognize(img.buffer);
        const nics = extractFisherNicsFromText(ocrResult.data?.text || '');
        nics.forEach((nic) => extractedNics.add(nic));
      }
    }
  } catch (err) {
    console.warn('⚠️ OCR processing fallback warning:', err.message);
  } finally {
    if (worker) {
      await worker.terminate().catch(() => {});
    }
  }

  return Array.from(extractedNics);
}

/**
 * Extract NICs from PDF buffer with OCR fallback order:
 * 1. Normal PDF text extraction (pdf-parse)
 * 2. OCR Fallback if text layer yields 0 NICs
 */
async function extractNicsFromPdfBufferWithFallback(fileBuffer) {
  // Step 1: Normal PDF text extraction first
  try {
    let rawText = '';
    if (pdfParse && typeof pdfParse.PDFParse === 'function') {
      const parser = new pdfParse.PDFParse({ data: fileBuffer });
      const parsed = await parser.getText();
      rawText = parsed.text || '';
    } else if (typeof pdfParse === 'function') {
      const data = await pdfParse(fileBuffer);
      rawText = data.text || '';
    }

    const nicsFromText = extractFisherNicsFromText(rawText);
    if (nicsFromText.length > 0) {
      return nicsFromText;
    }
  } catch (textErr) {
    // Silent catch, fallback to stream search and OCR
  }

  // Step 2: Fallback to string search in raw buffer
  const rawStringText = fileBuffer.toString('utf8') + '\n' + fileBuffer.toString('latin1');
  const nicsFromRawStr = extractFisherNicsFromText(rawStringText);
  if (nicsFromRawStr.length > 0) {
    return nicsFromRawStr;
  }

  // Step 3: OCR Fallback for scanned/image PDFs
  return await performOcrFallback(fileBuffer);
}

/**
 * Controller: POST /api/departure-checker/check-pdfs or POST /api/departure-pdf-checker/check
 * Processes 1-5 Departure PDFs strictly in-memory and performs live BLC status checks.
 * Retains ALL extracted Skipper + Crew NICs in results (including NOT_FOUND).
 */
const checkDeparturePdfs = async (req, res, next) => {
  try {
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No PDF files uploaded. Please upload 1 to 5 PDF files.',
      });
    }

    if (files.length > 5) {
      return res.status(400).json({
        success: false,
        message: 'Maximum 5 PDF files are allowed per batch.',
      });
    }

    const batchId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
    
    // Step 1: Validate file magic bytes (%PDF-) and extract ALL NICs in memory per file
    const fileDataList = [];
    const allNicsSet = new Set();

    for (const file of files) {
      const originalName = file.originalname || 'departure.pdf';

      // Validate magic bytes (%PDF-)
      const magicBytes = file.buffer.slice(0, 5).toString('ascii');
      if (magicBytes !== '%PDF-') {
        fileDataList.push({
          filename: originalName,
          status: 'FAILED',
          error: 'Invalid PDF format. File magic bytes verification failed.',
          extractedNics: [],
          results: [],
        });
        continue;
      }

      // Extract ALL Skipper + Crew NICs
      const extractedNics = await extractNicsFromPdfBufferWithFallback(file.buffer);
      extractedNics.forEach((nic) => allNicsSet.add(nic));

      fileDataList.push({
        filename: originalName,
        status: 'PROCESSED',
        extractedNics,
      });
    }

    // Step 2: Batch DB query & memoized clearance status calculation across unique NICs
    const uniqueNics = Array.from(allNicsSet);
    const fisherMap = new Map();
    if (uniqueNics.length > 0) {
      const foundFishers = await prisma.fishers.findMany({
        where: {
          nic: { in: uniqueNics },
          is_archived: false,
        },
        select: {
          id: true,
          fisher_id: true,
          full_name: true,
          boat_no: true,
          nic: true,
          status: true,
        },
      });
      foundFishers.forEach((f) => fisherMap.set(f.nic.toUpperCase(), f));
    }

    // Cache clearance results for unique Fishers
    const clearanceCache = new Map();
    for (const fisher of fisherMap.values()) {
      const clearanceResult = await getFisherClearanceStatus(fisher.id);
      let outcome = 'NOT_FOUND';
      if (clearanceResult.status === 'CLEARED') {
        outcome = 'APPROVED';
      } else if (clearanceResult.status === 'HOLD' || clearanceResult.status === 'NOT_ELIGIBLE') {
        outcome = 'BLC';
      } else if (clearanceResult.status === 'PENDING') {
        outcome = 'PENDING';
      }
      clearanceCache.set(fisher.id, { clearanceResult, outcome });
    }

    // Step 3: Map EVERY extracted NIC to result list (including NOT_FOUND)
    let totalNicsExtracted = 0;
    let totalApproved = 0;
    let totalBlc = 0;
    let totalNotFound = 0;

    const processedFiles = fileDataList.map((fileData) => {
      if (fileData.status === 'FAILED') {
        return {
          filename: fileData.filename,
          status: 'FAILED',
          error: fileData.error,
          results: [],
        };
      }

      const results = fileData.extractedNics.map((rawNic) => {
        totalNicsExtracted++;
        const normalizedNic = rawNic.trim().toUpperCase();
        const fisher = fisherMap.get(normalizedNic);

        if (!fisher) {
          totalNotFound++;
          return {
            nic: normalizedNic,
            fisherId: null,
            fisherName: null,
            boatNo: null,
            status: 'NOT_FOUND',
            outcome: 'NOT_FOUND',
            canProceed: false,
            details: 'Fisher NIC not found in database',
            reasons: [{ code: 'NOT_FOUND', label: 'Fisher record not registered in database' }],
          };
        }

        const cached = clearanceCache.get(fisher.id);
        const outcome = cached.outcome;
        if (outcome === 'APPROVED') totalApproved++;
        else if (outcome === 'BLC') totalBlc++;
        else if (outcome === 'NOT_FOUND') totalNotFound++;

        return {
          nic: normalizedNic,
          fisherId: fisher.fisher_id,
          fisherName: fisher.full_name,
          boatNo: fisher.boat_no || null,
          status: outcome,
          outcome,
          canProceed: cached.clearanceResult.canProceed,
          details: cached.clearanceResult.canProceed ? 'Cleared for departure' : 'Departure hold active',
          reasons: cached.clearanceResult.reasons || [],
        };
      });

      return {
        filename: fileData.filename,
        status: 'PROCESSED',
        extractedNicsCount: fileData.extractedNics.length,
        results,
      };
    });

    return res.status(200).json({
      success: true,
      batchId,
      totalFilesUploaded: files.length,
      summary: {
        pdfCount: files.length,
        totalFiles: files.length,
        nicCount: totalNicsExtracted,
        processedCount: processedFiles.filter((f) => f.status === 'PROCESSED').length,
        failedCount: processedFiles.filter((f) => f.status === 'FAILED').length,
        approved: totalApproved,
        totalApproved,
        blocked: totalBlc,
        totalBlc,
        notFound: totalNotFound,
        totalNotFound,
      },
      files: processedFiles,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  upload,
  checkDeparturePdfs,
  extractFisherNicsFromText,
};
