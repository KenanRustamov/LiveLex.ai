'use client';

import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

type ObjectStats = {
  correct: number;
  incorrect: number;
  last_correct: boolean | null;
  last_user_said: string | null;
  correct_word: string;
  last_attempted: string | null;
};

type ProgressData = {
  objects: Record<string, ObjectStats>;
  sessions: Array<{
    session_id: string;
    timestamp: string;
    summary: {
      items: Array<any>;
      total: number;
      correct_count: number;
      incorrect_count: number;
    };
  }>;
};

type OverallStats = {
  totalWords: number;
  totalSessions: number;
  overallAccuracy: number;
  totalAttempts: number;
};

type ObjectStatItem = {
  objectName: string;
  correct: number;
  incorrect: number;
  correctWord?: string;
  lastAttempted?: string;
};

type MasteryCategory = {
  name: string;
  value: number;
  color: string;
};

type NeedsPracticeWord = ObjectStatItem & {
  accuracy: number;
  totalAttempts: number;
};

export default function AnalyticsView({ username, backendUrl }: { username: string; backendUrl: string }) {
  const [loadingStats, setLoadingStats] = useState<boolean>(false);
  const [objectsStats, setObjectsStats] = useState<ObjectStatItem[]>([]);
  const [overallStats, setOverallStats] = useState<OverallStats>({
    totalWords: 0,
    totalSessions: 0,
    overallAccuracy: 0,
    totalAttempts: 0,
  });
  const [profileReady, setProfileReady] = useState(false);

  useEffect(() => {
    setProfileReady(true);
  }, []);

  useEffect(() => {
    if (!profileReady) return;
    if (!username || username === 'User') return;
    const controller = new AbortController();
    let cancelled = false;

    const loadProgress = async () => {
      setLoadingStats(true);
      try {
        const res = await fetch(`${backendUrl}/v1/user/${encodeURIComponent(username)}/progress`, {
          signal: controller.signal,
        });
        if (res.ok) {
          const data: ProgressData = await res.json();
          if (cancelled) return;

          // Process objects stats
          const objMap = data.objects || {};
          const arr: ObjectStatItem[] = Object.entries(objMap).map(([name, v]) => ({
            objectName: name,
            correct: Number(v?.correct || 0),
            incorrect: Number(v?.incorrect || 0),
            correctWord: v?.correct_word,
            lastAttempted: v?.last_attempted || undefined,
          }));
          arr.sort((a, b) => {
            const ta = a.lastAttempted ? Date.parse(a.lastAttempted) : 0;
            const tb = b.lastAttempted ? Date.parse(b.lastAttempted) : 0;
            if (tb !== ta) return tb - ta;
            return a.objectName.localeCompare(b.objectName);
          });
          setObjectsStats(arr);

          // Calculate overall stats
          const totalWords = Object.keys(objMap).length;
          const totalSessions = data.sessions?.length || 0;

          let totalCorrect = 0;
          let totalIncorrect = 0;
          Object.values(objMap).forEach((obj) => {
            totalCorrect += Number(obj.correct || 0);
            totalIncorrect += Number(obj.incorrect || 0);
          });

          const totalAttempts = totalCorrect + totalIncorrect;
          const overallAccuracy = totalAttempts > 0 ? (totalCorrect / totalAttempts) * 100 : 0;

          setOverallStats({
            totalWords,
            totalSessions,
            overallAccuracy: Math.round(overallAccuracy * 10) / 10, // Round to 1 decimal
            totalAttempts,
          });
        }
      } catch {}
      if (!cancelled) setLoadingStats(false);
    };
    loadProgress();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [backendUrl, username, profileReady]);

  const StatCard = ({ value, label }: { value: string | number; label: string }) => (
    <Card>
      <CardContent className="pt-6">
        <div className="text-3xl font-bold mb-1">{value}</div>
        <div className="text-sm text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );

  const masteryData: MasteryCategory[] = useMemo(() => {
    if (objectsStats.length === 0) return [];

    const categories = {
      'Not Started': { count: 0, color: '#94a3b8' },
      'Needs Practice': { count: 0, color: '#ef4444' },
      'Learning': { count: 0, color: '#f59e0b' },
      'Mastered': { count: 0, color: '#10b981' },
    };

    objectsStats.forEach((obj) => {
      const total = obj.correct + obj.incorrect;
      if (total === 0) {
        categories['Not Started'].count++;
      } else {
        const accuracy = (obj.correct / total) * 100;
        if (accuracy < 50) {
          categories['Needs Practice'].count++;
        } else if (accuracy < 80) {
          categories['Learning'].count++;
        } else {
          categories['Mastered'].count++;
        }
      }
    });

    return Object.entries(categories)
      .filter(([_, data]) => data.count > 0)
      .map(([name, data]) => ({
        name,
        value: data.count,
        color: data.color,
      }));
  }, [objectsStats]);

  const needsPracticeWords = useMemo(() => {
    if (objectsStats.length === 0) return [];

    return objectsStats
      .map((obj) => {
        const total = obj.correct + obj.incorrect;
        if (total === 0) return null; // Skip words with no attempts

        const accuracy = (obj.correct / total) * 100;
        return {
          ...obj,
          accuracy: Math.round(accuracy * 10) / 10, // Round to 1 decimal
          totalAttempts: total,
        };
      })
      .filter((obj): obj is NeedsPracticeWord => {
        return obj !== null && obj.accuracy < 50;
      })
      .sort((a, b) => {
        // Primary sort: accuracy ascending (lowest first)
        if (a.accuracy !== b.accuracy) {
          return a.accuracy - b.accuracy;
        }
        // Secondary sort: most recently attempted first
        const ta = a.lastAttempted ? Date.parse(a.lastAttempted) : 0;
        const tb = b.lastAttempted ? Date.parse(b.lastAttempted) : 0;
        return tb - ta;
      });
  }, [objectsStats]);

  return (
    <div className="space-y-4">
      {/* Overall Stats Cards */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Overall Statistics</h2>
        <div className="grid grid-cols-2 gap-4">
          <StatCard value={overallStats.totalWords} label="Total Words Learned" />
          <StatCard value={overallStats.totalSessions} label="Total Sessions" />
          <StatCard value={`${overallStats.overallAccuracy}%`} label="Overall Accuracy" />
          <StatCard value={overallStats.totalAttempts} label="Total Attempts" />
        </div>
      </div>

      {/* Mastery Distribution Pie Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mastery Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingStats ? (
            <div className="text-sm text-muted-foreground">Loading...</div>
          ) : masteryData.length === 0 ? (
            <div className="text-sm text-muted-foreground">No words practiced yet.</div>
          ) : (
            <div className="w-full h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={masteryData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${((percent || 0) * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {masteryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => [value, 'Words']}
                    contentStyle={{
                      backgroundColor: '#fff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '6px',
                    }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Needs Practice List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Needs Practice</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingStats ? (
            <div className="text-sm text-muted-foreground">Loading...</div>
          ) : needsPracticeWords.length === 0 ? (
            <div className="text-sm text-muted-foreground">Great job! All practiced words are above 50% accuracy.</div>
          ) : (
            <ScrollArea className="max-h-64">
              <div className="text-sm">
                <div className="grid grid-cols-5 gap-2 font-medium mb-2">
                  <div className="col-span-2">Word</div>
                  <div>Accuracy</div>
                  <div>Correct</div>
                  <div>Incorrect</div>
                  <div>Last tried</div>
                </div>
                <div className="space-y-1">
                  {needsPracticeWords.map((o) => (
                    <div key={o.objectName} className="grid grid-cols-5 gap-2 items-center">
                      <div className="col-span-2 truncate" title={o.correctWord || o.objectName}>
                        {o.correctWord || o.objectName}
                      </div>
                      <div>{o.accuracy}%</div>
                      <div>{o.correct}</div>
                      <div>{o.incorrect}</div>
                      <div className="truncate" title={o.lastAttempted || ''}>
                        {o.lastAttempted ? new Date(o.lastAttempted).toLocaleString() : '-'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Practice History Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Practice History</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingStats ? (
            <div className="text-sm text-muted-foreground">Loading...</div>
          ) : objectsStats.length === 0 ? (
            <div className="text-sm text-muted-foreground">No words practiced yet.</div>
          ) : (
            <ScrollArea className="max-h-64">
              <div className="text-sm">
                <div className="grid grid-cols-5 gap-2 font-medium mb-2">
                  <div className="col-span-2">Word</div>
                  <div>Correct</div>
                  <div>Incorrect</div>
                  <div>Last tried</div>
                </div>
                <div className="space-y-1">
                  {objectsStats.map((o) => (
                    <div key={o.objectName} className="grid grid-cols-5 gap-2 items-center">
                      <div className="col-span-2 truncate" title={o.correctWord || o.objectName}>
                        {o.correctWord || o.objectName}
                      </div>
                      <div>{o.correct}</div>
                      <div>{o.incorrect}</div>
                      <div className="truncate" title={o.lastAttempted || ''}>
                        {o.lastAttempted ? new Date(o.lastAttempted).toLocaleString() : '-'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

