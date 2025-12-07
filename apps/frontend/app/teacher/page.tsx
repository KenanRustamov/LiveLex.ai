'use client';

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useSession, signOut } from 'next-auth/react';
import { useEffect, useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Trophy, Activity, AlertCircle, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import AnalyticsView from '@/components/AnalyticsView';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function TeacherDashboard() {
    const { data: session } = useSession();
    const [teacherCode, setTeacherCode] = useState<string | null>(null);
    const [students, setStudents] = useState<any[]>([]);
    const [assignments, setAssignments] = useState<any[]>([]);
    const [scenes, setScenes] = useState<any[]>([]);
    const [classAnalytics, setClassAnalytics] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    // Assignment Creation State
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const [newAssignmentTitle, setNewAssignmentTitle] = useState("");
    const [newAssignmentWords, setNewAssignmentWords] = useState("");
    const [newAssignmentSceneId, setNewAssignmentSceneId] = useState<string>("none");
    const [newAssignmentDiscoveredCount, setNewAssignmentDiscoveredCount] = useState<number>(0);
    const [creating, setCreating] = useState(false);

    // Scene Creation State
    const [newSceneName, setNewSceneName] = useState("");
    const [newSceneDesc, setNewSceneDesc] = useState("");
    const [newSceneWords, setNewSceneWords] = useState("");
    const [creatingScene, setCreatingScene] = useState(false);

    // Analytics Modal State
    const [selectedStudent, setSelectedStudent] = useState<any | null>(null);

    useEffect(() => {
        const fetchProfile = async () => {
            if (session?.user?.email) {
                try {
                    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';
                    // Fetch profile
                    const res = await fetch(`${backendUrl}/v1/auth/me?email=${session.user.email}`);
                    if (res.ok) {
                        const data = await res.json();
                        setTeacherCode(data.teacher_code);
                    }

                    // Fetch students (now includes stats)
                    const resStudents = await fetch(`${backendUrl}/v1/auth/teacher/students?email=${session.user.email}`);
                    if (resStudents.ok) {
                        const studentsData = await resStudents.json();
                        setStudents(studentsData);
                    }


                    // Fetch assignments
                    const resAssignments = await fetch(`${backendUrl}/v1/assignments?email=${session.user.email}`);
                    if (resAssignments.ok) {
                        const assignmentsData = await resAssignments.json();
                        setAssignments(assignmentsData);
                    }

                    // Fetch scenes
                    const resScenes = await fetch(`${backendUrl}/v1/scenes?email=${session.user.email}`);
                    if (resScenes.ok) {
                        const scenesData = await resScenes.json();
                        setScenes(scenesData);
                    }

                    // Fetch class analytics
                    const resAnalytics = await fetch(`${backendUrl}/v1/auth/teacher/analytics?email=${session.user.email}`);
                    if (resAnalytics.ok) {
                        const analyticsData = await resAnalytics.json();
                        setClassAnalytics(analyticsData);
                    }

                } catch (error) {
                    console.error("Failed to fetch data", error);
                } finally {
                    setLoading(false);
                }
            }
        };
        fetchProfile();
    }, [session]);

    const handleCreateAssignment = async () => {
        if (!newAssignmentTitle || !newAssignmentWords) return;
        setCreating(true);
        try {
            const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';
            const wordsList = newAssignmentWords.split('\n').filter(w => w.trim() !== '');

            const payload: any = {
                email: session?.user?.email,
                title: newAssignmentTitle,
                words: wordsList,
                include_discovered_count: newAssignmentDiscoveredCount
            };

            if (newAssignmentSceneId && newAssignmentSceneId !== "none") {
                payload.scene_id = newAssignmentSceneId;
            }

            const res = await fetch(`${backendUrl}/v1/assignments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                const data = await res.json();
                // Refresh list locally (approximate)
                const newAssignment = {
                    id: data.id,
                    title: newAssignmentTitle,
                    words: wordsList,
                    scene_id: newAssignmentSceneId !== "none" ? newAssignmentSceneId : null,
                    include_discovered_count: newAssignmentDiscoveredCount,
                    created_at: new Date().toISOString()
                };
                setAssignments([newAssignment, ...assignments]);

                // Reset form
                setNewAssignmentTitle("");
                setNewAssignmentWords("");
                setNewAssignmentSceneId("none");
                setNewAssignmentDiscoveredCount(0);
            }
        } catch (error) {
            console.error("Failed to create assignment", error);
        } finally {
            setCreating(false);
        }
    };

    const handleCreateScene = async () => {
        if (!newSceneName || !newSceneDesc) return;
        setCreatingScene(true);
        try {
            const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';
            const wordsList = newSceneWords.split('\n').filter(w => w.trim() !== '');

            const res = await fetch(`${backendUrl}/v1/scenes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: session?.user?.email,
                    name: newSceneName,
                    description: newSceneDesc,
                    teacher_words: wordsList
                })
            });

            if (res.ok) {
                const data = await res.json();
                setScenes([...scenes, data]);

                // Reset form
                setNewSceneName("");
                setNewSceneDesc("");
                setNewSceneWords("");
            }
        } catch (error) {
            console.error("Failed to create scene", error);
        } finally {
            setCreatingScene(false);
        }
    };

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>;
    }

    return (
        <div className="min-h-screen bg-secondary/30 p-8 font-sans">
            <div className="max-w-6xl mx-auto">
                <Tabs defaultValue="dashboard" className="space-y-8">
                    {/* Header with Logo, Navigation, Facepile, Profile */}
                    <header className="flex flex-col md:flex-row justify-between items-center gap-6 mb-8">
                        <div className="flex items-center gap-6">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src="/logo.png"
                                alt="LiveLex"
                                className="h-10 w-auto object-contain"
                            />
                            <nav className="hidden md:flex items-center bg-white rounded-full px-1 py-1 shadow-sm">
                                <TabsList className="bg-transparent">
                                    <TabsTrigger value="dashboard" className="rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Dashboard</TabsTrigger>
                                    <TabsTrigger value="scenes" className="rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Scenes</TabsTrigger>
                                    <TabsTrigger value="assignments" className="rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Assignments</TabsTrigger>
                                </TabsList>
                            </nav>
                        </div>

                        <div className="flex items-center gap-4">
                            {/* Class Info / Facepile */}
                            <div className="hidden md:flex items-center gap-3 bg-white px-4 py-2 rounded-full shadow-sm">
                                <span className="text-sm font-semibold text-muted-foreground mr-2">Class {teacherCode}</span>
                                <div className="flex -space-x-2">
                                    {students.slice(0, 5).map((s, i) => (
                                        <Avatar key={i} className="border-2 border-white w-8 h-8">
                                            <AvatarImage src={s.profile_image} />
                                            <AvatarFallback className="text-[10px]">{s.name?.[0]}</AvatarFallback>
                                        </Avatar>
                                    ))}
                                    {students.length > 5 && (
                                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium border-2 border-white">
                                            +{students.length - 5}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* User Menu */}
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Avatar className="w-10 h-10 border border-border cursor-pointer">
                                        <AvatarImage src={session?.user?.image || ''} />
                                        <AvatarFallback>{session?.user?.name?.[0]}</AvatarFallback>
                                    </Avatar>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuLabel>My Account</DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => signOut({ callbackUrl: '/' })}>
                                        Log out
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </header>

                    {/* Mobile Tabs (visible only on small screens) */}
                    <div className="md:hidden">
                        <TabsList className="grid w-full grid-cols-3">
                            <TabsTrigger value="dashboard">Overview</TabsTrigger>
                            <TabsTrigger value="scenes">Scenes</TabsTrigger>
                            <TabsTrigger value="assignments">Work</TabsTrigger>
                        </TabsList>
                    </div>

                    <TabsContent value="dashboard" className="space-y-8 animate-in fade-in-50 duration-500">
                        {/* Metrics Row */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {/* Overall Class Score */}
                            <Card className="col-span-1 rounded-[2rem] border-none shadow-sm overflow-hidden relative">
                                <CardContent className="p-8 flex items-center justify-between">
                                    <div>
                                        <h3 className="text-muted-foreground font-medium mb-1">Overall Class Score</h3>
                                        <div className="text-5xl font-bold text-foreground">
                                            {classAnalytics?.overall_accuracy ?? 0}%
                                        </div>
                                        <p className="text-sm text-muted-foreground mt-2">Grade average {classAnalytics?.overall_accuracy ?? 0}%</p>
                                    </div>
                                    <div className="h-24 w-24 bg-green-100 rounded-full flex items-center justify-center text-green-600">
                                        <Trophy size={48} />
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Work Assigned / Words Practiced */}
                            <Card className="col-span-1 rounded-[2rem] border-none shadow-sm">
                                <CardContent className="p-8 flex items-center justify-between">
                                    <div>
                                        <h3 className="text-muted-foreground font-medium mb-1">Work Assigned</h3>
                                        <div className="text-5xl font-bold text-foreground">
                                            {assignments.length}
                                        </div>
                                        <p className="text-sm text-muted-foreground mt-2">{classAnalytics?.total_words_practiced ?? 0} words practiced</p>
                                    </div>
                                    <div className="h-24 w-24 bg-yellow-100 rounded-full flex items-center justify-center text-yellow-600">
                                        <Activity size={48} />
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Struggling Insight */}
                            <Card className="col-span-1 border-none shadow-sm rounded-[2rem] bg-orange-50">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-orange-900 text-lg">Needs Attention</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    {classAnalytics?.struggling_words?.length > 0 ? (
                                        <div className="space-y-3">
                                            {classAnalytics.struggling_words.slice(0, 3).map((w: any, i: number) => (
                                                <div key={i} className="flex justify-between items-center bg-white p-2 rounded-xl">
                                                    <span className="font-medium text-orange-900 px-2">{w.word}</span>
                                                    <span className="font-bold text-orange-600 px-2">{w.accuracy}%</span>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center h-24 text-orange-400">
                                            <CheckCircle className="mb-2" />
                                            <span className="text-sm">Class is doing great!</span>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>

                        {/* Students Proficiency Table */}
                        <div>
                            <div className="flex justify-between items-center mb-4 px-2">
                                <h2 className="text-xl font-bold text-foreground">Students Proficiency</h2>
                                <span className="text-sm text-muted-foreground">All Strands</span>
                            </div>

                            <div className="bg-white rounded-[2rem] shadow-sm overflow-hidden p-6">
                                <table className="w-full">
                                    <thead>
                                        <tr className="text-left text-sm text-muted-foreground border-b border-gray-100">
                                            <th className="pb-4 font-medium pl-4">Full Name</th>
                                            <th className="pb-4 font-medium">Work Completed</th>
                                            <th className="pb-4 font-medium">Average Score</th>
                                            <th className="pb-4 font-medium">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {students.length === 0 ? (
                                            <tr>
                                                <td colSpan={4} className="py-8 text-center text-muted-foreground">No students found.</td>
                                            </tr>
                                        ) : (
                                            students.map((student, i) => {
                                                const score = student.average_score || 0;
                                                const statusColor = score >= 80 ? 'text-green-600 bg-green-50' : score >= 50 ? 'text-yellow-600 bg-yellow-50' : 'text-red-600 bg-red-50';
                                                const statusText = score >= 80 ? 'Mastered' : score >= 50 ? 'Working Towards' : 'Needing Attention';

                                                return (
                                                    <tr
                                                        key={i}
                                                        className="group hover:bg-gray-50 transition-colors cursor-pointer"
                                                        onClick={() => setSelectedStudent(student)}
                                                    >
                                                        <td className="py-4 pl-4">
                                                            <div className="flex items-center gap-3">
                                                                <Avatar className="h-10 w-10 border border-gray-100">
                                                                    <AvatarImage src={student.profile_image} />
                                                                    <AvatarFallback>{student.name?.[0]}</AvatarFallback>
                                                                </Avatar>
                                                                <span className="font-semibold text-gray-700 group-hover:text-primary transition-colors">{student.name}</span>
                                                            </div>
                                                        </td>
                                                        <td className="py-4 text-gray-600 font-medium">
                                                            {student.words_practiced} / {classAnalytics?.total_words_practiced || '?'} words
                                                        </td>
                                                        <td className="py-4">
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-16 bg-gray-100 rounded-full h-2 overflow-hidden">
                                                                    <div className={`h-full ${score >= 80 ? 'bg-green-500' : score >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${score}%` }}></div>
                                                                </div>
                                                                <span className="font-bold text-gray-700">{score}%</span>
                                                            </div>
                                                        </td>
                                                        <td className="py-4">
                                                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${statusColor}`}>
                                                                {statusText}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="scenes" className="animate-in fade-in-50 duration-500">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <Card className="rounded-[2rem] border-none shadow-sm">
                                <CardHeader>
                                    <CardTitle>Create Scene</CardTitle>
                                    <CardDescription>Define a new context for learning.</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="sceneName">Scene Name</Label>
                                            <Input
                                                id="sceneName"
                                                placeholder="e.g., The Kitchen"
                                                value={newSceneName}
                                                onChange={(e) => setNewSceneName(e.target.value)}
                                                className="rounded-xl"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="sceneDesc">Description</Label>
                                            <Textarea
                                                id="sceneDesc"
                                                placeholder="Describe the environment to help the AI understand the context."
                                                value={newSceneDesc}
                                                onChange={(e) => setNewSceneDesc(e.target.value)}
                                                className="min-h-[100px] rounded-xl"
                                            />
                                        </div>
                                        <Button
                                            onClick={handleCreateScene}
                                            disabled={creatingScene}
                                            className="w-full rounded-xl h-12 text-md"
                                        >
                                            {creatingScene ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="mr-2 h-4 w-4" />}
                                            Create Scene
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="rounded-[2rem] border-none shadow-sm">
                                <CardHeader>
                                    <CardTitle>Your Scenes</CardTitle>
                                    <CardDescription>Manage environments.</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    {scenes.length === 0 ? (
                                        <div className="h-40 flex items-center justify-center text-muted-foreground text-sm border-2 border-dashed rounded-xl">
                                            No scenes created yet.
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {scenes.map((scene: any) => (
                                                <div key={scene.id} className="p-4 border rounded-2xl bg-white hover:shadow-md transition-shadow">
                                                    <div>
                                                        <div className="flex justify-between items-center mb-2">
                                                            <h3 className="font-bold text-gray-800">{scene.name}</h3>
                                                            <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">
                                                                {scene.teacher_words?.length || 0} Target Words
                                                            </span>
                                                        </div>
                                                        <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                                                            {scene.description}
                                                        </p>
                                                        <div className="flex gap-1 flex-wrap">
                                                            {scene.teacher_words?.slice(0, 3).map((w: string, i: number) => (
                                                                <span key={i} className="text-xs bg-secondary px-2 py-1 rounded-full text-secondary-foreground">{w}</span>
                                                            ))}
                                                            {(scene.teacher_words?.length || 0) > 3 && <span className="text-xs text-muted-foreground pl-1">...</span>}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>

                    <TabsContent value="assignments" className="animate-in fade-in-50 duration-500">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <Card className="rounded-[2rem] border-none shadow-sm h-fit">
                                <CardHeader>
                                    <CardTitle>Create Assignment</CardTitle>
                                    <CardDescription>Create a new vocabulary list.</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="title">Title</Label>
                                            <Input
                                                id="title"
                                                placeholder="e.g., Week 1 Vocabulary"
                                                value={newAssignmentTitle}
                                                onChange={(e) => setNewAssignmentTitle(e.target.value)}
                                                className="rounded-xl"
                                            />
                                        </div>

                                        {/* Scene Context Selector */}
                                        <div className="space-y-2">
                                            <Label htmlFor="sceneSelect">Context (Optional)</Label>
                                            <select
                                                id="sceneSelect"
                                                className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                                value={newAssignmentSceneId}
                                                onChange={(e) => setNewAssignmentSceneId(e.target.value)}
                                            >
                                                <option value="none">No Scene Context</option>
                                                {scenes.map((s) => (
                                                    <option key={s.id} value={s.id}>{s.name}</option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2 col-span-2">
                                                <Label htmlFor="words">Words (one per line)</Label>
                                                <Textarea
                                                    id="words"
                                                    placeholder="Hola&#10;Gracias"
                                                    value={newAssignmentWords}
                                                    onChange={(e) => setNewAssignmentWords(e.target.value)}
                                                    className="min-h-[100px] rounded-xl"
                                                />
                                            </div>

                                            {newAssignmentSceneId !== "none" && (
                                                <div className="space-y-2 col-span-2 bg-blue-50 p-3 rounded-xl">
                                                    <Label htmlFor="discoveredCount" className="text-blue-900">Include Student Discovered Words</Label>
                                                    <div className="flex items-center gap-3">
                                                        <Input
                                                            id="discoveredCount"
                                                            type="number"
                                                            min="0"
                                                            max="10"
                                                            value={newAssignmentDiscoveredCount}
                                                            onChange={(e) => setNewAssignmentDiscoveredCount(parseInt(e.target.value) || 0)}
                                                            className="rounded-xl w-20 bg-white"
                                                        />
                                                        <span className="text-xs text-blue-700">
                                                            Randomly adds words the student found in this scene to their list.
                                                        </span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <Button
                                            onClick={handleCreateAssignment}
                                            disabled={creating}
                                            className="w-full rounded-xl h-12 text-md"
                                        >
                                            {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="mr-2 h-4 w-4" />}
                                            Create Assignment
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="rounded-[2rem] border-none shadow-sm">
                                <CardHeader>
                                    <CardTitle>Active Assignments</CardTitle>
                                    <CardDescription>Manage your class lists.</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    {assignments.length === 0 ? (
                                        <div className="h-40 flex items-center justify-center text-muted-foreground text-sm border-2 border-dashed rounded-xl">
                                            No active assignments.
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {assignments.map((assignment: any) => (
                                                <div key={assignment.id} className="p-4 border rounded-2xl bg-white hover:shadow-md transition-shadow">
                                                    <div className="flex justify-between items-start">
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <h3 className="font-bold text-gray-800">{assignment.title}</h3>
                                                                {assignment.scene_id && (
                                                                    <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                                                                        Context Aware
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="text-sm text-muted-foreground mt-1">
                                                                {assignment.words.length} words
                                                                {assignment.include_discovered_count > 0 && ` + ${assignment.include_discovered_count} discovered`}
                                                                • {new Date(assignment.created_at).toLocaleDateString()}
                                                            </p>
                                                            <div className="flex gap-1 mt-2 flex-wrap">
                                                                {assignment.words.slice(0, 5).map((w: string, i: number) => (
                                                                    <span key={i} className="text-xs bg-secondary px-2 py-1 rounded-full text-secondary-foreground">{w}</span>
                                                                ))}
                                                                {assignment.words.length > 5 && <span className="text-xs text-muted-foreground pl-1">+{assignment.words.length - 5} more</span>}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>
                </Tabs>
            </div>

            {/* Student Analytics Modal */}
            <Dialog open={!!selectedStudent} onOpenChange={(open) => !open && setSelectedStudent(null)}>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{selectedStudent?.name}'s Progress</DialogTitle>
                    </DialogHeader>
                    {selectedStudent && (
                        <div className="py-2">
                            <AnalyticsView
                                username={selectedStudent.username}
                                backendUrl={process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000'}
                            />
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
