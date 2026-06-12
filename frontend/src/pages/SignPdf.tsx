import React, { useState, useRef } from 'react';
import { ArrowLeft, Stamp, Download, FileCheck } from 'lucide-react';
import FileUpload from '../components/FileUpload';
import ProgressBar from '../components/ProgressBar';
import api from '../utils/api';

interface SignPdfProps {
  onBack: () => void;
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

  // Position Parameters
  const [pages, setPages] = useState('1');
  const [xPos, setXPos] = useState(50);
  const [yPos, setYPos] = useState(50);
  const [width, setWidth] = useState(150);
  const [height, setHeight] = useState(75);

  const handleFilesSelected = (newFiles: File[]) => {
    if (newFiles.length > 0) {
      setFiles([newFiles[0]]);
      setDownloadUrl(null);
    }
  };

  const handleRemoveFile = () => {
    setFiles([]);
    setDownloadUrl(null);
  };

  // Canvas drawing handlers
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.beginPath();
    const rect = canvas.getBoundingClientRect();
    let clientX = 0;
    let clientY = 0;

    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    ctx.moveTo((clientX - rect.left) * scaleX, (clientY - rect.top) * scaleY);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    let clientX = 0;
    let clientY = 0;

    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    ctx.lineTo((clientX - rect.left) * scaleX, (clientY - rect.top) * scaleY);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  };

  const stopDrawing = () => {
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

  const handleSubmit = async () => {
    if (files.length === 0) {
      alert('Please upload a PDF file.');
      return;
    }
    if (!signatureData) {
      alert('Please draw a signature first.');
      return;
    }

    setIsProcessing(true);
    setProgress(20);

    const formData = new FormData();
    formData.append('file', files[0]);
    formData.append('signatureData', signatureData);
    formData.append('pages', pages);
    formData.append('x', String(xPos));
    formData.append('y', String(yPos));
    formData.append('width', String(width));
    formData.append('height', String(height));

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
      <div className="tool-workspace">
        <button className="file-remove-btn" style={{ top: '1.5rem', left: '1.5rem', width: 'auto', height: 'auto', borderRadius: '8px', padding: '0.4rem 0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }} onClick={onBack}>
          <ArrowLeft size={16} /> Back to Tools
        </button>

        <div style={{ width: '100%', marginTop: '3rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.75rem', marginBottom: '1.5rem', fontFamily: 'var(--font-display)' }}>Sign PDF Document</h2>

          {!downloadUrl ? (
            files.length === 0 ? (
              <div style={{ width: '100%', maxWidth: '600px' }}>
                <FileUpload
                  accept="application/pdf"
                  multiple={false}
                  onFilesSelected={handleFilesSelected}
                  selectedFiles={files}
                  onRemoveFile={handleRemoveFile}
                />
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', width: '100%', maxWidth: '600px' }}>
                <div style={{ 
                  width: '100%', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between', 
                  background: 'rgba(255,255,255,0.05)', 
                  border: '1px solid var(--color-border)', 
                  borderRadius: '12px', 
                  padding: '1rem 1.5rem' 
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ color: 'var(--color-green)' }}>
                      <FileCheck size={24} />
                    </div>
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem', wordBreak: 'break-all', color: 'var(--text-primary)' }}>{files[0].name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{(files[0].size / 1024 / 1024).toFixed(2)} MB</div>
                    </div>
                  </div>
                  <button 
                    onClick={handleRemoveFile}
                    style={{ 
                      background: 'transparent', 
                      border: 'none', 
                      color: 'var(--color-coral)', 
                      cursor: 'pointer', 
                      fontSize: '0.9rem',
                      fontWeight: 500,
                      padding: '0.25rem 0.5rem'
                    }}
                  >
                    Change File
                  </button>
                </div>

                <div style={{ width: '100%', border: '1px solid var(--color-border)', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', padding: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: 'var(--text-primary)' }}>Draw Your Signature</h3>
                  
                  <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}>
                    <button onClick={() => setColor('#000000')} style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#000000', border: color === '#000000' ? '2.5px solid var(--color-green)' : '1px solid var(--color-border)', cursor: 'pointer' }} />
                    <button onClick={() => setColor('#0000ff')} style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#0000ff', border: color === '#0000ff' ? '2.5px solid var(--color-green)' : '1px solid var(--color-border)', cursor: 'pointer' }} />
                    <button onClick={() => setColor('#ff0000')} style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#ff0000', border: color === '#ff0000' ? '2.5px solid var(--color-green)' : '1px solid var(--color-border)', cursor: 'pointer' }} />
                    <button onClick={clearCanvas} className="btn btn-secondary" style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem', borderRadius: '8px' }}>Clear Canvas</button>
                  </div>

                  <canvas
                    ref={canvasRef}
                    width={400}
                    height={150}
                    style={{ background: 'white', borderRadius: '8px', cursor: 'crosshair', border: '2px solid var(--color-border)', width: '100%', maxWidth: '400px', height: '150px', touchAction: 'none' }}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                  />
                </div>
              </div>
            )
          ) : (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
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
            <ProgressBar progress={progress} message="Stamping signature onto PDF pages..." />
          )}
        </div>
      </div>

      {files.length > 0 && !downloadUrl && (
        <div className="tool-options-panel">
          <h3 className="panel-title">Signature Placement</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Pages (e.g. 1, 2, 5 or 1-3)</label>
              <input type="text" className="form-input" value={pages} onChange={(e) => setPages(e.target.value)} style={{ width: '100%' }} placeholder="e.g. 1-3, 5" />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>X Position</label>
              <input type="number" className="form-input" value={xPos} onChange={(e) => setXPos(Number(e.target.value))} style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Y Position</label>
              <input type="number" className="form-input" value={yPos} onChange={(e) => setYPos(Number(e.target.value))} style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Stamp Width</label>
              <input type="number" className="form-input" value={width} onChange={(e) => setWidth(Number(e.target.value))} style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Stamp Height</label>
              <input type="number" className="form-input" value={height} onChange={(e) => setHeight(Number(e.target.value))} style={{ width: '100%' }} />
            </div>
          </div>

          <button 
            className="btn btn-primary"
            disabled={files.length === 0 || !signatureData || isProcessing}
            onClick={handleSubmit}
            style={{ width: '100%', marginTop: '1.5rem' }}
          >
            <Stamp size={18} /> Sign Document
          </button>
        </div>
      )}
    </div>
  );
};

export default SignPdf;
