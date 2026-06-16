import React from 'react';

const Footer: React.FC = () => {
  return (
    <footer className="footer-glass">
      <div className="container">
        <p>&copy; {new Date().getFullYear()} RITES Document Converter &reg;</p>
      </div>
    </footer>
  );
};

export default Footer;
