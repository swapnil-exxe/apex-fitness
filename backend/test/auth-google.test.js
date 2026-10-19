import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  isGoogleAuthEnabled, getGoogleConfig, generateAuthUrl,
  verifyStateCookie, signLinkingChallenge, verifyLinkingChallenge
} from '../auth-google.js';

test('isGoogleAuthEnabled reflects environment configuration', () => {
  const orig = process.env.GOOGLE_CLIENT_ID;
  try {
    delete process.env.GOOGLE_CLIENT_ID;
    assert.equal(isGoogleAuthEnabled(), false);
    process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
    assert.equal(isGoogleAuthEnabled(), true);
  } finally {
    if (orig !== undefined) process.env.GOOGLE_CLIENT_ID = orig;
    else delete process.env.GOOGLE_CLIENT_ID;
  }
});

test('getGoogleConfig resolves default and custom URLs', () => {
  const origId = process.env.GOOGLE_CLIENT_ID;
  const origSecret = process.env.GOOGLE_CLIENT_SECRET;
  const origFrontend = process.env.FRONTEND_URL;
  const origRedirect = process.env.GOOGLE_REDIRECT_URI;

  try {
    process.env.GOOGLE_CLIENT_ID = 'test-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
    delete process.env.FRONTEND_URL;
    delete process.env.GOOGLE_REDIRECT_URI;

    const cfg = getGoogleConfig('https://api.apex.fit');
    assert.equal(cfg.clientId, 'test-id');
    assert.equal(cfg.clientSecret, 'test-secret');
    assert.equal(cfg.redirectUri, 'https://api.apex.fit/api/auth/google/callback');
    assert.equal(cfg.frontendUrl, 'https://api.apex.fit');
    assert.equal(cfg.enabled, true);
  } finally {
    if (origId !== undefined) process.env.GOOGLE_CLIENT_ID = origId; else delete process.env.GOOGLE_CLIENT_ID;
    if (origSecret !== undefined) process.env.GOOGLE_CLIENT_SECRET = origSecret; else delete process.env.GOOGLE_CLIENT_SECRET;
    if (origFrontend !== undefined) process.env.FRONTEND_URL = origFrontend; else delete process.env.FRONTEND_URL;
    if (origRedirect !== undefined) process.env.GOOGLE_REDIRECT_URI = origRedirect; else delete process.env.GOOGLE_REDIRECT_URI;
  }
});

test('generateAuthUrl creates valid URL with PKCE and signed state cookie', () => {
  const origId = process.env.GOOGLE_CLIENT_ID;
  const origSecret = process.env.GOOGLE_CLIENT_SECRET;
  try {
    process.env.GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';
    process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
    const secret = 'test-secret-key-that-is-at-least-32-chars-long';

    const res = generateAuthUrl({
      origin: 'https://api.apex.fit',
      isMobile: true,
      returnTo: '/dashboard',
      stateSecret: secret
    });

    assert.ok(res.url.startsWith('https://accounts.google.com/o/oauth2/v2/auth'));
    assert.ok(res.url.includes('response_type=code'));
    assert.ok(res.url.includes('code_challenge_method=S256'));
    assert.ok(res.url.includes(encodeURIComponent(res.state)));

    const verified = verifyStateCookie(res.cookieValue, secret);
    assert.ok(verified, 'state cookie verified');
    assert.equal(verified.state, res.state);
    assert.equal(verified.isMobile, true);
    assert.equal(verified.returnTo, '/dashboard');
    assert.ok(verified.codeVerifier);
  } finally {
    if (origId !== undefined) process.env.GOOGLE_CLIENT_ID = origId; else delete process.env.GOOGLE_CLIENT_ID;
    if (origSecret !== undefined) process.env.GOOGLE_CLIENT_SECRET = origSecret; else delete process.env.GOOGLE_CLIENT_SECRET;
  }
});

test('verifyStateCookie rejects tampered or expired cookie values', () => {
  const secret = 'test-secret-key-12345';
  const goodPayload = { state: 'abc', codeVerifier: 'xyz', exp: Date.now() + 60000 };
  const raw = JSON.stringify(goodPayload);
  const mac = crypto.createHmac('sha256', secret).update(raw).digest('base64url');
  const validCookie = `${Buffer.from(raw).toString('base64url')}.${mac}`;

  assert.ok(verifyStateCookie(validCookie, secret));
  assert.equal(verifyStateCookie(null, secret), null);
  assert.equal(verifyStateCookie('invalid', secret), null);
  assert.equal(verifyStateCookie(validCookie + 'tamper', secret), null);
  assert.equal(verifyStateCookie(validCookie, 'wrong-secret'), null);

  // Expired
  const expiredPayload = { state: 'abc', codeVerifier: 'xyz', exp: Date.now() - 1000 };
  const rawExpired = JSON.stringify(expiredPayload);
  const macExpired = crypto.createHmac('sha256', secret).update(rawExpired).digest('base64url');
  const expiredCookie = `${Buffer.from(rawExpired).toString('base64url')}.${macExpired}`;
  assert.equal(verifyStateCookie(expiredCookie, secret), null);
});

test('signLinkingChallenge and verifyLinkingChallenge enforce HMAC and expiry', () => {
  const secret = 'hmac-secret-apex-fitness';
  const payload = {
    userId: 'user-123',
    email: 'athlete@example.com',
    sub: 'google-sub-999',
    name: 'Athlete'
  };

  const token = signLinkingChallenge(payload, secret);
  assert.ok(typeof token === 'string' && token.includes('.'));

  const verified = verifyLinkingChallenge(token, secret);
  assert.ok(verified);
  assert.equal(verified.userId, 'user-123');
  assert.equal(verified.email, 'athlete@example.com');
  assert.equal(verified.sub, 'google-sub-999');
  assert.equal(verified.name, 'Athlete');
  assert.equal(verified.kind, 'google-link');

  // Tampered token
  assert.equal(verifyLinkingChallenge(token + 'x', secret), null);
  // Wrong secret
  assert.equal(verifyLinkingChallenge(token, 'different-secret'), null);

  // Expired challenge
  const expiredBody = JSON.stringify({
    kind: 'google-link',
    userId: 'user-123',
    email: 'athlete@example.com',
    sub: 'google-sub-999',
    exp: Date.now() - 5000
  });
  const expMac = crypto.createHmac('sha256', secret).update(expiredBody).digest('base64url');
  const expToken = `${Buffer.from(expiredBody).toString('base64url')}.${expMac}`;
  assert.equal(verifyLinkingChallenge(expToken, secret), null);
});
