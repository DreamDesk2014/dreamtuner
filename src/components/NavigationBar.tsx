
"use client";
import React, { useState } from 'react'; // Added useState
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Input } from "@/components/ui/input"; // Added
import { Textarea } from "@/components/ui/textarea"; // Added
import { Label } from "@/components/ui/label"; // Added
import { toast } from "@/hooks/use-toast"; // Added
import { InfoIcon } from 'lucide-react';
import { Separator } from '@/components/ui/separator'; // Added

export const NavigationBar: React.FC = () => {
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmitContactForm = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Simulate sending a message
    console.log('Contact Form Submission:');
    console.log('Name:', contactName);
    console.log('Email:', contactEmail);
    console.log('Message:', contactMessage);

    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    toast({
      title: 'Message Sent! (Simulated)',
      description: 'Thank you for your interest. We will log your message.',
    });

    setContactName('');
    setContactEmail('');
    setContactMessage('');
    setIsSubmitting(false);
  };

  return (
    <nav className="w-full max-w-3xl mx-auto px-4 py-3 flex justify-end items-center mb-0 sm:mb-2">
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="About DreamTuner">
            <InfoIcon className="h-5 w-5 text-destructive hover:text-destructive/80 transition-colors" />
          </Button>
        </DialogTrigger>
        <DialogContent
          aria-describedby="about-dialog-description"
          className="sm:max-w-md bg-nebula-gray border-slate-700 text-galaxy-white shadow-2xl max-h-[90vh] flex flex-col"
        >
          <DialogHeader>
            <DialogTitle className="text-stardust-blue font-headline text-xl">About DreamTuner</DialogTitle>
          </DialogHeader>
          
          <div className="flex-grow overflow-y-auto pr-3 space-y-3 text-slate-300 py-3 text-sm leading-relaxed">
            <div id="about-dialog-description">
              <p>
                DreamTuner is an innovative application that translates your textual descriptions, images, or video/audio concepts into unique musical parameters.
              </p>
              <p>
                Using advanced AI, it explores the synesthetic connections between different forms of media and music, allowing you to discover the sonic essence of your ideas.
              </p>
              <p>
                In Kids Mode, it offers a playful experience where drawings and voice hints become the inspiration for both music and AI-generated art.
              </p>
              <p>
                DreamTuner is generally offered as a <strong>free app</strong>, designed for <strong>fun and to provide basic educational insights</strong> into music creation for both kids and adults.
              </p>
              <p>
                Please note that the <strong>quality of the MIDI playback is an area under active development</strong>, so it might be basic at times as we refine the music generation process.
              </p>
              <p className="font-semibold text-amber-400 pt-2">
                DreamTuner is currently in <strong>Beta</strong>. We appreciate your feedback as we continue to improve! Some features may not work as expected due to the ongoing development process or environment restrictions.
              </p>
            </div>

            <Separator className="my-4 bg-slate-600" />

            <div>
              <h3 className="text-lg font-semibold text-stardust-blue mb-2">Contact Us</h3>
              <p className="text-xs text-slate-400 mb-3">
                Have questions, feedback, or want to collaborate? Fill out the form below (all fields are optional).
              </p>
              <form onSubmit={handleSubmitContactForm} className="space-y-4">
                <div>
                  <Label htmlFor="contact-name" className="text-xs font-medium text-slate-400">Name (Optional)</Label>
                  <Input
                    id="contact-name"
                    type="text"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="Your Name"
                    className="mt-1 bg-nebula-gray-light border-slate-600 focus:ring-stardust-blue focus:border-stardust-blue"
                  />
                </div>
                <div>
                  <Label htmlFor="contact-email" className="text-xs font-medium text-slate-400">Email (Optional)</Label>
                  <Input
                    id="contact-email"
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="mt-1 bg-nebula-gray-light border-slate-600 focus:ring-stardust-blue focus:border-stardust-blue"
                  />
                </div>
                <div>
                  <Label htmlFor="contact-message" className="text-xs font-medium text-slate-400">Message (Optional)</Label>
                  <Textarea
                    id="contact-message"
                    value={contactMessage}
                    onChange={(e) => setContactMessage(e.target.value)}
                    placeholder="Your message, feedback, or collaboration ideas..."
                    rows={3}
                    className="mt-1 bg-nebula-gray-light border-slate-600 focus:ring-stardust-blue focus:border-stardust-blue resize-none"
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full bg-stardust-blue hover:bg-stardust-blue/80 text-primary-foreground"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Sending...' : 'Send Message (Simulated)'}
                </Button>
              </form>
            </div>
          </div>
          
          <DialogFooter className="mt-auto pt-4 border-t border-slate-700">
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
