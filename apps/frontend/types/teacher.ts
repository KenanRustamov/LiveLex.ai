export interface Student {
    name: string;
    profile_image: string;
    username: string;
    words_practiced: number;
    average_score: number;
}

export interface Assignment {
    id: string;
    title: string;
    words: string[];
    created_at: string;
    scene_id?: string | null;
    include_discovered_count?: number;
}

export interface Scene {
    id: string;
    name: string;
    description: string;
    teacher_words: string[];
    teacher_id: string;
}

export interface StrugglingWord {
    word: string;
    accuracy: number;
}

export interface ClassAnalytics {
    overall_accuracy: number;
    total_words_practiced: number;
    struggling_words: StrugglingWord[];
}
