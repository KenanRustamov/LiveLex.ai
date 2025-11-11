'use client';

import { useEffect, useMemo, useState } from 'react';
import CameraView from './CameraView';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function MobileShell() {
  const backendUrl = useMemo(
    () => process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000',
    []
  );
  const [tab, setTab] = useState<'home' | 'camera' | 'profile'>('camera'); // default to camera

  const [username, setUsername] = useState('User');
  const [editingName, setEditingName] = useState('');
  const [profileReady, setProfileReady] = useState(false);

  type UserSettings = {
    sourceLanguage: string;
    targetLanguage: string;
    location: string;
    actions: string[];
    proficiencyLevel: number;
  };

  const DEFAULT_SETTINGS: UserSettings = {
    sourceLanguage: 'English',
    targetLanguage: 'Spanish',
    location: 'Baltimore, Maryland',
    actions: ['Pick up'],
    proficiencyLevel: 1,
  };

  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [objectsStats, setObjectsStats] = useState<Array<{ objectName: string; correct: number; incorrect: number; correctWord?: string; lastAttempted?: string }>>([]);
  const [loadingStats, setLoadingStats] = useState<boolean>(false);

  useEffect(() => {
    try {
      const rawSettings = localStorage.getItem('livelex_settings');
      const rawProfile = localStorage.getItem('livelex_profile');

      if (rawSettings) {
        const parsed = JSON.parse(rawSettings);
        if (parsed && typeof parsed === 'object') {
          setSettings({ ...DEFAULT_SETTINGS, ...parsed });
        }
      }

      if (rawProfile) {
        const parsedProfile = JSON.parse(rawProfile);
        if (parsedProfile.username) setUsername(parsedProfile.username);
      }
    } catch {}
    setProfileReady(true);
  }, []);

  useEffect(() => {
    if (!profileReady) return;
    if (!username || username === 'User') return;
    const controller = new AbortController();
    let cancelled = false;

    const loadObjects = async () => {
      setLoadingStats(true);
      try {
        const res = await fetch(`${backendUrl}/v1/user/${encodeURIComponent(username)}/objects`, { signal: controller.signal });
        if (res.ok) {
          const data = await res.json();
          if (cancelled) return;
          const objMap = (data && data.objects) || {};
          const arr = Object.entries(objMap).map(([name, v]: [string, any]) => ({
            objectName: name,
            correct: Number(v?.correct || 0),
            incorrect: Number(v?.incorrect || 0),
            correctWord: v?.correct_word,
            lastAttempted: v?.last_attempted,
          }));
          arr.sort((a, b) => {
            const ta = a.lastAttempted ? Date.parse(a.lastAttempted) : 0;
            const tb = b.lastAttempted ? Date.parse(b.lastAttempted) : 0;
            if (tb !== ta) return tb - ta;
            return a.objectName.localeCompare(b.objectName);
          });
          setObjectsStats(arr);
        }
      } catch {}
      if (!cancelled) setLoadingStats(false);
    };
    loadObjects();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [backendUrl, username, profileReady]);

  const saveSettings = (next: Partial<UserSettings>) => {
    const merged = { ...settings, ...next };
    setSettings(merged);
    try { localStorage.setItem('livelex_settings', JSON.stringify(merged)); } catch {}
  };

  const saveUsername = (name: string) => {
    setUsername(name);
    try {
      localStorage.setItem('livelex_profile', JSON.stringify({ username: name }));
    } catch {}
  };

  const tabBtn = (name: 'camera' | 'profile', label: string) => (
    <Button
      onClick={() => setTab(name)}
      variant={tab === name ? 'default' : 'outline'}
      className="px-3 py-1.5 text-sm"
      aria-current={tab === name ? 'page' : undefined}
    >
      {label}
    </Button>
  );

  return (
    <main className="min-h-dvh flex flex-col">
      <section className="flex-1">
        <div className="mx-auto w-full px-4 py-6 space-y-4">
          {tab === 'camera' && <CameraView settings={settings} username={username}/>}

          {tab === 'profile' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Profile</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-3">
                                    <div className="text-sm">
                    <Label className="block mb-1">Username</Label>
                    <div className="flex gap-2">
                      <Input
                        type="text"
                        value={editingName || username}
                        onChange={(e) => setEditingName(e.target.value)}
                      />
                      <Button
                        variant="default"
                        onClick={() => {
                          if (editingName.trim()) {
                            saveUsername(editingName.trim());
                            setEditingName('');
                          }
                        }}
                      >
                        Save
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Your username is stored locally and can be changed anytime.
                    </p>
                  </div>
                  <div className="text-sm">
                    <Label className="block mb-1">Source language</Label>
                    <Input
                      type="text"
                      value={settings.sourceLanguage}
                      onChange={(e) => saveSettings({ sourceLanguage: e.target.value })}
                    />
                  </div>
                  <div className="text-sm">
                    <Label className="block mb-1">Target language</Label>
                    <Input
                      type="text"
                      value={settings.targetLanguage}
                      onChange={(e) => saveSettings({ targetLanguage: e.target.value })}
                    />
                  </div>
                  <div className="text-sm">
                    <Label className="block mb-1">Location</Label>
                    <Input
                      type="text"
                      value={settings.location}
                      onChange={(e) => saveSettings({ location: e.target.value })}
                    />
                  </div>
                  <div className="text-sm">
                    <Label className="block mb-1">Actions</Label>
                    <Select
                      value={settings.actions[0]}
                      onChange={(e) => saveSettings({ actions: [e.target.value] })}
                    >
                      <option value="Pick up">Pick up</option>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">For now, only "Pick up" is supported.</p>
                  </div>
                  <div className="text-sm">
                    <Label className="block mb-1">Proficiency level</Label>
                    <Select
                      className="border border-gray-300 rounded-md px-2 py-1 w-full"
                      value={settings.proficiencyLevel}
                      onChange={(e) => saveSettings({ proficiencyLevel: Number(e.target.value) })}
                    >
                      <option value={1}>1 - No Experience</option>
                      <option value={2}>2 - Basic</option>
                      <option value={3}>3 - Intermediate</option>
                      <option value={4}>4 - Advanced</option>
                      <option value={5}>5 - Fluent</option>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">
                      Adjusts how much {settings.targetLanguage} is used in conversation.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          {tab === 'profile' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Practice history</CardTitle>
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
                            <div className="truncate" title={o.lastAttempted || ''}>{o.lastAttempted ? new Date(o.lastAttempted).toLocaleString() : '-'}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      <nav className="sticky bottom-0 bg-white/80 backdrop-blur border-t">
        <div className="mx-auto max-w-md w-full px-6 py-3 flex items-center justify-between">
          {tabBtn('camera', 'Camera')}
          {tabBtn('profile', 'Profile')}
        </div>
      </nav>
    </main>
  );
}
