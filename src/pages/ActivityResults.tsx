import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db, handleFirestoreError, OperationType, auth } from '../firebase';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { Activity, Response } from '../types';
import { getPublicPlayUrl } from '../lib/activityUrls';
import { EDITOR_PATH } from '../lib/paths';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Users, CheckCircle, Copy } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { toast } from 'sonner';

export default function ActivityResults() {
  const { activityId } = useParams();
  const navigate = useNavigate();
  const [activity, setActivity] = useState<Activity | null>(null);
  const [responses, setResponses] = useState<Response[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!activityId) return;
      try {
        // Check auth first
        if (!auth.currentUser) {
          toast.error('You must be logged in to view results');
          navigate(EDITOR_PATH);
          return;
        }

        const docRef = doc(db, 'activities', activityId);
        const docSnap = await getDoc(docRef);
        
        if (!docSnap.exists()) {
          toast.error('Activity not found');
          setLoading(false);
          return;
        }

        const actData = docSnap.data() as Activity;
        if (actData.ownerId !== auth.currentUser.uid) {
          toast.error('You do not have permission to view these results');
          navigate(EDITOR_PATH);
          return;
        }

        setActivity({ id: docSnap.id, ...actData });

        const responsesRef = collection(db, `activities/${activityId}/responses`);
        const responsesSnap = await getDocs(responsesRef);
        const resps: Response[] = [];
        responsesSnap.forEach(doc => {
          resps.push({ id: doc.id, ...doc.data() } as Response);
        });
        
        // Sort by submittedAt descending
        resps.sort((a, b) => b.submittedAt?.toMillis() - a.submittedAt?.toMillis());
        setResponses(resps);

      } catch (error) {
        handleFirestoreError(error, OperationType.GET, `activities/${activityId}`);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [activityId, navigate]);

  const copyLink = () => {
    if (!activityId) return;
    const url = getPublicPlayUrl(activityId);
    void navigator.clipboard.writeText(url);
    toast.success('Student link copied to clipboard!');
  };

  const copyStudentCode = () => {
    if (!activity?.studentCode) return;
    void navigator.clipboard.writeText(activity.studentCode);
    toast.success('Student code copied!');
  };

  const perCardClassStats = useMemo(() => {
    if (!activity || responses.length === 0) return [];
    const n = responses.length;
    return activity.cards.map((card) => {
      const ok = responses.filter((r) => r.placements?.[card.id] === card.correctCategory).length;
      return {
        cardId: card.id,
        label: card.frontText.trim() || 'Untitled card',
        percent: Math.round((ok / n) * 100),
      };
    });
  }, [activity, responses]);

  if (loading) return <div className="p-8 text-center">Loading...</div>;
  if (!activity) return <div className="p-8 text-center">Activity not found</div>;

  // Prepare chart data
  const scoreDistribution = [
    { range: '0-20%', count: 0 },
    { range: '21-40%', count: 0 },
    { range: '41-60%', count: 0 },
    { range: '61-80%', count: 0 },
    { range: '81-100%', count: 0 },
  ];

  responses.forEach(r => {
    if (r.score <= 20) scoreDistribution[0].count++;
    else if (r.score <= 40) scoreDistribution[1].count++;
    else if (r.score <= 60) scoreDistribution[2].count++;
    else if (r.score <= 80) scoreDistribution[3].count++;
    else scoreDistribution[4].count++;
  });

  const averageScore = responses.length > 0 
    ? Math.round(responses.reduce((acc, r) => acc + r.score, 0) / responses.length) 
    : 0;

  return (
    <div className="max-w-6xl mx-auto p-6 md:p-12">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center">
          <Button variant="ghost" onClick={() => navigate(EDITOR_PATH)} className="mr-4 rounded-full w-10 h-10 p-0">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-emerald-900">{activity.title} Results</h1>
            <p className="text-emerald-600 mt-1">{responses.length} total responses</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {activity.studentCode ? (
            <Button
              onClick={copyStudentCode}
              variant="outline"
              className="rounded-full border-emerald-200 text-emerald-700 hover:bg-emerald-50"
            >
              <Copy className="w-4 h-4 mr-2" /> Copy student code ({activity.studentCode})
            </Button>
          ) : null}
          <Button onClick={copyLink} variant="outline" className="rounded-full border-emerald-200 text-emerald-700 hover:bg-emerald-50">
            <Copy className="w-4 h-4 mr-2" /> Copy student link
          </Button>
        </div>
      </div>

      {responses.length === 0 ? (
        <div className="text-center py-24 bg-white rounded-3xl shadow-sm border border-emerald-100">
          <Users className="w-12 h-12 text-emerald-300 mx-auto mb-4" />
          <h3 className="text-xl font-medium text-emerald-900 mb-2">No responses yet</h3>
          <p className="text-emerald-600 mb-6">Share the link with your students to get started.</p>
          <Button onClick={copyLink} className="rounded-full bg-emerald-500 hover:bg-emerald-600 text-white">
            Copy Link
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          <div className="lg:col-span-2">
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="mb-6 w-full max-w-md">
                <TabsTrigger value="overview" className="rounded-lg">
                  Overview
                </TabsTrigger>
                <TabsTrigger value="by-card" className="rounded-lg">
                  By card
                </TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-0 space-y-8">
                <Card className="rounded-3xl border-0 shadow-sm bg-white overflow-hidden">
                  <CardHeader className="bg-emerald-50/50 border-b border-emerald-50">
                    <CardTitle className="text-xl text-emerald-900">Score Distribution</CardTitle>
                  </CardHeader>
                  <CardContent className="p-6">
                    <div className="h-[300px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={scoreDistribution} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                          <XAxis dataKey="range" axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} />
                          <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} />
                          <Tooltip 
                            cursor={{ fill: '#f1f5f9' }}
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                          />
                          <Bar dataKey="count" fill="#10b981" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <Card className="rounded-3xl border-0 shadow-sm bg-white overflow-hidden">
                  <CardHeader className="bg-slate-50 border-b border-slate-100">
                    <CardTitle className="text-xl text-slate-800">Student Responses</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y divide-slate-100">
                      {responses.map((resp) => (
                        <div key={resp.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                          <div>
                            <p className="font-medium text-slate-800">{resp.studentName}</p>
                            <p className="text-sm text-slate-500">
                              {resp.submittedAt ? new Date(resp.submittedAt.toMillis()).toLocaleString() : 'Unknown date'}
                            </p>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <p className="text-2xl font-light text-emerald-600">{resp.score}%</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="by-card" className="mt-0">
                <Card className="rounded-3xl border-0 shadow-sm bg-white overflow-hidden">
                  <CardHeader className="border-b border-emerald-50 bg-emerald-50/50">
                    <CardTitle className="text-xl text-emerald-900">Class accuracy by card</CardTitle>
                    <p className="text-sm text-slate-600 mt-1">
                      Share of responses that placed each card in the correct category (label = front text).
                    </p>
                  </CardHeader>
                  <CardContent className="max-h-[min(70vh,36rem)] overflow-y-auto p-6">
                    <ul className="space-y-4">
                      {perCardClassStats.map((row) => (
                        <li key={row.cardId}>
                          <div className="mb-1 flex items-baseline justify-between gap-2 text-xs text-slate-600 sm:text-sm">
                            <span className="min-w-0 truncate font-medium text-slate-800" title={row.label}>
                              {row.label}
                            </span>
                            <span className="shrink-0 tabular-nums text-slate-500">{row.percent}%</span>
                          </div>
                          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-emerald-500 transition-all"
                              style={{ width: `${row.percent}%` }}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          <div className="space-y-6">
            <Card className="rounded-3xl border-0 shadow-sm bg-emerald-500 text-white">
              <CardContent className="p-8 text-center">
                <CheckCircle className="w-12 h-12 text-emerald-200 mx-auto mb-4" />
                <div className="text-6xl font-light mb-2">{averageScore}%</div>
                <div className="text-emerald-100 font-medium uppercase tracking-wider text-sm">Average Score</div>
              </CardContent>
            </Card>
            
            <Card className="rounded-3xl border-0 shadow-sm bg-white">
              <CardHeader>
                <CardTitle className="text-lg text-slate-800">Activity Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-slate-500 uppercase tracking-wider font-semibold mb-1">Categories</p>
                  <div className="flex flex-wrap gap-2">
                    {activity.categories.map((cat, i) => (
                      <span key={i} className="bg-slate-100 text-slate-700 px-3 py-1 rounded-full text-sm">
                        {cat}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm text-slate-500 uppercase tracking-wider font-semibold mb-1">Total Cards</p>
                  <p className="text-slate-800 font-medium">{activity.cards.length}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500 uppercase tracking-wider font-semibold mb-1">Settings</p>
                  <ul className="text-sm text-slate-700 space-y-1">
                    <li>Check Answers: {activity.checkAnswers ? 'Yes' : 'No'}</li>
                    <li>Show class results (students): {activity.showScore ? 'Yes' : 'No'}</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>

        </div>
      )}
    </div>
  );
}
