import mongoose from 'mongoose';

const { Schema, model } = mongoose;

export const WORKSHOP_CATEGORIES = Object.freeze([
  'TECHNICAL',
  'APTITUDE',
  'SOFT_SKILLS',
  'CAREER_PREP',
  'OTHER'
]);

export const WORKSHOP_MODES = Object.freeze(['OFFLINE', 'ONLINE', 'HYBRID']);

export const WORKSHOP_OWNERSHIP_TYPES = Object.freeze([
  'DEPARTMENT',
  'CENTRAL_PLACEMENT_CELL'
]);

export const WORKSHOP_APPROVAL_STATUSES = Object.freeze([
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED'
]);

export const WORKSHOP_LIFECYCLE_STATUSES = Object.freeze([
  'SCHEDULED',
  'ACTIVE',
  'COMPLETED',
  'CANCELLED'
]);

export const TRAINER_TYPES = Object.freeze([
  'COMPANY',
  'PLACEMENT_COORDINATOR',
  'PLACEMENT_HEAD',
  'EXTERNAL'
]);

export const TARGETING_MODES = Object.freeze([
  'ALL_COURSES_ALL_SEMESTERS',
  'ALL_COURSES_SELECTED_SEMESTERS',
  'SELECTED_COURSES_ALL_SEMESTERS',
  'CUSTOM_COURSE_SEMESTER_RULES'
]);

const trainerSchema = new Schema(
  {
    trainerType: {
      type: String,
      enum: TRAINER_TYPES,
      required: true
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: false
    },
    companyId: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: false
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    designation: {
      type: String,
      trim: true
    },
    organization: {
      type: String,
      trim: true
    }
  },
  {
    _id: true // Automatically generates embedded subdocument ObjectId
  }
);

// Mongoose custom validation for conditional trainer references
trainerSchema.pre('validate', function (next) {
  if (this.trainerType === 'COMPANY') {
    if (!this.companyId) {
      this.invalidate('companyId', 'companyId is required when trainerType is COMPANY.');
    }
    if (this.userId) {
      this.invalidate('userId', 'userId must be absent when trainerType is COMPANY.');
    }
  } else if (
    this.trainerType === 'PLACEMENT_COORDINATOR' ||
    this.trainerType === 'PLACEMENT_HEAD'
  ) {
    if (!this.userId) {
      this.invalidate(
        'userId',
        'userId is required when trainerType is PLACEMENT_COORDINATOR or PLACEMENT_HEAD.'
      );
    }
    if (this.companyId) {
      this.invalidate(
        'companyId',
        'companyId must be absent when trainerType is PLACEMENT_COORDINATOR or PLACEMENT_HEAD.'
      );
    }
  } else if (this.trainerType === 'EXTERNAL') {
    if (this.userId) {
      this.invalidate('userId', 'userId must be absent when trainerType is EXTERNAL.');
    }
    if (this.companyId) {
      this.invalidate('companyId', 'companyId must be absent when trainerType is EXTERNAL.');
    }
  }
  next();
});

const courseSemesterRuleSchema = new Schema(
  {
    courseId: {
      type: Schema.Types.ObjectId,
      ref: 'Course',
      required: true
    },
    semesters: {
      type: [Number],
      required: true,
      validate: {
        validator(v) {
          return Array.isArray(v) && v.length > 0;
        },
        message: 'semesters array must be non-empty in courseSemesterRules.'
      }
    }
  },
  { _id: false }
);

const departmentRuleSchema = new Schema(
  {
    departmentId: {
      type: Schema.Types.ObjectId,
      ref: 'Department',
      required: true
    },
    targetingMode: {
      type: String,
      enum: TARGETING_MODES,
      required: true
    },
    semesters: {
      type: [Number],
      default: []
    },
    courseIds: {
      type: [{ type: Schema.Types.ObjectId, ref: 'Course' }],
      default: []
    },
    courseSemesterRules: {
      type: [courseSemesterRuleSchema],
      default: []
    }
  },
  { _id: false }
);

