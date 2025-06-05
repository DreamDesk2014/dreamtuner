
"use client";
import React, { useState, useCallback, useId, useEffect, useRef } from 'react';
import { SparklesIcon } from './icons/SparklesIcon';
import { DocumentTextIcon, PhotographIcon, VideoCameraIcon, XCircleIcon, UploadCloudIcon } from './icons/HeroIcons';
import { Mic, MicOff, RotateCcw, Camera, CameraOff, AudioLines, StopCircle } from 'lucide-react';
import useSpeechRecognition from '@/hooks/useSpeechRecognition';
import type { InputType as StandardInputType, AppInput, FilePreview } from '@/types';
import { MAX_IMAGE_FILE_SIZE_BYTES, MAX_IMAGE_FILE_SIZE_MB, MUSIC_GENRES } from '@/lib/constants';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from '@/hooks/use-toast';

const readFileAsDataURL = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
};

const dataURLtoFile = (dataurl: string, filename: string): File | null => {
  const arr = dataurl.split(',');
  if (arr.length < 2) return null;
  const mimeMatch = arr[0].match(/:(.*?);/);
  if (!mimeMatch) return null;
  const mime = mimeMatch[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mime });
};

const mapSliderToFloat = (value: number | undefined): number | undefined => {
  if (value === undefined || value === 50) return undefined;
  return (value - 50) / 50;
};

interface InputFormProps {
  onSubmit: (input: AppInput) => void;
  isLoading: boolean;
  selectedGenre: string;
  onGenreChange: (genre: string) => void;
}

