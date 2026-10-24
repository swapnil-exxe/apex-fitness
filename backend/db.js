import pg from 'pg';

const { Pool } = pg;

let pool = null;

export function getPool() {
  if (!pool && process.env.DATABASE_URL) {
    const isLocalhost = process.env.DATABASE_URL.includes('localhost') || process.env.DATABASE_URL.includes('127.0.0.1');
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: isLocalhost ? false : { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    pool.on('error', (err) => {
      console.error('Unexpected error on idle PostgreSQL client:', err.message);
    });
  }
  return pool;
}

export async function query(text, params) {
  const p = getPool();
  if (!p) throw new Error('DATABASE_URL is not configured');
  return p.query(text, params);
}

export async function testConnection() {
  try {
    const p = getPool();
    if (!p) return { ok: false, message: 'DATABASE_URL not set' };
    const res = await p.query('SELECT NOW() AS current_time');
    return { ok: true, time: res.rows[0].current_time };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// -------------------------------------------------------------
// Database Access Layer Methods
// -------------------------------------------------------------

export const dbService = {
  // --- USERS ---
  async getAllUsers() {
    const res = await query('SELECT raw_user_json FROM users ORDER BY created_at ASC');
    return res.rows.map(r => r.raw_user_json);
  },

  async getUserById(id) {
    const res = await query('SELECT raw_user_json FROM users WHERE id = $1', [id]);
    return res.rows[0]?.raw_user_json || null;
  },

  async upsertUser(user) {
    const json = JSON.stringify(user);
    const email = user.email ? user.email.toLowerCase() : null;
    const createdAt = user.created ? new Date(user.created) : new Date();
    const lastPullAt = user.lastPull ? new Date(user.lastPull) : null;
    
    await query(`
      INSERT INTO users (id, name, email, password_hash, is_admin, session_version, created_at, last_pull_at, raw_user_json)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        email = EXCLUDED.email,
        password_hash = EXCLUDED.password_hash,
        is_admin = EXCLUDED.is_admin,
        session_version = EXCLUDED.session_version,
        last_pull_at = EXCLUDED.last_pull_at,
        raw_user_json = EXCLUDED.raw_user_json
    `, [
      user.id,
      user.name,
      email,
      user.passwordHash || null,
      !!user.admin,
      user.v || 1,
      createdAt,
      lastPullAt,
      json
    ]);
  },

  async deleteUser(id) {
    await query('DELETE FROM users WHERE id = $1', [id]);
  },

  async getUserByEmail(email) {
    if (!email) return null;
    const res = await query('SELECT raw_user_json FROM users WHERE LOWER(email) = LOWER($1)', [email.trim()]);
    return res.rows[0]?.raw_user_json || null;
  },

  // --- PASSKEYS ---
  async getPasskeysForUser(userId) {
    const res = await query('SELECT id, user_id, name, public_key, counter, transports, created_at FROM passkeys WHERE user_id = $1', [userId]);
    return res.rows.map(r => ({
      id: r.id,
      userId: r.user_id,
      name: r.name,
      publicKey: r.public_key,
      counter: Number(r.counter),
      transports: r.transports,
      created: r.created_at ? new Date(r.created_at).getTime() : Date.now()
    }));
  },

  async getAllPasskeys() {
    const res = await query('SELECT id, user_id, name, public_key, counter, transports, created_at FROM passkeys');
    return res.rows.map(r => ({
      id: r.id,
      userId: r.user_id,
      name: r.name,
      publicKey: r.public_key,
      counter: Number(r.counter),
      transports: r.transports,
      created: r.created_at ? new Date(r.created_at).getTime() : Date.now()
    }));
  },

  async addPasskey(cred) {
    await query(`
      INSERT INTO passkeys (id, user_id, name, public_key, counter, transports, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO UPDATE SET
        counter = EXCLUDED.counter,
        name = EXCLUDED.name
    `, [
      cred.id,
      cred.userId,
      cred.name || null,
      cred.publicKey,
      cred.counter || 0,
      JSON.stringify(cred.transports || []),
      cred.created ? new Date(cred.created) : new Date()
    ]);
  },

  async removePasskey(id) {
    await query('DELETE FROM passkeys WHERE id = $1', [id]);
  },

  // --- PUSH SUBSCRIPTIONS ---
  async getAllSubscriptions() {
    const res = await query('SELECT endpoint, user_id, keys_p256dh, keys_auth, routine, timezone FROM push_subscriptions');
    return res.rows.map(r => ({
      endpoint: r.endpoint,
      userId: r.user_id,
      keys: { p256dh: r.keys_p256dh, auth: r.keys_auth },
      routine: r.routine,
      tz: r.timezone
    }));
  },

  async saveSubscription(sub) {
    await query(`
      INSERT INTO push_subscriptions (endpoint, user_id, keys_p256dh, keys_auth, routine, timezone)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (endpoint) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        keys_p256dh = EXCLUDED.keys_p256dh,
        keys_auth = EXCLUDED.keys_auth,
        routine = EXCLUDED.routine,
        timezone = EXCLUDED.timezone
    `, [
      sub.endpoint,
      sub.userId,
      sub.keys.p256dh,
      sub.keys.auth,
      sub.routine || null,
      sub.tz || null
    ]);
  },

  async removeSubscription(endpoint) {
    await query('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
  },

  // --- INVITES ---
  async getAllInvites() {
    const res = await query('SELECT code, created_by, created_at, used_by, used_at FROM invites');
    return res.rows.map(r => ({
      code: r.code,
      createdBy: r.created_by,
      created: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
      usedBy: r.used_by,
      usedAt: r.used_at ? new Date(r.used_at).getTime() : null
    }));
  },

  async saveInvite(invite) {
    await query(`
      INSERT INTO invites (code, created_by, created_at, used_by, used_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (code) DO UPDATE SET
        used_by = EXCLUDED.used_by,
        used_at = EXCLUDED.used_at
    `, [
      invite.code,
      invite.createdBy || null,
      invite.created ? new Date(invite.created) : new Date(),
      invite.usedBy || null,
      invite.usedAt ? new Date(invite.usedAt) : null
    ]);
  },

  // --- DEVICE LINKS ---
  async getAllDeviceLinks() {
    const res = await query('SELECT code_hash, user_id, created_at, expires_at FROM device_links WHERE expires_at > NOW()');
    return res.rows.map(r => ({
      hash: r.code_hash,
      userId: r.user_id,
      created: new Date(r.created_at).getTime(),
      expires: new Date(r.expires_at).getTime()
    }));
  },

  async saveDeviceLink(link) {
    await query(`
      INSERT INTO device_links (code_hash, user_id, created_at, expires_at)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (code_hash) DO NOTHING
    `, [
      link.hash,
      link.userId,
      new Date(link.created || Date.now()),
      new Date(link.expires || (Date.now() + 5 * 60 * 1000))
    ]);
  },

  async deleteDeviceLink(hash) {
    await query('DELETE FROM device_links WHERE code_hash = $1', [hash]);
  },

  // --- FEDERATED IDENTITIES (GOOGLE SIGN-IN) ---
  async getFederatedIdentity(provider, providerSubject) {
    const res = await query(
      'SELECT id, user_id, provider, provider_subject, email, email_verified, created_at, last_login_at FROM federated_identities WHERE provider = $1 AND provider_subject = $2',
      [provider, String(providerSubject)]
    );
    if (!res.rows[0]) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      userId: r.user_id,
      provider: r.provider,
      providerSubject: r.provider_subject,
      email: r.email,
      emailVerified: r.email_verified,
      created: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
      lastLogin: r.last_login_at ? new Date(r.last_login_at).getTime() : Date.now()
    };
  },

  async getAllFederatedIdentities() {
    const res = await query('SELECT id, user_id, provider, provider_subject, email, email_verified, created_at, last_login_at FROM federated_identities');
    return res.rows.map(r => ({
      id: r.id,
      userId: r.user_id,
      provider: r.provider,
      providerSubject: r.provider_subject,
      email: r.email,
      emailVerified: r.email_verified,
      created: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
      lastLogin: r.last_login_at ? new Date(r.last_login_at).getTime() : Date.now()
    }));
  },

  async getFederatedIdentitiesForUser(userId) {
    const res = await query(
      'SELECT id, user_id, provider, provider_subject, email, email_verified, created_at, last_login_at FROM federated_identities WHERE user_id = $1',
      [userId]
    );
    return res.rows.map(r => ({
      id: r.id,
      userId: r.user_id,
      provider: r.provider,
      providerSubject: r.provider_subject,
      email: r.email,
      emailVerified: r.email_verified,
      created: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
      lastLogin: r.last_login_at ? new Date(r.last_login_at).getTime() : Date.now()
    }));
  },

  async addFederatedIdentity({ id, userId, provider, providerSubject, email, emailVerified, rawClaims }) {
    await query(`
      INSERT INTO federated_identities (id, user_id, provider, provider_subject, email, email_verified, raw_claims, created_at, last_login_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      ON CONFLICT (provider, provider_subject) DO UPDATE SET
        email = EXCLUDED.email,
        email_verified = EXCLUDED.email_verified,
        last_login_at = NOW(),
        raw_claims = EXCLUDED.raw_claims
    `, [
      id,
      userId,
      provider,
      String(providerSubject),
      email.toLowerCase().trim(),
      emailVerified !== false,
      rawClaims ? JSON.stringify(rawClaims) : null
    ]);
  },

  async updateFederatedIdentityLastLogin(provider, providerSubject) {
    await query(
      'UPDATE federated_identities SET last_login_at = NOW() WHERE provider = $1 AND provider_subject = $2',
      [provider, String(providerSubject)]
    );
  },

  async deleteFederatedIdentity(userId, provider) {
    await query('DELETE FROM federated_identities WHERE user_id = $1 AND provider = $2', [userId, provider]);
  },

  // --- USER STATE & 3-WAY SYNC ---
  async getUserState(userId) {
    const res = await query('SELECT state, revision, write_id, write_ids FROM user_state WHERE user_id = $1', [userId]);
    if (!res.rows[0]) return null;
    const row = res.rows[0];
    const doc = row.state;
    doc._rev = row.revision;
    if (row.write_id) doc._wid = row.write_id;
    if (row.write_ids) doc._wids = row.write_ids;
    return doc;
  },

  async saveUserState(userId, doc) {
    const rev = doc._rev || 0;
    const wid = doc._wid || null;
    const wids = JSON.stringify(doc._wids || []);
    const stateJson = JSON.stringify(doc);

    await query(`
      INSERT INTO user_state (user_id, revision, write_id, write_ids, state, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        revision = EXCLUDED.revision,
        write_id = EXCLUDED.write_id,
        write_ids = EXCLUDED.write_ids,
        state = EXCLUDED.state,
        updated_at = NOW()
    `, [userId, rev, wid, wids, stateJson]);

    // Asynchronously update normalized tables without blocking the sync response
    this.syncNormalizedEntities(userId, doc).catch(e => {
      console.error('Async normalized entity sync error:', e.message);
    });
  },

  async syncNormalizedEntities(userId, doc) {
    if (!doc || typeof doc !== 'object') return;

    // 1. Ingest Workouts
    if (Array.isArray(doc.workouts)) {
      for (const w of doc.workouts) {
        if (!w || !w.id) continue;
        const vol = w.volume != null ? Number(w.volume) : null;
        const dur = w.duration != null ? Number(w.duration) : null;
        const rpe = w.rpe != null ? Number(w.rpe) : null;
        await query(`
          INSERT INTO workouts (id, user_id, name, date, duration_sec, volume_kg, rpe, entries)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (user_id, id) DO UPDATE SET
            name = EXCLUDED.name,
            date = EXCLUDED.date,
            duration_sec = EXCLUDED.duration_sec,
            volume_kg = EXCLUDED.volume_kg,
            rpe = EXCLUDED.rpe,
            entries = EXCLUDED.entries
        `, [w.id, userId, w.name || 'Workout', w.d || null, dur, vol, rpe, JSON.stringify(w.entries || [])]);
      }
    }

    // 2. Ingest Routines
    if (Array.isArray(doc.routines)) {
      for (const r of doc.routines) {
        if (!r || !r.id) continue;
        await query(`
          INSERT INTO routines (id, user_id, name, emoji, exercises)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (user_id, id) DO UPDATE SET
            name = EXCLUDED.name,
            emoji = EXCLUDED.emoji,
            exercises = EXCLUDED.exercises
        `, [r.id, userId, r.name || 'Routine', r.emoji || null, JSON.stringify(r.exercises || [])]);
      }
    }

    // 3. Ingest Bodyweight logs
    if (Array.isArray(doc.bodyweight)) {
      for (const b of doc.bodyweight) {
        if (!b) continue;
        const bId = b.id || `bw_${b.d || Date.now()}`;
        const wt = Number(b.w || b.weight || 0);
        await query(`
          INSERT INTO bodyweight_logs (id, user_id, date, weight, unit)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (user_id, id) DO UPDATE SET
            date = EXCLUDED.date,
            weight = EXCLUDED.weight,
            unit = EXCLUDED.unit
        `, [bId, userId, b.d || b.date, wt, b.unit || 'kg']);
      }
    }
  },

  // --- APP SETTINGS ---
  async getAppSetting(key) {
    const res = await query('SELECT value FROM app_settings WHERE key = $1', [key]);
    return res.rows[0]?.value || null;
  },

  async setAppSetting(key, val) {
    await query(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value,
        updated_at = NOW()
    `, [key, JSON.stringify(val)]);
  }
};
