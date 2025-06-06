
"use client";
import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef, useCallback, useLayoutEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Eraser, Paintbrush, Trash2, Minus, Plus, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DrawingCanvasProps {
  initialBackgroundColor?: string; 
  isKidsMode?: boolean;
  onDrawingActivity?: (hasContent: boolean) => void;
  canvasContainerClassName?: string;
  onColorChange?: (color: string) => void; // Callback for color change
  onClearCanvas?: () => void; // Callback for clear action
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
const ERASER_SIZE = 20;
const BRUSH_SIZES = { Small: 5, Medium: 10, Large: 15 };
type BrushSizeName = keyof typeof BRUSH_SIZES;

const COLOR_TO_NOTE_MAP: Record<string, { frequency: number; name: string }> = {
  '#FF0000': { frequency: 293.66, name: 'D4' }, 
  '#FFA500': { frequency: 440.00, name: 'A4' }, 
  '#FFFF00': { frequency: 329.63, name: 'E4' }, 
  '#00FF00': { frequency: 349.23, name: 'F4' }, 
  '#0000FF': { frequency: 392.00, name: 'G4' }, 
  '#800080': { frequency: 493.88, name: 'B4' }, 
  '#000000': { frequency: 261.63, name: 'C4' }, 
};
const NOTE_DURATION_MS = 250; 
const NOTE_DURATION_MS_WHILE_DRAWING = 180; 
const PIXELS_PER_NOTE = 30;
const TONE_ATTACK_TIME = 0.01; 
const TONE_RELEASE_TIME_PALETTE = 0.2; 
const TONE_RELEASE_TIME_DRAWING = 0.15; 

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
    canvasContainerClassName,
    onColorChange,
    onClearCanvas,
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const [currentColor, setCurrentColor] = useState(DEFAULT_BRUSH_COLOR);
  const [currentBrushSizeName, setCurrentBrushSizeName] = useState<BrushSizeName>('Small');
  const [currentLineWidth, setCurrentLineWidth] = useState(BRUSH_SIZES.Small);
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

  const colorsForDisplay: { name: string; value: string; noteLabel?: string }[] = [
    { name: 'Red', value: '#FF0000', noteLabel: COLOR_TO_NOTE_MAP['#FF0000']?.name },
    { name: 'Orange', value: '#FFA500', noteLabel: COLOR_TO_NOTE_MAP['#FFA500']?.name },
    { name: 'Yellow', value: '#FFFF00', noteLabel: COLOR_TO_NOTE_MAP['#FFFF00']?.name },
    { name: 'Green', value: '#00FF00', noteLabel: COLOR_TO_NOTE_MAP['#00FF00']?.name },
    { name: 'Blue', value: '#0000FF', noteLabel: COLOR_TO_NOTE_MAP['#0000FF']?.name },
    { name: 'Purple', value: '#800080', noteLabel: COLOR_TO_NOTE_MAP['#800080']?.name },
    { name: 'Black', value: '#000000', noteLabel: COLOR_TO_NOTE_MAP['#000000']?.name },
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
        ctx.strokeStyle = "rgba(0,0,0,1)";
    }

    if (path.points.length === 1) { 
      const point = path.points[0];
      ctx.beginPath();
      ctx.arc(point.x, point.y, ctx.lineWidth / 2, 0, 2 * Math.PI);
      ctx.fillStyle = path.isErasing ? backgroundColorRef.current : path.color; 
      if (path.isErasing) { 
          ctx.globalCompositeOperation = 'source-over'; 
          ctx.fillStyle = backgroundColorRef.current;
          ctx.fill();
          ctx.globalCompositeOperation = 'destination-out'; 
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
    ctx.globalCompositeOperation = 'source-over'; 
  }, []); 

  const redrawCanvas = useCallback(() => {
    const ctx = getCanvasContext();
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!ctx || !canvas || !container) return;

    const { width: physicalWidth, height: physicalHeight } = canvas;
    
    ctx.save();
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); 
    
    ctx.fillStyle = backgroundColorRef.current;
    ctx.fillRect(0, 0, physicalWidth/dpr, physicalHeight/dpr);

    pathsRef.current.forEach(p => drawPath(ctx, p));
    if (currentPathRef.current && currentPathRef.current.points.length > 0) {
      drawPath(ctx, currentPathRef.current);
    }
    ctx.restore(); 
  }, [getCanvasContext, drawPath]);
  
  useEffect(() => {
    backgroundColorRef.current = initialBackgroundColor;
    redrawCanvas();
  }, [initialBackgroundColor, redrawCanvas]); 

  useEffect(() => {
    if (onDrawingActivity) {
      const hasContent = pathsRef.current.length > 0 || (currentPathRef.current !== null && currentPathRef.current.points.length > 0);
      onDrawingActivity(hasContent);
    }
  }, [pathsRef, currentPathRef, onDrawingActivity]); 


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
      cancelAnimationFrame(animationFrameId);
      animationFrameId = requestAnimationFrame(() => {
        const { width: logicalWidth, height: logicalHeight } = container.getBoundingClientRect();
        
        if (logicalWidth === 0 || logicalHeight === 0) return; 

        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(logicalWidth * dpr);
        canvas.height = Math.floor(logicalHeight * dpr);

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0); 
          redrawCanvas(); 
        }
      });
    };

    const observer = new ResizeObserver(handleResize);
    observer.observe(container);
    handleResize(); 

    return () => {
      observer.unobserve(container);
      cancelAnimationFrame(animationFrameId); 
    };
  }, [redrawCanvas]); 


  const playToneForColor = (color: string, isPaletteClick: boolean = true) => {
    if (!isKidsMode || !audioContextRef.current) return;

    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().catch(e => console.error("Error resuming AudioContext:", e));
    }
    if (audioContextRef.current.state !== 'running') return;

    const noteDetails = COLOR_TO_NOTE_MAP[color];
    if (!noteDetails) return;

    const oscillator = audioContextRef.current.createOscillator();
    const gainNode = audioContextRef.current.createGain();
    const now = audioContextRef.current.currentTime;
    
    oscillator.type = 'triangle'; 
    oscillator.frequency.setValueAtTime(noteDetails.frequency, now);
    
    const attackTime = TONE_ATTACK_TIME;
    const peakTime = now + attackTime;
    const duration = isPaletteClick ? NOTE_DURATION_MS / 1000 : NOTE_DURATION_MS_WHILE_DRAWING / 1000;
    const releaseTimeConstant = isPaletteClick ? TONE_RELEASE_TIME_PALETTE : TONE_RELEASE_TIME_DRAWING;

    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.2, peakTime); 
    gainNode.gain.setTargetAtTime(0, peakTime, releaseTimeConstant); 

    oscillator.connect(gainNode);
    gainNode.connect(audioContextRef.current.destination);

    oscillator.start(now);
    oscillator.stop(now + duration + releaseTimeConstant * 3); 
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
    
    drawPath(ctx, newPath);

    if (isKidsMode && !isErasing) {
      if (currentColor !== lastPlayedColorForSound || recordedNotesSequence.length === 0) {
        playToneForColor(currentColor, true); 
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
    
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = currentPathRef.current.isErasing ? ERASER_SIZE : currentPathRef.current.lineWidth;
    ctx.strokeStyle = currentPathRef.current.isErasing ? backgroundColorRef.current : currentPathRef.current.color;
    ctx.globalCompositeOperation = currentPathRef.current.isErasing ? 'destination-out' : 'source-over';
    
    if (currentPathRef.current.isErasing && ctx.strokeStyle === backgroundColorRef.current) {
      ctx.strokeStyle = "rgba(0,0,0,1)"; 
    }

    ctx.beginPath();
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    ctx.lineTo(currentPoint.x, currentPoint.y);
    ctx.stroke();
    ctx.restore(); 

    currentPathRef.current.points.push(currentPoint); 

    if (isKidsMode && !isErasing && activeStrokeColorRef.current) {
        const dx = currentPoint.x - lastPointRef.current.x;
        const dy = currentPoint.y - lastPointRef.current.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        distanceSinceLastNoteRef.current += dist;

        if (distanceSinceLastNoteRef.current >= PIXELS_PER_NOTE) {
            playToneForColor(activeStrokeColorRef.current, false);
            distanceSinceLastNoteRef.current = 0; 
        }
    }
    lastPointRef.current = currentPoint;
  };

  const stopDrawing = () => {
    if (isDrawing && currentPathRef.current && currentPathRef.current.points.length > 0) { 
      pathsRef.current = [...pathsRef.current, currentPathRef.current];
    }
    currentPathRef.current = null;
    setIsDrawing(false);
    lastPointRef.current = null;
    activeStrokeColorRef.current = null;
    distanceSinceLastNoteRef.current = 0;
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
  
  const handleMouseLeave = () => { 
    if (isDrawing) {
      stopDrawing();
    }
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLCanvasElement>) => {
    if (event.touches.length === 0) return;
    event.preventDefault(); 
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

  const clearCanvasInternal = useCallback(() => {
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
    if (isDrawing) setIsDrawing(false); 
    if (onDrawingActivity) onDrawingActivity(false);
    if (onClearCanvas) onClearCanvas(); // Call the new callback
  }, [redrawCanvas, isKidsMode, onDrawingActivity, isDrawing, onClearCanvas]);

  const toggleEraser = () => {
    setIsErasing(!isErasing);
    if (isDrawing) stopDrawing(); 
  };
  
  const handleBrushSizeChange = (sizeName: BrushSizeName) => {
    setCurrentBrushSizeName(sizeName);
    setCurrentLineWidth(BRUSH_SIZES[sizeName]);
    setIsErasing(false); 
  };

  const handleColorButtonClick = (colorValue: string) => {
    if (isDrawing) stopDrawing();
    setIsErasing(false);
    setCurrentColor(colorValue);
    if (onColorChange) onColorChange(colorValue); // Call the new callback
    if (isKidsMode) {
      playToneForColor(colorValue, true);
      const noteDetails = COLOR_TO_NOTE_MAP[colorValue];
      if (noteDetails && (colorValue !== lastPlayedColorForSound || recordedNotesSequence.length === 0)) {
        setRecordedNotesSequence(prev => [...prev, noteDetails.name]);
        setLastPlayedColorForSound(colorValue);
      }
    }
  };

  useImperativeHandle(ref, () => ({
    getDataURL: () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return 'data:,';
      
      const logicalWidth = container.offsetWidth;
      const logicalHeight = container.offsetHeight;

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = logicalWidth; 
      tempCanvas.height = logicalHeight;
      const tempCtx = tempCanvas.getContext('2d');

      if (!tempCtx) return 'data:,';

      tempCtx.fillStyle = backgroundColorRef.current;
      tempCtx.fillRect(0, 0, logicalWidth, logicalHeight);
      
      pathsRef.current.forEach(p => drawPath(tempCtx, p));
      if (currentPathRef.current && currentPathRef.current.points.length > 0) {
         drawPath(tempCtx, currentPathRef.current)
      }
      return tempCanvas.toDataURL('image/png');
    },
    clearCanvas: clearCanvasInternal,
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
              cursor: isErasing ? 'grab' : 'crosshair', 
              touchAction: 'none', 
          }}
        />
      </div>
      <div className="flex flex-col sm:flex-row flex-wrap space-y-3 sm:space-y-0 sm:space-x-2 items-center justify-center">
        <div className="flex space-x-1 items-center">
          {colorsForDisplay.map(color => (
            <Button
              key={color.name}
              variant="outline"
              size="icon"
              onClick={() => handleColorButtonClick(color.value)}
              className={cn(
                "w-8 h-10 rounded-md border-2 flex flex-col justify-center items-center p-1",
                currentColor === color.value && !isErasing ? 'ring-2 ring-offset-2 ring-accent' : 'border-gray-300',
                color.value === '#FFFFFF' || color.value === '#FFFF00' ? 'text-black' : 'text-white' 
              )}
              style={{ backgroundColor: color.value }}
              aria-label={`Select color ${color.name}${color.noteLabel ? ` (${color.noteLabel})` : ''}`}
            >
              {currentColor === color.value && !isErasing && <Paintbrush className="w-3 h-3 mb-0.5" />}
              {isKidsMode && color.noteLabel && (
                <span className="text-xs font-mono leading-tight">{color.noteLabel}</span>
              )}
            </Button>
          ))}
        </div>
        <div className="flex space-x-1 items-center">
            {(Object.keys(BRUSH_SIZES) as BrushSizeName[]).map(sizeName => (
                <Button
                    key={sizeName}
                    variant="outline"
                    size="icon"
                    onClick={() => handleBrushSizeChange(sizeName)}
                    className={`w-8 h-10 p-1 ${currentBrushSizeName === sizeName && !isErasing ? 'bg-accent text-accent-foreground' : ''}`}
                    aria-label={`Brush size ${sizeName}`}
                >
                    {sizeName === 'Small' && <Circle className="!w-2 !h-2 fill-current" />}
                    {sizeName === 'Medium' && <Circle className="!w-3 !h-3 fill-current" />}
                    {sizeName === 'Large' && <Circle className="!w-5 !h-5 fill-current" />}
                </Button>
            ))}
        </div>
        <div className="flex space-x-1 items-center">
          <Button
            variant="outline"
            size="icon"
            onClick={toggleEraser}
            className={`w-8 h-10 p-2 ${isErasing ? 'bg-accent text-accent-foreground' : ''}`}
            aria-label={isErasing ? "Switch to Brush" : "Switch to Eraser"}
          >
            <Eraser className="w-5 h-5" />
          </Button>
          <Button
            variant="outline"
            onClick={clearCanvasInternal}
            className="h-10 px-3"
            aria-label="Clear Canvas"
          >
            <Trash2 className="w-5 h-5 mr-1 sm:mr-2" /> Clear
          </Button>
        </div>
      </div>
    </div>
  );
});

DrawingCanvas.displayName = 'DrawingCanvas';

