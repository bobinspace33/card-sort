import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { getRedirectResult } from 'firebase/auth';
import { auth } from './firebase';
import App from './App.tsx';
import './index.css';

/**
 * Finish Google redirect sign-in once before React mounts.
 * React 18 StrictMode runs effects twice; calling getRedirectResult in an effect
 * can race and leave the user unsigned-in after returning from Google.
 */
void (async () => {
  try {
    const result = await getRedirectResult(auth);
    if (result?.user) {
      sessionStorage.setItem('cardSortGoogleRedirectOk', '1');
    }
  } catch (err) {
    console.error('Google redirect sign-in failed:', err);
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
})();
