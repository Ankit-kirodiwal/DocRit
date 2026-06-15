import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Edit3, Download, FileCheck, Trash2, Plus } from 'lucide-react';
import FileUpload from '../components/FileUpload';
import ProgressBar from '../components/ProgressBar';
import api from '../utils/api';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

interface SignPdfProps {
  onBack: () => void;
}

interface PreviewPage {
  dataUrl: string;
  width: number;
  height: number;
}

interface PlacedSignature {
  id: string;
  signature: string; // base64 image
  pageNumber: number; // 1-indexed
  x: number; // in preview pixels
  y: number; // in preview pixels
  width: number; // in preview pixels
  height: number; // in preview pixels
}

const SignPdf: React.FC<SignPdfProps> = ({ onBack }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  // Signature Pad State
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#000000');
  const [lineWidth] = useState(3);
  const [signatureData, setSignatureData] = useState<string | null>(null);

  // Multiple Signatures state
  const [placedSignatures, setPlacedSignatures] = useState<PlacedSignature[]>([]);
  const [activeSignatureId, setActiveSignatureId] = useState<string | null>(null);

  // Active page page-flipping state
  const [activePageNumber, setActivePageNumber] = useState(1);
  const [totalPagesCount, setTotalPagesCount] = useState(0);

  // Preview rendering state
  const [isLoadingPages, setIsLoadingPages] = useState(false);
  const [previewPage, setPreviewPage] = useState<PreviewPage | null>(null);
  const [originalWidth, setOriginalWidth] = useState(0);
  const [originalHeight, setOriginalHeight] = useState(0);
  const [renderError, setRenderError] = useState<string | null>(null);

  // Bounding box drag and resize state
  const [dragAction, setDragAction] = useState<{
    type: 'drag' | 'resize-br';
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
      setPlacedSignatures([]);
      setActiveSignatureId(null);
      setActivePageNumber(1);
      setRenderError(null);
    }
  };

  const handleRemoveFile = () => {
    setFiles([]);
    setDownloadUrl(null);
    setPreviewPage(null);
    setPlacedSignatures([]);
    setActiveSignatureId(null);
    setActivePageNumber(1);
    setRenderError(null);
  };

  // Render Page preview depending on activePageNumber
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

        const pageNum = Math.max(1, Math.min(pdf.numPages, activePageNumber));
        const page = await pdf.getPage(pageNum);
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
        console.error('Error rendering page preview:', err);
        setRenderError(err.message || String(err));
      } finally {
        setIsLoadingPages(false);
      }
    };

    fileReader.readAsArrayBuffer(file);
  }, [files, activePageNumber]);

  // Place current drawn signature onto active page
  const handlePlaceSignature = () => {
    if (!signatureData) return;
    const newId = Math.random().toString(36).substring(7);
    const newSig: PlacedSignature = {
      id: newId,
      signature: signatureData,
      pageNumber: activePageNumber,
      x: previewWidth / 2 - 50,
      y: previewHeight / 2 - 25,
      width: 100,
      height: 50
    };
    setPlacedSignatures(prev => [...prev, newSig]);
    setActiveSignatureId(newId);
  };

  const handleDeletePlacedSignature = (id: string) => {
    setPlacedSignatures(prev => prev.filter(s => s.id !== id));
    if (activeSignatureId === id) {
      setActiveSignatureId(null);
    }
  };

  // Signature Pad Event Handlers
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);
    const rect = canvas.getBoundingClientRect();
    
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    saveSignatureImage();
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureData(null);
  };

  const saveSignatureImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    setSignatureData(dataUrl);
  };

  // Drag and Resize handlers
  const handleStart = (
    clientX: number,
    clientY: number,
    sigId: string,
    actionType: 'drag' | 'resize-br'
  ) => {
    setActiveSignatureId(sigId);
    const sig = placedSignatures.find(s => s.id === sigId);
    if (!sig) return;
    setDragAction({
      type: actionType,
      startX: clientX,
      startY: clientY,
      startBox: { x: sig.x, y: sig.y, width: sig.width, height: sig.height }
    });
  };

  const handleOverlayMouseDown = (e: React.MouseEvent, sigId: string, actionType: 'drag' | 'resize-br') => {
    e.preventDefault();
    e.stopPropagation();
    handleStart(e.clientX, e.clientY, sigId, actionType);
  };

  const handleOverlayTouchStart = (e: React.TouchEvent, sigId: string, actionType: 'drag' | 'resize-br') => {
    e.stopPropagation();
    if (e.touches.length > 0) {
      handleStart(e.touches[0].clientX, e.touches[0].clientY, sigId, actionType);
    }
  };

  useEffect(() => {
    if (!dragAction || !activeSignatureId) return;

    const move = (clientX: number, clientY: number) => {
      const dx = clientX - dragAction.startX;
      const dy = clientY - dragAction.startY;
      const box = { ...dragAction.startBox };

      if (dragAction.type === 'drag') {
        box.x = Math.max(0, Math.min(previewWidth - box.width, box.x + dx));
        box.y = Math.max(0, Math.min(previewHeight - box.height, box.y + dy));
      } else if (dragAction.type === 'resize-br') {
        box.width = Math.max(20, Math.min(previewWidth - box.x, box.width + dx));
        box.height = Math.max(10, Math.min(previewHeight - box.y, box.height + dy));
      }

      setPlacedSignatures(prev => prev.map(s => s.id === activeSignatureId ? { ...s, x: box.x, y: box.y, width: box.width, height: box.height } : s));
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
  }, [dragAction, activeSignatureId, previewWidth, previewHeight]);

  // Manual coordination setters for currently active signature
  const activeSig = placedSignatures.find(s => s.id === activeSignatureId);
  const scaleX = originalWidth / previewWidth;
  const scaleY = originalHeight / previewHeight;

  const handleManualXChange = (val: number) => {
    if (!activeSig) return;
    const newX = val / scaleX;
    setPlacedSignatures(prev => prev.map(s => s.id === activeSignatureId ? { ...s, x: Math.max(0, Math.min(previewWidth - s.width, newX)) } : s));
  };

  const handleManualYChange = (val: number) => {
    if (!activeSig) return;
    const newY = previewHeight - (val / scaleY) - activeSig.height;
    setPlacedSignatures(prev => prev.map(s => s.id === activeSignatureId ? { ...s, y: Math.max(0, Math.min(previewHeight - s.height, newY)) } : s));
  };

  const handleManualWidthChange = (val: number) => {
    if (!activeSig) return;
    const newWidth = val / scaleX;
    setPlacedSignatures(prev => prev.map(s => s.id === activeSignatureId ? { ...s, width: Math.max(10, Math.min(previewWidth - s.x, newWidth)) } : s));
  };

  const handleManualHeightChange = (val: number) => {
    if (!activeSig) return;
    const newHeight = val / scaleY;
    setPlacedSignatures(prev => prev.map(s => s.id === activeSignatureId ? { ...s, height: Math.max(10, Math.min(previewHeight - s.y, newHeight)) } : s));
  };

  const handleManualPageChange = (val: number) => {
    if (!activeSig) return;
    const targetPage = Math.max(1, Math.min(totalPagesCount, val));
    setPlacedSignatures(prev => prev.map(s => s.id === activeSignatureId ? { ...s, pageNumber: targetPage } : s));
  };

  const handleSubmit = async () => {
    if (files.length === 0) return;
    if (placedSignatures.length === 0) {
      alert('Please place at least one signature on the PDF page.');
      return;
    }

    setIsProcessing(true);
    setProgress(15);

    // Format all placed signatures for backend
    const formattedSignatures = placedSignatures.map(sig => {
      return {
        signature: sig.signature,
        pages: String(sig.pageNumber),
        x: Math.round(sig.x * scaleX),
        y: Math.round((previewHeight - (sig.y + sig.height)) * scaleY),
        width: Math.round(sig.width * scaleX),
        height: Math.round(sig.height * scaleY)
      };
    });

    const formData = new FormData();
    formData.append('file', files[0]);
    formData.append('signatures', JSON.stringify(formattedSignatures));

    try {
      setProgress(50);
      const response = await api.post('/sign', formData, {
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
      alert('Error signing PDF: ' + (err.response?.data?.error || err.message));
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
          <h2 style={{ fontSize: '1.75rem', marginBottom: '1.5rem', fontFamily: 'var(--font-display)' }}>Sign PDF Document</h2>

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
                    <p style={{ color: 'var(--text-muted)' }}>Rendering PDF signature workspace...</p>
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

                      {/* Main PDF preview canvas */}
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
                          <img src={previewPage.dataUrl} alt="Sign Preview Page" style={{ width: '100%', height: '100%', display: 'block', pointerEvents: 'none' }} />
                          
                          {/* Render all placed signatures for current active page */}
                          {placedSignatures.filter(s => s.pageNumber === activePageNumber).map((sig) => {
                            const isActive = activeSignatureId === sig.id;
                            return (
                              <div 
                                key={sig.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveSignatureId(sig.id);
                                }}
                                style={{
                                  position: 'absolute',
                                  left: `${sig.x}px`,
                                  top: `${sig.y}px`,
                                  width: `${sig.width}px`,
                                  height: `${sig.height}px`,
                                  border: isActive ? '2px dashed var(--color-primary)' : '1px dashed var(--text-muted)',
                                  background: isActive ? 'rgba(56, 87, 35, 0.08)' : 'rgba(255, 255, 255, 0.03)',
                                  cursor: 'move',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  boxShadow: isActive ? '0 0 8px rgba(0, 0, 0, 0.25)' : 'none'
                                }}
                                onMouseDown={(e) => handleOverlayMouseDown(e, sig.id, 'drag')}
                                onTouchStart={(e) => handleOverlayTouchStart(e, sig.id, 'drag')}
                              >
                                <img 
                                  src={sig.signature} 
                                  alt="Signature Overlay" 
                                  style={{ 
                                    width: '100%', 
                                    height: '100%', 
                                    objectFit: 'contain',
                                    pointerEvents: 'none' 
                                  }} 
                                />
                                
                                {/* Resize Handle (Bottom Right Corner) */}
                                {isActive && (
                                  <div 
                                    style={{ 
                                      position: 'absolute', 
                                      bottom: '-4px', 
                                      right: '-4px', 
                                      width: '10px', 
                                      height: '10px', 
                                      background: 'var(--color-primary)', 
                                      border: '1px solid white', 
                                      borderRadius: '50%',
                                      cursor: 'se-resize' 
                                    }} 
                                    onMouseDown={(e) => handleOverlayMouseDown(e, sig.id, 'resize-br')}
                                    onTouchStart={(e) => handleOverlayTouchStart(e, sig.id, 'resize-br')}
                                  />
                                )}
                              </div>
                            );
                          })}
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
              <h3 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>PDF Signed Successfully!</h3>
              <div style={{ display: 'flex', gap: '1rem', width: '100%', justifyContent: 'center', marginTop: '1.5rem', flexWrap: 'wrap' }}>
                <button 
                  onClick={handleRemoveFile} 
                  className="btn btn-secondary"
                  style={{ borderRadius: '12px', padding: '0.85rem 1.75rem' }}
                >
                  Sign Another File
                </button>
                <a 
                  href={downloadUrl} 
                  download="signed.pdf"
                  className="btn btn-primary" 
                  style={{ textDecoration: 'none', borderRadius: '12px', padding: '0.85rem 2.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  <Download size={18} /> Download Signed PDF
                </a>
              </div>
            </div>
          )}

          {isProcessing && (
            <div style={{ width: '100%', maxWidth: '600px' }}>
              <ProgressBar progress={progress} message="Signing PDF document layers..." />
            </div>
          )}
        </div>
      </div>

      {/* Options Panel contains ONLY the draw pad now */}
      <div className="tool-options-panel" style={{ maxHeight: '85vh', overflowY: 'auto' }}>
        <h3 className="panel-title">Draw Signature</h3>
        
        <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ border: '1px solid var(--color-border)', borderRadius: '8px', background: 'rgba(255,255,255,0.01)', overflow: 'hidden' }}>
            <canvas 
              ref={canvasRef}
              width={250}
              height={120}
              style={{ display: 'block', background: '#ffffff', cursor: 'crosshair', touchAction: 'none' }}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              {['#000000', '#0000ff', '#ff0000'].map((c) => (
                <button 
                  key={c}
                  onClick={() => setColor(c)}
                  style={{ 
                    width: '20px', 
                    height: '20px', 
                    borderRadius: '50%', 
                    backgroundColor: c, 
                    border: color === c ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                    cursor: 'pointer'
                  }} 
                />
              ))}
            </div>
            <button 
              onClick={clearCanvas} 
              className="btn btn-secondary" 
              style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
            >
              <Trash2 size={12} /> Clear
            </button>
          </div>

          <button 
            onClick={handlePlaceSignature}
            className="btn btn-secondary"
            disabled={!signatureData || files.length === 0}
            style={{ width: '100%', marginTop: '0.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', borderStyle: 'dashed' }}
          >
            <Plus size={16} /> Place Signature on Page
          </button>
        </div>

        {/* Signatures List Card (Positioned after the Signature Pad) */}
        <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--color-border)', paddingTop: '1.5rem' }}>
          <h3 style={{ fontSize: '1.15rem', marginBottom: '1rem', fontFamily: 'var(--font-display)' }}>Signatures List</h3>
          
          {placedSignatures.length === 0 ? (
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              No signatures placed yet. Draw one in the drawing pad and click "+ Place Signature on Page".
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem', maxHeight: '300px', overflowY: 'auto', paddingRight: '0.25rem' }}>
              {placedSignatures.map((sig, idx) => {
                const isActive = sig.id === activeSignatureId;
                return (
                  <div 
                    key={sig.id} 
                    style={{ 
                      display: 'flex', 
                      flexDirection: 'column', 
                      gap: '0.5rem', 
                      background: isActive ? 'rgba(56, 87, 35, 0.05)' : 'rgba(255,255,255,0.01)', 
                      border: isActive ? '1px solid var(--color-primary)' : '1px solid var(--color-border)', 
                      borderRadius: '12px', 
                      padding: '0.75rem' 
                    }}
                  >
                    <div 
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                      onClick={() => setActiveSignatureId(sig.id)}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                        <img 
                          src={sig.signature} 
                          alt="Signature thumbnail" 
                          style={{ height: '30px', maxWidth: '60px', background: '#fff', border: '1px solid var(--color-border)', borderRadius: '4px', objectFit: 'contain' }} 
                        />
                        <div>
                          <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>Signature #{idx + 1}</span>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>(Page {sig.pageNumber})</span>
                        </div>
                      </div>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeletePlacedSignature(sig.id);
                        }}
                        style={{ background: 'transparent', border: 'none', color: 'var(--color-coral)', cursor: 'pointer' }}
                        title="Remove signature"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    {/* If active, show editing controls inline! */}
                    {isActive && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.5rem', marginTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.5rem' }}>
                        <div>
                          <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Page</label>
                          <input 
                            type="number" 
                            value={sig.pageNumber} 
                            onChange={(e) => handleManualPageChange(Number(e.target.value))} 
                            style={{ width: '100%', boxSizing: 'border-box', fontSize: '0.8rem', padding: '0.2rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--color-border)', borderRadius: '4px', color: 'var(--text-primary)' }} 
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>X (pts)</label>
                          <input 
                            type="number" 
                            value={Math.round(sig.x * scaleX)} 
                            onChange={(e) => handleManualXChange(Number(e.target.value))} 
                            style={{ width: '100%', boxSizing: 'border-box', fontSize: '0.8rem', padding: '0.2rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--color-border)', borderRadius: '4px', color: 'var(--text-primary)' }} 
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Y (pts)</label>
                          <input 
                            type="number" 
                            value={Math.round((previewHeight - (sig.y + sig.height)) * scaleY)} 
                            onChange={(e) => handleManualYChange(Number(e.target.value))} 
                            style={{ width: '100%', boxSizing: 'border-box', fontSize: '0.8rem', padding: '0.2rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--color-border)', borderRadius: '4px', color: 'var(--text-primary)' }} 
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Width</label>
                          <input 
                            type="number" 
                            value={Math.round(sig.width * scaleX)} 
                            onChange={(e) => handleManualWidthChange(Number(e.target.value))} 
                            style={{ width: '100%', boxSizing: 'border-box', fontSize: '0.8rem', padding: '0.2rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--color-border)', borderRadius: '4px', color: 'var(--text-primary)' }} 
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Height</label>
                          <input 
                            type="number" 
                            value={Math.round(sig.height * scaleY)} 
                            onChange={(e) => handleManualHeightChange(Number(e.target.value))} 
                            style={{ width: '100%', boxSizing: 'border-box', fontSize: '0.8rem', padding: '0.2rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--color-border)', borderRadius: '4px', color: 'var(--text-primary)' }} 
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <button 
            className="btn btn-primary"
            disabled={files.length === 0 || placedSignatures.length === 0 || isProcessing}
            onClick={handleSubmit}
            style={{ width: '100%' }}
          >
            <Edit3 size={18} /> Apply Signatures
          </button>
        </div>
      </div>
    </div>
  );
};

export default SignPdf;
