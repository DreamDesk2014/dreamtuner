
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
    initialBackgroundColor = '#FFFFFF', 
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

  const getCanvasContext = useCallback(() => canvasRef.current?.getContext('2d') || null, []);

  const drawPath = useCallback((ctx: CanvasRenderingContext2D, path: CanvasPath) => {
    if (path.points.length === 0) return;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = path.isErasing ? ERASER_SIZE : path.lineWidth;
    ctx.strokeStyle = path.isErasing ? backgroundColorRef.current : path.color;
    ctx.globalCompositeOperation = path.isErasing ? 'destination-out' : 'source-over';
    
    if (path.isErasing && ctx.strokeStyle === backgroundColorRef.current) {
        // For eraser, ensure it "clears" to transparent if background is not opaque, or to bg color
        // This is a complex topic if full transparency is needed. For now, "destination-out" is primary.
        // Setting strokeStyle to black for destination-out is common practice.
        ctx.strokeStyle = "rgba(0,0,0,1)";
    }


    if (path.points.length === 1) { // Draw a dot
      const point = path.points[0];
      ctx.beginPath();
      ctx.arc(point.x, point.y, ctx.lineWidth / 2, 0, 2 * Math.PI);
      ctx.fillStyle = path.isErasing ? backgroundColorRef.current : path.color; // Eraser dot uses bg color
      if (path.isErasing) { // For eraser dot, fill with background
          ctx.globalCompositeOperation = 'source-over'; // Temporarily switch to draw bg color
          ctx.fillStyle = backgroundColorRef.current;
          ctx.fill();
          ctx.globalCompositeOperation = 'destination-out'; // Switch back if needed for future strokes
      } else {
          ctx.fill();
      }
      return;
    }

    ctx.beginPath();
    ctx.moveTo(path.points[0].x, path.points[0].y);
    for (let i = 1; i < path.points.length; i++) {
      ctx.lineTo(path.points[i].x, path.points[i].y);
    }
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over'; // Reset composite operation
  }, []); 

  const redrawCanvas = useCallback(() => {
    const ctx = getCanvasContext();
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!ctx || !canvas || !container) return;

    const { width: physicalWidth, height: physicalHeight } = canvas;
    
    ctx.save();
    // Reset transform to identity for clearing
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // Use the DPR for transform
    
    // Clear with logical coordinates
    ctx.fillStyle = backgroundColorRef.current;
    ctx.fillRect(0, 0, physicalWidth/dpr, physicalHeight/dpr);

    pathsRef.current.forEach(p => drawPath(ctx, p));
    if (currentPathRef.current && currentPathRef.current.points.length > 0) {
      drawPath(ctx, currentPathRef.current);
    }
    ctx.restore(); // Restore after drawing everything, including the transform
  }, [getCanvasContext, drawPath]);
  
  useEffect(() => {
    backgroundColorRef.current = initialBackgroundColor;
    redrawCanvas();
  }, [initialBackgroundColor]); // Dependency only on initialBackgroundColor

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
  
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let animationFrameId: number;

    const handleResize = () => {
      // Cancel any pending animation frame to avoid multiple resizes/redraws
      cancelAnimationFrame(animationFrameId);
      animationFrameId = requestAnimationFrame(() => {
        const { width: logicalWidth, height: logicalHeight } = container.getBoundingClientRect();
        
        if (logicalWidth === 0 || logicalHeight === 0) return; // Avoid issues if container is hidden

        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(logicalWidth * dpr);
        canvas.height = Math.floor(logicalHeight * dpr);

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // Apply persistent scaling
          redrawCanvas(); 
        }
      });
    };

    const observer = new ResizeObserver(handleResize);
    observer.observe(container);
    handleResize(); // Initial size setup

    return () => {
      observer.unobserve(container);
      cancelAnimationFrame(animationFrameId); // Cleanup on unmount
    };
  }, [redrawCanvas]); // redrawCanvas is stable due to its own useCallback dependencies


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
      points: [currentPoint], // Start with a single point for dot drawing
      color: newPathColor,
      lineWidth: isErasing ? ERASER_SIZE : currentLineWidth,
      isErasing: isErasing,
    };
    currentPathRef.current = newPath;
    
    // Draw the initial point/dot immediately
    drawPath(ctx, newPath);

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
    if (!isDrawing || !currentPathRef.current || !lastPointRef.current) return;
    const ctx = getCanvasContext();
    if(!ctx) return;

    const currentPoint = { x: eventX, y: eventY };
    
    // Draw only the new segment
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = currentPathRef.current.isErasing ? ERASER_SIZE : currentPathRef.current.lineWidth;
    ctx.strokeStyle = currentPathRef.current.isErasing ? backgroundColorRef.current : currentPathRef.current.color;
    ctx.globalCompositeOperation = currentPathRef.current.isErasing ? 'destination-out' : 'source-over';
    
    if (currentPathRef.current.isErasing && ctx.strokeStyle === backgroundColorRef.current) {
      ctx.strokeStyle = "rgba(0,0,0,1)"; // For destination-out eraser
    }

    ctx.beginPath();
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    ctx.lineTo(currentPoint.x, currentPoint.y);
    ctx.stroke();
    ctx.restore(); // Restore to base scaled state

    currentPathRef.current.points.push(currentPoint); 

    if (isKidsMode && !isErasing && activeStrokeColorRef.current) {
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
    if (isDrawing && currentPathRef.current && currentPathRef.current.points.length > 0) { 
      // If it was just a dot (single point), it's already drawn by startDrawing.
      // If it was a line, currentPathRef already contains all points.
      pathsRef.current = [...pathsRef.current, currentPathRef.current];
    }
    currentPathRef.current = null;
    setIsDrawing(false);
    lastPointRef.current = null;
    activeStrokeColorRef.current = null;
    distanceSinceLastNoteRef.current = 0;
    // redrawCanvas(); // No need to redraw full canvas here if segments were drawn, unless clearing currentPath display
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
    // No need to scale by DPR here, as event coordinates are already in CSS pixels
    // And our canvas drawing operations are on a context scaled by DPR.
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
  
  const handleMouseLeave = () => { // Ensure drawing stops if mouse leaves canvas
    if (isDrawing) {
      stopDrawing();
    }
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLCanvasElement>) => {
    if (event.touches.length === 0) return;
    event.preventDefault(); // Still good for preventing unwanted default touch actions
    const { x, y } = getRelativeCoords(event);
    startDrawing(x, y);
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || event.touches.length === 0) return;
    event.preventDefault();
    const { x, y } = getRelativeCoords(event);
    draw(x, y);
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    stopDrawing();
  };

  const clearCanvas = useCallback(() => {
    pathsRef.current = [];
    currentPathRef.current = null;
    redrawCanvas(); 
    
    if (isKidsMode) {
      setRecordedNotesSequence([]);
      setLastPlayedColorForSound(null);
    }
    lastPointRef.current = null;
    activeStrokeColorRef.current = null;
    distanceSinceLastNoteRef.current = 0;
    if (isDrawing) setIsDrawing(false); // Ensure drawing state is reset
    if (onDrawingActivity) onDrawingActivity(false);
  }, [redrawCanvas, isKidsMode, onDrawingActivity, isDrawing]); // Added isDrawing

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

      const tempCanvas = document.createElement('canvas');
      // For getDataURL, we want the logical size, not DPR scaled physical size,
      // unless the consumer expects a high-res image. For now, logical is fine.
      tempCanvas.width = logicalWidth; 
      tempCanvas.height = logicalHeight;
      const tempCtx = tempCanvas.getContext('2d');

      if (!tempCtx) return 'data:,';

      // Draw with original background color on temp canvas
      tempCtx.fillStyle = backgroundColorRef.current;
      tempCtx.fillRect(0, 0, logicalWidth, logicalHeight);
      
      // Draw paths onto the temp canvas (these paths are in logical coords)
      pathsRef.current.forEach(p => drawPath(tempCtx, p));
      // If a path is currently being drawn, include it too.
      if (currentPathRef.current && currentPathRef.current.points.length > 0) {
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
          "w-full relative border border-slate-400 rounded-md shadow-lg overflow-hidden", 
          canvasContainerClassName
        )}
        style={{ backgroundColor: backgroundColorRef.current }} 
      >
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={stopDrawing}
          onMouseLeave={handleMouseLeave} 
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{ 
              display: 'block',
              width: '100%', 
              height: '100%',
              cursor: 'crosshair',
              touchAction: 'none', 
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
