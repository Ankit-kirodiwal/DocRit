import React, { useState } from 'react';
import { ArrowLeft, FileArchive, Download } from 'lucide-react';
import FileUpload from '../components/FileUpload';
import ProgressBar from '../components/ProgressBar';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';

// Configure worker for offline PDF page rendering
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

interface CompressProps {
  onBack: () => void;
}

const Compress: React.FC<CompressProps> = ({ onBack }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  
  const [originalSize, setOriginalSize] = useState<number | null>(null);
  const [compressedSize, setCompressedSize] = useState<number | null>(null);
  const [compressionLevel, setCompressionLevel] = useState<'extreme' | 'recommended' | 'low'>('recommended');

  const handleFilesSelected = (newFiles: File[]) => {
    if (newFiles.length > 0) {
      setFiles([newFiles[0]]);
      setDownloadUrl(null);
      setOriginalSize(null);
      setCompressedSize(null);
    }
  };

  const handleRemoveFile = () => {
    setFiles([]);
    setDownloadUrl(null);
    setOriginalSize(null);
    setCompressedSize(null);
  };

  const handleSubmit = async () => {
    if (files.length === 0) return;
    setIsProcessing(true);
    setProgress(5);
    setDownloadUrl(null);
    setOriginalSize(files[0].size);
    setCompressedSize(null);

    try {
      const file = files[0];
      const arrayBuffer = await file.arrayBuffer();
      const typedarray = new Uint8Array(arrayBuffer);
      
      setProgress(15);
      const loadingTask = pdfjsLib.getDocument({ data: typedarray });
      const pdf = await loadingTask.promise;
      const totalPages = pdf.numPages;
      
      const compressedPdf = await PDFDocument.create();
      
      // Load source PDF once for copying pages
      const freshBufferForCopy = await file.arrayBuffer();
      const srcDoc = await PDFDocument.load(new Uint8Array(freshBufferForCopy));
      
      // Determine scale and quality based on selection
      let scale = 0.75;
      let quality = 0.5;
      if (compressionLevel === 'extreme') {
        scale = 0.6;
        quality = 0.35;
      } else if (compressionLevel === 'low') {
        scale = 0.95;
        quality = 0.75;
      }

      const ops = (pdfjsLib as any).OPS || {};

      for (let i = 1; i <= totalPages; i++) {
        setProgress(15 + Math.round((i / totalPages) * 70)); // scale from 15% to 85% progress
        
        const page = await pdf.getPage(i);
        
        // Check if page contains images
        const operatorList = await page.getOperatorList();
        let hasImage = false;
        for (let j = 0; j < operatorList.fnArray.length; j++) {
          const fn = operatorList.fnArray[j];
          if (
            fn === ops.paintImageXObject || 
            fn === ops.paintInlineImageXObject ||
            fn === ops.paintImageMaskXObject
          ) {
            hasImage = true;
            break;
          }
        }

        if (hasImage) {
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const context = canvas.getContext('2d');
          
          if (context) {
            await page.render({
              canvasContext: context,
              viewport: viewport
            }).promise;
            
            const jpegDataUrl = canvas.toDataURL('image/jpeg', quality);
            const imageResponse = await fetch(jpegDataUrl);
            const blob = await imageResponse.blob();
            const imgBytes = await blob.arrayBuffer();
            
            const embeddedImg = await compressedPdf.embedJpg(imgBytes);
            const newPage = compressedPdf.addPage([embeddedImg.width, embeddedImg.height]);
            newPage.drawImage(embeddedImg, {
              x: 0,
              y: 0,
              width: embeddedImg.width,
              height: embeddedImg.height
            });
          }
        } else {
          // Lossless copy of vector page
          const copiedPages = await compressedPdf.copyPages(srcDoc, [i - 1]);
          compressedPdf.addPage(copiedPages[0]);
        }
      }
      
      setProgress(90);
      let compressedBytes = await compressedPdf.save({ useObjectStreams: true });
      
      let finalBytes = compressedBytes;
      let finalSize = compressedBytes.length;
      
      // Fallback: If rasterized size is larger than or equal to the original size,
      // perform structural compression (lossless) on the original document to guarantee it's not larger!
      if (finalSize >= file.size) {
        console.log('Rasterized size is larger than original. Trying structural optimization.');
        // Load a fresh ArrayBuffer to prevent detached ArrayBuffer exceptions
        const freshBuffer = await file.arrayBuffer();
        const originalDoc = await PDFDocument.load(new Uint8Array(freshBuffer));
        const structuralBytes = await originalDoc.save({ useObjectStreams: true });
        
        if (structuralBytes.length < file.size) {
          finalSize = structuralBytes.length;
          finalBytes = structuralBytes;
          console.log('Structural optimization succeeded. Size:', finalSize);
        } else {
          // If even structural compression doesn't reduce size (already optimized),
          // we fall back to using the original raw file (0% compression, but 100% quality, no file size increase!).
          finalSize = file.size;
          const originalFreshBuffer = await file.arrayBuffer();
          finalBytes = new Uint8Array(originalFreshBuffer);
          console.log('Using original file as fallback to prevent size increase.');
        }
      }
      
      const compressedBlob = new Blob([finalBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      setCompressedSize(finalSize);
      const url = window.URL.createObjectURL(compressedBlob);
      setDownloadUrl(url);
      setProgress(100);
    } catch (err: any) {
      console.error(err);
      alert('Error compressing PDF: ' + err.message);
      setProgress(0);
    } finally {
      setIsProcessing(false);
    }
  };

  const formatSize = (bytes: number): string => {
    if (bytes >= 1024 * 1024) {
      return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }
    return (bytes / 1024).toFixed(2) + ' KB';
  };

  const savingsPercent = originalSize && compressedSize && originalSize > compressedSize
    ? Math.round(((originalSize - compressedSize) / originalSize) * 100)
    : 0;

  return (
    <div className="tool-page-container">
      <div className="tool-workspace">
        <button className="file-remove-btn" style={{ top: '1.5rem', left: '1.5rem', width: 'auto', height: 'auto', borderRadius: '8px', padding: '0.4rem 0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }} onClick={onBack}>
          <ArrowLeft size={16} /> Back to Tools
        </button>

        <div style={{ width: '100%', marginTop: '3rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {!downloadUrl ? (
            <>
              <h2 style={{ fontSize: '1.75rem', marginBottom: '1.5rem', fontFamily: 'var(--font-display)' }}>Compress PDF File</h2>
              <FileUpload
                accept="application/pdf"
                multiple={false}
                onFilesSelected={handleFilesSelected}
                selectedFiles={files}
                onRemoveFile={handleRemoveFile}
              />
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '1rem', width: '100%', maxWidth: '600px' }}>
              <h3 style={{ fontSize: '1.75rem', marginBottom: '2rem', fontWeight: 600, fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
                PDFs have been compressed!
              </h3>
              
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginBottom: '2.5rem' }}>
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
                    transition: 'all 0.2s ease',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                  }} 
                  title="Upload another PDF"
                  onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                  onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                >
                  <ArrowLeft size={20} />
                </button>
                <a 
                  href={downloadUrl} 
                  download={`compressed_${files[0]?.name || 'document.pdf'}`}
                  className="btn"
                  style={{ 
                    textDecoration: 'none', 
                    padding: '0.85rem 2.5rem', 
                    borderRadius: '12px', 
                    fontSize: '1.15rem', 
                    fontWeight: 600, 
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    gap: '0.6rem',
                    backgroundColor: 'var(--color-coral)',
                    color: '#ffffff',
                    border: 'none',
                    boxShadow: '0 4px 15px rgba(238, 108, 77, 0.25)',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
                  onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                >
                  <Download size={20} /> Download compressed PDF
                </a>
              </div>

              {originalSize && compressedSize && (
                <div 
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '1.5rem', 
                    padding: '1.25rem 2rem', 
                    borderRadius: '16px', 
                    backgroundColor: 'rgba(255, 255, 255, 0.02)', 
                    border: '1px solid var(--color-border)',
                    maxWidth: '460px',
                    margin: '0 auto',
                    justifyContent: 'center'
                  }}
                >
                  {/* Circular progress gauge */}
                  <div style={{ position: 'relative', width: '76px', height: '76px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="76" height="76" viewBox="0 0 76 76" style={{ transform: 'rotate(-90deg)' }}>
                      <circle
                        cx="38"
                        cy="38"
                        r="32"
                        fill="transparent"
                        stroke="rgba(128, 128, 128, 0.2)"
                        strokeWidth="6"
                      />
                      <circle
                        cx="38"
                        cy="38"
                        r="32"
                        fill="transparent"
                        stroke="var(--color-coral)"
                        strokeWidth="6"
                        strokeDasharray={2 * Math.PI * 32}
                        strokeDashoffset={2 * Math.PI * 32 * (1 - savingsPercent / 100)}
                        strokeLinecap="round"
                        style={{ transition: 'stroke-dashoffset 1s ease-out' }}
                      />
                    </svg>
                    <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
                      <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>{savingsPercent}%</span>
                      <span style={{ fontSize: '0.55rem', fontWeight: 700, color: 'var(--text-muted)', marginTop: '2px', letterSpacing: '0.5px' }}>SAVED</span>
                    </div>
                  </div>

                  {/* Text summary block */}
                  <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left', gap: '0.25rem' }}>
                    <p style={{ margin: 0, fontSize: '1rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                      Your PDF is now <strong style={{ color: 'var(--color-coral)' }}>{savingsPercent}%</strong> smaller!
                    </p>
                    <p style={{ margin: 0, fontSize: '1.15rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                      {formatSize(originalSize)} <span style={{ color: 'var(--text-muted)', fontWeight: 'normal', margin: '0 0.25rem' }}>→</span> {formatSize(compressedSize)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {isProcessing && (
            <ProgressBar progress={progress} message="Compressing PDF structures..." />
          )}
        </div>
      </div>

      <div className="tool-options-panel">
        <h3 className="panel-title">Compression Options</h3>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          Choose your target compression level. High compression results in smaller files, but slightly lower visual quality.
        </p>

        <div style={{ marginTop: '1.25rem', marginBottom: '1.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div 
            onClick={() => !isProcessing && setCompressionLevel('recommended')}
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              border: compressionLevel === 'recommended' ? '2px solid var(--color-coral)' : '1px solid var(--color-border)',
              background: compressionLevel === 'recommended' ? 'rgba(238, 108, 77, 0.08)' : 'rgba(255,255,255,0.02)',
              cursor: isProcessing ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
              opacity: isProcessing ? 0.7 : 1
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>Recommended</span>
              <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-coral)', background: 'rgba(238, 108, 77, 0.15)', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>Default</span>
            </div>
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.3 }}>
              Balanced quality and file size reduction.
            </p>
          </div>

          <div 
            onClick={() => !isProcessing && setCompressionLevel('extreme')}
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              border: compressionLevel === 'extreme' ? '2px solid var(--color-coral)' : '1px solid var(--color-border)',
              background: compressionLevel === 'extreme' ? 'rgba(238, 108, 77, 0.08)' : 'rgba(255,255,255,0.02)',
              cursor: isProcessing ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
              opacity: isProcessing ? 0.7 : 1
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>Extreme Compression</span>
            </div>
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.3 }}>
              Maximum size reduction, slightly lower resolution.
            </p>
          </div>

          <div 
            onClick={() => !isProcessing && setCompressionLevel('low')}
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              border: compressionLevel === 'low' ? '2px solid var(--color-coral)' : '1px solid var(--color-border)',
              background: compressionLevel === 'low' ? 'rgba(238, 108, 77, 0.08)' : 'rgba(255,255,255,0.02)',
              cursor: isProcessing ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
              opacity: isProcessing ? 0.7 : 1
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>Less Compression</span>
            </div>
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.3 }}>
              High quality output with minor file size optimization.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <button 
            className="btn btn-primary"
            disabled={files.length === 0 || isProcessing}
            onClick={handleSubmit}
            style={{ width: '100%', opacity: (files.length === 0 || isProcessing) ? 0.6 : 1 }}
          >
            <FileArchive size={18} /> Compress PDF
          </button>
        </div>
      </div>
    </div>
  );
};

export default Compress;
