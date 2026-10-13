import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { Company } from '../models/company.model.js';
import { User } from '../models/user.model.js';
import { ROLE_IDS } from '../utils/access-constants.js';
import { formatCompanyId, parseCompanyIdSequence } from '../utils/company-id.js';

const LEDGER_DIR = path.resolve('backend/migrations/.ledger');

function ensureLedgerDir() {
  if (!fs.existsSync(LEDGER_DIR)) {
    fs.mkdirSync(LEDGER_DIR, { recursive: true });
  }
}

export async function validateRecruiterCandidate(candidateId, companyId) {
  if (!candidateId) {
    return { valid: false, reason: 'NO_CANDIDATE_PROVIDED' };
  }
  const user = await User.findById(candidateId).lean();
  if (!user) {
    return { valid: false, reason: 'RECRUITER_NOT_FOUND' };
  }
  if (user.userType !== 'COMPANY') {
    return { valid: false, reason: `INVALID_USER_TYPE: expected COMPANY, got ${user.userType}` };
  }
  if (user.roleId !== ROLE_IDS.COMPANY) {
    return { valid: false, reason: `INVALID_ROLE_ID: expected ROLE_COMPANY, got ${user.roleId}` };
  }
  if (!user.companyId || String(user.companyId) !== String(companyId)) {
    return { valid: false, reason: `COMPANY_MISMATCH: user.companyId (${user.companyId}) does not match company._id (${companyId})` };
  }
  return { valid: true, user };
}

export async function runMigration({
  dbUri,
  dryRun = false,
  allowLiveDb = false
} = {}) {
  const isLiveDb = dbUri && dbUri.includes('campus_recruitment') && !dbUri.includes('test');
  if (isLiveDb && !allowLiveDb && !dryRun) {
    throw new Error(
      'SAFETY ABORT: Cannot run live database migration without explicit --allow-live-db flag and approval.'
    );
  }

  ensureLedgerDir();
  const runId = `mig-comp-id-${Date.now()}`;
  const manifestPath = path.join(LEDGER_DIR, `manifest-${runId}.json`);

  const report = {
    runId,
    timestamp: new Date().toISOString(),
    dryRun,
    dbUri: dbUri ? dbUri.replace(/\/\/.*@/, '//<redacted>@') : 'active_connection',
    status: 'IN_PROGRESS',
    totalCompanies: 0,
    alreadyMigratedCount: 0,
    migratedCount: 0,
    skippedCount: 0,
    conflictCount: 0,
    records: []
  };

  const companies = await Company.find({}).sort({ createdAt: 1 });
  report.totalCompanies = companies.length;

  // Determine current highest sequence in database
  let maxSeq = 0;
  for (const c of companies) {
    if (c.companyId) {
      const seq = parseCompanyIdSequence(c.companyId);
      if (seq > maxSeq) maxSeq = seq;
    }
  }

  let nextSequenceNumber = maxSeq + 1;

  for (const comp of companies) {
    const record = {
      companyDocId: String(comp._id),
      companyName: comp.companyName,
      originalValues: {
        companyId: comp.companyId || null,
        primaryRecruiterId: comp.primaryRecruiterId ? String(comp.primaryRecruiterId) : null,
        userId: comp.userId ? String(comp.userId) : null
      },
      intendedValues: {},
      appliedValues: {},
      status: 'PENDING',
      notes: []
    };

    // 1. Resolve Company Business ID
    let intendedCompanyId = comp.companyId;
    let needsCompanyId = false;

    if (!comp.companyId || !/^COMP-\d{4}$/i.test(comp.companyId)) {
      intendedCompanyId = formatCompanyId(nextSequenceNumber++);
      needsCompanyId = true;
    } else {
      record.notes.push('Valid companyId already present; skipped ID generation.');
    }
    record.intendedValues.companyId = intendedCompanyId;

    // 2. Resolve and Validate Primary Recruiter Reference
    let intendedPrimaryRecruiterId = comp.primaryRecruiterId ? String(comp.primaryRecruiterId) : null;
    let needsPrimaryRecruiterId = false;

    if (comp.primaryRecruiterId) {
      // Validate existing reference
      const existingVal = await validateRecruiterCandidate(comp.primaryRecruiterId, comp._id);
      if (!existingVal.valid) {
        record.notes.push(`WARNING: Existing primaryRecruiterId failed validation: ${existingVal.reason}`);
        report.conflictCount++;
      } else {
        record.notes.push('Existing primaryRecruiterId verified valid; preserved without overwrite.');
      }
    } else if (comp.userId) {
      // Validate legacy userId before promoting
      const candidateVal = await validateRecruiterCandidate(comp.userId, comp._id);
      if (candidateVal.valid) {
        intendedPrimaryRecruiterId = String(comp.userId);
        needsPrimaryRecruiterId = true;
        record.notes.push('Promoted legacy userId to primaryRecruiterId after relationship validation.');
      } else {
        record.notes.push(`CONFLICT: Legacy userId failed validation (${candidateVal.reason}); flagged for manual resolution.`);
        report.conflictCount++;
      }
    } else {
      // Find candidate recruiters linked by users.companyId
      const candidateUsers = await User.find({
        companyId: comp._id,
        userType: 'COMPANY',
        roleId: ROLE_IDS.COMPANY
      }).sort({ createdAt: 1 });

      if (candidateUsers.length === 1) {
        intendedPrimaryRecruiterId = String(candidateUsers[0]._id);
        needsPrimaryRecruiterId = true;
        record.notes.push('Associated single recruiter user found by companyId reference.');
      } else if (candidateUsers.length > 1) {
        record.notes.push(`AMBIGUITY: Multiple recruiters (${candidateUsers.length}) found without designated primary; flagged for manual resolution.`);
        report.conflictCount++;
      } else {
        record.notes.push('WARNING: No recruiter account found referencing this company.');
      }
    }

    record.intendedValues.primaryRecruiterId = intendedPrimaryRecruiterId;

    if (!needsCompanyId && !needsPrimaryRecruiterId) {
      record.status = 'ALREADY_MIGRATED';
      report.alreadyMigratedCount++;
    } else if (dryRun) {
      record.status = 'DRY_RUN_PROPOSED';
      record.appliedValues = { ...record.intendedValues };
      report.migratedCount++;
    } else {
      // Execute atomic update
      const updatePayload = {};
      if (needsCompanyId) updatePayload.companyId = intendedCompanyId;
      if (needsPrimaryRecruiterId) updatePayload.primaryRecruiterId = intendedPrimaryRecruiterId;

      await Company.updateOne(
        { _id: comp._id },
        { $set: updatePayload }
      );

      record.status = 'APPLIED';
      record.appliedValues = { ...updatePayload };
      record.appliedAt = new Date().toISOString();
      report.migratedCount++;
    }

    report.records.push(record);
  }

  report.status = dryRun ? 'DRY_RUN_COMPLETED' : 'COMPLETED';

  // Persist durable manifest
  fs.writeFileSync(manifestPath, JSON.stringify(report, null, 2), 'utf-8');
  report.manifestPath = manifestPath;

  return report;
}

