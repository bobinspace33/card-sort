/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import Home from './pages/Home';
import FacilitatorSetup from './pages/FacilitatorSetup';
import CreateActivity from './pages/CreateActivity';
import ActivityView from './pages/ActivityView';
import ActivityResults from './pages/ActivityResults';
import { finalizeGoogleRedirectSignIn } from './lib/googleSignIn';

function GoogleRedirectCompletion() {
  useEffect(() => {
    void finalizeGoogleRedirectSignIn();
  }, []);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <GoogleRedirectCompletion />
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
