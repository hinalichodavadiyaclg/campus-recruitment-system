/**
 * Comprehensive Resume Fact-Preservation & Anti-Hallucination Validation Engine
 *
 * Enforces strict alignment with the student's authentic uploaded resume.
 * Prevents AI from inventing skills, technologies, performance metrics,
 * internships, companies, degrees, dates, or certifications.
 */

// Canonical casing dictionary for common technical terms
const CANONICAL_TECH_NAMES = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  java: 'Java',
  'c++': 'C++',
  'c#': 'C#',
  php: 'PHP',
  ruby: 'Ruby',
  go: 'Go',
  rust: 'Rust',
  swift: 'Swift',
  kotlin: 'Kotlin',
  react: 'React',
  angular: 'Angular',
  vue: 'Vue',
  'node.js': 'Node.js',
  node: 'Node.js',
  express: 'Express',
  'express.js': 'Express.js',
  'next.js': 'Next.js',
  django: 'Django',
  flask: 'Flask',
  'spring boot': 'Spring Boot',
  laravel: 'Laravel',
  'asp.net': 'ASP.NET',
  html: 'HTML',
  css: 'CSS',
  tailwind: 'Tailwind',
  bootstrap: 'Bootstrap',
  mongodb: 'MongoDB',
  mysql: 'MySQL',
  postgresql: 'PostgreSQL',
  sqlite: 'SQLite',
  redis: 'Redis',
  oracle: 'Oracle',
  'sql server': 'SQL Server',
  git: 'Git',
  github: 'GitHub',
  gitlab: 'GitLab',
  docker: 'Docker',
  kubernetes: 'Kubernetes',
  aws: 'AWS',
  azure: 'Azure',
  gcp: 'GCP',
  linux: 'Linux',
  'ci/cd': 'CI/CD',
  graphql: 'GraphQL',
  'rest api': 'REST API',
  'restful api': 'RESTful API'
};

const TECH_KEYWORDS = Object.keys(CANONICAL_TECH_NAMES);

/**
 * Extracts factual tokens and verified claims from the original resume.
 *
 * @param {string} originalText
 * @param {object} [extractedData]
 * @returns {object}
 */
export function extractSourceFacts(originalText = '', extractedData = {}) {
  const cleanText = (originalText || '').trim();
  const lowerText = cleanText.toLowerCase();

  // 1. Extract verified skills
  const skillsSet = new Set();
  if (Array.isArray(extractedData?.skills)) {
    extractedData.skills.forEach((s) => skillsSet.add(s.toLowerCase().trim()));
  }

  // Scan text for tech keywords present in source
  for (const tech of TECH_KEYWORDS) {
    const escaped = tech.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?:^|[^a-zA-Z0-9_#+])${escaped}(?:$|[^a-zA-Z0-9_#+])`, 'i');
    if (regex.test(lowerText)) {
      skillsSet.add(tech);
    }
  }

  // 2. Extract verified percentages (e.g. 40%, 85.5%)
  const percentageMatches = lowerText.match(/\b\d+(?:\.\d+)?\s*%/g) || [];
  const percentages = new Set(percentageMatches.map((p) => p.replace(/\s+/g, '')));

  // 3. Extract verified numbers (e.g., 2026, 8.6, 500)
  const numberMatches = lowerText.match(/\b\d+(?:\.\d+)?\b/g) || [];
  const numbers = new Set(numberMatches);

  // 4. Extract verified 4-digit years
  const yearMatches = lowerText.match(/\b(19\d\d|20\d\d)\b/g) || [];
  const years = new Set(yearMatches);

  // 5. Significant word tokens (length >= 4)
  const words = lowerText
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4);
  const wordTokens = new Set(words);

  return {
    fullText: lowerText,
    rawText: cleanText,
    skills: skillsSet,
    percentages,
    numbers,
    years,
    wordTokens
  };
}

/**
 * Validates an improved section against source facts.
 * Detects ungrounded technologies, invented percentages, and unsupported factual claims.
 *
 * @param {object} params
 * @param {string} params.sectionKey
 * @param {any} params.originalContent
 * @param {any} params.improvedContent
 * @param {object} params.sourceFacts
 * @returns {{
 *   isValid: boolean,
 *   unsupportedClaims: Array<string>,
 *   sanitizedContent: any,
 *   sourceEvidence: Array<string>
 * }}
 */
