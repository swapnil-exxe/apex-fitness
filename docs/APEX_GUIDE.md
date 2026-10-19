# APEX — High-Performance Fitness Platform
## Comprehensive Architecture, Operation & Build Guide

APEX is a self-hosted, privacy-first fitness and bodyweight tracking platform designed for high performance, structured progressive overload, and complete data ownership.

---

## 1. Product & Architecture Overview

* **Frontend**: React 19, Vite, Zustand store, React Router, custom CSS design system.
* **Backend**: Node.js (`node:http`, zero framework), `@simplewebauthn/server` for passkeys, `web-push` for notifications.
* **Storage**: Atomic JSON persistence (`./data/db.json` and `./data/state-<uid>.json`).
* **Container Orchestration**: Docker Compose with Nginx reverse proxy (`web`) and backend service (`api`).
* **Mobile Shells**: Capacitor 7 native applications for Android and iOS.

### Centralized Branding

All branding metadata is centralized in [`frontend/src/config/brand.js`](file:///Users/swapnil/Documents/GYM/frontend/src/config/brand.js):
```javascript
export const BRAND = {
  name: 'APEX',
  tagline: 'High-Performance Gym & Bodyweight Tracker',
  legalName: 'APEX Fitness',
  version: '1.4.1',
  websiteUrl: 'https://github.com/swapnil-exxe/apex-fitness',
  ...
}
```
To rename the product in the future, simply update this configuration file and rebuild the assets.

---

## 2. Web Deployment (Production)

### Prerequisites
* A server/VPS with Docker and Docker Compose installed (e.g. Ubuntu, Debian, macOS).
* A domain or subdomain with TLS/HTTPS (e.g. `gym.yourdomain.com`).
* Persistent volume mapped to `./data`.

### Environment Configuration (`.env`)
```bash
# Production Hostname & Passkey Binding
RP_ID=gym.yourdomain.com
ORIGIN=https://gym.yourdomain.com
WEB_PORT=8080
RP_NAME=APEX

# Administration
FIRST_USER_ADMIN=1
ADMIN_UIDS=7CvFI1XoGG3MOzLG
INVITE_ONLY=0
ALLOW_GUEST=1
```

### Running in Production
```bash
docker compose up -d --build
```
> [!IMPORTANT]
> Passkeys require HTTPS (except on `localhost`). Ensure your reverse proxy (Caddy, Traefik, Nginx, or Cloudflare Tunnel) terminates TLS and forwards headers (`X-Forwarded-For`, `X-Forwarded-Proto`) to port `8080`.

---

## 3. Administration & Data Ownership

### Admin Controls
* Admin dashboard is accessible in **Settings → Account → Admin dashboard**.
* Admin privileges are enforced server-side in `api/server.js`:
  1. Setting `FIRST_USER_ADMIN=1` grants admin to the first registered profile.
  2. Setting `ADMIN_UIDS=<user-id>` in `.env` grants persistent admin access to specified accounts.
  3. Setting `"admin": true` directly on the user object in `data/db.json`.

### Backup and Restore
All user accounts, credentials, workout histories, and custom exercises live in `./data`:
* **Backup**:
  ```bash
  tar -czvf apex-backup-$(date +%F).tar.gz ./data
  ```
* **Restore**:
  ```bash
  docker compose down
  tar -xzvf apex-backup-YYYY-MM-DD.tar.gz
  docker compose up -d
  ```

---

## 4. Android Build & Distribution

### Toolchain
* Java: OpenJDK 21 LTS (`/opt/homebrew/opt/openjdk@21`)
* Android SDK: Android 35 (`platforms;android-35`, `build-tools;35.0.0`)
* Package ID: `com.apex.fitness`

### Generated Deliverables
* **Debug APK**: [`builds/APEX-debug.apk`](file:///Users/swapnil/Documents/GYM/builds/APEX-debug.apk) (35 MB, package `com.apex.fitness.test`)
* **Signed Release APK**: [`builds/APEX-v1.4.1-release.apk`](file:///Users/swapnil/Documents/GYM/builds/APEX-v1.4.1-release.apk) (19 MB, package `com.apex.fitness`)

### Building from Source
```bash
cd frontend
npm run build
npx cap sync android

export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
export BUILD_TOOLS=$ANDROID_HOME/build-tools/35.0.0

cd android
./gradlew assembleRelease
cd ../..

# Align & Sign
$BUILD_TOOLS/zipalign -f -p 4 frontend/android/app/build/outputs/apk/release/app-release-unsigned.apk builds/APEX-aligned.apk
$BUILD_TOOLS/apksigner sign --ks builds/apex-release.keystore --ks-key-alias apexkey --out builds/APEX-v1.4.1-release.apk builds/APEX-aligned.apk
```

---

## 5. iOS / iPadOS Application

### Status & Toolchain Requirements
* **Bundle Identifier**: `com.apex.fitness`
* **Display Name**: `APEX`
* **Configured Files**: [`frontend/ios/App/App/Info.plist`](file:///Users/swapnil/Documents/GYM/frontend/ios/App/App/Info.plist), [`project.pbxproj`](file:///Users/swapnil/Documents/GYM/frontend/ios/App/App.xcodeproj/project.pbxproj), [`Assets.xcassets`](file:///Users/swapnil/Documents/GYM/frontend/ios/App/App/Assets.xcassets)
* **Toolchain Dependency**: Full `Xcode.app` is required to compile iOS binaries and export `.ipa` files (`CommandLineTools` alone does not bundle the iOS SDK).

### Distribution Paths for iOS
1. **PWA (Zero-Config, Recommended)**:
   Open the production website in Safari on iPhone/iPad → Tap **Share** → **Add to Home Screen**. Operates full-screen with offline storage and native feel.
2. **Xcode Free Signing (Sideload)**:
   Install Xcode from the Mac App Store → Open `frontend/ios/App` → Select your Personal Team under Signing & Capabilities → Run directly onto your connected iPhone/iPad (valid for 7 days per free Apple ID).
3. **AltStore / Sideloadly**:
   Sign the exported unsigned build automatically over local Wi-Fi.
4. **App Store / TestFlight**:
   Requires paid Apple Developer Program ($99/year), Apple Distribution Certificate, and App Store Provisioning Profile.

---

## 6. Training Features & V-Taper Split

APEX includes a built-in 6-day hypertrophy routine configured in [`frontend/src/lib/starter.js`](file:///Users/swapnil/Documents/GYM/frontend/src/lib/starter.js):
* **Day 1 (Mon)**: APEX Push A (Chest & Delts Focus)
* **Day 2 (Tue)**: APEX Pull A (Lats & V-Taper Width Focus)
* **Day 3 (Wed)**: APEX Legs A (Quad & Lower Body Focus)
* **Day 4 (Thu)**: APEX Push B (Upper Chest & Shoulder Hypertrophy)
* **Day 5 (Fri)**: APEX Pull B (Upper Back Thickness & Arm Development)
* **Day 6 (Sat)**: APEX Legs B (Posterior Chain & Hamstring Focus)
* **Day 7 (Sun)**: Active Recovery & Rest

All routines are fully editable, support progressive overload policies (linear, double progression, Greyskull LP), and adapt to available gym equipment.

---

## 7. Legal & Licensing Notices

* APEX application code is derived from openGym and licensed under **GNU AGPL-3.0**.
* Attribution to the original author Duarte Santos and the upstream repository is preserved in [`frontend/src/views/Settings.jsx`](file:///Users/swapnil/Documents/GYM/frontend/src/views/Settings.jsx) and [`NOTICE.md`](file:///Users/swapnil/Documents/GYM/NOTICE.md).
* Exercise animation assets remain copyright © Aliaksandr Makatserchyk ([Gym visual](https://gymvisual.com/)).
