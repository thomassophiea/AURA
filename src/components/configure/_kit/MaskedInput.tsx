/**
 * Password/shared-secret input with a mask/reveal toggle.
 */
import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '../../ui/input';
import { Button } from '../../ui/button';
import { cn } from '../../ui/utils';

export interface MaskedInputProps
  extends Omit<React.ComponentProps<typeof Input>, 'type' | 'value' | 'onChange'> {
  value: string;
  onChange: (value: string) => void;
}

export function MaskedInput({ value, onChange, className, ...props }: MaskedInputProps) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="relative">
      <Input
        {...props}
        type={revealed ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn('pr-10', className)}
        autoComplete="off"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-0 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground"
        onClick={() => setRevealed((r) => !r)}
        aria-label={revealed ? 'Hide value' : 'Reveal value'}
      >
        {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </Button>
    </div>
  );
}
