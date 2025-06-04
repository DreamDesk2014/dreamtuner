import type React from 'react';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
}

export const LogoIcon: React.FC<IconProps> = ({ className, ...props }) => (
  <svg
    className={className || "w-8 h-8"}
    viewBox="0 0 100 100"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <circle cx="50" cy="50" r="45" stroke="currentColor" strokeWidth="4"/>
    {/* Detailed Eighth Note (Quaver) Components */}
    {/* Notehead */}
    <circle cx="36" cy="67" r="10" fill="currentColor" />
    {/* Stem */}
    <path d="M46 67 V28" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    {/* Flag */}
    <path d="M46 28 C 60 32, 65 40, 46 46" fill="currentColor" />
  </svg>
);
