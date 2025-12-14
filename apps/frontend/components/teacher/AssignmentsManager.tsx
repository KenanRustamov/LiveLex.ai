import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Assignment, Scene } from '@/types/teacher';
import { useSession } from 'next-auth/react';
import { teacherService } from "@/services/teacherService";
import { useToast } from "@/components/ui/use-toast";
import { DeleteConfirm } from "@/components/ui/delete-confirm";
import { AssignmentDialog } from "./AssignmentDialog";
import Link from 'next/link';

interface AssignmentsManagerProps {
    assignments: Assignment[];
    scenes: Scene[];
    onAssignmentCreated: (assignment: Assignment) => void;
    onAssignmentDeleted: (id: string) => void;
    onAssignmentUpdated: (assignment: Assignment) => void;
}

export function AssignmentsManager({ assignments, scenes, onAssignmentCreated, onAssignmentDeleted, onAssignmentUpdated }: AssignmentsManagerProps) {
    const { data: session } = useSession();
    const { toast } = useToast();

    // Modal State
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);

    const handleCreate = async (data: any) => {
        if (!session?.user?.email) return;

        try {
            const payload = {
                email: session.user.email,
                ...data
            };
            const newAssignment = await teacherService.createAssignment(payload);
            onAssignmentCreated(newAssignment);
            toast({ title: "Success", description: "Assignment created.", variant: "success" });
            setIsCreateOpen(false);
        } catch (error: any) {
            console.error("Failed to create assignment", error);
            toast({
                title: "Error",
                description: error.message || "Failed to create assignment.",
                variant: "destructive",
            });
        }
    };

    const handleUpdate = async (data: any) => {
        if (!editingAssignment || !session?.user?.email) return;

        try {
            const payload = {
                email: session.user.email,
                ...data
            };
            await teacherService.updateAssignment(editingAssignment.id, payload);
            const updatedAssignment = { ...editingAssignment, ...data };
            onAssignmentUpdated(updatedAssignment);
            toast({ title: "Success", description: "Assignment updated.", variant: "success" });
            setEditingAssignment(null);
        } catch (error: any) {
            console.error("Failed to update assignment", error);
            toast({
                title: "Error",
                description: error.message || "Failed to update assignment.",
                variant: "destructive",
            });
        }
    };

    const handleDelete = async (id: string) => {
        if (!session?.user?.email) return;
        try {
            await teacherService.deleteAssignment(id, session.user.email);
            onAssignmentDeleted(id);
            toast({ title: "Success", description: "Assignment deleted.", variant: "success" });
        } catch (error) {
            console.error("Failed to delete assignment", error);
            toast({
                title: "Error",
                description: "Failed to delete assignment.",
                variant: "destructive",
            });
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in-50 duration-500">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Assignments</h2>
                    <p className="text-muted-foreground">Manage your class vocabulary lists.</p>
                </div>
                <Button onClick={() => setIsCreateOpen(true)} className="rounded-xl h-10">
                    <Plus className="mr-2 h-4 w-4" />
                    New Assignment
                </Button>
            </div>

            {/* Creation Modal */}
            <AssignmentDialog
                open={isCreateOpen}
                onOpenChange={setIsCreateOpen}
                scenes={scenes}
                onSubmit={handleCreate}
            />

            {/* Edit Modal */}
            {editingAssignment && (
                <AssignmentDialog
                    open={!!editingAssignment}
                    onOpenChange={(open) => !open && setEditingAssignment(null)}
                    assignment={editingAssignment}
                    scenes={scenes}
                    onSubmit={handleUpdate}
                />
            )}

            <Card className="rounded-[2rem] border-none shadow-sm">
                <CardContent className="p-6">
                    {assignments.length === 0 ? (
                        <div className="h-40 flex flex-col items-center justify-center text-muted-foreground text-sm border-2 border-dashed rounded-xl">
                            <p>No active assignments.</p>
                            <Button variant="link" onClick={() => setIsCreateOpen(true)}>Create one now</Button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {assignments.map((assignment) => (
                                <div
                                    key={assignment.id}
                                    className="group relative flex flex-col justify-between p-5 border rounded-2xl bg-white hover:shadow-md transition-all hover:border-primary/50 cursor-pointer"
                                    onClick={(e) => {
                                        // Prevent navigation if clicking action buttons
                                        if ((e.target as HTMLElement).closest('button')) return;
                                        // Next.js Link doesn't wrap correctly here so we use router or just wrap contents?
                                        // Actually wrapping the whole card in Link is better UX but requires block handling.
                                        // We will programmatically push or use a Link wrapper.
                                    }}
                                >
                                    <Link href={`/teacher/assignments/${assignment.id}`} className="absolute inset-0 z-0" />

                                    <div className="relative z-10 pointer-events-none">
                                        <h3 className="font-bold text-lg text-gray-900 group-hover:text-primary transition-colors">
                                            {assignment.title}
                                        </h3>

                                        <p className="text-xs text-muted-foreground mt-1">
                                            {new Date(assignment.created_at).toLocaleDateString()}
                                        </p>

                                        <p className="text-sm text-gray-600 mt-2">
                                            {assignment.vocab?.length || 0} words
                                            {assignment.include_grammar && " • Grammar"}
                                            {assignment.scene_id && " • Scene Linked"}
                                        </p>

                                        {/* Vocab Chips Preview */}
                                        <div className="flex gap-1 mt-3 flex-wrap">
                                            {assignment.vocab?.slice(0, 3).map((v, i) => (
                                                <span
                                                    key={i}
                                                    className="text-[10px] bg-secondary px-2 py-1 rounded-full text-secondary-foreground"
                                                >
                                                    {v.source_name}
                                                </span>
                                            ))}
                                            {(assignment.vocab?.length || 0) > 3 && (
                                                <span className="text-[10px] text-muted-foreground pl-1">
                                                    +{(assignment.vocab?.length || 0) - 3}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="relative z-20 flex justify-end gap-1 mt-4 pt-4 border-t border-gray-100">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-muted-foreground hover:text-primary"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setEditingAssignment(assignment);
                                            }}
                                        >
                                            <Pencil size={14} />
                                        </Button>

                                        <div onClick={(e) => e.stopPropagation()}>
                                            <DeleteConfirm
                                                title="Delete Assignment?"
                                                description={`This will permanently delete "${assignment.title}".`}
                                                onConfirm={() => handleDelete(assignment.id)}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
