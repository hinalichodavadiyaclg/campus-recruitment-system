import mongoose from 'mongoose';

const { Schema, model } = mongoose;

export const AUDIT_ENTITY_TYPES = Object.freeze([
  'WORKSHOP',
  'REGISTRATION',
  'ATTENDANCE',
  'CERTIFICATE'
]);

const workshopAuditLogSchema = new Schema(
  {
    workshopId: {
      type: Schema.Types.ObjectId,
      ref: 'Workshop',
      required: false
    },
    registrationId: {
      type: Schema.Types.ObjectId,
      ref: 'WorkshopRegistration',
      required: false
    },
    attendanceId: {
      type: Schema.Types.ObjectId,
      ref: 'WorkshopAttendance',
      required: false
    },
    certificateId: {
      type: Schema.Types.ObjectId,
      ref: 'WorkshopCertificate',
      required: false
    },
    action: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    entityType: {
      type: String,
      enum: AUDIT_ENTITY_TYPES,
      required: true
    },
    entityId: {
      type: String,
      required: true,
      trim: true
    },
    changedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    changedAt: {
      type: Date,
      required: true,
      default: Date.now
    },
    oldValue: {
      type: Schema.Types.Mixed
    },
    newValue: {
      type: Schema.Types.Mixed
    },
    reason: {
      type: String,
      trim: true
    }
  },
  {
    collection: 'workshop_audit_logs',
    timestamps: true
  }
);

// Approved query indexes for audit timeline and entity inspection
workshopAuditLogSchema.index({ entityType: 1, entityId: 1 });
workshopAuditLogSchema.index({ workshopId: 1, changedAt: -1 });
workshopAuditLogSchema.index({ changedBy: 1 });

export const WorkshopAuditLog = model('WorkshopAuditLog', workshopAuditLogSchema);
