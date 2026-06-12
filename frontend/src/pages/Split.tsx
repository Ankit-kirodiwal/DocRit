import React, { useState, useEffect } from 'react';
import { ArrowLeft, Scissors, Download, FileCheck, Trash, Layers, Plus, Info } from 'lucide-react';
import FileUpload from '../components/FileUpload';
import ProgressBar from '../components/ProgressBar';
import * as pdfjsLib from 'pdfjs-dist';
import api from '../utils/api';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

interface SplitProps {
  onBack: () => void;
}

interface PageItem {
  originalIndex: number; // 0-indexed
  thumbnailUrl: string;
}

interface CustomRange {
  id: number;
  start: string | number;
  end: string | number;
}

const PageThumbnailCard: React.FC<{ pageNum: number; thumbnailUrl?: string; checked?: boolean; showCheck?: boolean; onClick?: () => void }> = ({
  pageNum,
  thumbnailUrl,
  checked = false,
  showCheck = false,
  onClick
}) => {
  return (
    <div
      onClick={onClick}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        background: 'var(--bg-tertiary)',
        padding: '0.75rem',
        borderRadius: '8px',
        border: checked ? '2px solid var(--color-coral)' : '1px solid var(--color-border)',
        cursor: onClick ? 'pointer' : 'default',
        width: '120px',
        userSelect: 'none',
        boxShadow: checked ? '0 4px 12px rgba(238, 108, 77, 0.15)' : 'none',
        transition: 'transform 0.2s ease, border-color 0.2s ease'
      }}
    >
      {showCheck && (
        <div style={{
          position: 'absolute',
          top: '-8px',
          right: '-8px',
          width: '24px',
          height: '24px',
          borderRadius: '50%',
          backgroundColor: checked ? '#4caf50' : 'var(--bg-secondary)',
          border: checked ? 'none' : '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
          zIndex: 5
        }}>
          {checked && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          )}
        </div>
      )}
      {thumbnailUrl ? (
        <img
          src={thumbnailUrl}
          alt={`Page ${pageNum}`}
          style={{ width: '90px', height: '120px', objectFit: 'contain', border: '1px solid var(--color-border)', borderRadius: '4px', marginBottom: '0.5rem', background: '#fff' }}
        />
      ) : (
        <div style={{ width: '90px', height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-primary)', borderRadius: '4px', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
          Loading...
        </div>
      )}
      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Page {pageNum}</span>
    </div>
  );
};

