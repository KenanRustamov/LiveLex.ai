import { useState } from 'react';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Save } from 'lucide-react';
import { Scene, VocabItem } from '@/types/teacher';
import { VocabularyInput } from "./VocabularyInput";

const DEFAULT_SOURCE_LANGUAGE = "English";
const DEFAULT_TARGET_LANGUAGE = "Spanish";

interface SceneFormProps {
    initialData?: Scene;
    onSubmit: (data: any) => Promise<void>;
    onCancel: () => void;
    isSubmitting?: boolean;
}

export function SceneForm({ initialData, onSubmit, onCancel, isSubmitting = false }: SceneFormProps) {
    const [name, setName] = useState(initialData?.name || "");
    const [description, setDescription] = useState(initialData?.description || "");
    const [vocab, setVocab] = useState<VocabItem[]>(initialData?.vocab || []);
    const [sourceLanguage, setSourceLanguage] = useState(initialData?.source_language || DEFAULT_SOURCE_LANGUAGE);
    const [targetLanguage, setTargetLanguage] = useState(initialData?.target_language || DEFAULT_TARGET_LANGUAGE);

    const [errors, setErrors] = useState<{ name?: string; description?: string }>({});

    const validateForm = () => {
        const newErrors: { name?: string; description?: string } = {};
        let isValid = true;

        if (!name.trim()) {
            newErrors.name = "Scene name is required.";
            isValid = false;
        }

        if (!description.trim()) {
            newErrors.description = "Description is required.";
            isValid = false;
        }

        setErrors(newErrors);
        return isValid;
    };

    const handleSubmit = async () => {
        if (!validateForm()) return;

        const validVocab = vocab.filter(v => v.source_name.trim() && v.target_name.trim());

        const payload = {
            name,
            description,
            vocab: validVocab,
            source_language: sourceLanguage,
            target_language: targetLanguage
        };

        await onSubmit(payload);
    };

    return (
        <div className="space-y-4 py-4">
            <div className="space-y-2">
                <Label htmlFor="sceneName">Scene Name</Label>
                <Input
                    id="sceneName"
                    placeholder="e.g., The Kitchen"
                    value={name}
                    onChange={(e) => {
                        setName(e.target.value);
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
                    value={description}
                    onChange={(e) => {
                        setDescription(e.target.value);
                        if (errors.description) setErrors({ ...errors, description: undefined });
                    }}
                    className={errors.description ? "min-h-[50px] border-red-500 rounded-xl" : "min-h-[50px] rounded-xl"}
                />
                {errors.description && <p className="text-sm text-red-500 font-medium">{errors.description}</p>}
            </div>

            {/* Language Settings */}
            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                    <Label htmlFor="sourceLanguage">Source Language</Label>
                    <Input
                        id="sourceLanguage"
                        placeholder="English"
                        value={sourceLanguage}
                        onChange={(e) => setSourceLanguage(e.target.value)}
                        className="rounded-xl"
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="targetLanguage">Target Language</Label>
                    <Input
                        id="targetLanguage"
                        placeholder="Spanish"
                        value={targetLanguage}
                        onChange={(e) => setTargetLanguage(e.target.value)}
                        className="rounded-xl"
                    />
                </div>
            </div>

            {/* Vocabulary Input */}
            <div className="pt-2 border-t">
                <VocabularyInput
                    vocab={vocab}
                    onChange={setVocab}
                    sourceLanguage={sourceLanguage}
                    targetLanguage={targetLanguage}
                />
            </div>

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
                    {initialData ? "Update Scene" : "Create Scene"}
                </Button>
            </div>
        </div>
    );
}
