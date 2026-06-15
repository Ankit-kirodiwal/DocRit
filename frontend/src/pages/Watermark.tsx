import React, { useState, useEffect } from 'react';
import { ArrowLeft, Stamp, Download, FileCheck, Type, Image as ImageIcon } from 'lucide-react';
import FileUpload from '../components/FileUpload';
import ProgressBar from '../components/ProgressBar';
import api from '../utils/api';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

interface WatermarkProps {
  onBack: () => void;
}

interface PreviewPage {
  dataUrl: string;
  width: number;
  height: number;
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

  // PDF Page preview state
  const [isLoadingPages, setIsLoadingPages] = useState(false);
  const [previewPage, setPreviewPage] = useState<PreviewPage | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

  const handleFilesSelected = (newFiles: File[]) => {
    if (newFiles.length > 0) {
      setFiles([newFiles[0]]);
      setDownloadUrl(null);
      setPreviewPage(null);
    }
  };

  const handleRemoveFile = () => {
    setFiles([]);
    setDownloadUrl(null);
    setPreviewPage(null);
  };

  const handleImageSelected = (newImages: File[]) => {
    if (newImages.length > 0) {
      setImageFiles([newImages[0]]);
    }
  };

  const handleRemoveImage = () => {
    setImageFiles([]);
    setImagePreviewUrl(null);
  };

  // Render PDF Page 1
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
        
