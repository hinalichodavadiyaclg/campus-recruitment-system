/**
 * Workshop Form Validation and Initialization Logic
 * Pure ES module (no JSX dependencies) to allow automated verification
 */

export const WORKSHOP_CATEGORIES = [
  { value: 'TECHNICAL', label: 'Technical Skills' },
  { value: 'APTITUDE', label: 'Aptitude & Quantitative' },
  { value: 'SOFT_SKILLS', label: 'Soft Skills & Communication' },
  { value: 'CAREER_PREP', label: 'Career Guidance & Resume Building' },
  { value: 'OTHER', label: 'General / Other' }
];

export const WORKSHOP_MODES = [
  { value: 'OFFLINE', label: 'Offline (On Campus)' },
  { value: 'ONLINE', label: 'Online (Virtual)' },
  { value: 'HYBRID', label: 'Hybrid (Campus + Online)' }
];

export const TRAINER_TYPES = [
  { value: 'PLACEMENT_COORDINATOR', label: 'Placement Coordinator' },
  { value: 'PLACEMENT_HEAD', label: 'Placement Officer / Head' },
  { value: 'COMPANY', label: 'Company Trainer / Recruiter' },
  { value: 'EXTERNAL', label: 'External Industry Expert' }
];

/**
 * Returns initial form data.
 * STRICT DIRECTIVE: No default values filled in advance
 * EXCEPT: Ownership Scope and Department for placement coordinator.
 */
export function getInitialWorkshopFormData(isCoordinator = false, coordinatorDeptId = '') {
  const coordDept = isCoordinator ? String(coordinatorDeptId || '') : '';
  return {
    title: '',
    description: '',
    category: '',
    ownershipType: isCoordinator ? 'DEPARTMENT' : '',
    departmentId: coordDept,
    targetCourseScope: 'ALL',
    targetCourseIds: [],
    targetCourseId: 'ALL',
    targetingScope: isCoordinator ? 'SINGLE_DEPARTMENT' : 'ALL_DEPARTMENTS',
    mode: '',
    venue: '',
    meetingLink: '',
    bannerUrl: '',
    maxParticipants: '',
    startAt: '',
    endAt: '',
    registrationOpensAt: '',
    registrationDeadline: '',
    trainers: [],
    targetAudience: { isAllDepartments: false, departmentRules: [] },
    sessions: []
  };
}

/**
 * URL validation helper
 */
