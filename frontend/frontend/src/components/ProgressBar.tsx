import React from 'react';

interface ProgressBarProps {
  progress: number;
  message?: string;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ progress, message }) => {
  return (
    <div style={{ width: '100%', margin: '1rem 0' }}>
      {message && (
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          fontSize: '0.875rem', 
          marginBottom: '0.5rem',
          color: 'var(--text-secondary)',
          fontWeight: 500
        }}>
          <span>{message}</span>
          <span>{Math.round(progress)}%</span>
        </div>
      )}
      <div className="progress-bar-container">
        <div 
          className="progress-bar-fill" 
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};

export default ProgressBar;
