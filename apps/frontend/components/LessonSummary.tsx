import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle } from 'lucide-react';

type SummaryItem = {
  object: {
    source_name: string;
    target_name: string;
    action: string;
  };
  correct: boolean;
  user_said: string;
  correct_word: string;
  attempts: number;
};

type LessonSummaryProps = {
  summary: {
    items: SummaryItem[];
    total: number;
    correct_count: number;
    incorrect_count: number;
  };
  onNewLesson: () => void;
};

export default function LessonSummary({ summary, onNewLesson }: LessonSummaryProps) {
  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="text-xl">Lesson Complete!</CardTitle>
        <div className="text-sm text-muted-foreground">
          You tested {summary.total} object{summary.total !== 1 ? 's' : ''}. 
          Got {summary.correct_count} correct and {summary.incorrect_count} incorrect.
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {summary.items.map((item, index) => (
            <div
              key={index}
              className={`p-3 rounded-lg border ${
                item.correct ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {item.correct ? (
                      <CheckCircle2 size={16} className="text-green-600" />
                    ) : (
                      <XCircle size={16} className="text-red-600" />
                    )}
                    <span className="font-medium">
                      {item.object.source_name} → {item.object.target_name}
                    </span>
                    <span className="text-xs text-muted-foreground">[{item.object.action}]</span>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {item.attempts === 1 ? '1 attempt' : `${item.attempts} attempts`}
                    </span>
                  </div>
                  <div className="text-sm space-y-1 ml-6">
                    <div>
                      <span className="text-muted-foreground">You said: </span>
                      <span className={item.correct ? 'text-green-700' : 'text-red-700'}>
                        {item.user_said || '(no audio)'}
                      </span>
                    </div>
                    {!item.correct && (
                      <div>
                        <span className="text-muted-foreground">Correct word: </span>
                        <span className="font-medium">{item.correct_word}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="pt-4 border-t">
          <Button onClick={onNewLesson} variant="default" className="w-full">
            Start New Lesson
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

