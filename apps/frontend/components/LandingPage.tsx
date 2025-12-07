'use client';

import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Chrome } from 'lucide-react';

export default function LandingPage() {
    return (
        <div className="min-h-screen bg-gradient-to-b from-background to-muted flex flex-col">
            <header className="px-6 py-4 flex justify-between items-center">
                <div className="flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src="/logo.png"
                        alt="LiveLex Logo"
                        className="h-10 w-auto rounded-md object-contain"
                    />
                </div>
                <Button variant="ghost" size="sm" onClick={() => signIn('google')}>
                    Sign in
                </Button>
            </header>

            <main className="flex-1 flex flex-col items-center justify-center p-4 text-center space-y-8 animate-in fade-in zoom-in duration-500">
                <div className="max-w-2xl space-y-4">
                    <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-foreground">
                        Learn languages naturally with <span className="text-primary">AI</span>
                    </h1>
                    <p className="text-lg md:text-xl text-muted-foreground max-w-lg mx-auto">
                        Immerse yourself in real-time conversation practice. LiveLex understands your context and guides you to fluency.
                    </p>
                </div>

                <Card className="w-full max-w-sm shadow-xl border-t-4 border-t-primary">
                    <CardHeader>
                        <CardTitle>Get Started</CardTitle>
                        <CardDescription>
                            Create your account to start your learning journey.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Button
                            className="w-full relative py-6 text-base"
                            onClick={() => signIn('google', { callbackUrl: '/' })}
                        >
                            <Chrome className="mr-2 h-5 w-5" />
                            Sign up with Google
                        </Button>
                        <p className="text-xs text-muted-foreground text-center">
                            By clicking continue, you agree to our Terms of Service and Privacy Policy.
                        </p>
                    </CardContent>
                </Card>
            </main>

            <footer className="py-6 text-center text-sm text-muted-foreground">
                © 2025 LiveLex.ai. All rights reserved.
            </footer>
        </div>
    );
}
