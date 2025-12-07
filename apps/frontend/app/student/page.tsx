'use client';

import { useSession } from "next-auth/react";
import MobileShell from "@/components/MobileShell";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function StudentPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [authorized, setAuthorized] = useState(false);

    useEffect(() => {
        if (status === 'unauthenticated') {
            router.replace('/');
        } else if (status === 'authenticated') {
            // Ideally we verify role here too, but for speed we can trust the router redirect 
            // from '/' or add a simple check.
            // Let's add a basic role check to be safe.
            const checkRole = async () => {
                try {
                    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';
                    const res = await fetch(`${backendUrl}/v1/auth/me?email=${session?.user?.email}`);
                    if (res.ok) {
                        const data = await res.json();
                        if (data.role === 'teacher') {
                            router.replace('/teacher');
                        } else {
                            setAuthorized(true);
                        }
                    } else {
                        // If fetch fails, maybe redirect home
                        router.replace('/');
                    }
                } catch {
                    router.replace('/');
                }
            }
            checkRole();
        }
    }, [status, session, router]);

    if (status === "loading" || !authorized) {
        return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin w-8 h-8 text-primary" /></div>;
    }

    return <MobileShell />;
}
