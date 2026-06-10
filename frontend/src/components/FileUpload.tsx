import React, { useRef, useState } from 'react';
import { UploadCloud, File, X, Image as ImageIcon } from 'lucide-react';

interface FileUploadProps {
  accept: string; // e.g. "application/pdf" or "image/*"
  multiple?: boolean;
  onFilesSelected: (files: File[]) => void;
  selectedFiles: File[];
  onRemoveFile: (index: number) => void;
}

const FileUpload: React.FC<FileUploadProps> = ({
  accept,
  multiple = false,
  onFilesSelected,
  selectedFiles,
  onRemoveFile
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const processFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    const filesArray = Array.from(fileList);
    
    // Filter files based on accept criteria
    const filteredFiles = filesArray.filter(file => {
      if (accept === 'application/pdf') {
        return file.type === 'application/pdf' || file.name.endsWith('.pdf');
      }
      if (accept.includes('image/')) {
        return file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif)$/i.test(file.name);
      }
      return true;
    });

    if (multiple) {
      onFilesSelected(filteredFiles);
    } else if (filteredFiles.length > 0) {
      onFilesSelected([filteredFiles[0]]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    processFiles(e.dataTransfer.files);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    processFiles(e.target.files);
  };

  const onButtonClick = () => {
    fileInputRef.current?.click();
  };

  // Utility to format file size
  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const isImageAccept = accept.includes('image');

  return (
    <div style={{ width: '100%' }}>
      <div 
        className={`upload-dropzone ${isDragActive ? 'drag-active' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={onButtonClick}
        style={{
          borderStyle: isDragActive ? 'solid' : 'dashed',
          borderColor: isDragActive ? 'var(--color-coral)' : 'var(--color-border)',
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          style={{ display: 'none' }}
          accept={accept}
          multiple={multiple}
          onChange={handleChange}
        />
        
        <div className="upload-icon">
          {isImageAccept ? <ImageIcon size={48} /> : <UploadCloud size={48} />}
        </div>
        
        <h3 className="upload-title">
          Drag & Drop {isImageAccept ? 'images' : 'PDF files'} here
        </h3>
        <p className="upload-subtitle">
          or click to browse from your computer
        </p>
      </div>

      {selectedFiles.length > 0 && (
        <div className="file-list">
          {selectedFiles.map((file, idx) => (
            <div key={idx} className="file-preview-card">
              <button 
                type="button" 
                className="file-remove-btn" 
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveFile(idx);
                }}
                title="Remove file"
              >
                <X size={12} />
              </button>
              
              <div className="file-icon">
                {file.type.startsWith('image/') ? <ImageIcon size={32} /> : <File size={32} />}
              </div>
              
              <span className="file-name" title={file.name}>
                {file.name}
              </span>
              
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                {formatBytes(file.size)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FileUpload;
