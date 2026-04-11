import { GoogleAuthProvider, signInWithPopup, signInWithRedirect } from 'firebase/auth';
import { auth } from '../firebase';
import { CARD_SORT_LAST_GOOGLE_AUTH_ERR } from './authSessionKeys';
import { toast } from 'sonner';

function authErrorMessage(code: string, message?: string): string {
  switch (code) {
    case 'auth/popup-closed-by-user':
      return 'Sign-in was cancelled.';
    case 'auth/popup-blocked':
      return 'Popup was blocked. Allow popups for this site or use full-page sign-in below.';
    case 'auth/cancelled-popup-request':
      return 'Another sign-in was already in progress. Try again.';
    case 'auth/unauthorized-domain':
      return 'This URL is not allowed for sign-in. In Firebase Console: Authentication → Settings → Authorized domains. Add localhost (use http://localhost:3000, not 127.0.0.1).';
    case 'auth/operation-not-allowed':
      return 'Google sign-in is disabled. Enable Google under Authentication → Sign-in method.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    case 'auth/internal-error':
      return 'Firebase auth error. Confirm firebase-applet-config.json matches your Firebase web app and that the Google provider is enabled.';
    default:
      return message || code || 'Sign-in failed';
  }
}

function googleProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
}

function persistGoogleAuthFailure(error: unknown) {
  const err = error as { code?: string; message?: string };
  const code = err.code ?? 'unknown';
  const message = err.message ?? (error instanceof Error ? error.message : String(error));
  sessionStorage.setItem(
    CARD_SORT_LAST_GOOGLE_AUTH_ERR,
    JSON.stringify({ code, message, at: Date.now() }),
  );
  toast.error(authErrorMessage(code, message));
  console.error('Google sign-in error:', error);
}

/**
 * Popup sign-in (recommended on production). Requires the host to send
 * `Cross-Origin-Opener-Policy: same-origin-allow-popups` (see vercel.json) so the
 * Google window can finish without hanging.
 */
export async function signInWithGooglePopup(): Promise<void> {
  try {
    await signInWithPopup(auth, googleProvider());
    sessionStorage.removeItem(CARD_SORT_LAST_GOOGLE_AUTH_ERR);
  } catch (error: unknown) {
    persistGoogleAuthFailure(error);
  }
}

/**
 * Full-page redirect — use if popups are blocked or misconfigured.
 * `getRedirectResult` runs once in main.tsx before React mounts.
 */
export async function signInWithGoogleRedirect(): Promise<void> {
  try {
    await signInWithRedirect(auth, googleProvider());
  } catch (error: unknown) {
    persistGoogleAuthFailure(error);
  }
}

/** Default: popup (more reliable than redirect when COOP allows popups). */
export async function signInWithGoogle(): Promise<void> {
  return signInWithGooglePopup();
}
