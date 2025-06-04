
"use client";
import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef } from 'react';
import { Button } from '@/components/ui/button';
import { Eraser, Paintbrush, Trash2 } from 'lucide-react';

interface DrawingCanvasProps {
  width: number;
  height: number;
  backgroundColor?: string;
  isKidsMode?: boolean; // New prop
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
// Eraser color will be the background color
const ERASER_SIZE = 20;

const COLOR_TO_NOTE_MAP: Record<string, { frequency: number; name: string }> = {
  '#000000': { frequency: 261.63, name: 'C4' }, // Black
  '#FF0000': { frequency: 293.66, name: 'D4' }, // Red
  '#FFFF00': { frequency: 329.63, name: 'E4' }, // Yellow
  '#00FF00': { frequency: 349.23, name: 'F4' }, // Green
  '#0000FF': { frequency: 392.00, name: 'G4' }, // Blue
};
const NOTE_DURATION_MS = 150;

export const DrawingCanvas = forwardRef<
  {
    getDataURL: () => string;
    clearCanvas: () => void;
    getRecordedNotesSequence: () => string[];
  },
  DrawingCanvasProps
>(({ width, height, backgroundColor = '#FFFFFF', isKidsMode = false }, ref) => {
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

  const colors = [
    { name: 'Black', value: '#000000' },
    { name: 'Red', value: '#FF0000' },
    { name: 'Yellow', value: '#FFFF00' },
    { name: 'Green', value: '#00FF00' },
    { name: 'Blue', value: '#0000FF' },
  ];

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

  const playToneForColor = (color: string) => {
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
    gainNode.gain.setValueAtTime(0.2, audioContextRef.current.currentTime); // Reduced volume
    gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContextRef.current.currentTime + NOTE_DURATION_MS / 1000);

    oscillator.connect(gainNode);
    gainNode.connect(audioContextRef.current.destination);

    oscillator.start();
    oscillator.stop(audioContextRef.current.currentTime + NOTE_DURATION_MS / 1000);

    setRecordedNotesSequence(prev => [...prev, noteDetails.name]);
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
    ctx.strokeStyle = path.isErasing ? backgroundColor : path.color; // Eraser uses background color
    ctx.lineWidth = path.isErasing ? ERASER_SIZE : path.lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Set composite operation for erasing vs drawing
    ctx.globalCompositeOperation = path.isErasing ? 'destination-out' : 'source-over';
    if (path.isErasing) { // For destination-out to work on clear background, ensure alpha is used if not fully opaque
      ctx.strokeStyle = "rgba(0,0,0,1)"; // Use an opaque color for destination-out
    }


    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over'; // Reset for next path
  };

  const startDrawing = (eventX: number, eventY: number) => {
    setIsDrawing(true);
    const newPathColor = isErasing ? backgroundColor : currentColor;
    const newPath: CanvasPath = {
      points: [{ x: eventX, y: eventY }],
      color: newPathColor,
      lineWidth: isErasing ? ERASER_SIZE : currentLineWidth,
      isErasing: isErasing,
    };
    setCurrentPath(newPath);

    if (isKidsMode && !isErasing) {
      if (currentColor !== lastPlayedColorForSound || recordedNotesSequence.length === 0) {
        playToneForColor(currentColor);
        setLastPlayedColorForSound(currentColor);
      }
    }
  };

  const draw = (eventX: number, eventY: number) => {
    if (!isDrawing || !currentPath) return;
    const newPoints = [...currentPath.points, { x: eventX, y: eventY }];
    const updatedPath = { ...currentPath, points: newPoints };
    setCurrentPath(updatedPath);
  };

  const stopDrawing = () => {
    if (isDrawing && currentPath && currentPath.points.length > 1) {
      setPaths(prevPaths => [...prevPaths, currentPath]);
    }
    setCurrentPath(null);
    setIsDrawing(false);
  };

  const handleMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    startDrawing(event.clientX - rect.left, event.clientY - rect.top);
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !isDrawing) return;
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
    if (!rect || event.touches.length === 0 || !isDrawing) return;
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
  };

  const toggleEraser = () => {
    setIsErasing(!isErasing);
  };

  useImperativeHandle(ref, () => ({
    getDataURL: () => {
      const canvas = canvasRef.current;
      if (!canvas) return 'data:,';
      
      // Create a temporary canvas to draw final state for export
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tempCtx = tempCanvas.getContext('2d');

      if (!tempCtx) return 'data:,';

      // Draw background
      tempCtx.fillStyle = backgroundColor;
      tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
      
      // Scale context if needed (mirroring main canvas scaling)
      const scale = window.devicePixelRatio || 1;
      tempCtx.scale(scale, scale);


      // Draw paths on temporary canvas
      paths.forEach(p => drawPath(tempCtx, p));
      if (currentPath && currentPath.points.length > 1) {
         // Temporarily add currentPath to paths for drawing, then remove if not stopping
         // Or just draw it directly if it's substantial
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
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        const scale = window.devicePixelRatio || 1;
        canvas.width = Math.floor(width * scale);
        canvas.height = Math.floor(height * scale);
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.scale(scale, scale);
            // Initial clear to background color
            ctx.fillStyle = backgroundColor;
            ctx.fillRect(0, 0, width, height);
            redrawCanvas();
        }
    }
  }, [width, height, backgroundColor]);
  
  // Adjust eraser logic for `destination-out`
  // In drawPath:
  // if (path.isErasing) {
  //   ctx.globalCompositeOperation = 'destination-out';
  // //  ctx.strokeStyle = "rgba(0,0,0,1)"; // Any opaque color works here, actual color doesn't matter
  // } else {
  //   ctx.globalCompositeOperation = 'source-over';
  //   ctx.strokeStyle = path.color;
  // }
  // The current redrawCanvas and drawPath structure is complex for `destination-out` because paths are redrawn.
  // For simplicity, if backgroundColor is white, drawing white is okay. If it's complex, `destination-out` needs careful handling.
  // Given it's '#FFFFFF' by default, drawing with backgroundColor is visually correct.
  // The export getDataURL needed fix for correct rendering of currentPath.

  return (
    <div className="flex flex-col items-center space-y-4">
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={stopDrawing}
        onMouseOut={stopDrawing}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="border border-slate-400 rounded-md shadow-lg cursor-crosshair"
        style={{ backgroundColor: backgroundColor }} // Explicitly set style for visual cue
      />
      <div className="flex space-x-2 items-center">
        {colors.map(color => (
          <Button
            key={color.name}
            variant="outline"
            size="icon"
            onClick={() => {
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
