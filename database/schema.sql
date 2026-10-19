-- APEX Fitness Database Schema (PostgreSQL)
-- Supports normalized entities and document sync state

-- Enable uuid-ossp if available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE,
    password_hash TEXT,
    is_admin BOOLEAN DEFAULT FALSE,
    session_version INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_pull_at TIMESTAMPTZ,
    raw_user_json JSONB
);

-- 2. Passkeys (WebAuthn credentials)
CREATE TABLE IF NOT EXISTS passkeys (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) DEFAULT 'Passkey',
    public_key TEXT NOT NULL,
    counter BIGINT DEFAULT 0,
    transports JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Web Push Subscriptions
CREATE TABLE IF NOT EXISTS push_subscriptions (
    endpoint TEXT PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    keys_p256dh TEXT NOT NULL,
    keys_auth TEXT NOT NULL,
    routine TEXT,
    timezone VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Invites
CREATE TABLE IF NOT EXISTS invites (
    code VARCHAR(64) PRIMARY KEY,
    created_by VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    used_by VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    used_at TIMESTAMPTZ
);

-- 5. One-time Device Links (Mobile Pairing)
CREATE TABLE IF NOT EXISTS device_links (
    code_hash VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

-- 6. Core User Document Store (3-Way Sync Engine)
CREATE TABLE IF NOT EXISTS user_state (
    user_id VARCHAR(64) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    revision INTEGER NOT NULL DEFAULT 0,
    write_id VARCHAR(64),
    write_ids JSONB DEFAULT '[]'::jsonb,
    state JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Normalized Workouts
CREATE TABLE IF NOT EXISTS workouts (
    id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    date VARCHAR(32),
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    duration_sec INTEGER,
    volume_kg NUMERIC(10, 2),
    rpe NUMERIC(4, 1),
    entries JSONB,
    PRIMARY KEY (user_id, id)
);

-- 8. Normalized Routines
CREATE TABLE IF NOT EXISTS routines (
    id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    emoji VARCHAR(32),
    exercises JSONB,
    PRIMARY KEY (user_id, id)
);

-- 9. Normalized Bodyweight Logs
CREATE TABLE IF NOT EXISTS bodyweight_logs (
    id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date VARCHAR(32) NOT NULL,
    weight NUMERIC(6, 2) NOT NULL,
    unit VARCHAR(8) DEFAULT 'kg',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, id)
);

-- 10. Instance App Settings (Secrets, VAPID, Coach Config)
CREATE TABLE IF NOT EXISTS app_settings (
    key VARCHAR(128) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. Federated Identities (Google Sign-In)
CREATE TABLE IF NOT EXISTS federated_identities (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(32) NOT NULL,
    provider_subject VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    email_verified BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_login_at TIMESTAMPTZ DEFAULT NOW(),
    raw_claims JSONB,
    CONSTRAINT uq_provider_subject UNIQUE (provider, provider_subject)
);

-- Indexes for high-performance query execution
CREATE INDEX IF NOT EXISTS idx_passkeys_user_id ON passkeys(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subs_user_id ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_workouts_user_date ON workouts(user_id, date);
CREATE INDEX IF NOT EXISTS idx_bodyweight_user_date ON bodyweight_logs(user_id, date);
CREATE INDEX IF NOT EXISTS idx_routines_user_id ON routines(user_id);
CREATE INDEX IF NOT EXISTS idx_fed_ident_user_id ON federated_identities(user_id);
CREATE INDEX IF NOT EXISTS idx_fed_ident_email ON federated_identities(email);
