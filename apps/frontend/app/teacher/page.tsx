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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

export default function TeacherDashboard() {
    const { data: session } = useSession();
    const [teacherCode, setTeacherCode] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchProfile = async () => {
            if (session?.user?.email) {
                try {
                    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';
                    const res = await fetch(`${backendUrl}/v1/auth/me?email=${session.user.email}`);
                    if (res.ok) {
                        const data = await res.json();
                        setTeacherCode(data.teacher_code);
                    }
                } catch (error) {
                    console.error("Failed to fetch profile", error);
                } finally {
                    setLoading(false);
                }
            }
        };
        fetchProfile();
    }, [session]);

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>;
    }

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
            <div className="max-w-4xl mx-auto space-y-6">
                <header className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Teacher Dashboard</h1>
                        <p className="text-muted-foreground">Manage your classroom and students.</p>
                    </div>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <div className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity">
                                <Avatar className="w-10 h-10 border border-gray-200 dark:border-gray-700">
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Students</CardTitle>
                            <CardDescription>Overview of enrolled students.</CardDescription>
                        </CardHeader>
                        <CardContent className="h-40 flex items-center justify-center text-muted-foreground text-sm">
                            No students enrolled yet.
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <CardTitle>Assignments</CardTitle>
                            <CardDescription>Manage vocabulary lists.</CardDescription>
                        </CardHeader>
                        <CardContent className="h-40 flex items-center justify-center text-muted-foreground text-sm">
                            No active assignments.
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
