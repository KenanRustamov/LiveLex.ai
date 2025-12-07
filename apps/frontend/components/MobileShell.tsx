'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
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
  const [tab, setTab] = useState<'camera' | 'profile' | 'analytics' | 'assignments'>('analytics'); // default to analytics (now stats)

  const { data: session } = useSession();
  const [username, setUsername] = useState(session?.user?.name || session?.user?.email || 'User');
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

  // Class Enrollment State
  const [classCode, setClassCode] = useState('');
  const [enrolledTeacher, setEnrolledTeacher] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<any[]>([]);

  useEffect(() => {
    if (session?.user?.email) {
      // Fetch enrollment status using the 'me' endpoint
      fetch(`${backendUrl}/v1/auth/me?email=${session.user.email}`)
        .then(res => res.json())
        .then(data => {
          if (data.enrolled_class_code) {
            setClassCode(data.enrolled_class_code);
            setEnrolledTeacher("Teacher");

            // Fetch assignments if enrolled
            fetch(`${backendUrl}/v1/assignments?email=${session?.user?.email}`)
              .then(r => r.json())
              .then(d => setAssignments(d))
              .catch(e => console.error("Failed to fetch assignments", e));
          }
        })
        .catch(err => console.error("Failed to fetch enrollment", err));
    }
  }, [session, backendUrl]);

  const handleJoinClass = async () => {
    if (!classCode) return;
    setJoining(true);
    setErrorMessage(null); // Clear previous errors
    try {
      const res = await fetch(`${backendUrl}/v1/auth/join-class`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: session?.user?.email,
          code: classCode
        })
      });
      if (res.ok) {
        const data = await res.json();
        setEnrolledTeacher(data.teacher_name);
        alert(`Successfully joined ${data.teacher_name}'s class!`);
      } else {
        // Assume 404 means not found
        if (res.status === 404) {
          setErrorMessage("Teacher code not found. Please try again.");
        } else {
          setErrorMessage("Failed to join class. Please try again.");
        }
      }
    } catch (e) {
      console.error(e);
      setErrorMessage("An unexpected error occurred.");
    } finally {
      setJoining(false);
    }
  };

  useEffect(() => {
    try {
      if (session?.user?.name) setUsername(session.user.name);
      else if (session?.user?.email) setUsername(session.user.email);

      const rawSettings = localStorage.getItem('livelex_settings');

      if (rawSettings) {
        const parsed = JSON.parse(rawSettings);
        if (parsed && typeof parsed === 'object') {
          setSettings({ ...DEFAULT_SETTINGS, ...parsed });
        }
      }
    } catch { }
    setProfileReady(true);
  }, [session]);


  const saveSettings = (next: Partial<UserSettings>) => {
    const merged = { ...settings, ...next };
    setSettings(merged);
    try { localStorage.setItem('livelex_settings', JSON.stringify(merged)); } catch { }
  };

  const saveUsername = (name: string) => {
    setUsername(name);
    try {
      localStorage.setItem('livelex_profile', JSON.stringify({ username: name }));
    } catch { }
  };

  const tabBtn = (name: 'camera' | 'profile' | 'analytics' | 'assignments', label: string) => (
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
          {tab === 'camera' && <CameraView key={JSON.stringify(settings)} settings={settings} username={username} />}

          {tab === 'analytics' && <AnalyticsView username={username} backendUrl={backendUrl} onNavigate={(nextView) => setTab(nextView as 'camera' | 'profile' | 'analytics' | 'assignments')}/>}

          {tab === 'assignments' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Assignments</CardTitle>
              </CardHeader>
              <CardContent>
                {assignments.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No assignments yet.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {assignments.map((assignment: any) => (
                      <div key={assignment.id} className="p-3 border rounded-lg bg-gray-50 dark:bg-gray-800">
                        <h3 className="font-medium text-sm">{assignment.title}</h3>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {assignment.words.map((w: string, i: number) => (
                            <span key={i} className="text-xs bg-white dark:bg-black border px-1.5 py-0.5 rounded">
                              {w}
                            </span>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          {new Date(assignment.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {tab === 'profile' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Profile</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-3">
                  <div className="text-sm">
                    <Label className="block mb-1">Class Code</Label>
                    <div className="flex gap-2">
                      <Input
                        type="text"
                        placeholder="Enter Teacher Code"
                        value={classCode}
                        onChange={(e) => {
                          setClassCode(e.target.value.toUpperCase());
                          setErrorMessage(null); // Clear error on type
                        }}
                        maxLength={8}
                        className={errorMessage ? "border-red-500 focus-visible:ring-red-500" : ""}
                      />
                      <Button onClick={handleJoinClass} disabled={joining || !!enrolledTeacher}>
                        {enrolledTeacher ? 'Joined' : 'Join'}
                      </Button>
                    </div>
                    {errorMessage && (
                      <p className="text-xs text-red-500 mt-1 font-medium">
                        {errorMessage}
                      </p>
                    )}
                    {enrolledTeacher && (
                      <p className="text-xs text-green-600 mt-1">
                        Enrolled in {enrolledTeacher}'s class
                      </p>
                    )}
                    {!enrolledTeacher && !errorMessage && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Ask your teacher for their unique code.
                      </p>
                    )}
                  </div>
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
        </div>
      </section>

      <nav className="sticky bottom-0 bg-white/80 backdrop-blur border-t">
        <div className="mx-auto max-w-md w-full px-6 py-3 flex items-center justify-between gap-1 overflow-x-auto">
          {tabBtn('assignments', 'Tasks')}
          {tabBtn('analytics', 'Dashboard')}
          {tabBtn('profile', 'Profile')}
        </div>
      </nav>
    </main>
  );
}
