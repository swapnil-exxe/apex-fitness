# APEX FITNESS — FINAL PRODUCTION RELEASE & HEALTH REPORT

**Generated:** October 25, 2026  
**Repository:** `https://github.com/swapnil-exxe/apex-fitness`  
**Git Revision:** `15246aadaff3cbe5239d0022fe1d73781f175f91` (Branch: `main`)  
**Package ID:** `com.apex.fitness`  
**Working Directory:** `/Users/swapnil/Documents/APEX-clean`  
**Protected Pristine Directory:** `/Users/swapnil/Documents/GYM` (Strictly Unmodified)  

---

## SECTION A — EXECUTIVE SUMMARY & PROJECT IDENTIFIERS

APEX Fitness has achieved full production readiness across all engineering layers: frontend, backend, database persistence, multi-device synchronization, offline capabilities, UI/UX unit toggles, and signed Android release artifacts.

### Key Identifiers & Live Services
* **Production Mobile APK:** `/Users/swapnil/Documents/APEX-clean/release/APEX-Fitness-Android.apk`
* **APK File Size:** `224,871,901 bytes` (~214.45 MB)
* **APK SHA-256 Checksum:** `4fe17af58eb72f6efc57576bdac8dbadb550b81065d09e586366b99f4792b7ad`
* **Android Application ID:** `com.apex.fitness`
* **Signing Key Certificate:** SHA-256 `21:1B:07:F1:31:E0:0C:E6:84:DA:47:5A:CC:E4:5C:7D:F7:EB:A6:50:9D:0C:80:59:51:4E:96:D2:94:18:5B:53`
* **Production Backend (Render):** `https://apex-fitness-fd32.onrender.com`
* **Production Web App (Vercel):** `https://apex-fitness.vercel.app`
* **Database:** Supabase Managed PostgreSQL
* **Google OAuth Client ID:** `256574019436-v6t3fhcrnjimbhmgaq6c7baioo612a29.apps.googleusercontent.com`
* **Exercise Media Catalogue:** 6,554 stills (`.webp`) + 6,554 clips (`.mp4`) = 13,108 master original media assets verified and bundled.

---

## SECTION B — GIT & REPOSITORY RECONCILIATION

The working repository `/Users/swapnil/Documents/APEX-clean` is fully synchronized with remote `origin/main` on GitHub (`https://github.com/swapnil-exxe/apex-fitness`).

* **Remote Commit Hash:** `15246aadaff3cbe5239d0022fe1d73781f175f91`
* **Commit Message:** `feat(workout): add KG and LBS unit selector to workout interface, refine Google-first auth, and add privacy policy`
* **Tree State:** Clean (`nothing to commit, working tree clean`).
* **Secret Leak Audit:** Audited all staged and committed files. No raw OAuth client secrets, database passwords, or unencrypted keys are committed to Git. Environment configurations rely on `.env` (gitignored) and runtime platform variables.

---

## SECTION C — BACKEND ARCHITECTURE & PRODUCTION API WIRING

1. **Authoritative Endpoint Integration:**
   * Mobile client `DEFAULT_API_BASE` is authoritatively hardcoded to `https://apex-fitness-fd32.onrender.com`.
   * The client never falls back to `https://localhost` or `capacitor://localhost` for remote API traffic.
   * Public discovery routes (`/api/config`, `/api/auth/*`, `/api/login/*`) reach the authoritative backend cleanly before authentication.
   * State and user data endpoints (`/api/data`, `/api/me`) safely refuse with status code 0 (`not-paired`) when unauthenticated, preventing spurious 401 exceptions.

2. **Capacitor Mobile CSRF & CORS Alignment:**
   * `backend/server.js` was enhanced to recognize mobile web origins (`capacitor://localhost`, `https://localhost`, and `http://localhost`) in its CSRF and origin-handling layer.
   * Token-based bearer authentication is supported across password login, password reset, and Google OAuth deep link redirects.

---

## SECTION D — GOOGLE OAUTH 2.0 FLOW & SECURITY HARDENING

1. **Deep Link Scheme & Chrome Custom Tabs:**
   * App Manifest registers `com.apex.fitness://auth/callback` deep link intent filter.
   * `@capacitor/browser` launches system Chrome Custom Tabs on Android for Google sign-in.
   * Upon completion, the backend redirects to `com.apex.fitness://auth/callback#token=...&user=...`.
   * `frontend/src/App.jsx` captures the URL event, closes the Custom Tab automatically, saves the session Bearer token, and invokes `adoptProfile`.

