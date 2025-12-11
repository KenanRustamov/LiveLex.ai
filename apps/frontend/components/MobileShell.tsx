'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import CameraView from './CameraView';
import AnalyticsView from './AnalyticsView';
import SceneCaptureView from './SceneCaptureView';
import { Button } from '@/components/ui/button';
import { Home, ListTodo, User, BarChart } from 'lucide-react';
import { useStudentData, StudentAssignment } from '@/hooks/useStudentData';
import { StudentDashboard } from './student/StudentDashboard';
import { StudentAssignments } from './student/StudentAssignments';
import { StudentProfile } from './student/StudentProfile';
import { SelfGuidedLessonSetup } from './student/SelfGuidedLessonSetup';
import AssignmentLessonView from './AssignmentLessonView';

export default function MobileShell() {
  const { data: session } = useSession();
  const { enrolledTeacher, classCode, assignments, wordsLearned, streakDays, capturedScenes, refresh } = useStudentData();
  const [tab, setTab] = useState<'home' | 'tasks' | 'analytics' | 'profile' | 'camera' | 'scene-capture' | 'assignment' | 'self-guided'>('home');
  const [activeAssignment, setActiveAssignment] = useState<StudentAssignment | null>(null);

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

  const handleLeaveClass = async () => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';
    const res = await fetch(`${backendUrl}/v1/auth/leave-class`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: session?.user?.email })
    });
    if (res.ok) {
      alert("Left class successfully!");
      refresh();
    } else {
      const error = await res.json();
      throw new Error(error.detail || "Failed to leave class");
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

  // Assignment Lesson Mode
  if (tab === 'assignment' && activeAssignment) {
    return (
      <div className="relative h-dvh w-full bg-black">
        <AssignmentLessonView
          assignment={activeAssignment}
          settings={settings}
          username={session?.user?.email || 'Student'}
          onClose={() => {
            setActiveAssignment(null);
            setTab('tasks');
          }}
        />
        <Button
          variant="outline"
          className="absolute top-4 left-4 z-50 rounded-full bg-white/20 hover:bg-white/40 border-none text-white backdrop-blur-md"
          onClick={() => {
            setActiveAssignment(null);
            setTab('tasks');
          }}
        >
          Exit Assignment
        </Button>
      </div>
    );
  }

  // Handler to start an assignment
  const handleStartAssignment = (assignment: StudentAssignment) => {
    setActiveAssignment(assignment);
    setTab('assignment');
  };

  // Handler to start a self-guided lesson
  const handleStartSelfGuidedLesson = (config: {
    title: string;
    vocab: { source_name: string; target_name: string }[];
    scene_id?: string;
    scene_name?: string;
    include_grammar: boolean;
    grammar_tense?: string;
  }) => {
    // Create an ephemeral assignment object (no id needed for self-guided)
    const ephemeralAssignment: StudentAssignment = {
      id: '', // Empty ID indicates self-guided
      title: config.title,
      vocab: config.vocab,
      created_at: new Date().toISOString(),
      scene_id: config.scene_id,
      scene_name: config.scene_name,
      teacher_id: '', // Not applicable for self-guided
      include_grammar: config.include_grammar,
      grammar_tense: config.grammar_tense,
    };
    setActiveAssignment(ephemeralAssignment);
    setTab('assignment');
  };

  const renderContent = () => {
    switch (tab) {
      case 'home':
        return <StudentDashboard onNavigate={(v) => setTab(v)} wordsLearned={wordsLearned} streakDays={streakDays} capturedScenes={capturedScenes} />;
      case 'tasks':
        return <StudentAssignments assignments={assignments} onStartAssignment={handleStartAssignment} />;
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
          onLeaveClass={handleLeaveClass}
          settings={settings}
          onSettingsChange={setSettings}
        />;
      case 'self-guided':
        return <SelfGuidedLessonSetup
          capturedScenes={capturedScenes}
          onStartLesson={handleStartSelfGuidedLesson}
          onCancel={() => setTab('home')}
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
