import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { Activity } from '../types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, BarChart, Play, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { getPublicPlayUrl } from '../lib/activityUrls';

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const createdId = (location.state as { createdActivityId?: string } | null)?.createdActivityId;
    if (!createdId) return;
    const url = getPublicPlayUrl(createdId);
    toast.success('Activity created', {
      description: 'Share this student link (participants should not use the facilitator dashboard).',
      action: {
        label: 'Copy student link',
        onClick: () => {
          void navigator.clipboard.writeText(url);
          toast.message('Student link copied');
        },
      },
      duration: 14_000,
    });
    navigate('.', { replace: true, state: {} });
  }, [location.state, navigate]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, 'activities'), where('ownerId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const acts: Activity[] = [];
      snapshot.forEach((doc) => {
        acts.push({ id: doc.id, ...doc.data() } as Activity);
      });
      setActivities(acts);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'activities');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Login failed', error);
    }
  };

  if (loading) return <div className="p-8 text-center">Loading...</div>;

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
        <Card className="w-full max-w-md shadow-xl border-0 bg-white/80 backdrop-blur-sm rounded-3xl">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-3xl font-bold text-emerald-800">Card Sort Maker</CardTitle>
            <CardDescription className="text-emerald-600/80">
              Create interactive card sorts. Teachers and facilitators sign in here; students open a separate
              <span className="font-medium"> /play/… </span>
              link you share after each activity is created.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-stretch gap-4 pt-6">
            <Button
              onClick={handleLogin}
              className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-full px-8 py-6 text-lg shadow-lg shadow-emerald-500/20 transition-all hover:scale-[1.02]"
            >
              Sign in with Google
            </Button>
            <p className="text-center text-sm text-slate-500">
              Prefer a dedicated facilitator URL?{' '}
              <Link to="/setup" className="font-medium text-emerald-700 hover:underline underline-offset-4">
                Open facilitator setup
              </Link>
            </p>
          </CardContent>
        </Card>
        <p className="max-w-md text-center text-sm text-slate-500">
          If you are joining as a participant, use the link from your facilitator (it includes{' '}
          <code className="rounded bg-white px-1.5 py-0.5 text-slate-700 shadow-sm">/play/</code>
          ).
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6 md:p-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center mb-12">
        <div>
          <h1 className="text-4xl font-bold text-emerald-900 tracking-tight">Your Activities</h1>
          <p className="text-emerald-600 mt-2">Share a public student link for each activity; keep results here.</p>
          <p className="text-xs text-slate-500 mt-2">
            Facilitator entry:{' '}
            <Link to="/setup" className="text-emerald-700 hover:underline underline-offset-2">
              {typeof window !== 'undefined' ? `${window.location.origin}/setup` : '/setup'}
            </Link>
          </p>
        </div>
        <Button onClick={() => navigate('/create')} className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-full px-6 shadow-md shrink-0">
          <Plus className="w-5 h-5 mr-2" /> New Activity
        </Button>
      </div>

      {activities.length === 0 ? (
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
                <div className="px-4 pb-3 text-[11px] text-slate-400 font-mono truncate" title={getPublicPlayUrl(activity.id)}>
                  Students: {getPublicPlayUrl(activity.id)}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
