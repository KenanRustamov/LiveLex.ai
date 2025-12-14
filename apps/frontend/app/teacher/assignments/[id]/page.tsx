"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Assignment, Scene } from "@/types/teacher";
import { teacherService } from "@/services/teacherService";
import { AssignmentDialog } from "@/components/teacher/AssignmentDialog";
import { useTeacherData } from "@/hooks/useTeacherData";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Pencil, Settings2, Users, CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import Link from 'next/link';
import { TeacherTable } from "@/components/teacher/TeacherTable";
import { createColumnHelper } from "@tanstack/react-table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// Define the progress item type since it's cleaner
type StudentProgressItem = {
    student_username: string;
    student_name: string;
    profile_image?: string;
    status: "Not Started" | "In Progress" | "Completed";
    words_completed: number;
    total_assignment_words: number;
    score?: number | null;
};

export default function AssignmentDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { data: session } = useSession();
    const { toast } = useToast();
    const { scenes } = useTeacherData();

    const assignmentId = params.id as string;

    const [assignment, setAssignment] = useState<Assignment | null>(null);
    const [loading, setLoading] = useState(true);
    const [progressData, setProgressData] = useState<{ students: StudentProgressItem[], total_students: number } | null>(null);
    const [isEditOpen, setIsEditOpen] = useState(false);

    useEffect(() => {
        if (session?.user?.email && assignmentId) {
            fetchAssignment();
            fetchProgress();
        }
    }, [session, assignmentId]);

    const fetchAssignment = async () => {
        try {
            if (!session?.user?.email) return;
            const data = await teacherService.getAssignment(assignmentId, session.user.email);
            setAssignment(data);
        } catch (error) {
            console.error("Failed to fetch assignment", error);
            toast({
                title: "Error",
                description: "Failed to load assignment details.",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const fetchProgress = async () => {
        try {
            if (!session?.user?.email) return;
            const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';
            const response = await fetch(
                `${backendUrl}/v1/assignments/${assignmentId}/progress?teacher_email=${session.user.email}`
            );
            if (response.ok) {
                const data = await response.json();
                setProgressData(data);
            }
        } catch (error) {
            console.error("Failed to fetch progress", error);
        }
    };

    const handleUpdate = async (data: any) => {
        if (!assignment || !session?.user?.email) return;

        try {
            const payload = {
                email: session.user.email,
                ...data
            };
            await teacherService.updateAssignment(assignment.id, payload);
            setAssignment({ ...assignment, ...data });
            toast({ title: "Success", description: "Assignment updated.", variant: "success" });
            setIsEditOpen(false);
        } catch (error: any) {
            console.error("Failed to update assignment", error);
            toast({
                title: "Error",
                description: error.message || "Failed to update assignment.",
                variant: "destructive",
            });
        }
    };

    const columnHelper = createColumnHelper<StudentProgressItem>();

    const columns = useMemo(() => [
        columnHelper.accessor("student_name", {
            header: "Student",
            cell: (info) => {
                const s = info.row.original;
                return (
                    <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8 bg-primary/10 text-primary">
                            <AvatarImage src={s.profile_image} />
                            <AvatarFallback>{s.student_name?.[0]}</AvatarFallback>
                        </Avatar>
                        <span className="font-medium text-gray-900">{s.student_name}</span>
                    </div>
                );
            }
        }),
        columnHelper.accessor("status", {
            header: "Status",
            cell: (info) => {
                const status = info.getValue();
                let className = "px-2.5 py-0.5 rounded-full text-xs font-medium ";
                if (status === "Completed") className += "bg-green-100 text-green-700";
                else if (status === "In Progress") className += "bg-yellow-100 text-yellow-700";
                else className += "bg-gray-100 text-gray-500";

                return <span className={className}>{status}</span>;
            }
        }),
        columnHelper.accessor("words_completed", {
            header: "Progress",
            cell: (info) => {
                const completed = info.getValue() || 0;
                const total = info.row.original.total_assignment_words || 0;
                return (
                    <span className="text-sm text-gray-600">
                        <span className="font-medium text-gray-900">{completed}</span> / {total} words
                    </span>
                );
            }
        }),
        columnHelper.accessor("score", {
            header: "Score",
            cell: (info) => {
                const score = info.getValue();
                if (score === null || score === undefined) return <span className="text-muted-foreground">-</span>;
                const percent = Math.round(score * 100);
                return (
                    <span className={`font-bold ${percent >= 80 ? 'text-green-600' : 'text-gray-600'}`}>
                        {percent}%
                    </span>
                );
            }
        }),
    ], [columnHelper]);


    if (loading) {
        return (
            <div className="container mx-auto py-8 space-y-6">
                <Skeleton className="h-8 w-1/3" />
                <Skeleton className="h-64 w-full" />
            </div>
        );
    }

    if (!assignment) {
        return (
            <div className="container mx-auto py-8 text-center">
                <h1 className="text-2xl font-bold text-red-500">Assignment Not Found</h1>
                <Button variant="link" onClick={() => router.push("/teacher")}>Return to Dashboard</Button>
            </div>
        );
    }

    return (
        <div className="container mx-auto py-8 space-y-8 animate-in fade-in-50">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" asChild className="rounded-full">
                        <Link href="/teacher">
                            <ArrowLeft size={20} />
                        </Link>
                    </Button>
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">{assignment.title}</h1>
                        <p className="text-muted-foreground">
                            Created {new Date(assignment.created_at).toLocaleDateString()}
                        </p>
                    </div>
                </div>
                <Button onClick={() => setIsEditOpen(true)} className="rounded-xl">
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit Assignment
                </Button>
            </div>

            <AssignmentDialog
                open={isEditOpen}
                onOpenChange={setIsEditOpen}
                assignment={assignment}
                scenes={scenes}
                onSubmit={handleUpdate}
            />

            {/* Details & Vocab */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="md:col-span-2 rounded-[2rem] border-none shadow-sm h-full">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Users className="h-5 w-5 text-primary" />
                            Student Progress
                        </CardTitle>
                        <CardDescription>
                            Real-time completion status for this assignment.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {!progressData ? (
                            <div className="py-8 text-center text-muted-foreground">Loading progress...</div>
                        ) : progressData.total_students === 0 ? (
                            <div className="py-8 text-center text-muted-foreground border-2 border-dashed rounded-xl">
                                No students currently enrolled.
                            </div>
                        ) : (
                            <TeacherTable
                                data={progressData.students}
                                columns={columns}
                                emptyMessage="No student progress data available."
                            />
                        )}
                    </CardContent>
                </Card>

                <div className="space-y-6">
                    <Card className="rounded-[2rem] border-none shadow-sm">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Settings2 className="h-5 w-5" />
                                Configuration
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex justify-between items-center py-2 border-b border-gray-50">
                                <span className="text-sm text-gray-500">Word Count</span>
                                <span className="font-medium">{assignment.vocab?.length || 0}</span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-gray-50">
                                <span className="text-sm text-gray-500">Grammar</span>
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${assignment.include_grammar ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                                    {assignment.include_grammar ? "Enabled" : "Disabled"}
                                </span>
                            </div>
                            {assignment.include_grammar && (
                                <div className="flex justify-between items-center py-2 border-b border-gray-50">
                                    <span className="text-sm text-gray-500">Tense</span>
                                    <span className="font-medium capitalize">{assignment.grammar_tense}</span>
                                </div>
                            )}
                            <div className="flex justify-between items-center py-2 border-b border-gray-50">
                                <span className="text-sm text-gray-500">Discovered Words</span>
                                <span className="font-medium">+{assignment.include_discovered_count || 0}</span>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="rounded-[2rem] border-none shadow-sm">
                        <CardHeader>
                            <CardTitle>Vocabulary List</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                                {assignment.vocab?.map((v, i) => (
                                    <div key={i} className="flex justify-between text-sm p-2 rounded-lg hover:bg-gray-50">
                                        <span className="font-medium text-gray-900">{v.source_name}</span>
                                        <span className="text-muted-foreground">{v.target_name}</span>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
