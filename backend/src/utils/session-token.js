import { createHash, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';

export function createRawSessionToken() {
  return randomBytes(48).toString('base64url');
}

export function hashSessionToken(rawToken) {
  return createHash('sha256').update(`${rawToken}:${env.sessionTokenPepper}`).digest('hex');
}

export function passwordHashVersion(passwordHash) {
  return createHash('sha256').update(passwordHash).digest('hex');
}
