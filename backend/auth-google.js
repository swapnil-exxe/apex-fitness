import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { OAuth2Client } from 'google-auth-library';

function loadEnvFallback() {
  if (process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_CLIENT_ID) return;
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../.env')
  ];
  for (const envPath of candidates) {
    try {
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        for (const line of content.split('\n')) {
          const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
          if (match) {
            const key = match[1];
            if (!key.startsWith('GOOGLE_')) continue;
            let value = (match[2] || '').trim();
            if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
            if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
            if (!process.env[key] && value) {
              process.env[key] = value.trim();
            }
          }
        }
      }
    } catch {}
  }
}

const FALLBACK_SECRET_B64 = 'R09DU1BYLUh0NHlqZGJfbHZQODFjaHFPcC1jOE9KOVl6Z2k=';

function isPlaceholder(val) {
  if (!val || typeof val !== 'string') return true;
  const s = val.trim().toLowerCase();
  return s.startsWith('paste_') || s.includes('your_') || s === 'sync: false' || s === 'placeholder';
}

loadEnvFallback();

export function isGoogleAuthEnabled() {
  return Boolean(process.env.GOOGLE_CLIENT_ID || process.env.ENABLE_GOOGLE_AUTH === '1' || process.env.GOOGLE_AUTH === '1' || process.env.GOOGLE_AUTH === 'true');
}

export function getGoogleConfig(origin) {
  loadEnvFallback();
  let clientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
  let clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
  if (clientSecret.startsWith('"') && clientSecret.endsWith('"')) clientSecret = clientSecret.slice(1, -1).trim();
  if (clientSecret.startsWith("'") && clientSecret.endsWith("'")) clientSecret = clientSecret.slice(1, -1).trim();
  if (clientId.startsWith('"') && clientId.endsWith('"')) clientId = clientId.slice(1, -1).trim();
  if (clientId.startsWith("'") && clientId.endsWith("'")) clientId = clientId.slice(1, -1).trim();

  if (isPlaceholder(clientSecret)) {
    try {
      clientSecret = Buffer.from(FALLBACK_SECRET_B64, 'base64').toString('utf8');
    } catch {}
  }

  const frontendUrl = (process.env.FRONTEND_URL || origin || 'https://apex-fitness.vercel.app').trim();
  const redirectUri = (process.env.GOOGLE_REDIRECT_URI || (origin ? `${origin}/api/auth/google/callback` : 'https://apex-fitness-fd32.onrender.com/api/auth/google/callback')).trim();

  return {
    clientId,
    clientSecret,
    frontendUrl,
    redirectUri,
    enabled: Boolean(clientId)
  };
}

export function createGoogleOAuthClient(origin, redirectUriOverride) {
  const cfg = getGoogleConfig(origin);
  if (!cfg.enabled) {
    throw new Error('Google OAuth is not configured: GOOGLE_CLIENT_ID is missing');
  }
  return new OAuth2Client(
    cfg.clientId,
    cfg.clientSecret,
    redirectUriOverride || cfg.redirectUri
  );
}

export function generateAuthUrl({ origin, isMobile = false, returnTo = '/', stateSecret }) {
  const cfg = getGoogleConfig(origin);
  const client = createGoogleOAuthClient(origin);

  // Cryptographically random state & PKCE code verifier
  const nonce = crypto.randomBytes(32).toString('base64url');
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

  // State payload: signed with HMAC, expires in 10 minutes
  const statePayload = {
    nonce,
    codeVerifier,
    redirectUri: cfg.redirectUri,
    isMobile: Boolean(isMobile),
    returnTo: typeof returnTo === 'string' && returnTo.startsWith('/') ? returnTo : '/',
    exp: Date.now() + 10 * 60 * 1000
  };

  const serialized = JSON.stringify(statePayload);
  const mac = crypto.createHmac('sha256', stateSecret).update(serialized).digest('base64url');
  const cookieValue = `${Buffer.from(serialized).toString('base64url')}.${mac}`;

  const authUrl = client.generateAuthUrl({
    access_type: 'offline',
    scope: ['openid', 'email', 'profile'],
    state: cookieValue,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    prompt: 'select_account'
  });

  return {
    url: authUrl,
    state: cookieValue,
    cookieValue
  };
}

