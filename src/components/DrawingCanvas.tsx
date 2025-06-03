
"use client";
import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef } from 'react';
import { Button } from '@/components/ui/button';
import { Eraser, Paintbrush, Palette, Trash2, Undo2 } from 'lucide-react'; // Undo2 might not be used immediately

interface DrawingCanvasProps {
  width: number;
  height: number;
  backgroundColor?: string;
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

const DEFAULT_BRUSH_COLOR = '#000000'; // Black
const DEFAULT_BRUSH_SIZE = 5;
const ERASER_COLOR = '#FFFFFF'; // Match background for erasing effect
const ERASER_SIZE = 20;

export const DrawingCanvas = forwardRef<
  { getDataURL: () => string; clearCanvas: () => void },
  DrawingCanvasProps
>(({ width, height, backgroundColor = '#FFFFFF' }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentColor, setCurrentColor] = useState(DEFAULT_BRUSH_COLOR);
  const [currentLineWidth, setCurrentLineWidth] = useState(DEFAULT_BRUSH_SIZE);
  const [isErasing, setIsErasing] = useState(false);
  const [paths, setPaths] = useState<CanvasPath[]>([]);
  const [currentPath, setCurrentPath] = useState<CanvasPath | null>(null);

  const colors = [
    { name: 'Black', value: '#000000' },
    { name: 'Red', value: '#FF0000' },
    { name: 'Yellow', value: '#FFFF00' },
    { name: 'Green', value: '#00FF00' },
    { name: 'Blue', value: '#0000FF' },
  ];

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
  }, [paths, backgroundColor, width, height]); // Redraw when paths change or dimensions/bg change

  const drawPath = (ctx: CanvasRenderingContext2D, path: CanvasPath) => {
    if (path.points.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(path.points[0].x, path.points[0].y);
    for (let i = 1; i < path.points.length; i++) {
      ctx.lineTo(path.points[i].x, path.points[i].y);
    }
    ctx.strokeStyle = path.isErasing ? ERASER_COLOR : path.color;
    ctx.lineWidth = path.isErasing ? ERASER_SIZE : path.lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = path.isErasing ? 'destination-out' : 'source-over';
    // For true erasing, need to clear pixels. For white canvas, drawing white works.
    // If background isn't white, 'destination-out' is better but needs careful state mgmt.
    // For this version, drawing with background color (ERASER_COLOR) is simpler.
    if (path.isErasing) {
        ctx.strokeStyle = backgroundColor; // Use actual background color for erasing
        ctx.globalCompositeOperation = 'source-over'; // Draw normally
    } else {
        ctx.strokeStyle = path.color;
        ctx.globalCompositeOperation = 'source-over';
    }

    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over'; // Reset for next path
  };


  const startDrawing = (x: number, y: number) => {
    setIsDrawing(true);
    const newPath: CanvasPath = {
      points: [{ x, y }],
      color: isErasing ? ERASER_COLOR : currentColor,
      lineWidth: isErasing ? ERASER_SIZE : currentLineWidth,
      isErasing: isErasing,
    };
    setCurrentPath(newPath);
  };

  const draw = (x: number, y: number) => {
    if (!isDrawing || !currentPath) return;
    const newPoints = [...currentPath.points, { x, y }];
    const updatedPath = { ...currentPath, points: newPoints };
    setCurrentPath(updatedPath);
    
    // Draw current segment immediately for responsiveness
    const ctx = getCanvasContext();
    if(ctx) {
        // Redraw everything up to the current path for smoothing effect
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, width, height);
        paths.forEach(p => drawPath(ctx, p));
        drawPath(ctx, updatedPath);
    }
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
  };

  const toggleEraser = () => {
    setIsErasing(!isErasing);
    if (!isErasing) { // Switching to eraser
      // No need to change color/width here, happens in startDrawing
    } else { // Switching back to brush
      setCurrentColor(DEFAULT_BRUSH_COLOR); // Or last used color
      setCurrentLineWidth(DEFAULT_BRUSH_SIZE);
    }
  };

  useImperativeHandle(ref, () => ({
    getDataURL: () => {
      const canvas = canvasRef.current;
      if (!canvas) return 'data:,'; // Return empty data URL if canvas not ready
      // Ensure final path is drawn before exporting
      const ctx = getCanvasContext();
      if (ctx) {
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, width, height);
        paths.forEach(p => drawPath(ctx, p));
        if (currentPath && currentPath.points.length > 1) { // Draw final segment if it exists
          drawPath(ctx, currentPath);
        }
      }
      return canvas.toDataURL('image/png');
    },
    clearCanvas,
  }));
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
        // Set display size
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;

        // Set actual backing store size
        const scale = window.devicePixelRatio || 1;
        canvas.width = Math.floor(width * scale);
        canvas.height = Math.floor(height * scale);

        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.scale(scale, scale);
            ctx.fillStyle = backgroundColor;
            ctx.fillRect(0, 0, width, height);
            redrawCanvas(); // Initial draw with background
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
        onMouseOut={stopDrawing} // Stop drawing if mouse leaves canvas
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="border border-slate-400 rounded-md shadow-lg cursor-crosshair bg-white"
        // Width and height are set via style and canvas attributes in useEffect
      />
      <div className="flex space-x-2 items-center">
        {colors.map(color => (
          <Button
            key={color.name}
            variant="outline"
            size="icon"
            onClick={() => { setIsErasing(false); setCurrentColor(color.value); setCurrentLineWidth(DEFAULT_BRUSH_SIZE); }}
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
