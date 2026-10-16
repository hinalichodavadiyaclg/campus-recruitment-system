import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import {
  getISTYear,
  formatSequenceId,
  allocateNextSequence,
  generateWorkshopId,
  generateRegistrationId,
  generateCertificateNumber,
  SUPPORTED_SEQUENCE_PREFIXES
} from '../src/utils/sequence-generator.js';
import { SystemSequence } from '../src/models/system_sequence.model.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';

let mongo;

before(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  await connectDatabase();
});

after(async () => {
  await disconnectDatabase();
  if (mongo) {
    await mongo.stop();
  }
});

beforeEach(async () => {
  await SystemSequence.deleteMany({});
});

test('1. formatSequenceId - Formatting & Zero Padding', () => {
  assert.equal(formatSequenceId('WS', 2026, 1, 4), 'WS-2026-0001');
  assert.equal(formatSequenceId('WREG', 2026, 42, 4), 'WREG-2026-0042');
  assert.equal(formatSequenceId('CERT', 2026, 9999, 4), 'CERT-2026-9999');
  assert.equal(formatSequenceId('CERT', 2026, 10000, 4), 'CERT-2026-10000');
});

test('2. formatSequenceId - Invalid Input Validation', () => {
  // Unsupported prefix
  assert.throws(
    () => formatSequenceId('INVALID_PREFIX', 2026, 1),
    /Unsupported sequence prefix/
  );

  // Invalid year
  assert.throws(
    () => formatSequenceId('WS', 1999, 1),
    /Invalid year/
  );

  // Invalid sequence number (<= 0 or non-integer)
  assert.throws(
    () => formatSequenceId('WS', 2026, 0),
    /Invalid sequenceNumber/
  );
  assert.throws(
    () => formatSequenceId('WS', 2026, -5),
    /Invalid sequenceNumber/
  );
  assert.throws(
    () => formatSequenceId('WS', 2026, 1.5),
    /Invalid sequenceNumber/
  );
});

test('3. getISTYear - Timezone boundary accuracy (Asia/Kolkata)', () => {
  // A timestamp that is Dec 31, 2025 in UTC, but Jan 1, 2026 in IST (+05:30)
  // 2025-12-31T19:00:00.000Z + 5h30m = 2026-01-01T00:30:00.000 (IST)
  const boundaryDate = new Date('2025-12-31T19:00:00.000Z');
  assert.equal(getISTYear(boundaryDate), 2026, 'Should resolve to 2026 in IST despite being 2025 in UTC.');

  // A timestamp that is Dec 31 in both UTC and IST
  const earlierDate = new Date('2025-12-31T12:00:00.000Z');
  assert.equal(getISTYear(earlierDate), 2025);

  // Missing or invalid date must throw
  assert.throws(
    () => getISTYear(null),
    /A valid date is required/
  );
  assert.throws(
    () => getISTYear(undefined),
    /A valid date is required/
  );
  assert.throws(
    () => getISTYear('invalid-date-string'),
    /Invalid date value/
  );
});

test('4. allocateNextSequence - Sequential increments & independent namespaces', async () => {
  // Sequential increments for WS_2026
  const s1 = await allocateNextSequence('WS', 2026);
  const s2 = await allocateNextSequence('WS', 2026);
  const s3 = await allocateNextSequence('WS', 2026);

  assert.equal(s1, 1);
  assert.equal(s2, 2);
  assert.equal(s3, 3);

  // Independent prefix: WREG_2026 starts at 1
  const r1 = await allocateNextSequence('WREG', 2026);
  assert.equal(r1, 1);

  // Independent year: WS_2027 starts at 1
  const y1 = await allocateNextSequence('WS', 2027);
  assert.equal(y1, 1);

  // Ensure documents in MongoDB
  const docs = await SystemSequence.find({}).lean();
  assert.equal(docs.length, 3);
  const docMap = new Map(docs.map((d) => [d.key, d.lastValue]));
  assert.equal(docMap.get('WS_2026'), 3);
  assert.equal(docMap.get('WREG_2026'), 1);
  assert.equal(docMap.get('WS_2027'), 1);
});

test('5. allocateNextSequence - High concurrency uniqueness', async () => {
  const CONCURRENT_COUNT = 25;
  const promises = [];

  for (let i = 0; i < CONCURRENT_COUNT; i++) {
    promises.push(allocateNextSequence('WS', 2026));
  }

  const results = await Promise.all(promises);

  // Assert all 25 numbers are returned
  assert.equal(results.length, CONCURRENT_COUNT);

  // Assert all 25 numbers are strictly unique
  const uniqueNumbers = new Set(results);
  assert.equal(uniqueNumbers.size, CONCURRENT_COUNT, 'All concurrently allocated sequence numbers must be unique.');

  // Assert they span exactly 1 to CONCURRENT_COUNT
  for (let i = 1; i <= CONCURRENT_COUNT; i++) {
    assert.ok(uniqueNumbers.has(i), `Sequence numbers must contain ${i}`);
  }

  // Verify MongoDB lastValue
  const doc = await SystemSequence.findOne({ key: 'WS_2026' }).lean();
  assert.equal(doc.lastValue, CONCURRENT_COUNT);
});

test('6. allocateNextSequence - Non-retryable errors propagate immediately', async () => {
  // Invalid prefix fails before database hit
  await assert.rejects(
    async () => allocateNextSequence('UNKNOWN_PREFIX', 2026),
    /Unsupported sequence prefix/
  );

  // Invalid year fails before database hit
  await assert.rejects(
    async () => allocateNextSequence('WS', 1980),
    /Invalid sequence year/
  );
});

test('7. Domain Helper: generateWorkshopId', async () => {
  // Missing startAt must throw clear AppError
  await assert.rejects(
    async () => generateWorkshopId(null),
    /A valid workshop startAt date is required/
  );

  const startAt = new Date('2026-11-15T10:00:00.000Z');
  const id1 = await generateWorkshopId(startAt);
  const id2 = await generateWorkshopId(startAt);

  assert.equal(id1, 'WS-2026-0001');
  assert.equal(id2, 'WS-2026-0002');
});

test('8. Domain Helper: generateRegistrationId', async () => {
  const regDate = new Date('2026-09-01T08:00:00.000Z');
  const id1 = await generateRegistrationId(regDate);
  const id2 = await generateRegistrationId(regDate);

  assert.equal(id1, 'WREG-2026-0001');
  assert.equal(id2, 'WREG-2026-0002');
});

test('9. Domain Helper: generateCertificateNumber', async () => {
  const issueDate = new Date('2026-12-20T14:30:00.000Z');
  const cert1 = await generateCertificateNumber(issueDate);
  const cert2 = await generateCertificateNumber(issueDate);

  assert.equal(cert1, 'CERT-2026-0001');
  assert.equal(cert2, 'CERT-2026-0002');
});

test('10. allocateNextSequence - Optional Session support', async () => {
  // Test passing null session explicitly
  const s = await allocateNextSequence('WS', 2026, { session: null });
  assert.equal(typeof s, 'number');
  assert.ok(s >= 1);
});
