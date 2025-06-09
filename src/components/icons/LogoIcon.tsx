
import type React from 'react';
import Image from 'next/image';

interface IconProps extends Omit<React.ComponentProps<typeof Image>, 'src' | 'alt'> {
  className?: string;
}

export const LogoIcon: React.FC<IconProps> = ({ className, width, height, ...props }) => {
  const intrinsicWidth = typeof width === 'number' ? width : 50; // Default width if not specified
  const intrinsicHeight = typeof height === 'number' ? height : 50; // Default height if not specified

  return (
    <Image
      src="/logo.png" 
      alt="DreamTuner Logo"
      width={intrinsicWidth}
      height={intrinsicHeight}
      className={className}
      priority
      {...props}
    />
  );
};
