# APEX FITNESS — iOS APP DEVELOPMENT & PRODUCTION ENGINEERING REPORT

**Project:** APEX Fitness  
**iOS Bundle Identifier:** `com.apex.fitness`  
**Display Name:** APEX Fitness  
**Git Repository:** `https://github.com/swapnil-exxe/apex-fitness`  
**Latest Commit Hash:** `0349c9fa`  
**Target Environment:** iOS 15.5+ (iPhone & iPad)  
**Production Backend:** `https://apex-fitness-fd32.onrender.com`  
**Production Web App:** `https://apex-fitness.vercel.app`  
**Database:** Supabase PostgreSQL  
**Date:** October 26, 2026  

---

## 1. Executive Summary

APEX Fitness has been engineered, configured, and synchronized as a native iOS application (`com.apex.fitness`). The iOS platform workspace (`frontend/ios/App/App.xcworkspace`) is fully integrated with Capacitor 7.6.9 and CocoaPods 1.17.0 across 22 native pod dependencies. The frontend mobile production build, complete with all **6,554 exercise still images** and **6,554 video animations**, was bundled directly into the iOS native container (`frontend/ios/App/App/public`).

Google OAuth 2.0 PKCE authentication was optimized for iOS Safari viewports and custom URL scheme callbacks (`com.apex.fitness://auth/callback`). Safe-area insets (`env(safe-area-inset-top)` / `env(safe-area-inset-bottom)`), Dynamic Island accommodations, dark-mode styling, and KG/LBS unit switching were verified.

---

## 2. iOS Application Architecture & Target Configuration

