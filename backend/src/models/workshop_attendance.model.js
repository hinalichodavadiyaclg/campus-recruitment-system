import mongoose from 'mongoose';

const { Schema, model } = mongoose;

export const ATTENDANCE_STATUSES = Object.freeze([
  'PRESENT',
  'ABSENT',
  'EXCUSED'
]);

const workshopAttendanceSchema = new Schema(
  {
    workshopId: {
      type: Schema.Types.ObjectId,
      ref: 'Workshop',
      required: true
    },
    sessionId: {
      type: String,
      required: true,
      trim: true
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
    attendanceStatus: {
      type: String,
      enum: ATTENDANCE_STATUSES,
      required: true
    },
    markedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    markedAt: {
      type: Date,
      required: true,
      default: Date.now
    },
    remarks: {
      type: String,
      trim: true
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  {
    collection: 'workshop_attendance',
    timestamps: true
  }
);

// Approved unique compound index: one attendance record per registration per session
workshopAttendanceSchema.index({ registrationId: 1, sessionId: 1 }, { unique: true });

// Approved query indexes for session-level and student-level lookups
workshopAttendanceSchema.index({ workshopId: 1, sessionId: 1 });
workshopAttendanceSchema.index({ studentId: 1 });

export const WorkshopAttendance = model('WorkshopAttendance', workshopAttendanceSchema);
