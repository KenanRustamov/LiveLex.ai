import { cn } from '@/lib/utils';

type TranscriptEntry = { speaker: string; text: string };

export default function TranscriptOverlay({
  transcripts,
  streamingText,
  className,
}: {
  transcripts: TranscriptEntry[];
  streamingText?: string;
  className?: string;
}) {
  return (
    <div className={cn(
      'pointer-events-none flex max-w-xs flex-col gap-2 rounded-xl border border-white/30 p-3 text-white backdrop-blur-sm',
      className
    )}>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-white/70">Live Transcript</h3>
      <div className="space-y-2 text-xs leading-snug">
        {transcripts.map((entry, index) => (
          <div key={index} className="flex flex-col">
            <span className="text-[10px] uppercase tracking-wide text-white/60">{entry.speaker}</span>
            <span>{entry.text}</span>
          </div>
        ))}
        {streamingText ? (
          <div className="text-white/90 truncate">{streamingText}</div>
        ) : null}
      </div>
    </div>
  );
}


