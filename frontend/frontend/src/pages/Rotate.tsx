import React, { useState } from 'react';
import { ArrowLeft, RotateCw, Download, FileCheck } from 'lucide-react';
import FileUpload from '../components/FileUpload';
import ProgressBar from '../components/ProgressBar';
import api from '../utils/api';

interface RotateProps {
  onBack: () => void;
}

const Rotate: React.FC<RotateProps> = ({ onBack }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [angle, setAngle] = useState('90');
  const [targetPages, setTargetPages] = useState('');
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
    formData.append('angle', angle);
    if (targetPages.trim()) {
      formData.append('pages', targetPages);
    }

    try {
      setProgress(40);
      const response = await api.post('/rotate', formData, {
        responseType: 'blob',
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1));
          setProgress(40 + percentCompleted * 0.4);
        }
      });

      setProgress(90);
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      setDownloadUrl(url);
      setProgress(100);
    } catch (err: any) {
      console.error(err);
      alert('Error rotating PDF: ' + (err.response?.data?.error || err.message));
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
          <h2 style={{ fontSize: '1.75rem', marginBottom: '1.5rem', fontFamily: 'var(--font-display)' }}>Rotate PDF File</h2>
          
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
              <h3 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>PDF Rotated Successfully!</h3>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Your rotated PDF is ready to download.</p>
              <a 
                href={downloadUrl} 
                download={`rotated_${files[0]?.name || 'document.pdf'}`}
                className="btn btn-primary"
                style={{ textDecoration: 'none' }}
              >
                <Download size={18} /> Download Rotated PDF
              </a>
            </div>
          )}

          {isProcessing && (
            <ProgressBar progress={progress} message="Rotating selected pages in the document..." />
          )}
        </div>
      </div>

      <div className="tool-options-panel">
        <h3 className="panel-title">Rotation Settings</h3>
        
        <div className="form-group">
          <label className="form-label" htmlFor="rotation-angle-select">Rotation Angle</label>
          <select 
            id="rotation-angle-select"
            className="form-select"
            value={angle}
            onChange={(e) => setAngle(e.target.value)}
            disabled={isProcessing || files.length === 0}
          >
            <option value="90">90&deg; Clockwise</option>
            <option value="180">180&deg; Flip</option>
            <option value="-90">90&deg; Counter-Clockwise</option>
          </select>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="target-pages-input">Target Pages (Optional)</label>
          <input
            id="target-pages-input"
            type="text"
            className="form-input"
            placeholder="e.g. 1-3, 5 (blank for all)"
            value={targetPages}
            onChange={(e) => setTargetPages(e.target.value)}
            disabled={isProcessing || files.length === 0}
          />
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Leave blank to rotate all pages.</span>
        </div>

        <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <button 
            className="btn btn-primary"
            disabled={files.length === 0 || isProcessing}
            onClick={handleSubmit}
            style={{ width: '100%', opacity: (files.length === 0 || isProcessing) ? 0.6 : 1 }}
          >
            <RotateCw size={18} /> Rotate PDF
          </button>
        </div>
      </div>
    </div>
  );
};

export default Rotate;
