import React, { useState } from 'react';
import { Sun, Moon, FileText, Menu, X } from 'lucide-react';

interface HeaderProps {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  onHomeClick: () => void;
}

const Header: React.FC<HeaderProps> = ({ theme, toggleTheme, onHomeClick }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleHomeClick = () => {
    setIsMenuOpen(false);
    onHomeClick();
  };

  return (
    <>
      <header className="header-glass">
        <div className="brand-container" style={{ cursor: 'pointer' }} onClick={handleHomeClick}>
          <div className="brand-logo">
            <FileText size={28} style={{ color: 'var(--color-green)' }} />
            <span>RITES</span>
          </div>
          <span className="brand-tagline">Doc Converter</span>
        </div>

        <nav className="desktop-nav">
          <ul className="nav-links">
            <li className="nav-link" onClick={handleHomeClick}>Home</li>
            <li className="nav-link"><a href="#tools" onClick={handleHomeClick}>All Tools</a></li>
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
          
          <button
            className="menu-toggle-btn"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label="Toggle Menu"
            title="Toggle Menu"
            style={{
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--color-border)',
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              display: 'none',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-primary)',
              cursor: 'pointer'
            }}
          >
            {isMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      {/* Mobile Navigation Dropdown Menu */}
      {isMenuOpen && (
        <div className="mobile-nav-menu" style={{
          position: 'fixed',
          top: '70px',
          left: 0,
          right: 0,
          background: 'var(--glass-bg)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: '1px solid var(--glass-border)',
          boxShadow: 'var(--glass-shadow)',
          zIndex: 999,
          display: 'flex',
          flexDirection: 'column',
          padding: '1.5rem',
          gap: '1rem',
          animation: 'slideDownMenu 0.25s ease-out'
        }}>
          <div 
            onClick={handleHomeClick} 
            style={{ 
              fontWeight: 600, 
              padding: '0.75rem 1rem', 
              borderRadius: '8px', 
              cursor: 'pointer', 
              color: 'var(--text-primary)', 
              background: 'rgba(255,255,255,0.05)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            Home
          </div>
          <a 
            href="#tools" 
            onClick={handleHomeClick} 
            style={{ 
              fontWeight: 600, 
              padding: '0.75rem 1rem', 
              borderRadius: '8px', 
              cursor: 'pointer', 
              color: 'var(--text-primary)', 
              background: 'rgba(255,255,255,0.05)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              textDecoration: 'none'
            }}
          >
            All Tools
          </a>
        </div>
      )}
    </>
  );
};

export default Header;
