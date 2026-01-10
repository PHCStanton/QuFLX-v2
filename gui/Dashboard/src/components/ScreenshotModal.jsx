import { useEffect, useRef, useState } from 'react';

const TOOL_LINE = 'line';
const TOOL_ARROW = 'arrow';
const TOOL_RECT = 'rect';
const TOOL_TEXT = 'text';

const ScreenshotModal = ({ isOpen, imageDataUrl, onClose, onSave, asset, timeframe }) => {
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const [shapes, setShapes] = useState([]);
  const [currentShape, setCurrentShape] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [activeTool, setActiveTool] = useState(TOOL_ARROW);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen || !imageDataUrl) {
      return;
    }

    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }
      const ctx = canvas.getContext('2d');
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
    };
    img.src = imageDataUrl;
  }, [isOpen, imageDataUrl]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) {
      return;
    }
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    drawShapes(ctx, shapes, currentShape);
  }, [shapes, currentShape, isOpen]);

  const getCanvasCoords = (event) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return null;
    }
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width ? canvas.width / rect.width : 1;
    const scaleY = rect.height ? canvas.height / rect.height : 1;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;
    return { x, y };
  };

  const handleCanvasMouseDown = (event) => {
    if (!isOpen) {
      return;
    }
    if (activeTool === TOOL_TEXT) {
      const coords = getCanvasCoords(event);
      if (!coords) {
        return;
      }
      const text = window.prompt('Enter note text:');
      if (!text) {
        return;
      }
      setShapes((prev) => prev.concat([{ type: TOOL_TEXT, x: coords.x, y: coords.y, text }]));
      return;
    }

    const start = getCanvasCoords(event);
    if (!start) {
      return;
    }
    setIsDrawing(true);
    setCurrentShape({ type: activeTool, x1: start.x, y1: start.y, x2: start.x, y2: start.y });
  };

  const handleCanvasMouseMove = (event) => {
    if (!isDrawing || !currentShape) {
      return;
    }
    const point = getCanvasCoords(event);
    if (!point) {
      return;
    }
    setCurrentShape({ ...currentShape, x2: point.x, y2: point.y });
  };

  const handleCanvasMouseUp = () => {
    if (!isDrawing || !currentShape) {
      return;
    }
    setIsDrawing(false);
    setShapes((prev) => prev.concat([currentShape]));
    setCurrentShape(null);
  };

  const handleUndo = () => {
    if (!shapes.length) {
      return;
    }
    setShapes((prev) => prev.slice(0, prev.length - 1));
  };

  const handleClear = () => {
    if (!shapes.length) {
      return;
    }
    setShapes([]);
    setCurrentShape(null);
  };

  const handleSave = async () => {
    const canvas = canvasRef.current;
    if (!canvas || isSaving) {
      return;
    }
    try {
      setIsSaving(true);
      const dataUrl = canvas.toDataURL('image/png');
      if (onSave) {
        await onSave({ dataUrl, asset, timeframe });
      }
      setIsSaving(false);
      setShapes([]);
      setCurrentShape(null);
      onClose();
    } catch (err) {
      setIsSaving(false);
      window.alert(err && err.message ? err.message : 'Failed to save screenshot');
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl max-w-5xl w-full mx-4 flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-white">Chart Screenshot</span>
            <span className="text-[11px] text-gray-400">
              {asset ? asset : 'No asset'}
              {timeframe ? ` · ${timeframe}` : ''}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <ToolButton label="Line" active={activeTool === TOOL_LINE} onClick={() => setActiveTool(TOOL_LINE)} />
            <ToolButton label="Arrow" active={activeTool === TOOL_ARROW} onClick={() => setActiveTool(TOOL_ARROW)} />
            <ToolButton label="Rect" active={activeTool === TOOL_RECT} onClick={() => setActiveTool(TOOL_RECT)} />
            <ToolButton label="Text" active={activeTool === TOOL_TEXT} onClick={() => setActiveTool(TOOL_TEXT)} />
            <button
              type="button"
              onClick={handleUndo}
              className="px-2 py-1 text-[11px] rounded bg-gray-800 text-gray-200 border border-gray-600 hover:bg-gray-700"
            >
              Undo
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="px-2 py-1 text-[11px] rounded bg-gray-800 text-gray-200 border border-gray-600 hover:bg-gray-700"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-2 py-1 text-[11px] rounded bg-gray-800 text-gray-300 border border-gray-600 hover:bg-gray-700"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-3 py-1 text-[11px] rounded bg-accent-green text-black font-semibold hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
        <div className="p-3 overflow-auto max-h-[80vh]">
          <div className="inline-block border border-gray-700 rounded bg-black">
            <canvas
              ref={canvasRef}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={handleCanvasMouseUp}
              className="max-h-[70vh] max-w-full cursor-crosshair"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

const ToolButton = ({ label, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`px-2 py-1 text-[11px] rounded border ${
      active
        ? 'bg-emerald-600 text-white border-emerald-400'
        : 'bg-gray-800 text-gray-300 border-gray-600 hover:bg-gray-700'
    }`}
  >
    {label}
  </button>
);

const drawShapes = (ctx, shapes, currentShape) => {
  const allShapes = currentShape ? shapes.concat([currentShape]) : shapes;
  ctx.lineWidth = 2;
  ctx.font = '16px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
  allShapes.forEach((shape) => {
    if (shape.type === TOOL_TEXT) {
      ctx.fillStyle = '#f97316';
      ctx.fillText(shape.text, shape.x, shape.y);
      return;
    }
    ctx.strokeStyle = '#f97316';
    if (shape.type === TOOL_LINE) {
      drawLine(ctx, shape.x1, shape.y1, shape.x2, shape.y2);
    } else if (shape.type === TOOL_ARROW) {
      drawArrow(ctx, shape.x1, shape.y1, shape.x2, shape.y2);
    } else if (shape.type === TOOL_RECT) {
      const x = Math.min(shape.x1, shape.x2);
      const y = Math.min(shape.y1, shape.y2);
      const w = Math.abs(shape.x2 - shape.x1);
      const h = Math.abs(shape.y2 - shape.y1);
      ctx.strokeRect(x, y, w, h);
    }
  });
};

const drawLine = (ctx, x1, y1, x2, y2) => {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
};

const drawArrow = (ctx, x1, y1, x2, y2) => {
  drawLine(ctx, x1, y1, x2, y2);
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const headLen = 10;
  const hx1 = x2 - headLen * Math.cos(angle - Math.PI / 6);
  const hy1 = y2 - headLen * Math.sin(angle - Math.PI / 6);
  const hx2 = x2 - headLen * Math.cos(angle + Math.PI / 6);
  const hy2 = y2 - headLen * Math.sin(angle + Math.PI / 6);
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(hx1, hy1);
  ctx.lineTo(hx2, hy2);
  ctx.closePath();
  ctx.fillStyle = '#f97316';
  ctx.fill();
};

export default ScreenshotModal;