const Split: React.FC<SplitProps> = ({ onBack }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadIsZip, setDownloadIsZip] = useState(false);
  
  const [pages, setPages] = useState<PageItem[]>([]);
  const [isLoadingPages, setIsLoadingPages] = useState(false);

  // Tabs & configuration states
  const [activeTab, setActiveTab] = useState<'range' | 'pages'>('range');
  const [rangeMode, setRangeMode] = useState<'custom' | 'fixed'>('custom');
  const [customRanges, setCustomRanges] = useState<CustomRange[]>([
    { id: 1, start: 1, end: 1 }
  ]);
  const [mergeAll, setMergeAll] = useState(false);
  const [fixedPagesVal, setFixedPagesVal] = useState<string | number>(2);
  const [pagesMode, setPagesMode] = useState<'all' | 'select'>('all');
  
  const [selectedPagesStr, setSelectedPagesStr] = useState('1');
  const [selectedPagesSet, setSelectedPagesSet] = useState<Set<number>>(new Set([1]));

  const handleFilesSelected = (newFiles: File[]) => {
    if (newFiles.length > 0) {
      setFiles([newFiles[0]]);
      setDownloadUrl(null);
      setPages([]);
    }
  };

  const handleRemoveFile = () => {
    setFiles([]);
    setDownloadUrl(null);
    setPages([]);
  };

  // Convert Set of page numbers to range string (e.g. {1,2,3,5} -> "1-3, 5")
  const setToString = (set: Set<number>): string => {
    const sorted = Array.from(set).sort((a, b) => a - b);
    const ranges: string[] = [];
    let i = 0;
    while (i < sorted.length) {
      let j = i;
      while (j < sorted.length - 1 && sorted[j + 1] === sorted[j] + 1) {
        j++;
      }
      if (j > i) {
        ranges.push(`${sorted[i]}-${sorted[j]}`);
      } else {
        ranges.push(`${sorted[i]}`);
      }
      i = j + 1;
    }
    return ranges.join(', ');
  };

  // Convert range string to Set of page numbers (e.g. "1-3, 5" -> {1,2,3,5})
  const stringToSet = (str: string, maxPages: number): Set<number> => {
    const set = new Set<number>();
    const parts = str.split(',');
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const range = trimmed.split('-');
      if (range.length === 1) {
        const val = parseInt(range[0], 10);
        if (!isNaN(val) && val >= 1 && val <= maxPages) {
          set.add(val);
        }
      } else if (range.length === 2) {
        const start = parseInt(range[0], 10);
        const end = parseInt(range[1], 10);
        if (!isNaN(start) && !isNaN(end) && start <= end && start >= 1 && end <= maxPages) {
          for (let i = start; i <= end; i++) {
            set.add(i);
          }
        }
      }
    }
    return set;
  };

  // Render thumbnails
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
          const viewport = page.getViewport({ scale: 0.3 });
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
        // Set default configurations based on loaded page count
        setCustomRanges([{ id: Date.now(), start: 1, end: totalPages }]);
        setSelectedPagesSet(new Set([1]));
        setSelectedPagesStr('1');
      } catch (err) {
        console.error('Error loading pages: ', err);
      } finally {
        setIsLoadingPages(false);
      }
    };

    fileReader.readAsArrayBuffer(file);
  }, [files]);

  const updateRange = (id: number, key: 'start' | 'end', val: string | number) => {
    setCustomRanges(customRanges.map(r => r.id === id ? { ...r, [key]: val } : r));
  };

  const handleRangeBlur = (id: number, key: 'start' | 'end', val: string | number) => {
    let parsed = parseInt(String(val), 10);
    if (isNaN(parsed) || parsed < 1) {
      parsed = 1;
    }
    if (pages.length > 0 && parsed > pages.length) {
      parsed = pages.length;
    }
    setCustomRanges(customRanges.map(r => r.id === id ? { ...r, [key]: parsed } : r));
  };

  const handleFixedPagesBlur = (val: string | number) => {
    let parsed = parseInt(String(val), 10);
    if (isNaN(parsed) || parsed < 1) {
      parsed = 1;
    }
    if (pages.length > 0 && parsed > pages.length) {
      parsed = pages.length;
    }
    setFixedPagesVal(parsed);
  };

  const addRange = () => {
    const lastRange = customRanges[customRanges.length - 1];
    let newStart = 1;
    let newEnd = pages.length;
    if (lastRange) {
      const lastEnd = parseInt(String(lastRange.end), 10) || 1;
      newStart = Math.min(pages.length, lastEnd + 1);
      newEnd = Math.min(pages.length, newStart + 1);
    }
    setCustomRanges([
      ...customRanges,
      { id: Date.now(), start: newStart, end: newEnd }
    ]);
  };

  const removeRange = (id: number) => {
    setCustomRanges(customRanges.filter(r => r.id !== id));
  };

  const handleSubmit = async () => {
    if (files.length === 0) return;
    setIsProcessing(true);
    setProgress(15);
    setDownloadUrl(null);

    const formData = new FormData();
    formData.append('file', files[0]);

    if (activeTab === 'range') {
      if (rangeMode === 'custom') {
        const normalizedRanges = customRanges.map(r => {
          let start = parseInt(String(r.start), 10);
          let end = parseInt(String(r.end), 10);
          if (isNaN(start) || start < 1) start = 1;
          if (isNaN(end) || end < 1) end = 1;
          if (pages.length > 0) {
            if (start > pages.length) start = pages.length;
            if (end > pages.length) end = pages.length;
          }
          return { start, end };
        });

        formData.append('splitMode', 'custom');
        formData.append('ranges', JSON.stringify(normalizedRanges));
        formData.append('mergeAll', mergeAll ? 'true' : 'false');
      } else {
        let fixed = parseInt(String(fixedPagesVal), 10);
        if (isNaN(fixed) || fixed < 1) fixed = 1;
        if (pages.length > 0 && fixed > pages.length) fixed = pages.length;

        formData.append('splitMode', 'fixed');
        formData.append('fixedPages', fixed.toString());
      }
    } else {
      if (pagesMode === 'all') {
        formData.append('splitMode', 'extract_all');
      } else {
        formData.append('splitMode', 'extract_select');
        formData.append('selectedPages', selectedPagesStr);
      }
    }

    try {
      setProgress(40);
      const response = await api.post('/split', formData, {
        responseType: 'blob',
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1));
          setProgress(40 + percentCompleted * 0.4);
        }
      });

      setProgress(90);
      const contentType = response.headers['content-type'];
      const contentTypeStr = typeof contentType === 'string' ? contentType : '';
      const isZip = contentTypeStr.includes('zip') || contentTypeStr.includes('octet-stream');
      const blob = new Blob([response.data], { type: isZip ? 'application/zip' : 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      setDownloadUrl(url);
      setDownloadIsZip(isZip);
      setProgress(100);
    } catch (err: any) {
      console.error(err);
      alert('Error splitting PDF: ' + (err.response?.data?.error || err.message));
      setProgress(0);
    } finally {
      setIsProcessing(false);
    }
  };

  // Fixed Range Calculation
  const fixedRangesList: { start: number; end: number }[] = [];
  const fixedPagesInt = parseInt(String(fixedPagesVal), 10) || 1;
  if (pages.length > 0 && fixedPagesInt > 0) {
    for (let start = 1; start <= pages.length; start += fixedPagesInt) {
      const end = Math.min(pages.length, start + fixedPagesInt - 1);
      fixedRangesList.push({ start, end });
    }
  }

  return (
    <div className="tool-page-container">
      <div className="tool-workspace">
        <button
          className="file-remove-btn"
          style={{ top: '1.5rem', left: '1.5rem', width: 'auto', height: 'auto', borderRadius: '8px', padding: '0.4rem 0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem', position: 'absolute' }}
          onClick={onBack}
        >
          <ArrowLeft size={16} /> Back to Tools
        </button>

        <div style={{ width: '100%', marginTop: '3.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.75rem', marginBottom: '1.5rem', fontFamily: 'var(--font-display)' }}>Split PDF File</h2>

          {!downloadUrl ? (
            files.length === 0 ? (
              <FileUpload
                accept="application/pdf"
                multiple={false}
                onFilesSelected={handleFilesSelected}
                selectedFiles={files}
                onRemoveFile={handleRemoveFile}
              />
            ) : (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {isLoadingPages ? (
                  <p style={{ color: 'var(--text-muted)', margin: '2rem 0' }}>Loading document pages preview...</p>
                ) : (
                  <div style={{ width: '100%', display: 'flex', justifyContent: 'center', marginBottom: '2rem' }}>
                    {/* Visual representation based on active configurations */}
                    {activeTab === 'range' && rangeMode === 'custom' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%', maxWidth: '800px', padding: '1rem', border: '1px solid var(--color-border)', borderRadius: '12px', background: 'rgba(255,255,255,0.02)', maxHeight: '480px', overflowY: 'auto' }}>
                        {customRanges.map((range, index) => {
                          const startIdx = Math.max(1, parseInt(String(range.start), 10) || 1);
                          const endIdx = Math.min(pages.length, parseInt(String(range.end), 10) || 1);
                          const rangePages: number[] = [];
                          for (let p = startIdx; p <= endIdx; p++) {
                            rangePages.push(p);
                          }

                          return (
                            <div key={range.id} style={{ border: '1px dashed var(--color-border)', borderRadius: '8px', padding: '1.25rem', background: 'rgba(255,255,255,0.02)', position: 'relative' }}>
                              <div style={{ position: 'absolute', top: '-0.75rem', left: '1rem', background: 'var(--bg-secondary)', padding: '0 0.5rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-coral)' }}>
                                Range {index + 1}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap', minHeight: '130px' }}>
                                {rangePages.length === 0 ? (
                                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No pages in range</p>
                                ) : rangePages.length === 1 ? (
                                  <PageThumbnailCard pageNum={rangePages[0]} thumbnailUrl={pages[rangePages[0] - 1]?.thumbnailUrl} />
                                ) : (
                                  <>
                                    <PageThumbnailCard pageNum={rangePages[0]} thumbnailUrl={pages[rangePages[0] - 1]?.thumbnailUrl} />
                                    {rangePages.length > 2 && (
                                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '40px', height: '100px', fontSize: '1.5rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>
                                        ...
                                      </div>
                                    )}
                                    <PageThumbnailCard pageNum={rangePages[rangePages.length - 1]} thumbnailUrl={pages[rangePages[rangePages.length - 1] - 1]?.thumbnailUrl} />
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {activeTab === 'range' && rangeMode === 'fixed' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%', maxWidth: '800px', padding: '1rem', border: '1px solid var(--color-border)', borderRadius: '12px', background: 'rgba(255,255,255,0.02)', maxHeight: '480px', overflowY: 'auto' }}>
                        {fixedRangesList.map((range, index) => {
                          const startIdx = range.start;
                          const endIdx = range.end;
                          const rangePages: number[] = [];
                          for (let p = startIdx; p <= endIdx; p++) {
                            rangePages.push(p);
                          }

                          return (
                            <div key={index} style={{ border: '1px dashed var(--color-border)', borderRadius: '8px', padding: '1.25rem', background: 'rgba(255,255,255,0.02)', position: 'relative' }}>
                              <div style={{ position: 'absolute', top: '-0.75rem', left: '1rem', background: 'var(--bg-secondary)', padding: '0 0.5rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-coral)' }}>
                                Range {index + 1}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap', minHeight: '130px' }}>
                                {rangePages.length === 1 ? (
                                  <PageThumbnailCard pageNum={rangePages[0]} thumbnailUrl={pages[rangePages[0] - 1]?.thumbnailUrl} />
                                ) : (
                                  <>
                                    <PageThumbnailCard pageNum={rangePages[0]} thumbnailUrl={pages[rangePages[0] - 1]?.thumbnailUrl} />
                                    {rangePages.length > 2 && (
                                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '40px', height: '100px', fontSize: '1.5rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>
                                        ...
                                      </div>
                                    )}
                                    <PageThumbnailCard pageNum={rangePages[rangePages.length - 1]} thumbnailUrl={pages[rangePages[rangePages.length - 1] - 1]?.thumbnailUrl} />
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {activeTab === 'pages' && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '1.25rem', width: '100%', maxWidth: '800px', padding: '1rem', border: '1px solid var(--color-border)', borderRadius: '12px', background: 'rgba(255,255,255,0.02)', maxHeight: '480px', overflowY: 'auto' }}>
                        {pages.map((p, index) => {
                          const pageNum = index + 1;
                          const isSelected = pagesMode === 'all' || selectedPagesSet.has(pageNum);

                          const handleCardClick = () => {
                            if (pagesMode === 'select') {
                              const newSet = new Set(selectedPagesSet);
                              if (newSet.has(pageNum)) {
                                newSet.delete(pageNum);
                              } else {
                                newSet.add(pageNum);
                              }
                              setSelectedPagesSet(newSet);
                              setSelectedPagesStr(setToString(newSet));
                            }
                          };

                          return (
                            <PageThumbnailCard
                              key={p.originalIndex}
                              pageNum={pageNum}
                              thumbnailUrl={p.thumbnailUrl}
                              showCheck={true}
                              checked={isSelected}
                              onClick={pagesMode === 'select' ? handleCardClick : undefined}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                <button onClick={handleRemoveFile} className="btn" style={{ background: '#ea4335', color: '#fff', marginBottom: '1rem', borderRadius: '30px' }}>
                  Clear and upload another
                </button>
              </div>
            )
          ) : (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: '#e2f0d9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', color: '#385723' }}>
                <FileCheck size={36} />
              </div>
              <h3 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>PDF Split Successfully!</h3>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
                Your split {downloadIsZip ? 'ZIP file containing multiple PDFs' : 'PDF file'} is ready.
              </p>
              <div style={{ display: 'flex', gap: '1rem', width: '100%', justifyContent: 'center', marginTop: '1.5rem', flexWrap: 'wrap' }}>
                <button 
                  onClick={handleRemoveFile} 
                  className="btn btn-secondary"
                  style={{ borderRadius: '12px', padding: '0.85rem 1.75rem' }}
                >
                  Split Another File
                </button>
                <a 
                  href={downloadUrl} 
                  download={`split_${files[0]?.name.replace(/\.pdf$/i, '') || 'document'}.${downloadIsZip ? 'zip' : 'pdf'}`}
                  className="btn btn-primary" 
                  style={{ textDecoration: 'none', borderRadius: '12px', padding: '0.85rem 2.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  <Download size={18} /> Download Split {downloadIsZip ? 'ZIP' : 'PDF'}
                </a>
              </div>
            </div>
          )}

          {isProcessing && (
            <ProgressBar progress={progress} message="Splitting and preparing files..." />
          )}
        </div>
      </div>

      <div className="tool-options-panel" style={{ minWidth: '320px' }}>
        <h3 className="panel-title">Split Configuration</h3>

        {files.length === 0 ? (
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Please upload a PDF file to configure split options.
          </p>
        ) : isLoadingPages ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem 0', gap: '1rem' }}>
            <style>{`
              @keyframes spin {
                to { transform: rotate(360deg); }
              }
            `}</style>
            <div style={{ width: '40px', height: '40px', border: '4px solid var(--color-border)', borderTopColor: 'var(--color-coral)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
              Loading document pages...<br />Please wait.
            </p>
          </div>
        ) : (
          <>
            {/* Custom styled tab switcher */}
            <div style={{ display: 'flex', border: '1px solid var(--color-border)', borderRadius: '30px', overflow: 'hidden', padding: '2px', background: 'var(--bg-primary)' }}>
              <button
                onClick={() => setActiveTab('range')}
                disabled={isProcessing}
                style={{
                  flex: 1,
                  padding: '0.6rem 0.8rem',
                  border: 'none',
                  borderRadius: '30px',
                  background: activeTab === 'range' ? 'var(--color-coral)' : 'transparent',
                  color: activeTab === 'range' ? 'white' : 'var(--text-secondary)',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.4rem',
                  cursor: 'pointer',
                  transition: 'background 0.2s ease, color 0.2s ease'
                }}
              >
                <Scissors size={14} /> Range
              </button>
              <button
                onClick={() => setActiveTab('pages')}
                disabled={isProcessing}
                style={{
                  flex: 1,
                  padding: '0.6rem 0.8rem',
                  border: 'none',
                  borderRadius: '30px',
                  background: activeTab === 'pages' ? 'var(--color-coral)' : 'transparent',
                  color: activeTab === 'pages' ? 'white' : 'var(--text-secondary)',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.4rem',
                  cursor: 'pointer',
                  transition: 'background 0.2s ease, color 0.2s ease'
                }}
              >
                <Layers size={14} /> Pages
              </button>
            </div>

            {/* Range Configuration Tab */}
            {activeTab === 'range' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label className="form-label">Range Mode</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      className="btn"
                      onClick={() => setRangeMode('custom')}
                      disabled={isProcessing}
                      style={{
                        flex: 1,
                        padding: '0.5rem',
                        fontSize: '0.85rem',
                        borderRadius: '8px',
                        background: rangeMode === 'custom' ? 'transparent' : 'var(--bg-primary)',
                        border: rangeMode === 'custom' ? '2px solid var(--color-coral)' : '1px solid var(--color-border)',
                        color: rangeMode === 'custom' ? 'var(--color-coral)' : 'var(--text-secondary)'
                      }}
                    >
                      Custom
                    </button>
                    <button
                      className="btn"
                      onClick={() => setRangeMode('fixed')}
                      disabled={isProcessing}
                      style={{
                        flex: 1,
                        padding: '0.5rem',
                        fontSize: '0.85rem',
                        borderRadius: '8px',
                        background: rangeMode === 'fixed' ? 'transparent' : 'var(--bg-primary)',
                        border: rangeMode === 'fixed' ? '2px solid var(--color-coral)' : '1px solid var(--color-border)',
                        color: rangeMode === 'fixed' ? 'var(--color-coral)' : 'var(--text-secondary)'
                      }}
                    >
                      Fixed
                    </button>
                  </div>
                </div>

                {rangeMode === 'custom' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ maxHeight: '200px', overflowY: 'auto', paddingRight: '0.25rem' }}>
                      {customRanges.map((range, index) => (
                        <div key={range.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 600, width: '60px', color: 'var(--text-secondary)' }}>Range {index + 1}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flex: 1 }}>
                            <input
                              type="number"
                              min={1}
                              max={pages.length}
                              className="form-input"
                              style={{ padding: '0.4rem 0.5rem', fontSize: '0.85rem' }}
                              value={range.start}
                              onChange={(e) => {
                                updateRange(range.id, 'start', e.target.value);
                              }}
                              onBlur={(e) => {
                                handleRangeBlur(range.id, 'start', e.target.value);
                              }}
                              disabled={isProcessing}
                            />
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>to</span>
                            <input
                              type="number"
                              min={1}
                              max={pages.length}
                              className="form-input"
                              style={{ padding: '0.4rem 0.5rem', fontSize: '0.85rem' }}
                              value={range.end}
                              onChange={(e) => {
                                updateRange(range.id, 'end', e.target.value);
                              }}
                              onBlur={(e) => {
                                handleRangeBlur(range.id, 'end', e.target.value);
                              }}
                              disabled={isProcessing}
                            />
                          </div>
                          {customRanges.length > 1 && (
                            <button
                              onClick={() => removeRange(range.id)}
                              disabled={isProcessing}
                              style={{ background: 'transparent', border: 'none', color: '#ea4335', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '0.2rem' }}
                            >
                              <Trash size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    <button
                      className="btn btn-secondary"
                      onClick={addRange}
                      disabled={isProcessing || pages.length === 0 || (parseInt(String(customRanges[customRanges.length - 1]?.end), 10) || 1) >= pages.length}
                      style={{ width: '100%', padding: '0.5rem', fontSize: '0.85rem', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}
                    >
                      <Plus size={14} /> Add Range
                    </button>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer', marginTop: '0.5rem', userSelect: 'none' }}>
                      <input
                        type="checkbox"
                        checked={mergeAll}
                        onChange={(e) => setMergeAll(e.target.checked)}
                        disabled={isProcessing}
                        style={{ accentColor: 'var(--color-coral)' }}
                      />
                      Merge all ranges in one PDF file.
                    </label>
                  </div>
                )}

                {rangeMode === 'fixed' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div className="form-group">
                      <label className="form-label" htmlFor="fixed-pages-input">Split into page ranges of:</label>
                      <input
                        id="fixed-pages-input"
                        type="number"
                        min={1}
                        max={pages.length}
                        className="form-input"
                        value={fixedPagesVal}
                        onChange={(e) => setFixedPagesVal(e.target.value)}
                        onBlur={(e) => handleFixedPagesBlur(e.target.value)}
                        disabled={isProcessing}
                      />
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.2)', padding: '0.75rem', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.85rem', alignItems: 'flex-start' }}>
                      <Info size={16} style={{ flexShrink: 0, marginTop: '2px', color: 'var(--color-primary)' }} />
                      <p>
                        This PDF will be split into files of <strong>{fixedPagesVal}</strong> pages.<br />
                        <strong>{fixedRangesList.length}</strong> PDF{fixedRangesList.length > 1 ? 's' : ''} will be created.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Pages Configuration Tab */}
            {activeTab === 'pages' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label className="form-label">Extract Mode</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      className="btn"
                      onClick={() => setPagesMode('all')}
                      disabled={isProcessing}
                      style={{
                        flex: 1,
                        padding: '0.5rem',
                        fontSize: '0.85rem',
                        borderRadius: '8px',
                        background: pagesMode === 'all' ? 'transparent' : 'var(--bg-primary)',
                        border: pagesMode === 'all' ? '2px solid var(--color-coral)' : '1px solid var(--color-border)',
                        color: pagesMode === 'all' ? 'var(--color-coral)' : 'var(--text-secondary)'
                      }}
                    >
                      Extract all pages
                    </button>
                    <button
                      className="btn"
                      onClick={() => setPagesMode('select')}
                      disabled={isProcessing}
                      style={{
                        flex: 1,
                        padding: '0.5rem',
                        fontSize: '0.85rem',
                        borderRadius: '8px',
                        background: pagesMode === 'select' ? 'transparent' : 'var(--bg-primary)',
                        border: pagesMode === 'select' ? '2px solid var(--color-coral)' : '1px solid var(--color-border)',
                        color: pagesMode === 'select' ? 'var(--color-coral)' : 'var(--text-secondary)'
                      }}
                    >
                      Select pages
                    </button>
                  </div>
                </div>

                {pagesMode === 'all' ? (
                  <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.2)', padding: '0.75rem', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.85rem', alignItems: 'flex-start' }}>
                    <Info size={16} style={{ flexShrink: 0, marginTop: '2px', color: 'var(--color-primary)' }} />
                    <p>
                      Selected pages will be converted into separate PDF files.<br />
                      <strong>{pages.length}</strong> PDF{pages.length > 1 ? 's' : ''} will be created.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div className="form-group">
                      <label className="form-label" htmlFor="select-pages-input">Select pages to extract:</label>
                      <input
                        id="select-pages-input"
                        type="text"
                        className="form-input"
                        placeholder="e.g. 1-3, 5"
                        value={selectedPagesStr}
                        onChange={(e) => {
                          setSelectedPagesStr(e.target.value);
                          setSelectedPagesSet(stringToSet(e.target.value, pages.length));
                        }}
                        disabled={isProcessing}
                      />
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.2)', padding: '0.75rem', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.85rem', alignItems: 'flex-start' }}>
                      <Info size={16} style={{ flexShrink: 0, marginTop: '2px', color: 'var(--color-primary)' }} />
                      <p>
                        Selected pages will be converted into separate PDF files.<br />
                        <strong>{selectedPagesSet.size}</strong> PDF{selectedPagesSet.size > 1 ? 's' : ''} will be created.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            <button
              className="btn btn-primary"
              disabled={isProcessing}
              onClick={handleSubmit}
              style={{ width: '100%', marginTop: '1rem', borderRadius: '30px' }}
            >
              <Scissors size={18} /> Split PDF
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default Split;

