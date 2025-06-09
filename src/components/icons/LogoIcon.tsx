
import type React from 'react';
import Image from 'next/image';

interface IconProps extends Omit<React.ComponentProps<typeof Image>, 'src' | 'alt'> {
  className?: string;
}

export const LogoIcon: React.FC<IconProps> = ({ className, width, height, ...props }) => {
  const intrinsicWidth = typeof width === 'number' ? width : 100;
  const intrinsicHeight = typeof height === 'number' ? height : 100;

  return (
    <Image
      src="https://placehold.co/100x100.png" 
      alt="DreamTuner Logo Placeholder"
      data-ai-hint="DreamTuner logo" 
      width={intrinsicWidth}
      height={intrinsicHeight}
      className={className}
      priority
      {...props}
    />
  );
};