// Department rule mode-specific validation
departmentRuleSchema.pre('validate', function (next) {
  if (this.targetingMode === 'ALL_COURSES_ALL_SEMESTERS') {
    if (Array.isArray(this.semesters) && this.semesters.length > 0) {
      this.invalidate('semesters', 'semesters must be empty when targetingMode is ALL_COURSES_ALL_SEMESTERS.');
    }
    if (Array.isArray(this.courseIds) && this.courseIds.length > 0) {
      this.invalidate('courseIds', 'courseIds must be empty when targetingMode is ALL_COURSES_ALL_SEMESTERS.');
    }
    if (Array.isArray(this.courseSemesterRules) && this.courseSemesterRules.length > 0) {
      this.invalidate('courseSemesterRules', 'courseSemesterRules must be empty when targetingMode is ALL_COURSES_ALL_SEMESTERS.');
    }
  } else if (this.targetingMode === 'ALL_COURSES_SELECTED_SEMESTERS') {
    if (!Array.isArray(this.semesters) || this.semesters.length === 0) {
      this.invalidate('semesters', 'semesters must be a non-empty array when targetingMode is ALL_COURSES_SELECTED_SEMESTERS.');
    }
    if (Array.isArray(this.courseIds) && this.courseIds.length > 0) {
      this.invalidate('courseIds', 'courseIds must be empty when targetingMode is ALL_COURSES_SELECTED_SEMESTERS.');
    }
    if (Array.isArray(this.courseSemesterRules) && this.courseSemesterRules.length > 0) {
      this.invalidate('courseSemesterRules', 'courseSemesterRules must be empty when targetingMode is ALL_COURSES_SELECTED_SEMESTERS.');
    }
  } else if (this.targetingMode === 'SELECTED_COURSES_ALL_SEMESTERS') {
    if (!Array.isArray(this.courseIds) || this.courseIds.length === 0) {
      this.invalidate('courseIds', 'courseIds must be a non-empty array when targetingMode is SELECTED_COURSES_ALL_SEMESTERS.');
    }
    if (Array.isArray(this.semesters) && this.semesters.length > 0) {
      this.invalidate('semesters', 'semesters must be empty when targetingMode is SELECTED_COURSES_ALL_SEMESTERS.');
    }
    if (Array.isArray(this.courseSemesterRules) && this.courseSemesterRules.length > 0) {
      this.invalidate('courseSemesterRules', 'courseSemesterRules must be empty when targetingMode is SELECTED_COURSES_ALL_SEMESTERS.');
    }
  } else if (this.targetingMode === 'CUSTOM_COURSE_SEMESTER_RULES') {
    if (!Array.isArray(this.courseSemesterRules) || this.courseSemesterRules.length === 0) {
      this.invalidate('courseSemesterRules', 'courseSemesterRules must be a non-empty array when targetingMode is CUSTOM_COURSE_SEMESTER_RULES.');
    }
    if (Array.isArray(this.semesters) && this.semesters.length > 0) {
      this.invalidate('semesters', 'semesters must be empty when targetingMode is CUSTOM_COURSE_SEMESTER_RULES.');
    }
    if (Array.isArray(this.courseIds) && this.courseIds.length > 0) {
      this.invalidate('courseIds', 'courseIds must be empty when targetingMode is CUSTOM_COURSE_SEMESTER_RULES.');
    }
  }
  next();
});

const targetAudienceSchema = new Schema(
  {
    isAllDepartments: {
      type: Boolean,
      required: true,
      default: false
    },
    departmentRules: {
      type: [departmentRuleSchema],
      default: []
    }
  },
  { _id: false }
);

const sessionSchema = new Schema(
  {
    sessionId: {
      type: String,
      required: true,
      trim: true
    },
    sessionNumber: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: 'sessionNumber must be an integer.'
      }
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    startAt: {
      type: Date,
      required: true
    },
    endAt: {
      type: Date,
      required: true
    },
    trainerIds: {
      type: [String],
      default: []
    },
    venue: {
      type: String,
      trim: true
    },
    meetingLink: {
      type: String,
      trim: true
    },
    isAttendanceRequired: {
      type: Boolean,
      required: true,
      default: true
    }
  },
  { _id: true }
);

