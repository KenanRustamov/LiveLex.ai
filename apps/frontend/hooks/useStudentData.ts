import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

export interface VocabItem {
    source_name: string;
    target_name: string;
}

export interface StudentAssignment {
    id: string;
    title: string;
    vocab: VocabItem[];
    created_at: string;
    scene_id?: string;
    scene_name?: string;
    teacher_id: string;
    include_grammar?: boolean;
    grammar_tense?: string;
    include_discovered_count?: number;
    student_discovered_count?: number;
    can_start?: boolean;
}

export interface TeacherInfo {
    name: string;
    code: string;
}

export interface CapturedScene {
    scene_id: string;
    scene_name: string;
    words: VocabItem[];
    count: number;
}

export function useStudentData() {
    const { data: session } = useSession();
    const [enrolledTeacher, setEnrolledTeacher] = useState<string | null>(null);
    const [classCode, setClassCode] = useState<string>('');
    const [assignments, setAssignments] = useState<StudentAssignment[]>([]);
    const [wordsLearned, setWordsLearned] = useState<number>(0);
    const [streakDays, setStreakDays] = useState<number>(0);
    const [capturedScenes, setCapturedScenes] = useState<CapturedScene[]>([]);
    const [loading, setLoading] = useState(true);

    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';

    const fetchData = async () => {
        if (!session?.user?.email) return;

        try {
            setLoading(true);
            const resProfile = await fetch(`${backendUrl}/v1/auth/me?email=${session.user.email}`);

            if (resProfile.ok) {
                const data = await resProfile.json();
                
                // Set stats from profile response
                setWordsLearned(data.words_learned ?? 0);
                setStreakDays(data.streak_days ?? 0);
                
                // Set captured scenes
                setCapturedScenes(data.discovered_scene_words_details ?? []);
                
                if (data.enrolled_class_code || data.teacher_id) {
                    if (data.enrolled_class_code) setClassCode(data.enrolled_class_code);
                    // Fetch teacher name if needed, or just assume enrolled
                    // Ideally backend returns teacher name in distinct profile call or here
                    // v1/auth/me currently returns enrolled_class_code. 
                    // Let's rely on that for "Enrolled" state.
                    setEnrolledTeacher("Your Teacher"); // We might want to fetch the real name

                    // Fetch assignments
                    const resAssignments = await fetch(`${backendUrl}/v1/assignments?email=${session.user.email}`);
                    if (resAssignments.ok) {
                        setAssignments(await resAssignments.json());
                    }
                } else {
                    // Student is not enrolled in any class - clear enrollment state
                    setClassCode('');
                    setEnrolledTeacher(null);
                    setAssignments([]);
                }
            }
        } catch (error) {
            console.error("Failed to fetch student data", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session]);

    return {
        enrolledTeacher,
        classCode,
        assignments,
        wordsLearned,
        streakDays,
        capturedScenes,
        loading,
        refresh: fetchData
    };
}