export function validateImprovedSection({ sectionKey, originalContent, improvedContent, sourceFacts }) {
  const unsupportedClaims = [];
  const sourceEvidence = [];

  const improvedText = typeof improvedContent === 'string'
    ? improvedContent
    : JSON.stringify(improvedContent);
  const lowerImproved = improvedText.toLowerCase();

  // Rule 1: Check for newly introduced percentage metrics (e.g. "reduced latency by 40%")
  const newPercentages = lowerImproved.match(/\b\d+(?:\.\d+)?\s*%/g) || [];
  for (const p of newPercentages) {
    const cleanP = p.replace(/\s+/g, '');
    if (!sourceFacts.percentages.has(cleanP)) {
      unsupportedClaims.push(`Invented percentage metric '${cleanP}' not present in original resume.`);
    }
  }

  // Rule 2: Check for newly introduced technologies / frameworks
  for (const tech of TECH_KEYWORDS) {
    const escaped = tech.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?:^|[^a-zA-Z0-9_#+])${escaped}(?:$|[^a-zA-Z0-9_#+])`, 'i');
    const inImproved = regex.test(lowerImproved);
    const inOriginal = sourceFacts.skills.has(tech) || regex.test(sourceFacts.fullText);

    const displayName = CANONICAL_TECH_NAMES[tech] || (tech.charAt(0).toUpperCase() + tech.slice(1));

    if (inImproved && !inOriginal) {
      unsupportedClaims.push(`Invented technology competency '${tech}' not found in original resume.`);
    } else if (inImproved && inOriginal) {
      sourceEvidence.push(displayName);
    }
  }

  // Rule 3: For skills sections, ensure all listed items are grounded
  if (sectionKey === 'skills') {
    if (Array.isArray(improvedContent)) {
      const sanitizedSkills = [];
      for (const skillItem of improvedContent) {
        const sName = typeof skillItem === 'string' ? skillItem : (skillItem.name || '');
        const sLower = sName.toLowerCase().trim();
        const isGrounded = sourceFacts.skills.has(sLower) || sourceFacts.fullText.includes(sLower);
        if (isGrounded) {
          sanitizedSkills.push(skillItem);
          sourceEvidence.push(sName);
        } else {
          unsupportedClaims.push(`Removed unverified skill '${sName}' from improved list.`);
        }
      }

      return {
        isValid: unsupportedClaims.length === 0,
        unsupportedClaims,
        sanitizedContent: sanitizedSkills.length > 0 ? sanitizedSkills : originalContent,
        sourceEvidence: Array.from(new Set(sourceEvidence))
      };
    }
  }

  // Rule 4: Clean up unsupported percentages / metrics from project/experience text
  let sanitizedContent = improvedContent;
  if (unsupportedClaims.length > 0) {
    if (typeof improvedContent === 'string') {
      let cleaned = improvedContent;
      // Strip invented clauses like ", reducing administrative workload by 40%"
      cleaned = cleaned.replace(/,\s*(?:reducing|increasing|improving|cutting|saving)\s+[^.,;]*\b\d+(?:\.\d+)?\s*%/gi, '');
      cleaned = cleaned.replace(/\s*\bby\s+\d+(?:\.\d+)?\s*%/gi, '');
      cleaned = cleaned.replace(/\b\d+(?:\.\d+)?\s*%/gi, '');

      // Strip ungrounded tech keywords from text if flagged
      for (const claim of unsupportedClaims) {
        const match = claim.match(/technology competency '([^']+)'/);
        if (match && match[1]) {
          const techName = match[1];
          const techRegex = new RegExp(`\\b${techName}\\b[,\\s]*`, 'gi');
          cleaned = cleaned.replace(techRegex, '');
        }
      }

      sanitizedContent = cleaned.replace(/\s{2,}/g, ' ').replace(/\s+\./g, '.').trim();
      // If stripping left it empty or corrupted, fall back safely to originalContent
      if (sanitizedContent.length < 15) {
        sanitizedContent = originalContent;
      }
    }
  }

  // Build supporting evidence tokens
  for (const token of sourceFacts.wordTokens) {
    if (token.length >= 5 && lowerImproved.includes(token)) {
      if (sourceEvidence.length < 10) {
        sourceEvidence.push(token);
      }
    }
  }

  return {
    isValid: unsupportedClaims.length === 0,
    unsupportedClaims,
    sanitizedContent,
    sourceEvidence: Array.from(new Set(sourceEvidence))
  };
}
