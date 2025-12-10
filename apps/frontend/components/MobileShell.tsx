'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import CameraView from './CameraView';
import AnalyticsView from './AnalyticsView';
import SceneCaptureView from './SceneCaptureView';
import { Button } from '@/components/ui/button';
import { Home, ListTodo, User, BarChart } from 'lucide-react';
import { useStudentData } from '@/hooks/useStudentData';
import { StudentDashboard } from './student/StudentDashboard';
import { StudentAssignments } from './student/StudentAssignments';
import { StudentProfile } from './student/StudentProfile';

export default function MobileShell() {
  const { data: session } = useSession();
  const { enrolledTeacher, classCode, assignments, wordsLearned, streakDays, refresh } = useStudentData();
  const [tab, setTab] = useState<'home' | 'tasks' | 'analytics' | 'profile' | 'camera' | 'scene-capture'>('home');

  // User Settings
  const [settings, setSettings] = useState({
    sourceLanguage: 'English',
    targetLanguage: 'Spanish',
    location: 'Baltimore, Maryland',
    actions: ['Pick up'],
  });

  // Load Settings from LocalStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem('livelex_settings');
      if (raw) {
        const parsed = JSON.parse(raw);
        setSettings(prev => ({ ...prev, ...parsed }));
      }
    } catch { }
  }, []);

  // Save Settings to LocalStorage
  useEffect(() => {
    try {
      localStorage.setItem('livelex_settings', JSON.stringify(settings));
    } catch { }
  }, [settings]);


  const handleJoinClass = async (code: string) => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';
    const res = await fetch(`${backendUrl}/v1/auth/join-class`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: session?.user?.email, code })
    });
    if (res.ok) {
      alert("Joined class successfully!");
      refresh();
    } else {
      throw new Error("Failed");
    }
  };

  // Camera Overlay Mode
  if (tab === 'camera') {
    return (
      <div className="relative h-dvh w-full bg-black">
        <CameraView
          settings={settings}
          username={session?.user?.email || 'Student'}
          onClose={() => setTab('home')}
        />
        <Button
          variant="outline"
          className="absolute top-4 left-4 z-50 rounded-full bg-white/20 hover:bg-white/40 border-none text-white backdrop-blur-md"
          onClick={() => setTab('home')}
        >
          Exit Camera
        </Button>
      </div>
    );
  }

  // Scene Capture Overlay Mode
  if (tab === 'scene-capture') {
    return (
      <div className="relative h-dvh w-full bg-black">
        <SceneCaptureView settings={settings} email={session?.user?.email || undefined} />
        <Button
          variant="outline"
          className="absolute top-4 left-4 z-50 rounded-full bg-white/20 hover:bg-white/40 border-none text-white backdrop-blur-md"
          onClick={() => setTab('home')}
        >
          Exit Camera
        </Button>
      </div>
    );
  }

  const renderContent = () => {
    switch (tab) {
      case 'home':
        return <StudentDashboard onNavigate={(v) => setTab(v)} wordsLearned={wordsLearned} streakDays={streakDays} />;
      case 'tasks':
        return <StudentAssignments assignments={assignments} />;
      case 'analytics':
        return <AnalyticsView
          username={session?.user?.email || 'User'}
          backendUrl={process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000'}
          onNavigate={(view) => setTab(view as any)}
        />;
      case 'profile':
        return <StudentProfile
          classCode={classCode}
          enrolledTeacher={enrolledTeacher}
          onJoinClass={handleJoinClass}
          settings={settings}
          onSettingsChange={setSettings}
        />;
      default:
        return <StudentDashboard onNavigate={(v) => setTab(v)} wordsLearned={wordsLearned} streakDays={streakDays} />;
    }
  };

  return (
    <main className="h-dvh w-full flex flex-col bg-gray-50/50 overflow-hidden">
      {/* Scrollable Content Area */}
      <section className="flex-1 overflow-y-auto scrollbar-hide">
        <div className="w-full max-w-md mx-auto px-6 py-8 pb-4">
          {renderContent()}
        </div>
      </section>

      {/* Navigation Bar - Static at bottom of flex column */}
      <nav className="shrink-0 bg-white/80 backdrop-blur-xl border-t border-gray-200 pb-safe z-10 w-full">
        <div className="mx-auto max-w-md w-full px-6 py-2 flex items-center justify-between">
          <NavBtn active={tab === 'home'} onClick={() => setTab('home')} icon={Home} label="Home" />
          <NavBtn active={tab === 'tasks'} onClick={() => setTab('tasks')} icon={ListTodo} label="Tasks" />
          <NavBtn active={tab === 'analytics'} onClick={() => setTab('analytics')} icon={BarChart} label="Stats" />
          <NavBtn active={tab === 'profile'} onClick={() => setTab('profile')} icon={User} label="Profile" />
        </div>
      </nav>
    </main>
  );
}

interface NavBtnProps {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
}

function NavBtn({ active, onClick, icon: Icon, label }: NavBtnProps) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-1 p-2 rounded-xl transition-all duration-300 ${active ? 'text-primary' : 'text-gray-400 hover:text-gray-600'}`}
    >
      <Icon size={24} strokeWidth={active ? 2.5 : 2} />
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  )
}
