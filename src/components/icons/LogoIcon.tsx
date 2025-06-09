
import type React from 'react';
import Image from 'next/image';

interface IconProps extends Omit<React.ComponentProps<typeof Image>, 'src' | 'alt'> {
  className?: string;
}

export const LogoIcon: React.FC<IconProps> = ({ className, width, height, ...props }) => {
  const intrinsicWidth = typeof width === 'number' ? width : 100; // Adjusted default for placeholder
  const intrinsicHeight = typeof height === 'number' ? height : 100; // Adjusted default for placeholder

  return (
    <Image
      src="https://placehold.co/100x100.png" // Placeholder for ResonanceAI logo
      alt="ResonanceAI Logo Placeholder"
      data-ai-hint="ResonanceAI logo" // Hint for future replacement
      width={intrinsicWidth}
      height={intrinsicHeight}
      className={className}
      priority
      {...props}
    />
  );
};
