/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import Home from './pages/Home';
import FacilitatorSetup from './pages/FacilitatorSetup';
import CreateActivity from './pages/CreateActivity';
import ActivityView from './pages/ActivityView';
import ActivityResults from './pages/ActivityResults';
import {
  CARD_SORT_GOOGLE_REDIRECT_ERR,
  CARD_SORT_GOOGLE_REDIRECT_OK,
} from './lib/authSessionKeys';

function PostGoogleRedirectToast() {
  useEffect(() => {
    const errRaw = sessionStorage.getItem(CARD_SORT_GOOGLE_REDIRECT_ERR);
    if (errRaw) {
      sessionStorage.removeItem(CARD_SORT_GOOGLE_REDIRECT_ERR);
      try {
        const { code, message } = JSON.parse(errRaw) as { code: string; message: string };
        const host = window.location.hostname;
        if (code === 'auth/unauthorized-domain') {
          toast.error(
            `Firebase blocked sign-in for “${host}”. Open Firebase Console → Authentication → Settings → Authorized domains → Add domain → enter: ${host}`,
            { duration: 25_000 },
          );
        } else {
          toast.error(message || code || 'Google sign-in failed after redirect', { duration: 14_000 });
        }
      } catch {
        toast.error('Google sign-in failed after redirect', { duration: 10_000 });
      }
    }

    if (sessionStorage.getItem(CARD_SORT_GOOGLE_REDIRECT_OK)) {
      sessionStorage.removeItem(CARD_SORT_GOOGLE_REDIRECT_OK);
      toast.success('Signed in with Google');
    }
  }, []);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <PostGoogleRedirectToast />
      <div className="min-h-screen bg-[#f5f7f5] text-slate-900 font-sans">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/setup" element={<FacilitatorSetup />} />
          <Route path="/create" element={<CreateActivity />} />
          <Route path="/play/:activityId" element={<ActivityView />} />
          <Route path="/activity/:activityId" element={<ActivityView />} />
          <Route path="/activity/:activityId/results" element={<ActivityResults />} />
        </Routes>
        <Toaster />
      </div>
    </BrowserRouter>
  );
}
