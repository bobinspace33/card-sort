import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { auth } from '../firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { signInWithGooglePopup, signInWithGoogleRedirect } from '../lib/googleSignIn';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function FacilitatorSetup() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (current) => {
      setUser(current);
      setChecking(false);
    });
    return () => unsub();
  }, []);

  const handleLoginPopup = () => {
    void signInWithGooglePopup();
  };
  const handleLoginRedirect = () => {
    void signInWithGoogleRedirect();
  };

  if (checking) return <div className="p-8 text-center text-slate-600">Loading…</div>;
  if (user) return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-6 bg-[#f5f7f5]">
      <Card className="w-full max-w-md shadow-xl border-0 bg-white/90 backdrop-blur-sm rounded-3xl">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-3xl font-bold text-emerald-800">Facilitator setup</CardTitle>
          <CardDescription className="text-emerald-700/90 text-base leading-relaxed">
            Sign in here to create activities and copy student links. Participants use a separate
            <span className="font-medium"> /play/… </span>
            link — not this page.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pt-4">
          <Button
            onClick={handleLoginPopup}
            className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-full px-8 py-6 text-lg shadow-lg shadow-emerald-500/20"
          >
            Sign in with Google
          </Button>
          <button
            type="button"
            onClick={handleLoginRedirect}
            className="text-center text-sm text-slate-600 hover:text-slate-900 underline underline-offset-4"
          >
            Use full-page sign-in instead
          </button>
          <p className="text-center text-sm text-slate-500">
            Are you a student? Use the link your teacher sent (it should include{' '}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">/play/</code>
            ).
          </p>
        </CardContent>
      </Card>
      <Link to="/" className="text-sm text-emerald-700 hover:text-emerald-900 underline-offset-4 hover:underline">
        ← Back to home
      </Link>
    </div>
  );
}
