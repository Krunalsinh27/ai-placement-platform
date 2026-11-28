/**
 * repairStuckPlatformRounds.js
 *
 * Guarded utility script to inspect and repair platform test rounds that became stuck
 * due to past-window expiration, lock flags, or invalid participant result enums (e.g. 'shortlisted').
 *
 * Safety Guarantees:
 * 1. Default mode is DRY RUN (read-only inspection).
 * 2. Writes are only performed when '--apply' is explicitly provided.
 * 3. Refuses execution against remote databases unless ALLOW_REMOTE_REPAIR=true or ALLOW_REMOTE_SEED=yes-i-am-sure.
 * 4. Never exposes database credentials.
 *
 * Usage:
 *   node server/scripts/repairStuckPlatformRounds.js          # Dry run
 *   node server/scripts/repairStuckPlatformRounds.js --apply  # Execute repairs
 */

const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from server/.env if present
dotenv.config({ path: path.join(__dirname, '../.env') });

const mongoose = require('mongoose');
const { isSafeSeedEnvironment, parseMongoUri } = require('../utils/seedGuard');
const { Round, RoundParticipant, TestAttempt, Company, Drive } = require('../models');
const { autoCompletePlatformTestRounds } = require('../services/roundCompletionService');

const VALID_PARTICIPANT_RESULTS = ['pending', 'cleared', 'rejected'];