        if (pdf.numPages > 0) {
          const page = await pdf.getPage(1);
          const viewport = page.getViewport({ scale: 0.6 }); // nice size for preview
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const context = canvas.getContext('2d');
          if (context) {
            await page.render({
              canvasContext: context,
              viewport: viewport
            }).promise;
            
            setPreviewPage({
              dataUrl: canvas.toDataURL('image/jpeg', 0.8),
              width: viewport.width,
              height: viewport.height
            });
          }
        }
      } catch (err) {
        console.error('Error rendering page preview:', err);
      } finally {
        setIsLoadingPages(false);
      }
    };

    fileReader.readAsArrayBuffer(file);
  }, [files]);

  // Load image file data URL for preview
  useEffect(() => {
    if (imageFiles.length === 0) {
      setImagePreviewUrl(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreviewUrl(e.target?.result as string);
    };
    reader.readAsDataURL(imageFiles[0]);
  }, [imageFiles]);

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

  // Generate watermark style based on alignment and values
  const getWatermarkOverlayStyle = (): React.CSSProperties => {
    const isText = type === 'text';
    const numSize = parseInt(size, 10);
    // scale sizes for preview relative to screen scale
    const displayStyle = isText ? `${Math.round(numSize * 0.5)}px` : `${numSize}%`;
    const numOpacity = parseFloat(opacity);

    const baseStyle: React.CSSProperties = {
      position: 'absolute',
      opacity: numOpacity,
      zIndex: 5,
      pointerEvents: 'none',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'all 0.2s ease'
    };

    const rotationTransform = `rotate(${rotation}deg)`;

    switch (position) {
      case 'top-left':
        return {
          ...baseStyle,
          top: '20px',
          left: '20px',
          transform: rotationTransform,
          transformOrigin: 'center center',
          fontSize: isText ? displayStyle : undefined,
          width: !isText ? displayStyle : undefined,
          color: isText ? 'rgba(0,0,0,0.45)' : undefined,
          fontWeight: 'bold',
          fontFamily: 'sans-serif'
        };
      case 'top-right':
        return {
          ...baseStyle,
          top: '20px',
          right: '20px',
          transform: rotationTransform,
          transformOrigin: 'center center',
          fontSize: isText ? displayStyle : undefined,
          width: !isText ? displayStyle : undefined,
          color: isText ? 'rgba(0,0,0,0.45)' : undefined,
          fontWeight: 'bold',
          fontFamily: 'sans-serif'
        };
      case 'bottom-left':
        return {
          ...baseStyle,
          bottom: '20px',
          left: '20px',
          transform: rotationTransform,
          transformOrigin: 'center center',
          fontSize: isText ? displayStyle : undefined,
          width: !isText ? displayStyle : undefined,
          color: isText ? 'rgba(0,0,0,0.45)' : undefined,
          fontWeight: 'bold',
          fontFamily: 'sans-serif'
        };
      case 'bottom-right':
        return {
          ...baseStyle,
          bottom: '20px',
          right: '20px',
          transform: rotationTransform,
          transformOrigin: 'center center',
          fontSize: isText ? displayStyle : undefined,
          width: !isText ? displayStyle : undefined,
          color: isText ? 'rgba(0,0,0,0.45)' : undefined,
          fontWeight: 'bold',
          fontFamily: 'sans-serif'
        };
      case 'center':
      default:
        return {
          ...baseStyle,
          top: '50%',
          left: '50%',
          transform: `translate(-50%, -50%) ${rotationTransform}`,
          transformOrigin: 'center center',
          fontSize: isText ? displayStyle : undefined,
          width: !isText ? displayStyle : undefined,
          color: isText ? 'rgba(0,0,0,0.45)' : undefined,
          fontWeight: 'bold',
          fontFamily: 'sans-serif',
          textAlign: 'center'
        };
    }
  };

  return (
    <div className="tool-page-container">
      <div className="tool-workspace" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'stretch' }}>
        <div className="tool-workspace-header">
          <button className="file-remove-btn" onClick={onBack}>
            <ArrowLeft size={16} /> Back to Tools
          </button>
          {files.length > 0 && !downloadUrl && (
            <button 
              className="btn btn-secondary" 
              onClick={handleRemoveFile}
              style={{ padding: '0.4rem 0.8rem', borderRadius: '8px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--color-coral)', borderColor: 'rgba(238, 108, 77, 0.2)' }}
            >
              Choose Another PDF File
            </button>
          )}
        </div>

        <div style={{ width: '100%', marginTop: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
          <h2 style={{ fontSize: '1.75rem', marginBottom: '1.5rem', fontFamily: 'var(--font-display)' }}>Watermark PDF File</h2>
          
          {!downloadUrl ? (
            files.length === 0 ? (
              <div style={{ width: '100%', maxWidth: '600px', margin: 'auto' }}>
                <FileUpload
                  accept="application/pdf"
                  multiple={false}
                  onFilesSelected={handleFilesSelected}
                  selectedFiles={files}
                  onRemoveFile={handleRemoveFile}
                />
              </div>
            ) : (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                {isLoadingPages ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', margin: 'auto' }}>
                    <div className="animate-spin" style={{ width: '40px', height: '40px', border: '4px solid var(--color-border)', borderTopColor: 'var(--color-primary)', borderRadius: '50%' }} />
                    <p style={{ color: 'var(--text-muted)' }}>Rendering watermark preview...</p>
                  </div>
                ) : (
                  previewPage && (
                    <div style={{ width: '100%', display: 'flex', justifyContent: 'center', padding: '1.5rem', border: '1px solid var(--color-border)', borderRadius: '16px', background: 'rgba(255,255,255,0.02)', backdropFilter: 'blur(10px)', marginBottom: '1.5rem', maxWidth: '600px' }}>
                      <div style={{ 
                        position: 'relative', 
                        width: `${previewPage.width}px`, 
                        height: `${previewPage.height}px`,
                        boxShadow: '0 8px 25px rgba(0,0,0,0.15)',
                        borderRadius: '8px',
                        overflow: 'hidden',
                        border: '1px solid var(--color-border)'
                      }}>
                        <img src={previewPage.dataUrl} alt="Watermark Preview Page" style={{ width: '100%', height: '100%', display: 'block' }} />
                        
                        {type === 'text' && text.trim() && (
                          <div style={getOverlayOverlayStyleText(getWatermarkOverlayStyle())}>
                            {text}
                          </div>
                        )}

                        {type === 'image' && imagePreviewUrl && (
                          <img 
                            src={imagePreviewUrl} 
                            alt="Watermark Overlay" 
                            style={getWatermarkOverlayStyle() as any} 
                          />
                        )}
                        
                        {type === 'image' && !imagePreviewUrl && (
                          <div style={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            background: 'rgba(238, 108, 77, 0.95)',
                            color: 'white',
                            fontSize: '0.75rem',
                            padding: '4px 10px',
                            borderRadius: '6px'
                          }}>
                            Upload Watermark Image
                          </div>
                        )}
                      </div>
                    </div>
                  )
                )}
                
              </div>
            )
          ) : (
            <div style={{ textAlign: 'center', padding: '2rem', margin: 'auto' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: '#e2f0d9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', color: '#385723' }}>
                <FileCheck size={36} />
              </div>
              <h3 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Watermark Added Successfully!</h3>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Your watermarked PDF is ready to download.</p>
              <div style={{ display: 'flex', gap: '1rem', width: '100%', justifyContent: 'center', marginTop: '1.5rem', flexWrap: 'wrap' }}>
                <button 
                  onClick={handleRemoveFile} 
                  className="btn btn-secondary"
                  style={{ borderRadius: '12px', padding: '0.85rem 1.75rem' }}
                >
                  Watermark Another File
                </button>
                <a 
                  href={downloadUrl} 
                  download={`watermarked_${files[0]?.name || 'document.pdf'}`}
                  className="btn btn-primary" 
                  style={{ textDecoration: 'none', borderRadius: '12px', padding: '0.85rem 2.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  <Download size={18} /> Download Watermarked PDF
                </a>
              </div>
            </div>
          )}

          {isProcessing && (
            <div style={{ width: '100%', maxWidth: '600px' }}>
              <ProgressBar progress={progress} message="Adding watermark overlay to document pages..." />
            </div>
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
              backgroundColor: type === 'text' ? 'var(--color-green)' : 'transparent',
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
              backgroundColor: type === 'image' ? 'var(--color-green)' : 'transparent',
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
            disabled={files.length === 0 || isProcessing || (type === 'image' && imageFiles.length === 0)}
            onClick={handleSubmit}
            style={{ width: '100%', opacity: (files.length === 0 || isProcessing || (type === 'image' && imageFiles.length === 0)) ? 0.6 : 1 }}
          >
            <Stamp size={18} /> Add Watermark
          </button>
        </div>
      </div>
    </div>
  );
};

// Helper for type correctness in style object
const getOverlayOverlayStyleText = (style: React.CSSProperties): React.CSSProperties => style;

export default Watermark;
