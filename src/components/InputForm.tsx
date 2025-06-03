
"use client";
import React, { useState, useCallback, useId } from 'react';
import { SparklesIcon } from './icons/SparklesIcon';
import { DocumentTextIcon, PhotographIcon, VideoCameraIcon, XCircleIcon, UploadCloudIcon } from './icons/HeroIcons';
import type { InputType as StandardInputType, AppInput, FilePreview } from '@/types'; // Renamed InputType to StandardInputType
import { MAX_IMAGE_FILE_SIZE_BYTES, MAX_IMAGE_FILE_SIZE_MB, MUSIC_GENRES } from '@/lib/constants';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface InputFormProps {
  onSubmit: (input: AppInput) => void;
  isLoading: boolean;
  selectedGenre: string;
  onGenreChange: (genre: string) => void;
}

const readFileAsDataURL = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
};

export const InputForm: React.FC<InputFormProps> = ({ onSubmit, isLoading, selectedGenre, onGenreChange }) => {
  const [currentStandardInputType, setCurrentStandardInputType] = useState<StandardInputType>('text'); // Renamed state variable
  const [text, setText] = useState<string>('');
  const [filePreview, setFilePreview] = useState<FilePreview | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  
  const fileInputId = useId();
  const textInputId = useId();
  const genreSelectId = useId();

  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setFileError(null);
      const fileDetails: FilePreview = {
        name: file.name,
        type: file.type,
        size: file.size,
      };

      if (currentStandardInputType === 'image') {
        if (!file.type.startsWith('image/')) {
          setFileError('Invalid file type. Please select an image (JPEG, PNG, GIF, WEBP).');
          setFilePreview(null);
          event.target.value = ''; 
          return;
        }
        if (file.size > MAX_IMAGE_FILE_SIZE_BYTES) {
          setFileError(`Image too large. Max size: ${MAX_IMAGE_FILE_SIZE_MB}MB. Your file: ${(file.size / (1024*1024)).toFixed(2)}MB`);
          setFilePreview(null);
          event.target.value = '';
          return;
        }
        try {
          const dataUrl = await readFileAsDataURL(file);
          fileDetails.url = dataUrl; 
          setFilePreview(fileDetails);
        } catch (error) {
          console.error("Error reading file:", error);
          setFileError("Could not read file. Please try again.");
          setFilePreview(null);
          event.target.value = '';
        }
      } else if (currentStandardInputType === 'video') {
         if (!file.type.startsWith('video/')) {
          setFileError('Invalid file type. Please select a video.');
          setFilePreview(null);
          event.target.value = '';
          return;
        }
        setFilePreview(fileDetails);
      }
    } else {
      setFilePreview(null);
    }
  }, [currentStandardInputType]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    let appInputPartial: Omit<AppInput, 'mode' | 'genre'> | null = null;

    if (currentStandardInputType === 'text' && text.trim()) {
      appInputPartial = { type: 'text', content: text.trim() };
    } else if (currentStandardInputType === 'image' && filePreview?.url) {
      const base64Content = filePreview.url.split(',')[1];
      if (!base64Content) {
        setFileError("Failed to process image data. Please re-upload.");
        return;
      }
      appInputPartial = { 
        type: 'image', 
        content: base64Content, 
        mimeType: filePreview.type,
        fileDetails: {...filePreview, url: filePreview.url },
      };
    } else if (currentStandardInputType === 'video' && filePreview) {
      appInputPartial = { type: 'video', fileDetails: filePreview };
    }

    if (appInputPartial) {
      // The 'mode' will be added by the parent page.tsx component
      // The 'genre' is handled by the parent as well through props.
      onSubmit({ ...appInputPartial, genre: selectedGenre } as AppInput); 
    } else {
      if (currentStandardInputType === 'text') setFileError("Please enter some text.");
      else setFileError("Please select a file.");
    }
  };
  
  const isSubmitDisabled = isLoading || 
    (currentStandardInputType === 'text' && !text.trim()) ||
    ((currentStandardInputType === 'image' || currentStandardInputType === 'video') && !filePreview) ||
    !!fileError;

  const inputOptions: { type: StandardInputType, label: string, icon: React.FC<any> }[] = [
    { type: 'text', label: 'Text', icon: DocumentTextIcon },
    { type: 'image', label: 'Image', icon: PhotographIcon },
    { type: 'video', label: 'Video Concept', icon: VideoCameraIcon },
  ];

  const resetFileInput = () => {
    setFilePreview(null);
    setFileError(null);
    const fileInput = document.getElementById(fileInputId) as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <Label className="block text-lg font-medium text-stardust-blue mb-3">
          1. Choose Input Type:
        </Label>
        <div className="flex space-x-2 mb-6 bg-nebula-gray/50 p-1 rounded-lg shadow">
          {inputOptions.map(opt => (
            <Button
              key={opt.type}
              type="button"
              variant={currentStandardInputType === opt.type ? "default" : "ghost"}
              onClick={() => { 
                setCurrentStandardInputType(opt.type); 
                setText(''); 
                setFilePreview(null); 
                setFileError(null); 
                const fileInput = document.getElementById(fileInputId) as HTMLInputElement;
                if (fileInput) fileInput.value = '';
              }}
              className={`flex-1 p-3 text-sm font-medium flex items-center justify-center transition-all duration-150 
                ${currentStandardInputType === opt.type ? 'bg-cosmic-purple text-primary-foreground shadow-md' : 'text-slate-300 hover:bg-nebula-gray'}`}
              aria-pressed={currentStandardInputType === opt.type}
            >
              <opt.icon className={`w-5 h-5 mr-2 ${currentStandardInputType === opt.type ? 'text-primary-foreground' : 'text-stardust-blue'}`} />
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      {currentStandardInputType === 'text' && (
        <div>
          <Label htmlFor={textInputId} className="block text-sm font-medium text-stardust-blue mb-1">
            Enter Your Text:
          </Label>
          <Textarea
            id={textInputId}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="A lonely star in a cold, dark night..."
            rows={6}
            className="w-full p-4 bg-nebula-gray border border-slate-600 rounded-lg shadow-sm focus:ring-2 focus:ring-cosmic-purple focus:border-cosmic-purple transition-colors duration-150 placeholder-slate-400 text-galaxy-white resize-none"
            disabled={isLoading}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Describe a scene, a feeling, a poem, or a short story.
          </p>
        </div>
      )}

      {(currentStandardInputType === 'image' || currentStandardInputType === 'video') && (
        <div>
          <Label htmlFor={fileInputId} className="block text-sm font-medium text-stardust-blue mb-1">
            Upload {currentStandardInputType === 'image' ? 'Image' : 'Video'} File:
          </Label>
          <div className="relative">
            <Input
              id={fileInputId}
              type="file"
              accept={currentStandardInputType === 'image' ? 'image/png, image/jpeg, image/gif, image/webp' : 'video/*'}
              onChange={handleFileChange}
              className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-cosmic-purple file:text-primary-foreground hover:file:bg-purple-700 disabled:opacity-50"
              disabled={isLoading}
            />
             <UploadCloudIcon className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
          </div>
          {currentStandardInputType === 'video' && <p className="mt-2 text-xs text-muted-foreground">Note: The video content itself is not uploaded. Music parameters will be generated based on the video's filename and conceptual analysis.</p>}
          {currentStandardInputType === 'image' && <p className="mt-2 text-xs text-muted-foreground">Max file size: {MAX_IMAGE_FILE_SIZE_MB}MB. Supported formats: JPEG, PNG, GIF, WEBP.</p>}

          {fileError && (
            <p className="mt-2 text-sm text-red-400 flex items-center">
              <XCircleIcon className="w-5 h-5 mr-1"/> {fileError}
            </p>
          )}

          {filePreview && (
             <Card className="mt-4 bg-nebula-gray border-slate-600">
              <CardHeader className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-medium text-galaxy-white">{filePreview.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">{filePreview.type} - {(filePreview.size / 1024).toFixed(1)} KB</p>
                  </div>
                  <Button type="button" variant="ghost" size="icon" onClick={resetFileInput} className="text-red-400 hover:text-red-300" aria-label="Remove file">
                     <XCircleIcon className="w-6 h-6"/>
                  </Button>
                </div>
              </CardHeader>
              {currentStandardInputType === 'image' && filePreview.url && (
                <CardContent className="p-3 pt-0">
                  <img src={filePreview.url} alt="Preview" data-ai-hint="abstract texture" className="mt-2 rounded-md max-h-40 object-contain border border-slate-700" />
                </CardContent>
              )}
            </Card>
          )}
        </div>
      )}

      <div className="mt-6">
        <Label htmlFor={genreSelectId} className="block text-lg font-medium text-stardust-blue mb-3">
          2. Select Music Genre (Optional):
        </Label>
        <Select value={selectedGenre} onValueChange={onGenreChange} disabled={isLoading}>
          <SelectTrigger id={genreSelectId} className="w-full p-3 bg-nebula-gray border border-slate-600 rounded-lg shadow-sm focus:ring-2 focus:ring-cosmic-purple focus:border-cosmic-purple transition-colors duration-150 text-galaxy-white">
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
        type="submit"
        disabled={isSubmitDisabled}
        className="w-full text-base font-medium rounded-md shadow-sm text-primary-foreground bg-gradient-to-r from-cosmic-purple to-stardust-blue hover:from-purple-700 hover:to-sky-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-nebula-dark focus:ring-stardust-blue disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 group"
        size="lg"
      >
        {isLoading ? (
          <>
            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-primary-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Generating...
          </>
        ) : (
          <>
            <SparklesIcon className="w-5 h-5 mr-2 text-yellow-300 group-hover:scale-110 transition-transform" />
            Generate Musical Essence
          </>
        )}
      </Button>
    </form>
  );
};