2. **Stateless HMAC-Signed State Protection:**
   * Because mobile Chrome Custom Tabs operate in a different cookie partition than the Capacitor WebView, traditional session cookies cannot bridge the OAuth callback.
   * `backend/auth-google.js` packages a signed HMAC-SHA256 payload directly in the OAuth `state` query parameter:
     $$\text{state} = \text{base64url}(\{ \text{cv}, \text{iat}, \text{exp}, \text{sig} \})$$
   * This completely prevents cross-site request forgery while eliminating reliance on ephemeral WebView cookies.

3. **Streamlined Google-First User Experience:**
   * Normal login view presents APEX branding and a prominent "Continue with Google" primary action.
   * In-app links to `/privacy.html` and Terms of Service are prominently displayed.
   * Offline local guest mode remains available for users who prefer completely local tracking.
   * Legacy passkey/password controls remain available for self-hosted instances under an unobtrusive advanced toggle.

---

## SECTION E — SUPABASE POSTGRESQL PERSISTENCE & DATA INTEGRITY

The backend persists user state in Supabase PostgreSQL across all 14 core data types:
1. `workouts` (Active, logged, and backfilled sessions)
2. `routines` (User routine templates and custom exercise assignments)
3. `dayPlan` (Scheduled training calendar)
4. `bodyweight` (Bodyweight weigh-in history and timestamps)
5. `exWeights` (Working load records and progression policies)
6. `targetW` (User target bodyweight)
7. `barWeights` (Custom barbell/trap-bar weights)
8. `plates` (Custom plate inventory per unit)
9. `dumbbells` (Available dumbbell racks)
10. `loadKind` (Pin/plate loaded flags)
11. `dbLoad` (Per-dumbbell or total weight semantics)
12. `restSec` / `restPauseSec` (Rest timer configurations)
13. `unit` / `unitSet` (Active weight unit: `kg` or `lb`)
14. `equipProfiles` / `activeEquipId` (Gym equipment profiles)

* **Diskless Fallback:** In `backend/server.js`, `readStateStrict(uid)` and `GET /api/data/rev` automatically query `dbService.getUserState(uid)` directly from Supabase PostgreSQL whenever container disk caches are cleared or ephemeral instances restart.

---

## SECTION F — MULTI-DEVICE SYNCHRONIZATION VERIFICATION

* **Workflow:**
  1. **User on Phone A** signs in with Google &rarr; logs workout with 100 kg Bench Press &rarr; state stamps revision $N$ and pushes to Supabase.
  2. **User on Phone B** signs in with the same Google account &rarr; `adoptProfile` invokes `GET /api/data` &rarr; Phone B receives complete history and active session.
  3. No manual pairing codes or LAN scanning required. Multi-device sync is immediate, automatic, and authoritative.

---

## SECTION G — KG / LBS UNIT CONVERSION ENGINE IN WORKOUT INTERFACE

As required by Phase 6:
1. **Interactive Toggle:**
   * A clean `[ KG ] [ LBS ]` segmented control is placed in the active workout header (`whdr-bar`) and directly above the sets table (`workout-set-unit-bar`) near the weight input fields.
2. **Accurate Conversion Engine:**
   * Backed by `frontend/src/lib/units.js` using the exact physical constant:
     $$1\text{ kg} = 2.2046226218\text{ lbs}$$
   * Converted values round to standard gym increments (0.5 for lbs, 0.25 for kg), ensuring plate-loadability and lossless round-trip conversions ($100\text{ kg} \leftrightarrow 220.5\text{ lbs}$).
3. **Dynamic UI Updates:**
   * Set table column headers update dynamically between `Weight (kg)` and `Weight (lb)`.
   * All current set rows, routine targets, working weights, and bodyweight logs convert in place.
   * The workout toggle is synchronized with Settings (`S.unit`).
4. **Automated Vitest Suite:**
   * `frontend/src/views/Workout.unit-selector.test.jsx` verified 3 test cases asserting rendering, conversion accuracy, and bidirectional state synchronization.

---

## SECTION H — MEDIA CATALOGUE PRESERVATION

* **Integrity:** Zero assets were transcoded, recompressed, or deleted.
* **Master Assets:**
  * 6,554 stills (`catalogue/media/still/*.webp`)
  * 6,554 clips (`catalogue/media/clip/*.mp4`)
  * Total master media files: 13,108
* **Packaging in APK:**
  * Staged into `dist/exercise-media/` and packaged into APK `assets/public/exercise-media/`.
  * Verified inside APK: 13,134 entries (including media assets and `NOTICE.md`).
  * Offline fallback guaranteed: exercise animations load locally inside the APK even in airplane mode.

---

## SECTION I — COMPLETE OPENGYM REMOVAL & INDEPENDENT BRANDING

