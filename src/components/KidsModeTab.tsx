
"use client";
import React, { useState, useCallback, useRef, useId, useEffect } from 'react';
import { DrawingCanvas } from '@/components/DrawingCanvas';
import type { AppInput, RenderKidsDrawingInput, FilePreview, MusicParameters } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { SparklesIcon } from '@/components/icons/SparklesIcon';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { MUSIC_GENRES } from '@/lib/constants';
import useSpeechRecognition from '@/hooks/useSpeechRecognition';
import { Mic, MicOff, Image as LucideImage, Download } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import Image from 'next/image';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ErrorMessage } from '@/components/ErrorMessage';

interface KidsModeTabProps {
  onTuneCreation: (
    musicInput: AppInput, 
    artInput: RenderKidsDrawingInput | null
  ) => Promise<{ musicError?: string; artError?: string; musicParamsResult?: MusicParameters, artUrlResult?: string }>;
  isLoadingMusic: boolean;
  isRenderingArt: boolean;
  aiKidsArtUrlProp: string | null;
  aiKidsArtErrorProp: string | null;
  selectedGenre: string;
  onGenreChange: (genre: string) => void;
  isClientMounted: boolean;
}

export const KidsModeTab: React.FC<KidsModeTabProps> = ({
  onTuneCreation,
  isLoadingMusic: isLoadingMusicProp,
  isRenderingArt: isRenderingArtProp,
  aiKidsArtUrlProp,
  aiKidsArtErrorProp,
  selectedGenre,
  onGenreChange,
  isClientMounted,
}) => {
  const drawingCanvasRef = useRef<{ getDataURL: () => string; clearCanvas: () => void; getRecordedNotesSequence: () => string[] }>(null);
  const genreSelectId = useId();
  const [localError, setLocalError] = useState<string | null>(null); // For input validation errors

  const {
    transcript: kidsVoiceTranscript,
    interimTranscript: kidsInterimTranscript,
    isListening: isListeningKids,
    startListening: startListeningKids,
    stopListening: stopListeningKids,
    hasRecognitionSupport: hasRecognitionSupportKids,
    error: speechErrorKids,
    resetTranscript: resetKidsTranscript
  } = useSpeechRecognition();

  const [hasDrawingContent, setHasDrawingContent] = useState<boolean>(false);

  // Reset local state when mode or relevant props change (e.g. tab is re-activated)
  useEffect(() => {
    if (drawingCanvasRef.current) {
      drawingCanvasRef.current.clearCanvas();
    }
    resetKidsTranscript();
    if (isListeningKids) {
      stopListeningKids();
    }
    setHasDrawingContent(false);
    setLocalError(null);
  }, []); // Empty array means this runs once on mount, effectively resetting for new tab display

  const handleLocalDrawingSubmit = async () => {
    if (!drawingCanvasRef.current) {
      setLocalError("Drawing canvas is not ready.");
      toast({ variant: "destructive", title: "Canvas Error", description: "Drawing canvas component is not available." });
      return;
    }
    
    const drawingDataURL = drawingCanvasRef.current.getDataURL();
    const voiceTranscript = kidsVoiceTranscript.trim();
    const recordedSoundSequenceArray = drawingCanvasRef.current.getRecordedNotesSequence();
    const recordedSoundSequence = recordedSoundSequenceArray.length > 0 ? recordedSoundSequenceArray.join(',') : undefined;

    const isCanvasEffectivelyEmpty = !drawingDataURL || drawingDataURL === 'data:,' || drawingDataURL === 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const hasVoice = voiceTranscript !== '';

    if (isCanvasEffectivelyEmpty && !hasVoice) {
      toast({ variant: "destructive", title: "Input Required", description: "Please draw something or record a voice hint to get music and art!" });
      setLocalError("Please draw something or record a voice hint.");
      return;
    }
    setLocalError(null);

    let appInputForMusic: AppInput;
    let renderArtInput: RenderKidsDrawingInput | null = null;

    if (!isCanvasEffectivelyEmpty) {
        const base64Content = drawingDataURL.split(',')[1];
        if (!base64Content) {
          setLocalError("Failed to process drawing data.");
          toast({ variant: "destructive", title: "Drawing Error", description: "Could not process the drawing data." });
          return;
        }
        const fileDetails: FilePreview = {
            name: "kids_drawing.png",
            type: "image/png",
            size: base64Content.length * 0.75, 
            url: drawingDataURL,
        };
        appInputForMusic = {
            type: 'image',
            content: base64Content, 
            mimeType: 'image/png',
            fileDetails: fileDetails, 
            genre: selectedGenre,
            mode: 'kids',
            voiceDescription: hasVoice ? voiceTranscript : undefined,
            drawingSoundSequence: recordedSoundSequence,
        };
        renderArtInput = { 
            drawingDataUri: drawingDataURL, 
            originalVoiceHint: hasVoice ? voiceTranscript : undefined,
            drawingSoundSequence: recordedSoundSequence,
        };
    } else if (hasVoice) { 
        const dummyFileDetails: FilePreview = { name: "voice_input.png", type: "image/png", size: 0, url: 'data:,' }; // Placeholder for voice-only
        appInputForMusic = {
            type: 'image', 
            content: '', 
            mimeType: 'image/png',
            fileDetails: dummyFileDetails,
            genre: selectedGenre,
            mode: 'kids',
            voiceDescription: voiceTranscript,
            drawingSoundSequence: recordedSoundSequence, // Sounds might still be recorded if colors were clicked
        };
        renderArtInput = { 
            originalVoiceHint: voiceTranscript,
            drawingSoundSequence: recordedSoundSequence,
        }; 
    } else {
        toast({ variant: "destructive", title: "Error", description: "Unexpected state: no input for Kids Mode." });
        setLocalError("Unexpected state: no input provided.");
        return;
    }
    
    // Call the prop function passed from page.tsx to handle AI calls and global state updates
    await onTuneCreation(appInputForMusic, renderArtInput);
  };

  const handleKidsVoiceInputToggle = () => {
    if (isListeningKids) {
      stopListeningKids();
    } else {
      resetKidsTranscript();
      startListeningKids();
    }
  };
  
  const handleDownloadAiArt = () => {
    if (aiKidsArtUrlProp) {
      const link = document.createElement('a');
      link.href = aiKidsArtUrlProp;
      link.download = 'dreamtuner_ai_rendition.png';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const isTuneMyCreationDisabled = isLoadingMusicProp || 
                                   isListeningKids || 
                                   isRenderingArtProp ||
                                   (!hasDrawingContent && kidsVoiceTranscript.trim() === '');
  return (
    <Card className="bg-nebula-gray shadow-2xl rounded-xl border-slate-700">
      <CardHeader>
        <CardTitle className="text-center text-2xl font-semibold text-stardust-blue">Draw Your Music!</CardTitle>
        <CardDescription className="text-center text-sm text-slate-300">Sketch & hear notes for each color, add a voice hint, or both! Then see what music it makes and how AI sees your creation!</CardDescription>
      </CardHeader>
      <CardContent className="p-6 sm:p-10 space-y-6">
        <DrawingCanvas 
            ref={drawingCanvasRef} 
            canvasContainerClassName="h-[300px] sm:h-[400px] md:h-[450px] lg:h-[500px]"
            isKidsMode={true} // Always true in KidsModeTab
            onDrawingActivity={setHasDrawingContent}
            backgroundColor="#FFFFFF"
        />
        
        <div className="mt-4 space-y-2">
          <Label className="block text-md font-medium text-stardust-blue">
            Add a Voice Hint (Optional):
          </Label>
          {isClientMounted && hasRecognitionSupportKids ? (
            <Button
              type="button"
              variant="outline"
              onClick={handleKidsVoiceInputToggle}
              disabled={isLoadingMusicProp || isRenderingArtProp} 
              className="w-full text-sm border-slate-600 hover:bg-slate-700 flex items-center justify-center"
            >
              {isListeningKids ? <MicOff className="w-4 h-4 mr-2" /> : <Mic className="w-4 h-4 mr-2" />}
              {isListeningKids ? 'Stop Listening & Save Hint' : 'Record Voice Hint'}
            </Button>
          ) : isClientMounted && !hasRecognitionSupportKids ? (
              <p className="text-xs text-muted-foreground text-center">Voice input not supported in this browser.</p>
          ) : null }
          {isListeningKids && (
            <p className="text-sm text-slate-300 text-center p-2 bg-slate-700/50 rounded-md">
              Listening: <em className="text-galaxy-white">{kidsInterimTranscript}</em>
            </p>
          )}
          {(!isListeningKids && kidsVoiceTranscript) || (isListeningKids && kidsVoiceTranscript) ? (
              <p className="text-sm text-slate-300 text-center p-2 bg-slate-700/50 rounded-md">
              Your hint: <em className="text-galaxy-white">{kidsVoiceTranscript} {isListeningKids && kidsInterimTranscript}</em>
            </p>
          ) : null}
          {speechErrorKids && <p className="mt-1 text-xs text-red-400 text-center">{speechErrorKids}</p>}
        </div>

        <div className="mt-4">
          <Label htmlFor={genreSelectId + "-kids"} className="block text-lg font-medium text-stardust-blue mb-3">
            What kind of music style? (Optional):
          </Label>
          <Select value={selectedGenre} onValueChange={onGenreChange} disabled={isLoadingMusicProp || isListeningKids || isRenderingArtProp}>
            <SelectTrigger id={genreSelectId + "-kids"} className="w-full p-3 bg-nebula-gray border border-slate-600 rounded-lg shadow-sm focus:ring-2 focus:ring-cosmic-purple focus:border-cosmic-purple transition-colors duration-150 text-galaxy-white">
              <SelectValue placeholder="Select a genre" />
            </SelectTrigger>
            <SelectContent className="bg-nebula-gray border-slate-500 text-galaxy-white">
              {MUSIC_GENRES.map(genre => (
                <SelectItem key={genre} value={genre} className="hover:bg-cosmic-purple/50 focus:bg-cosmic-purple/60">
                  {genre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          onClick={handleLocalDrawingSubmit}
          disabled={isTuneMyCreationDisabled}
          className="w-full text-base font-medium rounded-md shadow-sm text-primary-foreground bg-gradient-to-r from-stardust-blue to-green-400 hover:from-sky-500 hover:to-green-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-nebula-dark focus:ring-stardust-blue disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 group"
          size="lg"
        >
          {isLoadingMusicProp ? (
            <>
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-primary-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Tuning Music...
            </>
          ) : isRenderingArtProp ? ( 
              <>
              <LucideImage className="animate-pulse -ml-1 mr-3 h-5 w-5 text-primary-foreground" />
              AI Creating Your Art...
            </>
          ) : ( 
            <>
              <SparklesIcon className="w-5 h-5 mr-2 text-yellow-300 group-hover:scale-110 transition-transform" />
              Tune My Creation!
            </>
          )}
        </Button>
        {localError && <ErrorMessage message={localError} />}

        {isRenderingArtProp && !aiKidsArtUrlProp && ( 
          <div className="mt-6 text-center">
            <LoadingSpinner />
            <p className="mt-2 text-sm text-stardust-blue animate-pulse-subtle">AI is creating your masterpiece...</p>
          </div>
        )}
        {aiKidsArtErrorProp && (
          <div className="mt-6">
            <ErrorMessage message={`AI Artist Error: ${aiKidsArtErrorProp}`} />
          </div>
        )}
        {aiKidsArtUrlProp && !isRenderingArtProp && (
          <Card className="mt-6 bg-nebula-gray/50 border-slate-600">
            <CardHeader>
              <CardTitle className="text-center text-xl font-semibold text-stardust-blue">AI's Artistic Rendition!</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center space-y-4">
              <Image 
                src={aiKidsArtUrlProp} 
                alt="AI Rendered Sketch of Kid's Drawing or Voice Hint" 
                data-ai-hint="illustration drawing kids"
                width={400} 
                height={250} 
                className="rounded-md max-h-64 object-contain border border-slate-500 shadow-lg"
                unoptimized 
              />
              <Button onClick={handleDownloadAiArt} variant="outline" className="border-stardust-blue text-stardust-blue hover:bg-stardust-blue/10">
                <Download className="w-4 h-4 mr-2" />
                Download AI Art
              </Button>
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
  );
};
