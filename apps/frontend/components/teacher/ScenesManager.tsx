import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Pencil, X, Save } from 'lucide-react';
import { Scene } from '@/types/teacher';
import { useSession } from 'next-auth/react';
import { teacherService } from "@/services/teacherService";
import { useToast } from "@/components/ui/use-toast";
import { DeleteConfirm } from "@/components/ui/delete-confirm";

interface ScenesManagerProps {
    scenes: Scene[];
    onSceneCreated: (scene: Scene) => void;
    onSceneDeleted: (id: string) => void;
    onSceneUpdated: (scene: Scene) => void;
}

export function ScenesManager({ scenes, onSceneCreated, onSceneDeleted, onSceneUpdated }: ScenesManagerProps) {
    const { data: session } = useSession();
    const { toast } = useToast();

    // Form State
    const [newSceneName, setNewSceneName] = useState("");
    const [newSceneDesc, setNewSceneDesc] = useState("");
    const [creatingScene, setCreatingScene] = useState(false);

    // Validation State
    const [errors, setErrors] = useState<{ name?: string; description?: string }>({});

    // Edit State
    const [editingScene, setEditingScene] = useState<Scene | null>(null);

    const resetForm = () => {
        setNewSceneName("");
        setNewSceneDesc("");
        setEditingScene(null);
        setErrors({});
    };

    const startEditing = (scene: Scene) => {
        setEditingScene(scene);
        setNewSceneName(scene.name);
        setNewSceneDesc(scene.description);
        setErrors({});
        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const validateForm = () => {
        const newErrors: { name?: string; description?: string } = {};
        let isValid = true;

        if (!newSceneName.trim()) {
            newErrors.name = "Scene name is required.";
            isValid = false;
        }

        if (!newSceneDesc.trim()) {
            newErrors.description = "Description is required.";
            isValid = false;
        }

        setErrors(newErrors);
        return isValid;
    };

    const handleCreateOrUpdate = async () => {
        if (!validateForm()) {
            return;
        }

        if (!session?.user?.email) return;

        setCreatingScene(true);
        try {
            const payload = {
                email: session.user.email,
                name: newSceneName,
                description: newSceneDesc,
                teacher_words: editingScene ? editingScene.teacher_words : []
            };

            if (editingScene) {
                await teacherService.updateScene(editingScene.id, payload);
                const updatedScene: Scene = {
                    ...editingScene,
                    name: newSceneName,
                    description: newSceneDesc,
                };
                onSceneUpdated(updatedScene);
                toast({ title: "Success", description: "Scene updated.", variant: "success" });
                resetForm();
            } else {
                const newScene = await teacherService.createScene(payload);
                onSceneCreated(newScene);
                toast({ title: "Success", description: "Scene created.", variant: "success" });
                resetForm();
            }
        } catch (error: any) {
            console.error("Failed to save scene", error);
            toast({
                title: "Error",
                description: error.message || "Failed to save scene.",
                variant: "destructive",
            });
        } finally {
            setCreatingScene(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!session?.user?.email) return;
        try {
            await teacherService.deleteScene(id, session.user.email);
            onSceneDeleted(id);
            if (editingScene?.id === id) {
                resetForm();
            }
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in-50 duration-500">
            <Card className="rounded-[2rem] border-none shadow-sm h-fit">
                <CardHeader>
                    <CardTitle>{editingScene ? "Edit Scene" : "Create Scene"}</CardTitle>
                    <CardDescription>{editingScene ? "Update details below." : "Define a new context for learning."}</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="sceneName">Scene Name</Label>
                            <Input
                                id="sceneName"
                                placeholder="e.g., The Kitchen"
                                value={newSceneName}
                                onChange={(e) => {
                                    setNewSceneName(e.target.value);
                                    if (errors.name) setErrors({ ...errors, name: undefined });
                                }}
                                className={errors.name ? "border-red-500 rounded-xl" : "rounded-xl"}
                            />
                            {errors.name && <p className="text-sm text-red-500 font-medium">{errors.name}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="sceneDesc">Description</Label>
                            <Textarea
                                id="sceneDesc"
                                placeholder="Describe the environment to help the AI understand the context."
                                value={newSceneDesc}
                                onChange={(e) => {
                                    setNewSceneDesc(e.target.value);
                                    if (errors.description) setErrors({ ...errors, description: undefined });
                                }}
                                className={errors.description ? "min-h-[100px] border-red-500 rounded-xl" : "min-h-[100px] rounded-xl"}
                            />
                            {errors.description && <p className="text-sm text-red-500 font-medium">{errors.description}</p>}
                        </div>

                        <div className="flex gap-2">
                            {editingScene && (
                                <Button
                                    variant="outline"
                                    onClick={resetForm}
                                    className="rounded-xl h-12 w-12 p-0 shrink-0"
                                >
                                    <X size={20} />
                                </Button>
                            )}
                            <Button
                                onClick={handleCreateOrUpdate}
                                disabled={creatingScene}
                                className="w-full rounded-xl h-12 text-md"
                            >
                                {creatingScene ? (
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                ) : editingScene ? (
                                    <Save className="mr-2 h-4 w-4" />
                                ) : (
                                    <Plus className="mr-2 h-4 w-4" />
                                )}
                                {editingScene ? "Update Scene" : "Create Scene"}
                            </Button>
                        </div>
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
                                <div key={scene.id} className={`p-4 border rounded-2xl bg-white hover:shadow-md transition-shadow relative ${editingScene?.id === scene.id ? 'border-primary ring-1 ring-primary' : ''}`}>
                                    <div className="pr-16">
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

                                    {/* Action Buttons */}
                                    <div className="absolute top-4 right-4 flex gap-1">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-muted-foreground hover:text-primary"
                                            onClick={() => startEditing(scene)}
                                        >
                                            <Pencil size={14} />
                                        </Button>

                                        <DeleteConfirm
                                            title="Delete Scene?"
                                            description={`This will permanently delete "${scene.name}". This action cannot be undone.`}
                                            onConfirm={() => handleDelete(scene.id)}
                                        />
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
