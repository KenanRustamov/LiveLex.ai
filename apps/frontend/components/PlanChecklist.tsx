import OverlayCard from '@/components/OverlayCard';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { CheckCircle2 } from 'lucide-react';

type PlanItem = { source_name: string; target_name: string; action: string };

export default function PlanChecklist({
  items,
  currentIndex,
  completed,
  onToggle,
  variant = 'default',
  sceneName,
}: {
  items: PlanItem[];
  currentIndex: number;
  completed: boolean[];
  onToggle: (index: number) => void;
  variant?: 'default' | 'overlay';
  sceneName?: string;
}) {
  if (variant === 'overlay') {
    return (
      <OverlayCard className="p-3 text-white">
        <div className="text-xs uppercase tracking-wide text-white/70 mb-2">
          {sceneName ? `Scene: ${sceneName}` : 'Plan'}
        </div>
        {items.length === 0 ? (
          <div className="text-xs text-white/80">No objects identified yet.</div>
        ) : (
          <ul className="space-y-2">
            {items.map((o, i) => {
              const isCurrent = i === currentIndex;
              const isDone = completed[i];
              return (
                <li key={`${o.source_name}-${i}`} className="flex items-start gap-2">
                  <Checkbox
                    checked={!!isDone}
                    onChange={() => onToggle(i)}
                    aria-label={`Mark ${o.source_name} as done`}
                    className="mt-0.5"
                  />
                  <div className={`flex-1 text-xs ${isCurrent ? 'font-semibold' : ''} ${isDone ? 'line-through text-white/60' : ''}`}>
                    {o.source_name} → {o.target_name} [{o.action}]
                  </div>
                  {isDone && <CheckCircle2 size={14} className="text-green-400 mt-0.5" />}
                </li>
              );
            })}
          </ul>
        )}
      </OverlayCard>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Plan</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <div className="text-sm text-muted-foreground">No objects identified yet.</div>
        ) : (
          <ul className="space-y-2">
            {items.map((o, i) => {
              const isCurrent = i === currentIndex;
              const isDone = completed[i];
              return (
                <li key={`${o.source_name}-${i}`} className="flex items-start gap-2">
                  <Checkbox
                    checked={!!isDone}
                    onChange={() => onToggle(i)}
                    aria-label={`Mark ${o.source_name} as done`}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <Label
                      className={`text-sm ${isCurrent ? 'font-semibold' : ''} ${isDone ? 'line-through text-muted-foreground' : ''}`}
                    >
                      {o.source_name} → {o.target_name} [{o.action}]
                    </Label>
                  </div>
                  {isDone && <CheckCircle2 size={16} className="text-green-600 mt-0.5" />}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}


