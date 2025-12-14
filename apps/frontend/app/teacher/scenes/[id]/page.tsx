"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Scene } from "@/types/teacher";
import { teacherService } from "@/services/teacherService";
import { SceneDialog } from "@/components/teacher/SceneDialog";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Pencil, BookOpen, Globe } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import Link from 'next/link';
import { Badge } from "@/components/ui/badge";

export default function SceneDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { data: session } = useSession();
    const { toast } = useToast();

    const sceneId = params.id as string;

    const [scene, setScene] = useState<Scene | null>(null);
    const [loading, setLoading] = useState(true);
    const [isEditOpen, setIsEditOpen] = useState(false);

    useEffect(() => {
        if (session?.user?.email && sceneId) {
            fetchScene();
        }
    }, [session, sceneId]);

    const fetchScene = async () => {
        try {
            if (!session?.user?.email) return;
            const data = await teacherService.getScene(sceneId, session.user.email);
            setScene(data);
        } catch (error) {
            console.error("Failed to fetch scene", error);
            toast({
                title: "Error",
                description: "Failed to load scene details.",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const handleUpdate = async (data: any) => {
        if (!scene || !session?.user?.email) return;

        try {
            const payload = {
                email: session.user.email,
                ...data
            };
            await teacherService.updateScene(scene.id, payload);
            setScene({ ...scene, ...data });
            toast({ title: "Success", description: "Scene updated.", variant: "success" });
            setIsEditOpen(false);
        } catch (error: any) {
            console.error("Failed to update scene", error);
            toast({
                title: "Error",
                description: error.message || "Failed to update scene.",
                variant: "destructive",
            });
        }
    };

    if (loading) {
        return (
            <div className="container mx-auto py-8 space-y-6">
                <Skeleton className="h-8 w-1/3" />
                <Skeleton className="h-64 w-full" />
            </div>
        );
    }

    if (!scene) {
        return (
            <div className="container mx-auto py-8 text-center">
                <h1 className="text-2xl font-bold text-red-500">Scene Not Found</h1>
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
                        <h1 className="text-3xl font-bold text-gray-900">{scene.name}</h1>
                        <p className="text-muted-foreground line-clamp-1 max-w-lg">
                            {scene.description}
                        </p>
                    </div>
                </div>
                <Button onClick={() => setIsEditOpen(true)} className="rounded-xl">
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit Scene
                </Button>
            </div>

            <SceneDialog
                open={isEditOpen}
                onOpenChange={setIsEditOpen}
                scene={scene}
                onSubmit={handleUpdate}
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Main Content */}
                <Card className="md:col-span-2 rounded-[2rem] border-none shadow-sm h-full">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <BookOpen className="h-5 w-5 text-primary" />
                            Vocabulary
                        </CardTitle>
                        <CardDescription>
                            Words associated with this environment.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {scene.vocab?.map((v, i) => (
                                <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
                                    <span className="font-semibold text-gray-900">{v.source_name}</span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-muted-foreground text-sm">→</span>
                                        <span className="text-gray-700">{v.target_name}</span>
                                    </div>
                                </div>
                            ))}
                            {(!scene.vocab || scene.vocab.length === 0) && (
                                <p className="text-muted-foreground col-span-full text-center py-8">
                                    No vocabulary defined.
                                </p>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Sidebar */}
                <div className="space-y-6">
                    <Card className="rounded-[2rem] border-none shadow-sm">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Globe className="h-5 w-5" />
                                Languages
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex justify-between items-center py-2 border-b border-gray-50">
                                <span className="text-sm text-gray-500">Source</span>
                                <Badge variant="secondary" className="px-3 py-1 font-medium bg-blue-50 text-blue-700 hover:bg-blue-100">
                                    {scene.source_language || "English"}
                                </Badge>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-gray-50">
                                <span className="text-sm text-gray-500">Target</span>
                                <Badge variant="secondary" className="px-3 py-1 font-medium bg-green-50 text-green-700 hover:bg-green-100">
                                    {scene.target_language || "Spanish"}
                                </Badge>
                            </div>
                            <div className="flex justify-between items-center py-2 pt-4">
                                <span className="text-sm text-gray-500">Total Words</span>
                                <span className="font-bold text-2xl">{scene.vocab?.length || 0}</span>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-primary/5 rounded-[2rem] border-none shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-primary text-lg">About Scenes</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm text-muted-foreground space-y-2">
                            <p>
                                Scenes provide context for the AI. When students practice in a scene, the AI understands the environment.
                            </p>
                            <p>
                                Students can also "discover" new objects in a scene during conversation, which get added to their personal vocabulary list.
                            </p>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
