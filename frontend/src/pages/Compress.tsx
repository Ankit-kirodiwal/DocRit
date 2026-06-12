import React, { useState } from 'react';
import { ArrowLeft, FileArchive, Download } from 'lucide-react';
import FileUpload from '../components/FileUpload';
import ProgressBar from '../components/ProgressBar';
import api from '../utils/api';

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
  const [compressionLevel, setCompressionLevel] = useState<'extreme' | 'recommended' | 'low' | 'custom'>('recommended');
  const [customDpi, setCustomDpi] = useState<number>(150);
  const [customQuality, setCustomQuality] = useState<number>(70);

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
    setProgress(15);
    setDownloadUrl(null);
    setOriginalSize(files[0].size);
    setCompressedSize(null);

    const formData = new FormData();
    formData.append('file', files[0]);
    formData.append('level', compressionLevel === 'recommended' ? 'medium' : compressionLevel);
    if (compressionLevel === 'custom') {
      formData.append('dpi', customDpi.toString());
      formData.append('quality', customQuality.toString());
    }

    try {
      setProgress(40);
      const response = await api.post('/compress', formData, {
        responseType: 'blob',
        onUploadProgress: (progressEvent) => {
          const percent = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1));
          setProgress(40 + percent * 0.4);
        }
      });
      
      setProgress(85);
      
      const origHeader = response.headers['x-original-size'];
      const compHeader = response.headers['x-compressed-size'];
      
      if (origHeader) {
        setOriginalSize(parseInt(origHeader, 10));
      } else {
        setOriginalSize(files[0].size);
      }
      
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      
      if (compHeader) {
        setCompressedSize(parseInt(compHeader, 10));
      } else {
        setCompressedSize(blob.size);
      }
      
      setDownloadUrl(url);
      setProgress(100);
    } catch (err: any) {
      console.error(err);
      alert('Error compressing PDF: ' + (err.response?.data?.error || err.message));
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
                    backgroundColor: 'var(--color-green)',
                    color: '#ffffff',
                    border: 'none',
                    boxShadow: '0 4px 15px rgba(16, 185, 129, 0.25)',
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
                        stroke="var(--color-green)"
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
                      Your PDF is now <strong style={{ color: 'var(--color-green)' }}>{savingsPercent}%</strong> smaller!
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
              border: compressionLevel === 'recommended' ? '2px solid var(--color-green)' : '1px solid var(--color-border)',
              background: compressionLevel === 'recommended' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(255,255,255,0.02)',
              cursor: isProcessing ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
              opacity: isProcessing ? 0.7 : 1
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>Recommended</span>
              <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-green)', background: 'rgba(16, 185, 129, 0.15)', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>Default</span>
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
              border: compressionLevel === 'extreme' ? '2px solid var(--color-green)' : '1px solid var(--color-border)',
              background: compressionLevel === 'extreme' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(255,255,255,0.02)',
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
              border: compressionLevel === 'low' ? '2px solid var(--color-green)' : '1px solid var(--color-border)',
              background: compressionLevel === 'low' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(255,255,255,0.02)',
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

          <div 
            onClick={() => !isProcessing && setCompressionLevel('custom')}
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              border: compressionLevel === 'custom' ? '2px solid var(--color-green)' : '1px solid var(--color-border)',
              background: compressionLevel === 'custom' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(255,255,255,0.02)',
              cursor: isProcessing ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
              opacity: isProcessing ? 0.7 : 1
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>Custom Compression</span>
            </div>
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.3 }}>
              Specify your own downsampling resolution (DPI) and JPEG quality.
            </p>
          </div>
        </div>

        {compressionLevel === 'custom' && (
          <div style={{ marginTop: '-1rem', marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.75rem', borderRadius: '8px', border: '1px dashed var(--color-border)', background: 'rgba(255,255,255,0.01)' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                Image Downsampling (DPI)
              </label>
              <input 
                type="number" 
                value={customDpi} 
                onChange={(e) => setCustomDpi(Math.max(50, Math.min(600, parseInt(e.target.value) || 150)))}
                disabled={isProcessing}
                style={{
                  width: '100%',
                  padding: '0.4rem 0.6rem',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border)',
                  background: 'rgba(0,0,0,0.2)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem'
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                JPEG Compression Quality (10 - 100)
              </label>
              <input 
                type="number" 
                value={customQuality} 
                onChange={(e) => setCustomQuality(Math.max(10, Math.min(100, parseInt(e.target.value) || 70)))}
                disabled={isProcessing}
                style={{
                  width: '100%',
                  padding: '0.4rem 0.6rem',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border)',
                  background: 'rgba(0,0,0,0.2)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem'
                }}
              />
            </div>
          </div>
        )}

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
