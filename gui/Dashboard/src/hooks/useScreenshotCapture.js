import { useCallback, useState } from 'react';
import html2canvas from 'html2canvas';

const getErrorMessage = (err) => {
  if (err instanceof Error) return err.message;
  return String(err);
};

const useScreenshotCapture = ({ rootElementId = 'quflx-chart-screenshot-root', onError } = {}) => {
  const [isCapturing, setIsCapturing] = useState(false);
  const [isScreenshotOpen, setIsScreenshotOpen] = useState(false);
  const [screenshotDataUrl, setScreenshotDataUrl] = useState(null);

  const captureCompositeChart = useCallback(async () => {
    const container = document.getElementById(rootElementId);
    if (!container) return null;

    try {
      const canvas = await html2canvas(container, {
        backgroundColor: '#020617',
        useCORS: true,
        logging: false,
        scale: window.devicePixelRatio || 1
      });
      return canvas.toDataURL('image/png');
    } catch (err) {
      if (onError) onError(`Screenshot capture failed: ${getErrorMessage(err)}`);
      return null;
    }
  }, [rootElementId, onError]);

  const openScreenshot = useCallback(async () => {
    if (isCapturing) return;
    try {
      setIsCapturing(true);
      const dataUrl = await captureCompositeChart();
      if (!dataUrl) {
        window.alert('Chart not available for screenshot.');
        return;
      }
      setScreenshotDataUrl(dataUrl);
      setIsScreenshotOpen(true);
    } catch (err) {
      if (onError) onError(`Screenshot capture failed: ${getErrorMessage(err)}`);
      window.alert('Failed to capture screenshot.');
    } finally {
      setIsCapturing(false);
    }
  }, [captureCompositeChart, isCapturing, onError]);

  const closeScreenshot = useCallback(() => {
    setIsScreenshotOpen(false);
  }, []);

  return {
    isCapturing,
    isScreenshotOpen,
    screenshotDataUrl,
    setIsScreenshotOpen,
    setScreenshotDataUrl,
    captureCompositeChart,
    openScreenshot,
    closeScreenshot
  };
};

export default useScreenshotCapture;
