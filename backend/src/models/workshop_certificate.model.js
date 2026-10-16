import mongoose from 'mongoose';

const { Schema, model } = mongoose;

export const CERTIFICATE_ELIGIBILITY_STATUSES = Object.freeze([
  'PENDING',
  'ELIGIBLE',
  'NOT_ELIGIBLE'
]);

export const CERTIFICATE_STATUSES = Object.freeze([
  'PENDING_ISSUANCE',
  'ISSUED',
  'REVOKED'
]);

const workshopCertificateSchema = new Schema(
  {
    workshopId: {
      type: Schema.Types.ObjectId,
      ref: 'Workshop',
      required: true
    },
    registrationId: {
      type: Schema.Types.ObjectId,
      ref: 'WorkshopRegistration',
      required: true
    },
    studentId: {
      type: Schema.Types.ObjectId,
      ref: 'Student',
      required: true
    },
    certificateNumber: {
      type: String,
      required: true,
      trim: true
    },
    verificationCode: {
      type: String,
      required: true,
      trim: true
    },
    eligibilityStatus: {
      type: String,
      enum: CERTIFICATE_ELIGIBILITY_STATUSES,
      required: true,
      default: 'PENDING'
    },
    certificateStatus: {
      type: String,
      enum: CERTIFICATE_STATUSES,
      required: true,
      default: 'PENDING_ISSUANCE'
    },
    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    approvedAt: {
      type: Date
    },
    issuedAt: {
      type: Date
    },
    fileUrl: {
      type: String,
      trim: true
    },
    revokedAt: {
      type: Date
    },
    revokedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    revocationReason: {
      type: String,
      trim: true
    }
  },
  {
    collection: 'workshop_certificates',
    timestamps: true
  }
);

// Approved unique constraints: explicit schema-level declarations
workshopCertificateSchema.index({ certificateNumber: 1 }, { unique: true });
workshopCertificateSchema.index({ verificationCode: 1 }, { unique: true });
workshopCertificateSchema.index({ registrationId: 1 }, { unique: true });
workshopCertificateSchema.index({ workshopId: 1, studentId: 1 });

export const WorkshopCertificate = model('WorkshopCertificate', workshopCertificateSchema);
