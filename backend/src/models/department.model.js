import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const departmentSchema = new Schema(
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
    collection: 'departments',
    timestamps: true
  }
);

departmentSchema.index({ name: 1 });
departmentSchema.index({ isActive: 1 });

export const Department = model('Department', departmentSchema);
