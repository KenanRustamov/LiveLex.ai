import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, Play } from 'lucide-react';
import { StudentAssignment } from '@/hooks/useStudentData';

interface StudentAssignmentsProps {
    assignments: StudentAssignment[];
}

export function StudentAssignments({ assignments }: StudentAssignmentsProps) {
    return (
        <div className="space-y-6 animate-in fade-in-50 duration-500 pb-20">
            <div>
                <h1 className="text-2xl font-bold">Your Tasks</h1>
                <p className="text-muted-foreground">Assignments from your teacher.</p>
            </div>

            {assignments.length === 0 ? (
                <div className="h-60 flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-gray-200 rounded-[2rem]">
                    <div className="h-16 w-16 bg-gray-50 rounded-full flex items-center justify-center text-gray-300 mb-4">
                        <CheckCircle size={32} />
                    </div>
                    <h3 className="font-semibold text-lg text-gray-900">All caught up!</h3>
                    <p className="text-muted-foreground">No active assignments at the moment.</p>
                </div>
            ) : (
                <div className="grid gap-4">
                    {assignments.map((assignment) => (
                        <Card key={assignment.id} className="rounded-[2rem] border-none shadow-sm overflow-hidden">
                            <CardContent className="p-6">
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <h3 className="font-bold text-lg">{assignment.title}</h3>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            {new Date(assignment.created_at).toLocaleDateString()}
                                        </p>
                                    </div>
                                    {assignment.scene_id && (
                                        <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                                            Context Aware
                                        </span>
                                    )}
                                </div>

                                <div className="flex flex-wrap gap-1.5 mb-6">
                                    {assignment.vocab?.map((v, i) => (
                                        <span key={i} className="text-xs bg-secondary px-2.5 py-1 rounded-full text-secondary-foreground font-medium">
                                            {v.source_name} → {v.target_name}
                                        </span>
                                    ))}
                                </div>

                                <Button className="w-full rounded-xl h-11">
                                    <Play size={16} className="mr-2" /> Start Assignment
                                </Button>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
