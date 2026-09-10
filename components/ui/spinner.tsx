import type { CSSProperties, HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type SpinnerProps = Omit<HTMLAttributes<HTMLSpanElement>, 'children'> & {
  label?: string;
  size?: number;
  strokeWidth?: number;
};

export function Spinner({ className, label = 'Loading', size = 48, strokeWidth = 3, style, ...props }: SpinnerProps) {
  const spinnerStyle = {
    width: `${size}px`,
    height: `${size}px`,
    borderWidth: `${strokeWidth}px`,
    ...style,
  } as CSSProperties;

  return <span className={cn('inline-block box-border animate-spin rounded-full border-solid border-transparent border-t-current motion-reduce:animate-none', className)} style={spinnerStyle} role="status" {...props}>
    <span className="sr-only">{label}</span>
  </span>;
}
