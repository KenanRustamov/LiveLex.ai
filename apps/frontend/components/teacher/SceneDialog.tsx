import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { SceneForm } from "./SceneForm";
import { Scene } from "@/types/teacher";

interface SceneDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    scene?: Scene; // If present, edit mode
    onSubmit: (data: any) => Promise<void>;
}

export function SceneDialog({
    open,
    onOpenChange,
    scene,
    onSubmit,
}: SceneDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto rounded-[2rem]">
                <DialogHeader>
                    <DialogTitle>{scene ? "Edit Scene" : "New Scene"}</DialogTitle>
                    <DialogDescription>
                        {scene
                            ? "Update scene details and vocabulary."
                            : "Define a new context for learning."}
                    </DialogDescription>
                </DialogHeader>
                <SceneForm
                    initialData={scene}
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
