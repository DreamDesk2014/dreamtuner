import React from 'react';
import { ExclamationCircleIcon } from './icons/HeroIcons';

interface ErrorMessageProps {
  message: string;
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({ message }) => {
  return (
    <div className="bg-destructive/20 border border-destructive text-destructive-foreground px-4 py-3 rounded-lg relative shadow-md" role="alert">
      <div className="flex items-center">
        <ExclamationCircleIcon className="w-6 h-6 mr-3 text-destructive-foreground/80" />
        <div>
          <strong className="font-bold">Error:</strong>
          <span className="block sm:inline ml-1">{message}</span>
        </div>
      </div>
    </div>
  );
};
