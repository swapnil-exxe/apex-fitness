import crypto from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';

export function isGoogleAuthEnabled() {
  return Boolean(process.env.GOOGLE_CLIENT_ID || process.env.ENABLE_GOOGLE_AUTH === '1' || process.env.GOOGLE_AUTH === '1' || process.env.GOOGLE_AUTH === 'true');
}

export function getGoogleConfig(origin) {
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
  const frontendUrl = process.env.FRONTEND_URL || origin || 'http://localhost:5173';
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || (origin ? `${origin}/api/auth/google/callback` : 'http://localhost:3000/api/auth/google/callback');

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
  const state = crypto.randomBytes(32).toString('base64url');
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

  const authUrl = client.generateAuthUrl({
    access_type: 'offline',
    scope: ['openid', 'email', 'profile'],
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    prompt: 'select_account'
  });

  // State cookie payload: signed, expires in 10 minutes
  const statePayload = {
    state,
    codeVerifier,
    isMobile: Boolean(isMobile),
    returnTo: typeof returnTo === 'string' && returnTo.startsWith('/') ? returnTo : '/',
    exp: Date.now() + 10 * 60 * 1000
  };

  const serialized = JSON.stringify(statePayload);
  const mac = crypto.createHmac('sha256', stateSecret).update(serialized).digest('base64url');
  const cookieValue = `${Buffer.from(serialized).toString('base64url')}.${mac}`;

  return {
    url: authUrl,
    state,
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
    return data;
  } catch {
    return null;
  }
}

export async function verifyAuthCode({ code, codeVerifier, origin, redirectUriOverride, oauthClientOverride }) {
  const cfg = getGoogleConfig(origin);
  const client = oauthClientOverride || createGoogleOAuthClient(origin, redirectUriOverride);

  const { tokens } = await client.getToken({
    code,
    codeVerifier
  });

  if (!tokens || !tokens.id_token) {
    throw new Error('No id_token received from Google token exchange');
  }

  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token,
    audience: cfg.clientId
  });

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
