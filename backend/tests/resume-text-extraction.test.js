import assert from 'node:assert/strict';
import test from 'node:test';
import {
  detectAndValidateFileType,
  extractResumeText,
  parseBasicResumeSections, classifyResumeDocument
} from '../src/services/resume-text-extraction.service.js';

test('detectAndValidateFileType identifies valid PDF by magic bytes', () => {
  const pdfBuffer = Buffer.from('%PDF-1.7\nSample content');
  const type = detectAndValidateFileType(pdfBuffer, 'resume.pdf', 'application/pdf');
  assert.equal(type, 'PDF');
});

test('detectAndValidateFileType identifies valid DOCX by ZIP magic bytes', () => {
  const docxBuffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00]);
  const type = detectAndValidateFileType(docxBuffer, 'my_resume.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.equal(type, 'DOCX');
});

test('detectAndValidateFileType rejects empty buffer', () => {
  assert.throws(
    () => detectAndValidateFileType(Buffer.alloc(0), 'resume.pdf'),
    (err) => {
      assert.match(err.message, /empty/i);
      return true;
    }
  );
});

test('detectAndValidateFileType rejects invalid file masquerading as PDF', () => {
  const fakePdf = Buffer.from('NOT A PDF FILE');
  assert.throws(
    () => detectAndValidateFileType(fakePdf, 'fake.pdf', 'application/pdf'),
    (err) => {
      assert.match(err.message, /not a valid PDF/i);
      return true;
    }
  );
});

test('parseBasicResumeSections accurately parses contacts and technical skills', () => {
  const sampleResume = `
    Ananya Patel
    ananya.patel@vvwu.edu.in | +91 9876543210
    linkedin.com/in/ananya-patel | github.com/ananya-dev

    EDUCATION
    B.Tech in Computer Engineering, Vanita Vishram Women's University
    CGPA: 8.9 (2022 - 2026)

    SKILLS
    JavaScript, TypeScript, React, Node.js, Express, MongoDB, Python, Docker, Git

    PROJECTS
    Campus Recruitment Portal
    Developed full-stack placement portal using React, Node.js, and MongoDB.
    Implemented RESTful API endpoints and reduced response latency by 35%.

    INTERNSHIPS
    Software Engineering Intern at Tech Solutions (3 months)
  `;

  const parsed = parseBasicResumeSections(sampleResume);

  assert.equal(parsed.contact.email, 'ananya.patel@vvwu.edu.in');
  assert.equal(parsed.contact.phone, '9876543210');
  assert.ok(parsed.contact.linkedin.includes('ananya-patel'));
  assert.ok(parsed.contact.github.includes('ananya-dev'));

  assert.ok(parsed.skills.includes('JavaScript'));
  assert.ok(parsed.skills.includes('React'));
  assert.ok(parsed.skills.includes('Node.js'));
  assert.ok(parsed.skills.includes('MongoDB'));
  assert.ok(parsed.skills.includes('Python'));
  assert.ok(parsed.skills.includes('Docker'));

  assert.ok(parsed.education.length > 0);
  assert.ok(parsed.projects.length > 0);
});

test('extractResumeText extracts text from PDFKit generated PDF document', async () => {
  const PDFDocument = (await import('pdfkit')).default;

  const pdfBuffer = await new Promise((resolve) => {
    const doc = new PDFDocument();
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    doc.fontSize(16).text('Pooja Shah - Software Engineer');
    doc.fontSize(12).text('Email: pooja.shah@example.com | Phone: 9988776655');
    doc.text('Skills: Python, Django, PostgreSQL, Docker, Git');
    doc.text('Education: Bachelor of Technology in Information Technology');
    doc.text('Projects: Real-time Analytics Dashboard developed with Python and React.');
    doc.end();
  });

  const result = await extractResumeText(pdfBuffer, 'resume.pdf', 'application/pdf');

  assert.equal(result.fileType, 'PDF');
  assert.ok(result.text.length > 50);
  assert.match(result.text, /Pooja Shah/i);
  assert.match(result.text, /Python/i);
  assert.equal(result.extractedData.contact.email, 'pooja.shah@example.com');
  assert.ok(result.extractedData.skills.includes('Python'));
});

test('classifyResumeDocument differentiates certificates and resumes accurately', () => {
  const certText = `
    Vanita Vishram Women's University | Training & Placement Cell
    CERTIFICATE OF COMPLETION
    This is to proudly certify that Anaya Joshi has successfully completed the workshop.
    Certificate No: CERT-2026-0018
    Authorized Signatory
  `;

  const certResult = classifyResumeDocument(certText);
  assert.equal(certResult.isResume, false);
  assert.equal(certResult.documentType, 'CERTIFICATE');

  const resumeText = `
    Riya Patel
    riya@example.com | 9876543210
    Education: B.Tech Computer Engineering
    Skills: React, Node.js, Python, MongoDB
    Projects: Campus Portal built using React and Node.js.
  `;

  const resumeResult = classifyResumeDocument(resumeText);
  assert.equal(resumeResult.isResume, true);
  assert.equal(resumeResult.documentType, 'RESUME');
});
