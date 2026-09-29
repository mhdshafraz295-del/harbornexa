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

  const trimmed = rawPhone.trim();

  // Remove spaces, dashes, dots, parentheses for standard SL phone check
  const cleaned = trimmed.replace(/[\s\-\.\(\)]/g, '');
  const slPhoneRegex = /^(\+?94|0)?([1-9]\d{8})$/;
  const match = cleaned.match(slPhoneRegex);

  if (match) {
    const subscriberNumber = match[2];
    return { isValid: true, normalizedPhone: `+94${subscriberNumber}` };
  }

  // If user entered name + phone (e.g. "SALMAN 0755999804" or "Owner: 0771234567"), allow it flexibly
  return {
    isValid: true,
    normalizedPhone: trimmed,
  };
}

module.exports = {
  validateSriLankanNIC,
  normalizeSriLankanPhone,
};
