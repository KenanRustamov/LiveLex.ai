import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Pencil, X, Save } from 'lucide-react';
import { Assignment, Scene } from '@/types/teacher';
import { useSession } from 'next-auth/react';
import { Switch } from "@/components/ui/switch";
import { teacherService } from "@/services/teacherService";
import { useToast } from "@/components/ui/use-toast";
import { DeleteConfirm } from "@/components/ui/delete-confirm";

interface AssignmentsManagerProps {
    assignments: Assignment[];
    scenes: Scene[];
    onAssignmentCreated: (assignment: Assignment) => void;
    onAssignmentDeleted: (id: string) => void;
    onAssignmentUpdated: (assignment: Assignment) => void;
}

export function AssignmentsManager({ assignments, scenes, onAssignmentCreated, onAssignmentDeleted, onAssignmentUpdated }: AssignmentsManagerProps) {
    const { data: session } = useSession();
    const { toast } = useToast();

    // Form State
    const [newAssignmentTitle, setNewAssignmentTitle] = useState("");
    const [newAssignmentWords, setNewAssignmentWords] = useState("");
    const [newAssignmentSceneId, setNewAssignmentSceneId] = useState<string>("none");
    const [newAssignmentDiscoveredCount, setNewAssignmentDiscoveredCount] = useState<number | "">(0);
    const [includeGrammar, setIncludeGrammar] = useState(false);
    const [grammarTense, setGrammarTense] = useState<"present" | "past">("present");
    const [creating, setCreating] = useState(false);

    // Validation State
    const [errors, setErrors] = useState<{ title?: string; words?: string }>({});

    // Edit State
    const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);

    const resetForm = () => {
        setNewAssignmentTitle("");
        setNewAssignmentWords("");
        setNewAssignmentSceneId("none");
        setNewAssignmentDiscoveredCount(0);
        setIncludeGrammar(false);
        setGrammarTense("present");
        setEditingAssignment(null);
        setErrors({});
    };

    const startEditing = (assignment: Assignment) => {
        setEditingAssignment(assignment);
        setNewAssignmentTitle(assignment.title);
        setNewAssignmentWords(assignment.words.join('\n'));
        setNewAssignmentSceneId(assignment.scene_id || "none");
        setNewAssignmentDiscoveredCount(assignment.include_discovered_count || 0);
        setIncludeGrammar(assignment.include_grammar || false);
        setGrammarTense((assignment.grammar_tense as "present" | "past") || "present");
        setErrors({});

        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const validateForm = () => {
        const newErrors: { title?: string; words?: string } = {};
        let isValid = true;

        if (!newAssignmentTitle.trim()) {
            newErrors.title = "Title is required.";
            isValid = false;
        }

        if (!newAssignmentWords.trim()) {
            newErrors.words = "At least one word is required.";
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

        setCreating(true);
        try {
            const wordsList = newAssignmentWords.split('\n').map(w => w.trim()).filter(w => w !== '');
            const payload = {
                email: session.user.email,
                title: newAssignmentTitle,
                words: wordsList,
                include_discovered_count: newAssignmentDiscoveredCount === "" ? 0 : newAssignmentDiscoveredCount,
                include_grammar: includeGrammar,
                grammar_tense: includeGrammar ? grammarTense : null,
                scene_id: newAssignmentSceneId !== "none" ? newAssignmentSceneId : undefined
            };

            if (editingAssignment) {
                await teacherService.updateAssignment(editingAssignment.id, payload);
                const updatedAssignment: Assignment = {
                    ...editingAssignment,
                    title: newAssignmentTitle,
                    words: wordsList,
                    scene_id: newAssignmentSceneId !== "none" ? newAssignmentSceneId : undefined,
                    include_discovered_count: newAssignmentDiscoveredCount === "" ? 0 : newAssignmentDiscoveredCount,
                    include_grammar: includeGrammar,
                    grammar_tense: includeGrammar ? grammarTense : undefined,
                };
                onAssignmentUpdated(updatedAssignment);
                toast({ title: "Success", description: "Assignment updated.", variant: "success" });
                resetForm();
            } else {
                const newAssignment = await teacherService.createAssignment(payload);
                onAssignmentCreated(newAssignment);
                toast({ title: "Success", description: "Assignment created.", variant: "success" });
                resetForm();
            }
        } catch (error: any) {
            console.error("Failed to save assignment", error);
            toast({
                title: "Error",
                description: error.message || "Failed to save assignment. Please try again.",
                variant: "destructive",
            });
        } finally {
            setCreating(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!session?.user?.email) return;
        try {
            await teacherService.deleteAssignment(id, session.user.email);
            onAssignmentDeleted(id);
            if (editingAssignment?.id === id) {
                resetForm();
            }
            toast({ title: "Success", description: "Assignment deleted.", variant: "success" });
        } catch (error) {
            console.error("Failed to delete assignment", error);
            toast({
                title: "Error",
                description: "Failed to delete assignment.",
                variant: "destructive",
            });
        }
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in-50 duration-500">
            <Card className="rounded-[2rem] border-none shadow-sm h-fit">
                <CardHeader>
                    <CardTitle>{editingAssignment ? "Edit Assignment" : "Create Assignment"}</CardTitle>
                    <CardDescription>{editingAssignment ? "Update details below." : "Create a new vocabulary list."}</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="title">Title</Label>
                            <Input
                                id="title"
                                placeholder="e.g., Week 1 Vocabulary"
                                value={newAssignmentTitle}
                                onChange={(e) => {
                                    setNewAssignmentTitle(e.target.value);
                                    if (errors.title) setErrors({ ...errors, title: undefined });
                                }}
                                className={errors.title ? "border-red-500 rounded-xl" : "rounded-xl"}
                            />
                            {errors.title && <p className="text-sm text-red-500 font-medium">{errors.title}</p>}
                        </div>

                        {/* Scene Context Selector */}
                        <div className="space-y-2">
                            <Label htmlFor="sceneSelect">Context (Optional)</Label>
                            <select
                                id="sceneSelect"
                                className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                value={newAssignmentSceneId}
                                onChange={(e) => setNewAssignmentSceneId(e.target.value)}
                            >
                                <option value="none">No Scene Context</option>
                                {scenes.map((s) => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </select>
                        </div>
                        {/* Grammar Toggle */}
                        <div className="flex items-center justify-between bg-gray-50 p-3 rounded-xl">
                            <Label className="text-sm font-medium">Include Grammar Practice</Label>
                            <Switch checked={includeGrammar} onCheckedChange={setIncludeGrammar} />
                        </div>
                        {/* Tense Selector */}
                        {includeGrammar && (
                            <div className="space-y-2 bg-green-50 p-3 rounded-xl">
                                <Label className="text-green-900">Choose Tense</Label>
                                <select
                                    className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                                    value={grammarTense}
                                    onChange={(e) => setGrammarTense(e.target.value as "present" | "past")}
                                >
                                    <option value="present">Present Tense</option>
                                    <option value="past">Past Tense</option>
                                </select>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2 col-span-2">
                                <Label htmlFor="words">Words (one per line)</Label>
                                <Textarea
                                    id="words"
                                    placeholder="Hola&#10;Gracias"
                                    value={newAssignmentWords}
                                    onChange={(e) => {
                                        setNewAssignmentWords(e.target.value);
                                        if (errors.words) setErrors({ ...errors, words: undefined });
                                    }}
                                    className={errors.words ? "min-h-[100px] rounded-xl border-red-500" : "min-h-[100px] rounded-xl"}
                                />
                                {errors.words && <p className="text-sm text-red-500 font-medium">{errors.words}</p>}
                            </div>

                            {newAssignmentSceneId !== "none" && (
                                <div className="space-y-2 col-span-2 bg-blue-50 p-3 rounded-xl">
                                    <Label htmlFor="discoveredCount" className="text-blue-900">Include Student Discovered Words</Label>
                                    <div className="flex items-center gap-3">
                                        <Input
                                            id="discoveredCount"
                                            type="number"
                                            min="0"
                                            max="10"
                                            value={newAssignmentDiscoveredCount}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                if (val === "") {
                                                    setNewAssignmentDiscoveredCount("");
                                                } else {
                                                    const num = parseInt(val);
                                                    if (!isNaN(num)) setNewAssignmentDiscoveredCount(num);
                                                }
                                            }}
                                            className="rounded-xl w-20 bg-white"
                                        />
                                        <span className="text-xs text-blue-700">
                                            Randomly adds words the student found in this scene to their list.
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex gap-2">
                            {editingAssignment && (
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
                                disabled={creating}
                                className="w-full rounded-xl h-12 text-md"
                            >
                                {creating ? (
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                ) : editingAssignment ? (
                                    <Save className="mr-2 h-4 w-4" />
                                ) : (
                                    <Plus className="mr-2 h-4 w-4" />
                                )}
                                {editingAssignment ? "Update Assignment" : "Create Assignment"}
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="rounded-[2rem] border-none shadow-sm">
                <CardHeader>
                    <CardTitle>Active Assignments</CardTitle>
                    <CardDescription>Manage your class lists.</CardDescription>
                </CardHeader>
                <CardContent>
                    {assignments.length === 0 ? (
                        <div className="h-40 flex items-center justify-center text-muted-foreground text-sm border-2 border-dashed rounded-xl">
                            No active assignments.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {assignments.map((assignment) => (
                                <div
                                    key={assignment.id}
                                    className={`p-4 border rounded-2xl bg-white hover:shadow-md transition-shadow relative ${editingAssignment?.id === assignment.id ? 'border-primary ring-1 ring-primary' : ''}`}
                                >
                                    <div className="flex flex-col gap-1 pr-16">
                                        {/* Title */}
                                        <h3 className="font-bold text-gray-900">{assignment.title}</h3>

                                        {/* Metadata */}
                                        <p className="text-sm text-muted-foreground">
                                            {new Date(assignment.created_at).toLocaleDateString()} •{" "}
                                            {assignment.include_grammar ? "Vocab + Grammar" : "Vocab Only"} •{" "}
                                            {assignment.words.length} words
                                        </p>

                                        {/* Word Chips */}
                                        <div className="flex gap-1 mt-2 flex-wrap">
                                            {assignment.words.slice(0, 5).map((w, i) => (
                                                <span
                                                    key={i}
                                                    className="text-xs bg-secondary px-2 py-1 rounded-full text-secondary-foreground"
                                                >
                                                    {w}
                                                </span>
                                            ))}
                                            {assignment.words.length > 5 && (
                                                <span className="text-xs text-muted-foreground pl-1">
                                                    +{assignment.words.length - 5} more
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="absolute top-4 right-4 flex gap-1">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-muted-foreground hover:text-primary"
                                            onClick={() => startEditing(assignment)}
                                        >
                                            <Pencil size={14} />
                                        </Button>

                                        <DeleteConfirm
                                            title="Delete Assignment?"
                                            description={`This will permanently delete "${assignment.title}" for all students. This action cannot be undone.`}
                                            onConfirm={() => handleDelete(assignment.id)}
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
