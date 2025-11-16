'use client';

import { useEffect, useMemo, useState } from 'react';
import CameraView from './CameraView';
import AnalyticsView from './AnalyticsView';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';

export default function MobileShell() {
  const backendUrl = useMemo(
    () => process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000',
    []
  );
  const [tab, setTab] = useState<'camera' | 'profile' | 'analytics'>('camera'); // default to camera

  const [username, setUsername] = useState('User');
  const [editingName, setEditingName] = useState('');
  const [profileReady, setProfileReady] = useState(false);

  type UserSettings = {
    sourceLanguage: string;
    targetLanguage: string;
    location: string;
    actions: string[];
  };

  const DEFAULT_SETTINGS: UserSettings = {
    sourceLanguage: 'English',
    targetLanguage: 'Spanish',
    location: 'Baltimore, Maryland',
    actions: ['Pick up'],
  };

  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);

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

  const tabBtn = (name: 'camera' | 'profile' | 'analytics', label: string) => (
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

          {tab === 'analytics' && <AnalyticsView username={username} backendUrl={backendUrl} />}

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
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      <nav className="sticky bottom-0 bg-white/80 backdrop-blur border-t">
        <div className="mx-auto max-w-md w-full px-6 py-3 flex items-center justify-between gap-2">
          {tabBtn('camera', 'Camera')}
          {tabBtn('profile', 'Profile')}
          {tabBtn('analytics', 'Analytics')}
        </div>
      </nav>
    </main>
  );
}
