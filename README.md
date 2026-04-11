<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/11e16166-a111-48f9-973b-2bcb798b027b

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## URLs in this app

- **`/setup`** — Facilitator entry (sign in with Google). Bookmark this for “teacher” access.
- **`/`** — Dashboard after sign-in; create activities and copy **student** links.
- **`/play/:activityId`** — **Public** participant link to share with students.
- **`/activity/:activityId`** — Facilitator preview of the same activity (optional).
- **`/activity/:activityId/results`** — Results (owner only; enforced in the app and Firestore rules).

## Deploy on Vercel

1. Push this project to GitHub (or GitLab/Bitbucket) and import the repo in [Vercel](https://vercel.com).
2. **Framework preset:** Vite (auto-detected). **Build command:** `npm run build`. **Output directory:** `dist`.
3. **`vercel.json`** in the repo adds SPA rewrites so client-side routes like `/play/...` work after refresh.
4. **Firebase (required):** In [Firebase Console](https://console.firebase.google.com) → Authentication → **Settings** → **Authorized domains**, add your Vercel domain (e.g. `your-app.vercel.app` and any custom domain).
5. **Environment variables (optional):** You can keep using `firebase-applet-config.json` for local builds. For Vercel, either commit that file (Firebase web keys are public by design; still restrict the key by HTTP referrer in Google Cloud Console when possible) **or** set the `VITE_FIREBASE_*` variables listed in [`.env.example`](.env.example) and omit secrets from git. If you use env vars, set `VITE_FIREBASE_FIRESTORE_DATABASE_ID` to the same value as `firestoreDatabaseId` in your JSON when you use a non-default database (as AI Studio often does).
6. **Firestore & Storage rules:** This repo includes [`firebase.json`](firebase.json), [`firestore.rules`](firestore.rules), and [`storage.rules`](storage.rules). Enable **Storage** in the Firebase console (Build → Storage), then deploy rules from the project folder (requires [Firebase CLI](https://firebase.google.com/docs/cli) and `firebase login` / `firebase use <your-project-id>`):
   ```bash
   firebase deploy --only firestore:rules,storage
   ```
   Or paste the contents of `storage.rules` into **Storage → Rules** in the console.

### If image upload shows a CORS / preflight error in the browser

The app talks to `firebasestorage.googleapis.com` from `http://localhost:3000`. Your bucket must allow that origin (and your production URL later).

1. In [Firebase Console](https://console.firebase.google.com) → **Project settings** (gear) → **Your apps**, copy **`storageBucket`** exactly into `firebase-applet-config.json` (some projects use `*.appspot.com`, others `*.firebasestorage.app` — they must match).
2. Install [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) so you have `gsutil`.
   - **If `brew install --cask gcloud-cli` fails** with `virtualenv: command not found` or missing `Caskroom/...` paths: remove the broken install (`brew uninstall --cask gcloud-cli --force`), then use Google’s **standalone** SDK (no Homebrew), for example in your home directory:
     ```bash
     cd ~
     curl -O https://dl.google.com/dl/cloudsdk/channels/rapid/downloads/google-cloud-cli-darwin-arm.tar.gz
     tar -xf google-cloud-cli-darwin-arm.tar.gz
     ./google-cloud-sdk/install.sh --quiet --usage-reporting false --path-update true
     ```
     (On Intel Macs, download `google-cloud-cli-darwin-x86_64.tar.gz` instead.) Open a **new** terminal, then run `gcloud auth login`. The installer adds `gcloud` and `gsutil` to your PATH (see the script’s closing instructions if not).
4. From this project folder, apply [`storage-cors.json`](storage-cors.json) to **both** bucket names if both exist in [Google Cloud Console](https://console.cloud.google.com/storage/browser) → Storage → Buckets:

   ```bash
   gsutil cors set storage-cors.json gs://cardsort-1f0f7.firebasestorage.app
   gsutil cors set storage-cors.json gs://cardsort-1f0f7.appspot.com
   ```

   Replace `cardsort-1f0f7` with your **project ID** if different. Only run the line for buckets you actually have.
5. Add your **Vercel / custom domain** to the `origin` array in `storage-cors.json`, run `gsutil cors set` again, then retry the upload.

## Test the app locally

1. **Install and run:** `npm install` then `npm run dev` (opens on port 3000 by default).
2. **Firebase:** Keep `firebase-applet-config.json` pointed at your project (or use `.env.local` with `VITE_FIREBASE_*` from `.env.example`). In Firebase Console → Authentication → **Sign-in method**, enable **Google**. Under **Settings → Authorized domains**, add `localhost` if it is not already listed.
3. **Rules:** Deploy Firestore and Storage rules (command above) so reads/writes match production; otherwise you may see permission errors when saving activities, uploading images, or submitting responses.
4. **Flow:** Open [http://localhost:3000/setup](http://localhost:3000/setup) (or `/`), sign in, create an activity (try an image upload to exercise Storage), copy the **student** link from the toast or dashboard, and open it in an **incognito/private** window to simulate a participant.

**Gemini:** `GEMINI_API_KEY` is only needed if you add features that call the Gemini API; the current card-sort UI does not require it for basic operation.

## Git backup

From the project folder:

```bash
git init
git add .
git commit -m "Initial commit: Card Sort Maker"
git branch -M main
git remote add origin <your-repo-url>
git push -u origin main
```
