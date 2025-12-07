import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

export interface StudentAssignment {
    id: string;
    title: string;
    words: string[];
    created_at: string;
    scene_id?: string;
    teacher_id: string;
}

export interface TeacherInfo {
    name: string;
    code: string;
}

export function useStudentData() {
    const { data: session } = useSession();
    const [enrolledTeacher, setEnrolledTeacher] = useState<string | null>(null);
    const [classCode, setClassCode] = useState<string>('');
    const [assignments, setAssignments] = useState<StudentAssignment[]>([]);
    const [loading, setLoading] = useState(true);

    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';

    const fetchData = async () => {
        if (!session?.user?.email) return;

        try {
            setLoading(true);
            const resProfile = await fetch(`${backendUrl}/v1/auth/me?email=${session.user.email}`);

            if (resProfile.ok) {
                const data = await resProfile.json();
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
        loading,
        refresh: fetchData
    };
}
