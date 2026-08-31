import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const userSessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // Only a SHA-256 digest of a server-issued opaque token is allowed here.
    sessionTokenHash: { type: String, required: true, unique: true, select: false, match: /^[a-f0-9]{64}$/ },
    loginAt: { type: Date, required: true },
    lastActivityAt: { type: Date, required: true },
    expiresAt: {
      type: Date,
      required: true,
      validate: {
        validator(value) {
          return !this.loginAt || value > this.loginAt;
        },
        message: 'expiresAt must be later than loginAt.'
      }
    },
    logoutAt: { type: Date },
    ipAddress: { type: String, trim: true },
    userAgent: { type: String, trim: true },
    isActive: { type: Boolean, default: true }
  },
  { collection: 'user_sessions', versionKey: false }
);

userSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const UserSession = model('UserSession', userSessionSchema);
