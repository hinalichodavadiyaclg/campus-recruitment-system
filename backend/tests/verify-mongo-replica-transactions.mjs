import mongoose from 'mongoose';
import { executeWorkshopTransaction } from '../src/services/workshop-audit.service.js';

async function testTransactions() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/campus_recruitment?replicaSet=rs0';
  await mongoose.connect(uri);
  const testColl = mongoose.connection.db.collection('__transaction_verification_test__');

  try {
    await testColl.deleteMany({});

    // 1. Test multi-document commit
    const session1 = await mongoose.startSession();
    session1.startTransaction();
    await testColl.insertOne({ _id: 'tx1', status: 'pending' }, { session: session1 });
    await testColl.insertOne({ _id: 'tx2', status: 'pending' }, { session: session1 });
    await session1.commitTransaction();
    await session1.endSession();

    const countCommitted = await testColl.countDocuments();
    if (countCommitted !== 2) throw new Error(`Expected 2 committed docs, found ${countCommitted}`);
    console.log('[PASS] Multi-document commit succeeded: 2 documents inserted');

    // 2. Test multi-document rollback (abort)
    const session2 = await mongoose.startSession();
    session2.startTransaction();
    await testColl.insertOne({ _id: 'tx3', status: 'should_abort' }, { session: session2 });
    await testColl.updateOne({ _id: 'tx1' }, { $set: { status: 'mutated_in_tx' } }, { session: session2 });
    await session2.abortTransaction();
    await session2.endSession();

    const countAfterAbort = await testColl.countDocuments();
    const doc1AfterAbort = await testColl.findOne({ _id: 'tx1' });
    if (countAfterAbort !== 2) throw new Error(`Expected 2 docs after abort, found ${countAfterAbort}`);
    if (doc1AfterAbort.status !== 'pending') throw new Error(`Expected status 'pending', found ${doc1AfterAbort.status}`);
    console.log('[PASS] Multi-document rollback succeeded: changes cleanly aborted and reverted');

    // 3. Test executeWorkshopTransaction service wrapper
    const wrapperResult = await executeWorkshopTransaction(async (session) => {
      await testColl.insertOne({ _id: 'tx_wrapper', status: 'wrapper_ok' }, { session });
      return 'SUCCESS_WRAPPER';
    });
    if (wrapperResult !== 'SUCCESS_WRAPPER') throw new Error(`Unexpected wrapper result: ${wrapperResult}`);
    const wrapperDoc = await testColl.findOne({ _id: 'tx_wrapper' });
    if (!wrapperDoc) throw new Error('Wrapper document not found in database');
    console.log('[PASS] executeWorkshopTransaction wrapper executed and committed successfully');

    console.log('\nAll multi-document transaction tests passed cleanly!');
  } finally {
    await testColl.drop().catch(() => {});
    await mongoose.disconnect();
  }
}

testTransactions().catch(err => {
  console.error('[FAIL] Transaction verification failed:', err);
  process.exit(1);
});
