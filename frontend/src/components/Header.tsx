import React from 'react';
import { Sun, Moon, FileText } from 'lucide-react';

interface HeaderProps {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  onHomeClick: () => void;
}

const Header: React.FC<HeaderProps> = ({ theme, toggleTheme, onHomeClick }) => {
  return (
    <header className="header-glass">
      <div className="brand-container" style={{ cursor: 'pointer' }} onClick={onHomeClick}>
        <div className="brand-logo">
          <FileText size={28} style={{ color: 'var(--color-coral)' }} />
          <span>RITES</span>
        </div>
        <span className="brand-tagline">Doc Converter</span>
      </div>

      <nav>
        <ul className="nav-links">
          <li className="nav-link" onClick={onHomeClick}>Home</li>
          <li className="nav-link"><a href="#tools" onClick={onHomeClick}>All Tools</a></li>
        </ul>
      </nav>

      <div className="action-buttons">
        <button 
          className="theme-toggle-btn" 
          onClick={toggleTheme}
          aria-label="Toggle theme"
          title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
        </button>
      </div>
    </header>
  );
};

export default Header;
