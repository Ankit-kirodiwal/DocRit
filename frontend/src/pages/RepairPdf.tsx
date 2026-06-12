import React, { useState } from 'react';
import { ArrowLeft, AlertCircle, Download, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';
import FileUpload from '../components/FileUpload';
import ProgressBar from '../components/ProgressBar';
import api from '../utils/api';

interface RepairPdfProps {
  onBack: () => void;
}

interface RepairReport {
  errors_found: string[];
  errors_repaired: string[];
  remaining_warnings: string[];
}

const RepairPdf: React.FC<RepairPdfProps> = ({ onBack }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [report, setReport] = useState<RepairReport | null>(null);

  const handleFilesSelected = (newFiles: File[]) => {
    if (newFiles.length > 0) {
      setFiles([newFiles[0]]);
      setDownloadUrl(null);
      setReport(null);
    }
  };

  const handleRemoveFile = () => {
    setFiles([]);
    setDownloadUrl(null);
    setReport(null);
  };

  const handleSubmit = async () => {
    if (files.length === 0) return;
    setIsProcessing(true);
    setProgress(15);
    setDownloadUrl(null);
    setReport(null);

    const formData = new FormData();
    formData.append('file', files[0]);

    try {
      setProgress(30);
      const response = await api.post('/repair', formData, {
        onUploadProgress: (progressEvent) => {
          const percent = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1));
          setProgress(30 + percent * 0.5);
        }
      });

      setProgress(85);
      const { repairedBytes, report: resReport } = response.data;
      setReport(resReport);

      const binaryString = window.atob(repairedBytes);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const blob = new Blob([bytes.buffer], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      setDownloadUrl(url);
      setProgress(100);
    } catch (err: any) {
      console.error(err);
      alert('Error repairing PDF: ' + (err.response?.data?.error || err.message));
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
          <h2 style={{ fontSize: '1.75rem', marginBottom: '1.5rem', fontFamily: 'var(--font-display)' }}>Repair PDF Document</h2>

          {!downloadUrl ? (
            <FileUpload
              accept="application/pdf"
              multiple={false}
              onFilesSelected={handleFilesSelected}
              selectedFiles={files}
              onRemoveFile={handleRemoveFile}
            />
          ) : (
            <div style={{ width: '100%', maxWidth: '680px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2rem' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: 'rgba(34, 197, 94, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', color: '#22c55e' }}>
                  <ShieldCheck size={36} />
                </div>
                <h3 style={{ fontSize: '1.65rem', fontWeight: 600, color: 'var(--text-primary)' }}>Repair Complete</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.5rem' }}>
                  A structural integrity audit has finished and corrected structural issues.
                </p>
              </div>

              {/* Diagnostic Audit Log */}
              {report && (
                <div style={{ width: '100%', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--color-border)', borderRadius: '16px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem' }}>
                    Diagnostic Repair Log
                  </h4>

                  {/* Anomalies Detected */}
                  <div>
                    <h5 style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <AlertCircle size={14} style={{ color: '#ef4444' }} /> Anomalies Audited ({report.errors_found.length})
                    </h5>
                    {report.errors_found.length > 0 ? (
                      <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.825rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        {report.errors_found.map((err, idx) => (
                          <li key={idx} style={{ marginBottom: '0.25rem' }}>{err}</li>
                        ))}
                      </ul>
                    ) : (
                      <p style={{ margin: 0, fontSize: '0.825rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        No structural warnings or catalog corruptions were flagged.
                      </p>
                    )}
                  </div>

                  {/* Actions Taken */}
                  <div>
                    <h5 style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <CheckCircle2 size={14} style={{ color: '#22c55e' }} /> Actions Applied ({report.errors_repaired.length})
                    </h5>
                    <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.825rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      {report.errors_repaired.map((rep, idx) => (
                        <li key={idx} style={{ marginBottom: '0.25rem' }}>{rep}</li>
                      ))}
                    </ul>
                  </div>

                  {/* Warnings Remaining */}
                  {report.remaining_warnings.length > 0 && (
                    <div style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.15)', borderRadius: '8px', padding: '0.75rem 1rem' }}>
                      <h5 style={{ margin: '0 0 0.25rem 0', fontSize: '0.85rem', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <AlertTriangle size={14} /> Structural Notes
                      </h5>
                      <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.8rem', color: 'rgba(239, 68, 68, 0.8)', lineHeight: 1.4 }}>
                        {report.remaining_warnings.map((warn, idx) => (
                          <li key={idx}>{warn}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', gap: '1rem', width: '100%', justifyContent: 'center' }}>
                <button 
                  onClick={handleRemoveFile} 
                  className="btn btn-secondary"
                  style={{ borderRadius: '12px', padding: '0.85rem 1.75rem' }}
                >
                  Repair Another File
                </button>
                <a 
                  href={downloadUrl} 
                  download={`repaired_${files[0]?.name || 'document.pdf'}`} 
                  className="btn btn-primary" 
                  style={{ textDecoration: 'none', borderRadius: '12px', padding: '0.85rem 2.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  <Download size={18} /> Download Repaired PDF
                </a>
              </div>
            </div>
          )}

          {isProcessing && (
            <ProgressBar progress={progress} message="Performing multi-stage structural parsing and catalog reconstruction..." />
          )}
        </div>
      </div>

      <div className="tool-options-panel">
        <h3 className="panel-title">Repair Settings</h3>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          Fixes broken cross-references, missing page descriptors, and corrupted header elements of structural PDFs.
        </p>

        <button 
          className="btn btn-primary"
          disabled={files.length === 0 || isProcessing}
          onClick={handleSubmit}
          style={{ width: '100%', marginTop: '1.5rem' }}
        >
          <AlertCircle size={18} /> Repair PDF
        </button>
      </div>
    </div>
  );
};

export default RepairPdf;