export function isValidUrl(str) {
  if (!str || typeof str !== 'string') return false;
  try {
    const parsed = new URL(str);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Maps field error key to corresponding tab ID
 */
export function getTabForErrorKey(key) {
  if (!key) return 'basic';

  if ([
    'title',
    'description',
    'category',
    'maxParticipants',
    'startAt',
    'endAt',
    'registrationDeadline',
    'registrationOpensAt'
  ].includes(key)) {
    return 'basic';
  }
  if (['mode', 'venue', 'meetingLink', 'bannerUrl'].includes(key) || key.startsWith('logistics')) {
    return 'logistics';
  }
  if (key.startsWith('trainer') || key === 'trainers') {
    return 'trainers';
  }
  if (
    key === 'targetAudience' ||
    key === 'targetingScope' ||
    key === 'targetCourseIds_audience' ||
    key === 'targetCourseId' ||
    key === 'targetCourseIds' ||
    key === 'ownershipType' ||
    key === 'departmentId' ||
    key.includes('targetAudience') ||
    key.includes('department') ||
    key.includes('course') ||
    key.includes('ownership')
  ) {
    return 'audience';
  }
  if (key.startsWith('session') || key === 'sessions') {
    return 'sessions';
  }
  return 'audience';
}

/**
 * Constructs the canonical targetAudience payload based on selected scope
 */
export function buildTargetAudiencePayload(formData) {
  if (!formData) return { isAllDepartments: true, departmentRules: [] };

  // If All Departments is selected
  if (formData.targetAudience?.isAllDepartments || formData.targetingScope === 'ALL_DEPARTMENTS') {
    return {
      isAllDepartments: true,
      departmentRules: []
    };
  }

  // If specific department rules are configured
  if (Array.isArray(formData.targetAudience?.departmentRules) && formData.targetAudience.departmentRules.length > 0) {
    const rules = formData.targetAudience.departmentRules
      .filter(r => r && r.departmentId)
      .map(r => {
        const isSpecific = r.targetingMode === 'SELECTED_COURSES_ALL_SEMESTERS' && Array.isArray(r.courseIds) && r.courseIds.length > 0;
        return {
          departmentId: String(r.departmentId),
          targetingMode: isSpecific ? 'SELECTED_COURSES_ALL_SEMESTERS' : 'ALL_COURSES_ALL_SEMESTERS',
          courseIds: isSpecific ? r.courseIds.map(String) : [],
          semesters: [],
          courseSemesterRules: []
        };
      });

    if (rules.length > 0) {
      return {
        isAllDepartments: false,
        departmentRules: rules
      };
    }
  }

  // Fallback for department-specific workshop where departmentId is chosen
  if (formData.departmentId) {
    const deptId = String(formData.departmentId);
    let courseIds = [];
    if (formData.targetCourseScope === 'SPECIFIC') {
      if (Array.isArray(formData.targetCourseIds)) {
        courseIds = formData.targetCourseIds.filter(Boolean).map(String);
      } else if (formData.targetCourseId && formData.targetCourseId !== 'ALL') {
        courseIds = [String(formData.targetCourseId)];
      }
    } else if (Array.isArray(formData.targetCourseIds) && formData.targetCourseIds.length > 0) {
      courseIds = formData.targetCourseIds.filter(Boolean).map(String);
    } else if (formData.targetCourseId && formData.targetCourseId !== 'ALL') {
      courseIds = [String(formData.targetCourseId)];
    }

    const isSpecific = courseIds.length > 0;
    return {
      isAllDepartments: false,
      departmentRules: [
        {
          departmentId: deptId,
          targetingMode: isSpecific ? 'SELECTED_COURSES_ALL_SEMESTERS' : 'ALL_COURSES_ALL_SEMESTERS',
          courseIds: isSpecific ? courseIds : [],
          semesters: [],
          courseSemesterRules: []
        }
      ]
    };
  }

  return { isAllDepartments: true, departmentRules: [] };
}

/**
 * Comprehensive client-side validation for every field in the form.
 */
export function validateWorkshopForm(formData, { isCoordinator = false } = {}) {
  const errors = {};

  if (!formData || typeof formData !== 'object') {
    errors.form = 'Invalid form data';
    return errors;
  }

  // 1. Basic Info - Title
  const trimmedTitle = (formData.title || '').trim();
  if (!trimmedTitle) {
    errors.title = 'Workshop title is required.';
  } else if (trimmedTitle.length < 3) {
    errors.title = 'Workshop title must be at least 3 characters.';
  } else if (trimmedTitle.length > 200) {
    errors.title = 'Workshop title cannot exceed 200 characters.';
  }

  // 2. Basic Info - Description
  const trimmedDesc = (formData.description || '').trim();
  if (!trimmedDesc) {
    errors.description = 'Workshop description is required.';
  } else if (trimmedDesc.length < 10) {
    errors.description = 'Workshop description must be at least 10 characters.';
  } else if (trimmedDesc.length > 5000) {
    errors.description = 'Workshop description cannot exceed 5000 characters.';
  }

  // 3. Basic Info - Category
  if (!formData.category) {
    errors.category = 'Please select a workshop category.';
  } else if (!WORKSHOP_CATEGORIES.some(c => c.value === formData.category)) {
    errors.category = 'Please select a valid workshop category.';
  }

  // 4. Ownership Scope & Department (derived from Target Audience or coordinator context)
  if (formData.ownershipType) {
    if (formData.ownershipType === 'DEPARTMENT') {
      if (!formData.departmentId) {
        const hasDeptRule = Array.isArray(formData.targetAudience?.departmentRules) && formData.targetAudience.departmentRules.length > 0;
        if (!hasDeptRule) {
          errors.departmentId = isCoordinator
            ? 'Department is required. Please ensure your coordinator account is assigned to a department.'
            : 'Department is required for department-specific workshops.';
        }
      }
    } else if (formData.ownershipType === 'CENTRAL_PLACEMENT_CELL') {
      if (isCoordinator) {
        errors.ownershipType = 'Placement Coordinators cannot manage Central Placement Cell workshops.';
      }
    }
  }

  // 5. Basic Info - Max Capacity
  if (formData.maxParticipants === '' || formData.maxParticipants === undefined || formData.maxParticipants === null) {
    errors.maxParticipants = 'Max participant capacity is required.';
  } else {
    const capNum = Number(formData.maxParticipants);
    if (!Number.isInteger(capNum) || capNum < 1) {
      errors.maxParticipants = 'Max capacity must be a positive integer (minimum 1).';
    } else if (capNum > 10000) {
      errors.maxParticipants = 'Max capacity cannot exceed 10,000 participants.';
    }
  }

  // 6. Basic Info - Workshop Starts At
  if (!formData.startAt) {
    errors.startAt = 'Workshop start date and time is required.';
  } else {
    const sDate = new Date(formData.startAt);
    if (isNaN(sDate.getTime())) {
      errors.startAt = 'Please enter a valid start date and time.';
    }
  }

  // 7. Basic Info - Workshop Ends At
  if (!formData.endAt) {
    errors.endAt = 'Workshop end date and time is required.';
  } else {
    const eDate = new Date(formData.endAt);
    if (isNaN(eDate.getTime())) {
      errors.endAt = 'Please enter a valid end date and time.';
    } else if (formData.startAt) {
      const sDate = new Date(formData.startAt);
      if (!isNaN(sDate.getTime()) && eDate <= sDate) {
        errors.endAt = 'Workshop end time must be strictly after workshop start time.';
      }
    }
  }

  // 8. Basic Info - Registration Deadline
  if (!formData.registrationDeadline) {
    errors.registrationDeadline = 'Registration deadline date and time is required.';
  } else {
    const dDate = new Date(formData.registrationDeadline);
    if (isNaN(dDate.getTime())) {
      errors.registrationDeadline = 'Please enter a valid registration deadline.';
    } else {
      if (formData.startAt) {
        const sDate = new Date(formData.startAt);
        if (!isNaN(sDate.getTime()) && dDate > sDate) {
          errors.registrationDeadline = 'Registration deadline cannot be after workshop start time.';
        }
      }
      if (formData.registrationOpensAt) {
        const oDate = new Date(formData.registrationOpensAt);
        if (!isNaN(oDate.getTime()) && dDate <= oDate) {
          errors.registrationDeadline = 'Registration deadline must be after registration opens time.';
        }
      }
    }
  }

  // 9. Basic Info - Registration Opens At (Optional)
  if (formData.registrationOpensAt) {
    const oDate = new Date(formData.registrationOpensAt);
    if (isNaN(oDate.getTime())) {
      errors.registrationOpensAt = 'Please enter a valid registration opens date and time.';
    } else if (formData.registrationDeadline) {
      const dDate = new Date(formData.registrationDeadline);
      if (!isNaN(dDate.getTime()) && oDate >= dDate) {
        errors.registrationOpensAt = 'Registration opens time must be strictly before registration deadline.';
      }
    }
  }

  // 10. Logistics - Delivery Mode
  if (!formData.mode) {
    errors.mode = 'Please select a delivery mode.';
  } else if (!['OFFLINE', 'ONLINE', 'HYBRID'].includes(formData.mode)) {
    errors.mode = 'Invalid delivery mode selected.';
  }

  // 11. Logistics - Venue (required for OFFLINE or HYBRID)
  if (formData.mode === 'OFFLINE' || formData.mode === 'HYBRID') {
    const trimmedVenue = (formData.venue || '').trim();
    if (!trimmedVenue) {
      errors.venue = 'On-campus venue is required for offline/hybrid workshops.';
    } else if (trimmedVenue.length < 3) {
      errors.venue = 'Venue must be at least 3 characters.';
    } else if (trimmedVenue.length > 200) {
      errors.venue = 'Venue cannot exceed 200 characters.';
    }
  }

  // 12. Logistics - Meeting Link (required for ONLINE or HYBRID)
  if (formData.mode === 'ONLINE' || formData.mode === 'HYBRID') {
    const trimmedMeeting = (formData.meetingLink || '').trim();
    if (!trimmedMeeting) {
      errors.meetingLink = 'Virtual meeting link is required for online/hybrid workshops.';
    } else if (!isValidUrl(trimmedMeeting)) {
      errors.meetingLink = 'Meeting link must be a valid URL starting with http:// or https://';
    } else if (trimmedMeeting.length > 1000) {
      errors.meetingLink = 'Meeting link cannot exceed 1000 characters.';
    }
  }

  // 13. Logistics - Banner URL (Optional)
  if (formData.bannerUrl && formData.bannerUrl.trim()) {
    const trimmedBanner = formData.bannerUrl.trim();
    if (!isValidUrl(trimmedBanner)) {
      errors.bannerUrl = 'Banner URL must be a valid URL starting with http:// or https://';
    } else if (trimmedBanner.length > 1000) {
      errors.bannerUrl = 'Banner URL cannot exceed 1000 characters.';
    }
  }

  // 14. Trainers validation
  if (Array.isArray(formData.trainers)) {
    formData.trainers.forEach((t, idx) => {
      const trimmedName = (t.name || '').trim();
      if (!trimmedName) {
        errors[`trainer_${idx}_name`] = 'Trainer name is required.';
      } else if (trimmedName.length < 2) {
        errors[`trainer_${idx}_name`] = 'Trainer name must be at least 2 characters.';
      } else if (trimmedName.length > 100) {
        errors[`trainer_${idx}_name`] = 'Trainer name cannot exceed 100 characters.';
      }

      if (!t.trainerType) {
        errors[`trainer_${idx}_type`] = 'Trainer type is required.';
      }

      if (t.designation && t.designation.trim().length > 100) {
        errors[`trainer_${idx}_designation`] = 'Designation cannot exceed 100 characters.';
      }
      if (t.organization && t.organization.trim().length > 100) {
        errors[`trainer_${idx}_organization`] = 'Organization cannot exceed 100 characters.';
      }
    });
  }

  // 15. Target Audience & Course Selection validation
  if (formData.targetCourseScope === 'SPECIFIC') {
    if (!Array.isArray(formData.targetCourseIds) || formData.targetCourseIds.length === 0) {
      errors.targetCourseIds = 'Please select at least one course for specific course targeting, or switch to "All Courses in this Department".';
    }
  }

  if (!formData.targetAudience?.isAllDepartments) {
    const rules = formData.targetAudience?.departmentRules || [];
    if (!Array.isArray(rules) || rules.length === 0) {
      if (formData.targetingScope === 'MULTI_DEPARTMENT') {
        errors.targetAudience = 'Please select at least one department for multi-department targeting.';
      } else if (!formData.departmentId) {
        errors.targetAudience = isCoordinator
          ? 'Department is required for coordinator workshops.'
          : 'Please select at least one department or choose All Departments.';
      }
    } else {
      for (const r of rules) {
        if (r.targetingMode === 'SELECTED_COURSES_ALL_SEMESTERS') {
          if (!Array.isArray(r.courseIds) || r.courseIds.length === 0) {
            errors.targetAudience = formData.targetingScope === 'MULTI_DEPARTMENT'
              ? 'Please select at least one course for each department with specific course targeting.'
              : 'Please select at least one course for each targeted department.';
            break;
          }
        }
      }
    }
  }

  // 16. Sessions validation
  if (!Array.isArray(formData.sessions) || formData.sessions.length === 0) {
    errors.sessions = 'Every workshop must have at least one session. Please click "+ Add Session".';
  } else {
    const wsStart = formData.startAt ? new Date(formData.startAt) : null;
    const wsEnd = formData.endAt ? new Date(formData.endAt) : null;
    const wsStartValid = wsStart && !isNaN(wsStart.getTime());
    const wsEndValid = wsEnd && !isNaN(wsEnd.getTime());

    formData.sessions.forEach((s, idx) => {
      const trimmedSessionTitle = (s.title || '').trim();
      if (!trimmedSessionTitle) {
        errors[`session_${idx}_title`] = 'Session title is required.';
      } else if (trimmedSessionTitle.length < 2) {
        errors[`session_${idx}_title`] = 'Session title must be at least 2 characters.';
      } else if (trimmedSessionTitle.length > 200) {
        errors[`session_${idx}_title`] = 'Session title cannot exceed 200 characters.';
      }

      if (!s.startAt) {
        errors[`session_${idx}_startAt`] = 'Session start date and time is required.';
      } else {
        const sStart = new Date(s.startAt);
        if (isNaN(sStart.getTime())) {
          errors[`session_${idx}_startAt`] = 'Please enter a valid start date and time.';
        } else if (wsStartValid && sStart < wsStart) {
          errors[`session_${idx}_startAt`] = `Session start cannot be before workshop start (${new Date(formData.startAt).toLocaleString()}).`;
        }
      }

      if (!s.endAt) {
        errors[`session_${idx}_endAt`] = 'Session end date and time is required.';
      } else {
        const sEnd = new Date(s.endAt);
        if (isNaN(sEnd.getTime())) {
          errors[`session_${idx}_endAt`] = 'Please enter a valid end date and time.';
        } else {
          if (s.startAt) {
            const sStart = new Date(s.startAt);
            if (!isNaN(sStart.getTime()) && sEnd <= sStart) {
              errors[`session_${idx}_endAt`] = 'Session end time must be strictly after session start time.';
            }
          }
          if (wsEndValid && sEnd > wsEnd) {
            errors[`session_${idx}_endAt`] = `Session end cannot be after workshop end (${new Date(formData.endAt).toLocaleString()}).`;
          }
        }
      }
    });
  }

  return errors;
}