export async function runRollback({
  manifestPath,
  allowLiveDb = false
} = {}) {
  ensureLedgerDir();
  let targetPath = manifestPath;

  if (!targetPath) {
    const files = fs.readdirSync(LEDGER_DIR).filter((f) => f.startsWith('manifest-') && f.endsWith('.json')).sort();
    if (files.length === 0) {
      throw new Error('No migration manifests found in ledger directory.');
    }
    targetPath = path.join(LEDGER_DIR, files[files.length - 1]);
  }

  if (!fs.existsSync(targetPath)) {
    throw new Error(`Manifest file not found: ${targetPath}`);
  }

  const manifest = JSON.parse(fs.readFileSync(targetPath, 'utf-8'));
  if (manifest.status === 'ROLLED_BACK') {
    throw new Error(`Manifest ${manifest.runId} has already been rolled back.`);
  }

  const rollbackReport = {
    runId: manifest.runId,
    manifestPath: targetPath,
    timestamp: new Date().toISOString(),
    status: 'IN_PROGRESS',
    totalRecords: manifest.records.length,
    rolledBackCount: 0,
    skippedCount: 0,
    conflictCount: 0,
    records: []
  };

  for (const rec of manifest.records) {
    if (rec.status !== 'APPLIED') {
      rollbackReport.skippedCount++;
      rollbackReport.records.push({
        companyDocId: rec.companyDocId,
        status: 'SKIPPED_NOT_APPLIED',
        reason: `Original migration status was ${rec.status}`
      });
      continue;
    }

    // Conditional rollback: Ensure fields still match what was applied
    const query = { _id: rec.companyDocId };
    const unsets = {};

    if (rec.appliedValues.companyId) {
      query.companyId = rec.appliedValues.companyId;
      unsets.companyId = 1;
    }
    if (rec.appliedValues.primaryRecruiterId) {
      query.primaryRecruiterId = rec.appliedValues.primaryRecruiterId;
      unsets.primaryRecruiterId = 1;
    }

    const res = await Company.updateOne(query, { $unset: unsets });

    if (res.matchedCount === 0) {
      rollbackReport.conflictCount++;
      rollbackReport.records.push({
        companyDocId: rec.companyDocId,
        status: 'CONFLICT_ABORTED',
        reason: 'Document was modified or deleted since migration run; unsetting aborted to protect newer state.'
      });
    } else {
      rollbackReport.rolledBackCount++;
      rollbackReport.records.push({
        companyDocId: rec.companyDocId,
        status: 'ROLLED_BACK',
        unsetFields: Object.keys(unsets)
      });
    }
  }

  rollbackReport.status = 'ROLLED_BACK';
  manifest.status = 'ROLLED_BACK';
  manifest.rollbackReport = rollbackReport;
  fs.writeFileSync(targetPath, JSON.stringify(manifest, null, 2), 'utf-8');

  return rollbackReport;
}

import { fileURLToPath } from 'node:url';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { env } from '../config/env.js';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const isDryRun = process.argv.includes('--dry-run');
  const allowLiveDb = process.argv.includes('--allow-live-db');
  const isRollback = process.argv.includes('--rollback');

  const sanitizedUri = env.mongodbUri.replace(/\/\/.*@/, '//<redacted>@');
  console.info(`Target Database: ${sanitizedUri}`);
  console.info(`Mode: ${isDryRun ? 'DRY-RUN (zero writes/mutations)' : 'MIGRATION EXECUTION'}`);

  connectDatabase()
    .then(async () => {
      if (isRollback) {
        const manifestArg = process.argv.find((a) => a.startsWith('--manifest='));
        const manifestPath = manifestArg ? manifestArg.split('=')[1] : undefined;
        const res = await runRollback({ manifestPath, allowLiveDb });
        console.info(JSON.stringify(res, null, 2));
      } else {
        const res = await runMigration({ dbUri: env.mongodbUri, dryRun: isDryRun, allowLiveDb });
        console.info(JSON.stringify(res, null, 2));
      }
    })
    .catch((err) => {
      console.error('Migration script failed:', err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await disconnectDatabase();
    });
}
