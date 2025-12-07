import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2, Plus } from 'lucide-react';
import { Scene } from '@/types/teacher';
import { useSession } from 'next-auth/react';

interface ScenesManagerProps {
    scenes: Scene[];
    onSceneCreated: (scene: Scene) => void;
}

export function ScenesManager({ scenes, onSceneCreated }: ScenesManagerProps) {
    const { data: session } = useSession();
    const [newSceneName, setNewSceneName] = useState("");
    const [newSceneDesc, setNewSceneDesc] = useState("");
    const [creatingScene, setCreatingScene] = useState(false);

    const handleCreateScene = async () => {
        if (!newSceneName || !newSceneDesc) return;
        setCreatingScene(true);
        try {
            const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';

            const res = await fetch(`${backendUrl}/v1/scenes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: session?.user?.email,
                    name: newSceneName,
                    description: newSceneDesc,
                    teacher_words: [] // Optional as per recent change
                })
            });

            if (res.ok) {
                const data = await res.json();
                onSceneCreated(data);

                // Reset form
                setNewSceneName("");
                setNewSceneDesc("");
            }
        } catch (error) {
            console.error("Failed to create scene", error);
        } finally {
            setCreatingScene(false);
        }
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in-50 duration-500">
            <Card className="rounded-[2rem] border-none shadow-sm h-fit">
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
                            {scenes.map((scene) => (
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
                                            {scene.teacher_words?.slice(0, 3).map((w, i) => (
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
    );
}
