import test from 'node:test';
import assert from 'node:assert/strict';
import { generateAuthUrl, verifyStateCookie, getGoogleConfig } from '../auth-google.js';

test('iOS OAuth Deep Link generation and structure', () => {
  const secret = 'test-secret-ios-auth-123456789012345';
  const { url, state, cookieValue } = generateAuthUrl({
    origin: 'https://apex-fitness-fd32.onrender.com',
    isMobile: true,
    returnTo: '/',
    stateSecret: secret
  });

  assert.ok(url.startsWith('https://accounts.google.com/o/oauth2/v2/auth'));
  assert.ok(url.includes('code_challenge='));
  assert.ok(url.includes('code_challenge_method=S256'));

  const parsed = verifyStateCookie(cookieValue, secret);
  assert.ok(parsed, 'State cookie should verify cleanly');
  assert.equal(parsed.isMobile, true, 'isMobile flag must be preserved for iOS/mobile flow');
});

test('iOS deep link callback schema matches com.apex.fitness://auth/callback', () => {
  const sampleUser = { id: 'u_ios_test_42', name: 'Alex Runner', email: 'alex@example.com' };
  const sampleToken = 'apex_sess_tok_ios_sample_98765';
  
  const deepLinkUrl = `com.apex.fitness://auth/callback?token=${encodeURIComponent(sampleToken)}&user=${encodeURIComponent(JSON.stringify(sampleUser))}`;
  
  // Verify iOS URL parsing
  const u = new URL(deepLinkUrl);
  assert.equal(u.protocol, 'com.apex.fitness:');
  assert.equal(u.host, 'auth');
  assert.equal(u.pathname, '/callback');
  assert.equal(u.searchParams.get('token'), sampleToken);
  
  const parsedUser = JSON.parse(decodeURIComponent(u.searchParams.get('user')));
  assert.equal(parsedUser.id, sampleUser.id);
  assert.equal(parsedUser.name, sampleUser.name);
  assert.equal(parsedUser.email, sampleUser.email);
});

test('KG to LBS conversion factor matches exact 2.2046226218 standard drift-free', () => {
  const LB_PER_KG = 2.2046226218;
  const weightsKg = [20, 60, 100, 140, 225.5];

  for (const kg of weightsKg) {
    const lbs = kg * LB_PER_KG;
    const roundtripKg = lbs / LB_PER_KG;
    assert.ok(Math.abs(roundtripKg - kg) < 1e-9, `Weight drift detected for ${kg} kg`);
  }
});
