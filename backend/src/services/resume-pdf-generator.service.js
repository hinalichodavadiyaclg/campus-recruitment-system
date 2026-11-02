import PDFDocument from 'pdfkit';

/**
 * Generates an ATS-friendly, professional, single-column resume PDF using PDFKit.
 *
 * @param {object} resumeData
 * @param {object} resumeData.contact - { name, email, phone, linkedin, github, location }
 * @param {string} [resumeData.summary]
 * @param {Array<object>} [resumeData.education] - [{ degree, institution, year, score }]
 * @param {Array<string>|object} [resumeData.skills] - array of strings or { technical, soft }
 * @param {Array<object>} [resumeData.projects] - [{ title, technologies, description }]
 * @param {Array<object>} [resumeData.experience] - [{ role, organization, duration, description }]
 * @param {Array<string>} [resumeData.certifications]
 * @returns {Promise<Buffer>}
 */
export async function generateResumePdf(resumeData = {}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 40, bottom: 40, left: 45, right: 45 },
        autoFirstPage: true
      });

      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      const contact = resumeData.contact || {};
      const candidateName = contact.name || 'Candidate Name';

      // 1. Header Block
      doc
        .font('Helvetica-Bold')
        .fontSize(20)
        .fillColor('#102e5f')
        .text(candidateName, { align: 'left' });

      doc.moveDown(0.3);

      // Contact coordinates
      const contactPieces = [];
      if (contact.email) contactPieces.push(contact.email);
      if (contact.phone) contactPieces.push(contact.phone);
      if (contact.linkedin) contactPieces.push(contact.linkedin.replace(/^https?:\/\//i, ''));
      if (contact.github) contactPieces.push(contact.github.replace(/^https?:\/\//i, ''));
      if (contact.location) contactPieces.push(contact.location);

      doc
        .font('Helvetica')
        .fontSize(9.5)
        .fillColor('#475569')
        .text(contactPieces.join('  •  '), { align: 'left' });

      doc.moveDown(0.8);

      function renderSectionHeading(title) {
        doc.moveDown(0.6);
        doc
          .font('Helvetica-Bold')
          .fontSize(11.5)
          .fillColor('#102e5f')
          .text(title.toUpperCase());

        const y = doc.y;
        doc
          .strokeColor('#cbd5e1')
          .lineWidth(0.8)
          .moveTo(45, y)
          .lineTo(550, y)
          .stroke();

        doc.moveDown(0.4);
      }

      // 2. Professional Summary
      if (resumeData.summary) {
        renderSectionHeading('Professional Summary');
        doc
          .font('Helvetica')
          .fontSize(9.5)
          .fillColor('#1e293b')
          .lineGap(2)
          .text(resumeData.summary, { align: 'justify' });
      }

      // 3. Education
      if (Array.isArray(resumeData.education) && resumeData.education.length > 0) {
        renderSectionHeading('Education');
        for (const edu of resumeData.education) {
          const deg = edu.degree || edu.degreeTitle || 'Degree';
          const inst = edu.institution || edu.school || '';
          const yr = edu.year || edu.passingYear || '';
          const sc = edu.score || edu.cgpa ? `CGPA: ${edu.score || edu.cgpa}` : '';

          doc
            .font('Helvetica-Bold')
            .fontSize(9.5)
            .fillColor('#0f172a')
            .text(deg, { continued: Boolean(yr) });

          if (yr) {
            doc
              .font('Helvetica')
              .fontSize(9)
              .fillColor('#64748b')
              .text(`  |  ${yr}`, { align: 'right' });
          }

          if (inst || sc) {
            const line = [inst, sc].filter(Boolean).join('  •  ');
            doc
              .font('Helvetica')
              .fontSize(9)
              .fillColor('#334155')
              .text(line);
          }

          doc.moveDown(0.4);
        }
      }

      // 4. Technical & Functional Skills
      const skills = resumeData.skills;
      if (skills) {
        renderSectionHeading('Skills & Competencies');
        let skillsText = '';
        if (Array.isArray(skills)) {
          skillsText = skills.join('  •  ');
        } else if (typeof skills === 'object') {
          const parts = [];
          if (Array.isArray(skills.technical) && skills.technical.length > 0) {
            parts.push(`Technical: ${skills.technical.join(', ')}`);
          }
          if (Array.isArray(skills.soft) && skills.soft.length > 0) {
            parts.push(`Soft Skills: ${skills.soft.join(', ')}`);
          }
          skillsText = parts.join('\n');
        } else if (typeof skills === 'string') {
          skillsText = skills;
        }

        doc
          .font('Helvetica')
          .fontSize(9.5)
          .fillColor('#1e293b')
          .lineGap(2)
          .text(skillsText);
      }

      // 5. Projects
      if (Array.isArray(resumeData.projects) && resumeData.projects.length > 0) {
        renderSectionHeading('Projects');
        for (const proj of resumeData.projects) {
          const title = proj.title || 'Project';
          const techs = Array.isArray(proj.technologies) ? proj.technologies.join(', ') : (proj.technologies || '');
          const desc = proj.description || '';

          doc
            .font('Helvetica-Bold')
            .fontSize(9.5)
            .fillColor('#0f172a')
            .text(title, { continued: Boolean(techs) });

          if (techs) {
            doc
              .font('Helvetica-Oblique')
              .fontSize(8.5)
              .fillColor('#087c91')
              .text(`  [${techs}]`);
          }

          if (desc) {
            doc
              .font('Helvetica')
              .fontSize(9)
              .fillColor('#334155')
              .lineGap(1.5)
              .text(`• ${desc}`, { align: 'justify' });
          }

          doc.moveDown(0.3);
        }
      }

      // 6. Experience & Internships
      if (Array.isArray(resumeData.experience) && resumeData.experience.length > 0) {
        renderSectionHeading('Experience & Internships');
        for (const exp of resumeData.experience) {
          const role = exp.role || 'Role';
          const org = exp.organization || exp.company || '';
          const dur = exp.duration || '';
          const desc = exp.description || '';

          doc
            .font('Helvetica-Bold')
            .fontSize(9.5)
            .fillColor('#0f172a')
            .text(role, { continued: Boolean(org || dur) });

          const sub = [org, dur].filter(Boolean).join('  |  ');
          if (sub) {
            doc
              .font('Helvetica')
              .fontSize(9)
              .fillColor('#64748b')
              .text(`  —  ${sub}`);
          }

          if (desc) {
            doc
              .font('Helvetica')
              .fontSize(9)
              .fillColor('#334155')
              .lineGap(1.5)
              .text(`• ${desc}`, { align: 'justify' });
          }

          doc.moveDown(0.3);
        }
      }

      // 7. Certifications & Achievements
      if (Array.isArray(resumeData.certifications) && resumeData.certifications.length > 0) {
        renderSectionHeading('Certifications & Achievements');
        for (const cert of resumeData.certifications) {
          doc
            .font('Helvetica')
            .fontSize(9)
            .fillColor('#334155')
            .text(`• ${cert}`);
        }
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

