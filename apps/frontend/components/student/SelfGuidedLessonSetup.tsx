import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Play, X, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { VocabularyInput } from "../teacher/VocabularyInput";
import { CapturedScene, VocabItem } from '@/hooks/useStudentData';

// Default language settings
const DEFAULT_SOURCE_LANGUAGE = "English";
const DEFAULT_TARGET_LANGUAGE = "Spanish";

interface Scene {
    id: string;
    name: string;
    description: string;
    vocab: VocabItem[];
    source_language: string;
    target_language: string;
}

interface SelfGuidedLessonConfig {
    title: string;
    vocab: VocabItem[];
    scene_id?: string;
    scene_name?: string;
    include_grammar: boolean;
    grammar_tense?: string;
}

interface SelfGuidedLessonSetupProps {
    capturedScenes: CapturedScene[];
    onStartLesson: (config: SelfGuidedLessonConfig) => void;
    onCancel: () => void;
}

export function SelfGuidedLessonSetup({ capturedScenes, onStartLesson, onCancel }: SelfGuidedLessonSetupProps) {
    const { data: session } = useSession();
    const { toast } = useToast();
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';

    // Form State
    const [title, setTitle] = useState("My Practice Session");
    const [manualVocab, setManualVocab] = useState<VocabItem[]>([]);
    const [selectedSceneId, setSelectedSceneId] = useState<string>("none");
    const [includeGrammar, setIncludeGrammar] = useState(false);
    const [grammarTense, setGrammarTense] = useState<"present" | "past">("present");
    const [loading, setLoading] = useState(false);
    
    // Scenes from teacher
    const [teacherScenes, setTeacherScenes] = useState<Scene[]>([]);
    const [loadingScenes, setLoadingScenes] = useState(true);
    
    // Scene vocabulary selection (from teacher-created scene)
    const [selectedSceneVocab, setSelectedSceneVocab] = useState<Set<string>>(new Set());
    
    // Discovered words selection
    const [selectedDiscoveredWords, setSelectedDiscoveredWords] = useState<Set<string>>(new Set());
    const [expandedSceneSelectors, setExpandedSceneSelectors] = useState<Set<string>>(new Set());
    
    // Language settings (derived from selected scene or defaults)
    const [sourceLanguage, setSourceLanguage] = useState(DEFAULT_SOURCE_LANGUAGE);
    const [targetLanguage, setTargetLanguage] = useState(DEFAULT_TARGET_LANGUAGE);

    // Validation State
    const [errors, setErrors] = useState<{ vocab?: string }>({});

    // Fetch teacher scenes on mount
    useEffect(() => {
        const fetchScenes = async () => {
            if (!session?.user?.email) return;
            
            try {
                setLoadingScenes(true);
                const res = await fetch(`${backendUrl}/v1/student/scenes?email=${session.user.email}`);
                if (res.ok) {
                    const data = await res.json();
                    setTeacherScenes(data);
                }
            } catch (error) {
                console.error("Failed to fetch scenes", error);
            } finally {
                setLoadingScenes(false);
            }
        };
        
        fetchScenes();
    }, [session, backendUrl]);

    // Handle scene selection - update language settings and auto-select scene vocab
    const handleSceneChange = (sceneId: string) => {
        setSelectedSceneId(sceneId);
        
        if (sceneId !== "none") {
            const selectedScene = teacherScenes.find(s => s.id === sceneId);
            if (selectedScene) {
                setSourceLanguage(selectedScene.source_language || DEFAULT_SOURCE_LANGUAGE);
                setTargetLanguage(selectedScene.target_language || DEFAULT_TARGET_LANGUAGE);
                
                // Auto-select all vocabulary from the scene
                const sceneVocabKeys = new Set<string>();
                (selectedScene.vocab || []).forEach(word => {
                    sceneVocabKeys.add(`${word.source_name}|${word.target_name}`);
                });
                setSelectedSceneVocab(sceneVocabKeys);
            }
        } else {
            setSourceLanguage(DEFAULT_SOURCE_LANGUAGE);
            setTargetLanguage(DEFAULT_TARGET_LANGUAGE);
            setSelectedSceneVocab(new Set()); // Clear scene vocab selection
        }
    };
    
    // Get the currently selected scene object
    const getSelectedScene = (): Scene | undefined => {
        if (selectedSceneId === "none") return undefined;
        return teacherScenes.find(s => s.id === selectedSceneId);
    };
    
    // Toggle scene vocab word selection
    const toggleSceneVocabSelection = (wordKey: string) => {
        setSelectedSceneVocab(prev => {
            const next = new Set(prev);
            if (next.has(wordKey)) {
                next.delete(wordKey);
            } else {
                next.add(wordKey);
            }
            return next;
        });
    };
    
    // Select all scene vocab
    const selectAllSceneVocab = () => {
        const scene = getSelectedScene();
        if (!scene) return;
        const allKeys = new Set<string>();
        (scene.vocab || []).forEach(word => {
            allKeys.add(`${word.source_name}|${word.target_name}`);
        });
        setSelectedSceneVocab(allKeys);
    };
    
    // Deselect all scene vocab
    const deselectAllSceneVocab = () => {
        setSelectedSceneVocab(new Set());
    };
    
    // Get selected vocab from scene vocabulary
    const getSelectedSceneVocab = (): VocabItem[] => {
        return Array.from(selectedSceneVocab).map(key => {
            const [source_name, target_name] = key.split('|');
            return { source_name, target_name };
        });
    };

    // Toggle word selection from discovered words
    const toggleWordSelection = (wordKey: string) => {
        setSelectedDiscoveredWords(prev => {
            const next = new Set(prev);
            if (next.has(wordKey)) {
                next.delete(wordKey);
            } else {
                next.add(wordKey);
            }
            return next;
        });
    };

    // Select all words from a scene
    const selectAllFromScene = (sceneWords: VocabItem[]) => {
        setSelectedDiscoveredWords(prev => {
            const next = new Set(prev);
            sceneWords.forEach(word => {
                next.add(`${word.source_name}|${word.target_name}`);
            });
            return next;
        });
    };

    // Deselect all words from a scene
    const deselectAllFromScene = (sceneWords: VocabItem[]) => {
        setSelectedDiscoveredWords(prev => {
            const next = new Set(prev);
            sceneWords.forEach(word => {
                next.delete(`${word.source_name}|${word.target_name}`);
            });
            return next;
        });
    };

    // Toggle scene expansion
    const toggleSceneExpansion = (sceneId: string) => {
        setExpandedSceneSelectors(prev => {
            const next = new Set(prev);
            if (next.has(sceneId)) {
                next.delete(sceneId);
            } else {
                next.add(sceneId);
            }
            return next;
        });
    };

    // Get selected vocab from discovered words
    const getSelectedDiscoveredVocab = (): VocabItem[] => {
        return Array.from(selectedDiscoveredWords).map(key => {
            const [source_name, target_name] = key.split('|');
            return { source_name, target_name };
        });
    };

    // Count selected words from a scene
    const countSelectedFromScene = (sceneWords: VocabItem[]): number => {
        return sceneWords.filter(word => 
            selectedDiscoveredWords.has(`${word.source_name}|${word.target_name}`)
        ).length;
    };

    const validateForm = () => {
        const newErrors: { vocab?: string } = {};
        let isValid = true;

        // Filter out empty manual vocab entries
        const validManualVocab = manualVocab.filter(v => v.source_name.trim() && v.target_name.trim());
        const selectedScene = getSelectedSceneVocab();
        const selectedDiscovered = getSelectedDiscoveredVocab();
        const totalVocab = validManualVocab.length + selectedScene.length + selectedDiscovered.length;

        if (totalVocab === 0) {
            newErrors.vocab = "Select or add at least one vocabulary word.";
            isValid = false;
        }

        setErrors(newErrors);
        return isValid;
    };

    const handleStartLesson = async () => {
        if (!validateForm()) {
            return;
        }

        setLoading(true);
        try {
            // Combine scene vocab + discovered words + manual vocab
            const validManualVocab = manualVocab.filter(v => v.source_name.trim() && v.target_name.trim());
            const selectedScene = getSelectedSceneVocab();
            const selectedDiscovered = getSelectedDiscoveredVocab();
            const combinedVocab = [...selectedScene, ...selectedDiscovered, ...validManualVocab];

            // Deduplicate by target_name (case-insensitive)
            const seen = new Set<string>();
            const deduplicatedVocab = combinedVocab.filter(v => {
                const key = v.target_name.toLowerCase();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });

            // Get scene name if selected
            let sceneName: string | undefined;
            if (selectedSceneId !== "none") {
                const scene = teacherScenes.find(s => s.id === selectedSceneId);
                sceneName = scene?.name;
            }

            const config: SelfGuidedLessonConfig = {
                title: title.trim() || "Practice Session",
                vocab: deduplicatedVocab,
                scene_id: selectedSceneId !== "none" ? selectedSceneId : undefined,
                scene_name: sceneName,
                include_grammar: includeGrammar,
                grammar_tense: includeGrammar ? grammarTense : undefined,
            };

            onStartLesson(config);
        } catch (error: any) {
            console.error("Failed to start lesson", error);
            toast({
                title: "Error",
                description: error.message || "Failed to start lesson. Please try again.",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    // Calculate total selected vocab count
    const totalVocabCount = manualVocab.filter(v => v.source_name.trim() && v.target_name.trim()).length 
        + selectedSceneVocab.size
        + selectedDiscoveredWords.size;

    return (
        <div className="space-y-6 animate-in fade-in-50 duration-500 pb-20">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Self-Guided Lesson</h1>
                    <p className="text-muted-foreground">Create your own practice session.</p>
                </div>
                <Button variant="ghost" size="icon" onClick={onCancel} className="rounded-full">
                    <X size={20} />
                </Button>
            </div>

            <Card className="rounded-[2rem] border-none shadow-sm">
                <CardHeader>
                    <CardTitle>Lesson Setup</CardTitle>
                    <CardDescription>Choose what you want to practice.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-5">
                        {/* Title */}
                        <div className="space-y-2">
                            <Label htmlFor="title">Session Title</Label>
                            <Input
                                id="title"
                                placeholder="e.g., Kitchen Practice"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                className="rounded-xl"
                            />
                        </div>

                        {/* Scene Selector */}
                        <div className="space-y-2">
                            <Label htmlFor="sceneSelect">Scene Context (Optional)</Label>
                            <select
                                id="sceneSelect"
                                className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                value={selectedSceneId}
                                onChange={(e) => handleSceneChange(e.target.value)}
                                disabled={loadingScenes}
                            >
                                <option value="none">No Scene</option>
                                {teacherScenes.map((s) => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </select>
                            <p className="text-xs text-muted-foreground">
                                Optionally select a scene for context during the lesson.
                            </p>
                        </div>

                        {/* Scene Vocabulary Selection (when scene is selected) */}
                        {selectedSceneId !== "none" && getSelectedScene()?.vocab && getSelectedScene()!.vocab.length > 0 && (
                            <div className="space-y-3 bg-blue-50 p-4 rounded-xl">
                                <div className="flex items-center justify-between">
                                    <Label className="text-blue-900">Scene Vocabulary</Label>
                                    <span className="text-xs text-blue-700">
                                        {selectedSceneVocab.size}/{getSelectedScene()!.vocab.length} selected
                                    </span>
                                </div>
                                <p className="text-xs text-blue-700">
                                    Words from this scene (auto-selected).
                                </p>
                                <div className="flex justify-end gap-2 mb-2">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="text-xs h-7 text-blue-700 hover:text-blue-900 hover:bg-blue-100"
                                        onClick={() => selectedSceneVocab.size === getSelectedScene()!.vocab.length 
                                            ? deselectAllSceneVocab() 
                                            : selectAllSceneVocab()
                                        }
                                    >
                                        {selectedSceneVocab.size === getSelectedScene()!.vocab.length ? 'Deselect All' : 'Select All'}
                                    </Button>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    {getSelectedScene()!.vocab.map((word, idx) => {
                                        const wordKey = `${word.source_name}|${word.target_name}`;
                                        const isSelected = selectedSceneVocab.has(wordKey);
                                        
                                        return (
                                            <button
                                                key={idx}
                                                type="button"
                                                onClick={() => toggleSceneVocabSelection(wordKey)}
                                                className={`text-xs px-2.5 py-1.5 rounded-full font-medium transition-colors flex items-center gap-1 ${
                                                    isSelected 
                                                        ? 'bg-blue-600 text-white' 
                                                        : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                                                }`}
                                            >
                                                {isSelected && <Check size={12} />}
                                                {word.source_name} → {word.target_name}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

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

                        {/* Discovered Words Selection */}
                        {capturedScenes.length > 0 && (
                            <div className="space-y-3 pt-2 border-t">
                                <div className="flex items-center justify-between">
                                    <Label>Your Discovered Words</Label>
                                    <span className="text-xs text-muted-foreground">
                                        {selectedDiscoveredWords.size} selected
                                    </span>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Select words from scenes you've explored.
                                </p>
                                
                                <div className="space-y-2 max-h-60 overflow-y-auto">
                                    {capturedScenes.map((scene) => {
                                        const isExpanded = expandedSceneSelectors.has(scene.scene_id);
                                        const selectedCount = countSelectedFromScene(scene.words);
                                        const allSelected = selectedCount === scene.words.length;
                                        
                                        return (
                                            <div key={scene.scene_id} className="border rounded-xl overflow-hidden">
                                                <button
                                                    type="button"
                                                    onClick={() => toggleSceneExpansion(scene.scene_id)}
                                                    className="w-full p-3 flex items-center justify-between bg-gray-50/50 hover:bg-gray-100/50 transition-colors"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-medium text-sm">{scene.scene_name}</span>
                                                        <span className="text-xs text-muted-foreground">
                                                            ({selectedCount}/{scene.count})
                                                        </span>
                                                    </div>
                                                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                                </button>
                                                
                                                {isExpanded && (
                                                    <div className="p-3 border-t bg-white">
                                                        <div className="flex justify-end gap-2 mb-2">
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="sm"
                                                                className="text-xs h-7"
                                                                onClick={() => allSelected 
                                                                    ? deselectAllFromScene(scene.words) 
                                                                    : selectAllFromScene(scene.words)
                                                                }
                                                            >
                                                                {allSelected ? 'Deselect All' : 'Select All'}
                                                            </Button>
                                                        </div>
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {scene.words.map((word, idx) => {
                                                                const wordKey = `${word.source_name}|${word.target_name}`;
                                                                const isSelected = selectedDiscoveredWords.has(wordKey);
                                                                
                                                                return (
                                                                    <button
                                                                        key={idx}
                                                                        type="button"
                                                                        onClick={() => toggleWordSelection(wordKey)}
                                                                        className={`text-xs px-2.5 py-1.5 rounded-full font-medium transition-colors flex items-center gap-1 ${
                                                                            isSelected 
                                                                                ? 'bg-primary text-primary-foreground' 
                                                                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                                                        }`}
                                                                    >
                                                                        {isSelected && <Check size={12} />}
                                                                        {word.source_name} → {word.target_name}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Manual Vocabulary Input */}
                        <div className="pt-2 border-t">
                            <div className="mb-3">
                                <Label>Add Custom Words</Label>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Add your own vocabulary to practice.
                                </p>
                            </div>
                            <VocabularyInput
                                vocab={manualVocab}
                                onChange={(newVocab) => {
                                    setManualVocab(newVocab);
                                    if (errors.vocab) setErrors({ ...errors, vocab: undefined });
                                }}
                                sourceLanguage={sourceLanguage}
                                targetLanguage={targetLanguage}
                            />
                            {errors.vocab && <p className="text-sm text-red-500 font-medium mt-2">{errors.vocab}</p>}
                        </div>

                        {/* Summary */}
                        <div className="bg-orange-50 p-4 rounded-xl">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-orange-900">Total Words to Practice</span>
                                <span className="text-lg font-bold text-orange-700">{totalVocabCount}</span>
                            </div>
                        </div>

                        {/* Start Button */}
                        <Button
                            onClick={handleStartLesson}
                            disabled={loading || totalVocabCount === 0}
                            className="w-full rounded-xl h-12 text-md"
                        >
                            {loading ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                                <Play className="mr-2 h-4 w-4" />
                            )}
                            Start Lesson ({totalVocabCount} words)
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

