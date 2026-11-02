import fs from 'node:fs';
import path from 'node:path';
import { AppError } from '../utils/app-error.js';

/**
 * Validates the file buffer magic bytes/signatures.
 *
 * @param {Buffer} buffer
 * @param {string} originalName
 * @param {string} mimeType
 * @returns {'PDF' | 'DOCX' | 'DOC'}
 */
export function detectAndValidateFileType(buffer, originalName = '', mimeType = '') {
  if (!buffer || buffer.length === 0) {
    throw new AppError(400, 'EMPTY_FILE', 'The uploaded file is empty.');
  }

  const ext = path.extname(originalName).toLowerCase();

  // PDF signature: %PDF- (hex: 25 50 44 46 2D)
  const isPdfSig = buffer.length >= 5 && buffer.slice(0, 5).toString('ascii').startsWith('%PDF-');

  // DOCX / ZIP signature: PK\x03\x04 (hex: 50 4B 03 04)
  const isZipSig =
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04;

  // Legacy DOC signature: D0 CF 11 E0 A1 B1 1A E1 (OLECF)
  const isOleSig =
    buffer.length >= 8 &&
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0;

  if (isPdfSig || ext === '.pdf' || mimeType === 'application/pdf') {
    if (!isPdfSig) {
      throw new AppError(400, 'INVALID_FILE_FORMAT', 'File has a .pdf extension but is not a valid PDF document.');
    }
    return 'PDF';
  }

  if (isZipSig || ext === '.docx') {
    if (!isZipSig) {
      throw new AppError(400, 'INVALID_FILE_FORMAT', 'File has a .docx extension but is not a valid OpenXML document.');
    }
    return 'DOCX';
  }

  if (isOleSig || ext === '.doc') {
    throw new AppError(
      400,
      'UNSUPPORTED_LEGACY_FORMAT',
      'Legacy .doc binary format is not supported. Please save or export your resume as .pdf or .docx.'
    );
  }

  throw new AppError(
    400,
    'UNSUPPORTED_FORMAT',
    'Unsupported file format. Please upload your resume in PDF (.pdf) or Microsoft Word (.docx) format.'
  );
}

/**
 * Extracts readable plain text from a resume document buffer.
 *
 * @param {Buffer} buffer
 * @param {string} originalName
 * @param {string} mimeType
 * @returns {Promise<{ text: string, fileType: string, extractedData: object }>}
 */
export async function extractResumeText(buffer, originalName = '', mimeType = '') {
  const fileType = detectAndValidateFileType(buffer, originalName, mimeType);
  let rawText = '';

  if (fileType === 'PDF') {
    try {
      const pdfModule = await import('pdf-parse');
      const PDFParse = pdfModule.PDFParse || pdfModule.default?.PDFParse;
      if (!PDFParse) {
        throw new Error('PDFParse constructor could not be resolved from pdf-parse module.');
      }

      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      rawText = (result && result.text) ? result.text : '';
    } catch (err) {
      if (err.name === 'PasswordException' || /password/i.test(err.message)) {
        throw new AppError(400, 'PASSWORD_PROTECTED', 'This PDF is password-protected. Please upload an unprotected copy.');
      }
      throw new AppError(400, 'CORRUPTED_DOCUMENT', `Failed to parse PDF document: ${err.message}`);
    }
  } else if (fileType === 'DOCX') {
    try {
      const mammothModule = await import('mammoth');
      const mammoth = mammothModule.default || mammothModule;
      const result = await mammoth.extractRawText({ buffer });
      rawText = (result && result.value) ? result.value : '';
    } catch (err) {
      throw new AppError(400, 'CORRUPTED_DOCUMENT', `Failed to parse DOCX document: ${err.message}`);
    }
  }

  const cleanText = (rawText || '').replace(/\r\n/g, '\n').replace(/\t/g, ' ').trim();

  if (cleanText.length < 20) {
    throw new AppError(
      400,
      'EMPTY_DOCUMENT_TEXT',
      'The uploaded document contains insufficient or unreadable text. If this is a scanned document image, please upload a text-selectable PDF or DOCX.'
    );
  }

  const extractedData = parseBasicResumeSections(cleanText);

  return {
    text: cleanText,
    fileType,
    extractedData
  };
}

/**
 * Extracts key contact details and section buckets using deterministic heuristics.
 *
 * @param {string} text
 * @returns {object}
 */
