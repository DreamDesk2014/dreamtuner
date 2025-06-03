import type React from 'react';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
}

export const SparklesIcon: React.FC<IconProps> = ({ className, ...props }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    className={className || "w-6 h-6"}
    {...props}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L1.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.25 12L17 13.75M18.25 12L17 10.25m1.25 1.75L21 12.75M18.25 12L21 11.25m-8.25 6.5L9 20.25m.75-1.25L11.25 19m-1.5-1.5L10.5 16.25m-1.5 1.5L8.25 17.5m7.5-6.5L17 5.25m.75 1.25L19.5 6m-1.5-1.5L18.75 3.75m-1.5 1.5L16.5 4.5"
    />
  </svg>
);
