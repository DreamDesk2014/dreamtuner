
import type React from 'react';
import Image from 'next/image';

// Props for next/image, allowing className and other Image props, but fixing src and alt.
interface IconProps extends Omit<React.ComponentProps<typeof Image>, 'src' | 'alt'> {
  className?: string;
}

export const LogoIcon: React.FC<IconProps> = ({ className, width, height, ...props }) => {
  // Use the width and height from className if provided via Tailwind (e.g. w-10, h-10)
  // or default to a reasonable size. next/image needs explicit width/height.
  // The className will ultimately control the display size.
  // We provide intrinsic values here, and Tailwind scales it.
  const intrinsicWidth = typeof width === 'number' ? width : 48;
  const intrinsicHeight = typeof height === 'number' ? height : 48;

  return (
    <Image
      src="/logo.png" // Assumes your logo is named logo.png and placed in the (user-created) /public folder
      alt="DreamTuner Logo"
      width={intrinsicWidth} // Base width for the image source
      height={intrinsicHeight} // Base height for the image source
      className={className} // This will apply Tailwind classes like w-10 h-10 for display sizing
      priority // Consider adding if the logo is part of the Largest Contentful Paint (LCP)
      {...props}
    />
  );
};
