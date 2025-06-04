
"use client";
import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef } from 'react';
import { Button } from '@/components/ui/button';
import { Eraser, Paintbrush, Trash2 } from 'lucide-react';

interface DrawingCanvasProps {
  width: number;
  height: number;
  backgroundColor?: string;
  isKidsMode?: boolean;
  onDrawingActivity?: (hasContent: boolean) => void;
}

interface CanvasPoint {
  x: number;
  y: number;
}

interface CanvasPath {
  points: CanvasPoint[];
  color: string;
  lineWidth: number;
  isErasing: boolean;
}

const DEFAULT_BRUSH_COLOR = '#000000';
const DEFAULT_BRUSH_SIZE = 5;
const ERASER_SIZE = 20;

const COLOR_TO_NOTE_MAP: Record<string, { frequency: number; name: string }> = {
  '#000000': { frequency: 261.63, name: 'C4' }, // Black
  '#FF0000': { frequency: 293.66, name: 'D4' }, // Red
  '#FFFF00': { frequency: 329.63, name: 'E4' }, // Yellow
  '#00FF00': { frequency: 349.23, name: 'F4' }, // Green
  '#0000FF': { frequency: 392.00, name: 'G4' }, // Blue
};
const NOTE_DURATION_MS = 150; // Duration for the initial note when a color is selected
const NOTE_DURATION_MS_WHILE_DRAWING = 100; // Shorter duration for notes played during a stroke
const PIXELS_PER_NOTE = 30; // Play a note every X pixels drawn during a stroke

export const DrawingCanvas = forwardRef<
  {
    getDataURL: () => string;
    clearCanvas: () => void;
    getRecordedNotesSequence: () => string[];
  },
  DrawingCanvasProps
