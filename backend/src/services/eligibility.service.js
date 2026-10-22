let activeTrainingAdapter = null;

/**
 * Registers an authoritative training verification adapter (e.g. from the Workshop & Training Module).
 * @param {Object} adapter - Must implement `verifyStudentCompletion(student)` returning `{ isCompleted: boolean, reason?: string }`
 */
export function setTrainingAdapter(adapter) {
  activeTrainingAdapter = adapter;
}

export function getTrainingAdapter() {
  return activeTrainingAdapter;
}

/**
 * Verifies whether a student has completed mandatory Naandi Training via an authoritative source.
 */
export async function verifyNaandiTraining(student, customAdapter = null) {
  const adapter = customAdapter || activeTrainingAdapter;
  if (adapter && typeof adapter.verifyStudentCompletion === 'function') {
    return await adapter.verifyStudentCompletion(student);
  }

  // Check student certificates for authoritative verification metadata
  if (Array.isArray(student?.certificates)) {
    const naandiCert = student.certificates.find((c) => {
      const org = (c.issuingOrganization || '').toLowerCase().trim();
      const name = (c.name || '').toLowerCase().trim();
      const isNaandi = Boolean(c.isNaandiTraining) || org.includes('naandi') || name.includes('naandi');
      const hasAuthoritativeCredential = Boolean(
        c.credentialId && (c.credentialId.startsWith('NAANDI-') || c.credentialId.startsWith('VVWU-NAANDI-'))
      );
      const isVerified = Boolean(c.isVerified || c.verifiedByPlacement || c.authoritativeVerified || hasAuthoritativeCredential || c.isNaandiTraining);
      return isNaandi && isVerified;
    });

    if (naandiCert) {
      return {
        isCompleted: true,
        source: 'STUDENT_VERIFIED_CERTIFICATE',
        certificateId: naandiCert._id || naandiCert.credentialId
      };
    }
  }

  return {
    isCompleted: false,
    reason: 'Verified Naandi Training certificate is required for this application.'
  };
}

/**
 * Evaluates full eligibility of a student for a job.
 * Returns an evaluation object:
 * {
 *   isEligible: boolean,
 *   ineligibleReason?: string,
 *   checks: { ... individual check results ... },
 *   details: string
 * }
 */