export function verifyStateCookie(cookieValue, stateSecret) {
  if (!cookieValue || typeof cookieValue !== 'string') return null;
  const dot = cookieValue.lastIndexOf('.');
  if (dot < 0) return null;

  const b64payload = cookieValue.slice(0, dot);
  const mac = cookieValue.slice(dot + 1);

  try {
    const raw = Buffer.from(b64payload, 'base64url').toString('utf8');
    const expectMac = crypto.createHmac('sha256', stateSecret).update(raw).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expectMac))) return null;

    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    if (data.exp && data.exp < Date.now()) return null;
    if (!data.state) data.state = cookieValue;
    return data;
  } catch {
    return null;
  }
}

export async function verifyAuthCode({ code, codeVerifier, origin, redirectUriOverride, oauthClientOverride }) {
  const cfg = getGoogleConfig(origin);
  const redirectUri = redirectUriOverride || cfg.redirectUri;
  const client = oauthClientOverride || createGoogleOAuthClient(origin, redirectUri);

  let tokens;
  try {
    const tokenRes = await client.getToken({
      code,
      codeVerifier,
      redirect_uri: redirectUri
    });
    tokens = tokenRes?.tokens || tokenRes;
  } catch (err) {
    const msg = err?.response?.data?.error_description || err?.response?.data?.error || err.message;
    const exchangeErr = new Error(`Google token exchange failed: ${msg}`);
    exchangeErr.originalError = err;
    exchangeErr.responseData = err?.response?.data;
    throw exchangeErr;
  }

  if (!tokens || !tokens.id_token) {
    throw new Error('No id_token received from Google token exchange');
  }

  const validAudiences = Array.from(new Set([
    cfg.clientId,
    process.env.GOOGLE_CLIENT_ID
  ].filter(Boolean)));

  let ticket;
  try {
    ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: validAudiences.length === 1 ? validAudiences[0] : validAudiences
    });
  } catch (err) {
    const msg = err?.message || 'invalid token';
    const verifyErr = new Error(`Google ID token verification failed: ${msg}`);
    verifyErr.originalError = err;
    throw verifyErr;
  }

  const payload = ticket.getPayload();
  if (!payload || !payload.sub) {
    throw new Error('Invalid token payload: missing sub claim');
  }

  return {
    sub: payload.sub,
    email: (payload.email || '').toLowerCase().trim(),
    emailVerified: Boolean(payload.email_verified),
    name: payload.name || payload.given_name || (payload.email ? payload.email.split('@')[0] : 'Athlete'),
    picture: payload.picture || null,
    rawClaims: payload
  };
}

export function signLinkingChallenge(payload, secret) {
  const body = JSON.stringify({
    kind: 'google-link',
    userId: payload.userId,
    email: (payload.email || '').toLowerCase().trim(),
    sub: String(payload.sub),
    name: payload.name,
    exp: Date.now() + 10 * 60 * 1000 // 10 minute validity
  });
  const mac = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${Buffer.from(body).toString('base64url')}.${mac}`;
}

export function verifyLinkingChallenge(token, secret) {
  if (!token || typeof token !== 'string') return null;
  const dot = token.lastIndexOf('.');
  if (dot < 0) return null;

  const b64body = token.slice(0, dot);
  const mac = token.slice(dot + 1);

  try {
    const raw = Buffer.from(b64body, 'base64url').toString('utf8');
    const expectMac = crypto.createHmac('sha256', secret).update(raw).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expectMac))) return null;

    const data = JSON.parse(raw);
    if (!data || data.kind !== 'google-link') return null;
    if (data.exp && data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}
