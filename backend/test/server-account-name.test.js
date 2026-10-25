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

const mintSession = (uid, sv = 0) => {
  const payload = `${uid}:${Date.now() + 86400000}:${sv}`;
  return payload + '.' + crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
};

let tmp, proc, port;

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-name-'));
  fs.writeFileSync(path.join(tmp, 'secret'), SECRET, { mode: 0o600 });
  const db = {
    users: [
      { id: 'usr-swapnil', name: 'Swapnil', email: 'swapnil15x@gmail.com' },
      { id: 'usr-other', name: 'ExistingUser', email: 'other@example.com', pw: { h: 'hashedpw' } }
    ],
    creds: [],
    subs: [],
    invites: [],
    deviceLinks: [],
    federatedIdentities: []
  };
  fs.writeFileSync(path.join(tmp, 'db.json'), JSON.stringify(db));

  proc = spawn(process.execPath, ['server.js'], {
    cwd: API,
    env: {
      ...process.env,
      DATABASE_URL: '',
      PORT: '0',
      DATA_DIR: tmp,
      ORIGIN: 'http://localhost:8080',
      RP_ID: 'localhost'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  proc.stderr.on('data', d => console.error(d.toString()));
  proc.stdout.on('data', d => console.log(d.toString()));

  port = await boundPort(proc);
});

after(() => {
  try { proc.kill(); } catch {}
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
});

test('POST /api/account/name requires authentication', async () => {
  const res = await fetch(`http://localhost:${port}/api/account/name`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'NewName' })
  });
  assert.equal(res.status, 401);
});

test('POST /api/account/name rejects empty or whitespace name', async () => {
  const token = mintSession('usr-swapnil');
  const res = await fetch(`http://localhost:${port}/api/account/name`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ name: '   ' })
  });
  assert.equal(res.status, 400);
});

test('POST /api/account/name rejects duplicate name', async () => {
  const token = mintSession('usr-swapnil');
  const res = await fetch(`http://localhost:${port}/api/account/name`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ name: 'ExistingUser' })
  });
  assert.equal(res.status, 409);
});

test('POST /api/account/name successfully updates name and persists', async () => {
  const token = mintSession('usr-swapnil');
  const res = await fetch(`http://localhost:${port}/api/account/name`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ name: 'Swapnil (Athlete)' })
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(data.user.name, 'Swapnil (Athlete)');
  assert.equal(data.user.id, 'usr-swapnil');
  assert.equal(data.user.email, 'swapnil15x@gmail.com');

  // Verify GET /api/me reflects the new name and email
  const meRes = await fetch(`http://localhost:${port}/api/me`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(meRes.status, 200);
  const meData = await meRes.json();
  assert.equal(meData.user.name, 'Swapnil (Athlete)');
  assert.equal(meData.user.email, 'swapnil15x@gmail.com');
});
