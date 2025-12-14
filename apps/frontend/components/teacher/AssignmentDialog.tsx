import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { AssignmentForm } from "./AssignmentForm";
import { Assignment, Scene } from "@/types/teacher";

interface AssignmentDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    assignment?: Assignment; // If present, edit mode
    scenes: Scene[];
    onSubmit: (data: any) => Promise<void>;
}

export function AssignmentDialog({
    open,
    onOpenChange,
    assignment,
    scenes,
    onSubmit,
}: AssignmentDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto rounded-[2rem]">
                <DialogHeader>
                    <DialogTitle>{assignment ? "Edit Assignment" : "New Assignment"}</DialogTitle>
                    <DialogDescription>
                        {assignment
                            ? "Update assignment details and vocabulary."
                            : "Create a new vocabulary practice list for your students."}
                    </DialogDescription>
                </DialogHeader>
                <AssignmentForm
                    initialData={assignment}
                    scenes={scenes}
                    onSubmit={async (data) => {
                        await onSubmit(data);
                        onOpenChange(false);
                    }}
                    onCancel={() => onOpenChange(false)}
                />
            </DialogContent>
        </Dialog>
    );
}
