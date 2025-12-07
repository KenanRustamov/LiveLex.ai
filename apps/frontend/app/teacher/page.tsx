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
import { Loader2, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import AnalyticsView from '@/components/AnalyticsView';

export default function TeacherDashboard() {
    const { data: session } = useSession();
    const [teacherCode, setTeacherCode] = useState<string | null>(null);
    const [students, setStudents] = useState<any[]>([]);
    const [assignments, setAssignments] = useState<any[]>([]);
    const [classAnalytics, setClassAnalytics] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    // Assignment Creation State
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const [newAssignmentTitle, setNewAssignmentTitle] = useState("");
    const [newAssignmentWords, setNewAssignmentWords] = useState("");
    const [creating, setCreating] = useState(false);

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

                    // Fetch students
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

            const res = await fetch(`${backendUrl}/v1/assignments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: session?.user?.email,
                    title: newAssignmentTitle,
                    words: wordsList
                })
            });

            if (res.ok) {
                const data = await res.json();
                // Refresh list locally
                const newAssignment = {
                    id: data.id,
                    title: newAssignmentTitle,
                    words: wordsList,
                    created_at: new Date().toISOString()
                };
                setAssignments([newAssignment, ...assignments]);

                // Close and reset
                setIsDetailsOpen(false);
                setNewAssignmentTitle("");
                setNewAssignmentWords("");
            }
        } catch (error) {
            console.error("Failed to create assignment", error);
        } finally {
            setCreating(false);
        }
    };

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>;
    }

    return (
        <div className="min-h-screen bg-background p-8">
            <div className="max-w-4xl mx-auto space-y-6">
                <header className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-foreground">Teacher Dashboard</h1>
                        <p className="text-muted-foreground">Manage your classroom and students.</p>
                    </div>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <div className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity">
                                <Avatar className="w-10 h-10 border border-border">
                                    <AvatarImage src={session?.user?.image || ''} alt={session?.user?.name || ''} />
                                    <AvatarFallback className="bg-primary/10 text-primary font-bold">
                                        {session?.user?.name?.[0] || 'T'}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="text-sm">
                                    <p className="font-medium">{session?.user?.name}</p>
                                    <p className="text-xs text-muted-foreground">Teacher</p>
                                </div>
                            </div>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuLabel>My Account</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => signOut({ callbackUrl: '/' })}>
                                Log out
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </header>

                <Card>
                    <CardHeader>
                        <CardTitle>Class Information</CardTitle>
                        <CardDescription>Share this code with your students to have them join your class.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="p-6 bg-primary/5 border rounded-lg flex flex-col items-center justify-center text-center">
                            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-2">Your Class Code</p>
                            <div className="text-4xl font-mono font-bold text-primary tracking-widest">
                                {teacherCode || "Loading..."}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="mb-6">
                    <CardHeader>
                        <CardTitle>Class Analytics</CardTitle>
                        <CardDescription>Aggregate performance across all students.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {!classAnalytics ? (
                            <div className="text-sm text-muted-foreground">Loading analytics...</div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="text-center p-4 bg-muted/30 rounded-lg">
                                    <div className="text-2xl font-bold">{classAnalytics.overall_accuracy}%</div>
                                    <div className="text-xs text-muted-foreground uppercase tracking-wide mt-1">Class Accuracy</div>
                                </div>
                                <div className="text-center p-4 bg-muted/30 rounded-lg">
                                    <div className="text-2xl font-bold">{classAnalytics.total_words_practiced}</div>
                                    <div className="text-xs text-muted-foreground uppercase tracking-wide mt-1">Words Practiced</div>
                                </div>
                                <div className="col-span-1 md:col-span-1">
                                    <h4 className="font-semibold text-sm mb-2">Struggling Words</h4>
                                    {classAnalytics.struggling_words.length === 0 ? (
                                        <p className="text-xs text-muted-foreground">No words below 100% yet!</p>
                                    ) : (
                                        <div className="space-y-1">
                                            {classAnalytics.struggling_words.map((w: any) => (
                                                <div key={w.word} className="flex justify-between text-sm">
                                                    <span className="font-medium">{w.word}</span>
                                                    <span className="text-red-500">{w.accuracy}%</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Students</CardTitle>
                            <CardDescription>Overview of enrolled students.</CardDescription>
                        </CardHeader>
                        <CardContent className="min-h-[160px]">
                            {students.length === 0 ? (
                                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                                    No students enrolled yet.
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {students.map((student, idx) => (
                                        <div
                                            key={idx}
                                            className="flex items-center gap-3 p-2 hover:bg-muted/50 rounded-lg cursor-pointer transition-colors"
                                            onClick={() => setSelectedStudent(student)}
                                        >
                                            <Avatar className="w-8 h-8">
                                                <AvatarImage src={student.profile_image} />
                                                <AvatarFallback>{student.name?.[0]}</AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <p className="text-sm font-medium">{student.name}</p>
                                                <p className="text-xs text-muted-foreground">{student.email}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <div className="space-y-1">
                                <CardTitle>Assignments</CardTitle>
                                <CardDescription>Manage vocabulary lists.</CardDescription>
                            </div>
                            <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
                                <DialogTrigger asChild>
                                    <Button size="sm" className="h-8 w-8 p-0">
                                        <Plus className="h-4 w-4" />
                                        <span className="sr-only">Create Assignment</span>
                                    </Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>Create New Assignment</DialogTitle>
                                        <DialogDescription>
                                            Create a vocabulary list for your students to practice.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-4 py-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="title">Title</Label>
                                            <Input
                                                id="title"
                                                placeholder="e.g., Week 1 Vocabulary"
                                                value={newAssignmentTitle}
                                                onChange={(e) => setNewAssignmentTitle(e.target.value)}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="words">Words/Phrases (one per line)</Label>
                                            <Textarea
                                                id="words"
                                                placeholder="Hola&#10;Gracias&#10;Buenos dias"
                                                value={newAssignmentWords}
                                                onChange={(e) => setNewAssignmentWords(e.target.value)}
                                                className="min-h-[100px]"
                                            />
                                        </div>
                                    </div>
                                    <DialogFooter>
                                        <Button onClick={handleCreateAssignment} disabled={creating}>
                                            {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                            Create
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        </CardHeader>
                        <CardContent className="min-h-[160px]">
                            {assignments.length === 0 ? (
                                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                                    No active assignments.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {assignments.map((assignment: any) => (
                                        <div key={assignment.id} className="p-3 border rounded-lg bg-muted/40">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <h3 className="font-medium text-sm">{assignment.title}</h3>
                                                    <p className="text-xs text-muted-foreground mt-1">
                                                        {assignment.words.length} words • {new Date(assignment.created_at).toLocaleDateString()}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
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
