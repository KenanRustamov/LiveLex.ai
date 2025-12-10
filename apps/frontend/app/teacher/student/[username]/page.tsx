'use client';

import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import AnalyticsView from "@/components/AnalyticsView";

export default function StudentDetailPage({ params }: { params: { username: string } }) {
    const router = useRouter();
    const username = decodeURIComponent(params.username);

    return (
        <div className="min-h-screen bg-secondary/30 p-8 font-sans">
            <div className="max-w-6xl mx-auto space-y-6">
                {/* Header with Back Button */}
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => router.back()}
                        className="bg-white hover:bg-white/90 shadow-sm rounded-full h-10 w-10"
                    >
                        <ChevronLeft className="h-6 w-6 text-gray-700" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">{username}&apos;s Performance</h1>
                        <p className="text-sm text-muted-foreground">Detailed analytics and progress reports.</p>
                    </div>
                </div>

                {/* Analytics Content */}
                <AnalyticsView
                    username={username}
                    backendUrl={process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000'}
                />
            </div>
        </div>
    );
}
