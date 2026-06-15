import React, { useState, useEffect } from 'react';
import { ArrowLeft, Scissors, Download, FileCheck } from 'lucide-react';
import FileUpload from '../components/FileUpload';
import ProgressBar from '../components/ProgressBar';
import api from '../utils/api';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

interface CropPdfProps {
  onBack: () => void;
}

interface PreviewPage {
  dataUrl: string;
  width: number;
  height: number;
}

const CropPdf: React.FC<CropPdfProps> = ({ onBack }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  // Crop Box Parameters (in PDF points)
  const [pageIndex, setPageIndex] = useState('');
  const [x, setX] = useState(0);
  const [y, setY] = useState(0);
  const [width, setWidth] = useState(400);
  const [height, setHeight] = useState(400);

  // Preview page render states
  const [isLoadingPages, setIsLoadingPages] = useState(false);
  const [previewPage, setPreviewPage] = useState<PreviewPage | null>(null);
  const [originalWidth, setOriginalWidth] = useState(0);
  const [originalHeight, setOriginalHeight] = useState(0);
  const [renderError, setRenderError] = useState<string | null>(null);

  // Drag and resize state in preview pixels
  const [cropBox, setCropBox] = useState({ x: 40, y: 40, width: 220, height: 280 });
  const [dragAction, setDragAction] = useState<{
    type: 'drag' | 'resize-tl' | 'resize-tr' | 'resize-bl' | 'resize-br' | 'resize-t' | 'resize-b' | 'resize-l' | 'resize-r';
    startX: number;
    startY: number;
    startBox: { x: number; y: number; width: number; height: number };
  } | null>(null);

  const previewWidth = previewPage?.width || 300;
  const previewHeight = previewPage?.height || 400;

  const handleFilesSelected = (newFiles: File[]) => {
    if (newFiles.length > 0) {
      setFiles([newFiles[0]]);
      setDownloadUrl(null);
      setPreviewPage(null);
      setRenderError(null);
    }
  };

  const handleRemoveFile = () => {
    setFiles([]);
    setDownloadUrl(null);
    setPreviewPage(null);
    setRenderError(null);
  };

  // Render Page 1
  useEffect(() => {
    if (files.length === 0) return;
    
    const file = files[0];
    const fileReader = new FileReader();
    setIsLoadingPages(true);
    setRenderError(null);

    fileReader.onload = async function () {
      try {
        const typedarray = new Uint8Array(fileReader.result as ArrayBuffer);
        const loadingTask = pdfjsLib.getDocument({ data: typedarray });
        const pdf = await loadingTask.promise;
        
        if (pdf.numPages > 0) {
          const page = await pdf.getPage(1);
          const originalViewport = page.getViewport({ scale: 1.0 });
          setOriginalWidth(originalViewport.width);
          setOriginalHeight(originalViewport.height);

          // Render at a scaled width for preview workspace
          const targetWidth = Math.min(360, window.innerWidth - 90);
          const previewScale = targetWidth / originalViewport.width;
          const viewport = page.getViewport({ scale: previewScale });

          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const context = canvas.getContext('2d');
          if (context) {
            await page.render({
              canvasContext: context,
              viewport: viewport
            }).promise;
            
            setPreviewPage({
              dataUrl: canvas.toDataURL('image/jpeg', 0.8),
              width: viewport.width,
              height: viewport.height
            });

            // Initialize cropBox to 80% of page
            const initialBox = {
              x: viewport.width * 0.1,
              y: viewport.height * 0.1,
              width: viewport.width * 0.8,
              height: viewport.height * 0.8
            };
            setCropBox(initialBox);

            // Set coordinates in PDF points
            const scaleX = originalViewport.width / viewport.width;
            const scaleY = originalViewport.height / viewport.height;
            setX(Math.round(initialBox.x * scaleX));
            setY(Math.round((viewport.height - (initialBox.y + initialBox.height)) * scaleY));
            setWidth(Math.round(initialBox.width * scaleX));
            setHeight(Math.round(initialBox.height * scaleY));
          }
        }
      } catch (err: any) {
        console.error('Error rendering crop page:', err);
        setRenderError(err.message || String(err));
      } finally {
        setIsLoadingPages(false);
      }
    };

    fileReader.readAsArrayBuffer(file);
  }, [files]);

  // Sync cropBox state if user changes coordinate inputs manually
  useEffect(() => {
    if (!previewPage || originalWidth === 0 || originalHeight === 0 || dragAction) return;

    const scaleX = originalWidth / previewWidth;
    const scaleY = originalHeight / previewHeight;

    const newX = x / scaleX;
    const newWidth = width / scaleX;
    const newHeight = height / scaleY;
    const newY = previewHeight - (y / scaleY) - newHeight;

    // Check bounds to prevent infinite loops or invalid states
    if (
      Math.abs(cropBox.x - newX) > 1 ||
      Math.abs(cropBox.y - newY) > 1 ||
      Math.abs(cropBox.width - newWidth) > 1 ||
      Math.abs(cropBox.height - newHeight) > 1
    ) {
      setCropBox({
        x: Math.max(0, Math.min(previewWidth, newX)),
        y: Math.max(0, Math.min(previewHeight, newY)),
        width: Math.max(10, Math.min(previewWidth - newX, newWidth)),
        height: Math.max(10, Math.min(previewHeight - newY, newHeight))
      });
    }
  }, [x, y, width, height, previewPage, originalWidth, originalHeight]);

  // Unified start handler for both mouse and touch
  const handleStart = (
    clientX: number,
    clientY: number,
    actionType: 'drag' | 'resize-tl' | 'resize-tr' | 'resize-bl' | 'resize-br' | 'resize-t' | 'resize-b' | 'resize-l' | 'resize-r'
  ) => {
    setDragAction({
      type: actionType,
      startX: clientX,
      startY: clientY,
      startBox: { ...cropBox }
    });
  };

  const handleMouseDown = (
    e: React.MouseEvent,
    actionType: 'drag' | 'resize-tl' | 'resize-tr' | 'resize-bl' | 'resize-br' | 'resize-t' | 'resize-b' | 'resize-l' | 'resize-r'
  ) => {
    e.preventDefault();
    e.stopPropagation();
    handleStart(e.clientX, e.clientY, actionType);
  };

  const handleTouchStart = (
    e: React.TouchEvent,
    actionType: 'drag' | 'resize-tl' | 'resize-tr' | 'resize-bl' | 'resize-br' | 'resize-t' | 'resize-b' | 'resize-l' | 'resize-r'
  ) => {
    e.stopPropagation();
    if (e.touches.length > 0) {
      handleStart(e.touches[0].clientX, e.touches[0].clientY, actionType);
    }
  };

  useEffect(() => {
    if (!dragAction) return;

    const move = (clientX: number, clientY: number) => {
      const dx = clientX - dragAction.startX;
      const dy = clientY - dragAction.startY;
      const box = { ...dragAction.startBox };

      if (dragAction.type === 'drag') {
        box.x = Math.max(0, Math.min(previewWidth - box.width, box.x + dx));
        box.y = Math.max(0, Math.min(previewHeight - box.height, box.y + dy));
      } else {
        if (dragAction.type.includes('l')) {
          const newX = Math.max(0, Math.min(box.x + box.width - 20, box.x + dx));
          box.width = box.width + (box.x - newX);
          box.x = newX;
        }
        if (dragAction.type.includes('r')) {
          box.width = Math.max(20, Math.min(previewWidth - box.x, box.width + dx));
        }
        if (dragAction.type.includes('t')) {
          const newY = Math.max(0, Math.min(box.y + box.height - 20, box.y + dy));
          box.height = box.height + (box.y - newY);
          box.y = newY;
        }
        if (dragAction.type.includes('b')) {
          box.height = Math.max(20, Math.min(previewHeight - box.y, box.height + dy));
        }
      }

      setCropBox(box);

      // Update Form Parameters (PDF Points)
      const scaleX = originalWidth / previewWidth;
      const scaleY = originalHeight / previewHeight;
      setX(Math.round(box.x * scaleX));
      setY(Math.round((previewHeight - (box.y + box.height)) * scaleY));
      setWidth(Math.round(box.width * scaleX));
      setHeight(Math.round(box.height * scaleY));
    };

    const handleMouseMove = (e: MouseEvent) => {
      move(e.clientX, e.clientY);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        move(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    const handleRelease = () => {
      setDragAction(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleRelease);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleRelease);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleRelease);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleRelease);
    };
  }, [dragAction, previewWidth, previewHeight, originalWidth, originalHeight]);

  const handleSubmit = async () => {
    if (files.length === 0) return;
    setIsProcessing(true);
    setProgress(15);

    const formData = new FormData();
    formData.append('file', files[0]);
    formData.append('pageIndex', String(pageIndex));
    formData.append('x', String(x));
    formData.append('y', String(y));
    formData.append('width', String(width));
    formData.append('height', String(height));

    try {
      setProgress(50);
      const response = await api.post('/crop', formData, {
        responseType: 'blob',
        onUploadProgress: (progressEvent) => {
          const percent = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1));
          setProgress(50 + percent * 0.4);
        }
      });

      setProgress(90);
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      setDownloadUrl(url);
      setProgress(100);
    } catch (err: any) {
      console.error(err);
      alert('Error cropping PDF: ' + (err.response?.data?.error || err.message));
      setProgress(0);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="tool-page-container">
      <div className="tool-workspace" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'stretch' }}>
        <div className="tool-workspace-header">
          <button className="file-remove-btn" onClick={onBack}>
            <ArrowLeft size={16} /> Back to Tools
          </button>
          {files.length > 0 && !downloadUrl && (
            <button 
              className="btn btn-secondary" 
              onClick={handleRemoveFile}
              style={{ padding: '0.4rem 0.8rem', borderRadius: '8px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--color-coral)', borderColor: 'rgba(238, 108, 77, 0.2)' }}
            >
              Choose Another PDF File
            </button>
          )}
        </div>

        <div style={{ width: '100%', marginTop: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
          <h2 style={{ fontSize: '1.75rem', marginBottom: '1.5rem', fontFamily: 'var(--font-display)' }}>Crop PDF Document</h2>

          {renderError && (
            <div style={{ width: '100%', maxWidth: '600px', padding: '1rem', background: 'rgba(238, 108, 77, 0.1)', border: '1px solid var(--color-coral)', borderRadius: '12px', color: 'var(--color-coral)', marginBottom: '1rem', textAlign: 'center', fontSize: '0.9rem' }}>
              <strong>Error Loading PDF Preview:</strong> {renderError}
            </div>
          )}

          {!downloadUrl ? (
            files.length === 0 ? (
              <div style={{ width: '100%', maxWidth: '600px', margin: 'auto' }}>
                <FileUpload
                  accept="application/pdf"
                  multiple={false}
                  onFilesSelected={handleFilesSelected}
                  selectedFiles={files}
                  onRemoveFile={handleRemoveFile}
                />
              </div>
            ) : (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                {isLoadingPages ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', margin: 'auto' }}>
                    <div className="animate-spin" style={{ width: '40px', height: '40px', border: '4px solid var(--color-border)', borderTopColor: 'var(--color-primary)', borderRadius: '50%' }} />
                    <p style={{ color: 'var(--text-muted)' }}>Rendering cropping preview...</p>
                  </div>
                ) : (
                  previewPage && (
                    <div style={{ width: '100%', display: 'flex', justifyContent: 'center', padding: '0.75rem', border: '1px solid var(--color-border)', borderRadius: '16px', background: 'rgba(255,255,255,0.02)', backdropFilter: 'blur(10px)', marginBottom: '1.5rem', maxWidth: '500px' }}>
                      <div style={{ 
                        position: 'relative', 
                        width: `${previewWidth}px`, 
                        height: `${previewHeight}px`,
                        boxShadow: '0 8px 25px rgba(0,0,0,0.15)',
                        borderRadius: '8px',
                        border: '1px solid var(--color-border)',
                        userSelect: 'none'
                      }}>
                        <img src={previewPage.dataUrl} alt="Crop Preview Page" style={{ width: '100%', height: '100%', display: 'block', pointerEvents: 'none' }} />
                        
                        {/* Shading outside crop box */}
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: `${cropBox.y}px`, background: 'rgba(0,0,0,0.45)' }} />
                        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${previewHeight - (cropBox.y + cropBox.height)}px`, background: 'rgba(0,0,0,0.45)' }} />
                        <div style={{ position: 'absolute', top: `${cropBox.y}px`, left: 0, width: `${cropBox.x}px`, height: `${cropBox.height}px`, background: 'rgba(0,0,0,0.45)' }} />
                        <div style={{ position: 'absolute', top: `${cropBox.y}px`, right: 0, width: `${previewWidth - (cropBox.x + cropBox.width)}px`, height: `${cropBox.height}px`, background: 'rgba(0,0,0,0.45)' }} />

                        {/* Interactive Crop Frame */}
                        <div 
                          style={{
                            position: 'absolute',
                            left: `${cropBox.x}px`,
                            top: `${cropBox.y}px`,
                            width: `${cropBox.width}px`,
                            height: `${cropBox.height}px`,
                            border: '2px solid var(--color-coral)',
                            cursor: 'move',
                            boxShadow: '0 0 8px rgba(238, 108, 77, 0.5)'
                          }}
                          onMouseDown={(e) => handleMouseDown(e, 'drag')}
                          onTouchStart={(e) => handleTouchStart(e, 'drag')}
                        >
                          {/* Corner Handles */}
                          <div 
                            style={{ position: 'absolute', top: '-6px', left: '-6px', width: '12px', height: '12px', background: 'var(--color-coral)', border: '1px solid white', borderRadius: '50%', cursor: 'nwse-resize' }} 
                            onMouseDown={(e) => handleMouseDown(e, 'resize-tl')}
                            onTouchStart={(e) => handleTouchStart(e, 'resize-tl')}
                          />
                          <div 
                            style={{ position: 'absolute', top: '-6px', right: '-6px', width: '12px', height: '12px', background: 'var(--color-coral)', border: '1px solid white', borderRadius: '50%', cursor: 'nesw-resize' }} 
                            onMouseDown={(e) => handleMouseDown(e, 'resize-tr')}
                            onTouchStart={(e) => handleTouchStart(e, 'resize-tr')}
                          />
                          <div 
                            style={{ position: 'absolute', bottom: '-6px', left: '-6px', width: '12px', height: '12px', background: 'var(--color-coral)', border: '1px solid white', borderRadius: '50%', cursor: 'nesw-resize' }} 
                            onMouseDown={(e) => handleMouseDown(e, 'resize-bl')}
                            onTouchStart={(e) => handleTouchStart(e, 'resize-bl')}
                          />
                          <div 
                            style={{ position: 'absolute', bottom: '-6px', right: '-6px', width: '12px', height: '12px', background: 'var(--color-coral)', border: '1px solid white', borderRadius: '50%', cursor: 'nwse-resize' }} 
                            onMouseDown={(e) => handleMouseDown(e, 'resize-br')}
                            onTouchStart={(e) => handleTouchStart(e, 'resize-br')}
                          />

                          {/* Edge Handles */}
                          <div 
                            style={{ position: 'absolute', top: '-4px', left: '50%', transform: 'translateX(-50%)', width: '16px', height: '8px', background: 'var(--color-coral)', border: '1px solid white', borderRadius: '3px', cursor: 'ns-resize' }} 
                            onMouseDown={(e) => handleMouseDown(e, 'resize-t')}
                            onTouchStart={(e) => handleTouchStart(e, 'resize-t')}
                          />
                          <div 
                            style={{ position: 'absolute', bottom: '-4px', left: '50%', transform: 'translateX(-50%)', width: '16px', height: '8px', background: 'var(--color-coral)', border: '1px solid white', borderRadius: '3px', cursor: 'ns-resize' }} 
                            onMouseDown={(e) => handleMouseDown(e, 'resize-b')}
                            onTouchStart={(e) => handleTouchStart(e, 'resize-b')}
                          />
                          <div 
                            style={{ position: 'absolute', top: '50%', left: '-4px', transform: 'translateY(-50%)', width: '8px', height: '16px', background: 'var(--color-coral)', border: '1px solid white', borderRadius: '3px', cursor: 'ew-resize' }} 
                            onMouseDown={(e) => handleMouseDown(e, 'resize-l')}
                            onTouchStart={(e) => handleTouchStart(e, 'resize-l')}
                          />
                          <div 
                            style={{ position: 'absolute', top: '50%', right: '-4px', transform: 'translateY(-50%)', width: '8px', height: '16px', background: 'var(--color-coral)', border: '1px solid white', borderRadius: '3px', cursor: 'ew-resize' }} 
                            onMouseDown={(e) => handleMouseDown(e, 'resize-r')}
                            onTouchStart={(e) => handleTouchStart(e, 'resize-r')}
                          />
                        </div>
                      </div>
                    </div>
                  )
                )}
                
              </div>
            )
          ) : (
            <div style={{ textAlign: 'center', padding: '2rem', margin: 'auto' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: '#e2f0d9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', color: '#385723' }}>
                <FileCheck size={36} />
              </div>
              <h3 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>PDF Cropped Successfully!</h3>
              <div style={{ display: 'flex', gap: '1rem', width: '100%', justifyContent: 'center', marginTop: '1.5rem', flexWrap: 'wrap' }}>
                <button 
                  onClick={handleRemoveFile} 
                  className="btn btn-secondary"
                  style={{ borderRadius: '12px', padding: '0.85rem 1.75rem' }}
                >
                  Crop Another File
                </button>
                <a 
                  href={downloadUrl} 
                  download="cropped.pdf"
                  className="btn btn-primary" 
                  style={{ textDecoration: 'none', borderRadius: '12px', padding: '0.85rem 2.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  <Download size={18} /> Download Cropped PDF
                </a>
              </div>
            </div>
          )}

          {isProcessing && (
            <div style={{ width: '100%', maxWidth: '600px' }}>
              <ProgressBar progress={progress} message="Cropping PDF layers..." />
            </div>
          )}
        </div>
      </div>

      <div className="tool-options-panel" style={{ maxHeight: '85vh', overflowY: 'auto' }}>
        <h3 className="panel-title">Crop Area (PDF Points)</h3>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
          <div>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Target Page Index (0-based, empty for all pages)</label>
            <input type="text" className="form-input" placeholder="e.g. 0" value={pageIndex} onChange={(e) => setPageIndex(e.target.value)} style={{ width: '100%' }} />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>X Offset</label>
            <input type="number" className="form-control" value={x} onChange={(e) => setX(Number(e.target.value))} style={{ width: '100%' }} />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Y Offset</label>
            <input type="number" className="form-control" value={y} onChange={(e) => setY(Number(e.target.value))} style={{ width: '100%' }} />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Width</label>
            <input type="number" className="form-control" value={width} onChange={(e) => setWidth(Number(e.target.value))} style={{ width: '100%' }} />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Height</label>
            <input type="number" className="form-control" value={height} onChange={(e) => setHeight(Number(e.target.value))} style={{ width: '100%' }} />
          </div>
        </div>

        <button 
          className="btn btn-primary"
          disabled={files.length === 0 || isProcessing}
          onClick={handleSubmit}
          style={{ width: '100%', marginTop: '1.5rem' }}
        >
          <Scissors size={18} /> Crop PDF
        </button>
      </div>
    </div>
  );
};

export default CropPdf;
