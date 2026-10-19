#!/usr/bin/env node
/**
 * APEX Fitness - JSON to PostgreSQL Migration Script
 * Migrates users, credentials, invites, subscriptions, device links, app settings,
 * and user state (including workouts, routines, bodyweight logs) from local JSON files
 * to Supabase / PostgreSQL.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPool, dbService } from '../backend/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '../data');

async function runMigration() {
  console.log(`[Migration] Starting JSON -> PostgreSQL migration...`);
  console.log(`[Migration] Source data directory: ${DATA_DIR}`);

  const pool = getPool();
  if (!pool) {
    console.error('[Migration] ERROR: DATABASE_URL environment variable is required.');
    process.exit(1);
  }

  let userCount = 0;
  let passkeyCount = 0;
  let subCount = 0;
  let inviteCount = 0;
  let linkCount = 0;
  let stateCount = 0;

  // 1. Migrate db.json
  const dbFile = path.join(DATA_DIR, 'db.json');
  if (fs.existsSync(dbFile)) {
    try {
      const db = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
      
      // Users
      if (Array.isArray(db.users)) {
        for (const user of db.users) {
          await dbService.upsertUser(user);
          userCount++;
          console.log(`[Migration] Migrated user: ${user.name} (${user.id})`);
        }
      }

      // Passkeys
      if (Array.isArray(db.creds)) {
        for (const cred of db.creds) {
          await dbService.addPasskey(cred);
          passkeyCount++;
          console.log(`[Migration] Migrated passkey: ${cred.id} for user ${cred.userId}`);
        }
      }

      // Push Subscriptions
      if (Array.isArray(db.subs)) {
        for (const sub of db.subs) {
          await dbService.saveSubscription(sub);
          subCount++;
        }
      }

      // Invites
      if (Array.isArray(db.invites)) {
        for (const invite of db.invites) {
          await dbService.saveInvite(invite);
          inviteCount++;
        }
      }

      // Device Links
      if (Array.isArray(db.deviceLinks)) {
        for (const link of db.deviceLinks) {
          await dbService.saveDeviceLink(link);
          linkCount++;
        }
      }
    } catch (err) {
      console.error(`[Migration] Error reading/parsing ${dbFile}:`, err.message);
    }
  } else {
    console.log(`[Migration] No ${dbFile} found; skipping primary db.json migration.`);
  }

  // 2. Migrate User State files (state-*.json)
  if (fs.existsSync(DATA_DIR)) {
    const files = fs.readdirSync(DATA_DIR);
    for (const file of files) {
      const match = file.match(/^state-([a-zA-Z0-9_-]+)\.json$/);
      if (match) {
        const userId = match[1];
        try {
          const content = fs.readFileSync(path.join(DATA_DIR, file), 'utf8');
          const doc = JSON.parse(content);
          await dbService.saveUserState(userId, doc);
          // Wait briefly for normalized entity sync
          await dbService.syncNormalizedEntities(userId, doc);
          stateCount++;
          console.log(`[Migration] Migrated state document for user: ${userId} (rev ${doc._rev})`);
        } catch (err) {
          console.error(`[Migration] Failed migrating state file ${file}:`, err.message);
        }
      }
    }
  }

  // 3. Migrate secret & VAPID keys into app_settings
  const secretFile = path.join(DATA_DIR, 'secret');
  if (fs.existsSync(secretFile)) {
    const secret = fs.readFileSync(secretFile, 'utf8').trim();
    if (secret) {
      await dbService.setAppSetting('instance_secret', secret);
      console.log(`[Migration] Migrated instance secret to app_settings`);
    }
  }

  const vapidFile = path.join(DATA_DIR, 'vapid.json');
  if (fs.existsSync(vapidFile)) {
    try {
      const vapid = JSON.parse(fs.readFileSync(vapidFile, 'utf8'));
      await dbService.setAppSetting('vapid_keys', vapid);
      console.log(`[Migration] Migrated VAPID keys to app_settings`);
    } catch (e) {
      console.warn(`[Migration] Could not parse vapid.json:`, e.message);
    }
  }

  console.log(`\n========================================`);
  console.log(`[Migration Summary]`);
  console.log(`- Users: ${userCount}`);
  console.log(`- Passkeys: ${passkeyCount}`);
  console.log(`- Push Subscriptions: ${subCount}`);
  console.log(`- Invites: ${inviteCount}`);
  console.log(`- Device Links: ${linkCount}`);
  console.log(`- User State Documents: ${stateCount}`);
  console.log(`========================================\n`);

  await pool.end();
  console.log(`[Migration] Migration completed successfully.`);
}

runMigration().catch(err => {
  console.error('[Migration] Unhandled error during migration:', err);
  process.exit(1);
});
