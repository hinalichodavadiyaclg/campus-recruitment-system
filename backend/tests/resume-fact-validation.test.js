import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractSourceFacts,
  validateImprovedSection
} from '../src/services/resume-fact-validation.service.js';

test('extractSourceFacts extracts verified skills, percentages, and year tokens', () => {
  const original = `
    Sneha Desai
    sneha@example.com | 9876543210
    Education: B.Tech Computer Engineering (2022 - 2026), CGPA: 8.8
    Skills: Python, MySQL, HTML, CSS, JavaScript
    Projects: Online Bookshop - built with Python and MySQL.
  `;

  const facts = extractSourceFacts(original, { skills: ['Python', 'MySQL', 'JavaScript'] });

  assert.ok(facts.skills.has('python'));
  assert.ok(facts.skills.has('mysql'));
  assert.ok(facts.skills.has('javascript'));
  assert.equal(facts.skills.has('docker'), false);
  assert.equal(facts.skills.has('aws'), false);
  assert.ok(facts.years.has('2026'));
  assert.equal(facts.percentages.size, 0); // No percentages in source
});

test('validateImprovedSection detects and flags invented percentage metrics', () => {
  const original = 'Built student portal using Python and MySQL.';
  const facts = extractSourceFacts(original, { skills: ['Python', 'MySQL'] });

  const hallucinatedImproved = 'Engineered student portal using Python and MySQL, reducing administrative load by 40%.';

  const result = validateImprovedSection({
    sectionKey: 'projects',
    originalContent: original,
    improvedContent: hallucinatedImproved,
    sourceFacts: facts
  });

  assert.equal(result.isValid, false);
  assert.ok(result.unsupportedClaims.some((c) => c.includes("Invented percentage metric '40%'")));
  // Sanitized content must strip the invented metric clause
  assert.equal(result.sanitizedContent.includes('40%'), false);
  assert.ok(result.sanitizedContent.includes('Python'));
  assert.ok(result.sanitizedContent.includes('MySQL'));
});

test('validateImprovedSection detects and flags ungrounded technologies', () => {
  const original = 'Developed web app with HTML, CSS and JavaScript.';
  const facts = extractSourceFacts(original, { skills: ['HTML', 'CSS', 'JavaScript'] });

  const hallucinatedImproved = 'Architected responsive web app using HTML, CSS, JavaScript, React, Docker and AWS.';

  const result = validateImprovedSection({
    sectionKey: 'projects',
    originalContent: original,
    improvedContent: hallucinatedImproved,
    sourceFacts: facts
  });

  assert.equal(result.isValid, false);
  assert.ok(result.unsupportedClaims.some((c) => c.includes("Invented technology competency 'react'")));
  assert.ok(result.unsupportedClaims.some((c) => c.includes("Invented technology competency 'docker'")));
  assert.ok(result.unsupportedClaims.some((c) => c.includes("Invented technology competency 'aws'")));
});

test('validateImprovedSection accepts authentic wording improvements without inventions', () => {
  const original = 'Made student management system using Python and MySQL.';
  const facts = extractSourceFacts(original, { skills: ['Python', 'MySQL'] });

  const legitimateImproved = 'Developed a Student Management System using Python and MySQL to organize student records.';

  const result = validateImprovedSection({
    sectionKey: 'projects',
    originalContent: original,
    improvedContent: legitimateImproved,
    sourceFacts: facts
  });

  assert.equal(result.isValid, true);
  assert.equal(result.unsupportedClaims.length, 0);
  assert.equal(result.sanitizedContent, legitimateImproved);
  assert.ok(result.sourceEvidence.includes('Python'));
  assert.ok(result.sourceEvidence.includes('MySQL'));
});

