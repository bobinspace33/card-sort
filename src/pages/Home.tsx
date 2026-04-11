import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { auth, db, firebaseAuthDomain, firebaseProjectId } from '../firebase';
import { CARD_SORT_LAST_GOOGLE_AUTH_ERR } from '../lib/authSessionKeys';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { Activity } from '../types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, BarChart, Play, Link2, Pencil, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { getPublicPlayUrl } from '../lib/activityUrls';
import { signInWithGooglePopup, signInWithGoogleRedirect } from '../lib/googleSignIn';

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  /** First onAuthStateChanged has run — don’t block the whole page on Firestore. */
  const [authReady, setAuthReady] = useState(false);
  /** Waiting for first activities snapshot (signed-in only). */
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  /** True if the activities listener never responded in time (Firestore/network). */
  const [activitiesLoadTimedOut, setActivitiesLoadTimedOut] = useState(false);
  /** Last Firebase auth error (redirect return or blocked redirect) — shown until dismiss or successful sign-in. */
  const [lastAuthErr, setLastAuthErr] = useState<{ code: string; message: string } | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  /** Same as `!authReady` — keeps the name `loading` defined for clarity and avoids stale HMR refs to a removed variable. */
  const loading = !authReady;

  useEffect(() => {
    const st = location.state as { createdActivityId?: string; createdStudentCode?: string } | null;
    const createdId = st?.createdActivityId;
    if (!createdId) return;
    const url = getPublicPlayUrl(createdId);
    const code = st?.createdStudentCode;
    toast.success('Activity created', {
      description: code
        ? `Student code: ${code} — students enter it on the site home under Student Code. You can still share the /play/ link.`
        : 'Share this student link (participants should not use the facilitator dashboard).',
      action: code
        ? {
            label: 'Copy student code',
            onClick: () => {
              void navigator.clipboard.writeText(code);
              toast.message('Code copied');
            },
          }
        : {
            label: 'Copy student link',
            onClick: () => {
              void navigator.clipboard.writeText(url);
              toast.message('Student link copied');
            },
          },
      duration: 16_000,
    });
    navigate('.', { replace: true, state: {} });
  }, [location.state, navigate]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
      if (currentUser) {
        sessionStorage.removeItem(CARD_SORT_LAST_GOOGLE_AUTH_ERR);
        setLastAuthErr(null);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const raw = sessionStorage.getItem(CARD_SORT_LAST_GOOGLE_AUTH_ERR);
    if (!raw) {
      setLastAuthErr(null);
      return;
    }
    try {
      const o = JSON.parse(raw) as { code?: string; message?: string };
      if (typeof o.code === 'string')
        setLastAuthErr({ code: o.code, message: typeof o.message === 'string' ? o.message : '' });
    } catch {
      setLastAuthErr(null);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setActivities([]);
      setActivitiesLoading(false);
      setActivitiesLoadTimedOut(false);
      return;
    }

    setActivitiesLoading(true);
    setActivitiesLoadTimedOut(false);
    const slowTimer = window.setTimeout(() => {
      setActivitiesLoading((still) => {
        if (still) {
          setActivitiesLoadTimedOut(true);
          toast.error(
            'Still loading activities. Check Firestore is enabled, rules are deployed, and your network. If you use a named database, set VITE_FIREBASE_FIRESTORE_DATABASE_ID.',
          );
        }
        return false;
      });
    }, 18_000);

    const q = query(collection(db, 'activities'), where('ownerId', '==', user.uid));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        window.clearTimeout(slowTimer);
        setActivitiesLoadTimedOut(false);
        const acts: Activity[] = [];
        snapshot.forEach((doc) => {
          acts.push({ id: doc.id, ...doc.data() } as Activity);
        });
        setActivities(acts);
        setActivitiesLoading(false);
      },
      (error) => {
        window.clearTimeout(slowTimer);
        setActivitiesLoadTimedOut(false);
        setActivitiesLoading(false);
        console.error('Firestore list activities:', error);
        toast.error(
          'Could not load activities (permission denied). Open Firebase → Firestore → Rules, publish the rules from your repo file firestore.rules, and use the same Firebase project as firebase-applet-config.json.',
          { duration: 14_000 },
        );
      },
    );

    return () => {
      window.clearTimeout(slowTimer);
      unsubscribe();
    };
  }, [user]);

  const handleLoginPopup = () => {
    void signInWithGooglePopup();
  };
  const handleLoginRedirect = () => {
    void signInWithGoogleRedirect();
  };

  if (loading) return <div className="p-8 text-center text-slate-600">Loading…</div>;

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
        <Card className="w-full max-w-md shadow-xl border-0 bg-white/80 backdrop-blur-sm rounded-3xl">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-3xl font-bold text-emerald-800">Sort-o-Matic 5000</CardTitle>
            <CardDescription className="text-emerald-600/80">
              Create interactive card sorts. Teachers and facilitators sign in here; students open a separate
              <span className="font-medium"> /play/… </span>
              link you share after each activity is created.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-stretch gap-4 pt-6">
            {lastAuthErr && (
              <div
                role="alert"
                className="rounded-2xl border border-red-200 bg-red-50/90 px-4 py-3 text-left text-sm text-red-950"
              >
                <p className="font-semibold">Sign-in did not complete</p>
                <p className="mt-1 font-mono text-xs break-all">
                  {lastAuthErr.code}: {lastAuthErr.message}
                </p>
                <p className="mt-3 text-red-900/90 leading-relaxed">
                  This build uses Firebase project{' '}
                  <span className="font-mono font-medium">{firebaseProjectId || '?'}</span>
                  {firebaseAuthDomain ? (
                    <>
                      {' '}
                      (<span className="font-mono">{firebaseAuthDomain}</span>)
                    </>
                  ) : null}
                  . In the{' '}
                  <strong>same</strong> project in Firebase Console → Authentication → Settings →{' '}
                  <strong>Authorized domains</strong>, add exactly:{' '}
                  <span className="font-mono font-semibold">{typeof window !== 'undefined' ? window.location.hostname : ''}</span>
                  . If you test a Preview URL, add that hostname too (each{' '}
                  <code className="rounded bg-white/80 px-1">*.vercel.app</code> preview is separate).
                </p>
                <button
                  type="button"
                  className="mt-3 text-xs font-medium text-red-800 underline underline-offset-2 hover:text-red-950"
                  onClick={() => {
                    sessionStorage.removeItem(CARD_SORT_LAST_GOOGLE_AUTH_ERR);
                    setLastAuthErr(null);
                  }}
                >
                  Dismiss
                </button>
              </div>
            )}
            <Button
              onClick={handleLoginPopup}
              className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-full px-8 py-6 text-lg shadow-lg shadow-emerald-500/20 transition-all hover:scale-[1.02]"
            >
              Sign in with Google
            </Button>
            <button
              type="button"
              onClick={handleLoginRedirect}
              className="text-center text-sm text-slate-600 hover:text-slate-900 underline underline-offset-4"
            >
              Use full-page sign-in instead (if the button above does not work)
            </button>
            <p className="text-center text-sm text-slate-500">
              Prefer a dedicated facilitator URL?{' '}
              <Link to="/setup" className="font-medium text-emerald-700 hover:underline underline-offset-4">
                Open facilitator setup
              </Link>
            </p>
            <details className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-2 text-left text-xs text-slate-600">
              <summary className="cursor-pointer font-medium text-slate-700 select-none">
                Stuck after choosing your Google account?
              </summary>
              <ol className="mt-2 list-decimal pl-4 space-y-2 leading-relaxed">
                <li>
                  Firebase Console (project <span className="font-mono">{firebaseProjectId || '…'}</span>) →{' '}
                  <strong>Authentication</strong> → <strong>Settings</strong> → <strong>Authorized domains</strong> → add{' '}
                  <span className="font-mono">{typeof window !== 'undefined' ? window.location.hostname : ''}</span>
                  .
                </li>
                <li>
                  <a
                    href="https://console.cloud.google.com/apis/credentials"
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-emerald-800 underline underline-offset-2"
                  >
                    Google Cloud Console → Credentials
                  </a>
                  : open the <strong>Web client</strong> (often named like your Firebase project) →{' '}
                  <strong>Authorized JavaScript origins</strong> → add{' '}
                  <span className="font-mono">{typeof window !== 'undefined' ? window.location.origin : ''}</span>
                  .
                </li>
                <li>
                  Use a normal browser window (not private/incognito), then try again.
                </li>
              </ol>
            </details>
            <details className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-2 text-left text-xs text-slate-600">
              <summary className="cursor-pointer font-medium text-slate-700 select-none">
                Flashing red error when you click sign-in?
              </summary>
              <ol className="mt-2 list-decimal pl-4 space-y-2 leading-relaxed">
                <li>
                  Open DevTools <strong>before</strong> clicking sign-in. In the <strong>Console</strong> tab, turn on{' '}
                  <strong>Preserve log</strong> (checkbox at the top). Repeat for the <strong>Network</strong> tab — many
                  “GET …” lines are listed there, not in Console.
                </li>
                <li>
                  Click sign-in again. Any failed request stays in the list; click it and copy the URL or status code.
                </li>
                <li>
                  In Console, filter by <span className="font-mono">SortOMatic</span> — this app logs{' '}
                  <span className="font-mono">[SortOMatic Auth]</span> lines that do not disappear the same way.
                </li>
              </ol>
            </details>
          </CardContent>
        </Card>
        <p className="max-w-md text-center text-sm text-slate-500">
          <Link to="/" className="font-medium text-emerald-700 hover:underline underline-offset-2">
            Site home
          </Link>
          {' — '}participants use a 6-character code or a <code className="rounded bg-white px-1.5 py-0.5 text-slate-700 shadow-sm">/play/</code> link from their teacher.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6 md:p-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center mb-12">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-emerald-600">Sort-o-Matic 5000</p>
          <h1 className="text-4xl font-bold text-emerald-900 tracking-tight">Your Activities</h1>
          <p className="text-emerald-600 mt-2">Share a public student link for each activity; keep results here.</p>
          <p className="text-xs text-slate-500 mt-2">
            <Link to="/" className="text-emerald-700 hover:underline underline-offset-2">
              Site home
            </Link>
            {' · '}
            <Link to="/setup" className="text-emerald-700 hover:underline underline-offset-2">
              {typeof window !== 'undefined' ? `${window.location.origin}/setup` : '/setup'}
            </Link>
          </p>
        </div>
        <Button onClick={() => navigate('/create')} className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-full px-6 shadow-md shrink-0">
          <Plus className="w-5 h-5 mr-2" /> New Activity
        </Button>
      </div>

      {activitiesLoading ? (
        <div className="text-center py-24 bg-white rounded-3xl shadow-sm border border-emerald-100">
          <p className="text-emerald-800 font-medium">Loading your activities…</p>
          <p className="text-sm text-slate-500 mt-2">If this never finishes, open the browser console for Firestore errors.</p>
        </div>
      ) : activities.length === 0 && activitiesLoadTimedOut ? (
        <div className="text-center py-24 bg-amber-50/80 rounded-3xl shadow-sm border border-amber-100">
          <h3 className="text-xl font-medium text-amber-900 mb-2">Could not load activities in time</h3>
          <p className="text-amber-800/90 mb-6 max-w-md mx-auto text-sm">
            Firestore did not respond (rules, database, network, or wrong project). Check the browser console. You can still try creating an activity — save will fail if Firestore is not set up.
          </p>
          <Button onClick={() => navigate('/create')} className="rounded-full bg-emerald-500 hover:bg-emerald-600 text-white">
            Try Create Activity
          </Button>
        </div>
      ) : activities.length === 0 ? (
        <div className="text-center py-24 bg-white rounded-3xl shadow-sm border border-emerald-100">
          <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <Plus className="w-10 h-10 text-emerald-300" />
          </div>
          <h3 className="text-xl font-medium text-emerald-900 mb-2">No activities yet</h3>
          <p className="text-emerald-600 mb-6">Create your first card sort to get started.</p>
          <Button onClick={() => navigate('/create')} variant="outline" className="rounded-full border-emerald-200 text-emerald-700 hover:bg-emerald-50">
            Create Activity
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {activities.map((activity) => (
            <Card key={activity.id} className="rounded-3xl border-0 shadow-md hover:shadow-lg transition-shadow bg-white overflow-hidden group">
              <CardHeader className="bg-emerald-50/50 pb-4 border-b border-emerald-50">
                <CardTitle className="text-xl text-emerald-900">{activity.title}</CardTitle>
                <CardDescription>{activity.cards.length} cards • {activity.categories.length} categories</CardDescription>
              </CardHeader>
              <CardContent className="p-4 flex flex-wrap gap-2 items-center justify-between bg-white">
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => navigate(`/edit/${activity.id}`)}
                    className="rounded-full bg-emerald-600 hover:bg-emerald-700 text-white"
                    title="Change title, cards, categories, and settings"
                  >
                    <Pencil className="w-4 h-4 mr-2" /> Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const url = getPublicPlayUrl(activity.id!);
                      void navigator.clipboard.writeText(url);
                      toast.success('Student link copied');
                    }}
                    className="rounded-full border-emerald-200 text-emerald-800 hover:bg-emerald-50"
                  >
                    <Link2 className="w-4 h-4 mr-2" /> Copy student link
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate(`/activity/${activity.id}`)}
                    className="text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-full"
                    title="Try the activity yourself (same as students, from a facilitator URL)"
                  >
                    <Play className="w-4 h-4 mr-2" /> Preview
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(`/activity/${activity.id}/results`)}
                  className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-full"
                >
                  <BarChart className="w-4 h-4 mr-2" /> Results
                </Button>
              </CardContent>
              {activity.id && (
                <div className="space-y-2 px-4 pb-3">
                  {activity.studentCode ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100/80 px-2.5 py-1 text-[11px] font-mono font-semibold tracking-wider text-emerald-900">
                        <KeyRound className="h-3 w-3" aria-hidden />
                        {activity.studentCode}
                      </span>
                      <button
                        type="button"
                        className="text-[11px] font-medium text-emerald-700 underline underline-offset-2 hover:text-emerald-900"
                        onClick={() => {
                          void navigator.clipboard.writeText(activity.studentCode!);
                          toast.success('Student code copied');
                        }}
                      >
                        Copy code
                      </button>
                    </div>
                  ) : null}
                  <div className="truncate font-mono text-[11px] text-slate-400" title={getPublicPlayUrl(activity.id)}>
                    Students: {getPublicPlayUrl(activity.id)}
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
