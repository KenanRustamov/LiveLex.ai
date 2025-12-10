export interface VocabItem {
    source_name: string;
    target_name: string;
}

export interface Scene {
    id: string;
    name: string;
    description: string;
    image_url?: string;
    vocab?: VocabItem[];
    source_language?: string;
    target_language?: string;
    teacher_id?: string;
}
