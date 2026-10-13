import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const rootEnvPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env');
dotenv.config({ path: rootEnvPath });
dotenv.config();

function integerFromEnv(name, fallback, minimum) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum) {
    throw new Error(`${name} must be an integer greater than or equal to ${minimum}.`);
  }
  return parsed;
}

function secretFromEnv(name, environment, developmentFallback) {
  const value = process.env[name];
  if (value) {
    if (environment === 'production' && value.length < 32) {
      throw new Error(`${name} must contain at least 32 characters in production.`);
    }
    return value;
  }
  if (environment === 'production') throw new Error(`${name} is required in production.`);
  return developmentFallback;
}

const nodeEnv = process.env.NODE_ENV || 'development';
if (!['development', 'test', 'production'].includes(nodeEnv)) {
  throw new Error('NODE_ENV must be development, test, or production.');
}

export const env = Object.freeze({
  nodeEnv,
  isProduction: nodeEnv === 'production',
  port: integerFromEnv('PORT', 3000, 1),
  mongodbUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/campus_recruitment',
  corsOrigins: (process.env.CORS_ORIGINS || (nodeEnv === 'production' ? '' : 'http://localhost:3000,http://localhost:5173'))
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  sessionTokenPepper: secretFromEnv(
    'SESSION_TOKEN_PEPPER',
    nodeEnv,
    'development-only-session-token-pepper-change-before-production'
  ),
  passwordResetSecret: secretFromEnv(
    'PASSWORD_RESET_SECRET',
    nodeEnv,
    'development-only-password-reset-secret-change-before-production'
  ),
  sessionTtlHours: integerFromEnv('SESSION_TTL_HOURS', 24, 1),
  maxFailedLoginAttempts: integerFromEnv('MAX_FAILED_LOGIN_ATTEMPTS', 5, 1),
  accountLockMinutes: integerFromEnv('ACCOUNT_LOCK_MINUTES', 30, 1),
  bcryptRounds: integerFromEnv('BCRYPT_ROUNDS', 12, 10)
});
