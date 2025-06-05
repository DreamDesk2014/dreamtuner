
"use client";
import React, { useState, useEffect } from 'react';
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { InfoIcon, Sun, Moon } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

export const NavigationBar: React.FC = () => {
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light'); // Default to light

  useEffect(() => {
    const storedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (storedTheme) {
      setTheme(storedTheme);
      if (storedTheme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    } else if (systemPrefersDark) {
      setTheme('dark');
      document.documentElement.classList.add('dark');
    } else {
      setTheme('light');
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const handleSubmitContactForm = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);

    console.log('Contact Form Submission:');
    console.log('Name:', contactName);
    console.log('Email:', contactEmail);
    console.log('Message:', contactMessage);

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
    <nav className="w-full max-w-3xl mx-auto px-4 py-3 flex justify-end items-center mb-0 sm:mb-2 space-x-2">
      <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
        {theme === 'light' ? <Moon className="h-5 w-5 text-slate-600 hover:text-slate-800 transition-colors" /> : <Sun className="h-5 w-5 text-yellow-400 hover:text-yellow-300 transition-colors" />}
      </Button>
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="About DreamTuner">
            <InfoIcon className="h-5 w-5 text-destructive hover:text-destructive/80 transition-colors" />
          </Button>
        </DialogTrigger>
        <DialogContent
          aria-describedby="about-dialog-description"
          className="sm:max-w-md bg-card border-border text-card-foreground shadow-2xl max-h-[90vh] flex flex-col"
        >
          <DialogHeader>
            <DialogTitle className="text-primary font-headline text-xl">About DreamTuner</DialogTitle>
          </DialogHeader>
          
          <div className="flex-grow overflow-y-auto pr-3 space-y-3 text-muted-foreground py-3 text-sm leading-relaxed">
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
              <p className="font-semibold text-amber-500 dark:text-amber-400 pt-2">
                DreamTuner is currently in <strong>Beta</strong>. We appreciate your feedback as we continue to improve! Some features may not work as expected due to the ongoing development process or environment restrictions.
              </p>
            </div>

            <Separator className="my-4 bg-border" />

            <div>
              <h3 className="text-lg font-semibold text-primary mb-2">Contact Us</h3>
              <p className="text-xs text-muted-foreground/80 mb-3">
                Have questions, feedback, or want to collaborate? Fill out the form below (all fields are optional).
              </p>
              <form onSubmit={handleSubmitContactForm} className="space-y-4">
                <div>
                  <Label htmlFor="contact-name" className="text-xs font-medium text-muted-foreground">Name (Optional)</Label>
                  <Input
                    id="contact-name"
                    type="text"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="Your Name"
                    className="mt-1 bg-input border-border focus:ring-ring focus:border-primary"
                  />
                </div>
                <div>
                  <Label htmlFor="contact-email" className="text-xs font-medium text-muted-foreground">Email (Optional)</Label>
                  <Input
                    id="contact-email"
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="mt-1 bg-input border-border focus:ring-ring focus:border-primary"
                  />
                </div>
                <div>
                  <Label htmlFor="contact-message" className="text-xs font-medium text-muted-foreground">Message (Optional)</Label>
                  <Textarea
                    id="contact-message"
                    value={contactMessage}
                    onChange={(e) => setContactMessage(e.target.value)}
                    placeholder="Your message, feedback, or collaboration ideas..."
                    rows={3}
                    className="mt-1 bg-input border-border focus:ring-ring focus:border-primary resize-none"
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full bg-primary hover:bg-primary/80 text-primary-foreground"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Sending...' : 'Send Message (Simulated)'}
                </Button>
              </form>
            </div>
          </div>
          
          <DialogFooter className="mt-auto pt-4 border-t border-border">
            <DialogClose asChild>
              <Button type="button" variant="outline" className="border-border hover:bg-accent text-muted-foreground hover:text-accent-foreground">
                Close
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </nav>
  );
};
