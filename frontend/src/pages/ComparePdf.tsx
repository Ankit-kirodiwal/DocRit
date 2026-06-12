import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowLeft, 
  Download, 
  ZoomIn, 
  ZoomOut, 
  ChevronLeft, 
  ChevronRight, 
  Sparkles
} from 'lucide-react';
import FileUpload from '../components/FileUpload';
import ProgressBar from '../components/ProgressBar';
import api from '../utils/api';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

interface ComparePdfProps {
  onBack: () => void;
}

interface CompareReport {
  summary: {
    total_differences: number;
    added: number;
    removed: number;
    modified: number;
  };
  differences: Array<{
    page: number;
    type: string;
    content?: string;
    bbox?: number[];
  }>;
}

const ComparePdf: React.FC<ComparePdfProps> = ({ onBack }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  
  // PDF Document sources
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [modifiedUrl, setModifiedUrl] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [report, setReport] = useState<CompareReport | null>(null);

  // PDF.js Documents
  const [originalPdfDoc, setOriginalPdfDoc] = useState<any>(null);
  const [modifiedPdfDoc, setModifiedPdfDoc] = useState<any>(null);

  // Viewer State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [zoomScale, setZoomScale] = useState<number>(1.2);

  // Synchronized Scrolling Refs
  const leftScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const rightScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const isScrollingLeft = useRef<boolean>(false);
  const isScrollingRight = useRef<boolean>(false);

  // Canvas Refs
  const originalCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const modifiedCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const handleFilesSelected = (newFiles: File[]) => {
    setFiles((prev) => [...prev, ...newFiles].slice(0, 2));
    resetViewer();
  };

  const handleRemoveFile = (index: number) => {
    setFiles((prev) => prev.filter((_, idx) => idx !== index));
    resetViewer();
  };

  const resetViewer = () => {
    setOriginalUrl(null);
    setModifiedUrl(null);
    setDownloadUrl(null);
    setReport(null);
    setOriginalPdfDoc(null);
    setModifiedPdfDoc(null);
    setCurrentPage(1);
    setTotalPages(1);
  };

  const handleSubmit = async () => {
    if (files.length < 2) {
      alert('Please upload exactly two PDF files to compare.');
      return;
    }
    setIsProcessing(true);
    setProgress(15);
    resetViewer();

    const formData = new FormData();
    // files[0] is original, files[1] is modified
    formData.append('files', files[0]);
    formData.append('files', files[1]);

    try {
      setProgress(40);
      const response = await api.post('/compare', formData, {
        onUploadProgress: (progressEvent) => {
          const percent = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1));
          setProgress(40 + percent * 0.4);
        }
      });

      setProgress(85);
      const { originalPdfBytes, modifiedPdfBytes, report: resReport } = response.data;
      setReport(resReport);

      if (originalPdfBytes) {
        const origBinary = window.atob(originalPdfBytes);
        const origBytes = new Uint8Array(origBinary.length);
        for (let i = 0; i < origBinary.length; i++) {
          origBytes[i] = origBinary.charCodeAt(i);
        }
        const origBlob = new Blob([origBytes.buffer], { type: 'application/pdf' });
        const origUrl = window.URL.createObjectURL(origBlob);
        setOriginalUrl(origUrl);
      }

      if (modifiedPdfBytes) {
        const modBinary = window.atob(modifiedPdfBytes);
        const modBytes = new Uint8Array(modBinary.length);
        for (let i = 0; i < modBinary.length; i++) {
          modBytes[i] = modBinary.charCodeAt(i);
        }
        const modBlob = new Blob([modBytes.buffer], { type: 'application/pdf' });
        const modUrl = window.URL.createObjectURL(modBlob);
        setModifiedUrl(modUrl);
        setDownloadUrl(modUrl); // The modified PDF with all highlights is the download PDF!
      }

      setProgress(100);
    } catch (err: any) {
      console.error(err);
      alert('Error comparing PDFs: ' + (err.response?.data?.error || err.message));
      setProgress(0);
    } finally {
      setIsProcessing(false);
    }
  };

  // Load PDF.js documents when urls are loaded
  useEffect(() => {
    if (!originalUrl || !modifiedUrl) return;
    
    let isMounted = true;
    const loadPdfDocs = async () => {
      try {
        const origTask = pdfjsLib.getDocument(originalUrl);
        const modTask = pdfjsLib.getDocument(modifiedUrl);
        const [origDoc, modDoc] = await Promise.all([origTask.promise, modTask.promise]);

        if (isMounted) {
          setOriginalPdfDoc(origDoc);
          setModifiedPdfDoc(modDoc);
          setTotalPages(Math.max(origDoc.numPages, modDoc.numPages));
          setCurrentPage(1);
        }
      } catch (e) {
        console.error('Failed to load PDF documents in viewer', e);
      }
    };
    loadPdfDocs();
    return () => {
      isMounted = false;
    };
  }, [originalUrl, modifiedUrl]);

  // Render original page
  useEffect(() => {
    if (!originalPdfDoc || !originalCanvasRef.current) return;

    let isMounted = true;
    const canvas = originalCanvasRef.current;
    const ctx = canvas.getContext('2d');

    const render = async () => {
      try {
        if (currentPage > originalPdfDoc.numPages) {
          if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
          return;
        }
        const page = await originalPdfDoc.getPage(currentPage);
        const viewport = page.getViewport({ scale: zoomScale });
        if (isMounted && ctx) {
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.render({
            canvasContext: ctx,
            viewport: viewport
          }).promise;
        }
      } catch (e) {
        console.error('Error rendering original page:', e);
      }
    };
    render();
    return () => {
      isMounted = false;
    };
  }, [originalPdfDoc, currentPage, zoomScale]);

  // Render modified page
  useEffect(() => {
    if (!modifiedPdfDoc || !modifiedCanvasRef.current) return;

    let isMounted = true;
    const canvas = modifiedCanvasRef.current;
    const ctx = canvas.getContext('2d');

    const render = async () => {
      try {
        if (currentPage > modifiedPdfDoc.numPages) {
          if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
          return;
        }
        const page = await modifiedPdfDoc.getPage(currentPage);
        const viewport = page.getViewport({ scale: zoomScale });
        if (isMounted && ctx) {
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.render({
            canvasContext: ctx,
            viewport: viewport
          }).promise;
        }
      } catch (e) {
        console.error('Error rendering modified page:', e);
      }
    };
    render();
    return () => {
      isMounted = false;
    };
  }, [modifiedPdfDoc, currentPage, zoomScale]);

  // Synchronized Scrolling logic
  const handleLeftScroll = () => {
    if (isScrollingRight.current) return;
    isScrollingLeft.current = true;
    if (leftScrollContainerRef.current && rightScrollContainerRef.current) {
      rightScrollContainerRef.current.scrollTop = leftScrollContainerRef.current.scrollTop;
      rightScrollContainerRef.current.scrollLeft = leftScrollContainerRef.current.scrollLeft;
    }
    setTimeout(() => {
      isScrollingLeft.current = false;
    }, 50);
  };

  const handleRightScroll = () => {
    if (isScrollingLeft.current) return;
    isScrollingRight.current = true;
    if (leftScrollContainerRef.current && rightScrollContainerRef.current) {
      leftScrollContainerRef.current.scrollTop = rightScrollContainerRef.current.scrollTop;
      leftScrollContainerRef.current.scrollLeft = rightScrollContainerRef.current.scrollLeft;
    }
    setTimeout(() => {
      isScrollingRight.current = false;
    }, 50);
  };

  const handlePrevPage = () => {
    setCurrentPage((p) => Math.max(p - 1, 1));
  };

  const handleNextPage = () => {
    setCurrentPage((p) => Math.min(p + 1, totalPages));
  };

  const handleZoomIn = () => {
    setZoomScale((z) => Math.min(z + 0.2, 3.0));
  };

  const handleZoomOut = () => {
    setZoomScale((z) => Math.max(z - 0.2, 0.6));
  };

  return (
    <div className="tool-page-container">
      <div className="tool-workspace" style={{ paddingBottom: '2rem' }}>
        <button 
          className="file-remove-btn" 
          style={{ 
            top: '1.5rem', 
            left: '1.5rem', 
            width: 'auto', 
            height: 'auto', 
            borderRadius: '8px', 
            padding: '0.4rem 0.8rem', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.4rem' 
          }} 
          onClick={onBack}
        >
          <ArrowLeft size={16} /> Back to Tools
        </button>

        <div style={{ width: '100%', marginTop: '3rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.75rem', marginBottom: '1.5rem', fontFamily: 'var(--font-display)' }}>Compare PDF Revisions</h2>

          {!downloadUrl ? (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
              <FileUpload
                accept="application/pdf"
                multiple={true}
                onFilesSelected={handleFilesSelected}
                selectedFiles={files}
                onRemoveFile={handleRemoveFile}
              />
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                Upload exactly 2 PDF documents (Original first, then Modified revision).
              </p>
            </div>
          ) : (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              
              {/* Toolbar Controls */}
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                background: 'rgba(255,255,255,0.03)', 
                border: '1px solid var(--color-border)', 
                borderRadius: '12px', 
                padding: '0.75rem 1rem',
                gap: '1rem',
                flexWrap: 'wrap'
              }}>
                {/* Pagination */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <button 
                    onClick={handlePrevPage} 
                    disabled={currentPage === 1}
                    className="btn btn-secondary" 
                    style={{ padding: '0.4rem', minWidth: 'auto', borderRadius: '6px' }}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                    Page {currentPage} of {totalPages}
                  </span>
                  <button 
                    onClick={handleNextPage} 
                    disabled={currentPage === totalPages}
                    className="btn btn-secondary" 
                    style={{ padding: '0.4rem', minWidth: 'auto', borderRadius: '6px' }}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>

                {/* Zoom controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <button 
                    onClick={handleZoomOut} 
                    disabled={zoomScale <= 0.6}
                    className="btn btn-secondary" 
                    style={{ padding: '0.4rem', minWidth: 'auto', borderRadius: '6px' }}
                  >
                    <ZoomOut size={16} />
                  </button>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600, minWidth: '45px', textAlign: 'center' }}>
                    {Math.round(zoomScale * 100)}%
                  </span>
                  <button 
                    onClick={handleZoomIn} 
                    disabled={zoomScale >= 3.0}
                    className="btn btn-secondary" 
                    style={{ padding: '0.4rem', minWidth: 'auto', borderRadius: '6px' }}
                  >
                    <ZoomIn size={16} />
                  </button>
                </div>

                {/* Legend explanation */}
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem' }}>
                    <span style={{ width: '10px', height: '10px', background: '#22c55e', borderRadius: '2px', display: 'inline-block' }}></span>
                    <span>Added</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem' }}>
                    <span style={{ width: '10px', height: '10px', background: '#ef4444', borderRadius: '2px', display: 'inline-block' }}></span>
                    <span>Removed</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem' }}>
                    <span style={{ width: '10px', height: '10px', background: '#eab308', borderRadius: '2px', display: 'inline-block' }}></span>
                    <span>Modified</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem' }}>
                    <span style={{ width: '10px', height: '10px', background: '#f97316', borderRadius: '2px', display: 'inline-block' }}></span>
                    <span>Visual Change</span>
                  </div>
                </div>

                {/* Downloads */}
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button 
                    onClick={resetViewer} 
                    className="btn btn-secondary" 
                    style={{ padding: '0.5rem 1rem', borderRadius: '8px' }}
                  >
                    Reset
                  </button>
                  <a 
                    href={downloadUrl} 
                    download={`${files[1]?.name?.replace('.pdf', '') || 'modified'}_comparison_report.pdf`} 
                    className="btn btn-primary" 
                    style={{ textDecoration: 'none', padding: '0.5rem 1.25rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                  >
                    <Download size={16} /> Download Report PDF
                  </a>
                </div>
              </div>

              {/* Side by Side Viewer panels */}
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: '1fr 1fr', 
                gap: '1rem', 
                width: '100%',
                height: '65vh',
                minHeight: '450px'
              }}>
                {/* Left Panel - Original */}
                <div style={{ display: 'flex', flexDirection: 'column', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--color-border)', borderRadius: '12px', overflow: 'hidden' }}>
                  <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.5rem 1rem', fontSize: '0.85rem', fontWeight: 600, borderBottom: '1px solid var(--color-border)', color: 'var(--text-secondary)' }}>
                    Original Document: {files[0]?.name}
                  </div>
                  <div 
                    ref={leftScrollContainerRef}
                    onScroll={handleLeftScroll}
                    style={{ flex: 1, overflow: 'auto', padding: '1rem', display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}
                  >
                    <canvas ref={originalCanvasRef} style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.15)', background: '#fff', maxWidth: '100%' }} />
                  </div>
                </div>

                {/* Right Panel - Modified */}
                <div style={{ display: 'flex', flexDirection: 'column', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--color-border)', borderRadius: '12px', overflow: 'hidden' }}>
                  <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.5rem 1rem', fontSize: '0.85rem', fontWeight: 600, borderBottom: '1px solid var(--color-border)', color: 'var(--text-secondary)' }}>
                    Modified Document: {files[1]?.name}
                  </div>
                  <div 
                    ref={rightScrollContainerRef}
                    onScroll={handleRightScroll}
                    style={{ flex: 1, overflow: 'auto', padding: '1rem', display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}
                  >
                    <canvas ref={modifiedCanvasRef} style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.15)', background: '#fff', maxWidth: '100%' }} />
                  </div>
                </div>
              </div>

              {/* Summary Metrics */}
              {report?.summary && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', width: '100%' }}>
                  <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '0.75rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>{report.summary.total_differences}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>TOTAL DIFFERENCES</div>
                  </div>
                  <div style={{ background: 'rgba(34, 197, 94, 0.05)', border: '1px solid rgba(34, 197, 94, 0.15)', borderRadius: '12px', padding: '0.75rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#22c55e' }}>{report.summary.added}</div>
                    <div style={{ fontSize: '0.7rem', color: '#22c55e', fontWeight: 600 }}>ADDED</div>
                  </div>
                  <div style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.15)', borderRadius: '12px', padding: '0.75rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#ef4444' }}>{report.summary.removed}</div>
                    <div style={{ fontSize: '0.7rem', color: '#ef4444', fontWeight: 600 }}>REMOVED</div>
                  </div>
                  <div style={{ background: 'rgba(234, 179, 8, 0.05)', border: '1px solid rgba(234, 179, 8, 0.15)', borderRadius: '12px', padding: '0.75rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#eab308' }}>{report.summary.modified}</div>
                    <div style={{ fontSize: '0.7rem', color: '#eab308', fontWeight: 600 }}>MODIFIED</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {isProcessing && (
            <ProgressBar progress={progress} message="Comparing visual structures & layout geometry..." />
          )}
        </div>
      </div>

      <div className="tool-options-panel">
        <h3 className="panel-title">Comparison Panel</h3>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          Align two PDF document versions. The module uses PyMuPDF layout analysis and visual pixel difference overlay algorithms to highlight changed blocks.
        </p>

        <button 
          className="btn btn-primary"
          disabled={files.length < 2 || isProcessing}
          onClick={handleSubmit}
          style={{ width: '100%', marginTop: '1.5rem' }}
        >
          <Sparkles size={18} /> Compare PDF
        </button>
      </div>
    </div>
  );
};

export default ComparePdf;
