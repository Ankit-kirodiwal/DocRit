import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, ScissorsLineDashed, Download, FileCheck, Trash2 } from 'lucide-react';
import FileUpload from '../components/FileUpload';
import ProgressBar from '../components/ProgressBar';
import api from '../utils/api';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

interface RedactPdfProps {
  onBack: () => void;
}

interface PreviewPage {
  dataUrl: string;
  width: number;
  height: number;
}

interface RedactionItem {
  id: string;
  x: number; // in preview pixels
  y: number; // in preview pixels
  width: number;
  height: number;
  pageNumber: number; // 1-indexed
}

const RedactPdf: React.FC<RedactPdfProps> = ({ onBack }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  // Redaction parameters state
  const [activePageNumber, setActivePageNumber] = useState(1);
  const [totalPagesCount, setTotalPagesCount] = useState(0);
  const [redactions, setRedactions] = useState<RedactionItem[]>([]);

  // Preview page render states
  const [isLoadingPages, setIsLoadingPages] = useState(false);
  const [previewPage, setPreviewPage] = useState<PreviewPage | null>(null);
  const [originalWidth, setOriginalWidth] = useState(0);
  const [originalHeight, setOriginalHeight] = useState(0);
  const [renderError, setRenderError] = useState<string | null>(null);

  // Click-to-draw state
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState({ x: 0, y: 0 });
  const [tempRect, setTempRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  const previewRef = useRef<HTMLDivElement | null>(null);
  const previewWidth = previewPage?.width || 300;
  const previewHeight = previewPage?.height || 400;

  const handleFilesSelected = (newFiles: File[]) => {
    if (newFiles.length > 0) {
      setFiles([newFiles[0]]);
      setDownloadUrl(null);
      setPreviewPage(null);
      setRedactions([]);
      setActivePageNumber(1);
      setRenderError(null);
    }
  };

  const handleRemoveFile = () => {
    setFiles([]);
    setDownloadUrl(null);
    setPreviewPage(null);
    setRedactions([]);
    setActivePageNumber(1);
    setRenderError(null);
  };

  // Render current active page
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
        setTotalPagesCount(pdf.numPages);

        // Ensure active page is within range
        const pageToLoad = Math.max(1, Math.min(pdf.numPages, activePageNumber));
        const page = await pdf.getPage(pageToLoad);
        const originalViewport = page.getViewport({ scale: 1.0 });
        setOriginalWidth(originalViewport.width);
        setOriginalHeight(originalViewport.height);

        // Scale to preview workspace size
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
        }
      } catch (err: any) {
        console.error('Error rendering redaction page:', err);
        setRenderError(err.message || String(err));
      } finally {
        setIsLoadingPages(false);
      }
    };

    fileReader.readAsArrayBuffer(file);
  }, [files, activePageNumber]);

  // Handle click-and-drag drawing (Mouse)
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!previewRef.current || isLoadingPages) return;
    e.preventDefault();

    const rect = previewRef.current.getBoundingClientRect();
    const startX = e.clientX - rect.left;
    const startY = e.clientY - rect.top;

    setIsDrawing(true);
    setDrawStart({ x: startX, y: startY });
    setTempRect({ x: startX, y: startY, width: 0, height: 0 });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing || !previewRef.current || !tempRect) return;

    const rect = previewRef.current.getBoundingClientRect();
    const currentX = Math.max(0, Math.min(previewWidth, e.clientX - rect.left));
    const currentY = Math.max(0, Math.min(previewHeight, e.clientY - rect.top));

    setTempRect({
      x: Math.min(drawStart.x, currentX),
      y: Math.min(drawStart.y, currentY),
      width: Math.abs(drawStart.x - currentX),
      height: Math.abs(drawStart.y - currentY)
    });
  };

  // Handle touch-and-drag drawing (Mobile/Tablet)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!previewRef.current || isLoadingPages || e.touches.length === 0) return;
    
    const rect = previewRef.current.getBoundingClientRect();
    const touch = e.touches[0];
    const startX = touch.clientX - rect.left;
    const startY = touch.clientY - rect.top;

    setIsDrawing(true);
    setDrawStart({ x: startX, y: startY });
    setTempRect({ x: startX, y: startY, width: 0, height: 0 });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDrawing || !previewRef.current || !tempRect || e.touches.length === 0) return;
    e.preventDefault(); // Prevent scrolling while drawing redaction box

    const rect = previewRef.current.getBoundingClientRect();
    const touch = e.touches[0];
    const currentX = Math.max(0, Math.min(previewWidth, touch.clientX - rect.left));
    const currentY = Math.max(0, Math.min(previewHeight, touch.clientY - rect.top));

    setTempRect({
      x: Math.min(drawStart.x, currentX),
      y: Math.min(drawStart.y, currentY),
      width: Math.abs(drawStart.x - currentX),
      height: Math.abs(drawStart.y - currentY)
    });
  };

  const handleMouseUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    if (tempRect && tempRect.width > 5 && tempRect.height > 5) {
      const newRedaction: RedactionItem = {
        id: Math.random().toString(36).substring(7),
        x: tempRect.x,
        y: tempRect.y,
        width: tempRect.width,
        height: tempRect.height,
        pageNumber: activePageNumber
      };
      setRedactions(prev => [...prev, newRedaction]);
    }
    setTempRect(null);
  };

  const deleteRedaction = (id: string) => {
    setRedactions(prev => prev.filter(r => r.id !== id));
  };

  const handleSubmit = async () => {
    if (files.length === 0) return;
    if (redactions.length === 0) {
      alert('Please draw at least one redaction block on the page first.');
      return;
    }

    setIsProcessing(true);
    setProgress(15);

    // Convert preview coordinates to PDF Points for each item
    const scaleX = originalWidth / previewWidth;
    const scaleY = originalHeight / previewHeight;

    const formattedRedactions = redactions.map(red => {
      return {
        pages: String(red.pageNumber),
        x: Math.round(red.x * scaleX),
        y: Math.round((previewHeight - (red.y + red.height)) * scaleY),
        width: Math.round(red.width * scaleX),
        height: Math.round(red.height * scaleY)
      };
    });

    const formData = new FormData();
    formData.append('file', files[0]);
    formData.append('redactions', JSON.stringify(formattedRedactions));

    try {
      setProgress(50);
      const response = await api.post('/redact', formData, {
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
      alert('Error redacting PDF: ' + (err.response?.data?.error || err.message));
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
          <h2 style={{ fontSize: '1.75rem', marginBottom: '1.5rem', fontFamily: 'var(--font-display)' }}>Redact PDF Content</h2>

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
                    <p style={{ color: 'var(--text-muted)' }}>Loading page preview...</p>
                  </div>
                ) : (
                  previewPage && (
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                      {/* Page selector */}
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <button 
                          className="btn btn-secondary" 
                          onClick={() => setActivePageNumber(p => Math.max(1, p - 1))}
                          disabled={activePageNumber <= 1}
                          style={{ padding: '0.3rem 0.8rem', borderRadius: '6px', fontSize: '0.85rem' }}
                        >
                          Prev Page
                        </button>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                          Page <strong>{activePageNumber}</strong> of {totalPagesCount}
                        </span>
                        <button 
                          className="btn btn-secondary" 
                          onClick={() => setActivePageNumber(p => Math.min(totalPagesCount, p + 1))}
                          disabled={activePageNumber >= totalPagesCount}
                          style={{ padding: '0.3rem 0.8rem', borderRadius: '6px', fontSize: '0.85rem' }}
                        >
                          Next Page
                        </button>
                      </div>

                      <div style={{ width: '100%', display: 'flex', justifyContent: 'center', padding: '0.75rem', border: '1px solid var(--color-border)', borderRadius: '16px', background: 'rgba(255,255,255,0.02)', backdropFilter: 'blur(10px)', marginBottom: '1rem', maxWidth: '500px' }}>
                        <div 
                          ref={previewRef}
                          style={{ 
                            position: 'relative', 
                            width: `${previewWidth}px`, 
                            height: `${previewHeight}px`,
                            boxShadow: '0 8px 25px rgba(0,0,0,0.15)',
                            borderRadius: '8px',
                            border: '1px solid var(--color-border)',
                            userSelect: 'none',
                            cursor: 'crosshair',
                            touchAction: 'none' // Prevent default gestures like pan/scroll while drawing
                          }}
                          onMouseDown={handleMouseDown}
                          onMouseMove={handleMouseMove}
                          onMouseUp={handleMouseUp}
                          onTouchStart={handleTouchStart}
                          onTouchMove={handleTouchMove}
                          onTouchEnd={handleMouseUp}
                        >
                          <img src={previewPage.dataUrl} alt="Redact Preview" style={{ width: '100%', height: '100%', display: 'block', pointerEvents: 'none' }} />
                          
                          {/* Render redaction overlay blocks for the current active page */}
                          {redactions.filter(r => r.pageNumber === activePageNumber).map((red) => (
                            <div 
                              key={red.id}
                              style={{
                                position: 'absolute',
                                left: `${red.x}px`,
                                top: `${red.y}px`,
                                width: `${red.width}px`,
                                height: `${red.height}px`,
                                background: '#000000',
                                border: '1px solid var(--color-coral)',
                                boxShadow: '0 0 4px rgba(255,0,0,0.4)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                            >
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteRedaction(red.id);
                                }}
                                style={{
                                  background: 'var(--color-coral)',
                                  border: 'none',
                                  color: 'white',
                                  borderRadius: '50%',
                                  width: '18px',
                                  height: '18px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '9px',
                                  cursor: 'pointer',
                                  fontWeight: 'bold',
                                  boxShadow: '0 1px 4px rgba(0,0,0,0.3)'
                                }}
                                title="Remove redaction"
                              >
                                X
                              </button>
                            </div>
                          ))}

                          {/* Temporary drawn rectangle */}
                          {tempRect && (
                            <div 
                              style={{
                                position: 'absolute',
                                left: `${tempRect.x}px`,
                                top: `${tempRect.y}px`,
                                width: `${tempRect.width}px`,
                                height: `${tempRect.height}px`,
                                background: 'rgba(0,0,0,0.7)',
                                border: '2px dashed var(--color-coral)'
                              }}
                            />
                          )}
                        </div>
                      </div>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Click & drag or Touch & drag on the page preview above to draw redaction blocks.
                      </span>
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
              <h3 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>PDF Redacted Successfully!</h3>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>The selected area has been permanently blacked out.</p>
              <div style={{ display: 'flex', gap: '1rem', width: '100%', justifyContent: 'center', marginTop: '1.5rem', flexWrap: 'wrap' }}>
                <button 
                  onClick={handleRemoveFile} 
                  className="btn btn-secondary"
                  style={{ borderRadius: '12px', padding: '0.85rem 1.75rem' }}
                >
                  Redact Another File
                </button>
                <a 
                  href={downloadUrl} 
                  download="redacted.pdf"
                  className="btn btn-primary" 
                  style={{ textDecoration: 'none', borderRadius: '12px', padding: '0.85rem 2.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  <Download size={18} /> Download Redacted PDF
                </a>
              </div>
            </div>
          )}

          {isProcessing && (
            <div style={{ width: '100%', maxWidth: '600px' }}>
              <ProgressBar progress={progress} message="Redacting PDF content layers..." />
            </div>
          )}
        </div>
      </div>

      <div className="tool-options-panel" style={{ maxHeight: '85vh', overflowY: 'auto' }}>
        <h3 className="panel-title">Redactions List</h3>
        
        {redactions.length === 0 ? (
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            No redaction blocks drawn yet. Draw blocks on the PDF workspace to add them.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '250px', overflowY: 'auto', paddingRight: '0.25rem' }}>
            {redactions.map((red, idx) => (
              <div 
                key={red.id} 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between', 
                  background: 'rgba(255,255,255,0.03)', 
                  border: '1px solid var(--color-border)', 
                  borderRadius: '8px', 
                  padding: '0.5rem 0.75rem',
                  fontSize: '0.8rem' 
                }}
              >
                <div>
                  <strong>Block #{idx + 1}</strong> (Page {red.pageNumber})
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '2px' }}>
                    x:{Math.round(red.x)}, y:{Math.round(red.y)}, {Math.round(red.width)}x{Math.round(red.height)}px
                  </div>
                </div>
                <button 
                  onClick={() => deleteRedaction(red.id)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--color-coral)', cursor: 'pointer' }}
                  title="Delete"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}

        <button 
          className="btn btn-primary"
          disabled={files.length === 0 || redactions.length === 0 || isProcessing}
          onClick={handleSubmit}
          style={{ width: '100%', marginTop: '0.5rem' }}
        >
          <ScissorsLineDashed size={18} /> Apply Redactions
        </button>
      </div>
    </div>
  );
};

export default RedactPdf;
