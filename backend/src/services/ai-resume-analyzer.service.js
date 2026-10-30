import { AppError } from '../utils/app-error.js';

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

  // ATS Score calculation (20% weight)
  let atsScore = 50;
  if (hasEmail) atsScore += 12;
  if (hasPhone) atsScore += 10;
  if (hasLinkedin || hasGithub) atsScore += 8;
  if (hasEduHeading) atsScore += 7;
  if (hasSkillsHeading) atsScore += 7;
  if (hasProjHeading) atsScore += 6;
  atsScore = Math.min(95, Math.max(35, atsScore));

  // 2. Skills Analysis (20% weight)
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

  let skillsScore = 40 + Math.min(45, techSkills.length * 7) + Math.min(10, softSkills.length * 3);
  skillsScore = Math.min(96, Math.max(30, skillsScore));

  // 3. Education Score (10% weight)
  let eduScore = hasEduHeading ? 65 : 30;
  if (/b\.?tech|b\.?e|bca|mca|b\.?sc|m\.?sc|diploma|university|college/i.test(lower)) eduScore += 15;
  if (/cgpa|percentage|\b20\d\d\b|semester/i.test(lower)) eduScore += 15;
  eduScore = Math.min(95, Math.max(30, eduScore));

  // 4. Projects Score (20% weight)
  let projScore = hasProjHeading ? 55 : 30;
  const projectMentions = (text.match(/github|deployed|api|database|frontend|backend|app|system|developed|implemented|designed/gi) || []).length;
  projScore += Math.min(35, projectMentions * 4);
  projScore = Math.min(96, Math.max(35, projScore));

  // 5. Experience / Practical Exposure (10% weight - Fresher-Friendly)
  let expScore = 55; // Base fair score for campus freshers
  if (/intern|internship/i.test(lower)) expScore += 25;
  if (/naandi|edunet|training|workshop|hackathon|freelance/i.test(lower)) expScore += 15;
  if (hasExpHeading) expScore += 5;
  expScore = Math.min(95, Math.max(40, expScore));

  // 6. Resume Structure & Content (20% weight)
  let structScore = 60;
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (wordCount >= 180 && wordCount <= 750) structScore += 15;
  if (hasEmail && hasPhone && hasEduHeading && hasSkillsHeading) structScore += 15;
  if (text.includes('•') || text.includes('- ') || text.includes('* ')) structScore += 8;
  structScore = Math.min(95, Math.max(35, structScore));

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
  if (projScore >= 75) {
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

  // Job Match (if job provided)
  let jobMatchResult = null;
  if (job) {
    jobMatchResult = evaluateJobMatchHeuristic(text, techSkills, job);
  }

  return {
    overallScore,
    categoryScores,
    summary,
    strengths,
    areasForImprovement,
    extractedSkills: {
      technical: techSkills,
      soft: softSkills,
      industry: ['Software Engineering', 'Web Development'],
      missingOrWeak: ['Cloud Infrastructure', 'CI/CD Pipelines']
    },
    missingSections,
    recommendations,
    jobMatchResult,
    aiModel: 'vvwu-ai-analyzer-v1'
  };
}

/**
 * Evaluates match against a specific Job posting.
 *
 * @param {string} resumeText
 * @param {Array<string>} resumeSkills
 * @param {object} job
 * @returns {object}
 */
export function evaluateJobMatchHeuristic(resumeText, resumeSkills, job) {
  const lowerText = resumeText.toLowerCase();
  const resumeSkillsLower = new Set(resumeSkills.map((s) => s.toLowerCase()));

  const required = Array.isArray(job.eligibilityCriteria?.requiredSkills)
    ? job.eligibilityCriteria.requiredSkills
    : [];
  const preferred = Array.isArray(job.eligibilityCriteria?.preferredSkills)
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
  if (job.roleOverview) {
    jobRecommendations.push(
      `Align your career summary and project highlights with the role objective: "${job.title} at ${job.companyName || 'the hiring organization'}"`
    );
  }

  return {
    jobMatchScore,
    matchedSkills: Array.from(new Set(matchedSkills)),
    missingSkills: Array.from(new Set(missingSkills)),
    partiallyDemonstratedSkills: Array.from(new Set(partiallyDemonstratedSkills)),
    jobRecommendations,
    jobSnapshot: {
      title: job.title || 'Job Opening',
      companyName: job.companyName || job.companyId?.companyName || 'Hiring Company',
      jobType: job.jobType || 'FULL_TIME',
      workLocation: job.workLocation || 'On-site'
    }
  };
}

/**
 * Main AI Analysis dispatcher. Uses Google Gemini API if configured; otherwise seamlessly uses
 * the deterministic analysis engine.
 *
 * @param {object} params
 * @param {string} params.resumeText
 * @param {object} [params.extractedData]
 * @param {object} [params.student]
 * @param {object} [params.job]
 * @returns {Promise<object>}
 */
export async function analyzeResume({ resumeText, extractedData = {}, student = null, job = null }) {
  const sanitized = sanitizeResumeText(resumeText);
  if (!sanitized || sanitized.length < 20) {
    throw new AppError(400, 'INSUFFICIENT_TEXT', 'Resume contains insufficient readable text for analysis.');
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
Analyze the following resume document objectively.

<RESUME_DOCUMENT>
${sanitizedText}
</RESUME_DOCUMENT>

${job ? `Target Job Details:
Title: ${job.title}
Required Skills: ${(job.eligibilityCriteria?.requiredSkills || []).join(', ')}
Preferred Skills: ${(job.eligibilityCriteria?.preferredSkills || []).join(', ')}
Role Overview: ${job.roleOverview || job.description || ''}` : ''}

You MUST return STRICT JSON ONLY (no markdown backticks, no text outside JSON) conforming to this schema:
{
  "overallScore": number (0-100),
  "categoryScores": {
    "atsCompatibility": number (0-100),
    "skills": number (0-100),
    "education": number (0-100),
    "projects": number (0-100),
    "experience": number (0-100, do not penalize freshers without formal jobs),
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

  const cleaned = rawContent.replace(/```json/gi, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(cleaned);

  // Validate critical fields
  if (typeof parsed.overallScore !== 'number') {
    throw new Error('Invalid overallScore in Gemini response.');
  }

  parsed.aiModel = model;
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
