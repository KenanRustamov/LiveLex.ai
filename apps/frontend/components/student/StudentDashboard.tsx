import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Trophy, Activity, CheckCircle, Camera, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CapturedScene } from '@/hooks/useStudentData';

interface StudentDashboardProps {
    onNavigate: (view: 'home' | 'tasks' | 'analytics' | 'profile' | 'camera' | 'scene-capture' | 'self-guided') => void;
    wordsLearned: number;
    streakDays: number;
    capturedScenes?: CapturedScene[];
}

export function StudentDashboard({ onNavigate, wordsLearned, streakDays, capturedScenes = [] }: StudentDashboardProps) {
    const [expandedScenes, setExpandedScenes] = useState<Set<string>>(new Set());

    const toggleSceneExpanded = (sceneId: string) => {
        setExpandedScenes(prev => {
            const next = new Set(prev);
            if (next.has(sceneId)) {
                next.delete(sceneId);
            } else {
                next.add(sceneId);
            }
            return next;
        });
    };
    return (
        <div className="space-y-6 animate-in fade-in-50 duration-500 pb-20">
            {/* Recent Achievements */}
            <div>
                <h2 className="text-lg font-bold mb-4">Your Progress</h2>
                <div className="grid grid-cols-2 gap-4">
                    <Card className="rounded-[2rem] border-none shadow-sm">
                        <CardContent className="p-6 flex flex-col items-center text-center">
                            <div className="h-12 w-12 bg-green-100 rounded-full flex items-center justify-center text-green-600 mb-3">
                                <Activity size={24} />
                            </div>
                            <span className="text-2xl font-bold">{wordsLearned}</span>
                            <span className="text-xs text-muted-foreground">Words Learned</span>
                        </CardContent>
                    </Card>
                    <Card className="rounded-[2rem] border-none shadow-sm">
                        <CardContent className="p-6 flex flex-col items-center text-center">
                            <div className="h-12 w-12 bg-yellow-100 rounded-full flex items-center justify-center text-yellow-600 mb-3">
                                <Trophy size={24} />
                            </div>
                            <span className="text-2xl font-bold">{streakDays}</span>
                            <span className="text-xs text-muted-foreground">Streak Days</span>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Greeting / Status */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold">Ready to learn?</h1>
                    <p className="text-muted-foreground">Pick a mode to start practicing.</p>
                </div>
            </div>

            {/* Practice Modes */}
            <div className="grid grid-cols-1 gap-4">
                <Card
                    className="rounded-[2rem] border-none shadow-sm bg-blue-50/50 overflow-hidden relative group cursor-pointer hover:bg-blue-50 transition-colors"
                    onClick={() => onNavigate('camera')}
                >
                    <CardContent className="p-6 flex items-center justify-between">
                        <div>
                            <h3 className="font-bold text-lg text-blue-900 mb-1">Free Practice</h3>
                            <p className="text-sm text-blue-700/80">Point your camera at anything to learn about it.</p>
                        </div>
                        <div className="h-12 w-12 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform">
                            <Camera size={24} />
                        </div>
                    </CardContent>
                </Card>

                <Card
                    className="rounded-[2rem] border-none shadow-sm bg-purple-50/50 overflow-hidden relative group cursor-pointer hover:bg-purple-50 transition-colors"
                    onClick={() => onNavigate('scene-capture')}
                >
                    <CardContent className="p-6 flex items-center justify-between">
                        <div>
                            <h3 className="font-bold text-lg text-purple-900 mb-1">Scene Collection</h3>
                            <p className="text-sm text-purple-700/80">Collect vocab to associate with a scene.</p>
                        </div>
                        <div className="h-12 w-12 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 group-hover:scale-110 transition-transform">
                            <Trophy size={24} />
                        </div>
                    </CardContent>
                </Card>

                {/* Self-Guided Lessons Button */}
                <Card
                    className="rounded-[2rem] border-none shadow-sm bg-orange-50/50 overflow-hidden relative group cursor-pointer hover:bg-orange-50 transition-colors"
                    onClick={() => onNavigate('self-guided')}
                >
                    <CardContent className="p-6 flex items-center justify-between">
                        <div>
                            <h3 className="font-bold text-lg text-orange-900 mb-1">Self-Guided Lessons</h3>
                            <p className="text-sm text-orange-700/80">Practice with your discovered words or custom vocab.</p>
                        </div>
                        <div className="h-12 w-12 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 group-hover:scale-110 transition-transform">
                            <Activity size={24} />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Captured Scenes */}
            <Card className="rounded-[2rem] border-none shadow-sm">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Camera size={20} className="text-primary" /> Captured Scenes
                    </CardTitle>
                    <CardDescription>Words you've discovered by exploring scenes.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    {capturedScenes.length === 0 ? (
                        <div className="text-center py-6 text-muted-foreground">
                            <Camera size={32} className="mx-auto mb-2 opacity-50" />
                            <p className="text-sm">No scenes captured yet.</p>
                            <p className="text-xs mt-1">Explore scenes to discover vocabulary!</p>
                        </div>
                    ) : (
                        capturedScenes.map((scene) => {
                            const isExpanded = expandedScenes.has(scene.scene_id);
                            return (
                                <div
                                    key={scene.scene_id}
                                    className="border border-gray-100 rounded-xl overflow-hidden"
                                >
                                    <button
                                        onClick={() => toggleSceneExpanded(scene.scene_id)}
                                        className="w-full p-4 flex items-center justify-between bg-gray-50/50 hover:bg-gray-100/50 transition-colors"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center">
                                                <Camera size={18} className="text-primary" />
                                            </div>
                                            <div className="text-left">
                                                <h4 className="font-semibold text-sm">{scene.scene_name}</h4>
                                                <p className="text-xs text-muted-foreground">
                                                    {scene.count} word{scene.count !== 1 ? 's' : ''} captured
                                                </p>
                                            </div>
                                        </div>
                                        {isExpanded ? (
                                            <ChevronUp size={18} className="text-muted-foreground" />
                                        ) : (
                                            <ChevronDown size={18} className="text-muted-foreground" />
                                        )}
                                    </button>
                                    {isExpanded && (
                                        <div className="p-4 border-t border-gray-100 bg-white">
                                            <div className="flex flex-wrap gap-1.5">
                                                {scene.words.map((word, idx) => (
                                                    <span
                                                        key={idx}
                                                        className="text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full font-medium"
                                                    >
                                                        {word.source_name} → {word.target_name}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
