import { SystemSequence } from '../models/system_sequence.model.js';
import { AppError } from './app-error.js';

export const SUPPORTED_SEQUENCE_PREFIXES = Object.freeze(['WS', 'WREG', 'CERT']);

/**
 * Resolves the 4-digit calendar year in Indian Standard Time (Asia/Kolkata).
 * Strictly requires a valid Date object or ISO date string.
 * Throws AppError(400, 'INVALID_INPUT') if missing or invalid; never silently falls back.
 *
 * @param {Date|string|number} dateInput
 * @returns {number} 4-digit integer calendar year in IST
 */
export function getISTYear(dateInput) {
  if (!dateInput) {
    throw new AppError(400, 'INVALID_INPUT', 'A valid date is required to resolve the IST calendar year.');
  }

  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(date.getTime())) {
    throw new AppError(400, 'INVALID_INPUT', 'Invalid date value provided for IST year calculation.');
  }

  // Use Intl.DateTimeFormat with Asia/Kolkata to ensure exact IST calendar boundary resolution
  const formatter = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric'
  });

  const yearStr = formatter.format(date);
  const year = parseInt(yearStr, 10);

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new AppError(500, 'DATE_RESOLUTION_FAILED', `Resolved unexpected IST year: "${yearStr}".`);
  }

  return year;
}

/**
 * Pure string formatting utility for sequential business identifiers.
 *
 * @param {string} prefix - Must be one of SUPPORTED_SEQUENCE_PREFIXES
 * @param {number} year - 4-digit integer year (2000-2100)
 * @param {number} sequenceNumber - Positive integer sequence value
 * @param {number} [padding=4] - Minimum digits for sequence padding
 * @returns {string} Formatted identifier, e.g. 'WS-2026-0001'
 */
export function formatSequenceId(prefix, year, sequenceNumber, padding = 4) {
  if (!SUPPORTED_SEQUENCE_PREFIXES.includes(prefix)) {
    throw new AppError(400, 'INVALID_INPUT', `Unsupported sequence prefix: "${prefix}". Must be one of: ${SUPPORTED_SEQUENCE_PREFIXES.join(', ')}.`);
  }

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new AppError(400, 'INVALID_INPUT', `Invalid year: "${year}". Must be an integer between 2000 and 2100.`);
  }

  if (!Number.isInteger(sequenceNumber) || sequenceNumber < 1) {
    throw new AppError(400, 'INVALID_INPUT', `Invalid sequenceNumber: "${sequenceNumber}". Must be a positive integer.`);
  }

  return `${prefix}-${year}-${String(sequenceNumber).padStart(padding, '0')}`;
}

/**
 * Atomically increments and allocates the next sequence value for a given prefix and year.
 * Operates on the SystemSequence model with the unique key `${prefix}_${year}`.
 *
 * Concurrency & Retry Guarantees:
 * - Uses MongoDB findOneAndUpdate with $inc and $setOnInsert (atomic increment).
 * - Catches only the verified initial duplicate-key race (E11000 on key index during first-time upsert).
 * - Implements bounded retries (default 3 attempts) with randomized jitter (25ms - 65ms).
 * - Does NOT retry arbitrary database, network, validation, or transaction abort errors.
 * - Supports an optional Mongoose session for participation in multi-document transactions.
 * - Sequence numbers may have gaps under aborted outer operations; gapless numbering is not promised.
 *
 * @param {string} prefix
 * @param {number} year
 * @param {object} [options={}]
 * @param {import('mongoose').ClientSession|null} [options.session=null]
 * @param {number} [options.maxRetries=3]
 * @returns {Promise<number>} Allocated integer sequence number
 */
