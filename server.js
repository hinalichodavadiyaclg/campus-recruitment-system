import { createApp } from './src/app.js';
import { connectDatabase, disconnectDatabase } from './src/config/database.js';
import { env } from './src/config/env.js';
import { seedInitialData } from './src/seeders/seed.js';

async function start() {
  await connectDatabase();
  await seedInitialData();
  const app = createApp();
  const server = app.listen(env.port, () => {
    console.info(`Campus Recruitment Module 1 API listening on port ${env.port}.`);
  });

  const shutdown = (signal) => {
    console.info(`Received ${signal}; closing server.`);
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch((error) => {
  console.error('Failed to start API.', error);
  process.exit(1);
});
