import { Card, CardContent } from '@/components/ui/card';
import { Trophy, Activity, CheckCircle, Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface StudentDashboardProps {
    onNavigate: (view: 'home' | 'tasks' | 'analytics' | 'profile' | 'camera' | 'scene-capture') => void;
}

export function StudentDashboard({ onNavigate }: StudentDashboardProps) {
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
                            <span className="text-2xl font-bold">0</span>
                            <span className="text-xs text-muted-foreground">Words Learned</span>
                        </CardContent>
                    </Card>
                    <Card className="rounded-[2rem] border-none shadow-sm">
                        <CardContent className="p-6 flex flex-col items-center text-center">
                            <div className="h-12 w-12 bg-yellow-100 rounded-full flex items-center justify-center text-yellow-600 mb-3">
                                <Trophy size={24} />
                            </div>
                            <span className="text-2xl font-bold">0</span>
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
                            <p className="text-sm text-purple-700/80">Collect works to associate with a scene.</p>
                        </div>
                        <div className="h-12 w-12 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 group-hover:scale-110 transition-transform">
                            <Trophy size={24} />
                        </div>
                    </CardContent>
                </Card>

                {/* New Self-Guided Lessons Button */}
                <Card
                    className="rounded-[2rem] border-none shadow-sm bg-orange-50/50 overflow-hidden relative group cursor-pointer hover:bg-orange-50 transition-colors"
                    onClick={() => { /* TODO: Implement navigation */ }}
                >
                    <CardContent className="p-6 flex items-center justify-between">
                        <div>
                            <h3 className="font-bold text-lg text-orange-900 mb-1">Self-Guided Lessons</h3>
                            <p className="text-sm text-orange-700/80">Learning the words that are associated with a scene.</p>
                        </div>
                        <div className="h-12 w-12 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 group-hover:scale-110 transition-transform">
                            <Activity size={24} />
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