export async function allocateNextSequence(prefix, year, { session = null, maxRetries = 3 } = {}) {
  if (!SUPPORTED_SEQUENCE_PREFIXES.includes(prefix)) {
    throw new AppError(400, 'INVALID_INPUT', `Unsupported sequence prefix: "${prefix}".`);
  }

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new AppError(400, 'INVALID_INPUT', `Invalid sequence year: "${year}".`);
  }

  const key = `${prefix}_${year}`;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const doc = await SystemSequence.findOneAndUpdate(
        { key },
        {
          $inc: { lastValue: 1 },
          $setOnInsert: { key, prefix, year }
        },
        {
          new: true,
          upsert: true,
          session,
          runValidators: true
        }
      ).lean();

      if (!doc || typeof doc.lastValue !== 'number') {
        throw new AppError(500, 'SEQUENCE_ALLOCATION_FAILED', `Failed to allocate sequence for key "${key}".`);
      }

      return doc.lastValue;
    } catch (err) {
      // Precise duplicate-key retry behavior:
      // Only retry when E11000 occurs on the sequence key index during the initial concurrent upsert collision.
      const isDuplicateSequenceKey =
        err.code === 11000 &&
        (err.keyPattern?.key || (typeof err.message === 'string' && (err.message.includes('key_1') || err.message.includes('key:'))));

      if (isDuplicateSequenceKey && attempt < maxRetries - 1) {
        attempt++;
        // Bounded jittered sleep between 25ms and 65ms
        await new Promise((resolve) => setTimeout(resolve, 25 + Math.floor(Math.random() * 40)));
        continue;
      }

      // DO NOT RETRY arbitrary database, network, or schema errors
      throw err;
    }
  }

  throw new AppError(500, 'SEQUENCE_EXHAUSTED', `Exceeded maximum retries (${maxRetries}) allocating sequence for key "${key}".`);
}

/**
 * Generates the next sequential Workshop Identifier (WS-YYYY-XXXX).
 * Strictly derives the year from the scheduled workshop.startAt date in IST.
 * Does NOT fall back to current date if missing or invalid.
 *
 * @param {Date|string} startAtDate - Required scheduled workshop start date
 * @param {object} [options={}]
 * @param {import('mongoose').ClientSession|null} [options.session=null]
 * @returns {Promise<string>} e.g. 'WS-2026-0001'
 */
export async function generateWorkshopId(startAtDate, options = {}) {
  if (!startAtDate) {
    throw new AppError(400, 'INVALID_INPUT', 'A valid workshop startAt date is required to generate a workshopId.');
  }

  const year = getISTYear(startAtDate);
  const sequenceNumber = await allocateNextSequence('WS', year, options);
  return formatSequenceId('WS', year, sequenceNumber, 4);
}

/**
 * Generates the next sequential Registration Identifier (WREG-YYYY-XXXX).
 * Derives the year from the registration creation timestamp (registeredAt) in IST.
 * Defaults to current timestamp if omitted.
 *
 * @param {Date|string} [registeredAtDate=new Date()]
 * @param {object} [options={}]
 * @param {import('mongoose').ClientSession|null} [options.session=null]
 * @returns {Promise<string>} e.g. 'WREG-2026-0001'
 */
export async function generateRegistrationId(registeredAtDate = new Date(), options = {}) {
  const year = getISTYear(registeredAtDate);
  const sequenceNumber = await allocateNextSequence('WREG', year, options);
  return formatSequenceId('WREG', year, sequenceNumber, 4);
}

/**
 * Generates the next sequential Certificate Identifier (CERT-YYYY-XXXX).
 * Derives the year from the certificate issuance timestamp (issuedAt) in IST.
 * Defaults to current timestamp if omitted.
 *
 * @param {Date|string} [issuedAtDate=new Date()]
 * @param {object} [options={}]
 * @param {import('mongoose').ClientSession|null} [options.session=null]
 * @returns {Promise<string>} e.g. 'CERT-2026-0001'
 */
export async function generateCertificateNumber(issuedAtDate = new Date(), options = {}) {
  const year = getISTYear(issuedAtDate);
  const sequenceNumber = await allocateNextSequence('CERT', year, options);
  return formatSequenceId('CERT', year, sequenceNumber, 4);
}
