# ACAPS Experts — Android app

A native Android app for the expert side. It shows the live expert app
(`https://data-peaks-expert.onrender.com`) full screen, so every expert feature is the same as on
the web: email sign-in, questions, blind answers and revision, group view, globe, profile, track record.

**Install:** copy `release/ACAPS-Experts.apk` to the phone, open it and allow "Install unknown apps"
for the app you opened it with (Files, Chrome, Gmail…). Android 8.0 or newer.

## How sign-in works in the app

1. Open the app, enter the email ACAPS invited, tap *Email me a sign-in link*.
2. Tap the link in the email. It opens in the app, which then remembers you (Profile → Sign out forgets it).
   - Opening links in the app needs `expert-app/public/.well-known/assetlinks.json` to be **deployed**
     (it holds this app's signing fingerprint). Until then, or if the link opens in the browser anyway,
     go to the phone's *Settings → Apps → ACAPS Experts → Open by default → Add link* and tick the
     site, or copy the link and paste it in the box the app shows under "Check your email".
3. Invite and join links (`?token=`, `?join=`) open the same way.

Links to other sites (report sources) open in the phone's browser. The Android back button goes back
inside the app. Render's free plan sleeps: the first start can take up to a minute.

## Build

Needs JDK 17+ and the Android SDK (platform 35, build-tools 35). Put `sdk.dir=...` in `local.properties`.

```bash
./gradlew assembleRelease
```

Output: `app/build/outputs/apk/release/app-release.apk`. To point the app at another deployment,
change `APP_URL` in `app/build.gradle` and the host in `AndroidManifest.xml`.

**Signing:** release builds use `keystore.properties` + `keystore/datapeaks-release.jks` (both kept
out of git). Without them the build falls back to the debug key: the APK installs, but links won't
open the app automatically (the fingerprint in `assetlinks.json` won't match), and Android refuses to
update an installed copy signed with the other key (uninstall first).
