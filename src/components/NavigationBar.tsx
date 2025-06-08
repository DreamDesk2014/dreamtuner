
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
import { InfoIcon, Sun, Moon, Heart } from 'lucide-react'; // Added Heart icon
import { Separator } from '@/components/ui/separator';
import { logEvent, getSessionId, saveContactSubmission } from '@/lib/firestoreService';

export const NavigationBar: React.FC = () => {
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  useEffect(() => {
    const storedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    let initialTheme = 'light';
    if (storedTheme) {
      initialTheme = storedTheme;
    } else if (systemPrefersDark) {
      initialTheme = 'dark';
    }
    setTheme(initialTheme);
    if (initialTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
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
    logEvent('user_interactions', {
      eventName: 'theme_changed',
      eventDetails: { newTheme },
      sessionId: getSessionId(),
    }).catch(console.error);
  };

  const handleAboutOpenChange = (open: boolean) => {
    setIsDialogOpen(open);
    if (open) {
      logEvent('user_interactions', {
        eventName: 'about_dialog_opened',
        sessionId: getSessionId(),
      }).catch(console.error);
    }
  };

  const handleSubmitContactForm = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    const submissionDetails = {
        name: contactName.trim() || undefined,
        email: contactEmail.trim() || undefined,
        message: contactMessage.trim() || undefined,
        sessionId: getSessionId(),
        clientTimestamp: new Date(),
    };

    try {
        await saveContactSubmission(submissionDetails);
        toast({
            title: 'Message Saved!',
            description: 'Thank you for your feedback. Your message has been stored.',
        });
        setContactName('');
        setContactEmail('');
        setContactMessage('');
        logEvent('user_interactions', {
            eventName: 'contact_form_submitted',
            eventDetails: {
                nameProvided: !!submissionDetails.name,
                emailProvided: !!submissionDetails.email,
                messageProvided: !!submissionDetails.message,
            },
            sessionId: getSessionId(),
        }).catch(console.error);
        // Optionally close the dialog after successful submission
        // setIsDialogOpen(false); 
    } catch (error) {
        toast({
            variant: "destructive",
            title: 'Submission Failed',
            description: 'Could not save your message. Please try again later.',
        });
        console.error("Contact form submission error:", error);
        logEvent('errors', {
            eventName: 'contact_form_submission_error',
            eventDetails: { error: (error instanceof Error ? error.message : String(error)) },
            sessionId: getSessionId(),
        }).catch(console.error);
    } finally {
        setIsSubmitting(false);
    }
  };

  return (
    <nav className="w-full max-w-3xl mx-auto px-4 py-3 flex justify-end items-center mb-0 sm:mb-2 space-x-2">
      <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
        {theme === 'light' ? <Moon className="h-5 w-5 text-slate-600 hover:text-slate-800 transition-colors" /> : <Sun className="h-5 w-5 text-yellow-400 hover:text-yellow-300 transition-colors" />}
      </Button>
      <Dialog open={isDialogOpen} onOpenChange={handleAboutOpenChange}>
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
            <div id="about-dialog-description" className="space-y-3">
              <h3 className="text-lg font-semibold text-primary">Our Mission</h3>
              <p>
                DreamTuner was created to explore the magic of synesthesia—the connection between what we see, feel, and hear. It’s an innovative application that translates everyday ideas into the universal language of music.
              </p>
              
              <h3 className="text-lg font-semibold text-primary">A Playground for All Ages</h3>
              <p>
                From descriptive text and images to live photos and audio, you can give our AI a creative spark and watch it generate a unique musical concept. In our special Kids Mode, drawings and voice hints become the inspiration for playful music and whimsical AI-generated art, making it a fun introduction to creativity for young minds.
              </p>

              <h3 className="text-lg font-semibold text-primary">A Note on Our Beta</h3>
              <p>
                DreamTuner is a free app and currently in Beta. This means we are actively developing and improving the experience. As we refine the music generation process, you may find that the quality of MIDI playback is basic at times or that some features don't work perfectly yet. We appreciate your understanding and feedback as we grow!
              </p>
            </div>

            <Separator className="my-4 bg-border" />

            <div>
              <h3 className="text-lg font-semibold text-primary mb-2">Support DreamTuner</h3>
              <p className="text-xs text-muted-foreground/80 mb-3">
                If you enjoy DreamTuner and would like to support its continued development, you can make a small contribution. Every little bit helps keep the music going!
              </p>
              <Button asChild variant="outline" className="w-full border-green-500 text-green-500 hover:bg-green-500/10 hover:text-green-400">
                <a href="https://buy.stripe.com/bJedR92dm0gVatB4yBaAw02" target="_blank" rel="noopener noreferrer">
                  <Heart className="mr-2 h-4 w-4" /> $1 Contribution To Keep DreamTuner Going!
                </a>
              </Button>
            </div>

            <Separator className="my-4 bg-border" />

            <div>
              <h3 className="text-lg font-semibold text-primary mb-2">Contact Us</h3>
              <p className="text-xs text-muted-foreground/80 mb-3">
                Have questions, feedback, or want to collaborate? We'd love to hear from you. Fill out the form below (all fields are optional).
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
                    disabled={isSubmitting}
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
                    disabled={isSubmitting}
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
                    disabled={isSubmitting}
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full bg-primary hover:bg-primary/80 text-primary-foreground"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Saving...' : 'Send Message'}
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
