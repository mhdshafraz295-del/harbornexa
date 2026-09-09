const emailService = require('../services/emailService');

/**
 * Controller to fetch incoming departure manifest emails with PDF attachments
 */
async function getEmailManifests(req, res, next) {
  try {
    const limit = parseInt(req.query.limit || '15', 10);
    const result = await emailService.fetchDepartureEmails({ limit });
    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Controller to download or stream a cached PDF attachment by ID
 */
async function downloadAttachment(req, res, next) {
  try {
    const { attachmentId } = req.params;
    const attachment = emailService.getCachedAttachment(attachmentId);

    if (!attachment || !attachment.buffer) {
      return res.status(404).json({
        success: false,
        message: 'Attachment not found or has expired from cache. Please refresh the inbox.',
      });
    }

    const safeFilename = encodeURIComponent(attachment.filename || 'manifest.pdf');
    res.setHeader('Content-Type', attachment.contentType || 'application/pdf');
    res.setHeader('Content-Length', attachment.buffer.length);
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`);

    return res.status(200).send(attachment.buffer);
  } catch (error) {
    next(error);
  }
}

/**
 * Controller to test IMAP connection
 */
async function testEmailConnection(req, res, next) {
  try {
    const result = await emailService.testImapConnection();
    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getEmailManifests,
  downloadAttachment,
  testEmailConnection,
};
