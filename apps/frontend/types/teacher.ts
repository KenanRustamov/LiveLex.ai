export interface Student {
    name: string;
    profile_image: string;
    username: string;
    words_practiced: number;
    average_score: number;
}

export interface VocabItem {
    source_name: string;
    target_name: string;
}

export interface Assignment {
    id: string;
    title: string;
    vocab: VocabItem[];
    created_at: string;
    scene_id?: string | null;
    include_discovered_count?: number;
    include_grammar?: boolean;
    grammar_tense?: string | null;
}

export interface Scene {
    id: string;
    name: string;
    description: string;
    vocab: VocabItem[];
    source_language: string;
    target_language: string;
    teacher_id: string;
}

export interface StrugglingWord {
    word: string;
    accuracy: number;
}

export interface ClassAnalytics {
    overall_accuracy: number;
    total_words_practiced: number;
    total_assigned_words: number;
    struggling_words: StrugglingWord[];
}
