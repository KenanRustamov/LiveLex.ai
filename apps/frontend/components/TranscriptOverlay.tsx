import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import OverlayCard from '@/components/OverlayCard';

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
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [transcripts, streamingText]);

  return (
    <OverlayCard className={cn('pointer-events-none flex max-w-xs flex-col gap-2 p-3', className)}>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-white/70">Live Transcript</h3>
      <div
        ref={scrollRef}
        className="space-y-2 text-xs leading-snug max-h-56 overflow-y-auto pr-1 [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
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
    </OverlayCard>
  );
}


