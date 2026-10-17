import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const systemSequenceSchema = new Schema(
  {
    key: {
      type: String,
      required: true,
      trim: true
    },
    prefix: {
      type: String,
      required: true,
      trim: true
    },
    year: {
      type: Number,
      required: true,
      validate: {
        validator: Number.isInteger,
        message: 'year must be an integer.'
      }
    },
    lastValue: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: 'lastValue must be a non-negative integer.'
      }
    }
  },
  {
    collection: 'system_sequences',
    timestamps: true
  }
);

// Approved unique index on sequence key
systemSequenceSchema.index({ key: 1 }, { unique: true });

export const SystemSequence = model('SystemSequence', systemSequenceSchema);
