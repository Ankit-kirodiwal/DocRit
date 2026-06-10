import React, { useState } from 'react';
import { ArrowLeft, ImageIcon, Download, FileCheck } from 'lucide-react';
import FileUpload from '../components/FileUpload';
import ProgressBar from '../components/ProgressBar';
import * as pdfjsLib from 'pdfjs-dist';
import JSZip from 'jszip';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

interface PdfToJpgProps {
  onBack: () => void;
}

const PdfToJpg: React.FC<PdfToJpgProps> = ({ onBack }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [totalPagesRendered, setTotalPagesRendered] = useState(0);

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
    setProgress(5);
    setDownloadUrl(null);

    const file = files[0];
    const fileReader = new FileReader();

    fileReader.onload = async function () {
      try {
        const typedarray = new Uint8Array(this.result as ArrayBuffer);
        
        // Load PDF Document
        const loadingTask = pdfjsLib.getDocument({ data: typedarray });
        const pdf = await loadingTask.promise;
        const totalPages = pdf.numPages;
        setTotalPagesRendered(totalPages);

        const zip = new JSZip();

        // Render each page to canvas
        for (let i = 1; i <= totalPages; i++) {
          const page = await pdf.getPage(i);
          const scale = 2.0; // 2x scale for high-quality images
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          
          const context = canvas.getContext('2d');
          if (context) {
            await page.render({
              canvasContext: context,
              viewport: viewport
            }).promise;

            // Extract image as jpeg dataURL
            const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
            const base64Data = dataUrl.split(',')[1];
            zip.file(`page_${i}.jpg`, base64Data, { base64: true });
          }

          // Update progress dynamically
          setProgress(Math.round(5 + (i / totalPages) * 80));
        }

        setProgress(90);
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const zipUrl = URL.createObjectURL(zipBlob);
        setDownloadUrl(zipUrl);
        setProgress(100);
      } catch (err: any) {
        console.error(err);
        alert('Error rendering PDF: ' + err.message);
        setProgress(0);
      } finally {
        setIsProcessing(false);
      }
    };

    fileReader.onerror = () => {
      alert('Failed to read the file.');
      setIsProcessing(false);
    };

    fileReader.readAsArrayBuffer(file);
  };

  return (
    <div className="tool-page-container">
      <div className="tool-workspace">
        <button className="file-remove-btn" style={{ top: '1.5rem', left: '1.5rem', width: 'auto', height: 'auto', borderRadius: '8px', padding: '0.4rem 0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }} onClick={onBack}>
          <ArrowLeft size={16} /> Back to Tools
        </button>

        <div style={{ width: '100%', marginTop: '3rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.75rem', marginBottom: '1.5rem', fontFamily: 'var(--font-display)' }}>PDF to JPG Images</h2>
          
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
              <h3 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>PDF Rendered to Images!</h3>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
                Extracted {totalPagesRendered} page{totalPagesRendered > 1 ? 's' : ''} into a ZIP folder.
              </p>
              <a 
                href={downloadUrl} 
                download={`images_${files[0]?.name.replace('.pdf', '') || 'document'}.zip`}
                className="btn btn-primary"
                style={{ textDecoration: 'none' }}
              >
                <Download size={18} /> Download Images ZIP
              </a>
            </div>
          )}

          {isProcessing && (
            <ProgressBar progress={progress} message="Rendering pages to high-quality JPGs client-side..." />
          )}
        </div>
      </div>

      <div className="tool-options-panel">
        <h3 className="panel-title">Conversion Info</h3>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          This tool runs entirely in your browser. It extracts pages from the PDF document and renders them into high-quality JPEG images, packed inside a ZIP file.
        </p>

        <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <button 
            className="btn btn-primary"
            disabled={files.length === 0 || isProcessing}
            onClick={handleSubmit}
            style={{ width: '100%', opacity: (files.length === 0 || isProcessing) ? 0.6 : 1 }}
          >
            <ImageIcon size={18} /> Convert PDF to JPG
          </button>
        </div>
      </div>
    </div>
  );
};

export default PdfToJpg;
