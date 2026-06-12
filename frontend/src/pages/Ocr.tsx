import React, { useState } from 'react';
import { ArrowLeft, Download, FileCheck, Sparkles } from 'lucide-react';
import FileUpload from '../components/FileUpload';
import ProgressBar from '../components/ProgressBar';
import api from '../utils/api';

interface OcrProps {
  onBack: () => void;
}

type OcrFormat = 'pdf';

const Ocr: React.FC<OcrProps> = ({ onBack }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [ocrFormat] = useState<OcrFormat>('pdf');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

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

  const handleSubmit = async () => {
    if (files.length === 0) return;
    setIsProcessing(true);
    setProgress(15);

    const formData = new FormData();
    formData.append('file', files[0]);
    formData.append('ocrFormat', ocrFormat);

    try {
      setProgress(40);
      const response = await api.post('/ocr', formData, {
        responseType: 'blob',
        onUploadProgress: (progressEvent) => {
          const percent = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1));
          setProgress(40 + percent * 0.4);
        }
      });

      setProgress(90);
      
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      setDownloadUrl(url);
      setProgress(100);
    } catch (err: any) {
      console.error(err);
      alert('Error running OCR: ' + (err.response?.data?.error || err.message));
      setProgress(0);
    } finally {
      setIsProcessing(false);
    }
  };

  const getDownloadFilename = () => {
    const origName = files[0]?.name || 'document';
    const base = origName.substring(0, origName.lastIndexOf('.')) || origName;
    return `${base}_searchable.pdf`;
  };

  return (
    <div className="tool-page-container">
      <div className="tool-workspace">
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
          <h2 style={{ fontSize: '1.75rem', marginBottom: '1.5rem', fontFamily: 'var(--font-display)' }}>OCR PDF / Image</h2>

          {!downloadUrl ? (
            <FileUpload
              accept="application/pdf,image/*"
              multiple={false}
              onFilesSelected={handleFilesSelected}
              selectedFiles={files}
              onRemoveFile={handleRemoveFile}
            />
          ) : (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <div style={{ 
                width: '64px', 
                height: '64px', 
                borderRadius: '50%', 
                backgroundColor: '#e2f0d9', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                margin: '0 auto 1.5rem', 
                color: '#385723' 
              }}>
                <FileCheck size={36} />
              </div>
              <h3 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>OCR Completed Successfully!</h3>
              <a 
                href={downloadUrl} 
                download={getDownloadFilename()} 
                className="btn btn-primary" 
                style={{ textDecoration: 'none' }}
              >
                <Download size={18} /> Download OCR File ({ocrFormat.toUpperCase()})
              </a>
            </div>
          )}

          {isProcessing && (
            <ProgressBar progress={progress} message="Performing optical character recognition and layout structural extraction..." />
          )}
        </div>
      </div>

      <div className="tool-options-panel">
        <h3 className="panel-title">OCR Options</h3>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
          Extract text from scanned PDF files and images using advanced Tesseract OCR engine.
        </p>

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            Output Format
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            
            <label style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.5rem', 
              padding: '0.65rem 0.75rem', 
              borderRadius: '6px', 
              border: '1px solid var(--color-border)', 
              background: 'rgba(238, 108, 77, 0.08)',
              borderColor: 'var(--color-coral)',
              cursor: 'default' 
            }}>
              <input 
                type="radio" 
                name="ocrFormat" 
                value="pdf" 
                checked={true} 
                readOnly
              />
              <div>
                <strong style={{ fontSize: '0.85rem', display: 'block' }}>Searchable PDF (.pdf)</strong>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Overlay searchable text layer onto original layout</span>
              </div>
            </label>
          </div>
        </div>

        <button 
          className="btn btn-primary"
          disabled={files.length === 0 || isProcessing}
          onClick={handleSubmit}
          style={{ width: '100%' }}
        >
          <Sparkles size={18} /> Perform OCR
        </button>
      </div>
    </div>
  );
};

export default Ocr;
