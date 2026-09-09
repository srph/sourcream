import type { CSSProperties, HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type SpinnerProps = Omit<HTMLAttributes<HTMLSpanElement>, 'children'> & {
  label?: string;
  size?: number;
  strokeWidth?: number;
};

export function Spinner({ className, label = 'Loading', size = 48, strokeWidth = 3, style, ...props }: SpinnerProps) {
  const spinnerStyle = {
    '--spinner-size': `${size}px`,
    '--spinner-stroke': `${strokeWidth}px`,
    ...style,
  } as CSSProperties;

  return <span className={cn('spinner', className)} style={spinnerStyle} role="status" {...props}>
    <span className="sr-only">{label}</span>
  </span>;
}