export const InputForm: React.FC<InputFormProps> = ({ onSubmit, isLoading, selectedGenre, onGenreChange }) => {
  const [currentStandardInputType, setCurrentStandardInputType] = useState<StandardInputType>('text');
  const [text, setText] = useState<string>('');
  const [additionalContext, setAdditionalContext] = useState<string>('');
  const [filePreview, setFilePreview] = useState<FilePreview | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isClientMounted, setIsClientMounted] = useState(false);

  const [energySlider, setEnergySlider] = useState<number | undefined>(50);
  const [positivitySlider, setPositivitySlider] = useState<number | undefined>(50);

  const [showCameraPreview, setShowCameraPreview] = useState<boolean>(false);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isProcessingCamera, setIsProcessingCamera] = useState<boolean>(false);
  const [cameraFeedReady, setCameraFeedReady] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null); 

  // Audio Recording State
  const [isRecordingAudio, setIsRecordingAudio] = useState<boolean>(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [hasMicrophonePermission, setHasMicrophonePermission] = useState<boolean | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioStreamRef = useRef<MediaStream | null>(null);


  useEffect(() => {
    setIsClientMounted(true);
  }, []);
  
  const fileInputId = useId();
  const textInputId = useId();
  const additionalContextId = useId();
  const genreSelectId = useId();
  const energySliderId = useId();
  const positivitySliderId = useId();

  const {
    transcript,
    interimTranscript,
    isListening,
    startListening,
    stopListening,
    hasRecognitionSupport,
    error: speechError,
    resetTranscript
  } = useSpeechRecognition();

  useEffect(() => {
    if (currentStandardInputType === 'text') {
      if (isListening) {
        setText(transcript + interimTranscript);
      } else if (transcript && !interimTranscript) { 
        setText(transcript);
      }
    }
  }, [transcript, interimTranscript, isListening, currentStandardInputType]);

  useEffect(() => {
    let currentStreamForCleanup: MediaStream | null = null;

    const startCameraStream = async () => {
        setCameraError(null);
        setHasCameraPermission(null);
        setCameraFeedReady(false);

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            const msg = 'Camera access is not supported by your browser.';
            setCameraError(msg);
            toast({ variant: 'destructive', title: 'Camera Error', description: msg });
            setHasCameraPermission(false);
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            streamRef.current = stream;
            currentStreamForCleanup = stream;

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.onloadedmetadata = async () => {
                    // Ensure the video element is present and visible before playing
                    if (videoRef.current && videoRef.current.isConnected) { 
                        try {
                            await videoRef.current.play();
                            // Successfully started playing
                        } catch (playError: any) {
                            console.warn('Video play() promise rejected:', playError);
                            setCameraError(`Failed to play camera feed: ${playError.message}. Try interacting with the page or check browser console.`);
                            setHasCameraPermission(false); // Assume permission might be the issue or stream is unusable
                            setCameraFeedReady(false);
                        }
                    }
                };
                videoRef.current.onplaying = () => { // Moved onplaying here
                    setCameraFeedReady(true);
                };
                videoRef.current.onstalled = () => {
                    setCameraFeedReady(false);
                    toast({ variant: 'destructive', title: 'Camera Feed Stalled', description: 'The camera feed stopped unexpectedly.' });
                };
                 // videoRef.current.load(); // Not strictly necessary with onloadedmetadata
            }
            setHasCameraPermission(true); // Permission granted
        } catch (err) {
            console.error("Error accessing camera:", err);
            let msg = 'Could not access the camera.';
            if (err instanceof Error) {
                if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                    msg = 'Camera permission denied. Please enable it in your browser settings.';
                } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
                    msg = 'No camera found. Please ensure a camera is connected and enabled.';
                } else {
                    msg = `Error accessing camera: ${err.message}`;
                }
            }
            setCameraError(msg);
            toast({ variant: 'destructive', title: 'Camera Access Failed', description: msg });
            setHasCameraPermission(false);
            setCameraFeedReady(false);
        }
    };

    const stopLocalStream = (streamToStopRef: React.MutableRefObject<MediaStream | null>, videoElementRef?: React.RefObject<HTMLVideoElement>) => {
      if (streamToStopRef.current) {
        streamToStopRef.current.getTracks().forEach(track => track.stop());
        streamToStopRef.current = null;
      }
      if (videoElementRef?.current) {
        videoElementRef.current.srcObject = null;
        videoElementRef.current.onloadedmetadata = null; // Clear handler
        videoElementRef.current.onplaying = null;
        videoElementRef.current.onstalled = null;
      }
      if (videoElementRef === videoRef) setCameraFeedReady(false);
    };

    if (showCameraPreview && (currentStandardInputType === 'image' || currentStandardInputType === 'video')) {
      startCameraStream();
    } else {
      stopLocalStream(streamRef, videoRef);
    }

    return () => { 
      stopLocalStream(streamRef, videoRef);
      stopLocalStream(audioStreamRef); 
    };
  }, [showCameraPreview, currentStandardInputType]); 


  const handleToggleCameraPreview = () => {
    if (showCameraPreview) {
      setShowCameraPreview(false); 
    } else {
      setFilePreview(null); 
      setFileError(null);
      setIsRecordingAudio(false); 
      setHasCameraPermission(null); 
      setCameraError(null);
      setCameraFeedReady(false);
      setShowCameraPreview(true); 
    }
  };
  
  const handleTakePhoto = async () => {
    if (!videoRef.current || !hasCameraPermission || !cameraFeedReady) {
      toast({ variant: "destructive", title: "Camera Error", description: "Camera not ready or no permission." });
      return;
    }
     if (videoRef.current.readyState < videoRef.current.HAVE_METADATA || videoRef.current.videoWidth === 0 || videoRef.current.videoHeight === 0) {
      toast({ variant: "destructive", title: "Camera Not Ready", description: "Camera is still initializing. Please wait a moment and try again." });
      setIsProcessingCamera(false); 
      return;
    }

    setIsProcessingCamera(true);
    setFileError(null);

    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const context = canvas.getContext('2d');

    if (context) {
      context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9); 
      const filename = `dreamtuner_photo_${Date.now()}.jpg`;
      const imageFile = dataURLtoFile(dataUrl, filename);

      if (imageFile) {
        if (imageFile.size > MAX_IMAGE_FILE_SIZE_BYTES) {
          setFileError(`Captured image is too large (${(imageFile.size / (1024*1024)).toFixed(2)}MB). Max ${MAX_IMAGE_FILE_SIZE_MB}MB.`);
          toast({ variant: "destructive", title: "Image Too Large", description: `Max size ${MAX_IMAGE_FILE_SIZE_MB}MB.`});
          setFilePreview(null);
        } else {
          setFilePreview({
            name: imageFile.name,
            type: imageFile.type,
            size: imageFile.size,
            url: dataUrl,
          });
        }
      } else {
        setFileError("Failed to create image file from camera capture.");
        toast({variant: "destructive", title: "Capture Error", description: "Failed to create image file."});
      }
    } else {
      setFileError("Failed to get canvas context for capturing photo.");
      toast({variant: "destructive", title: "Capture Error", description: "Failed to get canvas context."});
    }
    
    setShowCameraPreview(false); 
    setIsProcessingCamera(false);
  };

  const handleUseLiveVideoConcept = () => {
    if (!cameraFeedReady && hasCameraPermission) {
        toast({ variant: "default", title: "Camera Initializing", description: "Please wait for the video feed to start." });
        return;
    }
    if (!hasCameraPermission) {
        toast({ variant: "destructive", title: "Camera Error", description: "Camera permission not granted or feed not active." });
        return;
    }

    setIsProcessingCamera(true);
    setFilePreview({
      name: 'live_camera_capture.mp4', 
      type: 'video/mp4', 
      size: 0, 
    });
    setShowCameraPreview(false); 
    setIsProcessingCamera(false);
    toast({ title: "Video Concept Set", description: "Using 'Live Camera Capture' as the video concept." });
  };

  const handleVoiceInputToggle = () => {
    if (isListening) {
      stopListening();
    } else {
      resetTranscript(); 
      startListening();
    }
  };

  const handleToggleAudioRecording = async () => {
    setAudioError(null);
    setFileError(null);
    if (showCameraPreview) setShowCameraPreview(false);
    if (filePreview) setFilePreview(null);


    if (isRecordingAudio) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      setIsRecordingAudio(false);
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(track => track.stop());
        audioStreamRef.current = null;
      }
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setAudioError('Audio recording is not supported by your browser.');
      toast({ variant: 'destructive', title: 'Audio Error', description: 'Not supported.' });
      setHasMicrophonePermission(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      setHasMicrophonePermission(true);
      audioChunksRef.current = [];
      
      const options = { mimeType: 'audio/webm' }; 
      let recorder;
      try {
        recorder = new MediaRecorder(stream, options);
      } catch (e) {
        console.warn("audio/webm not supported, trying default");
        try {
            recorder = new MediaRecorder(stream); 
        } catch (e2: any) {
            setAudioError(`MediaRecorder error: ${e2.message}. Your browser might not support common audio recording formats.`);
            toast({ variant: 'destructive', title: 'Recording Error', description: `MediaRecorder error. ${e2.message}` });
            stream.getTracks().forEach(track => track.stop());
            audioStreamRef.current = null;
            return;
        }
      }
      mediaRecorderRef.current = recorder;

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorderRef.current?.mimeType || 'audio/wav' });
        const audioDataUrl = await readFileAsDataURL(audioBlob);
        
        setFilePreview({
          name: `live_audio_recording.${audioBlob.type.split('/')[1] || 'wav'}`,
          type: audioBlob.type || 'audio/wav',
          size: audioBlob.size,
          url: audioDataUrl,
        });
        setIsRecordingAudio(false);
        toast({ title: "Audio Recorded!", description: "Your audio has been captured." });
        if (audioStreamRef.current) {
            audioStreamRef.current.getTracks().forEach(track => track.stop());
            audioStreamRef.current = null;
        }
      };

      mediaRecorderRef.current.start();
      setIsRecordingAudio(true);
      toast({ title: "Recording Audio...", description: "Speak into your microphone." });

    } catch (err) {
      console.error("Error accessing microphone:", err);
      let msg = 'Could not access the microphone.';
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          msg = 'Microphone permission denied. Please enable it in your browser settings.';
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          msg = 'No microphone found. Please ensure a microphone is connected and enabled.';
        } else {
          msg = `Error accessing microphone: ${err.message}`;
        }
      }
      setAudioError(msg);
      toast({ variant: 'destructive', title: 'Microphone Error', description: msg });
      setHasMicrophonePermission(false);
      setIsRecordingAudio(false);
    }
  };


  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (showCameraPreview) setShowCameraPreview(false); 
    if (isRecordingAudio) handleToggleAudioRecording(); 

    const file = event.target.files?.[0];
    if (file) {
      setFileError(null); setAudioError(null);
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
         if (!file.type.startsWith('video/') && !file.type.startsWith('audio/')) {
          setFileError('Invalid file type. Please select a video or audio file.');
          setFilePreview(null);
          event.target.value = '';
          return;
        }
        setFilePreview(fileDetails);
      }
    } else {
      setFilePreview(null);
    }
  }, [currentStandardInputType, showCameraPreview, isRecordingAudio]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading || isListening || isProcessingCamera || isRecordingAudio) return; 

    let appInputPartial: Omit<AppInput, 'mode' | 'genre' | 'userEnergy' | 'userPositivity'> | null = null;

    if (currentStandardInputType === 'text' && text.trim()) {
      appInputPartial = { type: 'text', content: text.trim() };
    } else if (currentStandardInputType === 'image' && filePreview?.url) {
      const base64Content = filePreview.url.split(',')[1];
      if (!base64Content) {
        setFileError("Failed to process image data. Please re-upload or recapture.");
        return;
      }
      appInputPartial = { 
        type: 'image', 
        content: base64Content, 
        mimeType: filePreview.type,
        fileDetails: {...filePreview, url: filePreview.url }, 
        additionalContext: additionalContext.trim() || undefined,
      };
    } else if (currentStandardInputType === 'video' && filePreview) { 
      let contentForFlow: string | undefined = undefined;
      let mimeTypeForFlow: string | undefined = undefined;

      if (filePreview.url && filePreview.type.startsWith('audio/')) { 
        contentForFlow = filePreview.url.split(',')[1];
        mimeTypeForFlow = filePreview.type;
      }

      appInputPartial = { 
        type: 'video', 
        fileDetails: filePreview, 
        content: contentForFlow, 
        mimeType: mimeTypeForFlow, 
        additionalContext: additionalContext.trim() || undefined,
      };
    }

    if (appInputPartial) {
      const finalAppInput: AppInput = { 
        ...appInputPartial, 
        genre: selectedGenre, 
        mode: 'standard',
        userEnergy: mapSliderToFloat(energySlider),
        userPositivity: mapSliderToFloat(positivitySlider),
      };
      onSubmit(finalAppInput); 
    } else {
      if (currentStandardInputType === 'text') setFileError("Please enter some text or use voice input.");
      else setFileError("Please select a file, use the camera, or record audio.");
    }
  };
  
  const isSubmitDisabled = isLoading || isListening || isProcessingCamera || isRecordingAudio ||
    (currentStandardInputType === 'text' && !text.trim()) ||
    ((currentStandardInputType === 'image' || currentStandardInputType === 'video') && !filePreview && !showCameraPreview) || 
    !!fileError || !!audioError;

  const inputOptions: { type: StandardInputType, label: string, icon: React.FC<any> }[] = [
    { type: 'text', label: 'Text', icon: DocumentTextIcon },
    { type: 'image', label: 'Image', icon: PhotographIcon },
    { type: 'video', label: 'Video/Audio', icon: VideoCameraIcon },
  ];

  const resetAllMediaInputs = () => {
    setFilePreview(null);
    setFileError(null);
    setAudioError(null);
    const fileInput = document.getElementById(fileInputId) as HTMLInputElement;
    if (fileInput) fileInput.value = '';
    
    if (showCameraPreview) setShowCameraPreview(false); 

    if (isRecordingAudio) { 
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop(); 
      }
      setIsRecordingAudio(false);
    } else if (audioStreamRef.current) { 
        audioStreamRef.current.getTracks().forEach(track => track.stop());
        audioStreamRef.current = null;
    }
    setHasMicrophonePermission(null);
  };

  const handleInputTypeChange = (newType: StandardInputType) => {
    setCurrentStandardInputType(newType);
    setText('');
    setAdditionalContext('');
    resetTranscript();
    if (isListening) stopListening();
    resetAllMediaInputs();
  };

  const resetEnergySlider = () => setEnergySlider(50);
  const resetPositivitySlider = () => setPositivitySlider(50);

  let cameraButtonText = 'Use Camera';
  if (!showCameraPreview) {
    if (currentStandardInputType === 'image') cameraButtonText = 'Use Camera to Take Photo';
    else if (currentStandardInputType === 'video') cameraButtonText = 'Use Camera for Video Concept';
  } else {
    cameraButtonText = 'Close Camera';
  }

  const showRecordAudioButton = currentStandardInputType === 'video' && !filePreview && !showCameraPreview;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <Label className="block text-lg font-medium text-stardust-blue mb-3">
          1. Choose Input Type:
        </Label>
        <div className="flex flex-wrap gap-2 mb-4 bg-nebula-gray/50 p-1 rounded-lg shadow">
          {inputOptions.map(opt => (
            <Button
              key={opt.type}
              type="button"
              variant={currentStandardInputType === opt.type ? "default" : "ghost"}
              onClick={() => handleInputTypeChange(opt.type)}
              className={`flex-1 p-3 text-sm font-medium flex items-center justify-center transition-all duration-150 min-w-[100px] 
                ${currentStandardInputType === opt.type ? 'bg-primary text-primary-foreground shadow-md' : 'text-slate-300 hover:bg-nebula-gray'}`}
              aria-pressed={currentStandardInputType === opt.type}
              disabled={isLoading || isProcessingCamera || isRecordingAudio}
            >
              <opt.icon className={`w-5 h-5 mr-2 ${currentStandardInputType === opt.type ? 'text-primary-foreground' : 'text-stardust-blue'}`} />
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      {currentStandardInputType === 'text' && (
        <div>
          <div className="flex justify-between items-center mb-1">
            <Label htmlFor={textInputId} className="block text-sm font-medium text-stardust-blue">
              Enter Your Text:
            </Label>
            {isClientMounted && hasRecognitionSupport && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleVoiceInputToggle}
                disabled={isLoading || isProcessingCamera || isRecordingAudio}
                className="text-sm border-slate-600 hover:bg-slate-700"
              >
                {isListening ? <MicOff className="w-4 h-4 mr-2" /> : <Mic className="w-4 h-4 mr-2" />}
                {isListening ? 'Stop' : 'Speak'}
              </Button>
            )}
          </div>
          <Textarea
            id={textInputId}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={isListening ? "Listening..." : "A lonely star in a cold, dark night..."}
            rows={6}
            className="w-full p-4 bg-nebula-gray border border-slate-600 rounded-lg shadow-sm focus:ring-2 focus:ring-primary focus:border-primary transition-colors duration-150 placeholder-slate-400 text-galaxy-white resize-none"
            disabled={isLoading || isListening || isProcessingCamera || isRecordingAudio}
          />
          {speechError && <p className="mt-1 text-xs text-red-400">{speechError}</p>}
          {isClientMounted && !hasRecognitionSupport && <p className="mt-1 text-xs text-muted-foreground">Voice input not supported in your browser.</p>}
          <p className="mt-2 text-xs text-muted-foreground">
            Describe a scene, a feeling, a poem, or a short story. Or use the microphone!
          </p>
        </div>
      )}

      {(currentStandardInputType === 'image' || currentStandardInputType === 'video') && (
        <div className="space-y-4">
          {isClientMounted && navigator.mediaDevices?.getUserMedia && ( 
              <div className="mb-2">
                  <Button
                      type="button"
                      variant="outline"
                      onClick={handleToggleCameraPreview}
                      disabled={isLoading || isProcessingCamera || isRecordingAudio}
                      className="w-full border-stardust-blue text-stardust-blue hover:bg-stardust-blue/10"
                  >
                      {showCameraPreview ? <CameraOff className="w-5 h-5 mr-2" /> : <Camera className="w-5 h-5 mr-2" />}
                      {cameraButtonText}
                  </Button>
              </div>
          )}

          {currentStandardInputType === 'video' && isClientMounted && navigator.mediaDevices?.getUserMedia && !showCameraPreview && (
            <div className="mb-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleToggleAudioRecording}
                disabled={isLoading || isProcessingCamera || showCameraPreview}
                className={`w-full ${isRecordingAudio ? 'border-red-500 text-red-400 hover:bg-red-500/10' : 'border-green-500 text-green-400 hover:bg-green-500/10'}`}
              >
                {isRecordingAudio ? <StopCircle className="w-5 h-5 mr-2" /> : <AudioLines className="w-5 h-5 mr-2" />}
                {isRecordingAudio ? 'Stop Recording Audio' : 'Record Live Audio'}
              </Button>
              {audioError && <p className="mt-1 text-xs text-red-400">{audioError}</p>}
               {hasMicrophonePermission === false && !audioError && <p className="mt-1 text-xs text-muted-foreground">Microphone permission needed.</p>}
            </div>
          )}


          {showCameraPreview && (
              <Card className="bg-nebula-gray/70 border-slate-600 p-4">
                  <video ref={videoRef} className="w-full aspect-video rounded-md bg-slate-800 border border-slate-500" autoPlay muted playsInline />
                  
                  {hasCameraPermission === null && !cameraError && ( 
                      <Alert variant="default" className="mt-3 bg-slate-700 border-slate-600 text-slate-300">
                          <AlertTitle>Camera Access</AlertTitle>
                          <AlertDescription>Requesting camera permission... Please allow access in your browser.</AlertDescription>
                      </Alert>
                  )}
                  {hasCameraPermission === true && !cameraFeedReady && !cameraError && (
                      <p className="text-sm text-stardust-blue text-center mt-2 animate-pulse">Loading video feed...</p>
                  )}
                  {hasCameraPermission === false && cameraError && (
                      <Alert variant="destructive" className="mt-3">
                          <AlertTitle>Camera Error</AlertTitle>
                          <AlertDescription>{cameraError}</AlertDescription>
                      </Alert>
                  )}
                  {hasCameraPermission && currentStandardInputType === 'image' && (
                      <Button
                          type="button"
                          onClick={handleTakePhoto}
                          disabled={isProcessingCamera || isLoading || !hasCameraPermission || !cameraFeedReady || isRecordingAudio}
                          className="w-full mt-3 bg-green-600 hover:bg-green-700 text-primary-foreground disabled:opacity-60"
                      >
                          {isProcessingCamera ? 'Processing...' : 'Take Photo'}
                      </Button>
                  )}
                  {hasCameraPermission && currentStandardInputType === 'video' && (
                      <Button
                          type="button"
                          onClick={handleUseLiveVideoConcept}
                          disabled={isProcessingCamera || isLoading || !hasCameraPermission || !cameraFeedReady || isRecordingAudio}
                          className="w-full mt-3 bg-sky-600 hover:bg-sky-700 text-primary-foreground disabled:opacity-60"
                      >
                          {isProcessingCamera ? 'Processing...' : 'Use Live Video Concept'}
                      </Button>
                  )}
              </Card>
          )}

          {!showCameraPreview && !isRecordingAudio && (
            <div>
                <Label htmlFor={fileInputId} className="block text-sm font-medium text-stardust-blue mb-1">
                Upload {currentStandardInputType === 'image' ? 'Image' : 'Video/Audio'} File:
                </Label>
                <div className="relative">
                <Input
                    id={fileInputId}
                    type="file"
                    accept={currentStandardInputType === 'image' ? 'image/png, image/jpeg, image/gif, image/webp' : 'video/*, audio/*'}
                    onChange={handleFileChange}
                    className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 disabled:opacity-50"
                    disabled={isLoading || isProcessingCamera || isRecordingAudio || showCameraPreview}
                />
                <UploadCloudIcon className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
                </div>
                {currentStandardInputType === 'video' && <p className="mt-2 text-xs text-muted-foreground">Upload a video or audio file (content analyzed conceptually), or record live audio below.</p>}
                {currentStandardInputType === 'image' && <p className="mt-2 text-xs text-muted-foreground">Max file size: {MAX_IMAGE_FILE_SIZE_MB}MB. Supported formats: JPEG, PNG, GIF, WEBP.</p>}
            </div>
          )}

          {fileError && (
            <p className="mt-2 text-sm text-red-400 flex items-center">
              <XCircleIcon className="w-5 h-5 mr-1"/> {fileError}
            </p>
          )}

          {filePreview && !showCameraPreview && ( 
              <Card className="mt-4 bg-nebula-gray border-slate-600">
              <CardHeader className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-medium text-galaxy-white">{filePreview.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">{filePreview.type} - {(filePreview.size / 1024).toFixed(1)} KB</p>
                  </div>
                  <Button type="button" variant="ghost" size="icon" onClick={resetAllMediaInputs} className="text-red-400 hover:text-red-300" aria-label="Remove file">
                      <XCircleIcon className="w-6 h-6"/>
                  </Button>
                </div>
              </CardHeader>
              {currentStandardInputType === 'image' && filePreview.url && filePreview.type.startsWith('image/') && (
                <CardContent className="p-3 pt-0">
                  <img src={filePreview.url} alt="Preview" data-ai-hint="abstract texture" className="mt-2 rounded-md max-h-40 object-contain border border-slate-700" />
                </CardContent>
              )}
              {filePreview.url && filePreview.type.startsWith('audio/') && (
                <CardContent className="p-3 pt-0">
                  <audio controls src={filePreview.url} className="w-full mt-2" />
                  <p className="text-xs text-muted-foreground mt-1">Preview of your live audio recording.</p>
                </CardContent>
              )}
            </Card>
          )}

          {!showCameraPreview && (
            <div>
                <Label htmlFor={additionalContextId} className="block text-sm font-medium text-stardust-blue">
                Additional Context (Optional):
                </Label>
                <Textarea
                id={additionalContextId}
                value={additionalContext}
                onChange={(e) => setAdditionalContext(e.target.value)}
                placeholder={`Describe the ${currentStandardInputType === 'image' ? 'image' : (filePreview?.type.startsWith('audio/') ? 'live audio recording' : 'video/audio concept')} or highlight specific elements...`}
                rows={3}
                className="w-full p-3 mt-1 bg-nebula-gray border border-slate-600 rounded-lg shadow-sm focus:ring-2 focus:ring-primary focus:border-primary transition-colors duration-150 placeholder-slate-400 text-galaxy-white resize-none"
                disabled={isLoading || isProcessingCamera || isRecordingAudio || showCameraPreview}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                Help the AI understand your input better.
                </p>
            </div>
          )}
        </div>
      )}
      
      <Separator className="my-6 bg-slate-700" />

      <div>
        <Label className="block text-lg font-medium text-stardust-blue mb-1">
          2. Fine-tune Mood (Optional):
        </Label>
        <p className="text-xs text-muted-foreground mb-4">Override AI's mood detection if you have a specific feeling in mind.</p>
        <div className="space-y-5">
          <div>
            <div className="flex flex-col items-start sm:flex-row sm:justify-between sm:items-center mb-1 gap-1 sm:gap-0">
              <Label htmlFor={energySliderId} className="text-sm font-medium text-slate-300">
                Energy: <span className="text-xs text-muted-foreground">({energySlider !== 50 ? ((energySlider ?? 50)/10 -5).toFixed(1) : "AI Decides"})</span>
              </Label>
              {energySlider !== 50 && (
                <Button type="button" variant="ghost" size="sm" onClick={resetEnergySlider} className="text-xs h-auto p-1 text-slate-400 hover:text-stardust-blue self-start sm:self-center">
                  <RotateCcw className="w-3 h-3 mr-1" /> Reset
                </Button>
              )}
            </div>
            <Slider
              id={energySliderId}
              min={0} max={100}
              step={1}
              value={[energySlider ?? 50]}
              onValueChange={(value) => setEnergySlider(value[0])}
              className="w-full [&>span>span]:bg-stardust-blue [&>span]:bg-slate-600"
              disabled={isLoading || isProcessingCamera || isRecordingAudio}
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1 px-1">
              <span>Low</span>
              <span>Medium</span>
              <span>High</span>
            </div>
          </div>
          <div>
            <div className="flex flex-col items-start sm:flex-row sm:justify-between sm:items-center mb-1 gap-1 sm:gap-0">
              <Label htmlFor={positivitySliderId} className="text-sm font-medium text-slate-300">
                Positivity: <span className="text-xs text-muted-foreground">({positivitySlider !== 50 ? ((positivitySlider ?? 50)/10 - 5).toFixed(1) : "AI Decides"})</span>
              </Label>
               {positivitySlider !== 50 && (
                <Button type="button" variant="ghost" size="sm" onClick={resetPositivitySlider} className="text-xs h-auto p-1 text-slate-400 hover:text-stardust-blue self-start sm:self-center">
                  <RotateCcw className="w-3 h-3 mr-1" /> Reset
                </Button>
              )}
            </div>
            <Slider
              id={positivitySliderId}
              min={0} max={100}
              step={1}
              value={[positivitySlider ?? 50]}
              onValueChange={(value) => setPositivitySlider(value[0])}
              className="w-full [&>span>span]:bg-primary [&>span]:bg-slate-600"
              disabled={isLoading || isProcessingCamera || isRecordingAudio}
            />
             <div className="flex justify-between text-xs text-muted-foreground mt-1 px-1">
              <span>Negative</span>
              <span>Neutral</span>
              <span>Positive</span>
            </div>
          </div>
        </div>
      </div>

      <Separator className="my-6 bg-slate-700" />
      
      <div>
        <Label htmlFor={genreSelectId + "-standard"} className="block text-lg font-medium text-stardust-blue mb-3">
          3. Select Music Genre (Optional):
        </Label>
        <Select value={selectedGenre} onValueChange={onGenreChange} disabled={isLoading || isProcessingCamera || isRecordingAudio}>
          <SelectTrigger id={genreSelectId + "-standard"} className="w-full p-3 bg-nebula-gray border border-slate-600 rounded-lg shadow-sm focus:ring-2 focus:ring-primary focus:border-primary transition-colors duration-150 text-galaxy-white">
            <SelectValue placeholder="Select a genre" />
          </SelectTrigger>
          <SelectContent className="bg-nebula-gray border-slate-500 text-galaxy-white">
            {MUSIC_GENRES.map(genre => (
              <SelectItem key={genre} value={genre} className="hover:bg-primary/50 focus:bg-primary/60">
                {genre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      <Button
        type="submit"
        disabled={isSubmitDisabled}
        className="w-full text-base font-medium rounded-md shadow-sm text-primary-foreground bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-nebula-dark focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 group"
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
        ) : isProcessingCamera ? (
            <>
             <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-primary-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Processing Camera...
            </>
        ) : isRecordingAudio ? (
             <>
             <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-primary-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Finalizing Audio...
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
