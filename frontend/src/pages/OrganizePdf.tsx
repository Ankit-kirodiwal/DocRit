import React, { useState, useEffect } from 'react';
import { ArrowLeft, Layers, Download, FileCheck, Trash } from 'lucide-react';
import FileUpload from '../components/FileUpload';
import ProgressBar from '../components/ProgressBar';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

interface OrganizePdfProps {
  onBack: () => void;
}

interface PageItem {
  originalIndex: number; // 0-indexed
  thumbnailUrl: string;
}

const OrganizePdf: React.FC<OrganizePdfProps> = ({ onBack }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [pages, setPages] = useState<PageItem[]>([]);
  const [isLoadingPages, setIsLoadingPages] = useState(false);

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

  const movePage = (index: number, direction: 'left' | 'right') => {
    const newPages = [...pages];
    if (direction === 'left' && index > 0) {
      const temp = newPages[index];
      newPages[index] = newPages[index - 1];
      newPages[index - 1] = temp;
    } else if (direction === 'right' && index < newPages.length - 1) {
      const temp = newPages[index];
      newPages[index] = newPages[index + 1];
      newPages[index + 1] = temp;
    }
    setPages(newPages);
  };

  const deletePage = (index: number) => {
    setPages(pages.filter((_, idx) => idx !== index));
  };

  const handleSubmit = async () => {
    if (files.length === 0 || pages.length === 0) return;
    setIsProcessing(true);
    setProgress(20);
    setDownloadUrl(null);

    try {
      const arrayBuffer = await files[0].arrayBuffer();
      setProgress(40);
      const srcDoc = await PDFDocument.load(new Uint8Array(arrayBuffer));
      const destDoc = await PDFDocument.create();
      
      const indices = pages.map(p => p.originalIndex);
      setProgress(60);
      const copiedPages = await destDoc.copyPages(srcDoc, indices);
      copiedPages.forEach(p => destDoc.addPage(p));
      
      setProgress(85);
      const bytes = await destDoc.save({ useObjectStreams: true });
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      setDownloadUrl(url);
      setProgress(100);
    } catch (err: any) {
      console.error(err);
      alert('Error organizing PDF: ' + err.message);
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
          <h2 style={{ fontSize: '1.75rem', marginBottom: '1.5rem', fontFamily: 'var(--font-display)' }}>Organize PDF Pages</h2>

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
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '1.5rem', width: '100%', maxWidth: '800px', padding: '1rem', border: '1px solid var(--color-border)', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(10px)', marginBottom: '2rem' }}>
                    {pages.map((page, index) => (
                      <div key={index} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'rgba(255,255,255,0.08)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                        <div style={{ position: 'absolute', top: '0.25rem', right: '0.25rem', display: 'flex', gap: '0.2rem' }}>
                          <button onClick={() => deletePage(index)} style={{ background: '#ea4335', color: '#fff', border: 'none', borderRadius: '4px', padding: '0.25rem', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                            <Trash size={12} />
                          </button>
                        </div>
                        <img src={page.thumbnailUrl} alt={`Page ${page.originalIndex + 1}`} style={{ maxWidth: '100px', height: 'auto', border: '1px solid var(--color-border)', borderRadius: '4px', marginBottom: '0.5rem' }} />
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Page {page.originalIndex + 1}</span>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button disabled={index === 0} onClick={() => movePage(index, 'left')} style={{ padding: '0.2rem 0.4rem', borderRadius: '4px', cursor: 'pointer', background: 'var(--bg-glass)', border: '1px solid var(--color-border)', color: 'var(--text-primary)' }}>
                            &larr;
                          </button>
                          <button disabled={index === pages.length - 1} onClick={() => movePage(index, 'right')} style={{ padding: '0.2rem 0.4rem', borderRadius: '4px', cursor: 'pointer', background: 'var(--bg-glass)', border: '1px solid var(--color-border)', color: 'var(--text-primary)' }}>
                            &rarr;
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
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
              <h3 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>PDF Organized Successfully!</h3>
              <div style={{ display: 'flex', gap: '1rem', width: '100%', justifyContent: 'center', marginTop: '1.5rem', flexWrap: 'wrap' }}>
                <button 
                  onClick={handleRemoveFile} 
                  className="btn btn-secondary"
                  style={{ borderRadius: '12px', padding: '0.85rem 1.75rem' }}
                >
                  Organize Another File
                </button>
                <a 
                  href={downloadUrl} 
                  download={`organized_${files[0]?.name || 'document.pdf'}`}
                  className="btn btn-primary" 
                  style={{ textDecoration: 'none', borderRadius: '12px', padding: '0.85rem 2.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  <Download size={18} /> Download Organized PDF
                </a>
              </div>
            </div>
          )}

          {isProcessing && (
            <ProgressBar progress={progress} message="Reorganizing PDF pages..." />
          )}
        </div>
      </div>

      <div className="tool-options-panel">
        <h3 className="panel-title">Organize Options</h3>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          Rearrange pages by moving them left/right, delete unwanted pages, and click Organize below to compile.
        </p>
        <button 
          className="btn btn-primary"
          disabled={files.length === 0 || pages.length === 0 || isProcessing}
          onClick={handleSubmit}
          style={{ width: '100%', marginTop: '1.5rem' }}
        >
          <Layers size={18} /> Organize PDF
        </button>
      </div>
    </div>
  );
};

export default OrganizePdf;
