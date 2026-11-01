import { Application } from '../models/application.model.js';

/**
 * Safely migrates application database indexes and ensures existing records have attempt numbers.
 * - Backfills missing attempt numbers on legacy records.
 * - Ensures new partial unique index and attempt unique index exist.
 * - Safely drops legacy unique index '{ jobId: 1, studentId: 1, recruitmentRound: 1 }' once new indexes are ready.
 */
export async function migrateApplicationIndexesAndData(db = null) {
  try {
    const targetDb = db || Application.db;
    if (!targetDb) return;

    const collections = await targetDb.db.listCollections({ name: 'applications' }).toArray();
    if (collections.length === 0) {
      return;
    }

    const appCollection = targetDb.db.collection('applications');

    // 1. Backfill attemptNumber on existing documents missing this field
    const unversionedDocs = await appCollection.find({
      $or: [{ attemptNumber: { $exists: false } }, { attemptNumber: null }]
    }).sort({ createdAt: 1 }).toArray();

    if (unversionedDocs.length > 0) {
      // Group by studentId + jobId + recruitmentRound
      const groups = new Map();
      for (const doc of unversionedDocs) {
        const key = `${String(doc.studentId)}_${String(doc.jobId)}_${doc.recruitmentRound || 1}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(doc);
      }

      for (const [_key, docs] of groups.entries()) {
        for (let i = 0; i < docs.length; i++) {
          await appCollection.updateOne(
            { _id: docs[i]._id },
            { $set: { attemptNumber: i + 1 } }
          );
        }
      }
    }

    // 2. Inspect existing indexes
    const existingIndexes = await appCollection.indexes();
    const indexNames = new Set(existingIndexes.map((idx) => idx.name));


    // 4. Create attempt uniqueness index if missing
    if (!indexNames.has('uniq_attempt_per_round')) {
      try {
        await appCollection.createIndex(
          { jobId: 1, studentId: 1, recruitmentRound: 1, attemptNumber: 1 },
          {
            unique: true,
            name: 'uniq_attempt_per_round',
            background: true
          }
        );
      } catch (err) {
        console.warn('Notice: attempt unique index creation:', err.message);
      }
    }

    // 5. Safely drop legacy index only after new indexes are established
    const legacyIndexName = 'jobId_1_studentId_1_recruitmentRound_1';
    if (indexNames.has(legacyIndexName)) {
      try {
        await appCollection.dropIndex(legacyIndexName);
      } catch (err) {
        console.warn('Notice: dropping legacy unique application index:', err.message);
      }
    }
  } catch (err) {
    console.error('migrateApplicationIndexesAndData warning:', err.message);
  }
}
