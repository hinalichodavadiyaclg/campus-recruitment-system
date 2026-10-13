/**
 * Global Validation Utilities for VVWU Campus Recruitment Portal
 * Centralized validators for mobile numbers, emails, URLs, and common inputs.
 */

/**
 * Validates a mobile number to ensure it is strictly 10 digits.
 * Accepts:
 *  - Exactly 10 digits: e.g. "9876543210", "98765 43210", "98765-43210"
 *  - With optional country code prefix "+91" or "0": e.g. "+91 9876543210", "+919876543210", "09876543210"
 * Strictly rejects:
 *  - More than 10 digits (e.g. 11, 12, 13, 14 digits)
 *  - Less than 10 digits (e.g. 9 or fewer digits)
 *  - Alphabets or non-phone symbols
 *
 * @param {string} value - Mobile or phone number to test
 * @returns {boolean} True if strictly 10 digits, false otherwise
 */
export function isValidMobile(value) {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();

  // Strip international prefix +91, 91 (if 12 digits), or leading 0 (if 11 digits)
  let clean = trimmed;
  if (clean.startsWith('+91')) {
    clean = clean.slice(3).trim();
  } else if (clean.startsWith('91') && clean.replace(/\D/g, '').length === 12) {
    clean = clean.slice(2).trim();
  } else if (clean.startsWith('0') && clean.replace(/\D/g, '').length === 11) {
    clean = clean.slice(1).trim();
  }

  // Remove valid formatting characters (spaces, dashes, parentheses)
  const digits = clean.replace(/[\s\-()]/g, '');

  // Must consist of digits only and be EXACTLY 10 digits
  return /^\d{10}$/.test(digits);
}

export const MOBILE_VALIDATION_MESSAGE =
  'Mobile number must be exactly 10 digits (e.g. 9876543210 or +91 9876543210).';
