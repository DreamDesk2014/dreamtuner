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
    <circle cx="50" cy="50" r="45" stroke="currentColor" strokeWidth="5"/>
    {/* Eighth note (quaver) components */}
    <circle cx="38" cy="65" r="9" fill="currentColor" />
    <path d="M47 65 V30" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
    <path d="M47 30 C 60 35, 65 45, 47 52" stroke="currentColor" strokeWidth="6" fill="none" strokeLinecap="round"/>
  </svg>
);
