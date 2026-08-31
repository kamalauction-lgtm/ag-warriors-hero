# IQI AG Hero → Google Play Store (TWA)

The app is already a full PWA (manifest + maskable icons + service worker).
Publishing to Play uses a **Trusted Web Activity** — a thin Android wrapper
around https://hero.iqiaggroup.com. One-time cost: **USD 25** (Play developer
account). No app rewrite.

## Prerequisites (Kamal)
1. Google Play Console account — https://play.google.com/console ($25 one-time)
2. Node.js on any machine (already have)

## Build steps (run in any empty folder)

```bash
npm i -g @bubblewrap/cli
bubblewrap init --manifest https://hero.iqiaggroup.com/manifest.webmanifest
```
Answer the prompts:
- **Domain**: hero.iqiaggroup.com
- **App name**: IQI AG Warriors · **Short name**: AG Hero
- **Package id**: `com.iqiaggroup.hero`
- **Signing key**: let Bubblewrap create one — SAVE the keystore file + passwords
  somewhere safe (losing it = cannot update the app, ever)
- Everything else: accept defaults (it downloads JDK/Android SDK itself)

```bash
bubblewrap build
```
Output: `app-release-signed.aab` — this is what you upload to Play Console.

## Digital Asset Links (removes the browser bar)
After the first upload, Play Console → **Setup → App signing** shows a
**SHA-256 certificate fingerprint**. Give that fingerprint to Claude — a file
must be served at:

```
https://hero.iqiaggroup.com/.well-known/assetlinks.json
```

containing:
```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.iqiaggroup.hero",
    "sha256_cert_fingerprints": ["REPLACE_WITH_PLAY_SHA256"]
  }
}]
```
(Claude adds it to `app/public/.well-known/` and deploys — 2 minutes.)

## Play Console listing checklist
- App name: IQI AG Warriors
- Privacy policy URL: **https://hero.iqiaggroup.com/privacy** ✅ (live)
- Category: Business · Contains ads: No · Target audience: 18+
- Data safety form: collects name/email/phone (account), app activity
  (app functionality), not shared for advertising, data encrypted in transit,
  deletion on request via reply@iqiaggroup.com
- App access: provide a **test login** (create a demo agent account for Google
  reviewers — ask Claude to provision one when submitting)
- Internal testing track first → then Production review (usually 1-7 days)

## iOS note
No TWA equivalent — iPhone users keep "Add to Home Screen" (already excellent
as a PWA). A paid Apple Developer route (PWA wrapper) is possible later.