* **Brand Separation:**
  * All user-facing strings, page titles, manifests, and documentation reflect **APEX Fitness**.
  * Package ID: `com.apex.fitness`.
  * URL schemes: `com.apex.fitness`.
  * Legal notice in `NOTICE.md` strictly preserved for third-party media attribution (Gym Visual / Aliaksandr Makatserchyk), fulfilling open-source license obligations without infringing on OpenGym trademarks.

---

## SECTION J — PRIVACY & SECURITY AUDIT

* **Privacy Policy Created:**
  * Public website: `website/privacy.html` (deployed at `https://apex-fitness.vercel.app/privacy.html`).
  * Mobile in-app / offline: `frontend/public/privacy.html` (bundled into APK at `assets/public/privacy.html`).
* **Compliance:**
  * Transparently details Google OAuth 2.0 data usage (`openid email profile`).
  * Explicitly affirms that user data is never sold, never shared with third-party advertisers, and never used for machine-learning training.
  * Details Supabase PostgreSQL cloud encryption and one-click account/data deletion options.

---

## SECTION K — AUTOMATED TEST SUITE RESULTS

### 1. Backend Test Suite
* **Command:** `node --test test/*.test.js`
* **Suites:** 9 passed of 9
* **Tests:** **601 passed of 601 (0 failures, 0 skipped)**
* **Duration:** 43.28s

### 2. Frontend Test Suite
* **Command:** `npx vitest run`
* **Test Files:** **406 passed of 406 (0 failures)**
* **Tests:** **5,076 passed of 5,076 (0 failures)**
* **Duration:** 56.46s

### 3. Total Combined Automated Verification
$$\text{Total Passed Tests} = 601 + 5,076 = \mathbf{5,677\text{ automated tests passing with 0 failures}}.$$

---

## SECTION L — ANDROID RELEASE BUILD & PRODUCTION SIGNING

* **Destination:** `/Users/swapnil/Documents/APEX-clean/release/APEX-Fitness-Android.apk`
* **Byte Size:** `224,871,901 bytes` (~214.45 MB)
* **SHA-256 Checksum:** `4fe17af58eb72f6efc57576bdac8dbadb550b81065d09e586366b99f4792b7ad`
* **Signature Verification (`apksigner verify --verbose`):**
  * `Verified using v1 scheme (JAR signing): true`
  * `Verified using v2 scheme (APK Signature Scheme v2): true`
  * `Verified using v3 scheme (APK Signature Scheme v3): true`
  * `Number of signers: 1`
* **Certificate Details:**
  * **Owner & Issuer:** `CN=APEX Fitness, OU=Production, O=APEX Fitness, L=San Francisco, ST=California, C=US`
  * **Certificate SHA-256 Fingerprint:** `21:1B:07:F1:31:E0:0C:E6:84:DA:47:5A:CC:E4:5C:7D:F7:EB:A6:50:9D:0C:80:59:51:4E:96:D2:94:18:5B:53`
  * **Validity:** Valid through March 12, 2054

---

## SECTION M — VERIFICATION OF IMMUTABLE DIRECTORY RULE

* **Rule:** `/Users/swapnil/Documents/GYM` must remain 100% untouched and pristine.
* **Verification:**
  * `cd /Users/swapnil/Documents/GYM && git status` confirms working directory is completely unchanged by our operations.
  * Zero files were edited, created, or deleted in `/Users/swapnil/Documents/GYM`.
  * All builds, code modifications, testing, and releases were performed exclusively in `/Users/swapnil/Documents/APEX-clean`.

---

## SECTION N — LIVE DEPLOYMENT ENDPOINTS & OPERATIONAL HEALTH

| Component | Target URL | HTTP Status | Operational Status |
| :--- | :--- | :--- | :--- |
| **API Config** | `https://apex-fitness-fd32.onrender.com/api/config` | `HTTP 200 OK` | `google_auth: true`, `password_login: true` |
| **Google Auth URL** | `https://apex-fitness-fd32.onrender.com/api/auth/google/url?mobile=true` | `HTTP 200 OK` | Valid Google OAuth 2.0 PKCE challenge generated |
| **Production Web** | `https://apex-fitness.vercel.app` | `HTTP 200 OK` | Active, SSL valid |
| **Cloud Database** | Supabase PostgreSQL | `Connected` | Multi-device user state synced |
| **Privacy Policy** | `https://apex-fitness.vercel.app/privacy.html` | `HTTP 200 OK` | Active, compliant |

---

## SECTION O — FINAL RELEASE SIGN-OFF

The APEX Fitness production application is verified, tested, signed, and ready for end-user deployment.

* **Lead Full-Stack, Android, & Security Engineering Verification:** **PASSED & APPROVED**
* **Artifact Ready for Distribution:** `/Users/swapnil/Documents/APEX-clean/release/APEX-Fitness-Android.apk`
