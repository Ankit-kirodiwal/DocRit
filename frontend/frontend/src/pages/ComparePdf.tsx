import React, { useState } from 'react';
import { ArrowLeft, Eye, Download, FileCheck } from 'lucide-react';
import FileUpload from '../components/FileUpload';
import ProgressBar from '../components/ProgressBar';
import api from '../utils/api';

interface ComparePdfProps {
  onBack: () => void;
}

const ComparePdf: React.FC<ComparePdfProps> = ({ onBack }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const handleFilesSelected = (newFiles: File[]) => {
    setFiles((prev) => [...prev, ...newFiles].slice(0, 2)); // limit to 2 files
    setDownloadUrl(null);
  };

  const handleRemoveFile = (index: number) => {
    setFiles((prev) => prev.filter((_, idx) => idx !== index));
    setDownloadUrl(null);
  };

  const handleSubmit = async () => {
    if (files.length < 2) {
      alert('Please upload two PDF files to compare.');
      return;
    }
    setIsProcessing(true);
    setProgress(15);

    const formData = new FormData();
    files.forEach(f => formData.append('files', f));

    try {
      setProgress(50);
      const response = await api.post('/compare', formData, {
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
      alert('Error comparing PDFs: ' + (err.response?.data?.error || err.message));
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
          <h2 style={{ fontSize: '1.75rem', marginBottom: '1.5rem', fontFamily: 'var(--font-display)' }}>Compare PDF Files</h2>

          {!downloadUrl ? (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
              <FileUpload
                accept="application/pdf"
                multiple={true}
                onFilesSelected={handleFilesSelected}
                selectedFiles={files}
                onRemoveFile={handleRemoveFile}
              />
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Upload exactly 2 PDF documents to view side-by-side differences.</p>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: '#e2f0d9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', color: '#385723' }}>
                <FileCheck size={36} />
              </div>
              <h3 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>PDF Comparison Complete!</h3>
              <a href={downloadUrl} download="comparison.pdf" className="btn btn-primary" style={{ textDecoration: 'none' }}>
                <Download size={18} /> Download Comparison PDF
              </a>
            </div>
          )}

          {isProcessing && (
            <ProgressBar progress={progress} message="Generating side-by-side comparison page overlays..." />
          )}
        </div>
      </div>

      <div className="tool-options-panel">
        <h3 className="panel-title">Compare Options</h3>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          Upload two revisions of a PDF document to generate a landscape comparison PDF where pages of each document are set side-by-side.
        </p>

        <button 
          className="btn btn-primary"
          disabled={files.length < 2 || isProcessing}
          onClick={handleSubmit}
          style={{ width: '100%', marginTop: '1.5rem' }}
        >
          <Eye size={18} /> Compare PDF
        </button>
      </div>
    </div>
  );
};

export default ComparePdf;
