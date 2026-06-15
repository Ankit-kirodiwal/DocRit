import React, { useState, useEffect } from 'react';
import { ArrowLeft, RotateCw, Download, FileCheck } from 'lucide-react';
import FileUpload from '../components/FileUpload';
import ProgressBar from '../components/ProgressBar';
import api from '../utils/api';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

interface RotateProps {
  onBack: () => void;
}

interface PageItem {
  originalIndex: number;
  thumbnailUrl: string;
}

const parseRanges = (rangeStr: string, maxPages: number): number[] => {
  const pages = new Set<number>();
  const parts = rangeStr.split(',');
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const range = trimmed.split('-');
    if (range.length === 1) {
      const val = parseInt(range[0], 10);
      if (!isNaN(val) && val >= 1 && val <= maxPages) {
        pages.add(val - 1);
      }
    } else if (range.length === 2) {
      const start = parseInt(range[0], 10);
      const end = parseInt(range[1], 10);
      if (!isNaN(start) && !isNaN(end) && start <= end && start >= 1 && end <= maxPages) {
        for (let i = start; i <= end; i++) {
          pages.add(i - 1);
        }
      }
    }
  }
  return Array.from(pages).sort((a, b) => a - b);
};

const Rotate: React.FC<RotateProps> = ({ onBack }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [angle, setAngle] = useState('90');
  const [targetPages, setTargetPages] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  // PDF Page preview state
  const [pages, setPages] = useState<PageItem[]>([]);
  const [isLoadingPages, setIsLoadingPages] = useState(false);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());

  const handleFilesSelected = (newFiles: File[]) => {
    if (newFiles.length > 0) {
      setFiles([newFiles[0]]);
      setDownloadUrl(null);
      setPages([]);
      setSelectedPages(new Set());
      setTargetPages('');
    }
  };

  const handleRemoveFile = () => {
    setFiles([]);
    setDownloadUrl(null);
    setPages([]);
    setSelectedPages(new Set());
    setTargetPages('');
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
        const loadedPages: PageItem[] = [];

        for (let i = 1; i <= totalPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 0.35 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const context = canvas.getContext('2d');
          if (context) {
            await page.render({
              canvasContext: context,
              viewport: viewport
            }).promise;
            
            loadedPages.push({
              originalIndex: i - 1,
              thumbnailUrl: canvas.toDataURL('image/jpeg', 0.7)
            });
          }
        }
        setPages(loadedPages);
      } catch (err) {
        console.error('Error loading pages: ', err);
      } finally {
        setIsLoadingPages(false);
      }
    };

    fileReader.readAsArrayBuffer(file);
  }, [files]);

  const togglePageSelection = (originalIndex: number) => {
    setSelectedPages(prev => {
      const next = new Set(prev);
      if (next.has(originalIndex)) {
        next.delete(originalIndex);
      } else {
        next.add(originalIndex);
      }
      
      // Update targetPages input field
      const sorted = Array.from(next).sort((a, b) => a - b);
      if (sorted.length === 0) {
        setTargetPages('');
      } else {
        setTargetPages(sorted.map(idx => idx + 1).join(', '));
      }
      return next;
    });
  };

  const handleTargetPagesInputChange = (val: string) => {
    setTargetPages(val);
    if (pages.length === 0) return;
    try {
      const parsed = parseRanges(val, pages.length);
      setSelectedPages(new Set(parsed));
    } catch (e) {
      // Ignore parsing errors while user is typing
    }
  };

  const selectAll = () => {
    const all = new Set(pages.map(p => p.originalIndex));
    setSelectedPages(all);
    setTargetPages(pages.map(p => p.originalIndex + 1).join(', '));
  };

  const deselectAll = () => {
    setSelectedPages(new Set());
    setTargetPages('');
  };

  const handleSubmit = async () => {
    if (files.length === 0) return;
    setIsProcessing(true);
    setProgress(15);
    setDownloadUrl(null);

    const formData = new FormData();
    formData.append('file', files[0]);
    formData.append('angle', angle);
    if (targetPages.trim()) {
      formData.append('pages', targetPages);
    }

    try {
      setProgress(40);
      const response = await api.post('/rotate', formData, {
        responseType: 'blob',
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1));
          setProgress(40 + percentCompleted * 0.4);
        }
      });

      setProgress(90);
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      setDownloadUrl(url);
      setProgress(100);
    } catch (err: any) {
      console.error(err);
      alert('Error rotating PDF: ' + (err.response?.data?.error || err.message));
      setProgress(0);
    } finally {
      setIsProcessing(false);
    }
  };

  // Compute rotation style for page preview
  const getRotationStyle = (pageIndex: number) => {
    const isSelected = selectedPages.has(pageIndex);
    const shouldRotate = selectedPages.size === 0 || isSelected;
    if (!shouldRotate) return {};
    
    return {
      transform: `rotate(${angle}deg)`,
      transition: 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
    };
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
          <h2 style={{ fontSize: '1.75rem', marginBottom: '1.5rem', fontFamily: 'var(--font-display)', textAlign: 'center' }}>Rotate PDF File</h2>
          
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
                    <p style={{ color: 'var(--text-muted)' }}>Rendering document pages preview...</p>
                  </div>
                ) : (
                  <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', maxWidth: '850px', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.5rem', padding: '0 0.5rem' }}>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button 
                          onClick={selectAll} 
                          className="btn btn-secondary"
                          style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', borderRadius: '8px' }}
                        >
                          Select All Pages
                        </button>
                        <button 
                          onClick={deselectAll} 
                          className="btn btn-secondary"
                          style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', borderRadius: '8px' }}
                        >
                          Clear Selection
                        </button>
                      </div>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', alignSelf: 'center' }}>
                        {selectedPages.size === 0 ? 'All pages will be rotated' : `${selectedPages.size} of ${pages.length} pages selected`}
                      </span>
                    </div>

                    <div style={{ 
                      display: 'grid', 
                      gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', 
                      gap: '2rem', 
                      width: '100%', 
                      maxWidth: '850px', 
                      maxHeight: '500px',
                      overflowY: 'auto',
                      padding: '1.5rem', 
                      border: '1px solid var(--color-border)', 
                      borderRadius: '16px', 
                      background: 'rgba(255,255,255,0.02)', 
                      backdropFilter: 'blur(10px)', 
                      marginBottom: '1.5rem' 
                    }}>
                      {pages.map((page, index) => {
                        const isSelected = selectedPages.has(page.originalIndex);
                        return (
                          <div 
                            key={index} 
                            style={{ 
                              position: 'relative', 
                              display: 'flex', 
                              flexDirection: 'column', 
                              alignItems: 'center', 
                              background: isSelected ? 'var(--color-border-glow)' : 'rgba(255, 255, 255, 0.03)', 
                              padding: '1.25rem 1rem', 
                              borderRadius: '12px', 
                              border: isSelected ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease',
                              boxShadow: isSelected ? '0 4px 12px var(--color-border-glow)' : 'none'
                            }}
                            onClick={() => togglePageSelection(page.originalIndex)}
                          >
                            <div style={{ position: 'absolute', top: '0.5rem', left: '0.5rem', zIndex: 5 }}>
                              <input 
                                type="checkbox" 
                                checked={isSelected}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  togglePageSelection(page.originalIndex);
                                }}
                                style={{
                                  width: '16px',
                                  height: '16px',
                                  cursor: 'pointer',
                                  accentColor: 'var(--color-primary)'
                                }}
                              />
                            </div>
                            
                            <div style={{ 
                              width: '100px', 
                              height: '140px', 
                              display: 'flex', 
                              alignItems: 'center', 
                              justifyContent: 'center',
                              marginBottom: '0.75rem',
                              marginTop: '0.5rem'
                            }}>
                              <img 
                                src={page.thumbnailUrl} 
                                alt={`Page ${page.originalIndex + 1}`} 
                                style={{ 
                                  maxWidth: '100%', 
                                  maxHeight: '100%', 
                                  border: '1px solid var(--color-border)', 
                                  borderRadius: '6px', 
                                  boxShadow: '0 4px 10px rgba(0,0,0,0.1)',
                                  ...getRotationStyle(page.originalIndex)
                                }} 
                              />
                            </div>
                            <span style={{ fontSize: '0.85rem', color: isSelected ? 'var(--color-primary)' : 'var(--text-primary)', fontWeight: isSelected ? '600' : 'normal' }}>Page {page.originalIndex + 1}</span>
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
              <h3 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>PDF Rotated Successfully!</h3>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Your rotated PDF is ready to download.</p>
              <div style={{ display: 'flex', gap: '1rem', width: '100%', justifyContent: 'center', marginTop: '1.5rem', flexWrap: 'wrap' }}>
                <button 
                  onClick={handleRemoveFile} 
                  className="btn btn-secondary"
                  style={{ borderRadius: '12px', padding: '0.85rem 1.75rem' }}
                >
                  Rotate Another File
                </button>
                <a 
                  href={downloadUrl} 
                  download={`rotated_${files[0]?.name || 'document.pdf'}`}
                  className="btn btn-primary" 
                  style={{ textDecoration: 'none', borderRadius: '12px', padding: '0.85rem 2.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  <Download size={18} /> Download Rotated PDF
                </a>
              </div>
            </div>
          )}

          {isProcessing && (
            <div style={{ width: '100%', maxWidth: '600px' }}>
              <ProgressBar progress={progress} message="Rotating selected pages in the document..." />
            </div>
          )}
        </div>
      </div>

      <div className="tool-options-panel">
        <h3 className="panel-title">Rotation Settings</h3>
        
        <div className="form-group">
          <label className="form-label" htmlFor="rotation-angle-select">Rotation Angle</label>
          <select 
            id="rotation-angle-select"
            className="form-select"
            value={angle}
            onChange={(e) => setAngle(e.target.value)}
            disabled={isProcessing || files.length === 0}
          >
            <option value="90">90&deg; Clockwise</option>
            <option value="180">180&deg; Flip</option>
            <option value="-90">90&deg; Counter-Clockwise</option>
          </select>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="target-pages-input">Target Pages (Optional)</label>
          <input
            id="target-pages-input"
            type="text"
            className="form-input"
            placeholder="e.g. 1-3, 5 (blank for all)"
            value={targetPages}
            onChange={(e) => handleTargetPagesInputChange(e.target.value)}
            disabled={isProcessing || files.length === 0}
          />
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Select pages in the workspace grid or enter page numbers above.
          </span>
        </div>

        <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <button 
            className="btn btn-primary"
            disabled={files.length === 0 || isProcessing}
            onClick={handleSubmit}
            style={{ width: '100%', opacity: (files.length === 0 || isProcessing) ? 0.6 : 1 }}
          >
            <RotateCw size={18} /> Rotate PDF
          </button>
        </div>
      </div>
    </div>
  );
};

export default Rotate;
