'use client';

import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { CheckCircle2, ChevronUp, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { achievements, type Achievement, type OverallStats } from '../config/achievements';

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

type ObjectStatItem = {
  objectName: string;
  correct: number;
  incorrect: number;
  accuracy: number;
  correctWord?: string;
  lastAttempted?: string;
};

type MasteryCategory = {
  name: string;
  value: number;
  color: string;
};

type AchievementStatus = Omit<Achievement, 'progress'> & {
  unlocked: boolean;
  progress?: { current: number; target: number };
};

export default function AnalyticsView({ username, backendUrl, onNavigate }: { username: string; backendUrl: string; onNavigate?: (view: string) => void; }) {
  const [loadingStats, setLoadingStats] = useState<boolean>(false);
  const [objectsStats, setObjectsStats] = useState<ObjectStatItem[]>([]);
  const [overallStats, setOverallStats] = useState<OverallStats>({
    totalWords: 0,
    totalSessions: 0,
    overallAccuracy: 0,
    totalAttempts: 0,
    sessions: [],
  });
  const [profileReady, setProfileReady] = useState(false);
  const [showAllAchievements, setShowAllAchievements] = useState(false);
  const [sortConfig, setSortConfig] = useState<{
    field: 'word' | 'accuracy' | 'correct' | 'incorrect' | 'lastTried';
    direction: 'asc' | 'desc';
  }>({ field: 'lastTried', direction: 'desc' });

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
          const arr: ObjectStatItem[] = Object.entries(objMap).map(([name, v]) => {
            const correct = Number(v?.correct || 0);
            const incorrect = Number(v?.incorrect || 0);
            const total = correct + incorrect;
            const accuracy = total > 0 ? Math.round((correct / total) * 100 * 10) / 10 : 0;
            
            return {
              objectName: name,
              correct,
              incorrect,
              accuracy,
              correctWord: v?.correct_word,
              lastAttempted: v?.last_attempted || undefined,
            };
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
            sessions: data.sessions || [],
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


  const achievementStatus: AchievementStatus[] = useMemo(() => {
    return achievements
      .map((achievement) => ({
        ...achievement,
        unlocked: achievement.criteria(overallStats),
        progress: achievement.progress?.(overallStats),
      }))
      .sort((a, b) => {
        // Sort by incomplete first (unlocked: false), then complete (unlocked: true)
        if (a.unlocked !== b.unlocked) {
          return a.unlocked ? 1 : -1;
        }
        // If both have same unlock status, maintain original order
        return 0;
      });
  }, [overallStats]);

  const displayedAchievements = showAllAchievements ? achievementStatus : achievementStatus.slice(0, 4);

  const sortedObjectsStats = useMemo(() => {
    const sorted = [...objectsStats];
    sorted.sort((a, b) => {
      let comparison = 0;
      switch (sortConfig.field) {
        case 'word':
          comparison = (a.correctWord || a.objectName).localeCompare(b.correctWord || b.objectName);
          break;
        case 'accuracy':
          comparison = a.accuracy - b.accuracy;
          break;
        case 'correct':
          comparison = a.correct - b.correct;
          break;
        case 'incorrect':
          comparison = a.incorrect - b.incorrect;
          break;
        case 'lastTried':
          const ta = a.lastAttempted ? Date.parse(a.lastAttempted) : 0;
          const tb = b.lastAttempted ? Date.parse(b.lastAttempted) : 0;
          comparison = ta - tb;
          break;
      }
      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });
    return sorted;
  }, [objectsStats, sortConfig]);

  const handleSort = (field: 'word' | 'accuracy' | 'correct' | 'incorrect' | 'lastTried') => {
    setSortConfig((prev) => {
      if (prev.field === field) {
        // Toggle direction if same field
        return { field, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      // Change field and default to ascending
      return { field, direction: 'asc' };
    });
  };

  return (
    <div className="space-y-4">
      {/* Practice Option Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Choose Practice Mode</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button 
              onClick={() => onNavigate?.('camera')}
              className="p-4 border-2 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all text-left"
            >
              <div className="text-lg font-semibold mb-2">Free Practice</div>
              <div className="text-sm text-muted-foreground">Practice any words you choose with the camera</div>
            </button>
            
            <button 
              onClick={() => onNavigate?.('scene-scanning')}
              className="p-4 border-2 rounded-lg hover:border-green-500 hover:bg-green-50 transition-all text-left"
            >
              <div className="text-lg font-semibold mb-2">Scene Scanning</div>
              <div className="text-sm text-muted-foreground">Scan your environment</div>
            </button>
            
            <button 
              onClick={() => onNavigate?.('assignments')}
              className="p-4 border-2 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition-all text-left"
            >
              <div className="text-lg font-semibold mb-2">Assignments</div>
              <div className="text-sm text-muted-foreground">See assigned lessons from your classes</div>
            </button>
          </div>
        </CardContent>
      </Card>
      {/* Achievements Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Achievements</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingStats ? (
            <div className="text-sm text-muted-foreground">Loading...</div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {displayedAchievements.map((achievement) => {
                const progressPercent = achievement.progress
                  ? Math.min((achievement.progress.current / achievement.progress.target) * 100, 100)
                  : 0;

                return (
                  <div
                    key={achievement.id}
                    className={`relative p-3 rounded-lg border h-full flex flex-col ${
                      achievement.unlocked
                        ? 'bg-green-50 border-green-200'
                        : 'bg-gray-50 border-gray-200 opacity-75'
                    }`}
                  >
                    <div className="flex flex-col items-center text-center h-full">
                      <div className="relative">
                        <img
                          src={achievement.imagePath}
                          alt={achievement.name}
                          className={`w-16 h-16 object-contain ${
                            achievement.unlocked ? '' : 'grayscale opacity-60'
                          }`}
                          onError={(e) => {
                            // Fallback if image fails to load
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                        {achievement.unlocked && (
                          <CheckCircle2
                            size={20}
                            className="absolute -top-1 -right-1 text-green-600 bg-white rounded-full"
                          />
                        )}
                      </div>
                      <div className="w-full flex-1 flex flex-col justify-between mt-2">
                        <div>
                          <div className={`font-semibold text-sm ${achievement.unlocked ? 'text-gray-900' : 'text-gray-600'}`}>
                            {achievement.name}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {achievement.description}
                          </div>
                        </div>
                        <div className="mt-2 min-h-[2.5rem]">
                          {!achievement.unlocked && achievement.progress ? (
                            <div className="space-y-1">
                              <div className="w-full bg-gray-200 rounded-full h-1.5">
                                <div
                                  className="bg-blue-500 h-1.5 rounded-full transition-all"
                                  style={{ width: `${progressPercent}%` }}
                                />
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {achievement.id === 'word-wanderer' || achievement.id === 'everyday-explorer' || achievement.id === 'label-legend'
                                  ? `${achievement.progress.current} / ${achievement.progress.target} words`
                                  : achievement.id === 'multispace-master'
                                  ? `${achievement.progress.current} / ${achievement.progress.target} sessions`
                                  : achievement.id === 'consistency-champion'
                                  ? `${achievement.progress.current} / ${achievement.progress.target} days`
                                  : `${achievement.progress.current} / ${achievement.progress.target}`}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              </div>
              {achievementStatus.length > 4 && (
                <div className="mt-4 flex justify-center">
                  <Button
                    variant="outline"
                    onClick={() => setShowAllAchievements(!showAllAchievements)}
                    className="text-sm"
                  >
                    {showAllAchievements ? 'Show Less' : `View All (${achievementStatus.length})`}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

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

      {/* Practice History Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Practice History</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingStats ? (
            <div className="text-sm text-muted-foreground">Loading...</div>
          ) : sortedObjectsStats.length === 0 ? (
            <div className="text-sm text-muted-foreground">No words practiced yet.</div>
          ) : (
            <ScrollArea className="max-h-64">
              <div className="text-sm">
                <div className="grid grid-cols-6 gap-2 font-medium mb-2">
                  <button
                    onClick={() => handleSort('word')}
                    className="col-span-2 text-left flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"
                  >
                    Word
                    {sortConfig.field === 'word' && (
                      sortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    )}
                  </button>
                  <button
                    onClick={() => handleSort('accuracy')}
                    className="text-left flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"
                  >
                    Accuracy
                    {sortConfig.field === 'accuracy' && (
                      sortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    )}
                  </button>
                  <button
                    onClick={() => handleSort('correct')}
                    className="text-left flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"
                  >
                    Correct
                    {sortConfig.field === 'correct' && (
                      sortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    )}
                  </button>
                  <button
                    onClick={() => handleSort('incorrect')}
                    className="text-left flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"
                  >
                    Incorrect
                    {sortConfig.field === 'incorrect' && (
                      sortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    )}
                  </button>
                  <button
                    onClick={() => handleSort('lastTried')}
                    className="text-left flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"
                  >
                    Last tried
                    {sortConfig.field === 'lastTried' && (
                      sortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    )}
                  </button>
                </div>
                <div className="space-y-1">
                  {sortedObjectsStats.map((o) => (
                    <div key={o.objectName} className="grid grid-cols-6 gap-2 items-center">
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
    </div>
  );
}

