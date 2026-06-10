import React, { useState } from 'react';
import { ArrowLeft, Stamp, Download, FileCheck, Type, Image as ImageIcon } from 'lucide-react';
import FileUpload from '../components/FileUpload';
import ProgressBar from '../components/ProgressBar';
import api from '../utils/api';

interface WatermarkProps {
  onBack: () => void;
}

const Watermark: React.FC<WatermarkProps> = ({ onBack }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [type, setType] = useState<'text' | 'image'>('text');
  const [text, setText] = useState('DRAFT');
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [opacity, setOpacity] = useState('0.3');
  const [size, setSize] = useState('50');
  const [rotation, setRotation] = useState('45');
  const [position, setPosition] = useState('center');
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

  const handleImageSelected = (newImages: File[]) => {
    if (newImages.length > 0) {
      setImageFiles([newImages[0]]);
    }
  };

  const handleRemoveImage = () => {
    setImageFiles([]);
  };

  const handleSubmit = async () => {
    if (files.length === 0) return;
    if (type === 'text' && !text.trim()) return;
    if (type === 'image' && imageFiles.length === 0) return;

    setIsProcessing(true);
    setProgress(15);
    setDownloadUrl(null);

    const formData = new FormData();
    formData.append('file', files[0]);
    formData.append('type', type);
    formData.append('opacity', opacity);
    formData.append('size', size);
    formData.append('rotation', rotation);
    formData.append('position', position);

    if (type === 'text') {
      formData.append('text', text);
    } else {
      formData.append('image', imageFiles[0]);
    }

    try {
      setProgress(40);
      const response = await api.post('/watermark', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        responseType: 'blob',
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1));
          setProgress(40 + percentCompleted * 0.45);
        }
      });

      setProgress(90);
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      setDownloadUrl(url);
      setProgress(100);
    } catch (err: any) {
      console.error(err);
      alert('Error watermarking PDF: ' + (err.response?.data?.error || err.message));
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
          <h2 style={{ fontSize: '1.75rem', marginBottom: '1.5rem', fontFamily: 'var(--font-display)' }}>Watermark PDF File</h2>
          
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
              <h3 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Watermark Added Successfully!</h3>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Your watermarked PDF is ready to download.</p>
              <a 
                href={downloadUrl} 
                download={`watermarked_${files[0]?.name || 'document.pdf'}`}
                className="btn btn-primary"
                style={{ textDecoration: 'none' }}
              >
                <Download size={18} /> Download Watermarked PDF
              </a>
            </div>
          )}

          {isProcessing && (
            <ProgressBar progress={progress} message="Adding watermark overlay to document pages..." />
          )}
        </div>
      </div>

      <div className="tool-options-panel">
        <h3 className="panel-title">Watermark Settings</h3>
        
        {/* Toggle Type */}
        <div style={{ display: 'flex', border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden', marginBottom: '1rem' }}>
          <button
            type="button"
            className="btn"
            style={{ 
              flex: 1, 
              borderRadius: 0, 
              backgroundColor: type === 'text' ? 'var(--color-coral)' : 'transparent',
              color: type === 'text' ? 'white' : 'var(--text-primary)',
              boxShadow: 'none'
            }}
            onClick={() => setType('text')}
          >
            <Type size={16} /> Text
          </button>
          <button
            type="button"
            className="btn"
            style={{ 
              flex: 1, 
              borderRadius: 0, 
              backgroundColor: type === 'image' ? 'var(--color-coral)' : 'transparent',
              color: type === 'image' ? 'white' : 'var(--text-primary)',
              boxShadow: 'none'
            }}
            onClick={() => setType('image')}
          >
            <ImageIcon size={16} /> Image
          </button>
        </div>

        {type === 'text' ? (
          <div className="form-group">
            <label className="form-label" htmlFor="watermark-text-input">Watermark Text</label>
            <input
              id="watermark-text-input"
              type="text"
              className="form-input"
              placeholder="e.g. CONFIDENTIAL"
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={isProcessing || files.length === 0}
            />
          </div>
        ) : (
          <div className="form-group">
            <label className="form-label">Watermark Image</label>
            <FileUpload
              accept="image/png, image/jpeg"
              multiple={false}
              onFilesSelected={handleImageSelected}
              selectedFiles={imageFiles}
              onRemoveFile={handleRemoveImage}
            />
          </div>
        )}

        <div className="form-group">
          <label className="form-label" htmlFor="opacity-select">Opacity</label>
          <select 
            id="opacity-select"
            className="form-select"
            value={opacity}
            onChange={(e) => setOpacity(e.target.value)}
            disabled={isProcessing || files.length === 0}
          >
            <option value="0.1">10% (Very Faint)</option>
            <option value="0.2">20%</option>
            <option value="0.3">30% (Standard)</option>
            <option value="0.5">50%</option>
            <option value="0.7">70%</option>
            <option value="1.0">100% (Solid)</option>
          </select>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="scale-select">{type === 'text' ? 'Font Size (pt)' : 'Image Scale (%)'}</label>
          <select 
            id="scale-select"
            className="form-select"
            value={size}
            onChange={(e) => setSize(e.target.value)}
            disabled={isProcessing || files.length === 0}
          >
            <option value="20">Small (20)</option>
            <option value="36">Medium (36)</option>
            <option value="50">Large (50)</option>
            <option value="72">Extra Large (72)</option>
            <option value="100">Huge (100)</option>
          </select>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="watermark-rotation-input">Rotation Angle</label>
          <input
            id="watermark-rotation-input"
            type="number"
            className="form-input"
            value={rotation}
            onChange={(e) => setRotation(e.target.value)}
            disabled={isProcessing || files.length === 0}
            min="-360"
            max="360"
          />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="watermark-position-select">Position</label>
          <select 
            id="watermark-position-select"
            className="form-select"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            disabled={isProcessing || files.length === 0}
          >
            <option value="center">Center</option>
            <option value="top-left">Top Left</option>
            <option value="top-right">Top Right</option>
            <option value="bottom-left">Bottom Left</option>
            <option value="bottom-right">Bottom Right</option>
          </select>
        </div>

        <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <button 
            className="btn btn-primary"
            disabled={files.length === 0 || isProcessing}
            onClick={handleSubmit}
            style={{ width: '100%', opacity: (files.length === 0 || isProcessing) ? 0.6 : 1 }}
          >
            <Stamp size={18} /> Add Watermark
          </button>
        </div>
      </div>
    </div>
  );
};

export default Watermark;