const workshopSchema = new Schema(
  {
    workshopId: {
      type: String,
      required: true,
      trim: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      required: true
    },
    category: {
      type: String,
      enum: WORKSHOP_CATEGORIES,
      required: true
    },
    mode: {
      type: String,
      enum: WORKSHOP_MODES,
      required: true
    },
    bannerUrl: {
      type: String,
      trim: true
    },
    ownershipType: {
      type: String,
      enum: WORKSHOP_OWNERSHIP_TYPES,
      required: true,
      default: 'DEPARTMENT'
    },
    departmentId: {
      type: Schema.Types.ObjectId,
      ref: 'Department',
      required: false
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    coordinatorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: false
    },
    approvalStatus: {
      type: String,
      enum: WORKSHOP_APPROVAL_STATUSES,
      required: true,
      default: 'DRAFT'
    },
    isPublished: {
      type: Boolean,
      required: true,
      default: false
    },
    lifecycleStatus: {
      type: String,
      enum: WORKSHOP_LIFECYCLE_STATUSES,
      required: true,
      default: 'SCHEDULED'
    },
    trainers: {
      type: [trainerSchema],
      default: []
    },
    targetAudience: {
      type: targetAudienceSchema,
      required: true,
      default: () => ({ isAllDepartments: false, departmentRules: [] })
    },
    startAt: {
      type: Date,
      required: true
    },
    endAt: {
      type: Date,
      required: true
    },
    registrationOpensAt: {
      type: Date,
      required: false
    },
    registrationDeadline: {
      type: Date,
      required: true
    },
    venue: {
      type: String,
      trim: true
    },
    meetingLink: {
      type: String,
      trim: true
    },
    maxParticipants: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: 'maxParticipants must be an integer.'
      }
    },
    sessions: {
      type: [sessionSchema],
      required: true,
      validate: {
        validator(v) {
          return Array.isArray(v) && v.length > 0;
        },
        message: 'Every workshop must have at least one session.'
      }
    }
  },
  {
    collection: 'workshops',
    timestamps: true
  }
);

// Schema-level validation for ownership conditional logic and session consistency
workshopSchema.pre('validate', function (next) {
  // Ownership validation
  if (this.ownershipType === 'DEPARTMENT' && !this.departmentId) {
    this.invalidate('departmentId', 'departmentId is required when ownershipType is DEPARTMENT.');
  }
  if (this.ownershipType === 'CENTRAL_PLACEMENT_CELL' && this.departmentId) {
    this.invalidate('departmentId', 'departmentId must be absent when ownershipType is CENTRAL_PLACEMENT_CELL.');
  }

  // Schedule bounds validation
  if (this.startAt && this.endAt && this.endAt <= this.startAt) {
    this.invalidate('endAt', 'Workshop endAt must be after startAt.');
  }
  if (this.registrationOpensAt && this.registrationDeadline && this.registrationDeadline <= this.registrationOpensAt) {
    this.invalidate('registrationDeadline', 'registrationDeadline must be after registrationOpensAt.');
  }

  // Session validation (uniqueness, boundaries, containment, and trainer matching)
  if (Array.isArray(this.sessions) && this.sessions.length > 0) {
    const sessionIds = new Set();
    const sessionNumbers = new Set();
    const validTrainerIds = new Set(
      Array.isArray(this.trainers) ? this.trainers.map((t) => String(t._id)) : []
    );

    for (const session of this.sessions) {
      if (session.sessionId) {
        if (sessionIds.has(session.sessionId)) {
          this.invalidate('sessions', `Duplicate sessionId "${session.sessionId}" within the workshop.`);
        }
        sessionIds.add(session.sessionId);
      }
      if (session.sessionNumber !== undefined && session.sessionNumber !== null) {
        if (sessionNumbers.has(session.sessionNumber)) {
          this.invalidate('sessions', `Duplicate sessionNumber "${session.sessionNumber}" within the workshop.`);
        }
        sessionNumbers.add(session.sessionNumber);
      }
      if (session.startAt && session.endAt && session.endAt <= session.startAt) {
        this.invalidate('sessions', `Session "${session.title || session.sessionId}" endAt must be after startAt.`);
      }
      // Session containment within overall workshop schedule
      if (this.startAt && session.startAt && session.startAt < this.startAt) {
        this.invalidate('sessions', `Session "${session.title || session.sessionId}" startAt cannot be before workshop startAt.`);
      }
      if (this.endAt && session.endAt && session.endAt > this.endAt) {
        this.invalidate('sessions', `Session "${session.title || session.sessionId}" endAt cannot be after workshop endAt.`);
      }
      if (Array.isArray(session.trainerIds)) {
        for (const tid of session.trainerIds) {
          if (!validTrainerIds.has(String(tid))) {
            this.invalidate('sessions', `Session trainerId "${tid}" does not match any trainer in the workshop.`);
          }
        }
      }
    }
  }

  next();
});

// Approved baseline indexes: explicit schema-level declarations
workshopSchema.index({ workshopId: 1 }, { unique: true });
workshopSchema.index({ approvalStatus: 1, isPublished: 1, lifecycleStatus: 1 });
workshopSchema.index({ departmentId: 1 });
workshopSchema.index({ startAt: 1, endAt: 1 });

export const Workshop = model('Workshop', workshopSchema);
