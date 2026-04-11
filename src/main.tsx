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

/**
 * Finish Google redirect sign-in once before React mounts.
 * React 18 StrictMode runs effects twice; calling getRedirectResult in an effect
 * can race and leave the user unsigned-in after returning from Google.
 */
void (async () => {
  try {
    const result = await getRedirectResult(auth);
    if (result?.user) {
      sessionStorage.setItem(CARD_SORT_GOOGLE_REDIRECT_OK, '1');
      sessionStorage.removeItem(CARD_SORT_LAST_GOOGLE_AUTH_ERR);
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
