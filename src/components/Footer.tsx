import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer className="w-full max-w-3xl mt-12 mb-6 text-center">
      <p className="text-sm text-muted-foreground">
        ResonanceAI © {new Date().getFullYear()}. All rights reserved.
      </p>
      <p className="text-xs text-muted-foreground/70 mt-1">
        Powered by AI. Music parameters are conceptual and for illustrative purposes.
      </p>
    </footer>
  );
};
