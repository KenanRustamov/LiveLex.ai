import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LogOut, User as UserIcon, Settings, ChevronLeft } from 'lucide-react';
import { signOut, useSession } from 'next-auth/react';

interface StudentProfileProps {
    classCode: string;
    enrolledTeacher: string | null;
    onJoinClass: (code: string) => Promise<void>;
    settings: any; // We can improve type safety later
    onSettingsChange: (settings: any) => void;
}

export function StudentProfile({ classCode, enrolledTeacher, onJoinClass, settings, onSettingsChange }: StudentProfileProps) {
    const { data: session } = useSession();
    const [inputCode, setInputCode] = useState(classCode || '');
    const [joining, setJoining] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showSettings, setShowSettings] = useState(false);

    const handleJoin = async () => {
        if (!inputCode) return;
        setJoining(true);
        setError(null);
        try {
            await onJoinClass(inputCode);
        } catch (err) {
            setError("Failed to join class. Check code.");
        } finally {
            setJoining(false);
        }
    };

    if (showSettings) {
        return (
            <div className="space-y-6 animate-in fade-in-50 duration-500 pb-20">
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={() => setShowSettings(false)}>
                        <ChevronLeft size={24} />
                    </Button>
                    <h1 className="text-2xl font-bold">Preferences</h1>
                </div>

                <Card className="rounded-[2rem] border-none shadow-sm">
                    <CardContent className="p-6 space-y-4">
                        <div className="space-y-2">
                            <Label>Source Language</Label>
                            <Input
                                value={settings.sourceLanguage}
                                onChange={(e) => onSettingsChange({ ...settings, sourceLanguage: e.target.value })}
                                className="rounded-xl"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Target Language</Label>
                            <Input
                                value={settings.targetLanguage}
                                onChange={(e) => onSettingsChange({ ...settings, targetLanguage: e.target.value })}
                                className="rounded-xl"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Location</Label>
                            <Input
                                value={settings.location}
                                onChange={(e) => onSettingsChange({ ...settings, location: e.target.value })}
                                className="rounded-xl"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Proficiency Level</Label>
                            <Select
                                value={settings.proficiencyLevel?.toString()}
                                onChange={(e) => onSettingsChange({ ...settings, proficiencyLevel: parseInt(e.target.value) })}
                                className="w-full rounded-xl border border-input p-2"
                            >
                                <option value="1">1 - Beginner</option>
                                <option value="2">2 - Basic</option>
                                <option value="3">3 - Intermediate</option>
                                <option value="4">4 - Advanced</option>
                                <option value="5">5 - Fluent</option>
                            </Select>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in-50 duration-500 pb-20">
            <div>
                <h1 className="text-2xl font-bold">Profile</h1>
                <p className="text-muted-foreground">Manage your account and classes.</p>
            </div>

            {/* User Info */}
            <Card className="rounded-[2rem] border-none shadow-sm">
                <CardContent className="p-6 flex items-center gap-4">
                    <Avatar className="h-16 w-16 border-2 border-white shadow-sm">
                        <AvatarImage src={session?.user?.image || ''} />
                        <AvatarFallback className="bg-primary/10 text-primary text-xl">
                            {session?.user?.name?.[0] || 'U'}
                        </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                        <h2 className="font-bold text-lg">{session?.user?.name || 'Student'}</h2>
                        <p className="text-sm text-muted-foreground">{session?.user?.email}</p>
                    </div>
                </CardContent>
            </Card>

            {/* Class Enrollment */}
            <Card className="rounded-[2rem] border-none shadow-sm">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <UserIcon size={20} className="text-primary" /> Class Enrollment
                    </CardTitle>
                    <CardDescription>Join a teacher's classroom to receive assignments.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {enrolledTeacher ? (
                        <div className="bg-green-50 p-4 rounded-xl border border-green-100 flex items-center justify-between">
                            <div>
                                <h3 className="font-semibold text-green-900">Enrolled</h3>
                                <p className="text-sm text-green-700">You are in {enrolledTeacher}'s class.</p>
                            </div>
                            <CheckCircleIcon className="text-green-600 h-6 w-6" />
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <Label htmlFor="code">Teacher Code</Label>
                            <div className="flex gap-2">
                                <Input
                                    id="code"
                                    placeholder="e.g. A1B2C3D4"
                                    value={inputCode}
                                    onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                                    className="rounded-xl uppercase font-mono tracking-widest"
                                    maxLength={8}
                                />
                                <Button onClick={handleJoin} disabled={joining} className="rounded-xl">
                                    {joining ? 'Joining...' : 'Join'}
                                </Button>
                            </div>
                            {error && <p className="text-xs text-red-500 font-medium ml-1">{error}</p>}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Preferences */}
            <Card className="rounded-[2rem] border-none shadow-sm bg-gray-50/50">
                <CardContent className="p-4">
                    <Button
                        variant="ghost"
                        className="w-full justify-start text-muted-foreground hover:text-foreground h-12"
                        onClick={() => setShowSettings(true)}
                    >
                        <Settings className="mr-3 h-5 w-5" /> Learning Preferences
                    </Button>
                    <Button variant="ghost" className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50 h-12" onClick={() => signOut()}>
                        <LogOut className="mr-3 h-5 w-5" /> Sign Out
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}

function CheckCircleIcon(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
    )
}
