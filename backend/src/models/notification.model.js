import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    type: {
      type: String,
      required: true,
      enum: [
        'JOB_PUBLISHED',
        'JOB_REOPENED',
        'JOB_STATUS_CHANGED',
        'JOB_SUSPENDED',
        'JOB_RESTORED',
        'APPLICATION_RECEIVED',
        'APPLICATION_STATUS_CHANGED',
        'APPLICATION_WITHDRAWN',
        'SYSTEM'
      ],
      default: 'SYSTEM'
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000
    },
    relatedResourceType: {
      type: String,
      enum: ['JOB', 'APPLICATION', 'SYSTEM'],
      default: 'SYSTEM'
    },
    relatedResourceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    },
    actionUrl: {
      type: String,
      default: null,
      trim: true
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true
    },
    readAt: {
      type: Date,
      default: null
    },
    dedupKey: {
      type: String,
      unique: true,
      sparse: true,
      trim: true
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true
  }
);

// Compound indexes for optimal performance
notificationSchema.index({ recipientId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ recipientId: 1, createdAt: -1 });

export const Notification = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
