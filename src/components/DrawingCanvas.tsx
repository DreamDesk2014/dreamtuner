
"use client";
import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef, useCallback, useLayoutEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Eraser, Paintbrush, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DrawingCanvasProps {
  backgroundColor?: string;
  isKidsMode?: boolean;
  onDrawingActivity?: (hasContent: boolean) => void;
  canvasContainerClassName?: string;
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
const NOTE_DURATION_MS = 150;
const NOTE_DURATION_MS_WHILE_DRAWING = 100;
const PIXELS_PER_NOTE = 30;

export const DrawingCanvas = forwardRef<
  {
    getDataURL: () => string;
    clearCanvas: () => void;
    getRecordedNotesSequence: () => string[];
  },
  DrawingCanvasProps
>(({ 
    backgroundColor: initialBackgroundColor = '#FFFFFF', 
    isKidsMode = false, 
    onDrawingActivity,
    canvasContainerClassName 
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const [currentColor, setCurrentColor] = useState(DEFAULT_BRUSH_COLOR);
  const [currentLineWidth, setCurrentLineWidth] = useState(DEFAULT_BRUSH_SIZE);
  const [isErasing, setIsErasing] = useState(false);
  
  const pathsRef = useRef<CanvasPath[]>([]);
  const currentPathRef = useRef<CanvasPath | null>(null);
  const backgroundColorRef = useRef(initialBackgroundColor);

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
    backgroundColorRef.current = initialBackgroundColor;
  }, [initialBackgroundColor]);

  useEffect(() => {
    if (onDrawingActivity) {
      const hasContent = pathsRef.current.length > 0 || (currentPathRef.current !== null && currentPathRef.current.points.length > 0);
      onDrawingActivity(hasContent);
    }
  }, [pathsRef.current.length, currentPathRef.current?.points.length, onDrawingActivity]);


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

  const getCanvasContext = useCallback(() => canvasRef.current?.getContext('2d') || null, []);

  const drawPath = useCallback((ctx: CanvasRenderingContext2D, path: CanvasPath) => {
    if (path.points.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(path.points[0].x, path.points[0].y);
    for (let i = 1; i < path.points.length; i++) {
      ctx.lineTo(path.points[i].x, path.points[i].y);
    }
    ctx.strokeStyle = path.isErasing ? backgroundColorRef.current : path.color;
    ctx.lineWidth = path.isErasing ? ERASER_SIZE : path.lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    ctx.globalCompositeOperation = path.isErasing ? 'destination-out' : 'source-over';
    if (path.isErasing) {
      ctx.strokeStyle = "rgba(0,0,0,1)"; // For destination-out to work, stroke must be opaque
    }

    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }, []);


  const redrawCanvas = useCallback(() => {
    const ctx = getCanvasContext();
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!ctx || !canvas || !container) return;

    const logicalWidth = container.offsetWidth;
    const logicalHeight = container.offsetHeight;

    ctx.save();
    // If context is already scaled, we might not need to scale again here unless clearing transform
    // However, the scale is set in useLayoutEffect, so it should be fine for redraws.
    // If not, ensure transform is reset before fillRect if scale is applied per draw operation.
    // ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0); // Reset and apply DPR scale

    ctx.fillStyle = backgroundColorRef.current;
    ctx.fillRect(0, 0, logicalWidth, logicalHeight);

    pathsRef.current.forEach(p => drawPath(ctx, p));
    if (currentPathRef.current) {
      drawPath(ctx, currentPathRef.current);
    }
    ctx.restore();
  }, [getCanvasContext, drawPath]);
  
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let animationFrameId: number;

    const handleResize = () => {
      // Debounce or throttle resize if performance becomes an issue
      cancelAnimationFrame(animationFrameId);
      animationFrameId = requestAnimationFrame(() => {
        const { width: logicalWidth, height: logicalHeight } = container.getBoundingClientRect();
        
        if (logicalWidth === 0 || logicalHeight === 0) return;

        const scale = window.devicePixelRatio || 1;
        canvas.width = Math.floor(logicalWidth * scale);
        canvas.height = Math.floor(logicalHeight * scale);

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.save();
          ctx.scale(scale, scale);
          // Redraw content after scaling context
          // Ensure redrawCanvas uses logicalWidth & logicalHeight for its operations
          const currentCtx = getCanvasContext(); // Re-get context if necessary
          if(currentCtx) { // Check if context is still valid
            currentCtx.fillStyle = backgroundColorRef.current;
            currentCtx.fillRect(0, 0, logicalWidth, logicalHeight);
            pathsRef.current.forEach(p => drawPath(currentCtx, p));
            if (currentPathRef.current) {
                drawPath(currentCtx, currentPathRef.current);
            }
          }
          ctx.restore();
        }
      });
    };

    const observer = new ResizeObserver(handleResize);
    observer.observe(container);
    handleResize(); // Initial setup

    return () => {
      observer.unobserve(container);
      cancelAnimationFrame(animationFrameId);
    };
  }, [getCanvasContext, drawPath]); // backgroundColorRef, pathsRef, currentPathRef are refs, don't need to be deps


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

  const startDrawing = (eventX: number, eventY: number) => {
    const ctx = getCanvasContext();
    if(!ctx) return;

    setIsDrawing(true);
    const currentPoint = { x: eventX, y: eventY };
    lastPointRef.current = currentPoint;
    distanceSinceLastNoteRef.current = 0;

    const newPathColor = isErasing ? backgroundColorRef.current : currentColor;
    activeStrokeColorRef.current = newPathColor;

    const newPath: CanvasPath = {
      points: [currentPoint],
      color: newPathColor,
      lineWidth: isErasing ? ERASER_SIZE : currentLineWidth,
      isErasing: isErasing,
    };
    currentPathRef.current = newPath;

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
    if (!isDrawing || !currentPathRef.current) return;
    const ctx = getCanvasContext();
    if(!ctx) return;

    const currentPoint = { x: eventX, y: eventY };
    
    currentPathRef.current.points.push(currentPoint);
    // Redraw only the current path for performance during mouse move. Full redraw on stop.
    // Or, for simplicity and given DPR scaling, a full redraw might be okay.
    // Let's try drawing just the last segment of currentPath for performance.
    // For simplicity, we'll redraw the whole current path on the existing canvas content.
    // The useLayoutEffect handles the full redraw on resize.
    
    // This direct draw needs to happen on the already scaled context.
    ctx.save();
    // If scale is applied once in useLayoutEffect, no need to rescale here.
    // ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
    drawPath(ctx, currentPathRef.current);
    ctx.restore();


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
    if (isDrawing && currentPathRef.current && currentPathRef.current.points.length > 1) {
      pathsRef.current = [...pathsRef.current, currentPathRef.current];
    }
    currentPathRef.current = null;
    setIsDrawing(false);
    lastPointRef.current = null;
    activeStrokeColorRef.current = null;
    distanceSinceLastNoteRef.current = 0;
    redrawCanvas(); // Ensure final path is on canvas
    if (onDrawingActivity) onDrawingActivity(pathsRef.current.length > 0);
  };

  const getRelativeCoords = (event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();

    let clientX, clientY;
    if ('touches' in event) {
        clientX = event.touches[0].clientX;
        clientY = event.touches[0].clientY;
    } else {
        clientX = event.clientX;
        clientY = event.clientY;
    }
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const handleMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getRelativeCoords(event);
    startDrawing(x, y);
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const { x, y } = getRelativeCoords(event);
    draw(x, y);
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLCanvasElement>) => {
    if (event.touches.length === 0) return;
    const { x, y } = getRelativeCoords(event);
    startDrawing(x, y);
    event.preventDefault();
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || event.touches.length === 0) return;
    const { x, y } = getRelativeCoords(event);
    draw(x, y);
    event.preventDefault();
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLCanvasElement>) => {
    stopDrawing();
    event.preventDefault();
  };

  const clearCanvas = () => {
    pathsRef.current = [];
    currentPathRef.current = null;
    const ctx = getCanvasContext();
    const container = containerRef.current;
    if (ctx && canvasRef.current && container) {
      const logicalWidth = container.offsetWidth;
      const logicalHeight = container.offsetHeight;
      ctx.save();
      // ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1); // Already scaled by useLayoutEffect
      ctx.fillStyle = backgroundColorRef.current;
      ctx.fillRect(0, 0, logicalWidth, logicalHeight);
      ctx.restore();
    }
    if (isKidsMode) {
      setRecordedNotesSequence([]);
      setLastPlayedColorForSound(null);
    }
    lastPointRef.current = null;
    activeStrokeColorRef.current = null;
    distanceSinceLastNoteRef.current = 0;
    if (isDrawing) setIsDrawing(false);
    if (onDrawingActivity) onDrawingActivity(false);
  };

  const toggleEraser = () => {
    setIsErasing(!isErasing);
    if (isDrawing) stopDrawing(); 
  };

  useImperativeHandle(ref, () => ({
    getDataURL: () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return 'data:,';
      
      const logicalWidth = container.offsetWidth;
      const logicalHeight = container.offsetHeight;

      // Create a temporary canvas to draw scaled content for export
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = logicalWidth; // Export at logical dimensions
      tempCanvas.height = logicalHeight;
      const tempCtx = tempCanvas.getContext('2d');

      if (!tempCtx) return 'data:,';

      tempCtx.fillStyle = backgroundColorRef.current;
      tempCtx.fillRect(0, 0, logicalWidth, logicalHeight);
      
      // Draw paths without DPR scaling for export, as points are already logical
      pathsRef.current.forEach(p => drawPath(tempCtx, p));
      if (currentPathRef.current && currentPathRef.current.points.length > 1) {
         drawPath(tempCtx, currentPathRef.current)
      }
      return tempCanvas.toDataURL('image/png');
    },
    clearCanvas,
    getRecordedNotesSequence: () => recordedNotesSequence,
  }));


  return (
    <div className="flex flex-col items-center space-y-4 w-full">
       <div 
        ref={containerRef} 
        className={cn(
          "w-full relative border border-slate-400 rounded-md shadow-lg overflow-hidden", // Added overflow-hidden
          canvasContainerClassName
        )}
        style={{ backgroundColor: backgroundColorRef.current }}
      >
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing} 
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{ 
              display: 'block',
              width: '100%', 
              height: '100%',
              cursor: 'crosshair',
          }}
        />
      </div>
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

