import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal.jsx';
import { departmentService } from '../../services/department.service.js';
import { courseService } from '../../services/course.service.js';
import { companyService } from '../../services/company.service.js';
import { workshopService } from '../../services/workshop.service.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { PlusIcon, TrashIcon } from '../common/Icons.jsx';
import {
  WORKSHOP_CATEGORIES,
  WORKSHOP_MODES,
  TRAINER_TYPES,
  getInitialWorkshopFormData,
  getTabForErrorKey,
  validateWorkshopForm,
  buildTargetAudiencePayload,
  canUserEditWorkshop,
  canUserReviewWorkshopEdit
} from './workshopValidation.js';

// Re-export constants for external consumers
export {
  WORKSHOP_CATEGORIES,
  WORKSHOP_MODES,
  TRAINER_TYPES,
  getInitialWorkshopFormData,
  getTabForErrorKey,
  validateWorkshopForm,
  buildTargetAudiencePayload,
  canUserEditWorkshop,
  canUserReviewWorkshopEdit
};

export function WorkshopModal({ isOpen, workshop = null, onClose, onSubmit, isProcessing }) {
  const { user, role } = useAuth();
  const isEdit = Boolean(workshop?._id);
  const isPublished = Boolean(workshop?.isPublished);

  const isCoordinator = role?.id === 'ROLE_PLACEMENT_COORDINATOR' || user?.roleId === 'ROLE_PLACEMENT_COORDINATOR';
  const isCompany = user?.userType === 'COMPANY' || role?.id === 'ROLE_COMPANY' || user?.roleId === 'ROLE_COMPANY';

  // Form State
  const [activeTab, setActiveTab] = useState('basic');
  const [formData, setFormData] = useState(() => getInitialWorkshopFormData());
  const [departments, setDepartments] = useState([]);
  const [courses, setCourses] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [fieldErrors, setFieldErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [submitAction, setSubmitAction] = useState('submit');

  // Helper to resolve coordinator department ID from user object or department list
  const getCoordinatorDeptId = (deptList = departments) => {
    if (!isCoordinator) return '';
    const rawDept = user?.departmentId?._id || user?.departmentId || user?.department?._id || user?.department;
    if (!rawDept) return '';
    const deptStr = typeof rawDept === 'object' && rawDept._id ? String(rawDept._id) : String(rawDept);
    const match = (deptList || []).find(
      (d) => String(d._id) === deptStr ||
             d.name?.toLowerCase() === deptStr.toLowerCase() ||
             d.code?.toLowerCase() === deptStr.toLowerCase()
    );
    return match ? String(match._id) : (/^[a-fA-F0-9]{24}$/.test(deptStr) ? deptStr : '');
  };

  // Helper to format ISO to datetime-local input string
  const toLocalInputValue = (isoStr) => {
    if (!isoStr) return '';
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return '';
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
      return '';
    }
  };

  // Helper to format datetime-local string to ISO UTC
  const toIsoUtc = (localStr) => {
    if (!localStr) return undefined;
    try {
      const d = new Date(localStr);
      return isNaN(d.getTime()) ? undefined : d.toISOString();
    } catch {
      return undefined;
    }
  };

  useEffect(() => {
    if (isOpen) {
      setFieldErrors({});
      setServerError('');
      setActiveTab('basic');

      // Load departments & courses for selector
      departmentService.listDepartments({ limit: 100 })
        .then((res) => {
          const list = res.items || [];
          setDepartments(list);
          if (!workshop && isCoordinator) {
            const coordDept = getCoordinatorDeptId(list);
            if (coordDept) {
              setFormData(prev => ({
                ...prev,
                departmentId: coordDept,
                ownershipType: 'DEPARTMENT',
                targetingScope: 'SINGLE_DEPARTMENT'
              }));
            }
          }
        })
        .catch(() => {});

      courseService.listCourses({ limit: 100 })
        .then((res) => setCourses(res.items || []))
        .catch(() => {});

      // Load company records for Company Trainer selection
      if (isCompany) {
        companyService.getMyProfile()
          .then((comp) => {
            if (comp && (comp._id || comp.companyId)) {
              setCompanies([comp]);
            } else if (user?.companyId) {
              setCompanies([{ _id: String(user.companyId), companyName: user.companyName || 'My Company' }]);
            }
          })
          .catch(() => {
            if (user?.companyId) {
              setCompanies([{ _id: String(user.companyId), companyName: user.companyName || 'My Company' }]);
            }
          });
      } else {
        companyService.listCompanies({ limit: 100 })
          .then((res) => {
            const list = res.items || [];
            if (workshop && Array.isArray(workshop.trainers)) {
              workshop.trainers.forEach((t) => {
                if (t.companyId && typeof t.companyId === 'object' && t.companyId._id) {
                  if (!list.some(c => String(c._id) === String(t.companyId._id))) {
                    list.push(t.companyId);
                  }
                }
              });
            }
            setCompanies(list);
          })
          .catch(() => {});
      }

      // Fetch certificate templates
      workshopService.getTemplates()
        .then((res) => {
          setTemplates(res?.data || res || []);
        })
        .catch(() => {});

      if (workshop) {
        // Resolve targeting scope from existing workshop
        let targetingScope = 'ALL_DEPARTMENTS';
        let targetCourseScope = 'ALL';
        let targetCourseIds = [];
        let targetCourseId = 'ALL';

        if (workshop.targetAudience?.isAllDepartments) {
          targetingScope = 'ALL_DEPARTMENTS';
          targetCourseScope = 'ALL';
          targetCourseIds = [];
        } else if (Array.isArray(workshop.targetAudience?.departmentRules)) {
          const rules = workshop.targetAudience.departmentRules;
          if (rules.length === 1) {
            targetingScope = 'SINGLE_DEPARTMENT';
            if (rules[0].targetingMode === 'SELECTED_COURSES_ALL_SEMESTERS' && rules[0].courseIds?.length > 0) {
              targetCourseScope = 'SPECIFIC';
              targetCourseIds = rules[0].courseIds.map(c => String(c?._id || c));
              targetCourseId = targetCourseIds.length === 1 ? targetCourseIds[0] : 'MULTIPLE';
            } else {
              targetCourseScope = 'ALL';
              targetCourseIds = [];
              targetCourseId = 'ALL';
            }
          } else if (rules.length > 1) {
            targetingScope = 'MULTI_DEPARTMENT';
          }
        }

        setFormData({
          title: workshop.title || '',
          description: workshop.description || '',
          category: workshop.category || '',
          ownershipType: workshop.ownershipType || 'DEPARTMENT',
          departmentId: workshop.departmentId?._id || workshop.departmentId || '',
          targetCourseScope,
          targetCourseIds,
          targetCourseId,
          targetingScope,
          mode: workshop.mode || '',
          venue: workshop.venue || '',
          meetingLink: workshop.meetingLink || '',
          bannerUrl: workshop.bannerUrl || '',
          maxParticipants: workshop.maxParticipants ?? '',
          startAt: toLocalInputValue(workshop.startAt),
          endAt: toLocalInputValue(workshop.endAt),
          registrationOpensAt: toLocalInputValue(workshop.registrationOpensAt),
          registrationDeadline: toLocalInputValue(workshop.registrationDeadline),
          trainers: Array.isArray(workshop.trainers) ? workshop.trainers.map(t => ({
            trainerType: t.trainerType || 'EXTERNAL',
            name: t.name || '',
            designation: t.designation || '',
            organization: t.organization || '',
            companyId: typeof t.companyId === 'object' && t.companyId?._id
              ? String(t.companyId._id)
              : (t.companyId ? String(t.companyId) : ''),
            userId: typeof t.userId === 'object' && t.userId?._id
              ? String(t.userId._id)
              : (t.userId ? String(t.userId) : '')
          })) : [],
          targetAudience: workshop.targetAudience ? {
            isAllDepartments: Boolean(workshop.targetAudience.isAllDepartments),
            departmentRules: Array.isArray(workshop.targetAudience.departmentRules)
              ? workshop.targetAudience.departmentRules.map(r => ({
                  ...r,
                  courseIds: (r.courseIds || []).map(c => String(c?._id || c))
                }))
              : []
          } : { isAllDepartments: false, departmentRules: [] },
          sessions: Array.isArray(workshop.sessions) && workshop.sessions.length > 0
            ? workshop.sessions.map(s => ({
                ...s,
                startAt: toLocalInputValue(s.startAt),
                endAt: toLocalInputValue(s.endAt),
                trainerIds: s.trainerIds || []
              }))
            : [],
          certificateTemplateId: workshop.certificateTemplateId?._id || workshop.certificateTemplateId || ''
        });
      } else {
        // Strict directive: No default values filled in advance
        // EXCEPT: Ownership Scope and Department for placement coordinator
        const coordDept = getCoordinatorDeptId();
        setFormData(getInitialWorkshopFormData(isCoordinator, coordDept));
      }
    }
  }, [isOpen, workshop]);

  // Form Field Updates
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    const val = type === 'checkbox' ? checked : value;
    setFormData((prev) => ({ ...prev, [name]: val }));

    if (fieldErrors[name]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }

    if (name === 'startAt' || name === 'endAt') {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next.startAt;
        delete next.endAt;
        return next;
      });
    }
    if (name === 'registrationDeadline' || name === 'registrationOpensAt') {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next.registrationDeadline;
        delete next.registrationOpensAt;
        return next;
      });
    }
  };

  // Target Audience Checkbox Helpers
  const isAllDepartmentsSelected = Boolean(formData.targetAudience?.isAllDepartments);

  const isDepartmentSelected = (deptId) => {
    if (isAllDepartmentsSelected) return true;
    return (formData.targetAudience?.departmentRules || []).some(
      r => String(r.departmentId) === String(deptId)
    );
  };

  const isAllCoursesForDeptSelected = (deptId) => {
    if (isAllDepartmentsSelected) return true;
    const rule = (formData.targetAudience?.departmentRules || []).find(
      r => String(r.departmentId) === String(deptId)
    );
    if (!rule) return false;
    if (rule.targetingMode === 'ALL_COURSES_ALL_SEMESTERS') return true;
    const deptCourses = courses.filter(c => String(c.departmentId?._id || c.departmentId) === String(deptId));
    return deptCourses.length > 0 && Array.isArray(rule.courseIds) && deptCourses.every(c => rule.courseIds.includes(String(c._id)));
  };

  const isCourseSelected = (deptId, courseId) => {
    if (isAllDepartmentsSelected) return true;
    const rule = (formData.targetAudience?.departmentRules || []).find(
      r => String(r.departmentId) === String(deptId)
    );
    if (!rule) return false;
    if (rule.targetingMode === 'ALL_COURSES_ALL_SEMESTERS') return true;
    return Array.isArray(rule.courseIds) && rule.courseIds.includes(String(courseId));
  };

  // Toggle Handlers
  const handleToggleAllDepartments = (checked) => {
    setFormData(prev => ({
      ...prev,
      targetAudience: checked
        ? { isAllDepartments: true, departmentRules: [] }
        : { isAllDepartments: false, departmentRules: [] }
    }));
    if (fieldErrors.targetAudience) {
      setFieldErrors(prev => {
        const next = { ...prev };
        delete next.targetAudience;
        return next;
      });
    }
  };

  const handleToggleDepartment = (deptId, checked) => {
    setFormData(prev => {
      let currentRules = [];
      if (prev.targetAudience?.isAllDepartments) {
        currentRules = departments
          .filter(d => String(d._id) !== String(deptId))
          .map(d => ({
            departmentId: String(d._id),
            targetingMode: 'ALL_COURSES_ALL_SEMESTERS',
            courseIds: [],
            semesters: [],
            courseSemesterRules: []
          }));
        return {
          ...prev,
          targetAudience: { isAllDepartments: false, departmentRules: currentRules }
        };
      }

      currentRules = prev.targetAudience?.departmentRules || [];
      let newRules;
      if (checked) {
        newRules = [
          ...currentRules.filter(r => String(r.departmentId) !== String(deptId)),
          {
            departmentId: String(deptId),
            targetingMode: 'ALL_COURSES_ALL_SEMESTERS',
            courseIds: [],
            semesters: [],
            courseSemesterRules: []
          }
        ];
        if (departments.length > 0 && newRules.length === departments.length && newRules.every(r => r.targetingMode === 'ALL_COURSES_ALL_SEMESTERS')) {
          return {
            ...prev,
            targetAudience: { isAllDepartments: true, departmentRules: [] }
          };
        }
      } else {
        newRules = currentRules.filter(r => String(r.departmentId) !== String(deptId));
      }

      return {
        ...prev,
        targetAudience: { isAllDepartments: false, departmentRules: newRules }
      };
    });

    if (fieldErrors.targetAudience) {
      setFieldErrors(prev => {
        const next = { ...prev };
        delete next.targetAudience;
        return next;
      });
    }
  };

  const handleToggleAllCoursesForDept = (deptId, checked) => {
    setFormData(prev => {
      let currentRules = [];
      if (prev.targetAudience?.isAllDepartments) {
        if (!checked) {
          currentRules = departments
            .filter(d => String(d._id) !== String(deptId))
            .map(d => ({
              departmentId: String(d._id),
              targetingMode: 'ALL_COURSES_ALL_SEMESTERS',
              courseIds: [],
              semesters: [],
              courseSemesterRules: []
            }));
          return {
            ...prev,
            targetAudience: { isAllDepartments: false, departmentRules: currentRules }
          };
        } else {
          return prev;
        }
      }

      currentRules = prev.targetAudience?.departmentRules || [];
      let newRules;
      if (checked) {
        newRules = [
          ...currentRules.filter(r => String(r.departmentId) !== String(deptId)),
          {
            departmentId: String(deptId),
            targetingMode: 'ALL_COURSES_ALL_SEMESTERS',
            courseIds: [],
            semesters: [],
            courseSemesterRules: []
          }
        ];
        if (departments.length > 0 && newRules.length === departments.length && newRules.every(r => r.targetingMode === 'ALL_COURSES_ALL_SEMESTERS')) {
          return {
            ...prev,
            targetAudience: { isAllDepartments: true, departmentRules: [] }
          };
        }
      } else {
        newRules = currentRules.filter(r => String(r.departmentId) !== String(deptId));
      }

      return {
        ...prev,
        targetAudience: { isAllDepartments: false, departmentRules: newRules }
      };
    });

    if (fieldErrors.targetAudience) {
      setFieldErrors(prev => {
        const next = { ...prev };
        delete next.targetAudience;
        return next;
      });
    }
  };

  const handleToggleCourse = (deptId, courseId, checked) => {
    setFormData(prev => {
      const deptCourses = courses.filter(c => String(c.departmentId?._id || c.departmentId) === String(deptId));
      const allDeptCourseIds = deptCourses.map(c => String(c._id));

      let currentRules = [];
      if (prev.targetAudience?.isAllDepartments) {
        currentRules = departments.map(d => ({
          departmentId: String(d._id),
          targetingMode: 'ALL_COURSES_ALL_SEMESTERS',
          courseIds: [],
          semesters: [],
          courseSemesterRules: []
        }));
      } else {
        currentRules = prev.targetAudience?.departmentRules || [];
      }

      const existingRule = currentRules.find(r => String(r.departmentId) === String(deptId));
      let currentCourseIds = [];
      if (existingRule) {
        if (existingRule.targetingMode === 'ALL_COURSES_ALL_SEMESTERS') {
          currentCourseIds = [...allDeptCourseIds];
        } else {
          currentCourseIds = (existingRule.courseIds || []).map(String);
        }
      }

      let nextCourseIds = [];
      if (checked) {
        nextCourseIds = [...new Set([...currentCourseIds, String(courseId)])];
      } else {
        nextCourseIds = currentCourseIds.filter(id => id !== String(courseId));
      }

      let updatedRule;
      if (nextCourseIds.length === 0) {
        updatedRule = null;
      } else if (allDeptCourseIds.length > 0 && nextCourseIds.length === allDeptCourseIds.length) {
        updatedRule = {
          departmentId: String(deptId),
          targetingMode: 'ALL_COURSES_ALL_SEMESTERS',
          courseIds: [],
          semesters: [],
          courseSemesterRules: []
        };
      } else {
        updatedRule = {
          departmentId: String(deptId),
          targetingMode: 'SELECTED_COURSES_ALL_SEMESTERS',
          courseIds: nextCourseIds,
          semesters: [],
          courseSemesterRules: []
        };
      }

      const filteredRules = currentRules.filter(r => String(r.departmentId) !== String(deptId));
      const newRules = updatedRule ? [...filteredRules, updatedRule] : filteredRules;

      if (departments.length > 0 && newRules.length === departments.length && newRules.every(r => r.targetingMode === 'ALL_COURSES_ALL_SEMESTERS')) {
        return {
          ...prev,
          targetAudience: { isAllDepartments: true, departmentRules: [] }
        };
      }

      return {
        ...prev,
        targetAudience: { isAllDepartments: false, departmentRules: newRules }
      };
    });

    if (fieldErrors.targetAudience) {
      setFieldErrors(prev => {
        const next = { ...prev };
        delete next.targetAudience;
        return next;
      });
    }
  };

  // Trainer Management
  const addTrainer = () => {
    let defaultType = 'EXTERNAL';
    let defaultCompanyId = '';
    let defaultUserId = undefined;
    let defaultOrg = '';

    if (isCompany) {
      defaultType = 'COMPANY';
      const defaultComp = (companies && companies.length > 0) ? companies[0] : null;
      defaultCompanyId = defaultComp ? String(defaultComp._id) : (user?.companyId ? String(user.companyId) : '');
      defaultOrg = defaultComp?.companyName || '';
    } else if (isCoordinator) {
      defaultType = 'PLACEMENT_COORDINATOR';
      defaultUserId = user?._id || user?.userId;
      defaultOrg = 'VVWU Central Placement Cell';
    }

    setFormData((prev) => ({
      ...prev,
      trainers: [
        ...prev.trainers,
        {
          trainerType: defaultType,
          name: '',
          designation: '',
          organization: defaultOrg,
          companyId: defaultCompanyId,
          userId: defaultUserId
        }
      ]
    }));
  };

  const removeTrainer = (idx) => {
    setFormData((prev) => ({
      ...prev,
      trainers: prev.trainers.filter((_, i) => i !== idx)
    }));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[`trainer_${idx}_name`];
      delete next[`trainer_${idx}_type`];
      delete next[`trainer_${idx}_companyId`];
      delete next[`trainer_${idx}_userId`];
      delete next[`trainer_${idx}_designation`];
      delete next[`trainer_${idx}_organization`];
      return next;
    });
  };

  const updateTrainer = (idx, field, value) => {
    setFormData((prev) => {
      const copy = [...prev.trainers];
      const current = { ...copy[idx], [field]: value };

      if (field === 'trainerType') {
        if (value === 'COMPANY') {
          current.userId = undefined;
          delete current.userId;
          if (!current.companyId) {
            const defaultComp = (companies && companies.length > 0) ? companies[0] : null;
            if (isCompany && user?.companyId) {
              current.companyId = String(user.companyId);
            } else if (defaultComp && companies.length === 1) {
              current.companyId = String(defaultComp._id);
            }
          }
          if (current.companyId) {
            const matched = (companies || []).find(c => String(c._id) === String(current.companyId));
            if (matched) current.organization = matched.companyName;
          }
        } else if (value === 'PLACEMENT_COORDINATOR' || value === 'PLACEMENT_HEAD') {
          current.companyId = undefined;
          delete current.companyId;
          current.userId = current.userId || user?._id || user?.userId;
          if (!current.organization) {
            current.organization = 'VVWU Central Placement Cell';
          }
        } else if (value === 'EXTERNAL') {
          current.userId = undefined;
          delete current.userId;
          current.companyId = undefined;
          delete current.companyId;
        }
      }

      if (field === 'companyId') {
        current.companyId = value;
        const matched = (companies || []).find(c => String(c._id) === String(value));
        if (matched) {
          current.organization = matched.companyName;
        }
      }

      copy[idx] = current;
      return { ...prev, trainers: copy };
    });

    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[`trainer_${idx}_${field}`];
      if (field === 'trainerType') {
        delete next[`trainer_${idx}_companyId`];
        delete next[`trainer_${idx}_userId`];
        delete next[`trainer_${idx}_organization`];
      }
      return next;
    });
  };

  // Sessions Management
  const addSession = () => {
    const nextNum = formData.sessions.length + 1;
    setFormData((prev) => ({
      ...prev,
      sessions: [
        ...prev.sessions,
        {
          sessionId: `SES-${String(nextNum).padStart(2, '0')}`,
          sessionNumber: nextNum,
          title: '',
          startAt: '',
          endAt: '',
          trainerIds: [],
          isAttendanceRequired: true
        }
      ]
    }));
    if (fieldErrors.sessions) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next.sessions;
        return next;
      });
    }
  };

  const removeSession = (idx) => {
    setFormData((prev) => ({
      ...prev,
      sessions: prev.sessions.filter((_, i) => i !== idx)
    }));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[`session_${idx}_title`];
      delete next[`session_${idx}_startAt`];
      delete next[`session_${idx}_endAt`];
      return next;
    });
  };

  const updateSession = (idx, field, value) => {
    setFormData((prev) => {
      const copy = [...prev.sessions];
      copy[idx] = { ...copy[idx], [field]: value };
      return { ...prev, sessions: copy };
    });
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[`session_${idx}_${field}`];
      if (field === 'startAt' || field === 'endAt') {
        delete next[`session_${idx}_startAt`];
        delete next[`session_${idx}_endAt`];
      }
      delete next.sessions;
      return next;
    });
  };

  // Validation & Submission
  const handleSubmit = async (e, actionType = submitAction) => {
    if (e && e.preventDefault) e.preventDefault();
    setSubmitAction(actionType);
    setServerError('');

    const errors = validateWorkshopForm(formData, { isCoordinator });

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      const firstTab = Object.keys(errors).map(getTabForErrorKey).find(Boolean);
      if (firstTab) setActiveTab(firstTab);
      return;
    }

    // Build Payload
    const payload = {
      title: formData.title.trim(),
      description: formData.description.trim(),
      category: formData.category,
      mode: formData.mode,
      maxParticipants: parseInt(formData.maxParticipants, 10),
      startAt: toIsoUtc(formData.startAt),
      endAt: toIsoUtc(formData.endAt),
      registrationDeadline: toIsoUtc(formData.registrationDeadline)
    };

    if (actionType === 'draft') {
      payload.approvalStatus = 'DRAFT';
    }

    if (formData.registrationOpensAt) {
      payload.registrationOpensAt = toIsoUtc(formData.registrationOpensAt);
    }
    if (formData.venue) payload.venue = formData.venue.trim();
    if (formData.meetingLink) payload.meetingLink = formData.meetingLink.trim();
    if (formData.bannerUrl) payload.bannerUrl = formData.bannerUrl.trim();
    if (formData.certificateTemplateId) {
      payload.certificateTemplateId = formData.certificateTemplateId;
    } else {
      payload.certificateTemplateId = null;
    }

    // Map trainers
    payload.trainers = formData.trainers.map(t => {
      const clean = {
        trainerType: t.trainerType,
        name: (t.name || '').trim()
      };
      if (t.designation && t.designation.trim()) {
        clean.designation = t.designation.trim();
      }
      if (t.organization && t.organization.trim()) {
        clean.organization = t.organization.trim();
      }

      if (t.trainerType === 'COMPANY') {
        const compId = typeof t.companyId === 'object' && t.companyId?._id ? String(t.companyId._id) : String(t.companyId || '').trim();
        if (compId) {
          clean.companyId = compId;
        }
        // STRICT: Never send userId for COMPANY
      } else if (t.trainerType === 'PLACEMENT_COORDINATOR' || t.trainerType === 'PLACEMENT_HEAD') {
        const uid = typeof t.userId === 'object' && t.userId?._id ? String(t.userId._id) : String(t.userId || user?._id || user?.userId || '').trim();
        if (uid) {
          clean.userId = uid;
        }
        // STRICT: Never send companyId for PLACEMENT_*
      } else if (t.trainerType === 'EXTERNAL') {
        // STRICT: Never send userId or companyId for EXTERNAL
      }

      return clean;
    });

    // Map sessions
    payload.sessions = formData.sessions.map((s, idx) => ({
      sessionId: s.sessionId || `SES-${String(idx + 1).padStart(2, '0')}`,
      sessionNumber: idx + 1,
      title: s.title.trim(),
      description: s.description?.trim() || undefined,
      startAt: toIsoUtc(s.startAt),
      endAt: toIsoUtc(s.endAt),
      trainerIds: s.trainerIds || [],
      venue: s.venue?.trim() || undefined,
      meetingLink: s.meetingLink?.trim() || undefined,
      isAttendanceRequired: s.isAttendanceRequired !== false
    }));

    // Target Audience construction
    const targetAudiencePayload = buildTargetAudiencePayload(formData);
    payload.targetAudience = targetAudiencePayload;

    // Derive ownershipType and departmentId from Target Audience or Coordinator role
    if (isCoordinator) {
      const coordDept = getCoordinatorDeptId() || (typeof user?.departmentId === 'string' ? user.departmentId : '') || formData.departmentId;
      payload.ownershipType = 'DEPARTMENT';
      if (coordDept && /^[a-fA-F0-9]{24}$/.test(String(coordDept))) {
        payload.departmentId = String(coordDept);
      } else if (targetAudiencePayload.departmentRules.length > 0 && targetAudiencePayload.departmentRules[0].departmentId) {
        payload.departmentId = String(targetAudiencePayload.departmentRules[0].departmentId);
      }
    } else if (targetAudiencePayload.isAllDepartments) {
      payload.ownershipType = 'CENTRAL_PLACEMENT_CELL';
      delete payload.departmentId;
    } else if (targetAudiencePayload.departmentRules.length === 1) {
      payload.ownershipType = 'DEPARTMENT';
      payload.departmentId = String(targetAudiencePayload.departmentRules[0].departmentId);
    } else {
      payload.ownershipType = 'CENTRAL_PLACEMENT_CELL';
      delete payload.departmentId;
    }

    // Freeze structural ownership and targeting fields on published workshops
    if (isEdit && isPublished) {
      delete payload.ownershipType;
      delete payload.departmentId;
      delete payload.targetAudience;
    }

    if (isEdit && workshop?.updatedAt) {
      payload.expectedUpdatedAt = workshop.updatedAt;
    }

    try {
      await onSubmit(payload, actionType);
    } catch (err) {
      const detailedMessages = [];
      const mappedErrors = {};

      if (err.details && typeof err.details === 'object') {
        const fieldMap = err.details.fieldErrors || err.details;
        if (typeof fieldMap === 'object') {
          Object.entries(fieldMap).forEach(([field, msgs]) => {
            const msgList = Array.isArray(msgs) ? msgs : [String(msgs)];
            msgList.forEach((m) => {
              if (m && typeof m === 'string' && !detailedMessages.includes(m)) {
                detailedMessages.push(m);
              }
            });
            let msg = msgList[0] || 'Invalid field';

            // User-friendly mappings for trainer validation errors
            if (msg.includes('companyId is required when trainerType is COMPANY')) {
              msg = 'Please select a company for this company trainer.';
            } else if (msg.includes('userId must be absent when trainerType is COMPANY')) {
              msg = 'Company trainer cannot have internal user credentials.';
            } else if (msg.includes('userId is required when trainerType is')) {
              msg = 'Internal placement staff account is required for this trainer.';
            } else if (msg.includes('companyId must be absent when trainerType is')) {
              msg = 'Company cannot be assigned to this trainer type.';
            }

            if (field === 'body' || field === 'formErrors') {
              msgList.forEach((m) => {
                const lower = (m || '').toLowerCase();
                if (lower.includes('department') || lower.includes('ownership') || lower.includes('course') || lower.includes('audience')) {
                  mappedErrors.targetAudience = m;
                  mappedErrors.departmentId = m;
                } else if (lower.includes('title')) {
                  mappedErrors.title = m;
                } else if (lower.includes('description')) {
                  mappedErrors.description = m;
                } else if (lower.includes('category')) {
                  mappedErrors.category = m;
                } else if (lower.includes('mode')) {
                  mappedErrors.mode = m;
                } else if (lower.includes('venue')) {
                  mappedErrors.venue = m;
                } else if (lower.includes('meetinglink')) {
                  mappedErrors.meetingLink = m;
                } else if (lower.includes('participant') || lower.includes('capacity')) {
                  mappedErrors.maxParticipants = m;
                } else if (lower.includes('session')) {
                  mappedErrors.sessions = m;
                } else if (lower.includes('trainer')) {
                  mappedErrors.trainers = m;
                } else if (lower.includes('startat') || lower.includes('endat')) {
                  mappedErrors.startAt = m;
                } else if (lower.includes('registration')) {
                  mappedErrors.registrationDeadline = m;
                }
              });
              return;
            }

            const sessionMatch = field.match(/sessions[.[\]]+(\d+)[.[\]]+(\w+)/);
            const trainerMatch = field.match(/trainers[.[\]]+(\d+)[.[\]]+(\w+)/);
            if (sessionMatch) {
              mappedErrors[`session_${sessionMatch[1]}_${sessionMatch[2]}`] = msg;
            } else if (trainerMatch) {
              mappedErrors[`trainer_${trainerMatch[1]}_${trainerMatch[2]}`] = msg;
            } else if (field === 'departmentId' || field === 'ownershipType') {
              mappedErrors.departmentId = msg;
              mappedErrors.targetAudience = msg;
            } else {
              mappedErrors[field] = msg;
            }
          });
        }
      }

      if (Object.keys(mappedErrors).length > 0) {
        setFieldErrors(mappedErrors);
        const firstTab = Object.keys(mappedErrors).map(getTabForErrorKey).find(Boolean);
        if (firstTab) setActiveTab(firstTab);
        setServerError('Please correct the highlighted errors in the form before submitting.');
      } else if (detailedMessages.length > 0) {
        setServerError(detailedMessages.join(' | '));
      } else {
        setServerError(err.message || 'Failed to save workshop. Please review fields.');
      }
    }
  };

  // Tab Error Counts for navigation badges
  const tabErrorCounts = {
    basic: Object.keys(fieldErrors).filter(k => getTabForErrorKey(k) === 'basic').length,
    logistics: Object.keys(fieldErrors).filter(k => getTabForErrorKey(k) === 'logistics').length,
    trainers: Object.keys(fieldErrors).filter(k => getTabForErrorKey(k) === 'trainers').length,
    audience: Object.keys(fieldErrors).filter(k => getTabForErrorKey(k) === 'audience').length,
    sessions: Object.keys(fieldErrors).filter(k => getTabForErrorKey(k) === 'sessions').length
  };

  // Filter courses for currently selected department in Tab 1
  const departmentCourses = courses.filter(c => String(c.departmentId?._id || c.departmentId) === String(formData.departmentId));

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? `Edit Workshop (${workshop?.workshopId || 'Draft'})` : 'Create New Workshop'}
      maxWidth="860px"
    >
      <form onSubmit={(e) => handleSubmit(e, submitAction)} style={{ marginTop: '12px' }} noValidate>

        {serverError && (
          <div className="notice error" style={{ marginBottom: '14px', fontSize: '0.85rem' }}>
            {serverError}
          </div>
        )}

        {Object.keys(fieldErrors).length > 0 && !serverError && (
          <div className="notice error" style={{ marginBottom: '14px', fontSize: '0.85rem' }}>
            Please correct the {Object.keys(fieldErrors).length} error{Object.keys(fieldErrors).length > 1 ? 's' : ''} highlighted in the form before submitting.
          </div>
        )}

        {/* Tab Navigation */}
        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--line)', marginBottom: '18px', overflowX: 'auto' }}>
          {[
            { id: 'basic', label: '1. Basic Info' },
            { id: 'logistics', label: '2. Mode & Venue' },
            { id: 'trainers', label: `3. Trainers (${formData.trainers.length})` },
            { id: 'audience', label: '4. Target Audience' },
            { id: 'sessions', label: `5. Sessions (${formData.sessions.length})` }
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '8px 14px',
                border: 'none',
                background: 'transparent',
                fontWeight: activeTab === tab.id ? 700 : 500,
                color: tabErrorCounts[tab.id] > 0
                  ? 'var(--red, #e53e3e)'
                  : (activeTab === tab.id ? 'var(--teal)' : 'var(--muted)'),
                borderBottom: activeTab === tab.id
                  ? (tabErrorCounts[tab.id] > 0 ? '2px solid var(--red, #e53e3e)' : '2px solid var(--teal)')
                  : '2px solid transparent',
                cursor: 'pointer',
                fontSize: '0.88rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span>{tab.label}</span>
              {tabErrorCounts[tab.id] > 0 && (
                <span
                  style={{
                    background: 'var(--red, #e53e3e)',
                    color: '#ffffff',
                    borderRadius: '999px',
                    padding: '1px 6px',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    lineHeight: 1.2
                  }}
                >
                  {tabErrorCounts[tab.id]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* TAB 1: BASIC INFO */}
        {activeTab === 'basic' && (
          <div className="form-grid">
            <div className="field">
              <label htmlFor="ws-title">Workshop Title <span style={{ color: 'var(--red)' }}>*</span></label>
              <input
                id="ws-title"
                name="title"
                placeholder="e.g. Advanced Cloud Computing & Microservices Bootcamp"
                value={formData.title}
                onChange={handleChange}
                style={{ borderColor: fieldErrors.title ? 'var(--red, #e53e3e)' : undefined }}
              />
              {fieldErrors.title && (
                <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                  {fieldErrors.title}
                </span>
              )}
            </div>

            <div className="field">
              <label htmlFor="ws-description">Workshop Description <span style={{ color: 'var(--red)' }}>*</span></label>
              <textarea
                id="ws-description"
                name="description"
                rows={3}
                placeholder="Detailed curriculum, learning objectives, tools used, prerequisites..."
                value={formData.description}
                onChange={handleChange}
                style={{ borderColor: fieldErrors.description ? 'var(--red, #e53e3e)' : undefined }}
              />
              {fieldErrors.description && (
                <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                  {fieldErrors.description}
                </span>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
              <div className="field">
                <label htmlFor="ws-category">Category <span style={{ color: 'var(--red)' }}>*</span></label>
                <select
                  id="ws-category"
                  name="category"
                  value={formData.category}
                  onChange={handleChange}
                  style={{ borderColor: fieldErrors.category ? 'var(--red, #e53e3e)' : undefined }}
                >
                  <option value="">Select Category</option>
                  {WORKSHOP_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
                {fieldErrors.category && (
                  <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                    {fieldErrors.category}
                  </span>
                )}
              </div>

              <div className="field">
                <label htmlFor="ws-capacity">Max Capacity <span style={{ color: 'var(--red)' }}>*</span></label>
                <input
                  id="ws-capacity"
                  type="number"
                  name="maxParticipants"
                  min="1"
                  max="10000"
                  placeholder="e.g. 60"
                  value={formData.maxParticipants}
                  onChange={handleChange}
                  style={{ borderColor: fieldErrors.maxParticipants ? 'var(--red, #e53e3e)' : undefined }}
                />
                {fieldErrors.maxParticipants && (
                  <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                    {fieldErrors.maxParticipants}
                  </span>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginTop: '6px' }}>
              <div className="field">
                <label htmlFor="ws-start">Workshop Starts At <span style={{ color: 'var(--red)' }}>*</span></label>
                <input
                  id="ws-start"
                  type="datetime-local"
                  name="startAt"
                  value={formData.startAt}
                  onChange={handleChange}
                  style={{ borderColor: fieldErrors.startAt ? 'var(--red, #e53e3e)' : undefined }}
                />
                {fieldErrors.startAt && (
                  <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                    {fieldErrors.startAt}
                  </span>
                )}
              </div>

              <div className="field">
                <label htmlFor="ws-end">Workshop Ends At <span style={{ color: 'var(--red)' }}>*</span></label>
                <input
                  id="ws-end"
                  type="datetime-local"
                  name="endAt"
                  value={formData.endAt}
                  onChange={handleChange}
                  style={{ borderColor: fieldErrors.endAt ? 'var(--red, #e53e3e)' : undefined }}
                />
                {fieldErrors.endAt && (
                  <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                    {fieldErrors.endAt}
                  </span>
                )}
              </div>

              <div className="field">
                <label htmlFor="ws-reg-deadline">Registration Deadline <span style={{ color: 'var(--red)' }}>*</span></label>
                <input
                  id="ws-reg-deadline"
                  type="datetime-local"
                  name="registrationDeadline"
                  value={formData.registrationDeadline}
                  onChange={handleChange}
                  style={{ borderColor: fieldErrors.registrationDeadline ? 'var(--red, #e53e3e)' : undefined }}
                />
                {fieldErrors.registrationDeadline && (
                  <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                    {fieldErrors.registrationDeadline}
                  </span>
                )}
              </div>

              <div className="field">
                <label htmlFor="ws-reg-opens">Registration Opens At <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>(Optional)</span></label>
                <input
                  id="ws-reg-opens"
                  type="datetime-local"
                  name="registrationOpensAt"
                  value={formData.registrationOpensAt}
                  onChange={handleChange}
                  style={{ borderColor: fieldErrors.registrationOpensAt ? 'var(--red, #e53e3e)' : undefined }}
                />
                {fieldErrors.registrationOpensAt && (
                  <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                    {fieldErrors.registrationOpensAt}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: LOGISTICS */}
        {activeTab === 'logistics' && (
          <div className="form-grid">
            <div className="field">
              <label htmlFor="ws-mode">Delivery Mode <span style={{ color: 'var(--red)' }}>*</span></label>
              <select
                id="ws-mode"
                name="mode"
                value={formData.mode}
                onChange={handleChange}
                style={{ borderColor: fieldErrors.mode ? 'var(--red, #e53e3e)' : undefined }}
              >
                <option value="">Select Delivery Mode</option>
                {WORKSHOP_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              {fieldErrors.mode && (
                <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                  {fieldErrors.mode}
                </span>
              )}
            </div>

            {(formData.mode === 'OFFLINE' || formData.mode === 'HYBRID') && (
              <div className="field">
                <label htmlFor="ws-venue">On-Campus Venue <span style={{ color: 'var(--red)' }}>*</span></label>
                <input
                  id="ws-venue"
                  name="venue"
                  placeholder="e.g. Auditorium Hall B, 3rd Floor, VVWU Campus"
                  value={formData.venue}
                  onChange={handleChange}
                  style={{ borderColor: fieldErrors.venue ? 'var(--red, #e53e3e)' : undefined }}
                />
                {fieldErrors.venue && (
                  <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                    {fieldErrors.venue}
                  </span>
                )}
              </div>
            )}

            {(formData.mode === 'ONLINE' || formData.mode === 'HYBRID') && (
              <div className="field">
                <label htmlFor="ws-meeting">Virtual Meeting Link <span style={{ color: 'var(--red)' }}>*</span></label>
                <input
                  id="ws-meeting"
                  type="url"
                  name="meetingLink"
                  placeholder="https://meet.google.com/xyz-abcd-efg"
                  value={formData.meetingLink}
                  onChange={handleChange}
                  style={{ borderColor: fieldErrors.meetingLink ? 'var(--red, #e53e3e)' : undefined }}
                />
                {fieldErrors.meetingLink && (
                  <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                    {fieldErrors.meetingLink}
                  </span>
                )}
              </div>
            )}

            <div className="field">
              <label htmlFor="ws-banner">Banner Image URL <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>(Optional)</span></label>
              <input
                id="ws-banner"
                type="url"
                name="bannerUrl"
                placeholder="https://example.com/banner.png"
                value={formData.bannerUrl}
                onChange={handleChange}
                style={{ borderColor: fieldErrors.bannerUrl ? 'var(--red, #e53e3e)' : undefined }}
              />
              {fieldErrors.bannerUrl && (
                <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                  {fieldErrors.bannerUrl}
                </span>
              )}
            </div>

            <div className="field">
              <label htmlFor="ws-certificate-template">Certificate Design Template</label>
              <select
                id="ws-certificate-template"
                name="certificateTemplateId"
                value={formData.certificateTemplateId || ''}
                onChange={handleChange}
              >
                <option value="">Default Institutional Certificate (VVWU)</option>
                {templates.map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.name} (v{t.version || 1})
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* TAB 3: TRAINERS REPEATER */}
        {activeTab === 'trainers' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '14px' }}>
              <button className="secondary" type="button" onClick={addTrainer} style={{ padding: '6px 12px' }}>
                <PlusIcon size={14} /> Add Trainer
              </button>
            </div>

            {formData.trainers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 16px', background: '#f8fafc', borderRadius: '10px', border: '1px dashed var(--line)' }}>
                <p style={{ margin: '0 0 12px 0', color: 'var(--muted)', fontSize: '0.9rem' }}>
                  No trainers added yet.
                </p>
                <button type="button" className="secondary" onClick={addTrainer}>
                  <PlusIcon size={14} /> Add Trainer
                </button>
              </div>
            ) : (
              formData.trainers.map((t, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '16px',
                    background: '#f8fafc',
                    border: '1px solid var(--line)',
                    borderRadius: '10px',
                    marginBottom: '14px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <strong style={{ fontSize: '0.88rem', color: 'var(--dark)' }}>Trainer #{idx + 1}</strong>
                      <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '12px', background: '#e2e8f0', color: '#475569', fontWeight: 600 }}>
                        {t.trainerType === 'COMPANY' ? 'Company Trainer' : t.trainerType === 'EXTERNAL' ? 'External Industry Expert' : 'Placement Staff'}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => removeTrainer(idx)}
                      style={{ color: 'var(--red)', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.82rem' }}
                    >
                      <TrashIcon size={14} /> Remove
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                    <div className="field">
                      <label htmlFor={`ws-trainer-${idx}-type`}>Trainer Type <span style={{ color: 'var(--red)' }}>*</span></label>
                      <select
                        id={`ws-trainer-${idx}-type`}
                        value={t.trainerType}
                        onChange={(e) => updateTrainer(idx, 'trainerType', e.target.value)}
                        style={{ borderColor: fieldErrors[`trainer_${idx}_type`] ? 'var(--red, #e53e3e)' : undefined }}
                      >
                        {TRAINER_TYPES.map(tt => <option key={tt.value} value={tt.value}>{tt.label}</option>)}
                      </select>
                      {fieldErrors[`trainer_${idx}_type`] && (
                        <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                          {fieldErrors[`trainer_${idx}_type`]}
                        </span>
                      )}
                    </div>

                    {/* COMPANY TRAINER: Company selector dropdown populated from company records */}
                    {t.trainerType === 'COMPANY' && (
                      <div className="field">
                        <label htmlFor={`ws-trainer-${idx}-company`}>Company Partner <span style={{ color: 'var(--red)' }}>*</span></label>
                        <select
                          id={`ws-trainer-${idx}-company`}
                          value={t.companyId || ''}
                          onChange={(e) => updateTrainer(idx, 'companyId', e.target.value)}
                          style={{ borderColor: fieldErrors[`trainer_${idx}_companyId`] ? 'var(--red, #e53e3e)' : undefined }}
                        >
                          <option value="">-- Select Company --</option>
                          {companies.map(c => (
                            <option key={c._id} value={c._id}>
                              {c.companyName} ({c.companyId || 'Registered'})
                            </option>
                          ))}
                        </select>
                        {fieldErrors[`trainer_${idx}_companyId`] && (
                          <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                            {fieldErrors[`trainer_${idx}_companyId`]}
                          </span>
                        )}
                      </div>
                    )}

                    <div className="field">
                      <label htmlFor={`ws-trainer-${idx}-name`}>Full Name <span style={{ color: 'var(--red)' }}>*</span></label>
                      <input
                        id={`ws-trainer-${idx}-name`}
                        placeholder="e.g. Jiya Patel"
                        value={t.name || ''}
                        onChange={(e) => updateTrainer(idx, 'name', e.target.value)}
                        style={{ borderColor: fieldErrors[`trainer_${idx}_name`] ? 'var(--red, #e53e3e)' : undefined }}
                      />
                      {fieldErrors[`trainer_${idx}_name`] && (
                        <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                          {fieldErrors[`trainer_${idx}_name`]}
                        </span>
                      )}
                    </div>

                    <div className="field">
                      <label htmlFor={`ws-trainer-${idx}-designation`}>Designation</label>
                      <input
                        id={`ws-trainer-${idx}-designation`}
                        placeholder={t.trainerType === 'COMPANY' ? 'e.g. HR Manager / Senior Recruiter' : 'e.g. Principal Cloud Architect'}
                        value={t.designation || ''}
                        onChange={(e) => updateTrainer(idx, 'designation', e.target.value)}
                        style={{ borderColor: fieldErrors[`trainer_${idx}_designation`] ? 'var(--red, #e53e3e)' : undefined }}
                      />
                      {fieldErrors[`trainer_${idx}_designation`] && (
                        <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                          {fieldErrors[`trainer_${idx}_designation`]}
                        </span>
                      )}
                    </div>

                    {/* EXTERNAL EXPERT: Organization text input */}
                    {t.trainerType === 'EXTERNAL' && (
                      <div className="field">
                        <label htmlFor={`ws-trainer-${idx}-org`}>Organization / Affiliation <span style={{ color: 'var(--red)' }}>*</span></label>
                        <input
                          id={`ws-trainer-${idx}-org`}
                          placeholder="e.g. Google India / Independent Consultant"
                          value={t.organization || ''}
                          onChange={(e) => updateTrainer(idx, 'organization', e.target.value)}
                          style={{ borderColor: fieldErrors[`trainer_${idx}_organization`] ? 'var(--red, #e53e3e)' : undefined }}
                        />
                        {fieldErrors[`trainer_${idx}_organization`] && (
                          <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                            {fieldErrors[`trainer_${idx}_organization`]}
                          </span>
                        )}
                      </div>
                    )}

                    {/* PLACEMENT STAFF: Department / Cell text input */}
                    {(t.trainerType === 'PLACEMENT_COORDINATOR' || t.trainerType === 'PLACEMENT_HEAD') && (
                      <div className="field">
                        <label htmlFor={`ws-trainer-${idx}-dept`}>Department / Cell</label>
                        <input
                          id={`ws-trainer-${idx}-dept`}
                          placeholder="e.g. VVWU Central Placement Cell"
                          value={t.organization || ''}
                          onChange={(e) => updateTrainer(idx, 'organization', e.target.value)}
                          style={{ borderColor: fieldErrors[`trainer_${idx}_organization`] ? 'var(--red, #e53e3e)' : undefined }}
                        />
                        {fieldErrors[`trainer_${idx}_organization`] && (
                          <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                            {fieldErrors[`trainer_${idx}_organization`]}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB 4: TARGET AUDIENCE & COURSE ELIGIBILITY */}
        {activeTab === 'audience' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {!isCoordinator && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: isPublished ? 'default' : 'pointer', fontWeight: 600, fontSize: '0.95rem' }}>
                <input
                  type="checkbox"
                  checked={isAllDepartmentsSelected}
                  disabled={isPublished}
                  onChange={(e) => handleToggleAllDepartments(e.target.checked)}
                />
                <span>All Departments</span>
              </label>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingLeft: isCoordinator ? '0' : '16px' }}>
              {departments.map(dept => {
                const isDeptChecked = isDepartmentSelected(dept._id);
                const isAllCoursesChecked = isAllCoursesForDeptSelected(dept._id);
                const deptCourses = courses.filter(c => String(c.departmentId?._id || c.departmentId) === String(dept._id));

                if (isCoordinator && String(dept._id) !== String(user?.departmentId || formData.departmentId)) {
                  return null;
                }

                return (
                  <div
                    key={dept._id}
                    style={{
                      border: '1px solid #E2E8F0',
                      borderRadius: '8px',
                      padding: '12px 14px',
                      background: isDeptChecked ? '#F8FAFC' : '#ffffff'
                    }}
                  >
                    {!isCoordinator && (
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', cursor: isPublished ? 'default' : 'pointer', fontWeight: 650, fontSize: '14.5px', color: '#172B4D' }}>
                        <input
                          type="checkbox"
                          checked={isDeptChecked}
                          disabled={isPublished}
                          onChange={(e) => handleToggleDepartment(dept._id, e.target.checked)}
                          style={{
                            width: '16px',
                            height: '16px',
                            accentColor: '#0f766e',
                            cursor: isPublished ? 'default' : 'pointer',
                            flexShrink: 0
                          }}
                        />
                        <span>{dept.name} ({dept.code})</span>
                      </label>
                    )}

                    {(isDeptChecked || isCoordinator) && (
                      <div style={{ marginTop: isCoordinator ? '0' : '8px', paddingLeft: isCoordinator ? '0' : '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', cursor: isPublished ? 'default' : 'pointer', fontSize: '14px', fontWeight: 600, color: '#1F2937', userSelect: 'none' }}>
                          <input
                            type="checkbox"
                            checked={isAllCoursesChecked}
                            disabled={isPublished}
                            onChange={(e) => handleToggleAllCoursesForDept(dept._id, e.target.checked)}
                            style={{
                              width: '15px',
                              height: '15px',
                              accentColor: '#0f766e',
                              cursor: isPublished ? 'default' : 'pointer',
                              flexShrink: 0
                            }}
                          />
                          <span>All Courses</span>
                        </label>

                        <div
                          style={{
                            paddingLeft: '16px',
                            marginLeft: '7px',
                            borderLeft: '2px solid #E2E8F0',
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                            gap: '8px'
                          }}
                        >
                          {deptCourses.length === 0 ? (
                            <span style={{ fontSize: '13.5px', color: '#64748B', fontStyle: 'italic' }}>
                              No courses available in this department.
                            </span>
                          ) : (
                            deptCourses.map(course => (
                              <label
                                key={course._id}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'flex-start',
                                  gap: '9px',
                                  cursor: isPublished ? 'default' : 'pointer',
                                  fontSize: '14px',
                                  fontWeight: 500,
                                  color: '#1F2937',
                                  lineHeight: 1.45,
                                  userSelect: 'none'
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={isCourseSelected(dept._id, course._id)}
                                  disabled={isPublished}
                                  onChange={(e) => handleToggleCourse(dept._id, course._id, e.target.checked)}
                                  style={{
                                    marginTop: '2.5px',
                                    width: '15px',
                                    height: '15px',
                                    accentColor: '#0f766e',
                                    cursor: isPublished ? 'default' : 'pointer',
                                    flexShrink: 0
                                  }}
                                />
                                <span style={{ wordBreak: 'break-word' }}>
                                  {course.name}
                                </span>
                              </label>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {(fieldErrors.targetAudience || fieldErrors.departmentId || fieldErrors.ownershipType) && (
              <div
                className="notice error"
                style={{
                  color: 'var(--red, #e53e3e)',
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  fontSize: '0.85rem',
                  marginTop: '8px'
                }}
              >
                {fieldErrors.targetAudience || fieldErrors.departmentId || fieldErrors.ownershipType}
              </div>
            )}
          </div>
        )}

        {/* TAB 5: SESSIONS REPEATER */}
        {activeTab === 'sessions' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '14px' }}>
              <button className="secondary" type="button" onClick={addSession} style={{ padding: '6px 12px' }}>
                <PlusIcon size={14} /> Add Session
              </button>
            </div>

            {fieldErrors.sessions && (
              <div className="notice error" style={{ marginBottom: '14px', fontSize: '0.85rem' }}>
                {fieldErrors.sessions}
              </div>
            )}

            {formData.sessions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 16px', background: '#f8fafc', borderRadius: '10px', border: '1px dashed var(--line)' }}>
                <p style={{ margin: '0 0 12px 0', color: 'var(--muted)', fontSize: '0.9rem' }}>
                  No sessions added.
                </p>
                <button type="button" className="secondary" onClick={addSession}>
                  <PlusIcon size={14} /> Add First Session
                </button>
              </div>
            ) : (
              formData.sessions.map((s, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '14px',
                    background: '#f8fafc',
                    border: '1px solid var(--line)',
                    borderRadius: '10px',
                    marginBottom: '10px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <strong style={{ fontSize: '0.88rem', color: 'var(--ink)' }}>
                      Session #{s.sessionNumber || idx + 1}: {s.sessionId || `SES-${String(idx + 1).padStart(2, '0')}`}
                    </strong>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => removeSession(idx)}
                      style={{ color: 'var(--red)' }}
                    >
                      <TrashIcon size={14} /> Delete
                    </button>
                  </div>

                  <div className="form-grid">
                    <div className="field">
                      <label>Session Title <span style={{ color: 'var(--red)' }}>*</span></label>
                      <input
                        placeholder="e.g. Session 1: Cloud Architecture"
                        value={s.title}
                        onChange={(e) => updateSession(idx, 'title', e.target.value)}
                        style={{ borderColor: fieldErrors[`session_${idx}_title`] ? 'var(--red, #e53e3e)' : undefined }}
                      />
                      {fieldErrors[`session_${idx}_title`] && (
                        <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                          {fieldErrors[`session_${idx}_title`]}
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                      <div className="field">
                        <label>Session Starts At <span style={{ color: 'var(--red)' }}>*</span></label>
                        <input
                          type="datetime-local"
                          value={s.startAt}
                          onChange={(e) => updateSession(idx, 'startAt', e.target.value)}
                          style={{ borderColor: fieldErrors[`session_${idx}_startAt`] ? 'var(--red, #e53e3e)' : undefined }}
                        />
                        {fieldErrors[`session_${idx}_startAt`] && (
                          <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                            {fieldErrors[`session_${idx}_startAt`]}
                          </span>
                        )}
                      </div>

                      <div className="field">
                        <label>Session Ends At <span style={{ color: 'var(--red)' }}>*</span></label>
                        <input
                          type="datetime-local"
                          value={s.endAt}
                          onChange={(e) => updateSession(idx, 'endAt', e.target.value)}
                          style={{ borderColor: fieldErrors[`session_${idx}_endAt`] ? 'var(--red, #e53e3e)' : undefined }}
                        />
                        {fieldErrors[`session_${idx}_endAt`] && (
                          <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                            {fieldErrors[`session_${idx}_endAt`]}
                          </span>
                        )}
                      </div>

                      <div className="field" style={{ justifyContent: 'center' }}>
                        <label className="remember" style={{ marginTop: '16px' }}>
                          <input
                            type="checkbox"
                            checked={s.isAttendanceRequired}
                            onChange={(e) => updateSession(idx, 'isAttendanceRequired', e.target.checked)}
                          />
                          Attendance Mandatory (75% Threshold)
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Modal Bottom Actions */}
        <div className="modal-actions" style={{ marginTop: '24px', borderTop: '1px solid var(--line)', paddingTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button className="ghost" type="button" onClick={onClose} disabled={isProcessing}>
            Cancel
          </button>
          {!isPublished ? (
            <>
              <button
                className="secondary"
                type="button"
                id="btn-workshop-save-draft"
                disabled={isProcessing}
                onClick={(e) => {
                  setSubmitAction('draft');
                  handleSubmit(e, 'draft');
                }}
              >
                {isProcessing && submitAction === 'draft' ? 'Saving Draft…' : 'Save Draft'}
              </button>
              <button
                className="primary"
                type="button"
                id="btn-workshop-submit"
                disabled={isProcessing}
                onClick={(e) => {
                  setSubmitAction('submit');
                  handleSubmit(e, 'submit');
                }}
              >
                {isProcessing && submitAction === 'submit' ? 'Submitting…' : 'Submit'}
              </button>
            </>
          ) : (
            <button
              className="primary"
              type="button"
              id="btn-workshop-save-changes"
              disabled={isProcessing}
              onClick={(e) => {
                setSubmitAction('submit');
                handleSubmit(e, 'submit');
              }}
            >
              {isProcessing
                ? (isCompany && (workshop?.approvalStatus === 'APPROVED' || workshop?.isPublished) ? 'Submitting Changes…' : 'Saving Changes…')
                : (isCompany && (workshop?.approvalStatus === 'APPROVED' || workshop?.isPublished) ? 'Submit Changes for Approval' : 'Save Changes')}
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
