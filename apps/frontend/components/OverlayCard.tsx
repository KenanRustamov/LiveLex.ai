import * as React from 'react';
import { cn } from '@/lib/utils';

type OverlayCardProps = React.HTMLAttributes<HTMLDivElement> & {
  tone?: 'light' | 'dark';
};

const OverlayCard = React.forwardRef<HTMLDivElement, OverlayCardProps>(
  ({ className, tone = 'dark', ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-xl border backdrop-blur',
        tone === 'dark'
          ? 'border-white/40 text-white'
          : 'border-black/10 text-foreground',
        className
      )}
      {...props}
    />
  )
);

OverlayCard.displayName = 'OverlayCard';

export default OverlayCard;


