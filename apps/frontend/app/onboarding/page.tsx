'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { GraduationCap, Users } from 'lucide-react';

export default function OnboardingPage() {
    const { data: session } = useSession();
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    const handleRoleSelect = async (role: 'teacher' | 'student') => {
        setLoading(true);
        try {
            const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';
            const res = await fetch(`${backendUrl}/v1/auth/role`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email: session?.user?.email,
                    role: role,
                }),
            });

            if (res.ok) {
                if (role === 'teacher') {
                    router.replace('/teacher');
                } else {
                    router.replace('/');
                }
            } else {
                console.error("Failed to set role");
            }
        } catch (error) {
            console.error("Error setting role:", error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center p-4">
            <div className="max-w-3xl w-full space-y-8 text-center">
                <div className="space-y-2">
                    <h1 className="text-3xl font-bold tracking-tight">Welcome to LiveLex!</h1>
                    <p className="text-muted-foreground">Select your role to get started.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card
                        className="cursor-pointer hover:border-primary transition-colors flex flex-col items-center text-center p-6 h-full"
                        onClick={() => !loading && handleRoleSelect('student')}
                    >
                        <CardHeader className="p-0 mb-4">
                            <div className="w-16 h-16 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mx-auto mb-2">
                                <Users className="w-8 h-8" />
                            </div>
                            <CardTitle>I am a Student</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <CardDescription className="text-base text-gray-600 dark:text-gray-400">
                                Join a class, practice conversations, and learn naturally with AI.
                            </CardDescription>
                            <Button className="mt-6 w-full" disabled={loading}>Continue as Student</Button>
                        </CardContent>
                    </Card>

                    <Card
                        className="cursor-pointer hover:border-primary transition-colors flex flex-col items-center text-center p-6 h-full"
                        onClick={() => !loading && handleRoleSelect('teacher')}
                    >
                        <CardHeader className="p-0 mb-4">
                            <div className="w-16 h-16 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto mb-2">
                                <GraduationCap className="w-8 h-8" />
                            </div>
                            <CardTitle>I am a Teacher</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <CardDescription className="text-base text-gray-600 dark:text-gray-400">
                                Create classes, manage students, and assign vocabulary exercises.
                            </CardDescription>
                            <Button className="mt-6 w-full" variant="outline" disabled={loading}>Continue as Teacher</Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
