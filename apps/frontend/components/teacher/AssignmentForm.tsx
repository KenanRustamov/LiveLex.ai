import { useState, useEffect } from 'react';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Save } from 'lucide-react';
import { Assignment, Scene, VocabItem } from '@/types/teacher';
import { Switch } from "@/components/ui/switch";
import { VocabularyInput } from "./VocabularyInput";

const DEFAULT_SOURCE_LANGUAGE = "English";
const DEFAULT_TARGET_LANGUAGE = "Spanish";

interface AssignmentFormProps {
    initialData?: Assignment;
    scenes: Scene[];
    onSubmit: (data: any) => Promise<void>;
    onCancel: () => void;
    isSubmitting?: boolean;
}

export function AssignmentForm({ initialData, scenes, onSubmit, onCancel, isSubmitting = false }: AssignmentFormProps) {
    // Form State
    const [title, setTitle] = useState(initialData?.title || "");
    const [vocab, setVocab] = useState<VocabItem[]>(initialData?.vocab || []);
    const [sceneId, setSceneId] = useState<string>(initialData?.scene_id || "none");
    const [discoveredCount, setDiscoveredCount] = useState<number | "">(initialData?.include_discovered_count || 0);
    const [includeGrammar, setIncludeGrammar] = useState(initialData?.include_grammar || false);
    const [grammarTense, setGrammarTense] = useState<"present" | "past">((initialData?.grammar_tense as "present" | "past") || "present");

    // Language settings
    const [sourceLanguage, setSourceLanguage] = useState(DEFAULT_SOURCE_LANGUAGE);
    const [targetLanguage, setTargetLanguage] = useState(DEFAULT_TARGET_LANGUAGE);

    // Validation State
    const [errors, setErrors] = useState<{ title?: string; vocab?: string }>({});

    // Initialize languages based on scene or initial data
    useEffect(() => {
        if (sceneId !== "none") {
            const selectedScene = scenes.find(s => s.id === sceneId);
            if (selectedScene) {
                setSourceLanguage(selectedScene.source_language || DEFAULT_SOURCE_LANGUAGE);
                setTargetLanguage(selectedScene.target_language || DEFAULT_TARGET_LANGUAGE);
            }
        } else {
            setSourceLanguage(DEFAULT_SOURCE_LANGUAGE);
            setTargetLanguage(DEFAULT_TARGET_LANGUAGE);
        }
    }, [sceneId, scenes]);

    // Update vocabulary when scene changes (only if creating fresh or explicitly wanted?)
    // Note: The original logic in AssignmentsManager overrode vocab on scene change.
    // We should be careful. Users might switch scenes and lose their custom vocab.
    // Keeping original behavior: populate if switching TO a scene.
    // But we need to distinguish between "initial load" and "user switched scene".
    // We'll trust the user interaction.

    const handleSceneChange = (newSceneId: string) => {
        setSceneId(newSceneId);

        if (newSceneId !== "none") {
            const selectedScene = scenes.find(s => s.id === newSceneId);
            if (selectedScene) {
                // Determine if we should overwrite vocab. 
                // Creating new: Yes. Editing: Maybe not?
                // Original logic: Always overwrote. Let's keep it simple but maybe warn?
                // For now, mirroring original behavior:
                // "Deep copy the scene's vocab"
                const sceneVocab = (selectedScene.vocab || []).map(v => ({
                    source_name: v.source_name,
                    target_name: v.target_name
                }));
                // Only replace if we are creating new? Or if user explicitly chose it.
                // Since this is a controlled change, we assume intent.
                // However, let's only do it if the vocab list is currently empty to avoid blowing away work,
                // OR if the user is explicitly selecting a scene for the first time.
                // The original code overwrote unconditionally. Let's stick to that for parity.
                setVocab(sceneVocab);
            }
        } else {
            // Clear vocab when no scene? 
            // Original code: "Clear vocab when no scene is selected (unless editing)"
            // Logic: if (!editingAssignment) setVocab([])
            if (!initialData) {
                setVocab([]);
            }
        }
    };

    const validateForm = () => {
        const newErrors: { title?: string; vocab?: string } = {};
        let isValid = true;

        if (!title.trim()) {
            newErrors.title = "Title is required.";
            isValid = false;
        }

        const validVocab = vocab.filter(v => v.source_name.trim() && v.target_name.trim());
        if (validVocab.length === 0) {
            newErrors.vocab = "At least one vocabulary word is required.";
            isValid = false;
        }

        setErrors(newErrors);
        return isValid;
    };

    const handleSubmit = async () => {
        if (!validateForm()) return;

        const validVocab = vocab.filter(v => v.source_name.trim() && v.target_name.trim());

        const payload = {
            title,
            vocab: validVocab,
            include_discovered_count: discoveredCount === "" ? 0 : discoveredCount,
            include_grammar: includeGrammar,
            grammar_tense: includeGrammar ? grammarTense : null,
            scene_id: sceneId !== "none" ? sceneId : undefined
        };

        await onSubmit(payload);
    };

    return (
        <div className="space-y-4 py-4">
            <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                    id="title"
                    placeholder="e.g., Week 1 Vocabulary"
                    value={title}
                    onChange={(e) => {
                        setTitle(e.target.value);
                        if (errors.title) setErrors({ ...errors, title: undefined });
                    }}
                    className={errors.title ? "border-red-500 rounded-xl" : "rounded-xl"}
                />
                {errors.title && <p className="text-sm text-red-500 font-medium">{errors.title}</p>}
            </div>

            {/* Scene Selector */}
            <div className="space-y-2">
                <Label htmlFor="sceneSelect">Scene (Optional)</Label>
                <select
                    id="sceneSelect"
                    className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    value={sceneId}
                    onChange={(e) => handleSceneChange(e.target.value)}
                >
                    <option value="none">No Scene</option>
                    {scenes.map((s) => (
                        <option key={s.id} value={s.id}>{s.name} ({s.vocab?.length || 0} words)</option>
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
                        <option value="present indicative">Present Indicative</option>
                        <option value="preterite">Preterite</option>
                    </select>
                </div>
            )}

            {/* Vocabulary Input */}
            <div className="pt-2 border-t">
                <VocabularyInput
                    vocab={vocab}
                    onChange={(newVocab) => {
                        setVocab(newVocab);
                        if (errors.vocab) setErrors({ ...errors, vocab: undefined });
                    }}
                    sourceLanguage={sourceLanguage}
                    targetLanguage={targetLanguage}
                />
                {errors.vocab && <p className="text-sm text-red-500 font-medium mt-2">{errors.vocab}</p>}
            </div>

            {sceneId !== "none" && (
                <div className="space-y-2 bg-blue-50 p-3 rounded-xl">
                    <Label htmlFor="discoveredCount" className="text-blue-900">Include Student Discovered Words</Label>
                    <div className="flex items-center gap-3">
                        <Input
                            id="discoveredCount"
                            type="number"
                            min="0"
                            max="10"
                            value={discoveredCount}
                            onChange={(e) => {
                                const val = e.target.value;
                                if (val === "") {
                                    setDiscoveredCount("");
                                } else {
                                    const num = parseInt(val);
                                    if (!isNaN(num)) setDiscoveredCount(num);
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

            <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={onCancel} type="button" className="rounded-xl">
                    Cancel
                </Button>
                <Button
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="rounded-xl"
                >
                    {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    {initialData ? "Update Assignment" : "Create Assignment"}
                </Button>
            </div>
        </div>
    );
}
