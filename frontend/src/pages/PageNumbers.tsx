import React, { useState } from 'react';
import { ArrowLeft, Hash, Download, FileCheck } from 'lucide-react';
import FileUpload from '../components/FileUpload';
import ProgressBar from '../components/ProgressBar';
import api from '../utils/api';

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

  return (
    <div className="tool-page-container">
      <div className="tool-workspace">
        <button className="file-remove-btn" style={{ top: '1.5rem', left: '1.5rem', width: 'auto', height: 'auto', borderRadius: '8px', padding: '0.4rem 0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }} onClick={onBack}>
          <ArrowLeft size={16} /> Back to Tools
        </button>

        <div style={{ width: '100%', marginTop: '3rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.75rem', marginBottom: '1.5rem', fontFamily: 'var(--font-display)' }}>Add Page Numbers</h2>
          
          {!downloadUrl ? (
            <FileUpload
              accept="application/pdf"
              multiple={false}
              onFilesSelected={handleFilesSelected}
              selectedFiles={files}
              onRemoveFile={handleRemoveFile}
            />
          ) : (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
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
            <ProgressBar progress={progress} message="Adding page numbers to document pages..." />
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
