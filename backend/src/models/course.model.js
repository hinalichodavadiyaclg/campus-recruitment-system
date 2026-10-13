import mongoose from 'mongoose';

const { Schema, model } = mongoose;

export const COURSE_LEVELS = Object.freeze([
  'UNDERGRADUATE',
  'POSTGRADUATE',
  'DIPLOMA',
  'CERTIFICATE',
  'DOCTORAL'
]);

const courseSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      unique: true
    },
    departmentId: {
      type: Schema.Types.ObjectId,
      ref: 'Department',
      required: true,
      index: true
    },
    level: {
      type: String,
      required: true,
      enum: COURSE_LEVELS
    },
    durationYears: {
      type: Number,
      min: 0.5,
      max: 10
    },
    description: {
      type: String,
      trim: true,
      default: ''
    },
    isActive: {
      type: Boolean,
      default: true,
      required: true
    }
  },
  {
    collection: 'courses',
    timestamps: true
  }
);

courseSchema.index({ level: 1 });
courseSchema.index({ isActive: 1 });

export const Course = model('Course', courseSchema);