const runRepairScript = async () => {
  const isApply = process.argv.includes('--apply');
  const rawUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/placement_management';

  // Remote Database Safety Guard
  const envCheck = isSafeSeedEnvironment(rawUri, process.env);
  const allowRemoteOverride =
    process.env.ALLOW_REMOTE_REPAIR === 'true' ||
    process.env.ALLOW_REMOTE_SEED === 'yes-i-am-sure';

  if (!envCheck.allowed && !allowRemoteOverride) {
    const parsed = parseMongoUri(rawUri);
    console.error('\n❌ FATAL: Execution refused by remote database guard.');
    console.error(`Target Host:     ${parsed.hostString}`);
    console.error(`Database Name:   ${parsed.database || '(default)'}`);
    console.error('The target database is remote and does not end with _dev or _test.');
    console.error('To allow execution against this remote environment, explicitly set:');
    console.error('  $env:ALLOW_REMOTE_REPAIR="true"  (PowerShell)\n');
    process.exit(1);
  }

  const parsed = parseMongoUri(rawUri);
  console.log('================================================================');
  console.log('       PLATFORM TEST ROUND REPAIR & RECONCILIATION TOOL         ');
  console.log('================================================================');
  console.log(`Target Database: ${parsed.hostString} / ${parsed.database || '(default)'}`);
  console.log(`Execution Mode:  ${isApply ? 'APPLY (Modifications will be saved)' : 'DRY RUN (Read-Only Inspection)'}`);
  console.log('================================================================\n');

  try {
    await mongoose.connect(rawUri);

    const now = new Date();

    // 1. Identify stuck platform test rounds (window closed but status is not completed)
    const stuckRounds = await Round.find({
      deliveryMode: 'platform_test',
      testWindowEnd: { $ne: null, $lt: now },
      status: { $ne: 'completed' },
    })
      .populate('drive', 'role title company')
      .lean();

    console.log(`[1] Scanning for expired platform test rounds (testWindowEnd < ${now.toISOString()})...`);
    console.log(`    Found ${stuckRounds.length} round(s) pending completion.\n`);

    const roundReports = [];
    let totalInvalidEnumParticipants = 0;
    let totalStuckAttempts = 0;

    for (const round of stuckRounds) {
      const participants = await RoundParticipant.find({ round: round._id }).lean();
      const inProgressAttempts = await TestAttempt.find({ round: round._id, status: 'in_progress' }).lean();

      const invalidEnumList = participants.filter(
        (p) => p.result && !VALID_PARTICIPANT_RESULTS.includes(p.result)
      );

      totalInvalidEnumParticipants += invalidEnumList.length;
      totalStuckAttempts += inProgressAttempts.length;

      roundReports.push({
        id: round._id.toString(),
        name: round.name,
        status: round.status,
        isFinalizing: Boolean(round.isFinalizing),
        windowEnd: round.testWindowEnd ? new Date(round.testWindowEnd).toISOString() : 'N/A',
        totalParticipants: participants.length,
        invalidEnumCount: invalidEnumList.length,
        invalidEnums: Array.from(new Set(invalidEnumList.map((p) => p.result))),
        inProgressAttempts: inProgressAttempts.length,
      });
    }

    // 2. Also check globally for any participant with invalid result enum across the DB
    const globalInvalidEnumCount = await RoundParticipant.countDocuments({
      result: { $nin: VALID_PARTICIPANT_RESULTS },
    });

    // 3. Print inspection table
    if (roundReports.length > 0) {
      console.log('Stuck Rounds Details:');
      console.log('------------------------------------------------------------------------------------------------------');
      console.log(
        'Round ID'.padEnd(26) +
        'Name'.padEnd(24) +
        'Status'.padEnd(12) +
        'Lock'.padEnd(8) +
        'Parts'.padEnd(8) +
        'InvalidEnum'.padEnd(14) +
        'In-Prog'
      );
      console.log('------------------------------------------------------------------------------------------------------');

      for (const r of roundReports) {
        console.log(
          r.id.padEnd(26) +
          r.name.slice(0, 22).padEnd(24) +
          r.status.padEnd(12) +
          (r.isFinalizing ? 'LOCKED' : 'open').padEnd(8) +
          String(r.totalParticipants).padEnd(8) +
          (r.invalidEnumCount > 0 ? `${r.invalidEnumCount} (${r.invalidEnums.join(',')})` : '0').padEnd(14) +
          String(r.inProgressAttempts)
        );
      }
      console.log('------------------------------------------------------------------------------------------------------\n');
    }

    console.log(`Global RoundParticipant invalid result enums in DB: ${globalInvalidEnumCount}`);

    // 4. Execution or Dry Run Notice
    if (!isApply) {
      console.log('\n----------------------------------------------------------------');
      console.log('DRY RUN COMPLETE: No modifications were made to the database.');
      console.log('To repair invalid enums and finalize stuck rounds, re-run with:');
      console.log('  node server/scripts/repairStuckPlatformRounds.js --apply');
      console.log('----------------------------------------------------------------\n');
    } else {
      console.log('\n[2] Applying repairs...');

      // A. Fix invalid enum values in RoundParticipant ('shortlisted' -> 'cleared')
      const fixEnumRes = await RoundParticipant.updateMany(
        { result: 'shortlisted' },
        { $set: { result: 'cleared' } }
      );
      console.log(`    -> Repaired ${fixEnumRes.modifiedCount} RoundParticipant record(s) ('shortlisted' -> 'cleared').`);

      // B. Release stale isFinalizing locks
      const unlockRes = await Round.updateMany(
        { deliveryMode: 'platform_test', isFinalizing: true },
        { $set: { isFinalizing: false, finalizingStartedAt: null } }
      );
      console.log(`    -> Released isFinalizing lock on ${unlockRes.modifiedCount} round(s).`);

      // C. Run autoCompletePlatformTestRounds
      console.log('    -> Running autoCompletePlatformTestRounds()...');
      const completionResult = await autoCompletePlatformTestRounds({ now });

      console.log(`    -> Successfully finalized ${completionResult.completedRoundIds.length} round(s).`);
      console.log(`    -> Auto-submitted attempts: ${completionResult.autoSubmittedCount}`);
      console.log(`    -> Marked absent candidates: ${completionResult.absentCount}`);

      console.log('\n----------------------------------------------------------------');
      console.log('REPAIR COMPLETED SUCCESSFULLY.');
      console.log('----------------------------------------------------------------\n');
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Fatal error executing repair script:', error);
    try {
      await mongoose.disconnect();
    } catch (_) {}
    process.exit(1);
  }
};

runRepairScript();
