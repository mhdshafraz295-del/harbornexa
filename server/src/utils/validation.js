/**
 * Utility functions for Sri Lankan NIC validation and Phone normalization
 */

/**
 * Validates and normalizes Sri Lankan NIC numbers.
 * Old format: 9 digits + V/X (case insensitive) -> normalized to UPPERCASE
 * New format: 12 digits
 * 
 * @param {string} rawNic 
 * @returns {{ isValid: boolean, normalizedNic: string | null, error?: string }}
 */
function validateSriLankanNIC(rawNic) {
  if (!rawNic || typeof rawNic !== 'string') {
    return { isValid: false, normalizedNic: null, error: 'NIC is required.' };
  }

  const trimmed = rawNic.trim().toUpperCase();

  // Old NIC format: 9 digits + V or X
  const oldNicRegex = /^\d{9}[VX]$/;
  if (oldNicRegex.test(trimmed)) {
    return { isValid: true, normalizedNic: trimmed };
  }

  // New NIC format: 12 digits
  const newNicRegex = /^\d{12}$/;
  if (newNicRegex.test(trimmed)) {
    return { isValid: true, normalizedNic: trimmed };
  }

  return {
    isValid: false,
    normalizedNic: null,
    error: 'Invalid Sri Lankan NIC format. Must be 9 digits followed by V/X (e.g., 991234567V) or 12 digits (e.g., 200527001738).',
  };
}

/**
 * Validates and normalizes Sri Lankan Phone numbers.
 * Accepts formats like: 07XXXXXXXX, +947XXXXXXXX, 947XXXXXXXX
 * Normalizes to: +947XXXXXXXX
 * Allows empty/null if phone is optional.
 * 
 * @param {string} rawPhone 
 * @returns {{ isValid: boolean, normalizedPhone: string | null, error?: string }}
 */
function normalizeSriLankanPhone(rawPhone) {
  if (!rawPhone || typeof rawPhone !== 'string' || rawPhone.trim() === '') {
    return { isValid: true, normalizedPhone: null };
  }

  // Remove spaces, dashes, dots, parentheses
  const cleaned = rawPhone.trim().replace(/[\s\-\.\(\)]/g, '');

  // Regex matching Sri Lankan numbers (local 07X/0XX or international +94/94)
  const slPhoneRegex = /^(\+?94|0)?([1-9]\d{8})$/;
  const match = cleaned.match(slPhoneRegex);

  if (match) {
    const subscriberNumber = match[2]; // 9 digits (e.g. 771234567 or 652221234)
    return { isValid: true, normalizedPhone: `+94${subscriberNumber}` };
  }

  return {
    isValid: false,
    normalizedPhone: null,
    error: 'Invalid Sri Lankan phone number. Example valid format: 0771234567 or +94771234567.',
  };
}

module.exports = {
  validateSriLankanNIC,
  normalizeSriLankanPhone,
};
