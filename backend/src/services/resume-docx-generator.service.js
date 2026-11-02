import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle } from 'docx';

/**
 * Generates an ATS-friendly, clean single-column DOCX resume.
 *
 * @param {object} resumeData
 * @returns {Promise<Buffer>}
 */
export async function generateResumeDocx(resumeData = {}) {
  const contact = resumeData.contact || {};
  const candidateName = contact.name || 'Candidate Name';

  const children = [];

  // 1. Header: Name
  children.push(
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: 100 },
      children: [
        new TextRun({
          text: candidateName,
          bold: true,
          size: 32, // 16pt
          color: '102E5F'
        })
      ]
    })
  );

  // 2. Contact Coordinates
  const contactPieces = [];
  if (contact.email) contactPieces.push(contact.email);
  if (contact.phone) contactPieces.push(contact.phone);
  if (contact.linkedin) contactPieces.push(contact.linkedin.replace(/^https?:\/\//i, ''));
  if (contact.github) contactPieces.push(contact.github.replace(/^https?:\/\//i, ''));
  if (contact.location) contactPieces.push(contact.location);

  if (contactPieces.length > 0) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { after: 200 },
        children: [
          new TextRun({
            text: contactPieces.join('  |  '),
            size: 19, // 9.5pt
            color: '475569'
          })
        ]
      })
    );
  }

  function addSectionHeading(title) {
    children.push(
      new Paragraph({
        spacing: { before: 240, after: 80 },
        border: {
          bottom: {
            color: 'CBD5E1',
            space: 4,
            style: BorderStyle.SINGLE,
            size: 6
          }
        },
        children: [
          new TextRun({
            text: title.toUpperCase(),
            bold: true,
            size: 22, // 11pt
            color: '102E5F'
          })
        ]
      })
    );
  }

  // 3. Summary
  if (resumeData.summary) {
    addSectionHeading('Professional Summary');
    children.push(
      new Paragraph({
        spacing: { after: 120 },
        children: [
          new TextRun({
            text: resumeData.summary,
            size: 20,
            color: '1E293B'
          })
        ]
      })
    );
  }

  // 4. Education
  if (Array.isArray(resumeData.education) && resumeData.education.length > 0) {
    addSectionHeading('Education');
    for (const edu of resumeData.education) {
      const deg = edu.degree || edu.degreeTitle || 'Degree';
      const inst = edu.institution || edu.school || '';
      const yr = edu.year || edu.passingYear || '';
      const sc = edu.score || edu.cgpa ? `CGPA: ${edu.score || edu.cgpa}` : '';

      children.push(
        new Paragraph({
          spacing: { after: 40 },
          children: [
            new TextRun({ text: deg, bold: true, size: 20, color: '0F172A' }),
            ...(yr ? [new TextRun({ text: `  |  ${yr}`, size: 18, color: '64748B' })] : [])
          ]
        })
      );

      if (inst || sc) {
        children.push(
          new Paragraph({
            spacing: { after: 100 },
            children: [
              new TextRun({
                text: [inst, sc].filter(Boolean).join('  •  '),
                size: 19,
                color: '334155'
              })
            ]
          })
        );
      }
    }
  }

  // 5. Skills
  if (resumeData.skills) {
    addSectionHeading('Skills & Competencies');
    let skillsText = '';
    if (Array.isArray(resumeData.skills)) {
      skillsText = resumeData.skills.join(', ');
    } else if (typeof resumeData.skills === 'object') {
      const parts = [];
      if (Array.isArray(resumeData.skills.technical)) parts.push(`Technical: ${resumeData.skills.technical.join(', ')}`);
      if (Array.isArray(resumeData.skills.soft)) parts.push(`Soft Skills: ${resumeData.skills.soft.join(', ')}`);
      skillsText = parts.join(' | ');
    } else {
      skillsText = String(resumeData.skills);
    }

    children.push(
      new Paragraph({
        spacing: { after: 120 },
        children: [
          new TextRun({
            text: skillsText,
            size: 20,
            color: '1E293B'
          })
        ]
      })
    );
  }

  // 6. Projects
  if (Array.isArray(resumeData.projects) && resumeData.projects.length > 0) {
    addSectionHeading('Projects');
    for (const proj of resumeData.projects) {
      const title = proj.title || 'Project';
      const techs = Array.isArray(proj.technologies) ? proj.technologies.join(', ') : (proj.technologies || '');
      const desc = proj.description || '';

      children.push(
        new Paragraph({
          spacing: { after: 40 },
          children: [
            new TextRun({ text: title, bold: true, size: 20, color: '0F172A' }),
            ...(techs ? [new TextRun({ text: `  [${techs}]`, italics: true, size: 18, color: '087C91' })] : [])
          ]
        })
      );

      if (desc) {
        children.push(
          new Paragraph({
            spacing: { after: 100 },
            bullet: { level: 0 },
            children: [
              new TextRun({
                text: desc,
                size: 19,
                color: '334155'
              })
            ]
          })
        );
      }
    }
  }

  // 7. Experience
  if (Array.isArray(resumeData.experience) && resumeData.experience.length > 0) {
    addSectionHeading('Experience & Internships');
    for (const exp of resumeData.experience) {
      const role = exp.role || 'Role';
      const org = exp.organization || exp.company || '';
      const dur = exp.duration || '';
      const desc = exp.description || '';

      children.push(
        new Paragraph({
          spacing: { after: 40 },
          children: [
            new TextRun({ text: role, bold: true, size: 20, color: '0F172A' }),
            ...(org || dur ? [new TextRun({ text: `  —  ${[org, dur].filter(Boolean).join(' | ')}`, size: 18, color: '64748B' })] : [])
          ]
        })
      );

      if (desc) {
        children.push(
          new Paragraph({
            spacing: { after: 100 },
            bullet: { level: 0 },
            children: [
              new TextRun({
                text: desc,
                size: 19,
                color: '334155'
              })
            ]
          })
        );
      }
    }
  }

  // 8. Certifications
  if (Array.isArray(resumeData.certifications) && resumeData.certifications.length > 0) {
    addSectionHeading('Certifications & Achievements');
    for (const cert of resumeData.certifications) {
      children.push(
        new Paragraph({
          spacing: { after: 40 },
          bullet: { level: 0 },
          children: [
            new TextRun({
              text: cert,
              size: 19,
              color: '334155'
            })
          ]
        })
      );
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, bottom: 720, left: 720, right: 720 }
          }
        },
        children
      }
    ]
  });

  return await Packer.toBuffer(doc);
}

