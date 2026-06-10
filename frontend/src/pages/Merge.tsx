import React, { useState } from 'react';
import { ArrowLeft, Merge as MergeIcon, Download, FileCheck } from 'lucide-react';
import FileUpload from '../components/FileUpload';
import ProgressBar from '../components/ProgressBar';
import api from '../utils/api';

interface MergeProps {
  onBack: () => void;
}

const Merge: React.FC<MergeProps> = ({ onBack }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const handleFilesSelected = (newFiles: File[]) => {
    setFiles((prev) => [...prev, ...newFiles]);
    setDownloadUrl(null);
  };

  const handleRemoveFile = (index: number) => {
    setFiles((prev) => prev.filter((_, idx) => idx !== index));
    setDownloadUrl(null);
  };

  const handleSubmit = async () => {
    if (files.length < 2) return;
    setIsProcessing(true);
    setProgress(10);
    setDownloadUrl(null);

    const formData = new FormData();
    files.forEach((file) => {
      formData.append('files', file);
    });

    try {
      setProgress(30);
      const response = await api.post('/merge', formData, {
        responseType: 'blob',
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1));
          setProgress(30 + percentCompleted * 0.5); // Map to 30% - 80% range
        }
      });

      setProgress(90);
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      setDownloadUrl(url);
      setProgress(100);
    } catch (err: any) {
      console.error(err);
      alert('Error merging PDFs: ' + (err.response?.data?.error || err.message));
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
          <h2 style={{ fontSize: '1.75rem', marginBottom: '1.5rem', fontFamily: 'var(--font-display)' }}>Merge PDF Files</h2>
          
          {!downloadUrl ? (
            <FileUpload
              accept="application/pdf"
              multiple={true}
              onFilesSelected={handleFilesSelected}
              selectedFiles={files}
              onRemoveFile={handleRemoveFile}
            />
          ) : (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: '#e2f0d9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', color: '#385723' }}>
                <FileCheck size={36} />
              </div>
              <h3 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>PDF Files Merged Successfully!</h3>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Your new PDF is ready to download.</p>
              <a 
                href={downloadUrl} 
                download="merged.pdf"
                className="btn btn-primary"
                style={{ textDecoration: 'none' }}
              >
                <Download size={18} /> Download Merged PDF
              </a>
            </div>
          )}

          {isProcessing && (
            <ProgressBar progress={progress} message="Merging your PDF documents..." />
          )}
        </div>
      </div>

      <div className="tool-options-panel">
        <h3 className="panel-title">Merge Settings</h3>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          Select multiple PDF documents and combine them into a single file. You can see the files you added in the list below.
        </p>

        <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Total Files Selected: <strong>{files.length}</strong>
          </div>
          <button 
            className="btn btn-primary"
            disabled={files.length < 2 || isProcessing}
            onClick={handleSubmit}
            style={{ width: '100%', opacity: (files.length < 2 || isProcessing) ? 0.6 : 1 }}
          >
            <MergeIcon size={18} /> Merge PDFs
          </button>
        </div>
      </div>
    </div>
  );
};

export default Merge;
