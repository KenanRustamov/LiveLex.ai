import * as React from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

type Status = 'listening' | 'detecting' | 'recording';

export default function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const { label, dotClass, badgeClass } = getConfig(status);
  return (
    <Badge className={cn('gap-2', badgeClass, className)}>
      <span className={cn('inline-block rounded-full', dotClass)} />
      <span>{label}</span>
    </Badge>
  );
}

function getConfig(status: Status): { label: string; dotClass: string; badgeClass: string } {
  switch (status) {
    case 'detecting':
      return {
        label: 'Detecting speech',
        dotClass: 'h-1.5 w-1.5 bg-yellow-400',
        badgeClass: 'border-white/40 text-white',
      };
    case 'recording':
      return {
        label: 'Recording',
        dotClass: 'h-2 w-2 bg-red-500 animate-pulse',
        badgeClass: 'border-white/40 text-white',
      };
    case 'listening':
    default:
      return {
        label: 'Listening',
        dotClass: 'h-1.5 w-1.5 bg-white/90',
        badgeClass: 'border-white/40 text-white',
      };
  }
}


