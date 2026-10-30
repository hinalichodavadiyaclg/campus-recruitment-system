import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { AppError } from '../utils/app-error.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDirectory = path.join(__dirname, '..', '..', 'public');
const certificatesDirectory = path.join(publicDirectory, 'uploads', 'certificates');

// Ensure certificate storage directory exists
if (!fs.existsSync(certificatesDirectory)) {
  fs.mkdirSync(certificatesDirectory, { recursive: true });
}

/**
 * Generates an authoritative, personalized PDF certificate and scannable QR code.
 *
 * @param {object} params
 * @param {object} params.certificate - WorkshopCertificate document or object
 * @param {object} params.student - Student document or object
 * @param {object} params.workshop - Workshop document or object
 * @param {object} [params.template] - WorkshopCertificateTemplate document or object
 * @param {string} [params.baseUrl] - Base URL for public verification link
 * @returns {Promise<{ fileUrl: string, absolutePath: string, qrCodeDataUrl: string }>}
 */
export async function generatePersonalizedCertificatePdf({
  certificate,
  student,
  workshop,
  template = null,
  baseUrl = 'http://localhost:5173'
}) {
  if (!certificate || !certificate.certificateNumber || !certificate.verificationCode) {
    throw new AppError(400, 'INVALID_INPUT', 'Valid certificate metadata required for PDF generation.');
  }

  const certNumber = certificate.certificateNumber;
  const fileName = `${certNumber}.pdf`;
  const absolutePath = path.join(certificatesDirectory, fileName);
  const relativeUrl = `/uploads/certificates/${fileName}`;

  // Build the public verification URL
  const cleanBase = (baseUrl || 'http://localhost:5173').replace(/\/+$/, '');
  const verificationUrl = `${cleanBase}/#/verify-certificate/${certificate.verificationCode}`;

  // Generate QR Code buffer and data URL
  const qrBuffer = await QRCode.toBuffer(verificationUrl, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 140,
    color: {
      dark: '#102e5f',
      light: '#ffffff'
    }
  });
  const qrCodeDataUrl = await QRCode.toDataURL(verificationUrl, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 140
  });

  return new Promise((resolve, reject) => {
    const isPortrait = template?.orientation === 'PORTRAIT';
    const width = isPortrait ? 595.28 : 841.89;
    const height = isPortrait ? 841.89 : 595.28;

    const doc = new PDFDocument({
      size: 'A4',
      layout: isPortrait ? 'portrait' : 'landscape',
      margin: 0,
      info: {
        Title: `Certificate of Completion - ${certNumber}`,
        Author: "Vanita Vishram Women's University",
        Subject: `Workshop: ${workshop?.title || 'Workshop Program'}`,
        Keywords: 'Certificate, VVWU, Workshop, Training, Verification'
      }
    });

    const tempPath = `${absolutePath}.tmp.${Date.now()}`;
    const writeStream = fs.createWriteStream(tempPath);
    doc.pipe(writeStream);

    writeStream.on('finish', () => {
      try {
        if (fs.existsSync(tempPath)) {
          const stats = fs.statSync(tempPath);
          if (stats.size > 100) {
            fs.renameSync(tempPath, absolutePath);
            resolve({
              fileUrl: relativeUrl,
              absolutePath,
              qrCodeDataUrl
            });
            return;
          }
        }
        reject(new AppError(500, 'PDF_GENERATION_FAILED', 'Generated PDF is empty or invalid.'));
      } catch (err) {
        reject(new AppError(500, 'PDF_GENERATION_FAILED', `Failed to finalize certificate file: ${err.message}`));
      }
    });

    writeStream.on('error', (err) => {
      if (fs.existsSync(tempPath)) {
        try { fs.unlinkSync(tempPath); } catch (_) {}
      }
      reject(new AppError(500, 'PDF_GENERATION_FAILED', `Failed to write certificate PDF: ${err.message}`));
    });

    doc.on('error', (err) => {
      if (fs.existsSync(tempPath)) {
        try { fs.unlinkSync(tempPath); } catch (_) {}
      }
      reject(new AppError(500, 'PDF_GENERATION_FAILED', `Error during PDF document construction: ${err.message}`));
    });

    // Custom background check
    let hasCustomBackground = false;
    if (template && template.backgroundUrl) {
      let bgPath = path.join(publicDirectory, template.backgroundUrl.replace(/^\/+/, ''));
      if (!fs.existsSync(bgPath)) {
        bgPath = path.join(publicDirectory, 'uploads', template.backgroundUrl.replace(/^\/+/, ''));
      }
      if (fs.existsSync(bgPath)) {
        try {
          doc.image(bgPath, 0, 0, { width, height });
          hasCustomBackground = true;
        } catch (_) {
          hasCustomBackground = false;
        }
      }
    }

    if (!hasCustomBackground) {
      // Draw Institutional Double Border
      // Outer primary navy border
      doc
        .lineWidth(5)
        .strokeColor('#102e5f')
        .rect(20, 20, width - 40, height - 40)
        .stroke();

      // Inner teal accent border
      doc
        .lineWidth(1.5)
        .strokeColor('#087c91')
        .rect(27, 27, width - 54, height - 54)
        .stroke();

      // Delicate hairline border
      doc
        .lineWidth(0.5)
        .strokeColor('#cbd5e1')
        .rect(31, 31, width - 62, height - 62)
        .stroke();

      // Corner geometric accents
      const cornerSize = 8;
      const cornerOffset = 23;
      doc.fillColor('#087c91');
      // Top-left
      doc.rect(cornerOffset, cornerOffset, cornerSize, cornerSize).fill();
      // Top-right
      doc.rect(width - cornerOffset - cornerSize, cornerOffset, cornerSize, cornerSize).fill();
      // Bottom-left
      doc.rect(cornerOffset, height - cornerOffset - cornerSize, cornerSize, cornerSize).fill();
      // Bottom-right
      doc.rect(width - cornerOffset - cornerSize, height - cornerOffset - cornerSize, cornerSize, cornerSize).fill();

      // University Header (Authentic VVWU Layout)
      doc
        .fillColor('#102e5f')
        .fontSize(isPortrait ? 21 : 24)
        .font('Helvetica-Bold')
        .text("VANITA VISHRAM WOMEN'S UNIVERSITY", 0, isPortrait ? 58 : 48, {
          align: 'center',
          characterSpacing: 1.2
        });

      // Sub-header: Training & Placement Cell
      doc
        .fillColor('#087c91')
        .fontSize(isPortrait ? 10.5 : 11.5)
        .font('Helvetica-Bold')
        .text('TRAINING & PLACEMENT CELL', 0, isPortrait ? 86 : 76, {
          align: 'center',
          characterSpacing: 2
        });

      // Accent Divider with central ornament
      const divWidth = isPortrait ? 130 : 170;
      const divY = isPortrait ? 108 : 96;
      doc
        .lineWidth(1.2)
        .strokeColor('#087c91')
        .moveTo(width / 2 - divWidth, divY)
        .lineTo(width / 2 + divWidth, divY)
        .stroke();

      doc
        .circle(width / 2, divY, 2.5)
        .fillColor('#102e5f')
        .fill();

      // Certificate Title
      doc
        .fillColor('#102e5f')
        .fontSize(isPortrait ? 22 : 25)
        .font('Helvetica-Bold')
        .text('CERTIFICATE OF COMPLETION', 0, isPortrait ? 132 : 118, {
          align: 'center',
          characterSpacing: 2
        });

      doc
        .fillColor('#64748b')
        .fontSize(11)
        .font('Helvetica-Oblique')
        .text('This is to proudly certify that', 0, isPortrait ? 168 : 150, {
          align: 'center'
        });
    }

    // Dynamic Recipient Name (with length guard against clipping)
    const firstName = student?.firstName || '';
    const lastName = student?.lastName || '';
    const studentFullName = certificate.recipientName || `${firstName} ${lastName}`.trim() || 'Distinguished Participant';

    const nameY = isPortrait ? 220 : 185;
    let nameFontSize = 24;
    doc.font('Helvetica-Bold').fontSize(nameFontSize);
    while (nameFontSize > 14 && doc.widthOfString(studentFullName) > width - 120) {
      nameFontSize -= 1;
      doc.fontSize(nameFontSize);
    }

    doc
      .fillColor('#087c91')
      .fontSize(nameFontSize)
      .font('Helvetica-Bold')
      .text(studentFullName, 40, nameY, {
        align: 'center',
        width: width - 80
      });

    // Underline for recipient name
    const nameWidth = Math.min(width - 80, doc.widthOfString(studentFullName));
    const startX = Math.max(40, (width - nameWidth) / 2 - 20);
    const endX = Math.min(width - 40, (width + nameWidth) / 2 + 20);
    const underlineY = nameY + nameFontSize + 8;
    doc
      .lineWidth(1)
      .strokeColor('#cbd5e1')
      .moveTo(startX, underlineY)
      .lineTo(endX, underlineY)
      .stroke();

    // Workshop Completion Text
    const bodyY = underlineY + 16;
    doc
      .fillColor('#334155')
      .fontSize(12)
      .font('Helvetica')
      .text('has successfully completed the training and workshop program on', 40, bodyY, {
        align: 'center',
        width: width - 80
      });

    // Workshop Title
    const workshopTitle = `"${workshop?.title || 'Advanced Technical Workshop'}"`;
    const titleY = bodyY + 26;
    let titleFontSize = 17;
    doc.font('Helvetica-Bold').fontSize(titleFontSize);
    while (titleFontSize > 12 && doc.widthOfString(workshopTitle) > width - 140) {
      titleFontSize -= 1;
      doc.fontSize(titleFontSize);
    }

    doc
      .fillColor('#102e5f')
      .fontSize(titleFontSize)
      .font('Helvetica-Bold')
      .text(workshopTitle, 50, titleY, {
        align: 'center',
        width: width - 100
      });

    // Subtitle / attribution
    let conductedByText = "Conducted by Vanita Vishram Women's University Central Placement Cell & Academic Departments with distinction.";
    if (template?.name) {
      conductedByText = `Conducted in technical collaboration with ${template.name}.`;
    }
    const attributionY = titleY + titleFontSize + 28;
    doc
      .fillColor('#64748b')
      .fontSize(10)
      .font('Helvetica')
      .text(conductedByText, 40, attributionY, {
        align: 'center',
        width: width - 80
      });

    // Footer Metadata & Signatures
    const issuedDateStr = certificate.issuedAt
      ? new Date(certificate.issuedAt).toLocaleDateString('en-IN', {
          timeZone: 'Asia/Kolkata',
          day: '2-digit',
          month: 'short',
          year: 'numeric'
        })
      : new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });

    const footerBaseY = isPortrait ? height - 160 : height - 165;

    // Left Column: Certificate Identifiers
    doc
      .fillColor('#64748b')
      .fontSize(9)
      .font('Helvetica')
      .text('Certificate No:', 54, footerBaseY + 5);

    doc
      .fillColor('#102e5f')
      .fontSize(11)
      .font('Helvetica-Bold')
      .text(certNumber, 54, footerBaseY + 18);

    doc
      .fillColor('#64748b')
      .fontSize(9)
      .font('Helvetica')
      .text(`Issued On: ${issuedDateStr}`, 54, footerBaseY + 35);

    doc
      .fillColor('#087c91')
      .fontSize(8)
      .font('Helvetica-Bold')
      .text(`Digital Key: ${certificate.verificationCode}`, 54, footerBaseY + 50);

    // Center Column: Scannable QR Code
    const qrSize = 78;
    const qrX = width / 2 - qrSize / 2;
    const qrY = footerBaseY;
    doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });
    doc
      .fillColor('#087c91')
      .fontSize(7.5)
      .font('Helvetica-Bold')
      .text('SCAN TO VERIFY', 0, qrY + qrSize + 4, { align: 'center' });

    // Right Column: Signatory
    const signatoryX = width - (isPortrait ? 200 : 240);
    const signatoryWidth = isPortrait ? 150 : 180;
    const signatoryName = template?.signatoryName || 'Director / Head';
    const signatoryTitle = template?.signatoryTitle || 'Training & Placement Cell';

    doc
      .lineWidth(1)
      .strokeColor('#102e5f')
      .moveTo(signatoryX, footerBaseY + 40)
      .lineTo(signatoryX + signatoryWidth, footerBaseY + 40)
      .stroke();

    doc
      .fillColor('#102e5f')
      .fontSize(10)
      .font('Helvetica-Bold')
      .text(signatoryName, signatoryX, footerBaseY + 48, { width: signatoryWidth, align: 'center' });

    doc
      .fillColor('#64748b')
      .fontSize(8.5)
      .font('Helvetica')
      .text(signatoryTitle, signatoryX, footerBaseY + 62, { width: signatoryWidth, align: 'center' });

    // Finalize PDF
    doc.end();
  });
}
