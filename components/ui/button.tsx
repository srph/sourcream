"use client";
// Adapted from shadcn/ui base-nova/button (MIT); TV sizing and Chrome 94-safe styles.
import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
const buttonVariants = cva('inline-flex shrink-0 items-center justify-center gap-3 whitespace-nowrap font-medium transition-opacity disabled:opacity-40', {
  variants: {
    variant: {
      default: 'border border-transparent bg-accent text-black hover:opacity-90',
      secondary: 'border border-line bg-control text-foreground hover:opacity-90',
      ghost: 'border border-transparent bg-transparent text-foreground hover:bg-white/10',
    },
    size: { default: 'min-h-14 rounded-lg px-6 text-base', icon: 'h-14 w-14 rounded-lg p-0' },
  },
  defaultVariants: { variant: 'default', size: 'default' },
});
function Button({ className, variant, size, ...props }: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return <ButtonPrimitive data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
export { Button, buttonVariants };
