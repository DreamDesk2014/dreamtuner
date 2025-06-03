import React from 'react';

export const LoadingSpinner: React.FC = () => {
  return (
    <div className="flex justify-center items-center">
      <div className="w-16 h-16 border-4 border-accent border-dashed rounded-full animate-spin border-t-transparent"></div>
    </div>
  );
};