export function parseBasicResumeSections(text) {
  const contact = {};

  // Email
  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) contact.email = emailMatch[0].toLowerCase();

  // Indian/International Phone: +91 / 10 digits
  const phoneMatch = text.match(/(?:\+91[\s-]?)?[6-9]\d{9}\b/);
  if (phoneMatch) {
    const digits = phoneMatch[0].replace(/\D/g, '');
    contact.phone = digits.length > 10 ? digits.slice(-10) : digits;
  }

  // LinkedIn
  const linkedinMatch = text.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+/i);
  if (linkedinMatch) contact.linkedin = linkedinMatch[0];

  // GitHub
  const githubMatch = text.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[a-zA-Z0-9_-]+/i);
  if (githubMatch) contact.github = githubMatch[0];

  // Common Skills Dictionary
  const commonTechSkills = [
    'JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'C#', 'PHP', 'Ruby', 'Go', 'Rust', 'Swift', 'Kotlin',
    'React', 'React.js', 'Angular', 'Vue', 'Vue.js', 'Node.js', 'Express', 'Express.js', 'Next.js', 'Django',
    'Flask', 'Spring Boot', 'Laravel', 'ASP.NET', 'HTML', 'HTML5', 'CSS', 'CSS3', 'Tailwind', 'Bootstrap',
    'MongoDB', 'MySQL', 'PostgreSQL', 'SQLite', 'Redis', 'Oracle', 'SQL Server',
    'Git', 'GitHub', 'GitLab', 'Docker', 'Kubernetes', 'AWS', 'Azure', 'GCP', 'Linux', 'CI/CD',
    'REST', 'RESTful API', 'GraphQL', 'Machine Learning', 'Data Science', 'Pandas', 'NumPy', 'TensorFlow', 'PyTorch'
  ];

  const skillsFound = new Set();
  const lowerText = text.toLowerCase();

  for (const skill of commonTechSkills) {
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?:^|[^a-zA-Z0-9_#+])${escaped}(?:$|[^a-zA-Z0-9_#+])`, 'i');
    if (regex.test(text)) {
      skillsFound.add(skill);
    }
  }

  // Section splitting heuristics
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const education = [];
  const projects = [];
  const experience = [];
  const certifications = [];

  let currentSection = '';
  for (const line of lines) {
    const lLower = line.toLowerCase();
    if (/^(education|academic background|qualifications?)$/i.test(lLower) || /^(education\b)/i.test(lLower)) {
      currentSection = 'education';
      continue;
    }
    if (/^(projects?|academic projects?|key projects?)$/i.test(lLower) || /^(projects?\b)/i.test(lLower)) {
      currentSection = 'projects';
      continue;
    }
    if (/^(experience|work experience|internships?|employment history)$/i.test(lLower)) {
      currentSection = 'experience';
      continue;
    }
    if (/^(certifications?|certificates?|licenses?)$/i.test(lLower)) {
      currentSection = 'certifications';
      continue;
    }
    if (/^(skills?|technical skills?|core competencies)$/i.test(lLower)) {
      currentSection = 'skills';
      continue;
    }

    if (currentSection === 'education' && line.length > 5 && education.length < 5) {
      if (/b\.?tech|b\.?e|bca|mca|b\.?sc|m\.?sc|diploma|university|college|school|cgpa|percentage|\b20\d\d\b/i.test(line)) {
        education.push({ degree: line.slice(0, 120), institution: '', year: '', score: '' });
      }
    } else if (currentSection === 'projects' && line.length > 5 && projects.length < 6) {
      projects.push({ title: line.slice(0, 100), description: '', technologies: [] });
    } else if (currentSection === 'experience' && line.length > 5 && experience.length < 6) {
      experience.push({ role: line.slice(0, 100), organization: '', duration: '', description: '' });
    } else if (currentSection === 'certifications' && line.length > 5 && certifications.length < 6) {
      certifications.push(line.slice(0, 120));
    }
  }

  return {
    contact,
    skills: Array.from(skillsFound),
    education,
    projects,
    experience,
    certifications
  };
}

/**
 * Accurately determines if the extracted document text is an authentic Resume/CV
 * or a non-resume document such as a Certificate of Completion, Marksheet, or ID card.
 *
 * @param {string} text
 * @returns {{ isResume: boolean, documentType: 'RESUME' | 'CERTIFICATE' | 'MARKSHEET' | 'INSUFFICIENT_CONTENT', reason: string }}
 */
export function classifyResumeDocument(text) {
  const clean = (text || '').trim();
  const wordCount = clean.split(/\s+/).filter(Boolean).length;

  const certificatePhrases = [
    /certificate of (completion|participation|merit|appreciation|achievement|excellence)/i,
    /this is to (proudly )?certify that/i,
    /has (successfully )?completed the (training|workshop|course|program)/i,
    /is hereby awarded this certificate/i,
    /\bcertificate (no|number|id)\b/i,
    /\bauthorized signatory\b/i,
    /\bbonafide certificate\b/i,
    /\bconducted by the (central )?placement cell\b/i,
    /\bscan to verify\b/i,
    /director \/ head\s*training & placement cell/i
  ];

  const certificateMatches = certificatePhrases.filter((regex) => regex.test(clean));

  const marksheetPhrases = [
    /statement of marks/i,
    /semester grade report/i,
    /grade card/i,
    /transcript of records/i,
    /\btotal credits earned\b/i
  ];
  const marksheetMatches = marksheetPhrases.filter((regex) => regex.test(clean));

  const hasResumeHeadings = [
    /\b(technical )?skills\b/i.test(clean),
    /\bprojects?\b/i.test(clean),
    /\beducation\b/i.test(clean),
    /\bexperience|internships?\b/i.test(clean),
    /\bcurriculum vitae\b|\bresume\b/i.test(clean)
  ].filter(Boolean).length;

  const hasContact =
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(clean) ||
    /(?:\+91[\s-]?)?[6-9]\d{9}\b/.test(clean);

  // Standalone Certificate detection
  if (
    certificateMatches.length >= 2 ||
    (certificateMatches.length >= 1 && (wordCount < 120 || hasResumeHeadings < 2))
  ) {
    return {
      isResume: false,
      documentType: 'CERTIFICATE',
      reason: 'The uploaded file appears to be a course/workshop Certificate of Completion, not a candidate Resume or Curriculum Vitae.'
    };
  }

  if (marksheetMatches.length >= 1 && hasResumeHeadings < 2) {
    return {
      isResume: false,
      documentType: 'MARKSHEET',
      reason: 'The uploaded file appears to be an academic Marksheet or Grade Report, not a Resume or Curriculum Vitae.'
    };
  }

  if (wordCount < 60 && hasResumeHeadings < 2 && !hasContact) {
    return {
      isResume: false,
      documentType: 'INSUFFICIENT_CONTENT',
      reason: 'The uploaded document contains insufficient content (fewer than 60 words and no resume sections).'
    };
  }

  return {
    isResume: true,
    documentType: 'RESUME',
    reason: 'Valid resume document structure.'
  };
}
