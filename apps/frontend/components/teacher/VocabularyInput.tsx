import { useState } from 'react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Plus, X } from 'lucide-react';
import { VocabItem } from '@/types/teacher';

interface VocabularyInputProps {
    vocab: VocabItem[];
    onChange: (vocab: VocabItem[]) => void;
    sourceLanguage: string;
    targetLanguage: string;
}

export function VocabularyInput({ vocab, onChange, sourceLanguage, targetLanguage }: VocabularyInputProps) {
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

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <Label>Vocabulary</Label>
                <span className="text-xs text-muted-foreground">
                    {vocab.filter(v => v.source_name && v.target_name).length} word{vocab.filter(v => v.source_name && v.target_name).length !== 1 ? 's' : ''}
                </span>
            </div>
            
            {/* Column Headers */}
            {vocab.length > 0 && (
                <div className="grid grid-cols-[1fr_1fr_40px] gap-2 px-1">
                    <span className="text-xs font-medium text-muted-foreground">{sourceLanguage}</span>
                    <span className="text-xs font-medium text-muted-foreground">{targetLanguage}</span>
                    <span></span>
                </div>
            )}
            
            {/* Vocabulary Rows */}
            <div className="space-y-2">
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
                            className="h-10 w-10 text-muted-foreground hover:text-destructive"
                        >
                            <X size={16} />
                        </Button>
                    </div>
                ))}
            </div>
            
            {/* Add Row Button */}
            <Button
                type="button"
                variant="outline"
                onClick={addRow}
                className="w-full rounded-xl h-10 border-dashed"
            >
                <Plus size={16} className="mr-2" />
                Add Word
            </Button>
            
            {/* Empty State */}
            {vocab.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-2">
                    No vocabulary added yet. Click "Add Word" to start.
                </p>
            )}
        </div>
    );
}

