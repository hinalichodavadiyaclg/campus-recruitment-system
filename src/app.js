import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { authRouter } from './routes/auth.routes.js';
import { permissionRouter } from './routes/permission.routes.js';
import { roleRouter } from './routes/role.routes.js';
import { sessionRouter } from './routes/session.routes.js';
import { userRouter } from './routes/user.routes.js';
import { importRouter } from './routes/import.routes.js';
import { AppError } from './utils/app-error.js';

export function createApp() {
  const app = express();
  const sourceDirectory = dirname(fileURLToPath(import.meta.url));
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        // CLI/native/server-to-server clients do not send Origin and are allowed.
        if (!origin || env.corsOrigins.includes(origin)) return callback(null, true);
        return callback(new AppError(403, 'CORS_NOT_ALLOWED', 'Origin is not allowed.'));
      },
      credentials: false,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Authorization', 'Content-Type']
    })
  );
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(express.static(join(sourceDirectory, '..', 'public')));

  app.use('/api/auth', authRouter);
  app.use('/api/roles', roleRouter);
  app.use('/api/permissions', permissionRouter);
  app.use('/api/users', userRouter);
  app.use('/api/sessions', sessionRouter);
  app.use('/api/imports', importRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
