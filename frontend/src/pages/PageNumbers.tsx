import React, { useState, useEffect } from 'react';
import { ArrowLeft, Hash, Download, FileCheck } from 'lucide-react';
import FileUpload from '../components/FileUpload';
import ProgressBar from '../components/ProgressBar';
import api from '../utils/api';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

interface PageNumbersProps {
  onBack: () => void;
}

const PageNumbers: React.FC<PageNumbersProps> = ({ onBack }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [position, setPosition] = useState('bottom-right');
  const [format, setFormat] = useState('page-number');
  const [fontSize, setFontSize] = useState('12');
  const [startNumber, setStartNumber] = useState('1');
  const [hasCoverPage, setHasCoverPage] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  // Preview rendering state
  const [isLoadingPages, setIsLoadingPages] = useState(false);
  const [previewPages, setPreviewPages] = useState<{ index: number; dataUrl: string; width: number; height: number }[]>([]);
  const [totalPagesCount, setTotalPagesCount] = useState(0);

  const handleFilesSelected = (newFiles: File[]) => {
    if (newFiles.length > 0) {
      setFiles([newFiles[0]]);
      setDownloadUrl(null);
      setPreviewPages([]);
      setTotalPagesCount(0);
    }
  };

  const handleRemoveFile = () => {
    setFiles([]);
    setDownloadUrl(null);
    setPreviewPages([]);
    setTotalPagesCount(0);
  };

  useEffect(() => {
    if (files.length === 0) return;
    
    const file = files[0];
    const fileReader = new FileReader();
    setIsLoadingPages(true);

    fileReader.onload = async function () {
      try {
        const typedarray = new Uint8Array(this.result as ArrayBuffer);
        const loadingTask = pdfjsLib.getDocument({ data: typedarray });
        const pdf = await loadingTask.promise;
        const totalPages = pdf.numPages;
        setTotalPagesCount(totalPages);

        const loadedPreviews = [];
        // Load up to first 2 pages for preview
        const pagesToLoad = Math.min(2, totalPages);

        for (let i = 1; i <= pagesToLoad; i++) {
          const page = await pdf.getPage(i);
          // Scale to a nice display size
          const viewport = page.getViewport({ scale: 0.6 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const context = canvas.getContext('2d');
          if (context) {
            await page.render({
              canvasContext: context,
              viewport: viewport
            }).promise;
            
            loadedPreviews.push({
              index: i - 1,
              dataUrl: canvas.toDataURL('image/jpeg', 0.8),
              width: viewport.width,
              height: viewport.height
            });
          }
        }
        setPreviewPages(loadedPreviews);
      } catch (err) {
        console.error('Error rendering page previews:', err);
      } finally {
        setIsLoadingPages(false);
      }
    };

    fileReader.readAsArrayBuffer(file);
  }, [files]);

  const handleSubmit = async () => {
    if (files.length === 0) return;
    setIsProcessing(true);
    setProgress(15);
    setDownloadUrl(null);

    const formData = new FormData();
    formData.append('file', files[0]);
    formData.append('position', position);
    formData.append('format', format);
    formData.append('fontSize', fontSize);
    formData.append('startNumber', startNumber);
    formData.append('hasCoverPage', String(hasCoverPage));

    try {
      setProgress(45);
      const response = await api.post('/page-numbers', formData, {
        responseType: 'blob',
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1));
          setProgress(45 + percentCompleted * 0.35);
        }
      });

      setProgress(90);
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      setDownloadUrl(url);
      setProgress(100);
    } catch (err: any) {
      console.error(err);
      alert('Error adding page numbers: ' + (err.response?.data?.error || err.message));
      setProgress(0);
    } finally {
      setIsProcessing(false);
    }
  };

  // Helper to generate simulated text
  const getSimulatedNumberText = (pageIndex: number) => {
    const startNum = parseInt(startNumber || '1', 10);
    if (hasCoverPage && pageIndex === 0) {
      return ''; // No page number on cover
    }
    const val = hasCoverPage ? (startNum + pageIndex - 1) : (startNum + pageIndex);
    if (format === 'page-of') {
      const adjustedTotal = hasCoverPage ? Math.max(1, totalPagesCount - 1) : totalPagesCount;
      return `${val} of ${adjustedTotal}`;
    }
    return `${val}`;
  };

  // Helper to get CSS placement for overlay
  const getOverlayPlacementStyle = () => {
    // scale font size for preview (since preview is scaled by ~0.6, we also scale the preview font size)
    const scaledFontSize = Math.max(8, Math.round(parseInt(fontSize || '12', 10) * 0.8));
    
    const baseStyle: React.CSSProperties = {
      position: 'absolute',
      fontSize: `${scaledFontSize}px`,
      color: '#333333',
      fontFamily: 'Helvetica, Arial, sans-serif',
      fontWeight: 'normal',
      padding: '4px 8px',
      backgroundColor: 'rgba(255, 255, 255, 0.75)',
      borderRadius: '4px',
      border: '1px dashed #666',
      pointerEvents: 'none',
      whiteSpace: 'nowrap'
    };

    switch (position) {
      case 'top-left':
        return { ...baseStyle, top: '12px', left: '16px' };
      case 'top-center':
        return { ...baseStyle, top: '12px', left: '50%', transform: 'translateX(-50%)' };
      case 'top-right':
        return { ...baseStyle, top: '12px', right: '16px' };
      case 'bottom-left':
        return { ...baseStyle, bottom: '12px', left: '16px' };
      case 'bottom-center':
        return { ...baseStyle, bottom: '12px', left: '50%', transform: 'translateX(-50%)' };
      case 'bottom-right':
      default:
        return { ...baseStyle, bottom: '12px', right: '16px' };
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
          <h2 style={{ fontSize: '1.75rem', marginBottom: '1.5rem', fontFamily: 'var(--font-display)' }}>Add Page Numbers</h2>
          
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
                    <p style={{ color: 'var(--text-muted)' }}>Generating page numbering preview...</p>
                  </div>
                ) : (
                  <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '2rem', justifyContent: 'center', flexWrap: 'wrap', width: '100%', maxWidth: '850px', padding: '1.5rem', border: '1px solid var(--color-border)', borderRadius: '16px', background: 'rgba(255,255,255,0.02)', backdropFilter: 'blur(10px)', marginBottom: '1.5rem' }}>
                      {previewPages.map((page) => {
                        const numText = getSimulatedNumberText(page.index);
                        return (
                          <div 
                            key={page.index} 
                            style={{ 
                              display: 'flex', 
                              flexDirection: 'column', 
                              alignItems: 'center',
                              gap: '0.5rem'
                            }}
                          >
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                              {page.index === 0 ? 'Page 1 (First Page)' : `Page ${page.index + 1}`}
                            </span>
                            
                            <div style={{ 
                              position: 'relative', 
                              width: `${page.width}px`, 
                              height: `${page.height}px`,
                              boxShadow: '0 8px 20px rgba(0,0,0,0.15)',
                              borderRadius: '8px',
                              overflow: 'hidden',
                              border: '1px solid var(--color-border)'
                            }}>
                              <img src={page.dataUrl} alt={`Preview page ${page.index + 1}`} style={{ width: '100%', height: '100%' }} />
                              
                              {numText && (
                                <div style={getOverlayPlacementStyle()}>
                                  {numText}
                                </div>
                              )}
                              {hasCoverPage && page.index === 0 && (
                                <div style={{ 
                                  position: 'absolute', 
                                  top: '50%', 
                                  left: '50%', 
                                  transform: 'translate(-50%, -50%)',
                                  background: 'rgba(238, 108, 77, 0.95)',
                                  color: 'white',
                                  fontSize: '0.75rem',
                                  fontWeight: 600,
                                  padding: '4px 10px',
                                  borderRadius: '6px',
                                  border: '1px solid white',
                                  boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                                }}>
                                  Cover Page (No Number)
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                
              </div>
            )
          ) : (
            <div style={{ textAlign: 'center', padding: '2rem', margin: 'auto' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: '#e2f0d9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', color: '#385723' }}>
                <FileCheck size={36} />
              </div>
              <h3 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Page Numbers Added!</h3>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Your document is ready to download.</p>
              <div style={{ display: 'flex', gap: '1rem', width: '100%', justifyContent: 'center', marginTop: '1.5rem', flexWrap: 'wrap' }}>
                <button 
                  onClick={handleRemoveFile} 
                  className="btn btn-secondary"
                  style={{ borderRadius: '12px', padding: '0.85rem 1.75rem' }}
                >
                  Number Another File
                </button>
                <a 
                  href={downloadUrl} 
                  download={`numbered_${files[0]?.name || 'document.pdf'}`}
                  className="btn btn-primary" 
                  style={{ textDecoration: 'none', borderRadius: '12px', padding: '0.85rem 2.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  <Download size={18} /> Download Numbered PDF
                </a>
              </div>
            </div>
          )}

          {isProcessing && (
            <div style={{ width: '100%', maxWidth: '600px' }}>
              <ProgressBar progress={progress} message="Adding page numbers to document pages..." />
            </div>
          )}
        </div>
      </div>

      <div className="tool-options-panel">
        <h3 className="panel-title">Page Number Settings</h3>
        
        <div className="form-group">
          <label className="form-label" htmlFor="position-select">Position</label>
          <select 
            id="position-select"
            className="form-select"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            disabled={isProcessing || files.length === 0}
          >
            <option value="bottom-right">Bottom Right</option>
            <option value="bottom-center">Bottom Center</option>
            <option value="bottom-left">Bottom Left</option>
            <option value="top-right">Top Right</option>
            <option value="top-center">Top Center</option>
            <option value="top-left">Top Left</option>
          </select>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="format-select">Format</label>
          <select 
            id="format-select"
            className="form-select"
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            disabled={isProcessing || files.length === 0}
          >
            <option value="page-number">Simple Number (e.g. 1)</option>
            <option value="page-of">Page X of Y (e.g. 1 of 5)</option>
          </select>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="font-size-input">Font Size</label>
          <input
            id="font-size-input"
            type="number"
            className="form-input"
            value={fontSize}
            onChange={(e) => setFontSize(e.target.value)}
            disabled={isProcessing || files.length === 0}
            min="6"
            max="36"
          />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="start-number-input">Start From</label>
          <input
            id="start-number-input"
            type="number"
            className="form-input"
            value={startNumber}
            onChange={(e) => setStartNumber(e.target.value)}
            disabled={isProcessing || files.length === 0}
            min="1"
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer', marginTop: '0.5rem', marginBottom: '1.25rem', userSelect: 'none' }}>
          <input
            type="checkbox"
            id="cover-page-checkbox"
            checked={hasCoverPage}
            onChange={(e) => setHasCoverPage(e.target.checked)}
            disabled={isProcessing || files.length === 0}
            style={{ accentColor: 'var(--color-green)' }}
          />
          <label htmlFor="cover-page-checkbox" style={{ cursor: 'pointer', color: 'var(--text-secondary)' }}>
            Cover Page (skip numbering first page)
          </label>
        </div>

        <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <button 
            className="btn btn-primary"
            disabled={files.length === 0 || isProcessing}
            onClick={handleSubmit}
            style={{ width: '100%', opacity: (files.length === 0 || isProcessing) ? 0.6 : 1 }}
          >
            <Hash size={18} /> Add Page Numbers
          </button>
        </div>
      </div>
    </div>
  );
};

export default PageNumbers;
