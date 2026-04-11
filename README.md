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
6. **Firestore rules:** Deploy the rules in `firestore.rules` to your Firebase project (`firebase deploy --only firestore:rules` if you use the Firebase CLI).
7. **Storage:** Image uploads use Firebase Storage; ensure Storage is enabled and rules allow authenticated uploads for your paths.

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
