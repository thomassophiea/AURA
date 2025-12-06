import { LucideIcon } from 'lucide-react';
import { helloKittyIcons, isHelloKittyMode } from '../lib/hello-kitty-icons';
import { useEffect, useState } from 'react';

/**
 * Smart Icon component that switches between Lucide icons and Hello Kitty emoji icons
 * based on the active theme
 */

interface IconProps {
  icon: LucideIcon;
  name: string;
  className?: string;
  size?: number;
}

export function Icon({ icon: LucideIconComponent, name, className = '', size }: IconProps) {
  const [isHelloKitty, setIsHelloKitty] = useState(isHelloKittyMode());

  useEffect(() => {
    // Listen for theme changes
    const observer = new MutationObserver(() => {
      setIsHelloKitty(isHelloKittyMode());
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  // If Hello Kitty mode is active and we have an emoji for this icon, use it
  if (isHelloKitty && helloKittyIcons[name as keyof typeof helloKittyIcons]) {
    const emoji = helloKittyIcons[name as keyof typeof helloKittyIcons];
    return (
      <span
        className={`inline-block ${className}`}
        style={{
          fontSize: size ? `${size}px` : '1em',
          lineHeight: 1,
          verticalAlign: 'middle',
        }}
        role="img"
        aria-label={name}
      >
        {emoji}
      </span>
    );
  }

  // Otherwise, use the Lucide icon
  return <LucideIconComponent className={className} size={size} />;
}
