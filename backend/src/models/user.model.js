import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const userSchema = new Schema(
  {
    universityId: {
      type: String,
      trim: true,
      required() {
        return this.userType === 'STUDENT';
      }
    },
    employeeId: {
      type: String,
      trim: true,
      required() {
        return this.userType === 'PLACEMENT';
      }
    },
    // The Company model and collection are intentionally deferred to Module 3.
    companyId: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required() {
        return this.userType === 'COMPANY';
      }
    },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    userType: { type: String, enum: ['STUDENT', 'COMPANY', 'PLACEMENT'], required: true },
    roleId: { type: String, ref: 'Role', required: true, index: true },
    accountStatus: { type: String, enum: ['ACTIVE', 'INACTIVE', 'LOCKED'], default: 'ACTIVE', required: true },
    lastLoginAt: { type: Date },
    failedLoginAttempts: { type: Number, default: 0, min: 0 },
    lockedUntil: { type: Date }
  },
  {
    collection: 'users',
    timestamps: true,
    toJSON: {
      transform(_document, returned) {
        delete returned.passwordHash;
        return returned;
      }
    }
  }
);

userSchema.index({ universityId: 1 }, { unique: true, sparse: true });
userSchema.index({ employeeId: 1 }, { unique: true, sparse: true });
userSchema.index({ companyId: 1 });

export const User = model('User', userSchema);
