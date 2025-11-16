'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';

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

