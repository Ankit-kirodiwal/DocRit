import React from 'react';

const Footer: React.FC = () => {
  return (
    <footer className="footer-glass">
      <div className="container">
        <p>&copy; {new Date().getFullYear()} RITES Document Converter &reg; - Your fully functional PDF Editor. Inspired by iLovePDF.</p>
      </div>
    </footer>
  );
};

export default Footer;
