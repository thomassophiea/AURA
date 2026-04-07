/**
 * AnimatedValue Component
 * 
 * Displays a value that pulses/flashes when it changes to indicate live updates.
 */

import { useState, useEffect, useRef } from 'react';
import { cn } from './utils';

interface AnimatedValueProps {
  value: string | number;
  className?: string;
  pulseColor?: string;
}

export function AnimatedValue({ value, className, pulseColor = 'bg-purple-500/30' }: AnimatedValueProps) {
  const [isAnimating, setIsAnimating] = useState(false);
  const prevValueRef = useRef(value);
  const isFirstRender = useRef(true);

  useEffect(() => {
    // Skip animation on first render
    if (isFirstRender.current) {
      isFirstRender.current = false;
      prevValueRef.current = value;
      return;
    }

    // Only animate if value actually changed
    if (prevValueRef.current !== value) {
      setIsAnimating(true);
      prevValueRef.current = value;
      
      const timer = setTimeout(() => {
        setIsAnimating(false);
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [value]);

  return (
    <span 
      className={cn(
        "relative inline-block transition-all duration-300",
        className
      )}
    >
      {/* Pulse ring effect */}
      {isAnimating && (
        <span 
          className={cn(
            "absolute inset-0 rounded animate-ping opacity-75",
            pulseColor
          )} 
        />
      )}
      {/* Glow effect */}
      <span 
        className={cn(
          "relative z-10 transition-all duration-500",
          isAnimating && "text-white scale-110"
        )}
      >
        {value}
      </span>
    </span>
  );
}
