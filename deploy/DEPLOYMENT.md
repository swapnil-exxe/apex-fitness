# APEX Fitness — Production Deployment Guide

This guide describes how to deploy the full-stack APEX Fitness application (Frontend, Backend, and PostgreSQL database) to production environments.

---

## Architecture Overview

```
                      +-----------------------------+
                      |         Web / Mobile        |
                      |  (React/Vite, iOS, Android) |
                      +--------------+--------------+
                                     |
                                     | HTTPS / WSS
                                     v
                      +-----------------------------+
                      |     Nginx Reverse Proxy     |
                      |   (Static Frontend Assets)  |
                      +--------------+--------------+
                                     |
                                     | Proxy: /api -> :3000
                                     v
                      +-----------------------------+
                      |      Node.js Backend        |
                      | (Passkeys, 3-Way Sync, API) |
                      +--------------+--------------+
                                     |
                                     | Connection Pooler (SSL)
                                     v
                      +-----------------------------+
                      |     Supabase / PostgreSQL   |
                      |  (Normalized & State Store) |
                      +-----------------------------+
```

---

## 1. Database Setup (Supabase PostgreSQL)

### 1.1 Provisioning & Connection String
1. In your Supabase Dashboard, create a project (e.g. `apex-fitness`).
2. Navigate to **Project Settings** -> **Database**.
3. Under **Connection Pooling**, locate the pooler connection string (IPv4 compatible):
   - **Host**: `aws-0-<region>.pooler.supabase.com`
   - **Port**: `5432` (Session mode) or `6543` (Transaction mode)
   - **Database**: `postgres`
   - **User**: `postgres.<project_ref>`
   - **Password**: `<your-db-password>`
   - Format: `postgresql://postgres.<project_ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres`

### 1.2 Applying Schema
Run the schema definition script against your PostgreSQL instance:
```bash
psql "$DATABASE_URL" -f database/schema.sql
```

### 1.3 Migrating Existing JSON Data
If upgrading an existing instance with file-based data (`/data/db.json` and `state-*.json`):
```bash
DATABASE_URL="$DATABASE_URL" node database/migrate-from-json.mjs
```

---

## 2. Docker Compose Deployment (Recommended for VPS / Self-Hosting)

### 2.1 Configuration
Create a `.env` file in the project root:
```ini
# Application Domain
ORIGIN=https://gym.example.com
RP_ID=gym.example.com
RP_NAME=APEX Fitness

# Database
DATABASE_URL=postgresql://postgres.<project_ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres

# Ports
WEB_PORT=8080
PORT=3000

# Authentication
FIRST_USER_ADMIN=1
ALLOW_GUEST=1
```

### 2.2 Launching Application
```bash
docker compose up -d --build
```

### 2.3 Validating Health
```bash
curl -f http://localhost:8080/api/health
```
Expected response:
```json
{"ok":true,"users":1,"writable":true}
```

---

## 3. Cloud Deployment (Render.com)

1. Connect your GitHub repository to Render.
2. Select **Blueprints** -> **New Blueprint Instance**.
3. Point to `deploy/render.yaml`.
4. Configure the environment variables:
   - `DATABASE_URL`: Your Supabase PostgreSQL connection string.
   - `RP_ID`: Your Render backend or custom domain.
   - `ORIGIN`: The public HTTPS URL of your frontend.
5. Click **Apply**. Both backend and frontend services will deploy automatically.

---

## 4. Google Sign-In & Federated Identity Configuration

APEX Fitness supports Google OAuth 2.0 / OpenID Connect with PKCE, cryptographic state verification, and safe account-linking.

### 4.1 Google Cloud Console Setup
1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Navigate to **APIs & Services** -> **Credentials**.
3. Create an **OAuth 2.0 Client ID** with Application Type **Web application**.
4. Configure **Authorized JavaScript origins**:
   - Production web: `https://apex-fitness.vercel.app` (or your custom domain)
   - Local dev web: `http://localhost:5173`
   - Local Docker web: `http://localhost:8080`
5. Configure **Authorized redirect URIs**:
   - Production backend: `https://apex-fitness-api.onrender.com/api/auth/google/callback`
   - Local Docker: `http://localhost:8080/api/auth/google/callback`
   - Local dev backend: `http://localhost:3000/api/auth/google/callback`
6. Copy the **Client ID** and **Client Secret**.

### 4.2 Environment Variables (Render / Docker)
Set these variables on your backend service:
- `GOOGLE_CLIENT_ID`: Google OAuth Client ID.
- `GOOGLE_CLIENT_SECRET`: Google OAuth Client Secret.
- `GOOGLE_REDIRECT_URI`: Exact redirect URI configured in Google Console (e.g. `https://apex-fitness-api.onrender.com/api/auth/google/callback`).
- `FRONTEND_URL`: Public HTTPS URL of the web frontend (e.g. `https://apex-fitness.vercel.app`).

### 4.3 Mobile Deep Linking (iOS & Android)
The mobile app registers custom URL scheme `com.apex.fitness://` in `Info.plist` (iOS) and Android manifest.
When an athlete signs in or links accounts via mobile, the backend redirects to `com.apex.fitness://auth/callback#token=...` or `com.apex.fitness://auth/link#challenge=...`, which automatically resumes the mobile session.

---

## 5. Mobile Apps (iOS & Android)

Before building mobile bundles:
1. Deploy the backend API to a public HTTPS domain.
2. Set the `API_ORIGIN` in `frontend/src/lib/api.js` or environment:
   ```bash
   API_ORIGIN=https://gym.example.com
   ```
3. Sync Capacitor assets:
   ```bash
   cd frontend
   npm run build:mobile
   ```
4. For iOS:
   - Use Xcode or GitHub Actions (`.github/workflows/ios-build.yml`) to compile and archive the build.
   - Verify bundle identifier: `com.apex.fitness`.
   - Verify display name: `APEX Fitness`.

---

## 6. Security & Maintenance

- **Backups**: Run automated daily pg_dump backups or use Supabase automated backups.
- **Passkeys (WebAuthn)**: Always ensure `RP_ID` and `ORIGIN` match the exact domain athletes visit in their browsers.
- **Account Linking**: APEX never silently links accounts. If a Google account matches an existing password/passkey user, the user must provide step-up proof of password or passkey.
- **Secrets**: Never commit `.env`, private keys, or signing certificates to Git.