export async function evaluateEligibility({ job, student, resume = null, trainingAdapter = null }) {
  const checks = {};
  const failureReasons = [];

  // 1. Job Availability
  const isJobOpen = job.status === 'OPEN';
  const isNotSuspended = !job.isSuspended;
  const isBeforeDeadline = new Date(job.deadline) >= new Date();

  checks.jobStatus = {
    passed: isJobOpen && isNotSuspended && isBeforeDeadline,
    status: job.status,
    isSuspended: job.isSuspended,
    deadline: job.deadline
  };

  if (!isJobOpen) {
    failureReasons.push(`Job is not currently accepting applications (status is ${job.status}).`);
  }
  if (!isNotSuspended) {
    failureReasons.push('Job posting is currently suspended by the Placement Cell.');
  }
  if (!isBeforeDeadline) {
    failureReasons.push('Job application deadline has passed.');
  }

  // 2. Resume Requirement (Profile resume or job-specific resume)
  const effectiveResume = resume || student?.resume;
  const hasResume = Boolean(effectiveResume?.url && effectiveResume.url.trim());
  checks.resume = {
    passed: hasResume,
    fileName: effectiveResume?.fileName || null,
    source: effectiveResume?.source || (resume ? 'JOB_SPECIFIC' : 'PROFILE')
  };
  if (!hasResume) {
    failureReasons.push('A valid resume must be selected or uploaded before submitting an application.');
  }

  // 3. Academic & Skill Criteria
  const criteria = job.eligibilityCriteria || {};
  const isRestricted = job.eligibilityMode === 'RESTRICTED';

  if (isRestricted || criteria) {
    // Department Check
    if (Array.isArray(criteria.allowedDepartmentIds) && criteria.allowedDepartmentIds.length > 0) {
      const studentDeptId = student.departmentId ? String(student.departmentId) : null;
      const allowedDeptIds = criteria.allowedDepartmentIds.map((id) => String(id?._id || id));
      const deptPassed = allowedDeptIds.includes(studentDeptId);
      checks.department = {
        passed: deptPassed,
        studentDepartmentId: studentDeptId,
        allowedDepartmentIds: allowedDeptIds
      };
      if (!deptPassed) {
        failureReasons.push('Your department is not eligible for this job posting.');
      }
    }

    // Course Check
    if (Array.isArray(criteria.allowedCourseIds) && criteria.allowedCourseIds.length > 0) {
      const studentCourseId = student.courseId ? String(student.courseId) : null;
      const allowedCourseIds = criteria.allowedCourseIds.map((id) => String(id?._id || id));
      const coursePassed = allowedCourseIds.includes(studentCourseId);
      checks.course = {
        passed: coursePassed,
        studentCourseId,
        allowedCourseIds
      };
      if (!coursePassed) {
        failureReasons.push('Your course is not eligible for this job posting.');
      }
    }

    // Passing Year Check
    if (Array.isArray(criteria.allowedPassingYears) && criteria.allowedPassingYears.length > 0) {
      const studentYear = Number(student.passingYear);
      const yearPassed = criteria.allowedPassingYears.includes(studentYear);
      checks.passingYear = {
        passed: yearPassed,
        studentPassingYear: studentYear,
        allowedPassingYears: criteria.allowedPassingYears
      };
      if (!yearPassed) {
        failureReasons.push(`Your passing year (${studentYear || 'N/A'}) is not eligible for this job posting.`);
      }
    }

    // CGPA Check
    if (typeof criteria.minCgpa === 'number' && criteria.minCgpa > 0) {
      const studentCgpa = Number(student.cgpa || 0);
      const cgpaPassed = studentCgpa >= criteria.minCgpa;
      checks.cgpa = {
        passed: cgpaPassed,
        studentCgpa,
        minCgpa: criteria.minCgpa
      };
      if (!cgpaPassed) {
        failureReasons.push(`Minimum CGPA requirement not met (Required: ${criteria.minCgpa}, Your CGPA: ${studentCgpa}).`);
      }
    }

    // Backlog Check
    if (criteria.maxActiveBacklogs !== null && criteria.maxActiveBacklogs !== undefined) {
      const studentBacklogs = Number(student.backlogs || 0);
      const backlogsPassed = studentBacklogs <= criteria.maxActiveBacklogs;
      checks.backlogs = {
        passed: backlogsPassed,
        studentBacklogs,
        maxActiveBacklogs: criteria.maxActiveBacklogs
      };
      if (!backlogsPassed) {
        failureReasons.push(`Active backlogs exceed maximum allowed limit (Allowed: ${criteria.maxActiveBacklogs}, Your Backlogs: ${studentBacklogs}).`);
      }
    }

    // Required Skills Evaluation (Informational by default — does not block submission)
    const requiredSkills = Array.isArray(criteria.requiredSkills) ? criteria.requiredSkills : [];
    const preferredSkills = Array.isArray(criteria.preferredSkills) ? criteria.preferredSkills : [];

    if (requiredSkills.length > 0 || preferredSkills.length > 0) {
      const studentSkillSet = new Set((student.skills || []).map((s) => s.toLowerCase().trim()));
      const matchedSkills = requiredSkills.filter((skill) =>
        studentSkillSet.has(skill.toLowerCase().trim())
      );
      const unmatchedSkills = requiredSkills.filter(
        (skill) => !studentSkillSet.has(skill.toLowerCase().trim())
      );
      const matchPercentage = requiredSkills.length > 0
        ? Math.round((matchedSkills.length / requiredSkills.length) * 100)
        : 100;

      const matchedPreferred = preferredSkills.filter((s) =>
        studentSkillSet.has(s.toLowerCase().trim())
      );
      const unmatchedPreferred = preferredSkills.filter(
        (s) => !studentSkillSet.has(s.toLowerCase().trim())
      );

      checks.skills = {
        passed: true,
        isInformational: true,
        requiredSkills,
        matchedSkills,
        unmatchedSkills,
        missingSkills: unmatchedSkills, // For backward compatibility with existing readers
        matchPercentage,
        preferredSkills,
        matchedPreferredSkills: matchedPreferred,
        unmatchedPreferredSkills: unmatchedPreferred,
        label: unmatchedSkills.length > 0
          ? `Not listed on your profile: ${unmatchedSkills.join(', ')}`
          : 'All job skills listed on profile'
      };
      // Note: Missing profile skills are informational and do not block eligibility.
    }
  }

  // 4. Mandatory Naandi Training Requirement
  if (criteria.requiresNaandiTraining !== false) {
    const naandiResult = await verifyNaandiTraining(student, trainingAdapter);
    checks.naandiTraining = {
      passed: naandiResult.isCompleted,
      source: naandiResult.source || null,
      details: naandiResult.reason || 'Verified'
    };
    if (!naandiResult.isCompleted) {
      failureReasons.push(naandiResult.reason);
    }
  }

  const isEligible = failureReasons.length === 0;

  return {
    isEligible,
    ineligibleReason: isEligible ? undefined : failureReasons[0],
    failureReasons,
    checks,
    details: isEligible
      ? 'All academic, resume, and training criteria successfully verified.'
      : failureReasons.join(' ')
  };
}
