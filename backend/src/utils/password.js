import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { AppError } from './app-error.js';

// Used only to keep timing similar when an account does not exist.
export const DUMMY_PASSWORD_HASH = '$2a$12$X4jItOj.rIAZ1pkdRbuPtuSnZp39E7AKaOfvpniTrNrkkHoFSOp3y';

export function assertStrongPassword(password) {
  if (
    password.length < 12 ||
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/\d/.test(password) ||
    !/[^A-Za-z0-9]/.test(password)
  ) {
    throw new AppError(
      400,
      'WEAK_PASSWORD',
      'Password must be at least 12 characters and include uppercase, lowercase, number, and symbol.'
    );
  }
}

export function hashPassword(password) {
  return bcrypt.hash(password, env.bcryptRounds);
}

export function verifyPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}
