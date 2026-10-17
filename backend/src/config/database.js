import mongoose from 'mongoose';
import { env } from './env.js';

export async function connectDatabase(uri) {
  const isTest = process.env.NODE_ENV === 'test';

  if (isTest) {
    if (!uri) {
      throw new Error(
        '[DATABASE SAFETY GUARD] In test mode (NODE_ENV=test), connectDatabase(uri) requires an explicit in-memory or isolated test database URI. Silent fallback to the development database is strictly blocked.'
      );
    }

    const parsedUri = uri.toLowerCase();
    const isDevelopmentDb = parsedUri.includes('/campus_recruitment') && !parsedUri.includes('/campus_recruitment_test');
    if (isDevelopmentDb) {
      throw new Error(
        `[DATABASE SAFETY GUARD] Refusing to connect to primary/development database in test mode: "${uri}". Test suites must use an isolated in-memory or test database.`
      );
    }
  }

  const targetUri = uri || env.mongodbUri;
  mongoose.set('strictQuery', true);
  return mongoose.connect(targetUri);
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}

