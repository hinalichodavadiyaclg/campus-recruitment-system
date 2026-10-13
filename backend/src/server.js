import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { env } from './config/env.js';
import { seedInitialData } from './seeders/seed.js';

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Promise Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

async function startServerWithRetry(app, port, maxRetries = 5, delayMs = 1000) {
  let attempt = 0;

  function tryListen() {
    return new Promise((resolve, reject) => {
      const server = app.listen(port, () => {
        console.info(`Campus Recruitment Module 1 API listening on port ${port}.`);
        resolve(server);
      });

      server.on('error', (err) => {
        if (err.code === 'EADDRINUSE' && attempt < maxRetries) {
          attempt += 1;
          console.warn(`Port ${port} is currently in use, retrying attempt ${attempt}/${maxRetries} in ${delayMs}ms...`);
          setTimeout(() => {
            tryListen().then(resolve).catch(reject);
          }, delayMs);
        } else {
          reject(err);
        }
      });
    });
  }

  return tryListen();
}

async function start() {
  await connectDatabase();
  await seedInitialData();
  const app = createApp();

  const server = await startServerWithRetry(app, env.port);

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
});
