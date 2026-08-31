import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const roleSchema = new Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String, required: true, trim: true },
    permissionIds: { type: [String], default: [] },
    isActive: { type: Boolean, default: true }
  },
  { collection: 'roles', timestamps: true }
);

export const Role = model('Role', roleSchema);
