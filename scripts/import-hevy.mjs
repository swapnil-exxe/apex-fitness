import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseImport, mergeImport } from '../frontend/src/lib/import-csv.js';
import { dbService, getPool, query } from '../backend/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres.jlhehdaeryaynbtsftul:Apex2026!!!@aws-0-ap-south-1.pooler.supabase.com:5432/postgres';

async function main() {
  console.log('Connecting to Supabase PostgreSQL...');
  const pool = getPool();
  const timeRes = await query('SELECT NOW()');
  console.log('Connected! DB time:', timeRes.rows[0].now);

  const workoutCsvPath = '/Users/swapnil/Documents/hevy /workout_data.csv';
  const measureCsvPath = '/Users/swapnil/Documents/hevy /measurement_data.csv';
  const planJsonPath = path.join(__dirname, '../release/apex-hypertrophy-plan.json');

  if (!fs.existsSync(workoutCsvPath)) {
    throw new Error('Workout CSV not found at: ' + workoutCsvPath);
  }

  const workoutCsv = fs.readFileSync(workoutCsvPath, 'utf8');
  const parsedWorkouts = parseImport(workoutCsv, { unit: 'lbs' });
  console.log(`Parsed ${parsedWorkouts.workouts?.length || 0} workouts and ${parsedWorkouts.customEx?.length || 0} custom exercises.`);

  let parsedBody = { bodyweight: [] };
  if (fs.existsSync(measureCsvPath)) {
    const measureCsv = fs.readFileSync(measureCsvPath, 'utf8');
    parsedBody = parseImport(measureCsv, { unit: 'lbs' });
    console.log(`Parsed ${parsedBody.bodyweight?.length || 0} bodyweight entries.`);
  }

  let planData = null;
  if (fs.existsSync(planJsonPath)) {
    planData = JSON.parse(fs.readFileSync(planJsonPath, 'utf8'));
    console.log(`Loaded plan with ${planData.routines?.length || 0} routines.`);
  }

  // Target accounts: Swapnil's account and the primary admin account
  const targetUserIds = ['uvBJbdvtEI5k8dWD', '7CvFI1XoGG3MOzLG'];

  for (const userId of targetUserIds) {
    console.log(`\n--- Importing into user: ${userId} ---`);
    let state = await dbService.getUserState(userId);
    if (!state) {
      console.log(`State for ${userId} not found, initializing fresh template...`);
      state = {
        _rev: 0,
        unit: 'lbs',
        workouts: [],
        bodyweight: [],
        customEx: [],
        exWeights: {},
        routines: [],
        week: {},
        created: new Date().toISOString()
      };
    }

    // Merge workouts
    const resW = mergeImport(state, parsedWorkouts);
    console.log(`Workouts merge for ${userId}: added ${resW.added}, skipped ${resW.skipped}`);

    // Ensure all workouts have duration and name
    if (Array.isArray(state.workouts)) {
      state.workouts.forEach(w => {
        if (!w.duration && w.start && w.end) {
          w.duration = Math.max(0, Math.round((w.end - w.start) / 1000));
        }
        if (!w.name && w.title) w.name = w.title;
      });
    }

    // Merge bodyweight
    if (parsedBody?.bodyweight?.length) {
      const resB = mergeImport(state, parsedBody);
      console.log(`Bodyweight merge for ${userId}: added ${resB.added}, skipped ${resB.skipped}`);
    }

    // Merge Hypertrophy routines & week schedule if available
    if (planData && Array.isArray(planData.routines)) {
      state.routines = state.routines || [];
      const haveRoutineIds = new Set(state.routines.map(r => r.id));
      planData.routines.forEach(r => {
        if (!haveRoutineIds.has(r.id)) {
          state.routines.push(r);
        }
      });
      if (planData.week && (!state.week || Object.keys(state.week).length === 0)) {
        state.week = planData.week;
      }
    }

    state.unit = 'lbs';
    state._rev = (state._rev || 0) + 1;
    state._ts = Date.now();

    console.log(`Saving state for ${userId} (revision ${state._rev}). Total workouts in state: ${state.workouts.length}`);
    await dbService.saveUserState(userId, state);
    console.log(`Saved user_state! Synchronizing normalized relational tables for ${userId}...`);
    await dbService.syncNormalizedEntities(userId, state);
    console.log(`Normalized relational tables synchronized for ${userId}!`);
  }

  // Verification queries
  console.log('\n--- VERIFICATION ---');
  const countRes = await query('SELECT user_id, COUNT(*) as count FROM workouts GROUP BY user_id');
  console.log('Workouts count per user in DB:');
  console.table(countRes.rows);

  const bwRes = await query('SELECT user_id, COUNT(*) as count FROM bodyweight_logs GROUP BY user_id');
  console.log('Bodyweight logs count per user in DB:');
  console.table(bwRes.rows);

  const rRes = await query('SELECT user_id, COUNT(*) as count FROM routines GROUP BY user_id');
  console.log('Routines count per user in DB:');
  console.table(rRes.rows);

  process.exit(0);
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
