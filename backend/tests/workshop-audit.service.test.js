import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import {
  executeWorkshopTransaction,
  logWorkshopAudit,
  getWorkshopAuditTrail,
  isTransactionUnsupportedError
} from '../src/services/workshop-audit.service.js';
import { WorkshopAuditLog } from '../src/models/workshop_audit_log.model.js';
import { Workshop } from '../src/models/workshop.model.js';
import { User } from '../src/models/user.model.js';
import { Department } from '../src/models/department.model.js';
import { PlacementOfficer } from '../src/models/placement_officer.model.js';
import { ROLE_IDS } from '../src/utils/access-constants.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';

let replSet;

before(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await connectDatabase(replSet.getUri());
});

after(async () => {
  await disconnectDatabase();
  if (replSet) {
    await replSet.stop();
  }
});

beforeEach(async () => {
  await WorkshopAuditLog.deleteMany({});
  await Workshop.deleteMany({});
  await Department.deleteMany({});
  await PlacementOfficer.deleteMany({});
});

test('1. logWorkshopAudit - Strictly requires an active transaction session', async () => {
  const actorId = new mongoose.Types.ObjectId();

  // Test with null session
  await assert.rejects(
    async () => {
      await logWorkshopAudit(
        {
          action: 'WORKSHOP_CREATED',
          entityType: 'WORKSHOP',
          entityId: 'WS-2026-0001',
          changedBy: actorId
        },
        null
      );
    },
    (err) => {
      assert.equal(err.statusCode, 500);
      assert.equal(err.code, 'TRANSACTION_SESSION_REQUIRED');
      return true;
    }
  );

  // Test with session that has not started a transaction
  const nonTxSession = await mongoose.startSession();
  try {
    await assert.rejects(
      async () => {
        await logWorkshopAudit(
          {
            action: 'WORKSHOP_CREATED',
            entityType: 'WORKSHOP',
            entityId: 'WS-2026-0001',
            changedBy: actorId
          },
          nonTxSession
        );
      },
      (err) => {
        assert.equal(err.statusCode, 500);
        assert.equal(err.code, 'TRANSACTION_SESSION_REQUIRED');
        return true;
      }
    );
  } finally {
    await nonTxSession.endSession();
  }
});

test('2. logWorkshopAudit - Successful audit creation inside transaction', async () => {
  const actorId = new mongoose.Types.ObjectId();
  const workshopObjId = new mongoose.Types.ObjectId();

  await executeWorkshopTransaction(async (session) => {
    const logDoc = await logWorkshopAudit(
      {
        workshopId: workshopObjId,
        action: 'WORKSHOP_CREATED',
        entityType: 'WORKSHOP',
        entityId: 'WS-2026-0001',
        changedBy: actorId,
        newValue: { title: 'Test Workshop', category: 'TECHNICAL' }
      },
      session
    );

    assert.ok(logDoc._id);
    assert.equal(logDoc.action, 'WORKSHOP_CREATED');
    assert.equal(logDoc.entityType, 'WORKSHOP');
    assert.equal(logDoc.entityId, 'WS-2026-0001');
    assert.equal(String(logDoc.changedBy), String(actorId));
  });

  // Verify persisted in database
  const count = await WorkshopAuditLog.countDocuments({ entityId: 'WS-2026-0001' });
  assert.equal(count, 1);
});

test('3. logWorkshopAudit - Transaction abort rolls back both business write and audit log', async () => {
  const actorId = new mongoose.Types.ObjectId();
  const workshopObjId = new mongoose.Types.ObjectId();

  await assert.rejects(
    async () => {
      await executeWorkshopTransaction(async (session) => {
        // Business write
        await Workshop.create(
          [
            {
              workshopId: 'WS-2026-9999',
              title: 'Rollback Workshop',
              description: 'This should be rolled back completely.',
              category: 'TECHNICAL',
              mode: 'ONLINE',
              meetingLink: 'https://example.com/meet',
              ownershipType: 'CENTRAL_PLACEMENT_CELL',
              createdBy: actorId,
              startAt: new Date(Date.now() + 86400000),
              endAt: new Date(Date.now() + 172800000),
              registrationDeadline: new Date(Date.now() + 43200000),
              maxParticipants: 50,
              sessions: [
                {
                  sessionId: 'SES-01',
                  sessionNumber: 1,
                  title: 'Intro',
                  startAt: new Date(Date.now() + 86400000),
                  endAt: new Date(Date.now() + 90000000)
                }
              ]
            }
          ],
          { session }
        );

        // Audit write
        await logWorkshopAudit(
          {
            workshopId: workshopObjId,
            action: 'WORKSHOP_CREATED',
            entityType: 'WORKSHOP',
            entityId: 'WS-2026-9999',
            changedBy: actorId
          },
          session
        );

        // Simulate subsequent failure
        throw new Error('Simulated business failure after audit write');
      });
    },
    /Simulated business failure after audit write/
  );

  // Verify NEITHER business document NOR audit log exists
  const workshopExists = await Workshop.exists({ workshopId: 'WS-2026-9999' });
  const auditExists = await WorkshopAuditLog.exists({ entityId: 'WS-2026-9999' });
  assert.equal(workshopExists, null);
  assert.equal(auditExists, null);
});

test('4. getWorkshopAuditTrail - Returns paginated audit trail for authorized roles', async () => {
  const actorId = new mongoose.Types.ObjectId();
  const workshopObjId = new mongoose.Types.ObjectId();

  // Seed two audit logs
  await executeWorkshopTransaction(async (session) => {
    await logWorkshopAudit(
      {
        workshopId: workshopObjId,
        action: 'WORKSHOP_CREATED',
        entityType: 'WORKSHOP',
        entityId: 'WS-2026-0002',
        changedBy: actorId
      },
      session
    );

    await logWorkshopAudit(
      {
        workshopId: workshopObjId,
        action: 'WORKSHOP_SUBMITTED',
        entityType: 'WORKSHOP',
        entityId: 'WS-2026-0002',
        changedBy: actorId,
        oldValue: { approvalStatus: 'DRAFT' },
        newValue: { approvalStatus: 'PENDING_APPROVAL' }
      },
      session
    );
  });

  const auth = {
    userId: actorId,
    roleId: ROLE_IDS.SUPER_ADMIN,
    userType: 'PLACEMENT'
  };

  const result = await getWorkshopAuditTrail(
    { workshopId: 'WS-2026-0002', page: 1, limit: 10 },
    auth
  );

  assert.equal(result.total, 2);
  assert.equal(result.auditLogs.length, 2);
  assert.equal(result.auditLogs[0].action, 'WORKSHOP_SUBMITTED');
  assert.equal(result.auditLogs[1].action, 'WORKSHOP_CREATED');
});

test('5. executeWorkshopTransaction - Fails closed with 503 when transactions unsupported', async () => {
  // Test helper error detector
  assert.equal(
    isTransactionUnsupportedError(new Error('Transaction numbers are only allowed on a replica set member or mongos')),
    true
  );
  assert.equal(
    isTransactionUnsupportedError({ code: 20, message: 'IllegalOperation' }),
    true
  );
  assert.equal(
    isTransactionUnsupportedError(new Error('Regular database validation error')),
    false
  );
});
