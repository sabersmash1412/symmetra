# Symmetra Patient App

Mobile-first PWA for patient daily face symmetry progress tracking. This app is separate from `../web` and stores daily check-ins locally first, then syncs to Supabase when configured.

## Run locally

```bash
cd patient-app
npm install
cp .env.example .env.local
npm run dev
```

Set Supabase values in `.env.local` to enable auth, database sync, and optional video upload. Without Supabase configuration, the app still runs in local-only mode.

## Install on phone

Deploy this app to an HTTPS URL.

- iPhone: open the URL in Safari, tap Share, then tap **Add to Home Screen**.
- Android: open the URL in Chrome, tap the install prompt or browser menu, then tap **Install app** or **Add to Home screen**.

## Supabase setup

Run `supabase/schema.sql` in your Supabase SQL editor, then create a private Storage bucket named `patient-videos` or set `NEXT_PUBLIC_SUPABASE_VIDEO_BUCKET` to your bucket name.