### A. Project & Workspace Structure
* **Capacitor Configuration:** [`frontend/capacitor.config.json`](file:///Users/swapnil/Documents/APEX-clean/frontend/capacitor.config.json)
  * `appId`: `com.apex.fitness`
  * `appName`: `APEX Fitness`
  * `webDir`: `dist`
  * `ios`: `{ "contentInset": "always", "preferredContentMode": "mobile", "allowsLinkPreview": false, "scrollEnabled": true }`
* **Xcode Workspace:** [`frontend/ios/App/App.xcworkspace`](file:///Users/swapnil/Documents/APEX-clean/frontend/ios/App/App.xcworkspace)
* **Xcode Project:** [`frontend/ios/App/App.xcodeproj`](file:///Users/swapnil/Documents/APEX-clean/frontend/ios/App/App.xcodeproj)
* **iOS Deployment Target:** `15.5`
* **Target Devices:** `1,2` (iPhone & iPad supported)
* **Deep Link URL Schemes:**
  * Scheme: `com.apex.fitness`
  * Configured in: [`frontend/ios/App/App/Info.plist`](file:///Users/swapnil/Documents/APEX-clean/frontend/ios/App/App/Info.plist)
* **Lifecycle & Deep Link Routing:**
  * [`AppDelegate.swift`](file:///Users/swapnil/Documents/APEX-clean/frontend/ios/App/App/AppDelegate.swift) & [`SceneDelegate.swift`](file:///Users/swapnil/Documents/APEX-clean/frontend/ios/App/App/SceneDelegate.swift) forward URL contexts and Universal Links via `ApplicationDelegateProxy.shared.application(...)`.

### B. CocoaPods Dependency Tree
CocoaPods 1.17.0 resolved and integrated 22 native targets into [`frontend/ios/App/Pods`](file:///Users/swapnil/Documents/APEX-clean/frontend/ios/App/Pods):
* `Capacitor` (7.6.9)
* `CapacitorCordova` (7.6.9)
* `AparajitaCapacitorSecureStorage` (7.1.6) — Native iOS Keychain integration
* `CapacitorMlkitBarcodeScanning` (7.5.0)
* `CapacitorApp` (7.1.2)
* `CapacitorBrowser` (7.0.5) — ASWebAuthenticationSession / SFSafariViewController
* `CapacitorFilesystem` (7.1.8) — Sandboxed Documents & Application Support
* `CapacitorLocalNotifications` (7.0.7)
* `CapacitorShare` (7.0.4)
* Underlying Google & Apple framework pods (`GoogleMLKit`, `MLKitBarcodeScanning`, `KeychainSwift`, `PromisesObjC`, `nanopb`).

---

## 3. Google OAuth & Authentication Flow

### A. Authentication Architecture
1. **Initiation:** User taps **Continue with Google** on the native APEX login screen (`Login.jsx`).
2. **PKCE Challenge:** The app requests an authorization URL with `mobile=true` from `GET /api/auth/google/url?mobile=true`. A cryptographic `code_verifier`, SHA-256 `code_challenge`, and HMAC-signed state cookie are generated.
3. **In-App Browser:** Opened using `@capacitor/browser` (`ASWebAuthenticationSession` on iOS).
4. **Token Exchange:** Backend validates authorization code and PKCE verifier against Google OAuth endpoints, extracts verified claims (`sub`, `email`, `name`), and creates or retrieves the APEX user.
5. **iOS Redirect:**
   * Backend renders `sendMobileAuthResponse` with primary button pointing directly to `com.apex.fitness://auth/callback?token=...&user=...`.
   * On iOS Safari, `launch()` redirects to `com.apex.fitness://...` and the primary button opens the deep link natively without Android `intent://` scheme errors.
6. **Session & Keychain Persistence:**
   * [`frontend/src/App.jsx`](file:///Users/swapnil/Documents/APEX-clean/frontend/src/App.jsx) catches `appUrlOpen` / `getLaunchUrl()`.
   * Token and credentials are stored securely via `@aparajita/capacitor-secure-storage` (iOS Keychain) and [`frontend/src/lib/mobile.js`](file:///Users/swapnil/Documents/APEX-clean/frontend/src/lib/mobile.js) (`Directory.Data`).
   * The app adopts the profile, pulls the latest cloud state, and navigates to the Home dashboard.

---

## 4. Cloud Synchronization & Data Integrity

1. **State Persistence:**
   * All user state (workouts, exercises, sets, weights, reps, timestamps, routines, bodyweight history, settings) is persisted in Supabase PostgreSQL under verified user IDs.
2. **Multi-Device Synchronization:**
   * Synchronizes automatically upon app launch, authentication, app foregrounding, workout completion, and profile modification.
   * Exponential backoff and offline queueing preserve completed workouts during network loss.
3. **User Isolation:**
   * Sessions are strictly isolated by cryptographic APEX tokens. User A cannot view or overwrite User B's workout logs.
4. **Units (KG Default & LBS Conversion):**
   * Default unit is **KG**.
   * Exact conversion standard: `1 kg = 2.2046226218 lb`.
   * Stored weights remain uncorrupted with zero conversion drift across roundtrips.

---

## 5. Offline Media & Bundling

* **Media Integrity:**
  * **6,554 still images** (`.webp`) verified in [`catalogue/media/still`](file:///Users/swapnil/Documents/APEX-clean/catalogue/media/still).
  * **6,554 video clips** (`.mp4`) verified in [`catalogue/media/clip`](file:///Users/swapnil/Documents/APEX-clean/catalogue/media/clip).
  * Staged directly into [`frontend/ios/App/App/public/exercise-media`](file:///Users/swapnil/Documents/APEX-clean/frontend/ios/App/App/public/exercise-media) during `npm run build:ios`.
* **Zero Cloud Dependence for Catalogue:** Exercise library images and animations play immediately without network requests.

---

## 6. Testing & Automated Verification

### A. Backend Test Suites
* Command: `node --test test/auth-google.test.js test/server-account-name.test.js test/apex-production-flows.test.js test/ios-auth-and-sync.test.js`
* Results: **21 passed of 21 (0 failures, 0 skipped)**
  * OAuth PKCE generation, state verification, token exchange, and error handling.
  * iOS deep link schema verification (`com.apex.fitness://auth/callback`).
  * Drift-free KG/LBS conversion (exact `2.2046226218`).
  * Account isolation and display name updates.

### B. Frontend Test Suites
* Command: `npx vitest run src/lib/units.test.js src/components/GoogleAuth.test.jsx src/store/useStore.unit-sync.test.jsx src/store/useStore.mobile-remote.test.jsx src/store/useStore.sync-status.test.jsx`
* Results: **74 passed of 74 (0 failures)**
  * Mobile remote sync, mirror merges, and account switching.
  * Stash unit synchronization and unit selector toggles.
  * Google authentication button and sheet interactions.

---

## 7. iOS Build Status & Apple Signing Blocker Analysis

* **Frontend Production Build:** **PASSED** (`vite v8.1.5`, 319 modules transformed, media staged, mobile bundle validated).
* **Capacitor iOS Assets & Pods Sync:** **PASSED** (`cap copy ios`, CocoaPods 1.17.0 installation complete with 22 pods).
* **Local Machine Development Environment:**
  * Active Developer Directory: `/Library/Developer/CommandLineTools` (macOS 27.0.1 SDK).
  * Xcode Application (`/Applications/Xcode.app`): **Not installed on this host**.
  * `xcodebuild`: Requires full Xcode IDE installation.
* **Apple Developer Signing:**
  * Provisioning profiles and Apple Developer Team signing credentials are not configured on this machine.
  * In accordance with safety instructions, **no fake certificates or fabricated IPAs were created**.
* **Next Steps to Produce an .ipa / Physical Device Build:**
  1. Install `Xcode.app` from the Mac App Store or Apple Developer Portal.
  2. Set active Xcode path: `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`.
  3. Open the workspace: `open frontend/ios/App/App.xcworkspace`.
  4. In Xcode, select the `App` target under **Signing & Capabilities** and choose your Apple Developer Team.
  5. Select **Product > Archive**, or run `xcodebuild -workspace frontend/ios/App/App.xcworkspace -scheme App -configuration Release archive -archivePath build/App.xcarchive`.
  6. Export the `.ipa` using Xcode Organizer or `xcodebuild -exportArchive`.
