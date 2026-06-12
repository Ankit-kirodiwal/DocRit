import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import Footer from './components/Footer';
import Home from './pages/Home';
import Merge from './pages/Merge';
import Split from './pages/Split';
import Compress from './pages/Compress';
import Rotate from './pages/Rotate';
import Protect from './pages/Protect';
import Unlock from './pages/Unlock';
import PageNumbers from './pages/PageNumbers';
import Watermark from './pages/Watermark';
import JpgToPdf from './pages/JpgToPdf';
import PdfToJpg from './pages/PdfToJpg';
import OrganizePdf from './pages/OrganizePdf';
import RemovePages from './pages/RemovePages';
import ExtractPages from './pages/ExtractPages';
import SignPdf from './pages/SignPdf';
import EditPdf from './pages/EditPdf';
import CropPdf from './pages/CropPdf';
import RedactPdf from './pages/RedactPdf';
import HtmlToPdf from './pages/HtmlToPdf';
import RepairPdf from './pages/RepairPdf';
import ComparePdf from './pages/ComparePdf';
import PdfToPdfa from './pages/PdfToPdfa';
import WordToPdf from './pages/WordToPdf';
import PowerpointToPdf from './pages/PowerpointToPdf';
import ExcelToPdf from './pages/ExcelToPdf';
import PdfToWord from './pages/PdfToWord';
import PdfToPowerpoint from './pages/PdfToPowerpoint';
import PdfToExcel from './pages/PdfToExcel';
import Ocr from './pages/Ocr';

const App: React.FC = () => {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [activeTool, setActiveTool] = useState<string | null>(null);

  // Initialize theme from system preference or localStorage
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.setAttribute('data-theme', savedTheme);
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const initialTheme = prefersDark ? 'dark' : 'light';
      setTheme(initialTheme);
      document.documentElement.setAttribute('data-theme', initialTheme);
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  const renderActivePage = () => {
    switch (activeTool) {
      case 'merge':
        return <Merge onBack={() => setActiveTool(null)} />;
      case 'split':
        return <Split onBack={() => setActiveTool(null)} />;
      case 'compress':
        return <Compress onBack={() => setActiveTool(null)} />;
      case 'rotate':
        return <Rotate onBack={() => setActiveTool(null)} />;
      case 'protect':
        return <Protect onBack={() => setActiveTool(null)} />;
      case 'unlock':
        return <Unlock onBack={() => setActiveTool(null)} />;
      case 'page_numbers':
        return <PageNumbers onBack={() => setActiveTool(null)} />;
      case 'watermark':
        return <Watermark onBack={() => setActiveTool(null)} />;
      case 'jpg_to_pdf':
        return <JpgToPdf onBack={() => setActiveTool(null)} />;
      case 'pdf_to_jpg':
        return <PdfToJpg onBack={() => setActiveTool(null)} />;
      case 'organize':
        return <OrganizePdf onBack={() => setActiveTool(null)} />;
      case 'remove_pages':
        return <RemovePages onBack={() => setActiveTool(null)} />;
      case 'extract_pages':
        return <ExtractPages onBack={() => setActiveTool(null)} />;
      case 'sign_pdf':
        return <SignPdf onBack={() => setActiveTool(null)} />;
      case 'edit_pdf':
        return <EditPdf mode="edit" onBack={() => setActiveTool(null)} />;
      case 'pdf_forms':
        return <EditPdf mode="forms" onBack={() => setActiveTool(null)} />;
      case 'crop_pdf':
        return <CropPdf onBack={() => setActiveTool(null)} />;
      case 'redact_pdf':
        return <RedactPdf onBack={() => setActiveTool(null)} />;
      case 'html_to_pdf':
        return <HtmlToPdf onBack={() => setActiveTool(null)} />;
      case 'repair':
        return <RepairPdf onBack={() => setActiveTool(null)} />;
      case 'compare_pdf':
        return <ComparePdf onBack={() => setActiveTool(null)} />;
      case 'pdf_to_pdfa':
        return <PdfToPdfa onBack={() => setActiveTool(null)} />;
      case 'word_to_pdf':
        return <WordToPdf onBack={() => setActiveTool(null)} />;
      case 'powerpoint_to_pdf':
        return <PowerpointToPdf onBack={() => setActiveTool(null)} />;
      case 'excel_to_pdf':
        return <ExcelToPdf onBack={() => setActiveTool(null)} />;
      case 'pdf_to_word':
        return <PdfToWord onBack={() => setActiveTool(null)} />;
      case 'pdf_to_powerpoint':
        return <PdfToPowerpoint onBack={() => setActiveTool(null)} />;
      case 'pdf_to_excel':
        return <PdfToExcel onBack={() => setActiveTool(null)} />;
      case 'ocr':
        return <Ocr onBack={() => setActiveTool(null)} />;
      default:
        return <Home onSelectTool={(toolId) => setActiveTool(toolId)} />;
    }
  };

  return (
    <div className="app-container">
      <Header 
        theme={theme} 
        toggleTheme={toggleTheme} 
        onHomeClick={() => setActiveTool(null)} 
      />
      <main className="main-content">
        {renderActivePage()}
      </main>
      <Footer />
    </div>
  );
};

export default App;
