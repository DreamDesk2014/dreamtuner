
"use client";
import React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { InfoIcon } from 'lucide-react';

export const NavigationBar: React.FC = () => {
  return (
    <nav className="w-full max-w-3xl mx-auto px-4 py-3 flex justify-end items-center mb-0 sm:mb-2">
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="About DreamTuner">
            <InfoIcon className="h-5 w-5 text-slate-400 hover:text-stardust-blue transition-colors" />
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md bg-nebula-gray border-slate-700 text-galaxy-white shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-stardust-blue font-headline text-xl">About DreamTuner</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-slate-300 py-3 text-sm leading-relaxed">
            <p>
              DreamTuner is an innovative application that translates your textual descriptions, images, or video/audio concepts into unique musical parameters.
            </p>
            <p>
              Using advanced AI, it explores the synesthetic connections between different forms of media and music, allowing you to discover the sonic essence of your ideas.
            </p>
            <p>
              In Kids Mode, it offers a playful experience where drawings and voice hints become the inspiration for both music and AI-generated art.
            </p>
            <p className="font-semibold text-amber-400 pt-2">
              DreamTuner is currently in Beta. We appreciate your feedback as we continue to improve!
            </p>
          </div>
          <DialogFooter className="mt-2">
            <DialogClose asChild>
              <Button type="button" variant="outline" className="border-slate-600 hover:bg-slate-700 text-slate-300 hover:text-galaxy-white">
                Close
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </nav>
  );
};
