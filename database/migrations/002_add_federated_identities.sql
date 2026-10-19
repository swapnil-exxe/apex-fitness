-- APEX Fitness - Migration 002: Federated Identities (Google Sign-In)
-- Supports linking external OAuth/OIDC identity providers to internal user accounts.

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

CREATE INDEX IF NOT EXISTS idx_fed_ident_user_id ON federated_identities(user_id);
CREATE INDEX IF NOT EXISTS idx_fed_ident_email ON federated_identities(email);
