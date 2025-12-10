import { Assignment, Scene, VocabItem } from '@/types/teacher';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';

type CreateAssignmentPayload = {
    email: string;
    title: string;
    vocab: VocabItem[];
    scene_id?: string;
    include_discovered_count?: number;
    include_grammar?: boolean;
    grammar_tense?: string | null;
}

type CreateScenePayload = {
    email: string;
    name: string;
    description: string;
    vocab?: VocabItem[];
    source_language?: string;
    target_language?: string;
}

export const teacherService = {
    // Helper to handle response
    async handleResponse(res: Response, errorMsg: string) {
        if (!res.ok) {
            let detail = errorMsg;
            try {
                const data = await res.json();
                if (data.detail) detail = data.detail;
            } catch (e) { /* ignore json parse error */ }
            throw new Error(detail);
        }
        // return json if not empty (checked by attempting text first optionally, but for now assuming strict json unless empty)
        // For endpoints that return content:
        const text = await res.text();
        return text ? JSON.parse(text) : undefined;
    },

    // Assignments
    async createAssignment(payload: CreateAssignmentPayload): Promise<Assignment> {
        const res = await fetch(`${BACKEND_URL}/v1/assignments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        return this.handleResponse(res, 'Failed to create assignment');
    },

    async updateAssignment(id: string, payload: CreateAssignmentPayload): Promise<void> {
        const res = await fetch(`${BACKEND_URL}/v1/assignments/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        return this.handleResponse(res, 'Failed to update assignment');
    },

    async deleteAssignment(id: string, email: string): Promise<void> {
        const res = await fetch(`${BACKEND_URL}/v1/assignments/${id}?email=${email}`, {
            method: 'DELETE',
        });
        return this.handleResponse(res, 'Failed to delete assignment');
    },

    // Scenes
    async createScene(payload: CreateScenePayload): Promise<Scene> {
        const res = await fetch(`${BACKEND_URL}/v1/teacher/scenes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        return this.handleResponse(res, 'Failed to create scene');
    },

    async updateScene(id: string, payload: CreateScenePayload): Promise<void> {
        const res = await fetch(`${BACKEND_URL}/v1/teacher/scenes/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        return this.handleResponse(res, 'Failed to update scene');
    },

    async deleteScene(id: string, email: string): Promise<void> {
        const res = await fetch(`${BACKEND_URL}/v1/teacher/scenes/${id}?email=${email}`, {
            method: 'DELETE',
        });
        return this.handleResponse(res, 'Failed to delete scene');
    }
};
