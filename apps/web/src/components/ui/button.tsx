import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00D69A] focus-visible:ring-offset-2 focus-visible:ring-offset-[#050807] disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none active:scale-[0.98]',
          variant === 'default' &&
            'bg-[#00D69A] text-[#050807] font-semibold hover:bg-[#00BF89] shadow-[0_0_15px_rgba(0,214,154,0.25)] border border-transparent',
          variant === 'outline' &&
            'border border-[#00D69A]/30 bg-[#0A1310]/80 text-[#ECFDF5] hover:bg-[#003D30]/60 hover:border-[#00D69A]/60 hover:text-white',
          variant === 'secondary' &&
            'bg-[#003D30] text-[#00D69A] hover:bg-[#005A46] hover:text-[#C6F8E5] border border-[#00D69A]/20 shadow-[0_0_10px_rgba(0,61,48,0.4)]',
          variant === 'ghost' &&
            'text-[#94A3B8] hover:text-[#ECFDF5] hover:bg-[#003D30]/40',
          variant === 'destructive' &&
            'bg-rose-950/80 text-rose-200 border border-rose-900/60 hover:bg-rose-900/70',
          variant === 'link' &&
            'text-[#00D69A] underline-offset-4 hover:underline p-0 h-auto',
          size === 'default' && 'h-10 min-h-[44px] px-4 py-2',
          size === 'sm' && 'h-8 sm:min-h-[32px] px-3 text-xs',
          size === 'lg' && 'h-12 min-h-[48px] px-8 text-base font-semibold',
          size === 'icon' && 'h-10 w-10 min-h-[44px] min-w-[44px] sm:h-9 sm:w-9 sm:min-h-[36px] sm:min-w-[36px] p-0',
          className,
        )}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';