>(({ width, height, backgroundColor = '#FFFFFF', isKidsMode = false, onDrawingActivity }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentColor, setCurrentColor] = useState(DEFAULT_BRUSH_COLOR);
  const [currentLineWidth, setCurrentLineWidth] = useState(DEFAULT_BRUSH_SIZE);
  const [isErasing, setIsErasing] = useState(false);
  const [paths, setPaths] = useState<CanvasPath[]>([]);
  const [currentPath, setCurrentPath] = useState<CanvasPath | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const [lastPlayedColorForSound, setLastPlayedColorForSound] = useState<string | null>(null);
  const [recordedNotesSequence, setRecordedNotesSequence] = useState<string[]>([]);

  const lastPointRef = useRef<CanvasPoint | null>(null);
  const distanceSinceLastNoteRef = useRef(0);
  const activeStrokeColorRef = useRef<string | null>(null);


  const colors = [
    { name: 'Black', value: '#000000' },
    { name: 'Red', value: '#FF0000' },
    { name: 'Yellow', value: '#FFFF00' },
    { name: 'Green', value: '#00FF00' },
    { name: 'Blue', value: '#0000FF' },
  ];

  useEffect(() => {
    if (onDrawingActivity) {
      const hasContent = paths.length > 0 || (currentPath !== null && currentPath.points.length > 0);
      onDrawingActivity(hasContent);
    }
  }, [paths, currentPath, onDrawingActivity]);

  useEffect(() => {
    if (isKidsMode && typeof window !== 'undefined' && !audioContextRef.current) {
      try {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch (e) {
        console.error("Failed to create AudioContext:", e);
      }
    }
    return () => {
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(console.error);
        audioContextRef.current = null;
      }
    };
  }, [isKidsMode]);

  const playToneForColor = (color: string, durationMs: number = NOTE_DURATION_MS) => {
    if (!isKidsMode || !audioContextRef.current) return;

    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().catch(e => console.error("Error resuming AudioContext:", e));
    }
    if (audioContextRef.current.state !== 'running') return;

    const noteDetails = COLOR_TO_NOTE_MAP[color];
    if (!noteDetails) return;

    const oscillator = audioContextRef.current.createOscillator();
    const gainNode = audioContextRef.current.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(noteDetails.frequency, audioContextRef.current.currentTime);
    gainNode.gain.setValueAtTime(0.2, audioContextRef.current.currentTime); 
    gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContextRef.current.currentTime + durationMs / 1000);

    oscillator.connect(gainNode);
    gainNode.connect(audioContextRef.current.destination);

    oscillator.start();
    oscillator.stop(audioContextRef.current.currentTime + durationMs / 1000);
  };

  const getCanvasContext = () => canvasRef.current?.getContext('2d') || null;

  const redrawCanvas = () => {
    const ctx = getCanvasContext();
    if (!ctx || !canvasRef.current) return;

    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);

    paths.forEach(path => drawPath(ctx, path));
    if (currentPath) {
      drawPath(ctx, currentPath);
    }
  };

  useEffect(() => {
    redrawCanvas();
  }, [paths, backgroundColor, width, height, currentPath]);

  const drawPath = (ctx: CanvasRenderingContext2D, path: CanvasPath) => {
    if (path.points.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(path.points[0].x, path.points[0].y);
    for (let i = 1; i < path.points.length; i++) {
      ctx.lineTo(path.points[i].x, path.points[i].y);
    }
    ctx.strokeStyle = path.isErasing ? backgroundColor : path.color;
    ctx.lineWidth = path.isErasing ? ERASER_SIZE : path.lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    ctx.globalCompositeOperation = path.isErasing ? 'destination-out' : 'source-over';
    if (path.isErasing) {
      ctx.strokeStyle = "rgba(0,0,0,1)";
    }

    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  };

  const startDrawing = (eventX: number, eventY: number) => {
    setIsDrawing(true);
    const currentPoint = { x: eventX, y: eventY };
    lastPointRef.current = currentPoint;
    distanceSinceLastNoteRef.current = 0;

    const newPathColor = isErasing ? backgroundColor : currentColor;
    activeStrokeColorRef.current = newPathColor;

    const newPath: CanvasPath = {
      points: [currentPoint],
      color: newPathColor,
      lineWidth: isErasing ? ERASER_SIZE : currentLineWidth,
      isErasing: isErasing,
    };
    setCurrentPath(newPath);

    if (isKidsMode && !isErasing) {
      if (currentColor !== lastPlayedColorForSound || recordedNotesSequence.length === 0) {
        playToneForColor(currentColor, NOTE_DURATION_MS); 
        const noteDetails = COLOR_TO_NOTE_MAP[currentColor];
        if (noteDetails) {
            setRecordedNotesSequence(prev => [...prev, noteDetails.name]);
        }
        setLastPlayedColorForSound(currentColor);
      }
    }
  };

  const draw = (eventX: number, eventY: number) => {
    if (!isDrawing || !currentPath) return;
    const currentPoint = { x: eventX, y: eventY };
    
    const newPoints = [...currentPath.points, currentPoint];
    const updatedPath = { ...currentPath, points: newPoints };
    setCurrentPath(updatedPath);

    if (isKidsMode && !isErasing && isDrawing && lastPointRef.current && activeStrokeColorRef.current) {
        const dx = currentPoint.x - lastPointRef.current.x;
        const dy = currentPoint.y - lastPointRef.current.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        distanceSinceLastNoteRef.current += dist;

        if (distanceSinceLastNoteRef.current >= PIXELS_PER_NOTE) {
            playToneForColor(activeStrokeColorRef.current, NOTE_DURATION_MS_WHILE_DRAWING);
            distanceSinceLastNoteRef.current = 0; 
        }
    }
    lastPointRef.current = currentPoint;
  };

  const stopDrawing = () => {
    if (isDrawing && currentPath && currentPath.points.length > 1) {
      setPaths(prevPaths => [...prevPaths, currentPath]);
    }
    setCurrentPath(null);
    setIsDrawing(false);
    lastPointRef.current = null;
    activeStrokeColorRef.current = null;
    distanceSinceLastNoteRef.current = 0;
  };

  const handleMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    startDrawing(event.clientX - rect.left, event.clientY - rect.top);
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !isDrawing) return; // Ensure isDrawing is checked
    draw(event.clientX - rect.left, event.clientY - rect.top);
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || event.touches.length === 0) return;
    const touch = event.touches[0];
    startDrawing(touch.clientX - rect.left, touch.clientY - rect.top);
    event.preventDefault();
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || event.touches.length === 0 || !isDrawing) return; // Ensure isDrawing is checked
    const touch = event.touches[0];
    draw(touch.clientX - rect.left, touch.clientY - rect.top);
    event.preventDefault();
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLCanvasElement>) => {
    stopDrawing();
    event.preventDefault();
  };

  const clearCanvas = () => {
    setPaths([]);
    setCurrentPath(null);
    const ctx = getCanvasContext();
    if (ctx && canvasRef.current) {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
    if (isKidsMode) {
      setRecordedNotesSequence([]);
      setLastPlayedColorForSound(null);
    }
    // Reset drawing state refs
    lastPointRef.current = null;
    activeStrokeColorRef.current = null;
    distanceSinceLastNoteRef.current = 0;
    if (isDrawing) setIsDrawing(false); // Ensure drawing state is also reset if clear is called mid-draw
  };

  const toggleEraser = () => {
    setIsErasing(!isErasing);
    // If switching to eraser mid-draw, stop current sound/stroke logic
    if (isDrawing) stopDrawing(); 
  };

  useImperativeHandle(ref, () => ({
    getDataURL: () => {
      const canvas = canvasRef.current;
      if (!canvas) return 'data:,';
      
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tempCtx = tempCanvas.getContext('2d');

      if (!tempCtx) return 'data:,';

      tempCtx.fillStyle = backgroundColor;
      tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
      
      paths.forEach(p => drawPath(tempCtx, p));
      // If there's a current path being drawn but not yet committed to `paths`
      if (currentPath && currentPath.points.length > 1) {
         drawPath(tempCtx, currentPath)
      }
      return tempCanvas.toDataURL('image/png');
    },
    clearCanvas,
    getRecordedNotesSequence: () => recordedNotesSequence,
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
        // Physical size on screen
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        
        // Resolution considering device pixel ratio
        const scale = window.devicePixelRatio || 1;
        canvas.width = Math.floor(width * scale);
        canvas.height = Math.floor(height * scale);
        
        const ctx = canvas.getContext('2d');
        if (ctx) {
            // Scale the drawing context to match the DPR
            ctx.scale(scale, scale);
            
            // Initial clear to background color, using unscaled width/height for fillRect
            ctx.fillStyle = backgroundColor;
            ctx.fillRect(0, 0, width, height); 
            redrawCanvas(); // Redraw existing paths
        }
    }
  }, [width, height, backgroundColor]); 

  return (
    <div className="flex flex-col items-center space-y-4">
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing} 
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="border border-slate-400 rounded-md shadow-lg cursor-crosshair"
        style={{ backgroundColor: backgroundColor }} 
      />
      <div className="flex space-x-2 items-center">
        {colors.map(color => (
          <Button
            key={color.name}
            variant="outline"
            size="icon"
            onClick={() => {
              if (isDrawing) stopDrawing(); 
              setIsErasing(false);
              setCurrentColor(color.value);
              setCurrentLineWidth(DEFAULT_BRUSH_SIZE);
            }}
            className={`w-8 h-8 rounded-full border-2 ${currentColor === color.value && !isErasing ? 'ring-2 ring-offset-2 ring-accent' : 'border-gray-300'}`}
            style={{ backgroundColor: color.value }}
            aria-label={`Select color ${color.name}`}
          >
            {currentColor === color.value && !isErasing && <Paintbrush className="w-4 h-4 text-white mix-blend-difference" />}
          </Button>
        ))}
        <Button
          variant="outline"
          size="icon"
          onClick={toggleEraser}
          className={`p-2 ${isErasing ? 'bg-accent text-accent-foreground' : ''}`}
          aria-label={isErasing ? "Switch to Brush" : "Switch to Eraser"}
        >
          <Eraser className="w-5 h-5" />
        </Button>
        <Button
          variant="outline"
          onClick={clearCanvas}
          className="p-2"
          aria-label="Clear Canvas"
        >
          <Trash2 className="w-5 h-5 mr-1 sm:mr-2" /> Clear
        </Button>
      </div>
    </div>
  );
});

DrawingCanvas.displayName = 'DrawingCanvas';
