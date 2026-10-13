import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const permissionSchema = new Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, unique: true, trim: true },
    module: { type: String, required: true, trim: true, index: true },
    action: { type: String, enum: ['CREATE', 'READ', 'UPDATE', 'DELETE', 'MANAGE'], required: true },
    description: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true }
  },
  { collection: 'permissions', timestamps: true }
);

export const Permission = model('Permission', permissionSchema);
