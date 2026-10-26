import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boundPort } from './helpers.mjs';

const API = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = crypto.randomBytes(32).toString('hex');
const ORIGIN = 'http://localhost:8080';

const mintSession = (uid, sv = 0, exp = Date.now() + 86400000) => {
  const payload = `${uid}:${exp}:${sv}`;
  return payload + '.' + crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
};

let tmp, proc, port;

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-flows-'));
  fs.writeFileSync(path.join(tmp, 'secret'), SECRET, { mode: 0o600 });
  const db = {
    users: [
      { id: 'usr-athlete-1', name: 'Athlete One', email: 'athlete1@example.com' },
      { id: 'usr-athlete-2', name: 'Athlete Two', email: 'athlete2@example.com' }
    ],
    creds: [],
    subs: [],
    invites: [],
    deviceLinks: [],
    federatedIdentities: [
      {
        id: 'fed-1',
        provider: 'google',
        providerSubject: 'google-sub-12345',
        email: 'athlete1@example.com',
        userId: 'usr-athlete-1',
        created: Date.now()
      }
    ]
  };
  fs.writeFileSync(path.join(tmp, 'db.json'), JSON.stringify(db));

  proc = spawn(process.execPath, ['server.js'], {
    cwd: API,
    env: {
      ...process.env,
      DATABASE_URL: '',
      PORT: '0',
      DATA_DIR: tmp,
      ORIGIN,
      RP_ID: 'localhost'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  port = await boundPort(proc);
});

after(() => {
  try { proc.kill(); } catch {}
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
});

test('Session verification and account isolation', async () => {
  const token1 = mintSession('usr-athlete-1');
  const token2 = mintSession('usr-athlete-2');

  // Verify Athlete 1 identity via /api/me
  const me1 = await (await fetch(`http://localhost:${port}/api/me`, {
    headers: { Authorization: `Bearer ${token1}` }
  })).json();
  assert.equal(me1.user.id, 'usr-athlete-1');
  assert.equal(me1.user.name, 'Athlete One');
  assert.equal(me1.user.email, 'athlete1@example.com');

  // Verify Athlete 2 identity via /api/me
  const me2 = await (await fetch(`http://localhost:${port}/api/me`, {
    headers: { Authorization: `Bearer ${token2}` }
  })).json();
  assert.equal(me2.user.id, 'usr-athlete-2');
  assert.equal(me2.user.name, 'Athlete Two');
  assert.equal(me2.user.email, 'athlete2@example.com');

  // Expired token is rejected with 401
  const expiredToken = mintSession('usr-athlete-1', 0, Date.now() - 1000);
  const expiredRes = await fetch(`http://localhost:${port}/api/me`, {
    headers: { Authorization: `Bearer ${expiredToken}` }
  });
  assert.equal(expiredRes.status, 401);
});

test('Cloud workout persistence and multi-device sync', async () => {
  const token = mintSession('usr-athlete-1');

  // Initial state upload from Device A (KG default)
  const initialWorkoutState = {
    _rev: 1,
    _ts: Date.now(),
    unit: 'kg',
    workouts: [
      {
        id: 'w-bench-001',
        name: 'Push A',
        d: '2026-10-25',
        start: 1729850000000,
        end: 1729853600000,
        entries: [
          {
            exercise: 'bench-press',
            sets: [
              { r: 10, w: 80, done: true },
              { r: 8, w: 85, done: true },
              { r: 6, w: 90, done: true }
            ]
          }
        ]
      }
    ],
    routines: [
      { id: 'r-push', name: 'Push Day', ex: ['bench-press'] }
    ],
    bodyweight: [
      { d: '2026-10-25', w: 75.5, t: Date.now() }
    ]
  };

  // Device A pushes state
  const pushRes = await fetch(`http://localhost:${port}/api/data`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ state: initialWorkoutState })
  });
  assert.equal(pushRes.status, 200);

  // Device B logs in with same account and pulls state
  const pullRes = await fetch(`http://localhost:${port}/api/data`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(pullRes.status, 200);
  const pulledData = await pullRes.json();
  assert.equal(pulledData.state.unit, 'kg');
  assert.equal(pulledData.state.workouts.length, 1);
  assert.equal(pulledData.state.workouts[0].name, 'Push A');
  assert.equal(pulledData.state.workouts[0].entries[0].sets[0].w, 80);
  assert.equal(pulledData.state.bodyweight[0].w, 75.5);

  // Device B adds a second workout and pushes rev 2
  const updatedState = {
    ...pulledData.state,
    _rev: 2,
    _ts: Date.now() + 1000,
    workouts: [
      ...pulledData.state.workouts,
      {
        id: 'w-pull-002',
        name: 'Pull A',
        d: '2026-10-26',
        start: 1729936400000,
        end: 1729940000000,
        entries: [
          {
            exercise: 'pull-up',
            sets: [{ r: 10, w: 0, done: true }]
          }
        ]
      }
    ]
  };

  const pushRes2 = await fetch(`http://localhost:${port}/api/data`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ state: updatedState })
  });
  assert.equal(pushRes2.status, 200);

  // Device A pulls rev 2 and observes both workouts
  const pullRes2 = await fetch(`http://localhost:${port}/api/data`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const deviceAState = await pullRes2.json();
  assert.equal(deviceAState.state.workouts.length, 2);
  assert.equal(deviceAState.state.workouts[1].name, 'Pull A');

  // Verify User 2 cannot access User 1's state (strict data isolation)
  const token2 = mintSession('usr-athlete-2');
  const user2Pull = await fetch(`http://localhost:${port}/api/data`, {
    headers: { Authorization: `Bearer ${token2}` }
  });
  // User 2 has no state yet or empty state, never User 1's workouts
  if (user2Pull.status === 200) {
    const user2Data = await user2Pull.json();
    assert.notEqual(user2Data.state?.workouts?.[0]?.id, 'w-bench-001');
  }
});

test('Display name update and cross-device propagation', async () => {
  const token = mintSession('usr-athlete-1');

  // Change display name
  const nameRes = await fetch(`http://localhost:${port}/api/account/name`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ name: 'Swapnil (Champion)' })
  });
  assert.equal(nameRes.status, 200);
  const nameData = await nameRes.json();
  assert.equal(nameData.user.name, 'Swapnil (Champion)');

  // Another device fetching /api/me gets the updated display name
  const meRes = await fetch(`http://localhost:${port}/api/me`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const meData = await meRes.json();
  assert.equal(meData.user.name, 'Swapnil (Champion)');
});

test('KG to LBS preference persistence', async () => {
  const token = mintSession('usr-athlete-1');

  // Switch preference to LBS and push updated state
  const pullRes = await fetch(`http://localhost:${port}/api/data`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const current = (await pullRes.json()).state;

  const lbState = {
    ...current,
    _rev: (current._rev || 1) + 1,
    _ts: Date.now(),
    unit: 'lb',
    unitSet: { at: Date.now(), convert: true }
  };

  const pushLb = await fetch(`http://localhost:${port}/api/data`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ state: lbState })
  });
  assert.equal(pushLb.status, 200);

  // Sync to second device verifies 'lb' unit is authoritatively stored
  const verifyRes = await fetch(`http://localhost:${port}/api/data`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const verifyData = await verifyRes.json();
  assert.equal(verifyData.state.unit, 'lb');
});
