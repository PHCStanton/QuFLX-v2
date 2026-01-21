import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSettingsStore from '../store/settingsStore';

const TOOL_LINE = 'line';
const TOOL_ARROW = 'arrow';
const TOOL_RECT = 'rect';
const TOOL_TEXT = 'text';
const TOOL_CIRCLE = 'circle';

const COLOR_HEX = {
  orange: '#f97316',
  blue: '#3b82f6',
  white: '#ffffff',
  yellow: '#facc15',
  green: '#22c55e',
};

const ScreenshotModal = ({ isOpen, imageDataUrl, onClose, onSave, onSendToAi, asset, timeframe, variant = 'modal' }) => {
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const [shapes, setShapes] = useState([]);
  const [currentShape, setCurrentShape] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const screenshotSettings = useSettingsStore((state) => state.settings?.screenshot);
  const defaults = useMemo(
    () => ({
      defaultTool: screenshotSettings?.defaultTool || TOOL_ARROW,
      defaultColor: screenshotSettings?.defaultColor || 'orange',
      defaultFontSize: Number(screenshotSettings?.defaultFontSize || 16),
      notesMarginEnabled: Boolean(screenshotSettings?.notesMarginEnabled),
      notesMarginWidth: Number(screenshotSettings?.notesMarginWidth || 320),
      saveMode: screenshotSettings?.saveMode || 'full',
      emojiStripEnabled: Boolean(screenshotSettings?.emojiStripEnabled),
    }),
    [screenshotSettings]
  );

  const [activeTool, setActiveTool] = useState(defaults.defaultTool);
  const [activeColor, setActiveColor] = useState(defaults.defaultColor);
  const [activeFontSize, setActiveFontSize] = useState(defaults.defaultFontSize);
  const [notesMarginEnabled, setNotesMarginEnabled] = useState(defaults.notesMarginEnabled);
  const [notesMarginWidth, setNotesMarginWidth] = useState(defaults.notesMarginWidth);
  const [saveMode, setSaveMode] = useState(defaults.saveMode);
  const [emojiStripEnabled, setEmojiStripEnabled] = useState(defaults.emojiStripEnabled);
  const [textDraft, setTextDraft] = useState('');

  const [isSaving, setIsSaving] = useState(false);
  const [isSendingToAi, setIsSendingToAi] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setShapes([]);
    setCurrentShape(null);
    setIsDrawing(false);
    setActiveTool(defaults.defaultTool);
    setActiveColor(defaults.defaultColor);
    setActiveFontSize(defaults.defaultFontSize);
    setNotesMarginEnabled(defaults.notesMarginEnabled);
    setNotesMarginWidth(defaults.notesMarginWidth);
    setSaveMode(defaults.saveMode);
    setEmojiStripEnabled(defaults.emojiStripEnabled);
    setTextDraft('');
  }, [isOpen, defaults]);

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
      const nextWidth = img.width + (notesMarginEnabled ? notesMarginWidth : 0);
      canvas.width = nextWidth;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      drawBase(ctx, img, { notesMarginEnabled, notesMarginWidth });
    };
    img.src = imageDataUrl;
  }, [isOpen, imageDataUrl, notesMarginEnabled, notesMarginWidth]);

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

    const nextWidth = img.width + (notesMarginEnabled ? notesMarginWidth : 0);
    if (canvas.width !== nextWidth) {
      canvas.width = nextWidth;
    }
    if (canvas.height !== img.height) {
      canvas.height = img.height;
    }

    drawBase(ctx, img, { notesMarginEnabled, notesMarginWidth });
    drawShapes(ctx, shapes, currentShape);
  }, [shapes, currentShape, isOpen, notesMarginEnabled, notesMarginWidth]);

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
      if (!String(textDraft || '').trim()) {
        setSaveError('Enter text in the toolbar, then click to place it.');
        return;
      }
      const text = String(textDraft);
      setSaveError('');
      setShapes((prev) =>
        prev.concat([
          {
            type: TOOL_TEXT,
            x: coords.x,
            y: coords.y,
            text,
            color: activeColor,
            fontSize: activeFontSize,
          },
        ])
      );
      return;
    }

    const start = getCanvasCoords(event);
    if (!start) {
      return;
    }
    setIsDrawing(true);
    setCurrentShape({
      type: activeTool,
      x1: start.x,
      y1: start.y,
      x2: start.x,
      y2: start.y,
      color: activeColor,
      strokeWidth: 2,
    });
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

  const handleUndo = useCallback(() => {
    setShapes((prev) => prev.slice(0, prev.length - 1));
  }, []);

  const handleClear = useCallback(() => {
    setShapes([]);
    setCurrentShape(null);
  }, []);

  const handleSave = useCallback(async () => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || isSaving) {
      return;
    }
    try {
      setSaveError('');
      setIsSaving(true);
      let dataUrl = canvas.toDataURL('image/png');
      if (saveMode === 'crop' && img) {
        const off = document.createElement('canvas');
        off.width = img.width;
        off.height = img.height;
        const offCtx = off.getContext('2d');
        offCtx.drawImage(canvas, 0, 0, img.width, img.height, 0, 0, img.width, img.height);
        dataUrl = off.toDataURL('image/png');
      }
      if (onSave) {
        await onSave({ dataUrl, asset, timeframe });
      }
      setIsSaving(false);
      setShapes([]);
      setCurrentShape(null);
      onClose();
    } catch (err) {
      setIsSaving(false);
      setSaveError(err && err.message ? err.message : 'Failed to save screenshot');
    }
  }, [asset, timeframe, isSaving, onClose, onSave, saveMode]);

  const handleSendToAi = async () => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || isSendingToAi || !onSendToAi) {
      return;
    }
    try {
      setSaveError('');
      setIsSendingToAi(true);
      let dataUrl = canvas.toDataURL('image/png');
      if (saveMode === 'crop' && img) {
        const off = document.createElement('canvas');
        off.width = img.width;
        off.height = img.height;
        const offCtx = off.getContext('2d');
        offCtx.drawImage(canvas, 0, 0, img.width, img.height, 0, 0, img.width, img.height);
        dataUrl = off.toDataURL('image/png');
      }

      await onSendToAi({ dataUrl, asset, timeframe });
      setIsSendingToAi(false);
      onClose();
    } catch (err) {
      setIsSendingToAi(false);
      setSaveError(err && err.message ? err.message : 'Failed to send to AI');
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        handleUndo();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        void handleSave();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose, handleUndo, handleSave]);

  if (!isOpen) {
    return null;
  }

  const content = (
    <div
      className={`bg-gray-900 border border-gray-700 rounded-lg shadow-2xl flex flex-col ${
        variant === 'panel' ? 'w-full' : 'max-w-5xl w-full mx-4'
      }`}
    >
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-white">Chart Screenshot</span>
          <span className="text-[11px] text-gray-400">
            {asset ? asset : 'No asset'}
            {timeframe ? ` · ${timeframe}` : ''}
          </span>
          {saveError ? (
            <span className="text-[11px] text-red-300 mt-1">{saveError}</span>
          ) : null}
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <ToolButton label="Line" active={activeTool === TOOL_LINE} onClick={() => setActiveTool(TOOL_LINE)} />
          <ToolButton label="Arrow" active={activeTool === TOOL_ARROW} onClick={() => setActiveTool(TOOL_ARROW)} />
          <ToolButton label="Rect" active={activeTool === TOOL_RECT} onClick={() => setActiveTool(TOOL_RECT)} />
          <ToolButton label="Circle" active={activeTool === TOOL_CIRCLE} onClick={() => setActiveTool(TOOL_CIRCLE)} />
          <ToolButton label="Text" active={activeTool === TOOL_TEXT} onClick={() => setActiveTool(TOOL_TEXT)} />

          {activeTool === TOOL_TEXT ? (
            <input
              value={textDraft}
              onChange={(e) => {
                setTextDraft(e.target.value);
                if (saveError) setSaveError('');
              }}
              placeholder="Type text, then click to place"
              className="px-2 py-1 text-[11px] rounded bg-gray-800 text-gray-200 border border-gray-600 hover:bg-gray-700 w-56"
              aria-label="Text"
            />
          ) : null}

          <select
            value={activeColor}
            onChange={(e) => setActiveColor(e.target.value)}
            className="px-2 py-1 text-[11px] rounded bg-gray-800 text-gray-200 border border-gray-600 hover:bg-gray-700"
            aria-label="Color"
          >
            <option value="orange">Orange</option>
            <option value="blue">Blue</option>
            <option value="white">White</option>
            <option value="yellow">Yellow</option>
            <option value="green">Green</option>
          </select>

          <select
            value={activeFontSize}
            onChange={(e) => setActiveFontSize(Number(e.target.value))}
            className="px-2 py-1 text-[11px] rounded bg-gray-800 text-gray-200 border border-gray-600 hover:bg-gray-700"
            aria-label="Font size"
          >
            <option value={12}>12</option>
            <option value={16}>16</option>
            <option value={20}>20</option>
            <option value={28}>28</option>
          </select>

          <button
            type="button"
            onClick={() => setNotesMarginEnabled((v) => !v)}
            className="px-2 py-1 text-[11px] rounded bg-gray-800 text-gray-200 border border-gray-600 hover:bg-gray-700"
            title="Toggle notes margin"
          >
            Notes
          </button>

          <select
            value={saveMode}
            onChange={(e) => setSaveMode(e.target.value)}
            className="px-2 py-1 text-[11px] rounded bg-gray-800 text-gray-200 border border-gray-600 hover:bg-gray-700"
            aria-label="Save mode"
          >
            <option value="full">Save: Full</option>
            <option value="crop">Save: Crop</option>
          </select>

          <button
            type="button"
            onClick={handleSendToAi}
            disabled={!onSendToAi || isSendingToAi}
            className="px-2 py-1 text-[11px] rounded bg-purple-500/20 text-purple-200 border border-purple-500/30 hover:bg-purple-500/30 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isSendingToAi ? 'Sending…' : 'Ask AI'}
          </button>
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
      {emojiStripEnabled ? (
        <div className="px-4 py-2 border-b border-gray-800 flex items-center gap-2 flex-wrap">
          {['✅', '❌', '⚠️', '📌', '🔥', '💡'].map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                setActiveTool(TOOL_TEXT);
                setTextDraft((prev) => `${prev}${emoji}`);
              }}
              className="px-2 py-1 text-[12px] rounded bg-gray-800 text-gray-200 border border-gray-600 hover:bg-gray-700"
            >
              {emoji}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setEmojiStripEnabled(false)}
            className="ml-auto px-2 py-1 text-[11px] rounded bg-gray-800 text-gray-300 border border-gray-600 hover:bg-gray-700"
          >
            Hide
          </button>
        </div>
      ) : null}

      <div className={`p-3 overflow-auto ${variant === 'panel' ? 'max-h-[65vh]' : 'max-h-[80vh]'}`}>
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
  );


  if (variant === 'panel') {
    return content;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      {content}
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

const drawBase = (ctx, img, { notesMarginEnabled, notesMarginWidth }) => {
  const canvas = ctx.canvas;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);

  if (notesMarginEnabled) {
    const marginX = img.width;
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(marginX, 0, notesMarginWidth, canvas.height);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(marginX + 0.5, 0);
    ctx.lineTo(marginX + 0.5, canvas.height);
    ctx.stroke();
  }
};

