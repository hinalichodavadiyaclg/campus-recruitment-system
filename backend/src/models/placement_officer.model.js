import mongoose from 'mongoose';
import './department.model.js';
import { ROLE_IDS } from '../utils/access-constants.js';

const { Schema, model } = mongoose;

const placementOfficerSchema = new Schema(
  {
    employeeId: { type: String, required: true, unique: true, trim: true },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    mobileNumber: { type: String, trim: true },
    designation: { type: String, required: true, trim: true },
    departmentId: { type: Schema.Types.ObjectId, ref: 'Department' },
    department: { type: String, trim: true },
    role: {
      type: String,
      enum: [ROLE_IDS.PLACEMENT_HEAD, ROLE_IDS.PLACEMENT_COORDINATOR]
    },
    userId: { type: Schema.Types.ObjectId, ref: 'User' }
  },
  { collection: 'placement_officers', timestamps: true }
);

export const PlacementOfficer = model('PlacementOfficer', placementOfficerSchema);
