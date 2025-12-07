import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Trophy, Activity, CheckCircle } from 'lucide-react';
import { Student, ClassAnalytics } from '@/types/teacher';

interface DashboardOverviewProps {
    students: Student[];
    classAnalytics: ClassAnalytics | null;
    assignmentCount: number;
    onSelectStudent: (student: Student) => void;
}

export function DashboardOverview({
    students,
    classAnalytics,
    assignmentCount,
    onSelectStudent
}: DashboardOverviewProps) {

    return (
        <div className="space-y-8 animate-in fade-in-50 duration-500">
            {/* Metrics Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Overall Class Score */}
                <Card className="col-span-1 rounded-[2rem] border-none shadow-sm overflow-hidden relative">
                    <CardContent className="p-8 flex items-center justify-between">
                        <div>
                            <h3 className="text-muted-foreground font-medium mb-1">Overall Class Score</h3>
                            <div className="text-5xl font-bold text-foreground">
                                {classAnalytics?.overall_accuracy ?? 0}%
                            </div>
                            <p className="text-sm text-muted-foreground mt-2">Grade average {classAnalytics?.overall_accuracy ?? 0}%</p>
                        </div>
                        <div className="h-24 w-24 bg-green-100 rounded-full flex items-center justify-center text-green-600">
                            <Trophy size={48} />
                        </div>
                    </CardContent>
                </Card>

                {/* Work Assigned / Words Practiced */}
                <Card className="col-span-1 rounded-[2rem] border-none shadow-sm">
                    <CardContent className="p-8 flex items-center justify-between">
                        <div>
                            <h3 className="text-muted-foreground font-medium mb-1">Work Assigned</h3>
                            <div className="text-5xl font-bold text-foreground">
                                {assignmentCount}
                            </div>
                            <p className="text-sm text-muted-foreground mt-2">{classAnalytics?.total_words_practiced ?? 0} words practiced</p>
                        </div>
                        <div className="h-24 w-24 bg-yellow-100 rounded-full flex items-center justify-center text-yellow-600">
                            <Activity size={48} />
                        </div>
                    </CardContent>
                </Card>

                {/* Struggling Insight */}
                <Card className="col-span-1 border-none shadow-sm rounded-[2rem] bg-orange-50">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-orange-900 text-lg">Needs Attention</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {classAnalytics?.struggling_words && classAnalytics.struggling_words.length > 0 ? (
                            <div className="space-y-3">
                                {classAnalytics.struggling_words.slice(0, 3).map((w, i) => (
                                    <div key={i} className="flex justify-between items-center bg-white p-2 rounded-xl">
                                        <span className="font-medium text-orange-900 px-2">{w.word}</span>
                                        <span className="font-bold text-orange-600 px-2">{w.accuracy}%</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-24 text-orange-400">
                                <CheckCircle className="mb-2" />
                                <span className="text-sm">Class is doing great!</span>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Students Proficiency Table */}
            <div>
                <div className="flex justify-between items-center mb-4 px-2">
                    <h2 className="text-xl font-bold text-foreground">Students Proficiency</h2>
                    <span className="text-sm text-muted-foreground">All Strands</span>
                </div>

                <div className="bg-white rounded-[2rem] shadow-sm overflow-hidden p-6">
                    <table className="w-full">
                        <thead>
                            <tr className="text-left text-sm text-muted-foreground border-b border-gray-100">
                                <th className="pb-4 font-medium pl-4">Full Name</th>
                                <th className="pb-4 font-medium">Work Completed</th>
                                <th className="pb-4 font-medium">Average Score</th>
                                <th className="pb-4 font-medium">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {students.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="py-8 text-center text-muted-foreground">No students found.</td>
                                </tr>
                            ) : (
                                students.map((student, i) => {
                                    const score = student.average_score || 0;
                                    const statusColor = score >= 80 ? 'text-green-600 bg-green-50' : score >= 50 ? 'text-yellow-600 bg-yellow-50' : 'text-red-600 bg-red-50';
                                    const statusText = score >= 80 ? 'Mastered' : score >= 50 ? 'Working Towards' : 'Needing Attention';

                                    return (
                                        <tr
                                            key={i}
                                            className="group hover:bg-gray-50 transition-colors cursor-pointer"
                                            onClick={() => onSelectStudent(student)}
                                        >
                                            <td className="py-4 pl-4">
                                                <div className="flex items-center gap-3">
                                                    <Avatar className="h-10 w-10 border border-gray-100">
                                                        <AvatarImage src={student.profile_image} />
                                                        <AvatarFallback>{student.name?.[0]}</AvatarFallback>
                                                    </Avatar>
                                                    <span className="font-semibold text-gray-700 group-hover:text-primary transition-colors">{student.name}</span>
                                                </div>
                                            </td>
                                            <td className="py-4 text-gray-600 font-medium">
                                                {student.words_practiced} / {classAnalytics?.total_words_practiced || '?'} words
                                            </td>
                                            <td className="py-4">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-16 bg-gray-100 rounded-full h-2 overflow-hidden">
                                                        <div className={`h-full ${score >= 80 ? 'bg-green-500' : score >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${score}%` }}></div>
                                                    </div>
                                                    <span className="font-bold text-gray-700">{score}%</span>
                                                </div>
                                            </td>
                                            <td className="py-4">
                                                <span className={`px-3 py-1 rounded-full text-xs font-bold ${statusColor}`}>
                                                    {statusText}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
