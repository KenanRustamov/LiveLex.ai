import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2, Plus } from 'lucide-react';
import { Assignment, Scene } from '@/types/teacher';
import { useSession } from 'next-auth/react';
import { Switch } from "@/components/ui/switch";

interface AssignmentsManagerProps {
    assignments: Assignment[];
    scenes: Scene[];
    onAssignmentCreated: (assignment: Assignment) => void;
}

export function AssignmentsManager({ assignments, scenes, onAssignmentCreated }: AssignmentsManagerProps) {
    const { data: session } = useSession();

    // Form State
    const [newAssignmentTitle, setNewAssignmentTitle] = useState("");
    const [newAssignmentWords, setNewAssignmentWords] = useState("");
    const [newAssignmentSceneId, setNewAssignmentSceneId] = useState<string>("none");
    const [newAssignmentDiscoveredCount, setNewAssignmentDiscoveredCount] = useState<number>(0);
    const [includeGrammar, setIncludeGrammar] = useState(false);
    const [grammarTense, setGrammarTense] = useState<"present" | "past">("present");
    const [creating, setCreating] = useState(false);

    const handleCreateAssignment = async () => {
        if (!newAssignmentTitle || !newAssignmentWords) return;
        setCreating(true);
        try {
            const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';
            const wordsList = newAssignmentWords.split('\n').filter(w => w.trim() !== '');

            const payload: any = {
                email: session?.user?.email,
                title: newAssignmentTitle,
                words: wordsList,
                include_discovered_count: newAssignmentDiscoveredCount,
                include_grammar: includeGrammar,
                grammar_tense: includeGrammar ? grammarTense : null
            };

            if (newAssignmentSceneId && newAssignmentSceneId !== "none") {
                payload.scene_id = newAssignmentSceneId;
            }

            const res = await fetch(`${backendUrl}/v1/assignments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                const data = await res.json();

                // Construct new assignment object (matching backend response roughly)
                const newAssignment: Assignment = {
                    id: data.id,
                    title: newAssignmentTitle,
                    words: wordsList,
                    scene_id: newAssignmentSceneId !== "none" ? newAssignmentSceneId : undefined,
                    include_discovered_count: newAssignmentDiscoveredCount,
                    include_grammar: includeGrammar,
                    grammar_tense: includeGrammar ? grammarTense : undefined,
                    created_at: new Date().toISOString()
                };

                onAssignmentCreated(newAssignment);

                // Reset form
                setNewAssignmentTitle("");
                setNewAssignmentWords("");
                setNewAssignmentSceneId("none");
                setNewAssignmentDiscoveredCount(0);
                setIncludeGrammar(false);
                setGrammarTense("present");
            }
        } catch (error) {
            console.error("Failed to create assignment", error);
        } finally {
            setCreating(false);
        }
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in-50 duration-500">
            <Card className="rounded-[2rem] border-none shadow-sm h-fit">
                <CardHeader>
                    <CardTitle>Create Assignment</CardTitle>
                    <CardDescription>Create a new vocabulary list.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="title">Title</Label>
                            <Input
                                id="title"
                                placeholder="e.g., Week 1 Vocabulary"
                                value={newAssignmentTitle}
                                onChange={(e) => setNewAssignmentTitle(e.target.value)}
                                className="rounded-xl"
                            />
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
                                    onChange={(e) => setNewAssignmentWords(e.target.value)}
                                    className="min-h-[100px] rounded-xl"
                                />
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
                                            onChange={(e) => setNewAssignmentDiscoveredCount(parseInt(e.target.value) || 0)}
                                            className="rounded-xl w-20 bg-white"
                                        />
                                        <span className="text-xs text-blue-700">
                                            Randomly adds words the student found in this scene to their list.
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>

                        <Button
                            onClick={handleCreateAssignment}
                            disabled={creating}
                            className="w-full rounded-xl h-12 text-md"
                        >
                            {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="mr-2 h-4 w-4" />}
                            Create Assignment
                        </Button>
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
                                    className="p-4 border rounded-2xl bg-white hover:shadow-md transition-shadow"
                                >
                                    <div className="flex flex-col gap-1">
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
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
