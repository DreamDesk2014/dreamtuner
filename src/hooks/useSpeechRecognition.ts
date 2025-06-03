
"use client";
import { useState, useEffect, useCallback, useRef } from 'react';

interface SpeechRecognitionHook {
  transcript: string;
  interimTranscript: string;
  isListening: boolean;
  startListening: () => void;
  stopListening: () => void;
  hasRecognitionSupport: boolean;
  error: string | null;
  resetTranscript: () => void;
}

const useSpeechRecognition = (): SpeechRecognitionHook => {
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const hasRecognitionSupport = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  useEffect(() => {
    if (!hasRecognitionSupport) {
      setError('Speech recognition is not supported in this browser.');
      return;
    }

    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
        setError('Speech recognition API not found in this browser.');
        return;
    }
    
    recognitionRef.current = new SpeechRecognitionAPI();
    const recognition = recognitionRef.current;

    recognition.continuous = true; // Keep listening even after a pause in speech
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscriptChunk = '';
      let currentInterim = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcriptPiece = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscriptChunk += transcriptPiece;
        } else {
          currentInterim += transcriptPiece;
        }
      }
      if (finalTranscriptChunk) {
        setTranscript(prev => prev + finalTranscriptChunk + ' '); // Add space after final chunk
      }
      setInterimTranscript(currentInterim);
    };

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
      setInterimTranscript(''); 
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimTranscript('');
      // User controls restarting, no automatic restart here.
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'no-speech') {
        setError('No speech detected. Please try speaking a bit louder or clearer.');
      } else if (event.error === 'audio-capture') {
        setError('Microphone not available or permission denied. Please check your microphone setup.');
      } else if (event.error === 'not-allowed') {
        setError('Microphone permission was denied. Please enable it in your browser settings and refresh the page.');
      } else if (event.error === 'network') {
        setError('Network error during speech recognition. Please check your internet connection.');
      }
      else {
        setError(`Speech recognition error: ${event.error}`);
      }
      setIsListening(false);
    };

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current.onresult = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onstart = null;
      }
    };
  }, [hasRecognitionSupport]);

  const startListening = useCallback(() => {
    if (recognitionRef.current && !isListening) {
      setTranscript(''); 
      setInterimTranscript('');
      setError(null);
      try {
        recognitionRef.current.start();
      } catch (e: any) {
        setError(`Failed to start: ${e.message}. Ensure microphone permission is granted.`);
        setIsListening(false);
      }
    }
  }, [isListening]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
    }
  }, [isListening]);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
    setError(null);
  }, []);


  return {
    transcript,
    interimTranscript,
    isListening,
    startListening,
    stopListening,
    hasRecognitionSupport,
    error,
    resetTranscript
  };
};

export default useSpeechRecognition;
