import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { getRedirectResult } from 'firebase/auth';
import { auth } from './firebase';
import {
  CARD_SORT_GOOGLE_REDIRECT_ERR,
  CARD_SORT_GOOGLE_REDIRECT_OK,
  CARD_SORT_LAST_GOOGLE_AUTH_ERR,
} from './lib/authSessionKeys';
import App from './App.tsx';
import './index.css';

function persistRedirectAuthError(err: unknown) {
  const e = err as { code?: string; message?: string };
  const code = e?.code ?? 'unknown';
  const message =
    e?.message ?? (err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err));
  const payload = JSON.stringify({ code, message, at: Date.now() });
  sessionStorage.setItem(CARD_SORT_GOOGLE_REDIRECT_ERR, JSON.stringify({ code, message }));
  sessionStorage.setItem(CARD_SORT_LAST_GOOGLE_AUTH_ERR, payload);
}

/** True if this navigation looks like a return from Google / Firebase redirect handler (URL captured before getRedirectResult clears it). */
function looksLikeOAuthReturnToApp(href: string, referrer: string): boolean {
  if (/[?&]apiKey=/.test(href) || /[?&]authType=/.test(href) || /[?&]oobCode=/.test(href) || /[?&]mode=/.test(href)) {
    return true;
  }
  return /accounts\.google\.com/.test(referrer);
}

/**
 * Finish Google redirect sign-in once before React mounts.
 * React 18 StrictMode runs effects twice; calling getRedirectResult in an effect
 * can race and leave the user unsigned-in after returning from Google.
 */
void (async () => {
  const hrefBefore = typeof window !== 'undefined' ? window.location.href : '';
  const referrerBefore = typeof document !== 'undefined' ? document.referrer : '';

  try {
    const result = await getRedirectResult(auth);
    if (result?.user) {
      sessionStorage.setItem(CARD_SORT_GOOGLE_REDIRECT_OK, '1');
      sessionStorage.removeItem(CARD_SORT_LAST_GOOGLE_AUTH_ERR);
    } else if (!auth.currentUser && typeof window !== 'undefined') {
      // Firebase often returns null (no throw) when the site host is not allowed or OAuth state is dropped.
      if (looksLikeOAuthReturnToApp(hrefBefore, referrerBefore)) {
        const host = window.location.hostname;
        const origin = window.location.origin;
        console.warn('[CardSort Auth] OAuth return but no user — check Authorized domains and OAuth JS origins.', {
          host,
          hrefSample: hrefBefore.split('?')[0],
        });
        persistRedirectAuthError({
          code: 'auth/missing-redirect-result',
          message: `You came back from Google but Firebase did not create a session. Fix (same Firebase project as this app): (1) Authentication → Settings → Authorized domains → add "${host}". (2) Google Cloud Console → APIs & Services → Credentials → open the Web client (auto-created by Firebase) → Authorized JavaScript origins → add "${origin}". (3) Try a normal (non-incognito) window.`,
        });
      }
    }
  } catch (err: unknown) {
    console.error('Google redirect sign-in failed:', err);
    persistRedirectAuthError(err);
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
})();
