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
    <path d="M30 70 Q50 30 70 70" stroke="currentColor" strokeWidth="5" strokeLinecap="round"/>
    <path d="M35 50 Q50 65 65 50" stroke="currentColor" strokeWidth="5" strokeLinecap="round"/>
    <circle cx="50" cy="45" r="5" fill="currentColor"/>
  </svg>
);
