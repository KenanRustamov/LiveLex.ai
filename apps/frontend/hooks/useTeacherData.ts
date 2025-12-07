import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Student, Assignment, Scene, ClassAnalytics } from '@/types/teacher';

export function useTeacherData() {
    const { data: session } = useSession();
    const [teacherCode, setTeacherCode] = useState<string | null>(null);
    const [students, setStudents] = useState<Student[]>([]);
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [scenes, setScenes] = useState<Scene[]>([]);
    const [classAnalytics, setClassAnalytics] = useState<ClassAnalytics | null>(null);
    const [loading, setLoading] = useState(true);

    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';

    const fetchData = async () => {
        if (!session?.user?.email) return;

        try {
            setLoading(true);

            // Parallel fetching for performance
            const [
                resProfile,
                resStudents,
                resAssignments,
                resScenes,
                resAnalytics
            ] = await Promise.all([
                fetch(`${backendUrl}/v1/auth/me?email=${session.user.email}`),
                fetch(`${backendUrl}/v1/auth/teacher/students?email=${session.user.email}`),
                fetch(`${backendUrl}/v1/assignments?email=${session.user.email}`),
                fetch(`${backendUrl}/v1/scenes?email=${session.user.email}`),
                fetch(`${backendUrl}/v1/auth/teacher/analytics?email=${session.user.email}`)
            ]);

            if (resProfile.ok) {
                const data = await resProfile.json();
                setTeacherCode(data.teacher_code);
            }

            if (resStudents.ok) {
                setStudents(await resStudents.json());
            }

            if (resAssignments.ok) {
                setAssignments(await resAssignments.json());
            }

            if (resScenes.ok) {
                setScenes(await resScenes.json());
            }

            if (resAnalytics.ok) {
                setClassAnalytics(await resAnalytics.json());
            }

        } catch (error) {
            console.error("Failed to fetch teacher data", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session]);

    // Expose setters or refresh methods if needed for optimistic updates
    return {
        teacherCode,
        students,
        assignments,
        scenes,
        classAnalytics,
        loading,
        setAssignments, // Exposed for optimistic updates
        setScenes,      // Exposed for optimistic updates
        refresh: fetchData
    };
}
