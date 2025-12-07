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
import { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from 'lucide-react';
import AnalyticsView from '@/components/AnalyticsView';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTeacherData } from "@/hooks/useTeacherData";
import { DashboardOverview } from "@/components/teacher/DashboardOverview";
import { ScenesManager } from "@/components/teacher/ScenesManager";
import { AssignmentsManager } from "@/components/teacher/AssignmentsManager";
import { Student } from "@/types/teacher";

export default function TeacherDashboard() {
    const { data: session } = useSession();

    // Custom Hook handles fetching and state
    const {
        teacherCode,
        students,
        assignments,
        scenes,
        classAnalytics,
        loading,
        setAssignments,
        setScenes
    } = useTeacherData();

    // Analytics Modal State
    const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

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

                    <TabsContent value="dashboard">
                        <DashboardOverview
                            students={students}
                            classAnalytics={classAnalytics}
                            assignmentCount={assignments.length}
                            onSelectStudent={setSelectedStudent}
                        />
                    </TabsContent>

                    <TabsContent value="scenes">
                        <ScenesManager
                            scenes={scenes}
                            onSceneCreated={(newScene) => setScenes([...scenes, newScene])}
                        />
                    </TabsContent>

                    <TabsContent value="assignments">
                        <AssignmentsManager
                            assignments={assignments}
                            scenes={scenes}
                            onAssignmentCreated={(newAssignment) => setAssignments([newAssignment, ...assignments])}
                        />
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
