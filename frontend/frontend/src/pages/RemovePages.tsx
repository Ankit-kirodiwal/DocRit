import React, { useState, useEffect } from 'react';
import { ArrowLeft, Trash, Download, FileCheck } from 'lucide-react';
import FileUpload from '../components/FileUpload';
import ProgressBar from '../components/ProgressBar';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

interface RemovePagesProps {
  onBack: () => void;
}

interface PageItem {
  originalIndex: number; // 0-indexed
  thumbnailUrl: string;
}

const RemovePages: React.FC<RemovePagesProps> = ({ onBack }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [pages, setPages] = useState<PageItem[]>([]);
  const [isLoadingPages, setIsLoadingPages] = useState(false);
  
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());

  const handleFilesSelected = (newFiles: File[]) => {
    if (newFiles.length > 0) {
      setFiles([newFiles[0]]);
      setDownloadUrl(null);
      setPages([]);
      setSelectedPages(new Set());
    }
  };

  const handleRemoveFile = () => {
    setFiles([]);
    setDownloadUrl(null);
    setPages([]);
    setSelectedPages(new Set());
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
          const viewport = page.getViewport({ scale: 0.3 }); // small scale for thumb
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
      return next;
    });
  };

  const selectAll = () => {
    setSelectedPages(new Set(pages.map(p => p.originalIndex)));
  };

  const deselectAll = () => {
    setSelectedPages(new Set());
  };

  const handleSubmit = async () => {
    if (files.length === 0 || pages.length === 0) return;
    const selectedCount = selectedPages.size;
    if (selectedCount === 0) {
      alert('Please select at least one page to remove.');
      return;
    }
    
    const remainingIndices = pages
      .map(p => p.originalIndex)
      .filter(idx => !selectedPages.has(idx));
      
    if (remainingIndices.length === 0) {
      alert('You cannot remove all pages. At least one page must remain in the PDF.');
      return;
    }

    setIsProcessing(true);
    setProgress(20);
    setDownloadUrl(null);

    try {
      const arrayBuffer = await files[0].arrayBuffer();
      setProgress(40);
      const srcDoc = await PDFDocument.load(new Uint8Array(arrayBuffer));
      const destDoc = await PDFDocument.create();
      
      setProgress(60);
      const copiedPages = await destDoc.copyPages(srcDoc, remainingIndices);
      copiedPages.forEach(p => destDoc.addPage(p));
      
      setProgress(85);
      const bytes = await destDoc.save({ useObjectStreams: true });
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      setDownloadUrl(url);
      setProgress(100);
    } catch (err: any) {
      console.error(err);
      alert('Error removing pages: ' + err.message);
      setProgress(0);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="tool-page-container">
      <div className="tool-workspace">
        <button className="file-remove-btn" style={{ top: '1.5rem', left: '1.5rem', width: 'auto', height: 'auto', borderRadius: '8px', padding: '0.4rem 0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }} onClick={onBack}>
          <ArrowLeft size={16} /> Back to Tools
        </button>

        <div style={{ width: '100%', marginTop: '3rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.75rem', marginBottom: '1.5rem', fontFamily: 'var(--font-display)' }}>Remove PDF Pages</h2>

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
                  <p style={{ color: 'var(--text-muted)' }}>Loading document pages preview...</p>
                ) : (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', maxWidth: '800px', marginBottom: '1.5rem' }}>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button 
                          onClick={selectAll} 
                          style={{ padding: '0.4rem 0.8rem', fontSize: '0.875rem', borderRadius: '6px', background: 'var(--bg-glass)', border: '1px solid var(--color-border)', color: 'var(--text-primary)', cursor: 'pointer' }}
                        >
                          Select All
                        </button>
                        <button 
                          onClick={deselectAll} 
                          style={{ padding: '0.4rem 0.8rem', fontSize: '0.875rem', borderRadius: '6px', background: 'var(--bg-glass)', border: '1px solid var(--color-border)', color: 'var(--text-primary)', cursor: 'pointer' }}
                        >
                          Deselect All
                        </button>
                      </div>
                      <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', alignSelf: 'center' }}>
                        {selectedPages.size} pages selected for removal
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '1.5rem', width: '100%', maxWidth: '800px', padding: '1.5rem', border: '1px solid var(--color-border)', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(10px)', marginBottom: '2rem' }}>
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
                              background: isSelected ? 'rgba(234, 67, 53, 0.08)' : 'rgba(255, 255, 255, 0.08)', 
                              padding: '1rem', 
                              borderRadius: '8px', 
                              border: isSelected ? '2px solid #ea4335' : '1px solid var(--color-border)',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease'
                            }}
                            onClick={() => togglePageSelection(page.originalIndex)}
                          >
                            <div style={{ position: 'absolute', top: '0.4rem', left: '0.4rem' }}>
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
                                  accentColor: '#ea4335'
                                }}
                              />
                            </div>
                            <img src={page.thumbnailUrl} alt={`Page ${page.originalIndex + 1}`} style={{ maxWidth: '100px', height: 'auto', border: '1px solid var(--color-border)', borderRadius: '4px', marginBottom: '0.5rem', marginTop: '0.5rem' }} />
                            <span style={{ fontSize: '0.85rem', color: isSelected ? '#ea4335' : 'var(--text-primary)', fontWeight: isSelected ? 'bold' : 'normal' }}>Page {page.originalIndex + 1}</span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
                
                <button onClick={handleRemoveFile} className="btn" style={{ background: '#ea4335', color: '#fff', marginBottom: '1rem' }}>
                  Clear and upload another
                </button>
              </div>
            )
          ) : (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: '#e2f0d9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', color: '#385723' }}>
                <FileCheck size={36} />
              </div>
              <h3 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Pages Removed Successfully!</h3>
              
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginTop: '1.5rem' }}>
                <button 
                  onClick={handleRemoveFile} 
                  style={{ 
                    width: '46px', 
                    height: '46px', 
                    borderRadius: '50%', 
                    backgroundColor: '#3f4254', 
                    border: 'none', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    color: '#ffffff', 
                    cursor: 'pointer', 
                    transition: 'all 0.2s ease'
                  }} 
                  title="Upload another PDF"
                >
                  <ArrowLeft size={20} />
                </button>
                <a 
                  href={downloadUrl} 
                  download={`removed_pages_${files[0]?.name || 'document.pdf'}`} 
                  className="btn btn-primary" 
                  style={{ 
                    textDecoration: 'none', 
                    padding: '0.85rem 2.5rem', 
                    borderRadius: '12px', 
                    fontSize: '1.1rem', 
                    fontWeight: 600, 
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    gap: '0.6rem',
                    backgroundColor: 'var(--color-coral)',
                    borderColor: 'var(--color-coral)',
                    boxShadow: '0 4px 15px rgba(238, 108, 77, 0.25)'
                  }}
                >
                  <Download size={18} /> Download PDF
                </a>
              </div>
            </div>
          )}

          {isProcessing && (
            <ProgressBar progress={progress} message="Removing selected pages..." />
          )}
        </div>
      </div>

      <div className="tool-options-panel">
        <h3 className="panel-title">Remove Options</h3>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
          Select the pages you want to delete from the PDF file, then click the button below to process.
        </p>
        <button 
          className="btn"
          disabled={files.length === 0 || pages.length === 0 || selectedPages.size === 0 || isProcessing}
          onClick={handleSubmit}
          style={{ 
            width: '100%', 
            marginTop: '1.5rem', 
            background: selectedPages.size > 0 ? '#ea4335' : 'var(--bg-glass)',
            color: '#fff', 
            border: 'none', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            gap: '0.5rem',
            opacity: (selectedPages.size === 0 || isProcessing) ? 0.6 : 1
          }}
        >
          <Trash size={18} /> Remove Pages ({selectedPages.size})
        </button>
      </div>
    </div>
  );
};

export default RemovePages;
