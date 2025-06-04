
"use client";
import React from 'react';
import { InputForm } from '@/components/InputForm';
import type { AppInput } from '@/types';
import { Card, CardContent } from "@/components/ui/card";

interface StandardModeTabProps {
  onSubmit: (input: AppInput) => Promise<void>;
  isLoading: boolean;
  selectedGenre: string;
  onGenreChange: (genre: string) => void;
}

export const StandardModeTab: React.FC<StandardModeTabProps> = ({
  onSubmit,
  isLoading,
  selectedGenre,
  onGenreChange,
}) => {
  return (
    <Card className="bg-nebula-gray shadow-2xl rounded-xl border-slate-700">
      <CardContent className="p-6 sm:p-10">
        <InputForm 
          onSubmit={(input) => onSubmit({...input, mode: 'standard', genre: selectedGenre})} 
          isLoading={isLoading} 
          selectedGenre={selectedGenre}
          onGenreChange={onGenreChange}
        />
      </CardContent>
    </Card>
  );
};
