import fs from 'node:fs';
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
import { studentRouter } from './routes/student.routes.js';
import { companyRouter } from './routes/company.routes.js';
import { placementOfficerRouter } from './routes/placement_officer.routes.js';
import { importRouter } from './routes/import.routes.js';
import { departmentRoutes } from './routes/department.routes.js';
import { courseRoutes } from './routes/course.routes.js';
import { jobRoutes } from './routes/job.routes.js';
import { applicationRoutes } from './routes/application.routes.js';
import { workshopRouter } from './routes/workshop.routes.js';
import { notificationRoutes } from './routes/notification.routes.js';
import { AppError } from './utils/app-error.js';

export function createApp() {
  const app = express();
  const sourceDirectory = dirname(fileURLToPath(import.meta.url));
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(
    cors({
      origin(origin, callback) {
        // CLI/native/server-to-server clients do not send Origin and are allowed.
        if (!origin || env.corsOrigins.includes(origin)) return callback(null, true);
        // Allow any localhost / 127.0.0.1 origin in development (e.g. ports 5173, 5174, etc.)
        if (!env.isProduction && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
          return callback(null, true);
        }
        return callback(new AppError(403, 'CORS_NOT_ALLOWED', 'Origin is not allowed.'));
      },
      credentials: false,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Authorization', 'Content-Type']
    })
  );
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  
  // Fallback handler for documents / photos path alignment
  app.get('/uploads/documents/:filename', (req, res, next) => {
    const filename = req.params.filename;
    const docsPath = join(sourceDirectory, '..', 'public', 'uploads', 'documents', filename);
    if (!fs.existsSync(docsPath)) {
      const photosPath = join(sourceDirectory, '..', 'public', 'uploads', 'photos', filename);
      if (fs.existsSync(photosPath)) {
        return res.sendFile(photosPath);
      }
      const resumesPath = join(sourceDirectory, '..', 'public', 'uploads', 'resumes', filename);
      if (fs.existsSync(resumesPath)) {
        return res.sendFile(resumesPath);
      }
    }
    next();
  });

  app.use(express.static(join(sourceDirectory, '..', 'public')));

  app.use('/api/auth', authRouter);
  app.use('/api/roles', roleRouter);
  app.use('/api/permissions', permissionRouter);
  app.use('/api/users', userRouter);
  app.use('/api/students', studentRouter);
  app.use('/api/companies', companyRouter);
  app.use('/api/placement-officers', placementOfficerRouter);
  app.use('/api/sessions', sessionRouter);
  app.use('/api/imports', importRouter);
  app.use('/api/departments', departmentRoutes);
  app.use('/api/courses', courseRoutes);
  app.use('/api/jobs', jobRoutes);
  app.use('/api/applications', applicationRoutes);
  app.use('/api/workshops', workshopRouter);
  app.use('/api/notifications', notificationRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
