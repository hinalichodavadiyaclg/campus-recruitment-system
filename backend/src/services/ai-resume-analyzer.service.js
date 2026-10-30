import { AppError } from '../utils/app-error.js';
import { classifyResumeDocument } from './resume-text-extraction.service.js';

/**
 * Sanitizes untrusted resume text against prompt injection attempts.
 *
 * @param {string} text
 * @returns {string}
 */
export function sanitizeResumeText(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/(?:system\s*prompt|system\s*instructions?|ignore\s+(?:all\s+)?previous\s+instructions?|disregard\s+instructions?)/gi, '[FILTERED_INSTRUCTION]')
    .replace(/```(?:json|javascript|system)?/gi, '')
    .slice(0, 15000); // Guard token length
}

/**
 * Calculates weighted overall score from category scores.
 *
 * Weights:
 * - ATS Compatibility: 20%
 * - Skills: 20%
 * - Education: 10%
 * - Projects: 20%
 * - Experience / Practical Exposure: 10%
 * - Resume Structure: 20%
 *
 * @param {object} categoryScores
 * @returns {number}
 */
export function calculateWeightedOverallScore(categoryScores) {
  const ats = Math.min(100, Math.max(0, categoryScores.atsCompatibility || 0));
  const skills = Math.min(100, Math.max(0, categoryScores.skills || 0));
  const edu = Math.min(100, Math.max(0, categoryScores.education || 0));
  const proj = Math.min(100, Math.max(0, categoryScores.projects || 0));
  const exp = Math.min(100, Math.max(0, categoryScores.experience || 0));
  const struct = Math.min(100, Math.max(0, categoryScores.resumeStructure || 0));

  const weighted =
    ats * 0.2 +
    skills * 0.2 +
    edu * 0.1 +
    proj * 0.2 +
    exp * 0.1 +
    struct * 0.2;

  return Math.round(weighted);
}

/**
 * Generates an honest, non-inflated diagnostic report when the uploaded file is identified
 * as a certificate, marksheet, or other non-resume document.
 *
 * @param {object} classification
 * @param {string} rawText
 * @param {object} [job]
 * @returns {object}
 */
export function generateNonResumeReport(classification, rawText, job = null) {
  const docType = classification?.documentType || 'CERTIFICATE';
  let summary = '';
  let problemTitle = '';
  let problemDetails = '';

  if (docType === 'CERTIFICATE') {
    summary = 'Non-Resume Document Detected: The uploaded file was identified as an institutional Certificate of Completion / Participation, not a candidate Resume or Curriculum Vitae. A candidate resume requires structured sections detailing your Education history, Technical & Soft Skills inventory, Academic Projects, and Contact Coordinates. Please upload your actual resume document to receive ATS scoring and recruiter screening diagnostics.';
    problemTitle = 'Certificate Uploaded Instead of Resume';
    problemDetails = 'Automated ATS systems and recruiters require a comprehensive 1-2 page Resume or CV. A certificate credential alone cannot be parsed as a candidate employment profile.';
  } else if (docType === 'MARKSHEET') {
    summary = 'Non-Resume Document Detected: The uploaded file was identified as an academic Marksheet or Grade Report, not an employment Resume or CV. ATS scoring requires an authentic resume outlining your skills, practical projects, and profile summary.';
    problemTitle = 'Marksheet / Grade Card Uploaded';
    problemDetails = 'A marksheet or grade report does not contain applicant skills, project portfolios, or career history.';
  } else {
    summary = 'Insufficient Resume Content: The uploaded document contains fewer than 60 words and lacks essential resume sections (Education, Skills, Projects). Please upload a complete 1-2 page Resume or CV in PDF or DOCX format.';
    problemTitle = 'Document Contains Insufficient Text';
    problemDetails = 'ATS systems and recruiters need a complete candidate profile with readable text.';
  }

  const report = {
    isResume: false,
    documentType: docType,
    overallScore: 0,
    categoryScores: {
      atsCompatibility: 0,
      skills: 0,
      education: 0,
      projects: 0,
      experience: 0,
      resumeStructure: 0
    },
    summary,
    strengths: [
      docType === 'CERTIFICATE'
        ? 'Document verified as an authentic course/workshop completion credential.'
        : 'File was parsed and inspected successfully.'
    ],
    areasForImprovement: [
      `Uploaded document is a ${docType === 'CERTIFICATE' ? 'Certificate of Completion' : 'non-resume document'}, not an employment resume.`,
      'Completely lacks candidate contact coordinates (personal email address and mobile number).',
      'Missing technical & functional skills inventory (programming languages, libraries, databases).',
      'Missing academic projects portfolio demonstrating practical implementation abilities.',
      'Missing formal educational timeline with degree, branch, CGPA, and expected graduation.'
    ],
    extractedSkills: {
      technical: [],
      soft: [],
      industry: [],
      missingOrWeak: []
    },
    missingSections: [
      'Candidate Contact Coordinates (Email & Phone)',
      'Technical & Soft Skills Inventory',
      'Academic Projects Portfolio',
      'Formal Education History (Degree, College, CGPA)',
      'Work Experience / Internships'
    ],
    recommendations: [
      {
        problem: problemTitle,
        whyItMatters: problemDetails,
        howToImprove: 'Click "Replace Resume" above and upload your 1-2 page Resume or CV in PDF or DOCX format. Save certificates in your Certificates & Achievements tab.',
        example: 'Standard layout: Header (Name & Contact) → Education → Technical Skills → Projects → Certifications & Workshops.',
        priority: 'HIGH'
      },
      {
        problem: 'Missing Essential Candidate Sections',
        whyItMatters: 'Recruiters spend only seconds scanning for technical competencies and project experience. None of these exist in a certificate.',
        howToImprove: 'Draft a standard resume highlighting your key coursework, practical programming projects, and extracurricular achievements.',
        example: 'Example project: "Campus Event Tracker: Built with React and Node.js with user authentication and registration workflows."',
        priority: 'HIGH'
      }
    ],
    aiModel: 'vvwu-document-classifier-v1'
  };

  if (job) {
    report.jobMatchResult = {
      jobMatchScore: 0,
      matchedSkills: [],
      missingSkills: job.eligibilityCriteria?.requiredSkills || [],
      partiallyDemonstratedSkills: [],
      jobRecommendations: [
        `Cannot match certificate against '${job.title}'. Please upload a complete resume demonstrating required skills: ${(job.eligibilityCriteria?.requiredSkills || []).join(', ')}.`
      ],
      jobSnapshot: {
        title: job.title || '',
        companyName: job.companyName || job.companyId?.companyName || '',
        jobType: job.jobType || 'FULL_TIME',
        workLocation: job.workLocation || ''
      }
    };
  }

  return report;
}

/**
 * Intelligent deterministic heuristic analyzer that generates a comprehensive,
 * realistic, content-driven analysis even when external AI APIs are offline or without API keys.
 *
 * @param {string} rawText
 * @param {object} [extractedData]
 * @param {object} [student]
 * @param {object} [job]
 * @returns {object}
 */
export function analyzeResumeHeuristic(rawText, extractedData = {}, student = null, job = null) {
  const text = rawText || '';
  const lower = text.toLowerCase();

  // 0. Verify document classification
  const classification = classifyResumeDocument(text);
  if (!classification.isResume) {
    return generateNonResumeReport(classification, text, job);
  }

  // 1. Contact Info & ATS Checks
  const hasEmail = Boolean(extractedData?.contact?.email || /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(text));
  const hasPhone = Boolean(extractedData?.contact?.phone || /(?:\+91[\s-]?)?[6-9]\d{9}\b/.test(text));
  const hasLinkedin = Boolean(extractedData?.contact?.linkedin || /linkedin\.com/i.test(text));
  const hasGithub = Boolean(extractedData?.contact?.github || /github\.com/i.test(text));

  // Headings check
  const hasEduHeading = /education|academic/i.test(lower);
  const hasSkillsHeading = /skills|competencies|technologies/i.test(lower);
  const hasProjHeading = /projects?|academic projects?/i.test(lower);
  const hasExpHeading = /experience|internship|training/i.test(lower);
  const hasCertHeading = /certificat/i.test(lower);

  // ATS Score calculation (20% weight) - Evidence driven
  let atsScore = 15;
  if (hasEmail) atsScore += 18;
  if (hasPhone) atsScore += 18;
  if (hasLinkedin || hasGithub) atsScore += 12;
  if (hasEduHeading) atsScore += 12;
  if (hasSkillsHeading) atsScore += 13;
  if (hasProjHeading) atsScore += 12;
  atsScore = Math.min(95, Math.max(15, atsScore));

  // 2. Skills Analysis (20% weight) - Evidence driven
  const skillsList = Array.isArray(extractedData?.skills) ? extractedData.skills : [];
  const techSkills = [...skillsList];

  const softSkillKeywords = [
    'communication', 'teamwork', 'leadership', 'problem solving', 'critical thinking',
    'adaptability', 'collaboration', 'time management', 'analytical', 'creative'
  ];
  const softSkills = [];
  for (const sk of softSkillKeywords) {
    if (lower.includes(sk)) softSkills.push(sk.charAt(0).toUpperCase() + sk.slice(1));
  }

  let skillsScore = Math.min(65, techSkills.length * 10) + Math.min(25, softSkills.length * 5);
  if (hasSkillsHeading && skillsScore > 0) skillsScore += 10;
  skillsScore = Math.min(96, Math.max(10, skillsScore));

  // 3. Education Score (10% weight)
  let eduScore = hasEduHeading ? 35 : 10;
  if (/b\.?tech|b\.?e|bca|mca|b\.?sc|m\.?sc|diploma|bachelor|master|engineering/i.test(lower)) eduScore += 25;
  if (/university|college|institute/i.test(lower)) eduScore += 20;
  if (/cgpa|percentage|\b20\d\d\b|semester/i.test(lower)) eduScore += 15;
  eduScore = Math.min(95, Math.max(10, eduScore));

  // 4. Projects Score (20% weight)
  let projScore = hasProjHeading ? 35 : 10;
  const projectMentions = (text.match(/github|deployed|api|database|frontend|backend|app|system|developed|implemented|designed|created/gi) || []).length;
  projScore += Math.min(45, projectMentions * 5);
  if (/react|node|express|mongodb|python|java|sql/i.test(lower) && hasProjHeading) projScore += 15;
  projScore = Math.min(96, Math.max(10, projScore));

  // 5. Experience / Practical Exposure (10% weight - Fresher-Friendly)
  let expScore = 35; // Base score for campus freshers
  if (/intern|internship/i.test(lower)) expScore += 35;
  if (/naandi|edunet|training|workshop|hackathon|freelance/i.test(lower)) expScore += 20;
  if (hasExpHeading) expScore += 10;
  expScore = Math.min(95, Math.max(20, expScore));

  // 6. Resume Structure & Content (20% weight)
  let structScore = 20;
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (wordCount >= 180 && wordCount <= 750) structScore += 35;
  else if (wordCount >= 90) structScore += 20;
  if (hasEmail && hasPhone && hasEduHeading && hasSkillsHeading) structScore += 25;
  if (text.includes('•') || text.includes('- ') || text.includes('* ')) structScore += 15;
  structScore = Math.min(95, Math.max(15, structScore));

  const categoryScores = {
    atsCompatibility: atsScore,
    skills: skillsScore,
    education: eduScore,
    projects: projScore,
    experience: expScore,
    resumeStructure: structScore
  };

  const overallScore = calculateWeightedOverallScore(categoryScores);

  // Generate Strengths
  const strengths = [];
  if (techSkills.length >= 4) {
    strengths.push(`Strong portfolio of modern technical competencies including ${techSkills.slice(0, 3).join(', ')}.`);
  }
  if (hasEmail && hasPhone) {
    strengths.push('Complete and professional contact coordinates for rapid recruiter outreach.');
  }
  if (projScore >= 70) {
    strengths.push('Detailed academic/practical project section showcasing hands-on technology execution.');
  }
  if (hasGithub || hasLinkedin) {
    strengths.push('Links to external professional profiles (GitHub / LinkedIn) enhancing credibility.');
  }
  if (strengths.length < 2) {
    strengths.push('Well-structured layout with readable sections easily parsed by screening tools.');
  }

  // Generate Weaknesses & Missing Sections
  const areasForImprovement = [];
  const missingSections = [];

  if (!hasLinkedin) {
    areasForImprovement.push('Missing a LinkedIn profile link to showcase comprehensive networking and recommendations.');
  }
  if (!hasGithub) {
    areasForImprovement.push('Missing a GitHub or technical repository link to verify source code quality and project contributions.');
  }
  if (techSkills.length < 5) {
    areasForImprovement.push('Technical skills list could be expanded with more specialized frameworks, databases, or cloud tools.');
  }
  if (!/impact|metric|improved|reduced|increased|\d+%/i.test(text)) {
    areasForImprovement.push('Project descriptions lack quantified outcomes or measurable business/performance metrics.');
  }
  if (!hasExpHeading && !/internship|practical/i.test(lower)) {
    missingSections.push('Internships & Practical Training');
  }
  if (!hasCertHeading) {
    missingSections.push('Certifications & Achievements');
  }

  // Actionable Recommendations
  const recommendations = [];

  recommendations.push({
    problem: 'Action verbs and measurable metrics are limited in project bullet points.',
    whyItMatters: 'Recruiters and ATS scanners look for quantifiable achievements (e.g. "Reduced API latency by 30%") rather than passive responsibilities.',
    howToImprove: 'Begin each project bullet with strong action verbs (Developed, Architected, Optimized) and include at least one measurable result.',
    example: 'Example: "Architected a full-stack portal reducing student registration processing time by 45%."',
    priority: 'HIGH'
  });

  if (!hasGithub || !hasLinkedin) {
    recommendations.push({
      problem: 'External portfolio links (GitHub / LinkedIn) are absent or not prominent.',
      whyItMatters: 'Hiring managers in technical recruiting verify active commits, code repositories, and professional endorsements online.',
      howToImprove: 'Include clickable, clean links to your active GitHub profile and customized LinkedIn URL directly in the header contact block.',
      example: 'Example: "github.com/your-username | linkedin.com/in/your-name"',
      priority: 'MEDIUM'
    });
  }

  if (techSkills.length < 6) {
    recommendations.push({
      problem: 'Categorization of skills could be more exhaustive.',
      whyItMatters: 'Applicant Tracking Systems perform keyword density matching against required and preferred job descriptions.',
      howToImprove: 'Divide skills into clear subgroups: "Languages", "Frameworks & Libraries", "Databases", and "Developer Tools".',
      example: 'Example: "Languages: Python, JavaScript; Frameworks: React, Node.js; Databases: MongoDB, MySQL"',
      priority: 'MEDIUM'
    });
  }

  // Summary
  let summary = `This resume presents a solid academic profile for entry-level opportunities, achieving an overall score of ${overallScore}/100. `;
  if (overallScore >= 80) {
    summary += 'It demonstrates high ATS compatibility, well-defined technical skills, and commendable project work.';
  } else if (overallScore >= 65) {
    summary += 'It has a good foundation, but would benefit from adding measurable project impacts and expanding technical keywords.';
  } else {
    summary += 'Strengthening project descriptions with specific technologies and adding external portfolio links will significantly enhance recruiter interest.';
  }

  const analysisResult = {
    isResume: true,
    documentType: 'RESUME',
    overallScore,
    categoryScores,
    summary,
    strengths,
    areasForImprovement,
    extractedSkills: {
      technical: techSkills,
      soft: softSkills,
      industry: ['Web Development', 'Software Engineering'],
      missingOrWeak: ['Cloud Deployment (AWS/Docker)', 'Unit Testing', 'CI/CD Pipelines']
    },
    missingSections,
    recommendations,
    aiModel: 'vvwu-heuristic-engine-v1'
  };

  // 7. Optional Job Match Evaluation
  if (job) {
    analysisResult.jobMatchResult = evaluateJobMatchHeuristic({
      resumeText: text,
      techSkills,
      job
    });
  }

  return analysisResult;
}

/**
 * Heuristically evaluates alignment between resume competencies and a specific Job.
 */
/**
 * Evaluates match against a specific Job posting.
 *
 * @param {string|object} arg1
 * @param {Array<string>} [arg2]
 * @param {object} [arg3]
 * @returns {object}
 */
export function evaluateJobMatchHeuristic(arg1, arg2, arg3) {
  let resumeText, resumeSkills, job;
  if (typeof arg1 === 'object' && arg1 !== null && !Array.isArray(arg1) && !arg2) {
    resumeText = arg1.resumeText || '';
    resumeSkills = arg1.techSkills || arg1.resumeSkills || [];
    job = arg1.job;
  } else {
    resumeText = arg1 || '';
    resumeSkills = Array.isArray(arg2) ? arg2 : [];
    job = arg3;
  }

  const lowerText = (resumeText || '').toLowerCase();
  const resumeSkillsLower = new Set(resumeSkills.map((s) => s.toLowerCase()));

  const required = Array.isArray(job?.eligibilityCriteria?.requiredSkills)
    ? job.eligibilityCriteria.requiredSkills
    : [];
  const preferred = Array.isArray(job?.eligibilityCriteria?.preferredSkills)
    ? job.eligibilityCriteria.preferredSkills
    : [];

  const matchedSkills = [];
  const missingSkills = [];
  const partiallyDemonstratedSkills = [];

  for (const req of required) {
    const rLower = req.toLowerCase();
    if (resumeSkillsLower.has(rLower) || lowerText.includes(rLower)) {
      matchedSkills.push(req);
    } else {
      missingSkills.push(req);
    }
  }

  for (const pref of preferred) {
    const pLower = pref.toLowerCase();
    if (resumeSkillsLower.has(pLower) || lowerText.includes(pLower)) {
      matchedSkills.push(pref);
    } else if (lowerText.includes(pLower.slice(0, 4))) {
      partiallyDemonstratedSkills.push(pref);
    } else {
      missingSkills.push(pref);
    }
  }

  const totalSkills = Math.max(1, required.length + preferred.length);
  const matchRatio = (matchedSkills.length + partiallyDemonstratedSkills.length * 0.5) / totalSkills;
  const jobMatchScore = Math.min(98, Math.max(30, Math.round(matchRatio * 75 + 20)));

  const jobRecommendations = [];
  if (missingSkills.length > 0) {
    jobRecommendations.push(
      `Incorporate practical experience or projects demonstrating the missing required skill(s): ${missingSkills.slice(0, 3).join(', ')}.`
    );
  }
  if (job?.roleOverview || job?.title) {
    jobRecommendations.push(
      `Align your career summary and project highlights with the role objective: "${job?.title || 'Target Role'} at ${job?.companyName || 'the hiring organization'}"`
    );
  }

  return {
    jobMatchScore,
    matchedSkills: Array.from(new Set(matchedSkills)),
    missingSkills: Array.from(new Set(missingSkills)),
    partiallyDemonstratedSkills: Array.from(new Set(partiallyDemonstratedSkills)),
    jobRecommendations,
    jobSnapshot: {
      title: job?.title || '',
      companyName: job?.companyName || job?.companyId?.companyName || '',
      jobType: job?.jobType || 'FULL_TIME',
      workLocation: job?.workLocation || ''
    }
  };
}

export async function analyzeResume({ resumeText, extractedData = {}, student = null, job = null }) {
  const sanitized = sanitizeResumeText(resumeText);
  if (!sanitized || sanitized.length < 20) {
    throw new AppError(400, 'INSUFFICIENT_TEXT', 'Resume contains insufficient readable text for analysis.');
  }

  // Pre-check: Verify document type (Resume vs Certificate vs Marksheet)
  const classification = classifyResumeDocument(sanitized);
  if (!classification.isResume) {
    return generateNonResumeReport(classification, sanitized, job);
  }

  const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  if (geminiApiKey) {
    try {
      return await callGeminiApi({
        apiKey: geminiApiKey,
        sanitizedText: sanitized,
        extractedData,
        student,
        job
      });
    } catch (err) {
      console.warn(`Gemini API call failed (${err.message}). Falling back to heuristic analyzer engine.`);
    }
  }

  // Fallback to high-quality deterministic analysis engine
  return analyzeResumeHeuristic(sanitized, extractedData, student, job);
}

/**
 * Calls Google Gemini REST API with structured response expectations.
 */
async function callGeminiApi({ apiKey, sanitizedText, extractedData, student, job }) {
  const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const prompt = `
You are an expert ATS and Campus Recruitment Resume Evaluator for Vanita Vishram Women's University (VVWU).
Analyze the following document objectively.

CRITICAL INSTRUCTION:
First check if this document is actually a candidate RESUME or CURRICULUM VITAE.
If it is a single-page certificate (e.g. Certificate of Completion, Certificate of Participation, Workshop Certificate), marksheet, or non-resume document:
- Set "isResume": false
- Set "documentType": "CERTIFICATE" (or "MARKSHEET")
- Set "overallScore": 0
- Set all categoryScores to 0
- Set "summary" clearly stating: "Non-Resume Document Detected: The uploaded file appears to be a certificate/credential rather than a candidate Resume or CV. Please upload an authentic resume document."

<DOCUMENT_TEXT>
${sanitizedText}
</DOCUMENT_TEXT>

${job ? `Target Job Details:
Title: ${job.title}
Required Skills: ${(job.eligibilityCriteria?.requiredSkills || []).join(', ')}
Preferred Skills: ${(job.eligibilityCriteria?.preferredSkills || []).join(', ')}
Role Overview: ${job.roleOverview || job.description || ''}` : ''}

You MUST return STRICT JSON ONLY (no markdown backticks, no text outside JSON) conforming to this schema:
{
  "isResume": boolean,
  "documentType": "RESUME" | "CERTIFICATE" | "MARKSHEET" | "INSUFFICIENT_CONTENT",
  "overallScore": number (0-100),
  "categoryScores": {
    "atsCompatibility": number (0-100),
    "skills": number (0-100),
    "education": number (0-100),
    "projects": number (0-100),
    "experience": number (0-100),
    "resumeStructure": number (0-100)
  },
  "summary": "string",
  "strengths": ["string"],
  "areasForImprovement": ["string"],
  "extractedSkills": {
    "technical": ["string"],
    "soft": ["string"],
    "industry": ["string"],
    "missingOrWeak": ["string"]
  },
  "missingSections": ["string"],
  "recommendations": [
    {
      "problem": "string",
      "whyItMatters": "string",
      "howToImprove": "string",
      "example": "string",
      "priority": "HIGH" | "MEDIUM" | "LOW"
    }
  ]
  ${job ? `,
  "jobMatchResult": {
    "jobMatchScore": number (0-100),
    "matchedSkills": ["string"],
    "missingSkills": ["string"],
    "partiallyDemonstratedSkills": ["string"],
    "jobRecommendations": ["string"]
  }` : ''}
}
`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json'
      }
    }),
    signal: AbortSignal.timeout(25000)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini HTTP ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawContent) {
    throw new Error('Empty response from Gemini API.');
  }

  const cleaned = rawContent.replace(/\`\`\`json/gi, '').replace(/\`\`\`/g, '').trim();
  const parsed = JSON.parse(cleaned);

  // Validate critical fields
  if (typeof parsed.overallScore !== 'number') {
    throw new Error('Invalid overallScore in Gemini response.');
  }

  parsed.aiModel = model;
  if (parsed.isResume === undefined) {
    parsed.isResume = true;
    parsed.documentType = 'RESUME';
  }

  if (job) {
    parsed.jobMatchResult = parsed.jobMatchResult || {};
    parsed.jobMatchResult.jobSnapshot = {
      title: job.title || '',
      companyName: job.companyName || job.companyId?.companyName || '',
      jobType: job.jobType || 'FULL_TIME',
      workLocation: job.workLocation || ''
    };
  }

  return parsed;
}
