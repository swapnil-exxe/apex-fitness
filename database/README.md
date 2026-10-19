# APEX Fitness - Database Documentation

## Architecture Overview

APEX Fitness utilizes a hybrid persistence architecture designed for high performance, zero data loss, and seamless offline-first synchronization:

1. **Document Sync Layer (`user_state` table)**:
   - Preserves the full JSON state document for each user.
   - Powers the 3-way conflict resolution engine (`_rev`, `_ts`, `_wid`, `_wids`).
   - Ensures mobile devices (iOS/Android) and web clients sync offline and online changes without schema constraints blocking user workouts.

2. **Normalized Relational Layer**:
   - Asynchronously ingests normalized records from the user state document into relational tables:
     - `users`: User profiles, credentials, role (admin/member), session version.
     - `passkeys`: WebAuthn credentials, public keys, counters, transports.
     - `workouts`: Completed sessions with duration, volume, RPE, and exercise entries.
     - `routines`: Custom and standard workout templates with exercises and metadata.
     - `bodyweight_logs`: Bodyweight weigh-ins for trend analysis and coaching metrics.
     - `push_subscriptions`: Web push endpoints and VAPID keys for workout reminders and nudges.
     - `invites`: Instance invitation codes for invite-only deployments.
     - `device_links`: Temporary hashed pairing codes for cross-device sign-in.
     - `app_settings`: Server instance configuration (secrets, keys).

3. **In-Memory & Local Cache**:
   - The Node.js backend maintains an ultra-fast in-memory/cached state for instant sub-millisecond route responses.
   - At startup, the server automatically hydrates state from PostgreSQL if `DATABASE_URL` is configured.

---

## Schema Reference

The database schema is defined in [`database/schema.sql`](./schema.sql).

### Key Tables
- `users`: Primary key `id` (VARCHAR(64)), unique `email`, `password_hash`, `is_admin`.
- `passkeys`: Primary key `id` (VARCHAR(255)), foreign key `user_id` referencing `users(id)`.
- `user_state`: Primary key `user_id`, stores `revision`, `write_id`, `state` (JSONB).
- `workouts`: Composite primary key `(user_id, id)`, date, duration, volume, entries.
- `routines`: Composite primary key `(user_id, id)`, name, emoji, exercises (JSONB).
- `bodyweight_logs`: Composite primary key `(user_id, id)`, date, weight, unit.
- `app_settings`: Key-value store for instance secrets (`instance_secret`, `vapid_keys`).
- `federated_identities`: Linked OAuth/OIDC identities (Google Sign-In) with `provider`, `provider_subject`, `email`, and `raw_claims`.

---

## Migration Procedures

### Applying Schema to PostgreSQL / Supabase
To apply the initial schema to a fresh PostgreSQL database:

```bash
psql "$DATABASE_URL" -f database/schema.sql
```

### Migrating Existing JSON Files to PostgreSQL
If migrating an existing instance running on local JSON file storage (`/data/db.json` and `/data/state-*.json`):

```bash
DATABASE_URL="your_postgres_connection_string" node database/migrate-from-json.mjs
```

The script will:
1. Validate database connectivity.
2. Read all existing users, passkeys, web push subscriptions, invites, and device links from `db.json` and insert/update them into PostgreSQL.
3. Read all `state-<userId>.json` files, save the documents to `user_state`, and asynchronously populate the normalized `workouts`, `routines`, and `bodyweight_logs` tables.
4. Securely store the server instance secret and VAPID push keys into `app_settings`.
5. Output a complete migration summary.

---

## Supabase Connection Guide

When connecting to Supabase:
- Direct connections to `db.<project>.supabase.co:5432` use IPv6.
- In networks without IPv6 routing, use the Supabase IPv4 connection pooler (Supavisor):
  - Host: `aws-0-<region>.pooler.supabase.com`
  - Port: `5432` (Session mode) or `6543` (Transaction mode)
  - User: `postgres.<project_ref>`
  - Database: `postgres`
  - Example: `postgresql://postgres.jlhehdaeryaynbtsftul:PASSWORD@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`
