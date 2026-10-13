import mongoose from 'mongoose';
import { env } from './env.js';

export async function connectDatabase(uri = env.mongodbUri) {
  mongoose.set('strictQuery', true);
  return mongoose.connect(uri);
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}
