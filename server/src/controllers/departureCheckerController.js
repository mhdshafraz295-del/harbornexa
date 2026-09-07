const multer = require('multer');
const crypto = require('crypto');
const prisma = require('../config/prismaClient');
const { getFisherClearanceStatus } = require('../services/financialService');

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
 * Extracts Sri Lankan NIC numbers from a PDF buffer (Old 9+V/X format & New 12-digit format)
 */
function extractNicsFromPdfBuffer(buffer) {
  const utf8Text = buffer.toString('utf8');
  const latin1Text = buffer.toString('latin1');
  const combinedText = utf8Text + '\n' + latin1Text;

  const foundNics = new Set();

  // 1. Old Sri Lankan NIC pattern: 9 digits + V/X
  const oldNicRegex = /\b\d{9}[vVxX]\b/g;
  let match;
  while ((match = oldNicRegex.exec(combinedText)) !== null) {
    foundNics.add(match[0].toUpperCase());
  }

  // 2. New Sri Lankan NIC pattern: 12 digits starting with 19 or 20
  const newNicRegex = /\b(?:19|20)\d{10}\b/g;
  while ((match = newNicRegex.exec(combinedText)) !== null) {
    foundNics.add(match[0]);
  }

  // 3. Fallback 12-digit NIC regex if no 19/20 prefixed match found
  if (foundNics.size === 0) {
    const generic12DigitRegex = /\b\d{12}\b/g;
    while ((match = generic12DigitRegex.exec(combinedText)) !== null) {
      foundNics.add(match[0]);
    }
  }

  return Array.from(foundNics);
}

/**
 * Controller: POST /api/departure-checker/check-pdfs or POST /api/departure-pdf-checker/check
 * Processes 1-5 Departure PDFs strictly in-memory and performs live BLC status checks.
 * No permanent PDF storage or R2 uploads are performed by this checker.
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
    
    // Step 1: Validate file magic bytes (%PDF-) and extract NICs in memory per file
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

      // Extract NICs directly from memory buffer
      const extractedNics = extractNicsFromPdfBuffer(file.buffer);
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

    // Step 3: Build final read-only output & summaries per file
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
};
