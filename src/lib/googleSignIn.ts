import { GoogleAuthProvider, signInWithRedirect, getRedirectResult } from 'firebase/auth';
import { auth } from '../firebase';
import { toast } from 'sonner';

function authErrorMessage(code: string, message?: string): string {
  switch (code) {
    case 'auth/popup-closed-by-user':
      return 'Sign-in was cancelled.';
    case 'auth/popup-blocked':
      return 'Popup was blocked. Try again.';
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

/** Call once on app load to finish signInWithRedirect. */
export async function finalizeGoogleRedirectSignIn(): Promise<void> {
  try {
    const result = await getRedirectResult(auth);
    if (result?.user) {
      toast.success('Signed in with Google');
    }
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    toast.error(authErrorMessage(err.code ?? '', err.message));
    console.error('Google redirect sign-in error:', error);
  }
}

/**
 * Full-page redirect to Google (no popup).
 * Avoids Cross-Origin-Opener-Policy issues where signInWithPopup hangs because
 * the browser blocks window.closed / window.close across the OAuth window.
 */
export async function signInWithGoogle(): Promise<void> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  try {
    await signInWithRedirect(auth, provider);
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    toast.error(authErrorMessage(err.code ?? '', err.message));
    console.error('Google sign-in error:', error);
  }
}
