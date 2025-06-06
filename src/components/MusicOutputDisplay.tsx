
"use client";
import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as Tone from 'tone'; // Import Tone directly here
import type { MusicParameters, AppInput } from '@/types';
import { getValenceArousalDescription } from '@/lib/constants';
import { generateMidiFile } from '@/lib/midiService';
import { dataURLtoFile } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import {
  MusicalNoteIcon, ClockIcon, MoodHappyIcon, MoodSadIcon, LightningBoltIcon, CogIcon, ScaleIcon, CollectionIcon,
  DocumentTextIcon, DownloadIcon, PhotographIcon, VideoCameraIcon, ClipboardCopyIcon, RefreshIcon,
  LibraryIcon, ExclamationCircleIcon, MusicIcon
} from './icons/HeroIcons';
import { Share2, Disc3Icon } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from '@/components/ui/scroll-area';
import Image from 'next/image';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { generateWavFromMusicParameters } from '@/lib/toneService';
import { logEvent, getSessionId } from '@/lib/firestoreService';


interface MusicOutputDisplayProps {
  params: MusicParameters;
  onRegenerateIdea: () => void;
  isRegeneratingIdea: boolean;
  standardModeArtUrl: string | null;
}

export const MusicOutputDisplay: React.FC<MusicOutputDisplayProps> = ({ params, onRegenerateIdea, isRegeneratingIdea, standardModeArtUrl }) => {
  const [midiError, setMidiError] = useState<string | null>(null);
  const [isGeneratingMidiForDownload, setIsGeneratingMidiForDownload] = useState<boolean>(false);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState<boolean>(false);
  const [shareError, setShareError] = useState<string | null>(null);

  const [isGeneratingWav, setIsGeneratingWav] = useState<boolean>(false);
  const [wavError, setWavError] = useState<string | null>(null);


  const handleDownloadMidi = () => {
    setMidiError(null); setIsGeneratingMidiForDownload(true);
    try {
      const midiDataUri = generateMidiFile(params);
      if (!midiDataUri || !midiDataUri.startsWith('data:audio/midi;base64,')) throw new Error("Generated MIDI data was invalid.");
      const link = document.createElement('a');
      link.href = midiDataUri;
      let baseFileName = 'dreamtuner_music';
      if(params.generatedIdea) baseFileName = params.generatedIdea.replace(/[^\w\s]/gi, '').replace(/\s+/g, '_').slice(0,30);
      else if (params.originalInput.type === 'text' && params.originalInput.content) baseFileName = params.originalInput.content.substring(0,30).replace(/[^\w\s]/gi, '').replace(/\s+/g, '_');
      else if ((params.originalInput.type === 'image' || params.originalInput.type === 'video') && params.originalInput.fileDetails) baseFileName = params.originalInput.fileDetails.name.split('.')[0].replace(/[^\w\s]/gi, '').replace(/\s+/g, '_').slice(0,30);
      link.download = `${baseFileName || 'dreamtuner_output'}.mid`;
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
      logEvent('user_interactions', {
        eventName: 'midi_downloaded',
        eventDetails: { mode: params.originalInput.mode, idea: params.generatedIdea.substring(0,50) },
        sessionId: getSessionId()
      }).catch(console.error);
    } catch (error) {
      setMidiError(error instanceof Error ? error.message : "Unknown error generating MIDI.");
      logEvent('errors', {
        eventName: 'midi_download_error_display',
        eventDetails: { mode: params.originalInput.mode, error: error instanceof Error ? error.message : "Unknown MIDI generation error" },
        sessionId: getSessionId()
      }).catch(console.error);
    } finally {
      setIsGeneratingMidiForDownload(false);
    }
  };

  const handleDownloadWav = async () => {
    setWavError(null);
    setIsGeneratingWav(true);
    toast({ title: "Rendering Audio...", description: "Generating WAV file, this may take a moment." });
    const wavStartTime = Date.now();
     logEvent('user_interactions', {
        eventName: 'wav_generation_started',
        eventDetails: { mode: params.originalInput.mode, idea: params.generatedIdea.substring(0,50) },
        sessionId: getSessionId()
      }).catch(console.error);

    try {
      console.log("[MusicOutputDisplay] Attempting Tone.start() due to user gesture for WAV generation...");
      await Tone.start();
      console.log(`[MusicOutputDisplay] Tone.start() promise resolved. Tone.context.state is now: ${Tone.context.state}`);

      if (Tone.context.state !== 'running') {
        const message = `Tone.js AudioContext is not running (state: ${Tone.context.state}) even after Tone.start(). Cannot generate WAV. This is often due to browser restrictions if Tone.start() was not called directly by a user gesture, or if the page lost focus.`;
        console.error(`[MusicOutputDisplay_ERROR] ${message}`);
        setWavError(message);
        toast({ variant: "destructive", title: "Audio Context Error", description: message, duration: 10000 });
        logEvent('errors', {
            eventName: 'audio_context_not_running_after_start_in_ui',
            eventDetails: { mode: params.originalInput.mode, contextState: Tone.context.state },
            sessionId: getSessionId()
        }).catch(console.error);
        setIsGeneratingWav(false);
        return;
      }
      
      console.log("[MusicOutputDisplay] AudioContext is running. Proceeding to generateWavFromMusicParameters...");
      const wavBlob = await generateWavFromMusicParameters(params); // This will now use the simplified version
      
      if (wavBlob) {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(wavBlob);
        let baseFileName = 'dreamtuner_audio';
         if(params.generatedIdea) baseFileName = params.generatedIdea.replace(/[^\w\s]/gi, '').replace(/\s+/g, '_').slice(0,30);
        link.download = `${baseFileName}.wav`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href); 
        toast({ title: "WAV Downloaded!", description: "Your audio file is ready." });
        logEvent('user_interactions', {
            eventName: 'wav_generation_success',
            eventDetails: { mode: params.originalInput.mode, idea: params.generatedIdea.substring(0,50), durationMs: Date.now() - wavStartTime, fileSize: wavBlob.size },
            sessionId: getSessionId()
        }).catch(console.error);
      } else {
        throw new Error("Failed to generate WAV data (received null from service).");
      }
    } catch (error) {
      console.error("[MusicOutputDisplay_ERROR] Error during WAV generation process:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error generating WAV file.";
      setWavError(errorMessage);
      toast({ variant: "destructive", title: "WAV Generation Failed", description: errorMessage, duration: 7000 });
      logEvent('errors', {
        eventName: 'wav_generation_error_display',
        eventDetails: { mode: params.originalInput.mode, error: errorMessage, durationMs: Date.now() - wavStartTime },
        sessionId: getSessionId()
      }).catch(console.error);
    } finally {
      setIsGeneratingWav(false);
    }
  };

  const handleCopyDetails = async () => {
    setIsCopied(false); setCopyError(null);
    let originalInputSummary = "";
    switch(params.originalInput.type) {
      case 'text': originalInputSummary = `Text: "${params.originalInput.content ? params.originalInput.content.substring(0, 100) : ''}${params.originalInput.content && params.originalInput.content.length > 100 ? '...' : ''}"`; break;
      case 'image': originalInputSummary = `${params.originalInput.mode === 'kids' ? "Child's Original Concept" : "Image"}: ${params.originalInput.fileDetails.name}`;
        if (params.originalInput.mode === 'kids' && params.originalInput.voiceDescription) {
            originalInputSummary += `\nChild's Voice Hint: "${params.originalInput.voiceDescription}"`;
        }
        if (params.originalInput.additionalContext) {
          originalInputSummary += `\nAdditional Context: "${params.originalInput.additionalContext}"`;
        }
        break;
      case 'video':
        const fileTypeDisplay = params.originalInput.fileDetails.type.startsWith('video/') ? 'Video' :
                              params.originalInput.fileDetails.type.startsWith('audio/') ? 'Audio' : 'Media';
        originalInputSummary = `${fileTypeDisplay} Concept: ${params.originalInput.fileDetails.name}`;
        if (params.originalInput.additionalContext) {
          originalInputSummary += `\nAdditional Context: "${params.originalInput.additionalContext}"`;
        }
        break;
    }
    if (params.selectedGenre) originalInputSummary += `\nGenre: ${params.selectedGenre}`;


    const detailsToCopy = `DreamTuner - Musical Essence (${params.originalInput.mode} mode):
----------------------------------
Generated Idea: ${params.generatedIdea}
Original Input: ${originalInputSummary}
----------------------------------
Key: ${params.keySignature} ${params.mode}
Tempo: ${params.tempoBpm} BPM
Mood Tags: ${(params.moodTags || []).join(', ') || 'N/A'}
Instrument Hints: ${(params.instrumentHints || []).join(', ') || 'N/A'}
Rhythmic Density: ${params.rhythmicDensity.toFixed(2)} (${getRhythmicDensityDescription(params.rhythmicDensity)})
Harmonic Complexity: ${params.harmonicComplexity.toFixed(2)} (${getHarmonicComplexityDescription(params.harmonicComplexity)})
Target Valence: ${params.targetValence.toFixed(2)} (${getValenceArousalDescription(params.targetValence, params.targetArousal).split('(')[0].trim()})
Target Arousal: ${params.targetArousal.toFixed(2)}
----------------------------------
    `.trim();

    try {
      await navigator.clipboard.writeText(detailsToCopy);
      setIsCopied(true); setTimeout(() => setIsCopied(false), 3000);
    } catch (err) {
      setCopyError("Failed to copy. Browser might not support this or permissions denied."); setTimeout(() => setCopyError(null), 5000);
    }
  };

  const handleShare = async () => {
    setShareError(null);
    if (!navigator.share) {
      toast({ variant: "destructive", title: "Share Not Supported", description: "Web Share API is not available." });
      setShareError("Web Share API not supported."); return;
    }
    setIsSharing(true);
    try {
      const filesToShareAttempt: (File | null)[] = [];
      let shareText = `Check out this musical idea from DreamTuner: "${params.generatedIdea}"`;
      const midiDataUri = generateMidiFile(params);
      if (midiDataUri && midiDataUri.startsWith('data:audio/midi;base64,')) {
        let baseFileName = 'dreamtuner_music';
        if(params.generatedIdea) baseFileName = params.generatedIdea.replace(/[^\w\s]/gi, '').replace(/\s+/g, '_').slice(0,30);
        const midiFile = dataURLtoFile(midiDataUri, `${baseFileName}.mid`);
        if (midiFile) filesToShareAttempt.push(midiFile);
      }
      if (params.originalInput.mode === 'standard' && standardModeArtUrl) {
        const artFile = dataURLtoFile(standardModeArtUrl, "dreamtuner_standard_art.png");
        if (artFile) filesToShareAttempt.push(artFile);
        shareText += "\nIt also inspired this AI artwork!";
      }
      // Note: WAV sharing could be added here too, but WAV files can be large for sharing.
      const validFilesToShare = filesToShareAttempt.filter(file => file !== null) as File[];
      if (validFilesToShare.length === 0 && !(params.originalInput.mode === 'standard' && standardModeArtUrl)) { // Allow sharing text only if art is present
         throw new Error("No shareable content prepared (MIDI or Art).");
      }
      
      const sharePayload: ShareData = {
        title: `DreamTuner: "${params.generatedIdea}"`,
        text: shareText,
      };
      if(validFilesToShare.length > 0) {
        sharePayload.files = validFilesToShare;
      }

      await navigator.share(sharePayload);
      toast({ title: "Shared Successfully!" });
    } catch (error: any) {
      if (error.name === 'AbortError') toast({ title: "Share Cancelled" });
      else toast({ variant: "destructive", title: "Share Failed", description: error.message || "Could not share." });
      setShareError(error.message || "Failed to share.");
    } finally { setIsSharing(false); }
  };

  const renderOriginalInputInfo = (input: AppInput) => {
    let icon: React.ReactNode;
    let title: string;
    let contentDisplay: React.ReactNode;
    let footerContent: React.ReactNode = null;

    switch(input.type) {
      case 'text':
        icon = <DocumentTextIcon className="w-6 h-6" />;
        title = "Original Text & Generated Core";
        const originalTextContent = input.content || "";
        const lines = originalTextContent.split('\n');
        const renderedElements: React.ReactNode[] = [];

        const isClearlyNoteLine = (line: string): boolean => {
            return /^[A-G][#bSsxBF]?[0-9]$/.test(line.trim()) ||
                   (line.trim().length < 10 && /[A-G]/.test(line));
        };

        for (let i = 0; i < lines.length; i++) {
            let currentLine = lines[i];
            if (isClearlyNoteLine(currentLine) &&
                i + 1 < lines.length &&
                isClearlyNoteLine(lines[i+1]) &&
                currentLine.length < 20 && lines[i+1].length < 20
            ) {
                renderedElements.push(<p key={i} className="text-muted-foreground text-sm whitespace-pre-wrap">{currentLine.trim()}  |  {lines[i+1].trim()}</p>);
                i++;
            } else {
                renderedElements.push(<p key={i} className="text-muted-foreground text-sm whitespace-pre-wrap">{currentLine}</p>);
            }
        }

        contentDisplay = (
          <>
            <ScrollArea className="h-auto max-h-80 mb-3 pr-3">
                <div className="space-y-1">{renderedElements}</div>
            </ScrollArea>
            <Separator className="my-3 bg-slate-600" />
            <div className="space-y-1 text-sm mt-3">
              <p><strong className="text-stardust-blue">Generated Idea:</strong> <span className="text-galaxy-white italic">"{params.generatedIdea}"</span></p>
              <p><strong className="text-stardust-blue">Key:</strong> {params.keySignature} {params.mode}</p>
              <p><strong className="text-stardust-blue">Tempo:</strong> {params.tempoBpm} BPM</p>
              {params.selectedGenre && (<p><strong className="text-stardust-blue">Selected Genre:</strong> {params.selectedGenre}</p>)}
            </div>
          </>
        );
        return (
            <Card className="mt-8 bg-nebula-gray/80 border-slate-700">
                <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="original-input-text" className="border-b-0">
                        <AccordionTrigger className="p-6 hover:no-underline">
                            <div className="flex items-center text-stardust-blue">
                                {icon}
                                <CardTitle className="ml-2 text-lg font-semibold">{title}</CardTitle>
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-6 pb-6">
                           {contentDisplay}
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
            </Card>
        );
      case 'image':
        icon = <PhotographIcon className="w-6 h-6" />;
        title = input.mode === 'kids' ? "Child's Original Concept" : "Original Input Image";
        contentDisplay = (
          <>
            {input.fileDetails.url && input.fileDetails.size > 0 ? (
                 <>
                    <p className="text-muted-foreground text-sm italic">
                        {input.mode === 'kids' ? 'Drawing:' : 'Image:'} {input.fileDetails.name}
                    </p>
                    <Image src={input.fileDetails.url} alt={input.fileDetails.name} data-ai-hint={input.mode === 'kids' ? "kids drawing" : "abstract texture"} width={160} height={160} className="mt-2 rounded max-h-40 object-contain border border-slate-700"/>
                 </>
            ) : input.mode === 'kids' && input.voiceDescription ? (
                <p className="text-muted-foreground text-sm italic">Input was voice-only.</p>
            ) : (
                <p className="text-muted-foreground text-sm italic">Filename: {input.fileDetails.name}</p>
            )}
            {input.mode === 'kids' && input.voiceDescription && (
              <p className="text-muted-foreground text-xs italic mt-2">Voice Hint: "{input.voiceDescription}"</p>
            )}
            {input.mode === 'standard' && input.additionalContext && (
              <p className="text-muted-foreground text-xs italic mt-2">Additional Context: "{input.additionalContext}"</p>
            )}
          </>
        );
        break;
      case 'video':
        icon = <VideoCameraIcon className="w-6 h-6" />;
        title = "Original Input Concept";
        const fileTypeDisplay = input.fileDetails.type.startsWith('video/') ? 'Video' :
                              input.fileDetails.type.startsWith('audio/') ? 'Audio' : 'Media';
        contentDisplay = (
          <>
            <p className="text-muted-foreground text-sm italic">
              {fileTypeDisplay} Concept: {input.fileDetails.name} (Analyzed conceptually{input.fileDetails.url && input.fileDetails.type.startsWith('audio/') ? ' from live recording' : ''})
            </p>
            {input.additionalContext && (
              <p className="text-muted-foreground text-xs italic mt-2">Additional Context: "{input.additionalContext}"</p>
            )}
            {input.fileDetails.url && input.fileDetails.type.startsWith('audio/') && (
                <audio controls src={input.fileDetails.url} className="w-full mt-2" />
            )}
          </>
        );
        break;
      default:
        return null;
    }

    if (params.selectedGenre && (input.type !== 'text' || input.mode === 'kids')) {
      footerContent = (
          <div className="space-y-1 text-sm">
             <p><strong className="text-stardust-blue">Selected Genre:</strong> {params.selectedGenre}</p>
          </div>
      );
    }


    return (
      <Card className="mt-8 bg-nebula-gray/80 border-slate-700">
        <CardHeader>
          <div className="flex items-center text-stardust-blue mb-2">
            {icon}
            <CardTitle className="ml-2 text-lg font-semibold">{title}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {contentDisplay}
        </CardContent>
        {footerContent && (
            <CardFooter className="border-t border-slate-700 pt-4 flex-col items-start">
                {footerContent}
            </CardFooter>
        )}
      </Card>
    );
  }

  const getRhythmicDensityDescription = (density: number) => {
    if (density < 0.2) return "Very Sparse";
    if (density < 0.4) return "Sparse";
    if (density < 0.6) return "Moderate";
    if (density < 0.8) return "Dense";
    return "Very Dense";
  };

  const getHarmonicComplexityDescription = (complexity: number) => {
    if (complexity < 0.2) return "Very Simple";
    if (complexity < 0.4) return "Simple";
    if (complexity < 0.6) return "Moderate";
    if (complexity < 0.8) return "Complex";
    return "Very Complex";
  };


  return (
    <div className="space-y-8 animate-fadeIn">
      <Card className="p-6 bg-primary shadow-xl text-center border-none">
        <CardTitle className="text-3xl font-bold text-primary-foreground mb-2">Musical Essence Unveiled</CardTitle>
        <div className="flex items-center justify-center space-x-2">
            <CardDescription className="text-lg text-primary-foreground/80 italic">
            "{params.generatedIdea}"
            </CardDescription>
            <Button
                variant="ghost"
                size="icon"
                onClick={onRegenerateIdea}
                disabled={isRegeneratingIdea}
                className="text-primary-foreground/70 hover:text-primary-foreground disabled:opacity-50"
                title="Regenerate Idea"
            >
            {isRegeneratingIdea ? (
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"></circle>
                    <path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" className="opacity-75" fill="currentColor"></path>
                </svg>
            ) : (
                <RefreshIcon className="w-5 h-5" />
            )}
            </Button>
        </div>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <ParameterCardComponent title="Key Signature" value={`${params.keySignature} ${params.mode}`} icon={<MusicalNoteIcon />} />
        <ParameterCardComponent title="Tempo" value={params.tempoBpm} unit="BPM" icon={<ClockIcon />} />
        <ParameterCardComponent title="Mood Tags" value={params.moodTags || []} icon={params.targetValence > 0 ? <MoodHappyIcon /> : <MoodSadIcon />} />
        <ParameterCardComponent title="Instrument Hints" value={params.instrumentHints || []} icon={<CollectionIcon />} />
        <ParameterCardComponent title="Valence & Arousal" value={`V: ${params.targetValence.toFixed(2)}, A: ${params.targetArousal.toFixed(2)}`} icon={<LightningBoltIcon />} subText={getValenceArousalDescription(params.targetValence, params.targetArousal)} />
        <ParameterCardComponent title="Rhythmic Density" value={params.rhythmicDensity.toFixed(2)} icon={<ScaleIcon />} subText={getRhythmicDensityDescription(params.rhythmicDensity)} />
        <ParameterCardComponent title="Harmonic Complexity" value={params.harmonicComplexity.toFixed(2)} icon={<CogIcon />} subText={getHarmonicComplexityDescription(params.harmonicComplexity)} />
        {params.selectedGenre && params.originalInput.mode === 'standard' && (
            <ParameterCardComponent title="Selected Genre" value={params.selectedGenre} icon={<LibraryIcon />} />
        )}
      </div>

      <Card className="mt-8 p-4 bg-nebula-gray/80 border-slate-700">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold text-stardust-blue text-center">Audio Output</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center space-y-3">
             <Alert variant="default" className="bg-slate-700/50 border-slate-600 text-slate-300">
              <Disc3Icon className="h-5 w-5 text-amber-400" />
              <AlertTitle className="text-amber-400">Audio Options</AlertTitle>
              <AlertDescription>
                Download a MIDI file for your DAW, or generate a basic WAV audio preview using Tone.js.
                In-browser playback is under development.
              </AlertDescription>
            </Alert>
            <div className="flex flex-wrap justify-center gap-3 w-full">
                 <Button onClick={handleDownloadMidi} disabled={isGeneratingMidiForDownload || isGeneratingWav} className="flex-grow sm:flex-none bg-stardust-blue hover:bg-sky-500 text-primary-foreground">
                    {isGeneratingMidiForDownload ? (
                        <><svg className="animate-spin -ml-1 mr-3 h-5 w-5" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"></circle><path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75" fill="currentColor"></path></svg>Generating MIDI...</>
                    ) : (
                        <><DownloadIcon className="w-5 h-5 mr-2" />Download MIDI</>
                    )}
                </Button>
                <Button onClick={handleDownloadWav} disabled={isGeneratingWav || isGeneratingMidiForDownload} className="flex-grow sm:flex-none bg-teal-500 hover:bg-teal-600 text-primary-foreground">
                    {isGeneratingWav ? (
                        <><svg className="animate-spin -ml-1 mr-3 h-5 w-5" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"></circle><path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75" fill="currentColor"></path></svg>Rendering WAV...</>
                    ) : (
                        <><MusicIcon className="w-5 h-5 mr-2" />Download WAV (Tone.js)</>
                    )}
                </Button>
            </div>
            <div className="text-center mt-2 h-4 w-full">
                {midiError && <p className="text-red-400 text-sm">{`MIDI Error: ${midiError}`}</p>}
                {wavError && <p className="text-red-400 text-sm">{`WAV Error: ${wavError}`}</p>}
            </div>
        </CardContent>
      </Card>

      <div className="mt-8 text-center space-y-4 sm:space-y-0 sm:space-x-4 sm:flex sm:justify-center">
        <Button onClick={handleCopyDetails} disabled={isCopied} variant="outline" className="w-full sm:w-auto border-slate-500 text-slate-200 hover:bg-slate-700 hover:text-slate-100">
          {isCopied ? (
            <><ClipboardCopyIcon className="w-5 h-5 mr-2 text-green-400" />Copied!</>
          ) : (
            <><ClipboardCopyIcon className="w-5 h-5 mr-2" />Copy Details</>
          )}
        </Button>
        <Button
            onClick={handleShare}
            disabled={isSharing || (params.originalInput.mode === 'standard' && !standardModeArtUrl && !params) || (params.originalInput.mode === 'kids' && !params) }
            variant="outline"
            className="w-full sm:w-auto border-green-500 text-green-400 hover:bg-green-500/10 hover:text-green-300"
        >
             {isSharing ? (
                <><svg className="animate-spin -ml-1 mr-3 h-5 w-5" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"></circle><path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75" fill="currentColor"></path></svg>Sharing...</>
             ) : (
                <><Share2 className="w-5 h-5 mr-2" />Share Creation</>
             )}
        </Button>
      </div>
      <div className="text-center mt-2 h-4">
        {copyError && <p className="text-red-400 text-sm">{copyError}</p>}
        {shareError && <p className="text-red-400 text-sm">{`Share Error: ${shareError}`}</p>}
      </div>

      {params.originalInput && renderOriginalInputInfo(params.originalInput)}
    </div>
  );
};

const ParameterCardComponent: React.FC<{title: string; value: any; icon: React.ReactNode; unit?: string; subText?: string; className?:string}> = ({ title, value, icon, unit, subText, className }) => (
  <Card className={`bg-nebula-gray/80 border-slate-700 ${className}`}>
    <CardHeader className="pb-2">
        <div className="flex items-center text-stardust-blue mb-1">
            {React.cloneElement(icon as React.ReactElement, { className: "w-5 h-5" })}
            <CardTitle className="ml-2 text-md font-semibold">{title}</CardTitle>
        </div>
    </CardHeader>
    <CardContent>
        <p className="text-galaxy-white text-lg font-light truncate">
            {Array.isArray(value) ? value.join(', ') : String(value)}
            {unit && <span className="text-xs text-muted-foreground ml-1">{unit}</span>}
        </p>
        {subText && <p className="text-xs text-muted-foreground mt-1">{subText}</p>}
    </CardContent>
  </Card>
);

// mapInstrumentHintToGM is now imported from toneService, or defined there
// ensureStrictlyIncreasingTimes is now imported from toneService, or defined there

    
