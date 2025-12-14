import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from "@/components/ui/button";
import { Plus, Pencil } from 'lucide-react';
import { Scene } from '@/types/teacher';
import { useSession } from 'next-auth/react';
import { teacherService } from "@/services/teacherService";
import { useToast } from "@/components/ui/use-toast";
import { DeleteConfirm } from "@/components/ui/delete-confirm";
import { SceneDialog } from "./SceneDialog";
import Link from 'next/link';

interface ScenesManagerProps {
    scenes: Scene[];
    onSceneCreated: (scene: Scene) => void;
    onSceneDeleted: (id: string) => void;
    onSceneUpdated: (scene: Scene) => void;
}

export function ScenesManager({ scenes, onSceneCreated, onSceneDeleted, onSceneUpdated }: ScenesManagerProps) {
    const { data: session } = useSession();
    const { toast } = useToast();

    // Modal State
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [editingScene, setEditingScene] = useState<Scene | null>(null);

    const handleCreate = async (data: any) => {
        if (!session?.user?.email) return;

        try {
            const payload = {
                email: session.user.email,
                ...data
            };
            const newScene = await teacherService.createScene(payload);
            onSceneCreated(newScene);
            toast({ title: "Success", description: "Scene created.", variant: "success" });
            setIsCreateOpen(false);
        } catch (error: any) {
            console.error("Failed to create scene", error);
            toast({
                title: "Error",
                description: error.message || "Failed to create scene.",
                variant: "destructive",
            });
        }
    };

    const handleUpdate = async (data: any) => {
        if (!editingScene || !session?.user?.email) return;

        try {
            const payload = {
                email: session.user.email,
                ...data
            };
            await teacherService.updateScene(editingScene.id, payload);
            const updatedScene: Scene = {
                ...editingScene,
                ...data
            };
            onSceneUpdated(updatedScene);
            toast({ title: "Success", description: "Scene updated.", variant: "success" });
            setEditingScene(null);
        } catch (error: any) {
            console.error("Failed to update scene", error);
            toast({
                title: "Error",
                description: error.message || "Failed to update scene.",
                variant: "destructive",
            });
        }
    };

    const handleDelete = async (id: string) => {
        if (!session?.user?.email) return;
        try {
            await teacherService.deleteScene(id, session.user.email);
            onSceneDeleted(id);
            toast({ title: "Success", description: "Scene deleted.", variant: "success" });
        } catch (error) {
            console.error("Failed to delete scene", error);
            toast({
                title: "Error",
                description: "Failed to delete scene.",
                variant: "destructive",
            });
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in-50 duration-500">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Scenes</h2>
                    <p className="text-muted-foreground">Manage learning environments.</p>
                </div>
                <Button onClick={() => setIsCreateOpen(true)} className="rounded-xl h-10">
                    <Plus className="mr-2 h-4 w-4" />
                    New Scene
                </Button>
            </div>

            {/* Creation Modal */}
            <SceneDialog
                open={isCreateOpen}
                onOpenChange={setIsCreateOpen}
                onSubmit={handleCreate}
            />

            {/* Edit Modal */}
            {editingScene && (
                <SceneDialog
                    open={!!editingScene}
                    onOpenChange={(open) => !open && setEditingScene(null)}
                    scene={editingScene}
                    onSubmit={handleUpdate}
                />
            )}

            <Card className="rounded-[2rem] border-none shadow-sm">
                <CardContent className="p-6">
                    {scenes.length === 0 ? (
                        <div className="h-40 flex flex-col items-center justify-center text-muted-foreground text-sm border-2 border-dashed rounded-xl">
                            <p>No scenes created yet.</p>
                            <Button variant="link" onClick={() => setIsCreateOpen(true)}>Create one now</Button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {scenes.map((scene) => (
                                <div key={scene.id}
                                    className="group relative flex flex-col justify-between p-5 border rounded-2xl bg-white hover:shadow-md transition-all hover:border-primary/50 cursor-pointer"
                                    onClick={(e) => {
                                        if ((e.target as HTMLElement).closest('button')) return;
                                    }}
                                >
                                    <Link href={`/teacher/scenes/${scene.id}`} className="absolute inset-0 z-0" />

                                    <div className="relative z-10 pointer-events-none">
                                        <div className="flex justify-between items-start mb-2">
                                            <h3 className="font-bold text-lg text-gray-800 group-hover:text-primary transition-colors">{scene.name}</h3>
                                            <span className="text-[10px] bg-primary/10 text-primary px-2 py-1 rounded-full whitespace-nowrap ml-2">
                                                {scene.vocab?.length || 0} Words
                                            </span>
                                        </div>
                                        <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                                            {scene.description}
                                        </p>
                                        <div className="flex gap-1 flex-wrap">
                                            {scene.vocab?.slice(0, 3).map((v, i) => (
                                                <span key={i} className="text-[10px] bg-secondary px-2 py-1 rounded-full text-secondary-foreground">
                                                    {v.source_name}
                                                </span>
                                            ))}
                                            {(scene.vocab?.length || 0) > 3 && <span className="text-[10px] text-muted-foreground pl-1">...</span>}
                                        </div>
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="relative z-20 flex justify-end gap-1 mt-4 pt-4 border-t border-gray-100">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-muted-foreground hover:text-primary"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setEditingScene(scene);
                                            }}
                                        >
                                            <Pencil size={14} />
                                        </Button>

                                        <div onClick={(e) => e.stopPropagation()}>
                                            <DeleteConfirm
                                                title="Delete Scene?"
                                                description={`This will permanently delete "${scene.name}".`}
                                                onConfirm={() => handleDelete(scene.id)}
                                            />
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
