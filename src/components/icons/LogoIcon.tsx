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
    {/* Darker Blue Ellipse - R:28 G:110 B:158 -> #1C6E9E */}
    <ellipse
      cx="50"
      cy="50"
      rx="42"
      ry="21"
      transform="rotate(45 50 50)"
      fill="#1C6E9E"
    />
    {/* Lighter Blue Ellipse - R:48 G:197 B:245 -> #30C5F5 */}
    <ellipse
      cx="50"
      cy="50"
      rx="42"
      ry="21"
      transform="rotate(-45 50 50)"
      fill="#30C5F5"
    />
  </svg>
);
