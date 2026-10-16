import mongoose from 'mongoose';

const { Schema, model } = mongoose;

export const REGISTRATION_STATUSES = Object.freeze([
  'REGISTERED',
  'CANCELLED',
  'ATTENDED',
  'COMPLETED',
  'NO_SHOW'
]);

export const REGISTRATION_SOURCES = Object.freeze([
  'STUDENT',
  'COORDINATOR'
]);

export const COMPLETION_STATUSES = Object.freeze([
  'PENDING',
  'COMPLETED',
  'NOT_COMPLETED'
]);

const workshopRegistrationSchema = new Schema(
  {
    registrationId: {
      type: String,
      required: true,
      trim: true
    },
    workshopId: {
      type: Schema.Types.ObjectId,
      ref: 'Workshop',
      required: true
    },
    studentId: {
      type: Schema.Types.ObjectId,
      ref: 'Student',
      required: true
    },
    status: {
      type: String,
      enum: REGISTRATION_STATUSES,
      default: 'REGISTERED',
      required: true
    },
    registeredAt: {
      type: Date,
      required: true,
      default: Date.now
    },
    cancelledAt: {
      type: Date
    },
    cancelledBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    cancellationReason: {
      type: String,
      trim: true
    },
    registrationSource: {
      type: String,
      enum: REGISTRATION_SOURCES,
      required: true
    },
    registeredBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    attendancePercentage: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      max: 100
    },
    completionStatus: {
      type: String,
      enum: COMPLETION_STATUSES,
      required: true,
      default: 'PENDING'
    },
    activeRegistrationKey: {
      type: String,
      enum: ['ACTIVE']
    }
  },
  {
    collection: 'workshop_registrations',
    timestamps: true
  }
);

// Approved partial unique index for active registrations:
// Only indexes records where activeRegistrationKey === 'ACTIVE'.
// On cancellation, activeRegistrationKey is unset, allowing multiple historical cancelled records and re-registration.
workshopRegistrationSchema.index(
  { workshopId: 1, studentId: 1 },
  {
    unique: true,
    partialFilterExpression: { activeRegistrationKey: 'ACTIVE' }
  }
);

// Unique business ID index
workshopRegistrationSchema.index({ registrationId: 1 }, { unique: true });

// Approved query indexes
workshopRegistrationSchema.index({ workshopId: 1, status: 1 });
workshopRegistrationSchema.index({ studentId: 1, status: 1 });

export const WorkshopRegistration = model('WorkshopRegistration', workshopRegistrationSchema);
