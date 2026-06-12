import React, { useState } from 'react';
import { ArrowLeft, FileCode, Download, FileCheck } from 'lucide-react';
import ProgressBar from '../components/ProgressBar';
import api from '../utils/api';

interface HtmlToPdfProps {
  onBack: () => void;
}

const HtmlToPdf: React.FC<HtmlToPdfProps> = ({ onBack }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  // HTML Source Settings
  const [mode, setMode] = useState<'html' | 'url'>('html');
  const [html, setHtml] = useState('<h1>Hello World</h1>\n<p>This is a RITES document export.</p>');
  const [urlInput, setUrlInput] = useState('https://example.com');

  const handleSubmit = async () => {
    setIsProcessing(true);
    setProgress(20);
    setDownloadUrl(null);

    const payload = mode === 'html' ? { html } : { url: urlInput };

    try {
      setProgress(50);
      const response = await api.post('/html-to-pdf', payload, {
        responseType: 'blob',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      setProgress(85);
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      setDownloadUrl(url);
      setProgress(100);
    } catch (err: any) {
      console.error(err);
      alert('Error converting HTML to PDF: ' + err.message);
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
          <h2 style={{ fontSize: '1.75rem', marginBottom: '1.5rem', fontFamily: 'var(--font-display)' }}>HTML to PDF</h2>

          {!downloadUrl ? (
            <div style={{ width: '100%', maxWidth: '600px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                <button 
                  onClick={() => setMode('html')}
                  className={`btn ${mode === 'html' ? 'btn-primary' : ''}`}
                  style={{ background: mode !== 'html' ? 'rgba(255,255,255,0.1)' : undefined }}
                >
                  Paste HTML Code
                </button>
                <button 
                  onClick={() => setMode('url')}
                  className={`btn ${mode === 'url' ? 'btn-primary' : ''}`}
                  style={{ background: mode !== 'url' ? 'rgba(255,255,255,0.1)' : undefined }}
                >
                  Enter Web URL
                </button>
              </div>

              {mode === 'html' ? (
                <div style={{ width: '100%' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Write or Paste HTML:</label>
                  <textarea
                    rows={8}
                    value={html}
                    onChange={(e) => setHtml(e.target.value)}
                    style={{ width: '100%', padding: '1rem', background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid var(--border-color)', borderRadius: '8px', fontFamily: 'monospace' }}
                  />
                </div>
              ) : (
                <div style={{ width: '100%' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Webpage URL:</label>
                  <input
                    type="text"
                    className="form-control"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    style={{ width: '100%', padding: '1rem', background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid var(--border-color)', borderRadius: '8px' }}
                  />
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: '#e2f0d9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', color: '#385723' }}>
                <FileCheck size={36} />
              </div>
              <h3 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>HTML Rendered successfully!</h3>
              <div style={{ display: 'flex', gap: '1rem', width: '100%', justifyContent: 'center', marginTop: '1.5rem', flexWrap: 'wrap' }}>
                <button 
                  onClick={() => setDownloadUrl(null)} 
                  className="btn btn-secondary"
                  style={{ borderRadius: '12px', padding: '0.85rem 1.75rem' }}
                >
                  Convert Another HTML Page
                </button>
                <a 
                  href={downloadUrl} 
                  download="html_webpage.pdf"
                  className="btn btn-primary" 
                  style={{ textDecoration: 'none', borderRadius: '12px', padding: '0.85rem 2.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  <Download size={18} /> Download Webpage PDF
                </a>
              </div>
              
            </div>
          )}

          {isProcessing && (
            <ProgressBar progress={progress} message="Generating PDF document from HTML..." />
          )}
        </div>
      </div>

      <div className="tool-options-panel">
        <h3 className="panel-title">Conversion Info</h3>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
          Converts custom HTML markups or grabs text content directly from a webpage URL to format into standard PDF pages.
        </p>

        <button 
          className="btn btn-primary"
          disabled={isProcessing}
          onClick={handleSubmit}
          style={{ width: '100%' }}
        >
          <FileCode size={18} /> Convert to PDF
        </button>
      </div>
    </div>
  );
};

export default HtmlToPdf;
