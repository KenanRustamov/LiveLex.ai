import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Play } from 'lucide-react';
// Assuming we will fetch scenes here or pass them in
// import { Scene } from '@/types/teacher'; // We might need a generic Scene type shared

import { Scene } from '@/types';



interface StudentScenesProps {
    onSceneSelect: (sceneId: string) => void;
}

export function StudentScenes({ onSceneSelect }: StudentScenesProps) {
    // Ideally use data from hook, but for now lets mock or accept props
    // For this refactor step, we'll keep it simple UI
    const scenes: Scene[] = [];

    return (
        <div className="space-y-6 animate-in fade-in-50 duration-500 pb-20">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold">Explore Scenes</h1>
                    <p className="text-muted-foreground">Practice in different environments.</p>
                </div>
            </div>

            {scenes.length === 0 ? (
                <Card className="rounded-[2rem] border-none shadow-sm bg-muted/30">
                    <CardContent className="p-8 text-center">
                        <p className="text-muted-foreground">No specific scenes available yet.</p>
                        <Button variant="link" className="mt-2 text-primary" onClick={() => onSceneSelect('free')}>
                            Start Free Practice
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4">
                    {scenes.map(scene => (
                        <Card key={scene.id} className="rounded-[2rem] border-none shadow-sm overflow-hidden">
                            <div className="h-32 bg-gray-100 relative">
                                {/* Placeholder for scene image */}
                                <div className="absolute inset-0 flex items-center justify-center text-gray-300">
                                    Scene Image
                                </div>
                            </div>
                            <CardContent className="p-6">
                                <h3 className="font-bold text-lg mb-1">{scene.name}</h3>
                                <p className="text-sm text-muted-foreground mb-4">{scene.description}</p>
                                <Button className="w-full rounded-xl" onClick={() => onSceneSelect(scene.id)}>
                                    <Play size={16} className="mr-2" /> Enter Scene
                                </Button>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
