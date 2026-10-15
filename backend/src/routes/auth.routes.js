import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as authController from '../controllers/auth.controller.js';
import { env } from '../config/env.js';
import { authenticate } from '../middleware/authenticate.js';
import { AppError } from '../utils/app-error.js';
import { validate } from '../validators/request.validator.js';
import { changePasswordSchema, forgotPasswordSchema, loginSchema, resetPasswordSchema } from '../validators/schemas.js';

const authenticationAttemptLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.isProduction ? 10 : 100,
  skip: () => env.nodeEnv === 'test',
  standardHeaders: true,
  legacyHeaders: false,
  handler(_request, _response, next) {
    next(new AppError(429, 'TOO_MANY_ATTEMPTS', 'Too many authentication attempts. Please try again later.'));
  }
});

export const authRouter = Router();

authRouter.post('/login', authenticationAttemptLimit, validate(loginSchema), authController.login);
authRouter.post('/logout', authenticate, authController.logout);
authRouter.post('/change-password', authenticate, validate(changePasswordSchema), authController.changePassword);
authRouter.post('/forgot-password', authenticationAttemptLimit, validate(forgotPasswordSchema), authController.forgotPassword);
authRouter.post('/reset-password', authenticationAttemptLimit, validate(resetPasswordSchema), authController.resetPassword);
authRouter.get('/me', authenticate, authController.me);
