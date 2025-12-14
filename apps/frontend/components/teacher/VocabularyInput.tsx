import { useState, useRef } from 'react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Plus, X, Upload } from 'lucide-react';
import { VocabItem } from '@/types/teacher';

interface VocabularyInputProps {
    vocab: VocabItem[];
    onChange: (vocab: VocabItem[]) => void;
    sourceLanguage: string;
    targetLanguage: string;
}

export function VocabularyInput({ vocab, onChange, sourceLanguage, targetLanguage }: VocabularyInputProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const addRow = () => {
        onChange([...vocab, { source_name: '', target_name: '' }]);
    };

    const updateRow = (index: number, field: 'source_name' | 'target_name', value: string) => {
        const updated = [...vocab];
        updated[index] = { ...updated[index], [field]: value };
        onChange(updated);
    };

    const removeRow = (index: number) => {
        onChange(vocab.filter((_, i) => i !== index));
    };

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            if (!text) return;

            const lines = text.split('\n');
            const newVocab: VocabItem[] = [];

            // Skip header if it looks like a header
            const startIndex = lines[0].toLowerCase().includes('source') ? 1 : 0;

            for (let i = startIndex; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;

                // Simple CSV split (handling standard comma separation)
                // For more complex CSVs, a library would be better, but this suffices for simple lists
                const parts = line.split(',');
                if (parts.length >= 2) {
                    const source = parts[0].trim();
                    const target = parts[1].trim();
                    if (source && target) {
                        newVocab.push({ source_name: source, target_name: target });
                    }
                }
            }

            if (newVocab.length > 0) {
                onChange([...vocab, ...newVocab]);
            }

            // Reset input
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        };
        reader.readAsText(file);
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <Label>Vocabulary</Label>
                <div className="flex gap-2">
                    <span className="text-xs text-muted-foreground self-center">
                        {vocab.filter(v => v.source_name && v.target_name).length} word{vocab.filter(v => v.source_name && v.target_name).length !== 1 ? 's' : ''}
                    </span>
                </div>
            </div>

            {/* Column Headers */}
            {vocab.length > 0 && (
                <div className="grid grid-cols-[1fr_1fr_40px] gap-2 px-1 pr-4"> {/* pr-4 to account for scrollbar */}
                    <span className="text-xs font-medium text-muted-foreground">{sourceLanguage}</span>
                    <span className="text-xs font-medium text-muted-foreground">{targetLanguage}</span>
                    <span></span>
                </div>
            )}

            {/* Vocabulary Rows - Scrollable */}
            <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2">
                {vocab.map((item, index) => (
                    <div key={index} className="grid grid-cols-[1fr_1fr_40px] gap-2 items-center">
                        <Input
                            placeholder={`e.g., apple`}
                            value={item.source_name}
                            onChange={(e) => updateRow(index, 'source_name', e.target.value)}
                            className="rounded-xl h-10"
                        />
                        <Input
                            placeholder={`e.g., manzana`}
                            value={item.target_name}
                            onChange={(e) => updateRow(index, 'target_name', e.target.value)}
                            className="rounded-xl h-10"
                        />
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeRow(index)}
                            className="h-10 w-10 text-muted-foreground hover:text-destructive shrink-0"
                        >
                            <X size={16} />
                        </Button>
                    </div>
                ))}
            </div>

            {/* Actions */}
            <div className="flex gap-2">
                <Button
                    type="button"
                    variant="outline"
                    onClick={addRow}
                    className="flex-1 rounded-xl h-10 border-dashed"
                >
                    <Plus size={16} className="mr-2" />
                    Add Word
                </Button>

                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept=".csv"
                    className="hidden"
                />

                <Button
                    type="button"
                    variant="secondary"
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-xl h-10"
                    title="Upload CSV (source,target)"
                >
                    <Upload size={16} className="mr-2" />
                    Import CSV
                </Button>
            </div>

            {/* Empty State */}
            {vocab.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-2">
                    No vocabulary added yet. Import a CSV or click "Add Word" to start.
                </p>
            )}
        </div>
    );
}