const drawShapes = (ctx, shapes, currentShape) => {
  const allShapes = currentShape ? shapes.concat([currentShape]) : shapes;
  allShapes.forEach((shape) => {
    if (shape.type === TOOL_TEXT) {
      const fontSize = Number(shape.fontSize) || 16;
      ctx.font = `${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, sans-serif`;
      ctx.fillStyle = COLOR_HEX[shape.color] || COLOR_HEX.orange;
      ctx.fillText(shape.text, shape.x, shape.y);
      return;
    }
    const lineWidth = Number(shape.strokeWidth) || 2;
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = COLOR_HEX[shape.color] || COLOR_HEX.orange;
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
    } else if (shape.type === TOOL_CIRCLE) {
      const x = Math.min(shape.x1, shape.x2);
      const y = Math.min(shape.y1, shape.y2);
      const w = Math.abs(shape.x2 - shape.x1);
      const h = Math.abs(shape.y2 - shape.y1);
      drawEllipse(ctx, x, y, w, h);
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
  ctx.fillStyle = ctx.strokeStyle;
  ctx.fill();
};

const drawEllipse = (ctx, x, y, w, h) => {
  const rx = w / 2;
  const ry = h / 2;
  const cx = x + rx;
  const cy = y + ry;
  ctx.beginPath();
  ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
  ctx.stroke();
};

export default ScreenshotModal;
